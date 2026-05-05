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
                                    <!-- Left: Image and icon bar -->
                                    <div class="result-icon-section">
                                        <div class="image-with-bar">
                                            <!-- Main image -->
                                            <RouterLink :to="{ name: 'object', params: { uid: thing.thing_id } }" class="icon-link">
                                                <Image
                                                    :node-id="thing.thing_id"
                                                    width="48px"
                                                />
                                            </RouterLink>

                                            <!-- Vertical icon bar -->
                                            <div class="vertical-icon-bar">
                                                <!-- Private icon -->
                                                <div
                                                    v-if="thing.public === 0"
                                                    class="icon-item private-icon"
                                                    title="Private"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 -960 960 960" fill="currentColor">
                                                        <path d="M240-80q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640h40v-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240Zm240-160q33 0 56.5-23.5T560-320q0-33-23.5-56.5T480-400q-33 0-56.5 23.5T400-320q0 33 23.5 56.5T480-240ZM360-640h240v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85v80Z"/>
                                                    </svg>
                                                </div>

                                                <!-- Type icon -->
                                                <div
                                                    v-if="thing.type !== 3"
                                                    class="icon-item type-icon"
                                                    :class="getTypeIconClass(thing.type)"
                                                    :title="getTypeLabel(thing.type)"
                                                >
                                                    <!-- Class Icon -->
                                                    <svg v-if="thing.type === 2" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 -960 960 960" fill="currentColor">
                                                        <path d="M160-120q-33 0-56.5-23.5T80-200v-160q0-33 23.5-56.5T160-440h160q33 0 56.5 23.5T400-360v160q0 33-23.5 56.5T320-120H160Zm320-240q-17 0-28.5-11.5T440-400q0-17 11.5-28.5T480-440q17 0 28.5 11.5T520-400q0 17-11.5 28.5T480-360Zm160 0q-17 0-28.5-11.5T600-400q0-17 11.5-28.5T640-440q17 0 28.5 11.5T680-400q0 17-11.5 28.5T640-360Zm160 0q-17 0-28.5-11.5T760-400q0-17 11.5-28.5T800-440q17 0 28.5 11.5T840-400q0 17-11.5 28.5T800-360ZM160-520q-33 0-56.5-23.5T80-600v-160q0-33 23.5-56.5T160-840h160q33 0 56.5 23.5T400-760v160q0 33-23.5 56.5T320-520H160Zm480-80q-17 0-28.5-11.5T600-640q0-17 11.5-28.5T640-680q17 0 28.5 11.5T680-640q0 17-11.5 28.5T640-600Zm160 0q-17 0-28.5-11.5T760-640q0-17 11.5-28.5T800-680q17 0 28.5 11.5T840-640q0 17-11.5 28.5T800-600Z"/>
                                                    </svg>
                                                    <!-- Link Icon -->
                                                    <svg v-else-if="thing.type === 4" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 -960 960 960" fill="currentColor">
                                                        <path d="M440-280H280q-83 0-141.5-58.5T80-480q0-83 58.5-141.5T280-680h160v80H280q-50 0-85 35t-35 85q0 50 35 85t85 35h160v80ZM320-440v-80h320v80H320Zm200 160v-80h160q50 0 85-35t35-85q0-50-35-85t-85-35H520v-80h160q83 0 141.5 58.5T880-480q0 83-58.5 141.5T680-280H520Z"/>
                                                    </svg>
                                                    <!-- General Icon -->
                                                    <svg v-else-if="thing.type === 1" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 -960 960 960" fill="currentColor">
                                                        <path d="M480-80 240-220v-260L80-560l400-240 400 240v320h-80v-280l-80 40v260L480-80Zm0-400 160-88-160-88-160 88 160 88Z"/>
                                                    </svg>
                                                    <!-- External Icon -->
                                                    <svg v-else-if="thing.type === 5" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 -960 960 960" fill="currentColor">
                                                        <path d="M480-80 200-280v-240L40-600l440-240 440 240v400h-80v-360l-80 40v240L480-80Z"/>
                                                    </svg>
                                                </div>
                                            </div>
                                        </div>

                                        <!-- Dates below image -->
                                        <div class="image-dates">
                                            <span v-if="thing.start" class="image-date">
                                                {{ formatDateShort(thing.start) }}
                                            </span>
                                            <span v-if="thing.end" class="image-date">
                                                → {{ formatDateShort(thing.end) }}
                                            </span>
                                        </div>
                                    </div>

                                    <!-- Middle: Title, description, class badge -->
                                    <div class="result-info-section">
                                        <div class="result-header">
                                            <div class="result-title">
                                                <RouterLink :to="{ name: 'object', params: { uid: thing.thing_id } }" class="title-link">
                                                    {{ thing.name }}
                                                </RouterLink>
                                            </div>
                                        </div>

                                        <!-- Class badge for Things (horizontal, compact) -->
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

                                    <!-- Right: Links/Relationships (only shown if has links) -->
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

