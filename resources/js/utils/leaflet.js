// resources/js/utils/leaflet.js
//
// Shared Leaflet bootstrap used by the map components (ObjectMap.vue for the
// object-view Map tab, GeoPicker.vue for the edit-form mini-map). Keeping the
// base map + pin factory here avoids duplicated tile-layer/icon definitions.
//
// The map library (Leaflet) is neutral and international — the basemap's look,
// attribution and any embedded logos/flags come from the tile provider. The
// default provider is OpenStreetMap (detailed, and the most reliably reachable
// tile server); the user can switch providers via the base-layer control, and
// the choice is persisted.

import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './leaflet.css'

export const DEFAULT_CENTER = [55.75, 37.61]
export const DEFAULT_ZOOM = 4

const PROVIDER_KEY = 'factology.mapProvider'
const DEFAULT_PROVIDER = 'osm'

// Basemap tile providers offered by the switcher. All are international and
// flag-free. Order matters: the first entry is the default shown by the control.
export const TILE_PROVIDERS = {
    osm: {
        id: 'osm',
        name: 'OpenStreetMap',
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        subdomains: 'abc',
        maxZoom: 19,
    },
    cartoVoyager: {
        id: 'cartoVoyager',
        name: 'CARTO Voyager',
        url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            + ' &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20,
    },
    cartoLight: {
        id: 'cartoLight',
        name: 'CARTO Light',
        url: 'https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png',
        attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            + ' &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20,
    },
}

export function currentProviderId() {
    const saved = localStorage.getItem(PROVIDER_KEY)
    return saved && TILE_PROVIDERS[saved] ? saved : DEFAULT_PROVIDER
}

export function setProviderId(id) {
    if (TILE_PROVIDERS[id]) localStorage.setItem(PROVIDER_KEY, id)
}

/** Create a Leaflet map on `el` with the default tile layer and a provider switcher. */
export function createBaseMap(el) {
    const map = L.map(el).setView(DEFAULT_CENTER, DEFAULT_ZOOM)
    // Text-only attribution: no Leaflet logo prefix.
    map.attributionControl?.setPrefix(false)

    const baseLayers = {}
    let active = null
    for (const provider of Object.values(TILE_PROVIDERS)) {
        const layer = L.tileLayer(provider.url, {
            maxZoom: provider.maxZoom,
            attribution: provider.attribution,
            subdomains: provider.subdomains,
        })
        baseLayers[provider.name] = layer
        if (provider.id === currentProviderId()) active = layer
    }
    active = active || baseLayers[TILE_PROVIDERS[DEFAULT_PROVIDER].name]
    active.addTo(map)

    // Base-layer control lets the user pick the basemap; the choice persists.
    L.control.layers(baseLayers, null, { position: 'bottomleft' }).addTo(map)
    map.on('baselayerchange', (e) => {
        const provider = Object.values(TILE_PROVIDERS).find((p) => p.name === e.name)
        if (provider) setProviderId(provider.id)
    })

    return map
}

/** A divIcon pin marker; pass extra classes to color it (e.g. 'geo-pin geo-pin-root'). */
export function createPinIcon(pinClassName) {
    return L.divIcon({
        className: 'geo-marker',
        html: `<div class="${pinClassName}"></div>`,
        iconSize: [20, 30],
        iconAnchor: [10, 30],
    })
}
