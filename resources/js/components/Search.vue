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

                                            <!-- Vertical icon bar - using icon components -->
                                            <div class="vertical-icon-bar">
                                                <!-- Private icon -->
                                                <div
                                                    v-if="thing.public === 0"
                                                    class="icon-item private-icon"
                                                    title="Private"
                                                >
                                                    <IconPrivate />
                                                </div>

                                                <!-- Type icon (only for non-thing types) -->
                                                <div
                                                    v-if="thing.type !== 3"
                                                    class="icon-item type-icon"
                                                    :class="getTypeIconClass(thing.type)"
                                                    :title="getTypeLabel(thing.type)"
                                                >
                                                    <IconClass v-if="thing.type === 2" />
                                                    <IconLink v-else-if="thing.type === 4" />
                                                    <IconThing v-else-if="thing.type === 1" />
                                                    <IconExternal v-else-if="thing.type === 5" />
                                                </div>
                                            </div>
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

                                            <!-- Dates moved to the top, right after title -->
                                            <div class="result-dates">
                                                <span v-if="thing.start" class="date-badge">
                                                    📅 {{ formatDateShort(thing.start) }}
                                                    <span v-if="thing.end"> → {{ formatDateShort(thing.end) }}</span>
                                                </span>
                                                <span v-else-if="thing.end" class="date-badge">
                                                    📅 until {{ formatDateShort(thing.end) }}
                                                </span>
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
    align-items: flex-start;
}

/* Icon section with image and vertical bar */
.result-icon-section {
    flex-shrink: 0;
    width: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
}

.image-with-bar {
    display: flex;
    align-items: flex-start;
    gap: 4px;
    position: relative;
}

.icon-link {
    display: inline-block;
    flex-shrink: 0;
    line-height: 0;
}

/* Vertical icon bar */
.vertical-icon-bar {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex-shrink: 0;
    background-color: #f8f9fa;
    border-radius: 4px;
    padding: 4px 3px;
    margin-top: 0;
}

.icon-item {
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.2s ease;
}

/* Force SVG colors to stay white */
.icon-item :deep(svg) {
    width: 10px;
    height: 10px;
    display: block;
    stroke: white;
    fill: none;
    stroke-width: 2;
}

/* For icons that need fill (like checkmark) */
.icon-item :deep(svg[fill="currentColor"]) {
    fill: white;
    stroke: none;
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

/* Info section - perfect alignment with image top */
.result-info-section {
    flex: 2;
    min-width: 150px;
    margin-top: -2px; /* Поднимаем на 2 пикселя для лучшего выравнивания */
    padding-top: 0;
}

.result-header {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 4px;
    line-height: 1.2;
}

.result-title {
    font-size: 0.95rem;
    font-weight: 600;
    line-height: 1.2;
    margin: 0;
    padding: 0;
}

.title-link {
    color: #0d6efd;
    text-decoration: none;
}

.title-link:hover {
    text-decoration: underline;
}

/* Date badge styling */
.result-dates {
    display: inline-flex;
    line-height: 1.2;
}

.date-badge {
    font-size: 0.65rem;
    color: #6c757d;
    background: #f8f9fa;
    padding: 2px 8px;
    border-radius: 12px;
    white-space: nowrap;
    line-height: 1.2;
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
    margin-bottom: 4px;
    line-height: 1.2;
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
    line-height: 1.3;
    margin: 0;
    padding: 0;
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

.result-separator {
    margin-top: 0.75rem;
    border-bottom: 1px solid #e9ecef;
}

/* Desktop styles */
@media (min-width: 769px) {
    .result-info-section {
        max-width: calc(100% - 280px);
    }
}

/* Mobile adjustments - уменьшенные отступы */
@media (max-width: 768px) {
    .result-content {
        gap: 0.75rem;
    }

    .result-info-section {
        min-width: auto;
        margin-top: -2px; /* Держим то же выравнивание */
    }

    .result-links-section {
        width: 100%;
        min-width: auto;
    }

    .result-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 4px;
        margin-bottom: 2px; /* Уменьшили отступ между заголовком и остальным */
    }

    .date-badge {
        white-space: normal;
        display: inline-block;
    }

    .result-title {
        line-height: 1.2;
        font-size: 0.9rem;
    }

    /* Уменьшенные отступы для мобильной версии */
    .class-badge {
        margin-bottom: 2px;
    }

    .result-description {
        font-size: 0.7rem;
        line-height: 1.25;
        margin-top: 0;
    }
}

/* Extra small screens */
@media (max-width: 480px) {
    .result-item {
        padding: 0.5rem 0;
    }

    .icon-item {
        width: 14px;
        height: 14px;
    }

    .icon-item :deep(svg) {
        width: 8px;
        height: 8px;
    }

    .result-title {
        font-size: 0.85rem;
    }

    .result-description {
        font-size: 0.7rem;
    }

    .link-name {
        max-width: 120px;
        font-size: 0.65rem;
    }

    .links-container {
        padding: 4px 8px;
    }

    .result-info-section {
        margin-top: -2px;
    }
}

.spinner-border {
    width: 2rem;
    height: 2rem;
}
</style>
