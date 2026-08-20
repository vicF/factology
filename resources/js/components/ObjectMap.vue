<template>
    <div class="object-map-wrap">
        <div ref="mapEl" class="object-map"></div>
        <div v-if="!hasFeatures" class="map-empty-hint">
            <i class="bi bi-geo-alt me-1"></i>
            {{ t('No coordinates for this object or its related objects') }}
        </div>
    </div>
</template>

<script setup>
import L from 'leaflet'
import axios from 'axios'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { objectName } from '../utils/localized.js'
import { buildMapFeatures } from '../utils/geo.js'
import { createBaseMap, createPinIcon, DEFAULT_CENTER, DEFAULT_ZOOM } from '../utils/leaflet.js'

const props = defineProps({
    object: {
        type: Object,
        required: true
    }
})

const router = useRouter()
const { t } = useI18n()

const mapEl = ref(null)
const features = ref([])
const hasFeatures = computed(() => features.value.length > 0)

let map = null
let layerGroup = null

const rootIcon = createPinIcon('geo-pin geo-pin-root')
const relatedIcon = createPinIcon('geo-pin geo-pin-related')

const escapeHtml = (text) =>
    String(text ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]))

const ensureMap = () => {
    if (map) return
    map = createBaseMap(mapEl.value)
    layerGroup = L.layerGroup().addTo(map)
}

const renderFeatures = () => {
    if (!map || features.value.length === 0) return
    layerGroup.clearLayers()
    const bounds = L.latLngBounds([])
    for (const f of features.value) {
        const geoLayer = L.geoJSON(f.geometry, {
            pointToLayer: (geoJsonPoint, latlng) => {
                const marker = L.marker(latlng, { icon: f.isRoot ? rootIcon : relatedIcon })
                // Permanent label with the object's name next to the pin.
                marker.bindTooltip(escapeHtml(objectName(f) || t('Unnamed')), {
                    permanent: true,
                    direction: 'top',
                    offset: [0, -8],
                    className: 'object-map-tooltip',
                })
                return marker
            },
            style: () => ({
                color: f.isRoot ? '#1e3b8a' : '#1e7e34',
                weight: 3,
                fillColor: f.isRoot ? '#4a6bff' : '#28a745',
                fillOpacity: 0.25,
            }),
            onEachFeature: (feature, layer) => {
                layer.bindPopup(`<b>${escapeHtml(objectName(f) || t('Unnamed'))}</b>`)
                layer.on('click', () => {
                    if (!f.isRoot) router.push({ name: 'object', params: { uid: f.thing_id } })
                })
            },
        })
        layerGroup.addLayer(geoLayer)
        bounds.extend(geoLayer.getBounds())
    }
    map.invalidateSize()
    map.fitBounds(bounds, { padding: [20, 20] })
}

const showMap = async () => {
    if (!props.object) return
    const uid = props.object.thing_id
    // Always show the map (world view when there is nothing to pin).
    await nextTick()
    ensureMap()
    try {
        const { data } = await axios.get(`/object/${uid}?depth=2`)
        features.value = buildMapFeatures(data?.data ?? null)
        if (features.value.length) {
            renderFeatures()
        } else {
            map.setView(DEFAULT_CENTER, DEFAULT_ZOOM)
        }
    } catch (error) {
        console.error('ObjectMap.vue - failed to load map data:', error)
        features.value = []
        map.setView(DEFAULT_CENTER, DEFAULT_ZOOM)
    }
}

defineExpose({
    updateData: showMap,
    refreshView: () => {
        if (!map) return
        setTimeout(() => {
            map.invalidateSize()
            if (features.value.length) renderFeatures()
            else map.setView(DEFAULT_CENTER, DEFAULT_ZOOM)
        }, 200)
    }
})

// The parent (Object.vue) drives updates via updateData; mounted only loads the
// initial object. No internal props watch — that would double-fetch with the
// parent's deep object watcher.

onMounted(async () => {
    if (props.object) {
        await showMap()
    }
})

onBeforeUnmount(() => {
    if (map) {
        map.remove()
        map = null
    }
})
</script>

<style scoped>
.object-map-wrap {
    position: relative;
    height: calc(100vh - 95px);
}

.object-map {
    height: 100%;
    border-radius: 4px;
    z-index: 1;
}

.map-empty-hint {
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1000;
    background: rgba(255, 255, 255, 0.92);
    border: 1px solid #dee2e6;
    border-radius: 4px;
    padding: 4px 12px;
    font-size: 0.85rem;
    color: #6c757d;
    white-space: nowrap;
}
</style>
