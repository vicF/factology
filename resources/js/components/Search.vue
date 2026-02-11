<template>
    <div id="search">
        <div v-if="!loaded" class="row">Loading...</div>
        <div v-else-if="objects.length === 0" class="row">
            <div class="col text-center py-5">
                <p>No results found</p>
            </div>
        </div>
        <div v-else class="row">
            <div class="col">
                <div class="row mt-5">
                    <div class="col-md-10 offset-md-1">
                        <div class="row mb-3" v-for="(thing, thingIndex) in objects" :key="`${thing.thing_id}-${thingIndex}`">
                            <!-- Image Column -->
                            <div class="col-md-2" style="font-size: x-small;">
                                <RouterLink :to="{ name: 'object', params: { uid: thing.thing_id } }">
                                    <img :src="getThumbUrl(thing.thing_id)" />
                                </RouterLink>
                            </div>

                            <!-- Description and Details Column -->
                            <div class="col-md-4" style="font-size: x-small;">
                                <div>
                                    <RouterLink :to="{ name: 'object', params: { uid: thing.thing_id } }">{{ thing.name }}</RouterLink>
                                </div>
                                <div>{{ thing.description }}</div>
                            </div>

                            <!-- Links Column -->
                            <div class="col-md-6">
                                <div v-for="(link, linkIndex) in thing.links || []" :key="`${link.link_type_id}-${link.thing_id}-${link.other_thing_id}-${linkIndex}`">
                                    <RouterLink :to="{ name: 'object', params: { uid: link.link_type_id } }">
                                        <img :src="getThumbUrl(link.link_type_id)" width="10" />
                                    </RouterLink>
                                    <RouterLink :to="{ name: 'object', params: { uid: link.thing_id === thing.thing_id ? link.other_thing_id : link.thing_id } }">
                                        <img :src="getThumbUrl(link.thing_id === thing.thing_id ? link.other_thing_id : link.thing_id)" width="10" />
                                    </RouterLink>
                                    {{ link.translation }}
                                    <RouterLink :to="{ name: 'object', params: { uid: link.thing_id === thing.thing_id ? link.other_thing_id : link.thing_id } }">
                                        {{ link.name }}
                                    </RouterLink>
                                </div>
                            </div>

                            <!-- Horizontal Line After Each Row -->
                            <div class="col-12"><hr></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';
import { eventBus } from "../eventBus";
import { useSearchStore } from '../stores/search';

// Props
const props = defineProps({
    searchText: String,
    typeThing: String,
    typeClass: String
});

// Component name
defineOptions({
    name: "Search"
});

// Composables
const route = useRoute();
const searchStore = useSearchStore();

// State
const objects = ref([]);
const loaded = ref(false);
const validationErrors = ref({});
const processing = ref(false);

// Sync props with store - FIXED: Check for boolean/string values properly
if (props.typeThing !== undefined && props.typeThing !== null) {
    searchStore.setTypeThing(props.typeThing === 'true' || props.typeThing === true);
}
if (props.typeClass !== undefined && props.typeClass !== null) {
    searchStore.setTypeClass(props.typeClass === 'true' || props.typeClass === true);
}

// Helper functions
const getThumbUrl = (thing_id) => {
    if (!thing_id) return '';
    return `/thumbs/${thing_id.charAt(0)}/${thing_id.charAt(1)}/${thing_id}.jpg`;
};

// Main data fetching - FIXED: Response handling
const getObjects = async () => {
    const type = [];
    if (searchStore.typeThing) type.push(3);
    if (searchStore.typeClass) type.push(2);

    processing.value = true;
    loaded.value = false;

    try {
        const searchQuery = searchStore.searchQuery || props.searchText || route.query.q || '';
        console.log('Search.vue - Searching for:', searchQuery, 'types:', type, 'classes:', searchStore.checkedItems);

        const response = await axios.post('/object', {
            search: searchQuery,
            type: type,
            classes: searchStore.checkedItems,
        });

        //console.log('Search.vue - Response:', response.data);

        validationErrors.value = {};

        // FIXED: Proper response parsing
        if (typeof response.data === 'string') {
            try {
                const parsed = JSON.parse(response.data);
                objects.value = parsed.things || [];
                console.log('Search.vue - Parsed objects:', objects.value);
            } catch (e) {
                console.error('Search.vue - Failed to parse response:', e);
                objects.value = [];
            }
        } else {
            objects.value = response.data.things || response.data || [];
        }

    } catch (error) {
        console.error('Search.vue - Error:', error);
        if (error.response?.status === 422) {
            validationErrors.value = error.response.data.errors || {};
        } else {
            validationErrors.value = {};
            const errorMessage = error.response?.data?.message || error.message;
            console.error('Search.vue - Error message:', errorMessage);
        }
        objects.value = [];
    } finally {
        processing.value = false;
        loaded.value = true;
    }
};

// Event handler
const triggerSearchHandler = () => {
    console.log('Search.vue - trigger-search received, searchQuery:',
        searchStore.searchQuery, 'classIds:', searchStore.checkedItems);
    getObjects();
};

// Watchers
watch(() => route.query.q, (newQuery, oldQuery) => {
    if (newQuery !== oldQuery) {
        console.log('Search.vue - Query param changed:', newQuery);
        searchStore.setSearchQuery(newQuery || '');
        getObjects();
    }
});

// Watch for store changes that should trigger search
watch(() => searchStore.checkedItems, () => {
    console.log('Search.vue - checkedItems changed, triggering search');
    getObjects();
}, { deep: true });

watch(() => searchStore.searchQuery, (newQuery) => {
    console.log('Search.vue - searchQuery changed:', newQuery);
    // Don't trigger search here to avoid double requests
    // The route watcher or eventBus will handle it
});

// Lifecycle
onMounted(() => {
    eventBus.on('trigger-search', triggerSearchHandler);

    // Initial load
    getObjects();
});

onUnmounted(() => {
    eventBus.off('trigger-search', triggerSearchHandler);
});
</script>

<style scoped>
</style>
