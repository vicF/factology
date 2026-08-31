import { defineStore } from 'pinia';
import { ref } from 'vue';
import { pruneEmptyNodes } from '../utils/classTree';
import { storage, storageSync } from '../utils/storage';

const CHECKED_KEY = 'factology:classTree:checkedItems';
const CHECKED_INIT_KEY = 'factology:classTree:checkedUserInit';

let _resolveRestore = null;
export const checkedRestorePromise = new Promise(resolve => { _resolveRestore = resolve; });

export const useSearchStore = defineStore('search', () => {
    // Load persisted checked items (sync fallback for web, async for native)
    let initialChecked = [];
    let initialUserInit = false;
    try {
        const raw = storageSync.get(CHECKED_KEY);
        if (raw) initialChecked = JSON.parse(raw);
        initialUserInit = !!storageSync.get(CHECKED_INIT_KEY);
    } catch (_) { /* ignore */ }

    const searchQuery = ref('');
    const checkedItems = ref(initialChecked);
    // True once the user has manually toggled any checkbox. When true,
    // loadClassTree skips auto-checking Event even if checkedItems is empty.
    const checkedUserInitiated = ref(initialUserInit);
    const typeThing = ref(false);
    const typeClass = ref(false);

    // Extended filter state
    const sortBy = ref('start');
    const sortOrder = ref('desc');
    const visibility = ref('all');
    const dateFrom = ref(null);
    const dateTo = ref(null);
    const owner = ref('');
    const server = ref('');
    const filtersVisible = ref(false);

    // Persist checkedItems + user-init flag whenever the selection changes
    function persistChecked() {
        storageSync.set(CHECKED_KEY, JSON.stringify(checkedItems.value));
        storageSync.set(CHECKED_INIT_KEY, checkedUserInitiated.value ? '1' : '');
        storage.set(CHECKED_KEY, JSON.stringify(checkedItems.value)).catch(() => {});
        if (checkedUserInitiated.value) {
            storage.set(CHECKED_INIT_KEY, '1').catch(() => {});
        } else {
            storage.remove(CHECKED_INIT_KEY).catch(() => {});
        }
    }

    // Async restore from Capacitor Preferences (native) — runs on store init.
    const checkedRestored = ref(false);
    (async () => {
        try {
            const raw = await storage.get(CHECKED_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    checkedItems.value = parsed;
                }
            }
            const initRaw = await storage.get(CHECKED_INIT_KEY);
            if (initRaw) checkedUserInitiated.value = true;
        } catch (_) { /* ignore */ }
        checkedRestored.value = true;
        if (_resolveRestore) _resolveRestore();
    })();

    function setSearchQuery(query) {
        searchQuery.value = query;
    }

    // Add a set of class ids (a node + its whole subtree) to the selection.
    function checkSubtree(ids, userInitiated = false) {
        const set = new Set(checkedItems.value);
        for (const id of ids) set.add(id);
        checkedItems.value = [...set];
        if (userInitiated) checkedUserInitiated.value = true;
        persistChecked();
    }

    // Remove a set of class ids (a node + its whole subtree) from the selection.
    function uncheckSubtree(ids, userInitiated = false) {
        const set = new Set(ids);
        checkedItems.value = checkedItems.value.filter(id => !set.has(id));
        if (userInitiated) checkedUserInitiated.value = true;
        persistChecked();
    }

    // After unchecking, drop internal nodes that lost all their selected
    // descendants, cascading up to the tree root (see pruneEmptyNodes).
    function pruneEmptyAncestors(treeNodes) {
        checkedItems.value = pruneEmptyNodes(treeNodes, checkedItems.value);
        persistChecked();
    }

    function setTypeThing(value) {
        typeThing.value = value;
    }

    function setTypeClass(value) {
        typeClass.value = value;
    }

    function setFilter(key, value) {
        switch (key) {
            case 'sort': sortBy.value = value; break;
            case 'order': sortOrder.value = value; break;
            case 'visibility': visibility.value = value; break;
            case 'date_from': dateFrom.value = value; break;
            case 'date_to': dateTo.value = value; break;
            case 'owner': owner.value = value; break;
            case 'server': server.value = value; break;
        }
    }

    function resetFilters() {
        sortBy.value = 'start';
        sortOrder.value = 'desc';
        visibility.value = 'all';
        dateFrom.value = null;
        dateTo.value = null;
        owner.value = '';
        server.value = '';
    }

    function toggleFilters() {
        filtersVisible.value = !filtersVisible.value;
    }

    function getFilterParams() {
        const params = {};
        if (sortBy.value !== 'start') params.sort_by = sortBy.value;
        if (sortOrder.value !== 'desc') params.sort_order = sortOrder.value;
        if (visibility.value !== 'all') params.visibility = visibility.value;
        if (dateFrom.value) params.date_from = dateFrom.value;
        if (dateTo.value) params.date_to = dateTo.value;
        if (owner.value) params.owner = owner.value;
        if (server.value) params.server = server.value;
        return params;
    }

    return {
        searchQuery, checkedItems, checkedUserInitiated, checkedRestored, typeThing, typeClass,
        sortBy, sortOrder, visibility, dateFrom, dateTo, owner, server, filtersVisible,
        setSearchQuery, checkSubtree, uncheckSubtree, pruneEmptyAncestors, setTypeThing, setTypeClass,
        setFilter, resetFilters, toggleFilters, getFilterParams,
    };
});
