<template>
    <div class="container" id="search">
        <!-- Loading -->
        <div v-if="!loaded" class="row">
            <div class="col text-center py-5">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">{{ $t('Loading...') }}</span>
                </div>
            </div>
        </div>

        <!-- Server Error -->
        <div v-else-if="serverError" class="row">
            <div class="col text-center py-5">
                <div class="alert alert-danger">
                    <h4>{{ $t('Server Error') }}</h4>
                    <p>{{ $t('An unexpected error occurred on the server. Please try again later or contact support if the problem persists.') }}</p>
                    <button @click="retryLoading" class="btn btn-primary mt-3">{{ $t('Try Again') }}</button>
                    <router-link to="/" class="btn btn-secondary mt-3 ms-2">{{ $t('Go to Home') }}</router-link>
                </div>
            </div>
        </div>

        <!-- Not found -->
        <div v-else-if="!object" class="row">
            <div class="col text-center py-5">
                <div class="alert" :class="authenticated ? 'alert-warning' : 'alert-info'">
                    <h4>{{ $t('Not Found') }}</h4>
                    <p>
                        {{ authenticated
                        ? $t('This object is private or does not exist.')
                        : $t('This object is private or does not exist. You may need to log in to view it.') }}
                    </p>
                    <router-link v-if="!authenticated" to="/login" class="btn btn-primary mt-3">
                        {{ $t('Log in to see more') }}
                    </router-link>
                </div>
            </div>
        </div>

        <!-- Object loaded -->
        <div v-else class="row">
            <div class="col">
                <div class="row mt-3">
                    <div class="col-md-10 offset-md-1">

                        <!-- Header -->
                        <div class="object-header">
                            <h1 class="object-title">
                                {{ object.name || $t('Unnamed') }}
                                <IconPrivate v-if="object.public === 0" class="private-icon-header" />
                            </h1>
                            <div v-if="authenticated" class="object-actions">
                                <button class="btn btn-success" @click="openCreateLinkedModal" :title="$t('Create new object linked to this one')">{{ $t('Create') }}</button>
                                <button class="btn btn-primary" @click="openEditModal" :title="$t('Edit this object')">{{ $t('Edit') }}</button>
                                <button class="btn btn-success" @click="openCreateLinkModal" :title="$t('Link this object to another')">{{ $t('Link') }}</button>
                                <button class="btn btn-danger" @click="deleteObject" :title="$t('Delete this object')">{{ $t('Delete') }}</button>
                            </div>
                        </div>

                        <!-- Tabs -->
                        <ul class="nav nav-tabs justify-content-end mb-3">
                            <li class="nav-item">
                                <a class="nav-link" :class="{ active: activeTab === 'details' }" @click.prevent="activeTab = 'details'" href="#">
                                    {{ $t('Details') }}
                                </a>
                            </li>
                            <li class="nav-item">
                                <a class="nav-link" :class="{ active: activeTab === 'graph' }" @click.prevent="activeTab = 'graph'" href="#">
                                    {{ $t('Graph') }}
                                </a>
                            </li>
                        </ul>

                        <!-- Details -->
                        <div v-show="activeTab === 'details'">
                            <div class="results-list">

                                <!-- Main object card -->
                                <div class="result-item">
                                    <div class="result-content">
                                        <div class="result-icon-section">
                                            <RouterLink :to="{ name: 'object', params: { uid: object.thing_id } }" class="icon-link">
                                                <Image
                                                    :node-id="object.thing_id"
                                                    :type="object.type"
                                                    :is-private="object.public === 0"
                                                    width="48px"
                                                    side-bar="right"
                                                />
                                            </RouterLink>
                                        </div>

                                        <div class="result-info-section">
                                            <div class="result-header">
                                                <div class="result-title">{{ object.name }}</div>
                                            </div>

                                            <div v-if="object.class" class="class-badge">
                                                <Image :node-id="object.class.thing_id" width="12px" class="class-badge-icon" />
                                                <RouterLink :to="{ name: 'object', params: { uid: object.class.thing_id } }" class="class-badge-link">
                                                    {{ object.class.name }}
                                                </RouterLink>
                                            </div>

                                            <div v-if="object.start || object.end || object.description" class="result-description">
                                                <span v-if="object.start || object.end" class="inline-date" style="margin-right: 8px;">
                                                    <span class="date-badge">
                                                        📅
                                                        <template v-if="object.start">{{ $dateFromDb(object.start) }}</template>
                                                        <template v-if="object.start && object.end"> → </template>
                                                        <template v-else-if="object.end">{{ $t('until') }} </template>
                                                        <template v-if="object.end">{{ $dateFromDb(object.end) }}</template>
                                                    </span>
                                                </span>
                                                <span v-if="object.description">{{ object.description }}</span>
                                            </div>

                                            <div v-if="object.record_created || object.record_updated" class="result-meta mt-1">
                                                <span v-if="object.record_created" class="result-meta-row">
                                                    {{ $t('Created') }}: {{ object.record_created }}
                                                </span>
                                                <span v-if="object.record_updated" class="result-meta-row">
                                                    {{ $t('Updated') }}: {{ object.record_updated }}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- Separator before links -->
                                <div v-if="object.links && object.links.length" class="result-separator"></div>

                                <!-- Links list -->
                                <div v-for="link in (object.links || [])" :key="link.link_id" class="result-item">
                                    <div class="result-content">
                                        <div class="result-icon-section">
                                            <RouterLink :to="{ name: 'object', params: { uid: getLinkTargetId(link) } }" class="icon-link">
                                                <Image
                                                    :node-id="getLinkTargetId(link)"
                                                    :type="link.type"
                                                    :is-private="link.public === 0"
                                                    width="48px"
                                                    side-bar="right"
                                                />
                                            </RouterLink>
                                        </div>

                                        <div class="result-info-section">
                                            <div class="result-header">
                                                <div class="result-title" v-if="link.name">
                                                    <RouterLink :to="{ name: 'object', params: { uid: getLinkTargetId(link) } }" class="title-link">
                                                        {{ link.name }}
                                                    </RouterLink>
                                                </div>
                                            </div>

                                            <div v-if="link.start || link.end || link.description" class="result-description">
                                                <span v-if="link.start || link.end" class="inline-date" style="margin-right: 8px;">
                                                    <span class="date-badge">
                                                        📅
                                                        <template v-if="link.start">{{ $dateFromDb(link.start) }}</template>
                                                        <template v-if="link.start && link.end"> → </template>
                                                        <template v-if="link.end">{{ $dateFromDb(link.end) }}</template>
                                                    </span>
                                                </span>
                                                <span v-if="link.description">{{ $truncateText(link.description, 300) }}</span>
                                            </div>

                                            <div v-if="link.link_start || link.link_end" class="result-meta">
                                                <span v-if="link.link_start" class="result-meta-row">
                                                    {{ $t('Link start') }}: {{ $dateFromDb(link.link_start) }}
                                                </span>
                                                <span v-if="link.link_end" class="result-meta-row">
                                                    {{ $t('Link end') }}: {{ $dateFromDb(link.link_end) }}
                                                </span>
                                            </div>

                                            <div v-if="link" class="link-description mt-1">
                                                <LinkDescription :link="link" :object="object" size="small" />
                                            </div>

                                            <div v-if="link.translation" class="link-translation mt-1">
                                                {{ link.translation }}
                                            </div>

                                            <div v-if="authenticated" class="link-actions">
                                                <button class="btn btn-primary btn-sm" @click="openEditLinkModal(link)">{{ $t('Edit') }}</button>
                                                <button class="btn btn-danger btn-sm" @click="deleteLink(link.link_id)">{{ $t('Delete') }}</button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                            </div>
                        </div>

                        <!-- Graph -->
                        <div v-show="activeTab === 'graph'">
                            <Graph v-if="graphInitialized" ref="graphComponentRef" :object="object" />
                        </div>

                    </div>
                </div>
            </div>
        </div>

        <!-- Modals (unchanged) -->
        <EditObject
            v-if="showEditModal"
            :object="editObject"
            :params="modalParams"
            :initialLinkedObjects="linkRecords"
            @object-updated="handleObjectUpdated"
            @close="showEditModal = false"
        />
        <EditObject
            v-if="showTreeModal"
            :object="null"
            :params="treeModalParams"
            :initialLinkedObjects="[]"
            @object-created="handleObjectCreated"
            @close="showTreeModal = false"
        />
        <EditObject
            v-if="showCreateLinkedModal"
            :object="null"
            :initialLinkedObjects="defaultLinkedObjects"
            :params="createLinkedParams"
            @object-created="handleLinkedObjectCreated"
            @close="showCreateLinkedModal = false"
        />
        <EditLinkModal
            v-if="showEditLinkModal"
            :link="editingLink"
            :currentObject="object"
            @save="handleLinkSave"
            @close="showEditLinkModal = false"
        />
        <EditLinkModal
            v-if="showCreateLinkModal"
            :link="newLinkData"
            :currentObject="object"
            @save="handleNewLinkSave"
            @close="showCreateLinkModal = false"
        />
    </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick, inject } from 'vue';
