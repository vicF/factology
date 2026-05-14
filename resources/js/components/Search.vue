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
                            <div v-for="(thing, thingIndex) in objects" :key="`${thing.thing_id}-${thingIndex}`" class="result-item">
                                <div class="result-content">
                                    <!-- Left: Image with optional side bar -->
                                    <div class="result-icon-section">
                                        <RouterLink :to="{ name: 'object', params: { uid: thing.thing_id } }" class="icon-link">
                                            <Image
                                                :node-id="thing.thing_id"
                                                :type="thing.type"
                                                :is-private="thing.public === 0"
                                                width="48px"
                                                side-bar="right"
                                            />
                                        </RouterLink>
                                        <!-- Dates below image -->
                                        <div class="image-dates">
                                            <span v-if="thing.start" class="image-date">
                                                {{ formatDateShort(thing.start) }}
                                                <span v-if="thing.end"> → {{ formatDateShort(thing.end) }}</span>
                                            </span>
                                            <span v-else-if="thing.end" class="image-date">
                                                📅 until {{ formatDateShort(thing.end) }}
                                            </span>
                                        </div>
                                    </div>

                                    <!-- Middle: Title, dates, description, class badge -->
                                    <div class="result-info-section">
                                        <div class="result-header">
                                            <div class="result-title">
                                                <RouterLink :to="{ name: 'object', params: { uid: thing.thing_id } }" class="title-link">
                                                    {{ thing.name }}
                                                </RouterLink>
                                            </div>
                                        </div>

                                        <!-- Class badge for Things -->
                                        <div v-if="thing.type === 3 && thing.class" class="class-badge">
                                            <Image :node-id="thing.class.thing_id" width="12px" class="class-badge-icon" />
                                            <RouterLink :to="{ name: 'object', params: { uid: thing.class.thing_id } }" class="class-badge-link">
                                                {{ thing.class.name }}
                                            </RouterLink>
                                        </div>

                                        <!-- Description -->
                                        <div v-if="thing.description" class="result-description">
                                            {{ truncateText(thing.description, 120) }}
                                        </div>
                                    </div>

                                    <!-- Right: Links/Relationships -->
                                    <div v-if="thing.links && thing.links.length > 0" class="result-links-section">
                                        <div class="links-container">
                                            <div class="links-title">
                                                <span>🔗 Related</span>
                                                <span class="links-count">({{ thing.links.length }})</span>
                                            </div>
                                            <div class="links-list">
                                                <div v-for="(link, linkIndex) in thing.links.slice(0, 3)" :key="`${link.link_type_id}-${linkIndex}`" class="link-item">
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

                                <!-- Subtle separator -->
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
    return link.thing_id === currentThingId ? link.other_thing_id : link.thing_id;
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

const triggerSearchHandler = () => {
    getObjects();
};

watch(() => route.query.q, (newQuery, oldQuery) => {
    if (newQuery !== oldQuery) {
        searchStore.setSearchQuery(newQuery || '');
        getObjects();
    }
});

watch(() => searchStore.checkedItems, () => {
    getObjects();
}, { deep: true });

onMounted(() => {
    eventBus.on('trigger-search', triggerSearchHandler);
    getObjects();
});

onUnmounted(() => {
    eventBus.off('trigger-search', triggerSearchHandler);
});
</script>

<style scoped>
.results-list {
    display: flex;
    flex-direction: column;
    gap: 0;
}

.result-item {
    padding: 0.75rem 0;
}

.result-content {
    display: flex;
    gap: 1rem;
    align-items: flex-start;
}

/* CRITICAL FIX: expandable left column */
.result-icon-section {
    flex-shrink: 0;
    width: auto !important;
    min-width: 0 !important;
    display: flex;
    flex-direction: column;
    align-items: flex-start !important;
    text-align: left !important;
}

.icon-link {
    display: inline-block;
}

.image-dates {
    font-size: 0.6rem;
    color: #adb5bd;
    text-align: left;
    margin-top: 4px;
    line-height: 1.2;
}

.image-date {
    display: block;
}

.result-info-section {
    flex: 2;
    min-width: 150px;
    margin-top: -2px;
}

.result-header {
    margin-bottom: 4px;
}

.result-title {
    font-size: 0.95rem;
    font-weight: 600;
    line-height: 1.3;
}

.title-link {
    color: #0d6efd;
    text-decoration: none;
}

.title-link:hover {
    text-decoration: underline;
}

.class-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.65rem;
    padding: 1px 6px;
    border-radius: 12px;
    background: #f8f9fa;
    color: #6c757d;
    margin-bottom: 6px;
}

.class-badge-icon {
    border-radius: 2px;
}

.class-badge-link {
    color: #6c757d;
    text-decoration: none;
}

.class-badge-link:hover {
    color: #0d6efd;
}

.result-description {
    font-size: 0.75rem;
    color: #6c757d;
    line-height: 1.35;
}

.result-links-section {
    flex: 1.2;
    min-width: 180px;
}

.links-container {
    background: #f8f9fa;
    border-radius: 8px;
    padding: 6px 10px;
}

.links-title {
    font-size: 0.65rem;
    font-weight: 600;
    color: #6c757d;
    margin-bottom: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.links-count {
    font-weight: normal;
    font-size: 0.6rem;
}

.links-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.link-item {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.7rem;
    flex-wrap: wrap;
}

.link-type-icon,
.link-target {
    display: inline-flex;
    align-items: center;
    text-decoration: none;
}

.link-icon {
    border-radius: 2px;
    margin-right: 2px;
}

.link-name {
    color: #495057;
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.link-name:hover {
    color: #0d6efd;
}

.link-arrow {
    color: #adb5bd;
    font-size: 9px;
}

.more-links {
    font-size: 0.65rem;
    color: #6c757d;
    margin-top: 2px;
    padding-top: 2px;
    border-top: 1px dashed #dee2e6;
}

.result-separator {
    margin-top: 0.75rem;
    border-bottom: 1px solid #e9ecef;
}

@media (min-width: 769px) {
    .result-links-section {
        display: block;
    }
}

/* ✅ FIXED MOBILE – text no longer overlaps sidebar */
@media (max-width: 768px) {
    .result-content {
        flex-wrap: wrap;
        gap: 0.5rem;
    }
    .result-icon-section {
        width: auto !important;
        flex-shrink: 0;
    }
    .result-info-section {
        flex: 1 1 100%;
        min-width: 0;
        overflow: hidden;
        word-break: break-word;
        margin-top: -1px;
    }
    .result-links-section {
        width: 100%;
        min-width: auto;
        margin-top: 0.5rem;
    }
    .result-links-section:empty {
        display: none;
    }
    .link-name {
        max-width: 150px;
        white-space: normal;
        word-break: break-word;
    }
}

@media (max-width: 480px) {
    .result-item {
        padding: 0.5rem 0;
    }
    .result-info-section {
        min-width: calc(100% - 56px);
    }
    .result-title {
        font-size: 0.85rem;
    }
    .result-description {
        font-size: 0.7rem;
    }
    .link-item {
        gap: 3px;
    }
    .link-name {
        max-width: 120px;
        font-size: 0.65rem;
    }
    .links-container {
        padding: 4px 8px;
    }
}

.spinner-border {
    width: 2rem;
    height: 2rem;
}
</style>