const getTypeLabel = (type) => {
    if (type === 2) return 'Class';
    if (type === 4) return 'Link';
    if (type === 1) return 'General';
    if (type === 5) return 'External';
    return '';
};

const getTypeIconClass = (type) => {
    if (type === 2) return 'type-class';
    if (type === 4) return 'type-link';
    if (type === 1) return 'type-general';
    if (type === 5) return 'type-external';
    return '';
};

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
}

/* Icon section with image and vertical bar */
.result-icon-section {
    flex-shrink: 0;
    width: 70px;
    text-align: center;
}

.image-with-bar {
    display: flex;
    align-items: flex-start;
    gap: 4px;
    justify-content: center;
}

.icon-link {
    display: inline-block;
    flex-shrink: 0;
}

/* Vertical icon bar */
.vertical-icon-bar {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex-shrink: 0;
}

.icon-item {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s ease;
    background: rgba(0, 0, 0, 0.6);
}

.icon-item svg {
    width: 11px;
    height: 11px;
    display: block;
}

.icon-item:hover {
    transform: scale(1.1);
}

/* Icon colors */
.private-icon {
    background: rgba(220, 53, 69, 0.8);
    color: white;
}

.private-icon:hover {
    background: rgba(220, 53, 69, 1);
}

.type-class {
    background: rgba(13, 110, 253, 0.8);
    color: white;
}

.type-class:hover {
    background: rgba(13, 110, 253, 1);
}

.type-link {
    background: rgba(111, 66, 193, 0.8);
    color: white;
}

.type-link:hover {
    background: rgba(111, 66, 193, 1);
}

.type-general {
    background: rgba(108, 117, 125, 0.8);
    color: white;
}

.type-general:hover {
    background: rgba(108, 117, 125, 1);
}

.type-external {
    background: rgba(23, 162, 184, 0.8);
    color: white;
}

.type-external:hover {
    background: rgba(23, 162, 184, 1);
}

.image-dates {
    font-size: 0.6rem;
    color: #adb5bd;
    text-align: center;
    margin-top: 6px;
    line-height: 1.2;
}

.image-date {
    display: block;
}

/* Info section */
.result-info-section {
    flex: 2;
    min-width: 150px;
}

.result-header {
    margin-bottom: 4px;
}

.result-title {
    font-size: 0.95rem;
    font-weight: 600;
}

.title-link {
    color: #0d6efd;
    text-decoration: none;
}

.title-link:hover {
    text-decoration: underline;
}

/* Class badge - compact */
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

/* Links section */
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

/* Separator */
.result-separator {
    margin-top: 0.75rem;
    border-bottom: 1px solid #e9ecef;
}

/* Desktop: show links section normally */
@media (min-width: 769px) {
    .result-links-section {
        display: block;
    }
}

/* Mobile: conditionally hide empty links section */
@media (max-width: 768px) {
    .result-content {
        flex-wrap: wrap;
        gap: 0.5rem;
    }

    .result-icon-section {
        width: auto;
    }

    .result-info-section {
        flex: 1;
        min-width: calc(100% - 80px);
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

/* Extra small screens */
@media (max-width: 480px) {
    .result-item {
        padding: 0.5rem 0;
    }

    .result-info-section {
        min-width: calc(100% - 70px);
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

/* Loading spinner */
.spinner-border {
    width: 2rem;
    height: 2rem;
}
</style>
