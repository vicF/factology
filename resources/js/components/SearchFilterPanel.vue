<template>
    <div v-if="searchStore.filtersVisible" class="filter-panel">
        <div class="filter-panel-inner">
            <div class="row g-2">
                <!-- Sort by -->
                <div class="col-lg-2 col-6">
                    <label class="filter-label">Sort by</label>
                    <select class="form-select form-select-sm" :value="searchStore.sortBy" @change="updateFilter('sort', $event.target.value)">
                        <option value="updated">Updated</option>
                        <option value="created">Created</option>
                        <option value="start">Start Date</option>
                        <option value="name">Name</option>
                    </select>
                </div>
                <!-- Sort order -->
                <div class="col-lg-2 col-6">
                    <label class="filter-label">Order</label>
                    <select class="form-select form-select-sm" :value="searchStore.sortOrder" @change="updateFilter('order', $event.target.value)">
                        <option value="desc">Desc</option>
                        <option value="asc">Asc</option>
                    </select>
                </div>
                <!-- Visibility -->
                <div class="col-lg-2 col-6">
                    <label class="filter-label">Visibility</label>
                    <select class="form-select form-select-sm" :value="searchStore.visibility" @change="updateFilter('visibility', $event.target.value)">
                        <option value="all">All</option>
                        <option value="public">Public</option>
                        <option value="private">Private</option>
                        <option value="group">Group</option>
                    </select>
                </div>
                <!-- Owner -->
                <div class="col-lg-3 col-6">
                    <label class="filter-label">Owner</label>
                    <ObjectField v-model="ownerValue" :type="THING_TYPE" filter-type="owner" placeholder="Search owner..." :max-results="10" allow-clear />
                </div>
                <!-- Server -->
                <div class="col-lg-3 col-6">
                    <label class="filter-label">Server</label>
                    <ObjectField v-model="serverValue" :type="SERVER_TYPE" filter-type="server" placeholder="Search server..." :max-results="10" allow-clear />
                </div>
            </div>
            <div class="row g-2 mt-1">
                <!-- Date from -->
                <div class="col-lg-3 col-6">
                    <label class="filter-label">Date from</label>
                    <input class="form-control form-control-sm" type="date" :value="searchStore.dateFrom" @input="updateFilter('date_from', $event.target.value || null)" />
                </div>
                <!-- Date to -->
                <div class="col-lg-3 col-6">
                    <label class="filter-label">Date to</label>
                    <input class="form-control form-control-sm" type="date" :value="searchStore.dateTo" @input="updateFilter('date_to', $event.target.value || null)" />
                </div>
                <!-- Actions -->
                <div class="col-lg-6 d-flex align-items-end justify-content-end gap-2">
                    <button class="btn btn-outline-secondary btn-sm" @click="resetFilters">Reset</button>
                    <button class="btn btn-primary btn-sm" @click="applyFilters">Apply</button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { useSearchStore } from '../stores/search';
import { useRouter, useRoute } from 'vue-router';
import { THING_TYPE, SERVER_TYPE } from '../constants.js';
import ObjectField from './Fields/ObjectField.vue';

const searchStore = useSearchStore();
const router = useRouter();
const route = useRoute();

// ObjectField v-model refs, synced from store
const ownerValue = ref(searchStore.owner || null);
const serverValue = ref(searchStore.server || null);

// Sync ObjectField refs when store changes externally (e.g. Reset, URL nav)
watch(() => searchStore.owner, (val) => { ownerValue.value = val || null; });
watch(() => searchStore.server, (val) => { serverValue.value = val || null; });

// Sync ObjectField selection back to store
watch(ownerValue, (val) => { searchStore.setFilter('owner', val || ''); });
watch(serverValue, (val) => { searchStore.setFilter('server', val || ''); });

function updateFilter(key, value) {
    searchStore.setFilter(key, value);
}

function resetFilters() {
    searchStore.resetFilters();
    applyFilters();
}

function applyFilters() {
    const query = { q: searchStore.searchQuery || route.query.q || '' };
    const filterParams = searchStore.getFilterParams();
    Object.assign(query, filterParams);
    if (!query.q) delete query.q;
    searchStore.filtersVisible = false;
    router.push({ path: '/', query });
}
</script>
