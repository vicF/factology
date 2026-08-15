import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useSearchStore = defineStore('search', () => {
    const searchQuery = ref('');
    const checkedItems = ref([]);
    const typeThing = ref(false);
    const typeClass = ref(false);

    // Extended filter state
    const sortBy = ref('updated');
    const sortOrder = ref('desc');
    const visibility = ref('all');
    const dateFrom = ref(null);
    const dateTo = ref(null);
    const owner = ref('');
    const server = ref('');
    const filtersVisible = ref(false);

    function setSearchQuery(query) {
        searchQuery.value = query;
    }

    // Add a set of class ids (a node + its whole subtree) to the selection.
    function checkSubtree(ids) {
        const set = new Set(checkedItems.value);
        for (const id of ids) set.add(id);
        checkedItems.value = [...set];
    }

    // Remove a set of class ids (a node + its whole subtree) from the selection.
    function uncheckSubtree(ids) {
        const set = new Set(ids);
        checkedItems.value = checkedItems.value.filter(id => !set.has(id));
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
        sortBy.value = 'updated';
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
        if (sortBy.value !== 'updated') params.sort_by = sortBy.value;
        if (sortOrder.value !== 'desc') params.sort_order = sortOrder.value;
        if (visibility.value !== 'all') params.visibility = visibility.value;
        if (dateFrom.value) params.date_from = dateFrom.value;
        if (dateTo.value) params.date_to = dateTo.value;
        if (owner.value) params.owner = owner.value;
        if (server.value) params.server = server.value;
        return params;
    }

    return {
        searchQuery, checkedItems, typeThing, typeClass,
        sortBy, sortOrder, visibility, dateFrom, dateTo, owner, server, filtersVisible,
        setSearchQuery, checkSubtree, uncheckSubtree, setTypeThing, setTypeClass,
        setFilter, resetFilters, toggleFilters, getFilterParams,
    };
});