import axios from 'axios';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import EditObject from './EditObject.vue';
import EditLinkModal from './EditLinkModal.vue';
import { useAuthStore } from '../stores/auth';
import { useObjectCacheStore } from '@/stores/objectCache.js';
import Graph from './Graph.vue';
import LinkDescription from './LinkDescription.vue';
import { useObjectsStore } from '../stores/objects';
import Image from "./Image.vue";

// Inject thumbnail function (provided by Default.vue)
const getThumbUrl = inject('getThumbUrl');

const router = useRouter();
const route = useRoute();
const { t } = useI18n();
const authStore = useAuthStore();
const cacheStore = useObjectCacheStore();
const objectsStore = useObjectsStore();

const object = ref(null);
const loaded = ref(false);
const serverError = ref(false);

const activeTab = ref(localStorage.getItem('globalActiveTab') || 'details');

const showEditModal = ref(false);
const showTreeModal = ref(false);
const showCreateLinkedModal = ref(false);
const showEditLinkModal = ref(false);
const showCreateLinkModal = ref(false);

const editObject = ref(null);
const modalParams = ref({});
const treeModalParams = ref({});
const editingLink = ref(null);
const newLinkData = ref(null);

const graphInitialized = ref(false);
const graphComponentRef = ref(null);

const defaultLinkedObjects = computed(() => {
    const links = [];
    if (object.value) {
        links.push({
            other_thing_id: object.value.thing_id,
            link_type_id: '2da45f14-69c6-4d56-9f2f-809fda14abf5',
            description: `Linked to ${object.value.name}`,
        });
    }
    return links;
});

