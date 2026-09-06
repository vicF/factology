// resources/js/stores/objectView.js
//
// Shared state for the object page's "related objects" filter. The left panel
// (ObjectViewSidebar) owns the level selector and the class/link-type
// selection; Object.vue (Details list) and Graph.vue (Graph tab) consume the
// depth and the two id lists to hide non-matching objects and relations.
// The anchor object can never be filtered out — consumers guarantee that.

import { defineStore } from 'pinia';
import { ref } from 'vue';

export const MIN_DEPTH = 1;
export const MAX_DEPTH = 4;
export const DEFAULT_DEPTH = 2;

export const useObjectViewStore = defineStore('objectView', () => {
    // The object currently being viewed (/object/:uid).
    const uid = ref(null);
    // How many levels of related objects the panel tree and the graph reflect.
    const depth = ref(DEFAULT_DEPTH);
    // Ids of the classes/link types the user has checked (inclusion semantics:
    // what is checked is what stays visible). Before the panel has published
    // its first (all-checked) selection, `filtersReady` is false and consumers
    // show everything.
    const selectedClasses = ref([]);
    const selectedLinkTypes = ref([]);
    const filtersReady = ref(false);

    function setUid(value) {
        if (uid.value !== value) {
            uid.value = value ?? null;
            clearFilters();
        }
    }

    function setDepth(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return;
        depth.value = Math.min(MAX_DEPTH, Math.max(MIN_DEPTH, Math.trunc(n)));
    }

    function setFilters(classes, linkTypes) {
        selectedClasses.value = Array.isArray(classes) ? classes.slice() : [];
        selectedLinkTypes.value = Array.isArray(linkTypes) ? linkTypes.slice() : [];
        filtersReady.value = true;
    }

    function clearFilters() {
        selectedClasses.value = [];
        selectedLinkTypes.value = [];
        filtersReady.value = false;
    }

    return {
        uid,
        depth,
        selectedClasses,
        selectedLinkTypes,
        filtersReady,
        setUid,
        setDepth,
        setFilters,
        clearFilters,
    };
});
