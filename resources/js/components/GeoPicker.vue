<template>
    <div ref="mapEl" class="geo-picker" :style="{ height: height + 'px' }"></div>
</template>

<script setup>
import L from 'leaflet'
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
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

const mapEl = ref(null)
let map = null
let pathLayer = null   // L.geoJSON for LineString/Polygon shapes
let vertexGroup = null // L.layerGroup of draggable vertex markers
let workingGeo = null  // draggable clone of the current geometry
let markerPlaced = false
// Leaflet fires a map click after a marker drag ends; ignore clicks right after.
let suppressClickUntil = 0

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
    border-radius: 4px;
    z-index: 1;
}
</style>