const createLinkedParams = computed(() => ({ type: 3 }));
const authenticated = computed(() => authStore?.authenticated || false);

const getLinkTargetId = (link) => {
    if (!object.value) return link.thing_id;
    return link.one_thing_id === object.value.thing_id ? link.other_thing_id : link.one_thing_id;
};

const getObject = async () => {
    try {
        loaded.value = false;
        serverError.value = false;
        const response = await axios.get(`/object/${route.params.uid}`);
        object.value = response.data.data;
        if (object.value?.thing_id) {
            cacheStore.cacheObject(object.value.thing_id, object.value, object.value.type);
        }
    } catch (error) {
        console.error('Get object error:', error);
        if (error.response?.status === 500) {
            serverError.value = true;
            object.value = null;
        } else if (error.response?.status === 404) {
            object.value = null;
        } else if (error.response?.status === 401) {
            const data = error.response?.data;
            if (data?.data?.public === 1) {
                object.value = data.data;
            } else {
                object.value = null;
                if (!authenticated.value) {
                    localStorage.removeItem('authenticated');
                    router.push({ path: '/login', query: { redirect: route.fullPath } });
                }
            }
        } else {
            object.value = null;
        }
    } finally {
        loaded.value = true;
    }
};

const retryLoading = () => { getObject(); };

