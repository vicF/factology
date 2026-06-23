<template>
    <div id="search">
        <div v-if="!loaded" class="row">
            <div class="col text-center py-5">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
            </div>
        </div>
        <div v-else-if="objects.length === 0" class="row">
            <div class="col text-center py-5">
                <p class="text-muted">No results found</p>
            </div>
        </div>
        <div v-else class="row">
            <div class="col">
                <div class="row mt-3">
                    <div class="col-md-10 offset-md-1">
                        <div class="results-list">
                            <div
                                v-for="(thing, thingIndex) in objects"
                                :key="`${thing.thing_id}-${thingIndex}`"
                                class="result-item"
                            >
                                <div class="result-content">
                                    <!-- LEFT: icon only -->
                                    <div class="result-icon-section">
                                        <RouterLink :to="{ name: 'object', params: { uid: thing.thing_id } }" class="icon-link">
                                            <Image
                                                :node-id="thing.thing_id"
                                                :type="thing.type"
                                                :is-private="!thing.public"
                                                width="48px"
                                                side-bar="right"
                                            />
                                        </RouterLink>
                                    </div>

                                    <!-- MIDDLE: name, then dates inline with description -->
                                    <div class="result-info-section">
                                        <div class="result-header">
                                            <div class="result-title">
                                                <RouterLink :to="{ name: 'object', params: { uid: thing.thing_id } }" class="title-link">
                                                    {{ thing.name }}
                                                </RouterLink>
                                            </div>
                                        </div>

                                        <div v-if="thing.type === 3 && thing.class" class="class-badge">
                                            <Image :node-id="thing.class.thing_id" width="12px" class="class-badge-icon" />
                                            <RouterLink :to="{ name: 'object', params: { uid: thing.class.thing_id } }" class="class-badge-link">
                                                {{ thing.class.name }}
                                            </RouterLink>
                                        </div>

                                        <!-- Dates inline on the first line of the description -->
                                        <div
                                            v-if="thing.start || thing.end || thing.description"
                                            class="result-description"
                                        >
                                            
        <span v-if="thing.start || thing.end" class="inline-date" style="margin-right: 8px;">

                                                📅
                                                <template v-if="thing.start">{{ formatDateShort(thing.start) }}</template>
                                                <template v-if="thing.start && thing.end"> → </template>
                                                <template v-else-if="thing.end">until </template>
                                                <template v-if="thing.end">{{ formatDateShort(thing.end) }}</template>
                                            </span>
                                            <span v-if="thing.description">{{ truncateText(thing.description, 120) }}</span>
                                        </div>
                                    </div>

                                    <!-- RIGHT: links (optional, shrinks when empty) -->
                                    <div
                                        v-if="thing.links && thing.links.length > 0"
                                        class="result-links-section"
                                    >
                                        <div class="links-container">
                                            <div class="links-title">
                                                <span>🔗 Related</span>
                                                <span class="links-count">({{ thing.links.length }})</span>
                                            </div>
                                            <div class="links-list">
                                                <div
                                                    v-for="(link, linkIndex) in thing.links.slice(0, 3)"
                                                    :key="`${link.link_type_id}-${linkIndex}`"
                                                    class="link-item"
                                                >
                                                    <RouterLink :to="{ name: 'object', params: { uid: link.link_type_id } }" class="link-type-icon">
                                                        <Image :node-id="link.link_type_id" width="14px" />
                                                    </RouterLink>
                                                    <span class="link-arrow">→</span>
                                                    <RouterLink :to="{ name: 'object', params: { uid: getOtherThingId(link, thing.thing_id) } }" class="link-target">
                                                        <Image :node-id="getOtherThingId(link, thing.thing_id)" width="14px" class="link-icon" />
                                                        <span class="link-name">{{ truncateText(link.name || 'Related', 30) }}</span>
                                                    </RouterLink>
                                                </div>
                                                <div v-if="thing.links.length > 3" class="more-links">
                                                    +{{ thing.links.length - 3 }} more
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div v-if="thingIndex < objects.length - 1" class="result-separator"></div>
                            </div>
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
import Image from "./Image.vue";

const props = defineProps({
    searchText: String,
    typeThing: String,
    typeClass: String
});

defineOptions({ name: "Search" });

const route = useRoute();
const searchStore = useSearchStore();

const objects = ref([]);
const loaded = ref(false);
const validationErrors = ref({});
const processing = ref(false);

if (props.typeThing !== undefined && props.typeThing !== null) {
    searchStore.setTypeThing(props.typeThing === 'true' || props.typeThing === true);
}
if (props.typeClass !== undefined && props.typeClass !== null) {
    searchStore.setTypeClass(props.typeClass === 'true' || props.typeClass === true);
}

const getOtherThingId = (link, currentThingId) => {
    const thingId = link.thing_id || link.one_thing_id;
    return thingId === currentThingId ? link.other_thing_id : thingId;
};

const truncateText = (text, maxLength) => {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
};

const formatDateShort = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: '2-digit' });
};

const getObjects = async () => {
    const type = [];
    if (searchStore.typeThing) type.push(3);
    if (searchStore.typeClass) type.push(2);

    processing.value = true;
    loaded.value = false;

    try {
        const searchQuery = searchStore.searchQuery || props.searchText || route.query.q || '';
        const response = await axios.post('/object', {
            search: searchQuery,
            type: type,
            classes: searchStore.checkedItems,
        });

        validationErrors.value = {};

        if (typeof response.data === 'string') {
            try {
                const parsed = JSON.parse(response.data);
                objects.value = parsed.things || [];
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
        }
        objects.value = [];
    } finally {
        processing.value = false;
        loaded.value = true;
    }
};

const triggerSearchHandler = () => { getObjects(); };

watch(() => route.query.q, (newQuery, oldQuery) => {
    if (newQuery !== oldQuery) {
        searchStore.setSearchQuery(newQuery || '');
        getObjects();
    }
});

watch(() => searchStore.checkedItems, () => {
    getObjects();
}, {deep: true});

onMounted(() => {
    eventBus.on('trigger-search', triggerSearchHandler);
    getObjects();
});

onUnmounted(() => {
    eventBus.off('trigger-search', triggerSearchHandler);
});
</script>
