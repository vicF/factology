<template>
    <div id="search">
        <div v-if="!loaded" class="row">Loading...</div>
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
                                <div v-for="(link, linkIndex) in thing.links" :key="`${link.link_type_id}-${link.thing_id}-${link.other_thing_id}-${linkIndex}`">
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
import TreeMenu from './TreeMenu.vue';

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

// Sync props with store
if (props.typeThing !== undefined) searchStore.setTypeThing(props.typeThing);
if (props.typeClass !== undefined) searchStore.setTypeClass(props.typeClass);

// Helper functions
const getThumbUrl = (thing_id) => {
    return `/thumbs/${thing_id.charAt(0)}/${thing_id.charAt(1)}/${thing_id}.jpg`;
};

// Main data fetching
const getObjects = async () => {
    const type = [];
    if (searchStore.typeThing) type.push(3);
    if (searchStore.typeClass) type.push(2);

    processing.value = true;
    try {
        const response = await axios.post('/object', {
            "search": searchStore.searchQuery || props.searchText || route.query.q || '',
            "type": type,
            classes: searchStore.checkedItems,
        });

        validationErrors.value = {};
        objects.value = response.data.things;
        console.log('Links:', response.data.links);
    } catch (error) {
        console.error(error);
        if (error.response?.status === 422) {
            validationErrors.value = error.response.data.errors;
        } else {
            validationErrors.value = {};
            alert(error.response?.data?.message || error.message);
        }
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

// Lifecycle
onMounted(() => {
    eventBus.on('trigger-search', triggerSearchHandler);
    getObjects();
});

onUnmounted(() => {
    eventBus.off('trigger-search', triggerSearchHandler);
});
</script>

<style scoped>
</style>
