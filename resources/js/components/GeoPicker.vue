<template>
    <div class="geo-picker" :style="{ height: height + 'px' }">
        <div ref="mapEl" class="geo-picker-map"></div>
        <div class="geo-search">
            <div class="geo-search-row">
                <select v-model="provider" class="geo-search-provider">
                    <option value="nominatim">OpenStreetMap</option>
                    <option value="yandex">Yandex</option>
                </select>
                <input
                    v-model="query"
                    type="text"
                    class="geo-search-input"
                    :placeholder="t('Search address')"
                    @keydown.enter.prevent="search"
                />
                <button
                    type="button"
                    class="geo-search-btn"
                    :disabled="searching || !query.trim()"
                    :title="t('Search')"
                    @click.stop="search"
                >
                    <i class="bi bi-search"></i>
                </button>
            </div>
            <ul v-if="results.length" class="geo-search-results">
                <li v-for="(r, i) in results" :key="i" @click.stop="pick(r)">{{ r.name }}</li>
            </ul>
            <div v-if="error" class="geo-search-error">{{ error }}</div>
        </div>
        <button
            v-if="geolocationSupported"
            type="button"
            class="geo-locate-btn"
            :title="t('Find my location')"
            @click.stop="locate"
        >
            <i class="bi bi-crosshair"></i>
        </button>
    </div>
</template>

<script setup>
import axios from 'axios'
import L from 'leaflet'
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { isGeoJsonGeometry } from '../utils/geo.js'
import { createBaseMap, createPinIcon } from '../utils/leaflet.js'

const props = defineProps({
    // A GeoJSON geometry (Point/LineString/Polygon/...) or null when unset.
    modelValue: { type: Object, default: null },
    // When true (default), map clicks are reported to the parent via `clicked`
    // ({ lat, lng }) — the parent decides how to build the geometry.
    clickable: { type: Boolean, default: true },
    // When true (default), supported geometries get draggable vertices so the
    // user can correct them (Point/MultiPoint/LineString/Polygon).
    editable: { type: Boolean, default: true },
    height: { type: Number, default: 260 },
})

const emit = defineEmits(['clicked', 'update:modelValue'])
const { t } = useI18n()

const mapEl = ref(null)
let map = null
let pathLayer = null   // L.geoJSON for LineString/Polygon shapes
let vertexGroup = null // L.layerGroup of draggable vertex markers
let workingGeo = null  // draggable clone of the current geometry
let markerPlaced = false
// Leaflet fires a map click after a marker drag ends; ignore clicks right after.
let suppressClickUntil = 0

// Geolocation is only available in secure contexts (HTTPS / localhost); the
// button stays hidden otherwise.
const geolocationSupported = typeof navigator !== 'undefined' && 'geolocation' in navigator

// ── Address search (forward geocoding via GET /api/v1/geocode) ──────────────
const query = ref('')
const provider = ref('nominatim')
const results = ref([])
const searching = ref(false)
const error = ref('')

const search = async () => {
    const q = query.value.trim()
    if (!q || searching.value) return
    searching.value = true
    error.value = ''
    results.value = []
    try {
        const res = await axios.get('/geocode', { params: { q, provider: provider.value } })
        results.value = Array.isArray(res.data?.data) ? res.data.data : []
    } catch (err) {
        if (err.response?.status === 501) {
            // Yandex has no configured key — fall back to the free provider.
            provider.value = 'nominatim'
            error.value = t('Geocoder API key is not configured')
        } else {
            error.value = t('Geocoding failed')
        }
    } finally {
        searching.value = false
    }
}

// Center the map on the chosen address and place/report the point through the
// same `clicked` flow the parent uses for a map click.
const pick = (r) => {
    if (!map) return
    map.setView([r.lat, r.lng], Math.max(map.getZoom(), 16))
    emit('clicked', { lat: r.lat, lng: r.lng })
    query.value = r.name
    results.value = []
    error.value = ''
}

