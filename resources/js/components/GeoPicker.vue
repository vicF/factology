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
    // When true (default), a map click sets a Point geometry.
    clickable: { type: Boolean, default: true },
    height: { type: Number, default: 260 },
})

const emit = defineEmits(['update:modelValue'])

const mapEl = ref(null)
let map = null
let geoLayer = null
// Re-center the map only when a geometry first appears (or the user clicks),
// not on every edit keystroke — otherwise the map fights the typing.
let markerPlaced = false

const icon = createPinIcon('geo-pin')

const syncGeometry = () => {
    if (!map) return
    if (geoLayer) {
        geoLayer.remove()
        geoLayer = null
    }
    const geometry = props.modelValue && isGeoJsonGeometry(props.modelValue) ? props.modelValue : null
    if (!geometry) {
        markerPlaced = false
        return
    }
    geoLayer = L.geoJSON(geometry, {
        pointToLayer: (geoJsonPoint, latlng) => L.marker(latlng, { icon }),
        style: () => ({
            color: '#1e3b8a',
            weight: 3,
            fillColor: '#4a6bff',
            fillOpacity: 0.25,
        }),
    }).addTo(map)
    if (!markerPlaced) {
        const bounds = geoLayer.getBounds()
        if (geometry.type === 'Point') {
            map.setView(bounds.getCenter(), Math.max(map.getZoom(), 14))
        } else {
            map.fitBounds(bounds, { padding: [20, 20] })
        }
        markerPlaced = true
    }
}

const initMap = () => {
    if (map) return
    map = createBaseMap(mapEl.value)
    map.on('click', (e) => {
        if (!props.clickable) return
        emit('update:modelValue', { type: 'Point', coordinates: [e.latlng.lng, e.latlng.lat] })
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