const openEditModal = () => {
    if (!object.value) return;
    editObject.value = { ...object.value };
    modalParams.value = {
        classId: object.value.class?.thing_id,
        type: object.value.type || 3
    };
    showEditModal.value = true;
};

const openCreateLinkedModal = () => {
    if (!object.value) return;
    showCreateLinkedModal.value = true;
};

const openEditLinkModal = (link) => {
    if (!link) return;
    editingLink.value = link;
    showEditLinkModal.value = true;
};

const openCreateLinkModal = () => {
    if (!object.value) return;
    newLinkData.value = {
        one_thing_id: object.value.thing_id,
        other_thing_id: null,
        link_type_id: '2da45f14-69c6-4d56-9f2f-809fda14abf5',
        translation: '',
        link_id: null,
        link_start: null,
        link_end: null,
    };
    showCreateLinkModal.value = true;
};

const deleteObject = async () => {
    if (!object.value) return;
    if (!confirm(t('Are you sure you want to delete this object?'))) return;
    try {
        await axios.delete(`/object/${object.value.thing_id}`);
        if (object.value.type === 2) {
            objectsStore.removeClassFromTree(object.value.thing_id);
        }
        router.push('/');
    } catch (error) {
        console.error('Failed to delete object:', error);
        alert(t('Failed to delete object'));
    }
};

const deleteLink = async (link_id) => {
    if (!link_id) return;
    if (!confirm(t('Are you sure you want to delete this link?'))) return;
    try {
        await axios.delete(`/link/${link_id}`);
        await getObject();
    } catch (error) {
        console.error('Failed to delete link:', error);
        alert(t('Failed to delete link'));
    }
};

const handleLinkSave = async (result) => {
    showEditLinkModal.value = false;
    if (result.delete) {
        await deleteLink(result.linkId);
    } else {
        await updateLink(result.data);
    }
};

const handleNewLinkSave = async (result) => {
    showCreateLinkModal.value = false;
    if (result.delete) return;
    await createLink(result.data);
};

const updateLink = async (linkData) => {
    try {
        const payload = {
            one_thing_id: linkData.one_thing_id,
            other_thing_id: linkData.other_thing_id,
            link_type_id: linkData.link_type_id,
            translation: linkData.translation,
            link_start: linkData.link_start,
            link_end: linkData.link_end,
            link_id: linkData.link_id
        };
        if (linkData.link_id) {
            await axios.put(`/link/${linkData.link_id}`, payload);
        } else {
            await axios.post(`/link`, payload);
        }
        await getObject();
    } catch (error) {
        console.error('Failed to update link:', error);
        alert(t('Failed to update link'));
    }
};

const createLink = async (linkData) => {
    try {
        const payload = {
            one_thing_id: linkData.one_thing_id,
            other_thing_id: linkData.other_thing_id,
            link_type_id: linkData.link_type_id,
            translation: linkData.translation,
            link_start: linkData.link_start,
            link_end: linkData.link_end,
        };
        await axios.post(`/link`, payload);
        await getObject();
    } catch (error) {
        console.error('Failed to create link:', error);
        alert(t('Failed to create link'));
    }
};

const handleObjectCreated = (newObject) => {
    showTreeModal.value = false;
    if (newObject?.data?.thing_id) {
        router.push({ name: 'object', params: { uid: newObject.data.thing_id } });
    }
};

const handleObjectUpdated = async () => {
    showEditModal.value = false;
    await getObject();
};

const handleLinkedObjectCreated = async () => {
    showCreateLinkedModal.value = false;
    await getObject();
};

const linkRecords = computed(() => {
    if (!object.value || !Array.isArray(object.value.links)) return [];
    return object.value.links.map(link => ({
        other_thing_id: link.one_thing_id === object.value.thing_id ? link.other_thing_id : link.one_thing_id,
        link_type_id: link.link_type_id,
        description: link.translation || '',
        link_id: link.link_id,
        one_thing_id: link.one_thing_id,
    }));
});