// Center the map on the user's position (approximate, browser-reported). When
// editing a still-empty Point, the coordinate is placed there right away.
const locate = () => {
    if (!map || !geolocationSupported) return
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const { latitude, longitude } = pos.coords
            map.setView([latitude, longitude], Math.max(map.getZoom(), 15))
            const geo = props.modelValue
            const blankPoint = geo && geo.type === 'Point'
                && (!Array.isArray(geo.coordinates) || geo.coordinates[0] == null || geo.coordinates[1] == null)
            if (blankPoint) emit('clicked', { lat: latitude, lng: longitude })
        },
        (err) => {
            console.error('GeoPicker locate failed:', err)
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    )
}

const pinIcon = createPinIcon('geo-pin geo-pin-related')
const vertexIcon = L.divIcon({
    className: 'geo-marker geo-vertex',
    html: '<div class="geo-vertex-dot"></div>',
    iconSize: [12, 12],
    iconAnchor: [6, 6],
})

const EDITABLE_TYPES = ['Point', 'MultiPoint', 'LineString', 'Polygon'];

const pathStyle = () => ({
    color: '#1e3b8a',
    weight: 3,
    fillColor: '#4a6bff',
    fillOpacity: 0.25,
})

// Build draggable vertex slots for a geometry. Each slot mutates `geo`'s
// coordinates in place (preserving any extra elements like height) and reports
// its current Leaflet position.
const buildSlots = (geo) => {
    const slots = []
    if (!geo) return slots
    if (geo.type === 'Point') {
        slots.push({
            getLatLng: () => L.latLng(geo.coordinates[1], geo.coordinates[0]),
            apply: (lat, lng) => {
                geo.coordinates[0] = lng
                geo.coordinates[1] = lat
            },
        })
    } else if (geo.type === 'MultiPoint' || geo.type === 'LineString') {
        geo.coordinates.forEach((pos, i) => {
            slots.push({
                getLatLng: () => L.latLng(pos[1], pos[0]),
                apply: (lat, lng) => {
                    pos[0] = lng
                    pos[1] = lat
                },
            })
        })
    } else if (geo.type === 'Polygon') {
        const ring = geo.coordinates[0] || []
        const n = ring.length
        const isClosed = n >= 2
            && ring[0] && ring[n - 1]
            && ring[0][0] === ring[n - 1][0] && ring[0][1] === ring[n - 1][1]
        const count = isClosed ? n - 1 : n
        for (let i = 0; i < count; i++) {
            const pos = ring[i]
            slots.push({
                getLatLng: () => L.latLng(pos[1], pos[0]),
                apply: (lat, lng) => {
                    pos[0] = lng
                    pos[1] = lat
                    if (isClosed && i === 0) {
                        ring[n - 1][0] = lng
                        ring[n - 1][1] = lat
                    }
                },
            })
        }
    }
    return slots
}

const rerenderPath = () => {
    if (!pathLayer) return
    if (workingGeo && (workingGeo.type === 'LineString' || workingGeo.type === 'Polygon')) {
        pathLayer.remove()
        pathLayer = L.geoJSON(workingGeo, { style: pathStyle }).addTo(map)
    }
}

const clearLayers = () => {
    if (pathLayer) { pathLayer.remove(); pathLayer = null }
    if (vertexGroup) { vertexGroup.remove(); vertexGroup = null }
}

// Emit the corrected geometry back to the parent.
const commit = () => {
    if (workingGeo) emit('update:modelValue', JSON.parse(JSON.stringify(workingGeo)))
}

