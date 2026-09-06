<template>
    <div v-if="hasFeatures" class="object-map-preview">
        <div ref="mapEl" class="object-map-preview-el"></div>
    </div>
</template>

<script setup>
import L from 'leaflet'
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { buildMapFeatures } from '../utils/geo.js'
import { TILE_PROVIDERS, currentProviderId, createPinIcon } from '../utils/leaflet.js'

// Small, mostly-static map preview for the Details tab. Non-interactive except
// for the zoom control: no dragging, scroll-wheel, dblclick or keyboard panning.
// Shows the object's own coordinates (plus any related objects' coordinates).

const props = defineProps({
    object: { type: Object, default: null },
})

const mapEl = ref(null)
let map = null
let layerGroup = null

const hasFeatures = computed(() => buildMapFeatures(props.object).length > 0)

const rootIcon = createPinIcon('geo-pin geo-pin-root')
const relatedIcon = createPinIcon('geo-pin geo-pin-related')

const pathStyle = (f) => ({
    color: f.isRoot ? '#1e3b8a' : '#1e7e34',
    weight: 3,
    fillColor: f.isRoot ? '#4a6bff' : '#28a745',
    fillOpacity: 0.25,
})

const renderFeatures = () => {
    if (!map) return
    const features = buildMapFeatures(props.object)
    if (layerGroup) {
        layerGroup.remove()
        layerGroup = null
    }
    if (!features.length) return
    layerGroup = L.featureGroup()
    for (const f of features) {
        const layer = L.geoJSON(f.geometry, {
            pointToLayer: (geoJsonPoint, latlng) =>
                L.marker(latlng, { icon: f.isRoot ? rootIcon : relatedIcon }),
            style: () => pathStyle(f),
        })
        layer.addTo(layerGroup)
    }
    layerGroup.addTo(map)

    const bounds = layerGroup.getBounds()
    if (features.length === 1 && features[0].geometry.type === 'Point') {
        map.setView(bounds.getCenter(), 15)
    } else {
        map.fitBounds(bounds, { padding: [10, 10] })
    }
}

const initMap = () => {
    if (map || !mapEl.value) return
    const provider = TILE_PROVIDERS[currentProviderId()] || TILE_PROVIDERS.osm
    map = L.map(mapEl.value, {
        zoomControl: true,
        dragging: false,
        scrollWheelZoom: false,
        touchZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
    })
    map.attributionControl?.setPrefix(false)
    L.tileLayer(provider.url, {
        maxZoom: provider.maxZoom,
        attribution: provider.attribution,
        subdomains: provider.subdomains,
    }).addTo(map)
    renderFeatures()
}

// The map must be created only after the template ref is bound (setup-time
// `mapEl` is still null), so init from onMounted and from the watch — never
// via an `immediate` watch.
onMounted(() => {
    if (hasFeatures.value) initMap()
    // Handles the case where the Details tab was hidden when this mounted
    // (persisted active tab) — the map started at 0 size.
    requestAnimationFrame(() => invalidate())
})

watch(hasFeatures, (v) => {
    if (v) initMap()
})

// Re-render (and re-fit) when the object payload is reloaded with new geometry.
watch(() => props.object, () => {
    if (map) renderFeatures()
}, { deep: true })

// Called by the parent when the Details tab becomes visible again, so Leaflet
// re-measures the container (it keeps a stale size while display:none).
const invalidate = () => {
    if (map) map.invalidateSize()
}

onBeforeUnmount(() => {
    if (map) {
        map.remove()
        map = null
    }
})

defineExpose({ invalidate })
</script>

<style scoped>
.object-map-preview {
    border: 1px solid #dee2e6;
    border-radius: 4px;
    overflow: hidden;
}

.object-map-preview-el {
    width: 100%;
    height: 240px;
}
</style>