onMounted(() => {
    if (activeTab.value === 'graph') {
        graphInitialized.value = true;
    }
    getObject();
});

watch(() => route.params.uid, (newUid, oldUid) => {
    if (newUid && newUid !== oldUid) {
        object.value = null;
        loaded.value = false;
        serverError.value = false;
        getObject();
    }
});

watch(activeTab, (newTab) => {
    localStorage.setItem('globalActiveTab', newTab);
    if (newTab === 'graph') {
        if (!graphInitialized.value) {
            graphInitialized.value = true;
        } else {
            nextTick(() => {
                if (graphComponentRef.value) graphComponentRef.value.refreshView();
            });
        }
    }
}, { immediate: true });

watch(() => object.value, (newObject) => {
    if (graphInitialized.value && graphComponentRef.value && newObject) {
        graphComponentRef.value.updateData(newObject);
        if (activeTab.value === 'graph') {
            setTimeout(() => {
                if (graphComponentRef.value) graphComponentRef.value.refreshView();
            }, 200);
        }
    }
}, { deep: true });
</script>

<style scoped>
/* ========== reuse styles from Search.vue (with minor additions) ========== */
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
.result-icon-section {
    flex-shrink: 0;
    width: auto;               /* was 60px – change to auto */
    display: flex;
    flex-direction: column;
    align-items: flex-start;   /* ← added to prevent image shifting */
    margin-right: 4px;
}
.icon-link {
    display: inline-block;
}
.result-info-section {
    flex: 2;
    min-width: 150px;
    margin-top: -2px;
}
.result-header {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 4px;
}
.result-title {
    font-size: 1rem;
    font-weight: 600;
}
.title-link {
    color: #0d6efd;
    text-decoration: none;
}
.title-link:hover {
    text-decoration: underline;
}
.date-badge {
    font-size: 0.65rem;
    color: #6c757d;
    background: none;
    padding: 2px 8px;
    border-radius: 0;
    white-space: nowrap;
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
.result-meta {
    font-size: 0.7rem;
    color: #adb5bd;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 4px;
}
.result-meta-row {
    display: inline-flex;
    align-items: center;
    gap: 4px;
}
.link-translation {
    font-size: 0.75rem;
    color: #6c757d;
    font-style: italic;
}
.link-actions {
    margin-top: 8px;
    display: flex;
    gap: 6px;
}
.result-separator {
    margin-top: 0.75rem;
    border-bottom: 1px solid #e9ecef;
}
.object-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: 20px;
}
.object-title {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    font-size: 2rem;
    font-weight: 600;
}
.private-icon-header {
    font-size: 1rem;
    vertical-align: middle;
}
.object-actions {
    display: flex;
    gap: 8px;
}
@media (max-width: 768px) {
    .result-content {
        flex-wrap: wrap;
        gap: 0.5rem;
    }
    .result-icon-section {
        width: auto;           /* keep auto */
    }
    .result-info-section {
        min-width: calc(100% - 60px);
        margin-top: -1px;
    }
    .object-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 10px;
    }
    .object-actions {
        width: 100%;
        justify-content: flex-start;
    }
    .date-badge {
        white-space: normal;
    }
}
@media (max-width: 480px) {
    .result-item {
        padding: 0.5rem 0;
    }
    .result-title {
        font-size: 0.85rem;
    }
}
.nav-tabs {
    border-bottom: 1px solid #dee2e6;
}
.nav-tabs .nav-link {
    color: #495057;
    cursor: pointer;
}
.nav-tabs .nav-link.active {
    color: #0d6efd;
    background-color: #fff;
    border-color: #dee2e6 #dee2e6 #fff;
}
.btn-success {
    background-color: #28a745;
    border-color: #28a745;
}
.btn-success:hover {
    background-color: #218838;
}
.spinner-border {
    width: 2rem;
    height: 2rem;
}
</style>