const syncGeometry = () => {
    clearLayers()
    const geometry = props.modelValue && isGeoJsonGeometry(props.modelValue) ? props.modelValue : null
    if (!geometry) {
        markerPlaced = false
        workingGeo = null
        return
    }
    workingGeo = JSON.parse(JSON.stringify(geometry))
    const firstShow = !markerPlaced
    markerPlaced = true

    if (props.editable && EDITABLE_TYPES.includes(workingGeo.type)) {
        // Shape path (LineString/Polygon) that follows the vertices.
        if (workingGeo.type === 'LineString' || workingGeo.type === 'Polygon') {
            pathLayer = L.geoJSON(workingGeo, { style: pathStyle }).addTo(map)
        }
        vertexGroup = L.layerGroup()
        for (const slot of buildSlots(workingGeo)) {
            const marker = L.marker(slot.getLatLng(), {
                draggable: true,
                icon: workingGeo.type === 'Point' || workingGeo.type === 'MultiPoint' ? pinIcon : vertexIcon,
            })
            marker.on('dragstart', () => { suppressClickUntil = Date.now() + 300 })
            marker.on('drag', () => {
                slot.apply(marker.getLatLng().lat, marker.getLatLng().lng)
                rerenderPath()
            })
            marker.on('dragend', commit)
            vertexGroup.addLayer(marker)
        }
        vertexGroup.addTo(map)
    } else {
        // Read-only rendering (multi-shapes, or editing disabled).
        pathLayer = L.geoJSON(geometry, {
            pointToLayer: (geoJsonPoint, latlng) => L.marker(latlng, { icon: pinIcon }),
            style: pathStyle,
        }).addTo(map)
    }

    // Only frame the geometry the first time it appears; vertex drags and
    // click-built additions shouldn't re-zoom the map under the cursor.
    if (firstShow) {
        const bounds = (pathLayer || vertexGroup).getBounds()
        if (workingGeo.type === 'Point') {
            map.setView(bounds.getCenter(), Math.max(map.getZoom(), 14))
        } else {
            map.fitBounds(bounds, { padding: [20, 20] })
        }
    }
}

const initMap = () => {
    if (map) return
    map = createBaseMap(mapEl.value)
    map.on('click', (e) => {
        if (Date.now() < suppressClickUntil) return
        if (!props.clickable) return
        emit('clicked', { lat: e.latlng.lat, lng: e.latlng.lng })
        map.setView(e.latlng, Math.max(map.getZoom(), 14))
    })
    syncGeometry()
}

// Called by the parent when the enclosing modal becomes visible so Leaflet
// measures the container at its real size (it mounts while the modal is hidden).
const invalidate = () => {
    if (map) map.invalidateSize()
}

watch(() => props.modelValue, () => syncGeometry(), { deep: true })

onMounted(() => {
    initMap()
    requestAnimationFrame(() => invalidate())
})

onBeforeUnmount(() => {
    if (map) {
        map.remove()
        map = null
    }
})

defineExpose({ invalidate })
</script>

<style scoped>
.geo-picker {
    position: relative;
    border-radius: 4px;
    z-index: 1;
}

.geo-picker-map {
    width: 100%;
    height: 100%;
    border-radius: 4px;
}

.geo-search {
    position: absolute;
    top: 10px;
    left: 10px;
    z-index: 1001;
    width: 250px;
    max-width: calc(100% - 60px);
}

.geo-search-row {
    display: flex;
    align-items: center;
    gap: 4px;
    background: #ffffff;
    border: 1px solid #ced4da;
    border-radius: 4px;
    padding: 2px 4px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.geo-search-provider {
    border: none;
    background: transparent;
    font-size: 0.72rem;
    color: #495057;
    max-width: 92px;
}

.geo-search-input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    font-size: 0.8rem;
}

.geo-search-btn {
    border: none;
    background: transparent;
    color: #495057;
    padding: 2px 6px;
}

.geo-search-btn:disabled {
    color: #adb5bd;
}

.geo-search-results {
    list-style: none;
    margin: 4px 0 0;
    padding: 0;
    background: #ffffff;
    border: 1px solid #ced4da;
    border-radius: 4px;
    max-height: 150px;
    overflow: auto;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.geo-search-results li {
    padding: 4px 8px;
    font-size: 0.75rem;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.geo-search-results li:hover {
    background: #f1f3f5;
}

.geo-search-error {
    margin: 4px 0 0;
    padding: 4px 8px;
    background: #ffffff;
    color: #c0392b;
    border: 1px solid #f1c1bf;
    border-radius: 4px;
    font-size: 0.75rem;
}

.geo-locate-btn {
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 1001;
    width: 30px;
    height: 30px;
    border-radius: 4px;
    border: 1px solid #ced4da;
    background: #ffffff;
    color: #495057;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.geo-locate-btn:hover {
    background: #f8f9fa;
}
</style>
