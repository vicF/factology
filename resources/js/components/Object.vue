<!-- Object page -->
<template>
    <div class="container" id="search">
        <!-- Loading state -->
        <div v-if="!loaded" class="row text-center py-5">
            <div class="spinner-border" role="status">
                <span class="visually-hidden">{{ $t('Loading...') }}</span>
            </div>
        </div>

        <!-- Server Error (500) -->
        <div v-else-if="serverError" class="row">
            <div class="col text-center py-5">
                <div class="alert alert-danger">
                    <h4>{{ $t('Server Error') }}</h4>
                    <p>
                        {{ $t('An unexpected error occurred on the server. Please try again later or contact support if the problem persists.') }}
                    </p>
                    <button @click="retryLoading" class="btn btn-primary mt-3">
                        {{ $t('Try Again') }}
                    </button>
                    <router-link to="/" class="btn btn-secondary mt-3 ms-2">
                        {{ $t('Go to Home') }}
                    </router-link>
                </div>
            </div>
        </div>

        <!-- Object not accessible or doesn't exist -->
        <div v-else-if="!object" class="row">
            <div class="col text-center py-5">
                <div class="alert" :class="authenticated ? 'alert-warning' : 'alert-info'">
                    <h4>{{ $t('Not Found') }}</h4>
                    <p>
                        {{ authenticated
                        ? $t('This object is private or does not exist.')
                        : $t('This object is private or does not exist. You may need to log in to view it.')
                        }}
                    </p>
                    <router-link v-if="!authenticated" to="/login" class="btn btn-primary mt-3">
                        {{ $t('Log in to see more') }}
                    </router-link>
                </div>
            </div>
        </div>

        <!-- Object loaded successfully -->
        <div v-else-if="object" class="row">
            <div class="col">
                <h1>
                    {{ object.name || '' }}
                    <button v-if="authenticated" class="btn btn-success ms-2" @click="openCreateLinkedModal" title="Create new object linked to this one">
                        {{ $t('Create') }}
                    </button>
                    <button v-if="authenticated" class="btn btn-primary ms-2" @click="openEditModal" title="Edit this object">
                        {{ $t('Edit') }}
                    </button>
                    <!-- "Link" button now uses its own modal for creation -->
                    <button v-if="authenticated" class="btn btn-success ms-2" @click="openCreateLinkModal" title="Link this object to another">
                        {{ $t('Link') }}
                    </button>
                    <button v-if="authenticated" class="btn btn-danger ms-2" @click="deleteObject" title="Delete this object">
                        {{ $t('Delete') }}
                    </button>
                </h1>

                <!-- Bootstrap Tabs -->
                <ul class="nav nav-tabs justify-content-end mb-3">
                    <li class="nav-item">
                        <a class="nav-link" :class="{ active: activeTab === 'details' }" @click="activeTab = 'details'" href="#">
                            {{ $t('Details') }}
                        </a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" :class="{ active: activeTab === 'graph' }" @click="activeTab = 'graph'" href="#">
                            {{ $t('Graph') }}
                        </a>
                    </li>
                </ul>

                <!-- Details Tab Content -->
                <div v-show="activeTab === 'details'" class="tab-content">
                    <div class="col-md-10 col-md-offset-1">
                        <div class="row rounded border p-3 rounded-4">
                            <div class="col-md-2" style="font-size: x-small">
                                <RouterLink :to="{ name: 'object', params: { uid: object.thing_id } }">
                                    <Image :node-id="object.thing_id" />
                                </RouterLink>
                            </div>
                            <div class="col-md-10">
                                <div>{{ $t('Start') }}: {{ object.start ? $dateFromDb(object.start) : '-' }}</div>
                                <div>{{ $t('End') }}: {{ object.end ? $dateFromDb(object.end) : '-' }}</div>
                                <div>{{ $t('Description') }}: {{ object.description || '-' }}</div>
                                <div v-if="object.record_created">{{ $t('Record created') }}: {{ object.record_created }}</div>
                                <div v-if="object.record_updated">{{ $t('Record updated') }}: {{ object.record_updated }}</div>
                                <div>{{ $t('Access') }}: {{ object.public ? $t('Public') : $t('Private') }}</div>
                            </div>
                        </div>

                        <!-- class -->
                        <div class="row p-3" v-if="object.class">
                            <div class="col-md-2">
                                <RouterLink :to="{ name: 'object', params: { uid: object.class.thing_id } }">
                                    <Image :node-id="object.class.thing_id" width="50px" />
                                </RouterLink>
                                <RouterLink :to="{ name: 'object', params: { uid: object.class.link_type_id } }">
                                    <Image :node-id="object.class.link_type_id" width="50px" />
                                </RouterLink>
                            </div>
                            <div class="col-md-10">
                                <div v-if="object.class.name">
                                    <RouterLink :to="{ name: 'object', params: { uid: object.class.thing_id } }">
                                        {{ object.class.name }}
                                    </RouterLink>
                                </div>
                                <div v-if="object.class.description">
                                    {{ $t('Description') }}: {{ $truncateText(object.class.description, 300) }}
                                </div>
                                <div v-if="object.class.translation">{{ object.class.translation }}</div>
                            </div>
                        </div>

                        <!-- Going through links -->
                        <div v-if="object.links && object.links.length">
                            <div v-for="link in object.links" :key="link.link_id" class="row p-3 border-top pt-3">
                                <div class="col-md-2">
                                    <RouterLink :to="{ name: 'object', params: { uid: link.thing_id } }">
                                        <Image :node-id="link.thing_id" width="50px" />
                                    </RouterLink>
                                    <RouterLink :to="{ name: 'object', params: { uid: link.link_type_id } }">
                                        <Image :node-id="link.link_type_id" :alt="link.description" width="50px" />
                                    </RouterLink>
                                </div>
                                <div class="col-md-10">
                                    <div v-if="link.name">
                                        <RouterLink :to="{ name: 'object', params: { uid: link.one_thing_id === object.thing_id?link.other_thing_id:link.one_thing_id } }">
                                            {{ link.name }}
                                        </RouterLink>
                                    </div>
                                    <div v-if="link.start">{{ $t('Start') }}: {{ $dateFromDb(link.start) }}</div>
                                    <div v-if="link.end">{{ $t('End') }}: {{ $dateFromDb(link.end) }}</div>
                                    <div v-if="link.link_start">{{ $t('Link start') }}: {{ $dateFromDb(link.link_start) }}</div>
                                    <div v-if="link.link_end">{{ $t('Link end') }}: {{ $dateFromDb(link.link_end) }}</div>
                                    <div v-if="link.description">
                                        {{ $t('Description') }}: {{ $truncateText(link.description, 300) }}
                                    </div>

                                    <div class="link-description mt-1">
                                        <LinkDescription :link="link" :object="object" size="small" />
                                    </div>

                                    <div v-if="link.translation" class="mt-1">
                                        <small>{{ link.translation }}</small>
                                    </div>

                                    <div class="mt-2">
                                        <button v-if="authenticated" class="btn btn-danger btn-sm" @click="deleteLink(link.link_id)">
                                            {{ $t('Delete') }}
                                        </button>
                                        <!-- Edit existing link -->
                                        <button v-if="authenticated" class="btn btn-primary btn-sm ms-2" @click="openEditLinkModal(link)">
                                            {{ $t('Edit') }}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Graph Tab Content -->
                <div v-show="activeTab === 'graph'" class="tab-content">
                    <Graph v-if="graphInitialized" ref="graphComponentRef" :object="object" />
                </div>
            </div>
        </div>

        <!-- === РЕДАКТИРОВАНИЕ ТЕКУЩЕГО ОБЪЕКТА === -->
        <EditObject
            v-if="showEditModal"
            :object="editObject"
            :params="modalParams"
            :initialLinkedObjects="linkRecords"
            @object-updated="handleObjectUpdated"
            @close="showEditModal = false"
        />

        <!-- === СОЗДАНИЕ НОВОГО ОБЪЕКТА (ClassTree) === -->
        <EditObject
            v-if="showTreeModal"
            :object="null"
            :params="treeModalParams"
            :initialLinkedObjects="[]"
            @object-created="handleObjectCreated"
            @close="showTreeModal = false"
        />

        <!-- === СОЗДАНИЕ СВЯЗАННОГО ОБЪЕКТА (с автосвязью) === -->
        <EditObject
            v-if="showCreateLinkedModal"
            :object="null"
            :initialLinkedObjects="defaultLinkedObjects"
            :params="createLinkedParams"
            @object-created="handleLinkedObjectCreated"
            @close="showCreateLinkedModal = false"
        />

        <!-- === МОДАЛЬНОЕ ОКНО РЕДАКТИРОВАНИЯ ССЫЛКИ (для существующих ссылок) === -->
        <EditLinkModal
            v-if="showEditLinkModal"
            :link="editingLink"
            :currentObject="object"
            @save="handleLinkSave"
            @close="showEditLinkModal = false"
        />

        <!-- === МОДАЛЬНОЕ ОКНО СОЗДАНИЯ НОВОЙ ССЫЛКИ === -->
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
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import axios from 'axios';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import EditObject from './EditObject.vue';
import EditLinkModal from './EditLinkModal.vue';
import { useAuthStore } from '../stores/auth';
import { useObjectCacheStore } from '@/stores/objectCache.js';
import Graph from './Graph.vue';
import LinkDescription from './LinkDescription.vue';
import { inject } from 'vue';
import { useObjectsStore } from '../stores/objects';
import Image from "./Image.vue";

const getThumbUrl = inject('getThumbUrl');

const props = defineProps({
    searchText: String,
    typeThing: String,
    typeClass: String
});

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
const showCreateLinkModal = ref(false); // for the "Link" button

const editObject = ref(null);
const modalParams = ref({});
const treeModalParams = ref({});
const editingLink = ref(null);
const newLinkData = ref(null); // holds data for a new link

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

const createLinkedParams = computed(() => ({
    type: 3,
}));

const authenticated = computed(() => authStore?.authenticated || false);

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

const retryLoading = () => {
    getObject();
};

const openCreateModal = (type) => {
    if (!object.value) return;
    modalParams.value = {
        classId: object.value.class?.thing_id,
        type: type === 'Class' ? 2 : 3
    };
    showTreeModal.value = true;
};

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
    // Prepare a new link with the current object as one side.
    // The other side will be selected by the user in the modal.
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
    if (result.delete) {
        // Not applicable for new link
        return;
    }
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
    console.log('Object.vue - Created via tree:', newObject);
    showTreeModal.value = false;
    if (newObject?.data?.thing_id) {
        router.push({ name: 'object', params: { uid: newObject.data.thing_id } });
    }
};

const handleObjectUpdated = async (updatedObject) => {
    console.log('Object.vue - Object updated:', updatedObject);
    showEditModal.value = false;
    await getObject();
};

const handleLinkedObjectCreated = async () => {
    console.log('Object.vue - Linked object created → refreshing current object');
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
    console.log('Saved global tab state:', newTab);
    if (newTab === 'graph') {
        if (!graphInitialized.value) {
            console.log('First time opening graph tab, initializing...');
            graphInitialized.value = true;
        } else {
            console.log('Refreshing existing graph view');
            nextTick(() => {
                if (graphComponentRef.value) {
                    graphComponentRef.value.refreshView();
                }
            });
        }
    }
}, { immediate: true });

watch(() => object.value, (newObject) => {
    if (graphInitialized.value && graphComponentRef.value && newObject) {
        console.log('Object changed, updating graph data');
        graphComponentRef.value.updateData(newObject);
        if (activeTab.value === 'graph') {
            setTimeout(() => {
                if (graphComponentRef.value) {
                    graphComponentRef.value.refreshView();
                }
            }, 200);
        }
    }
}, { deep: true });
</script>

<style scoped>
.border-top { border-top: 1px solid #dee2e6; }
.btn-success {
    background-color: #28a745;
    border-color: #28a745;
}
.btn-success:hover {
    background-color: #218838;
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
.nav-tabs .nav-link:hover {
    border-color: #e9ecef #e9ecef #dee2e6;
    isolation: isolate;
}
.link-translation {
    font-style: italic;
    color: #6c757d;
    font-size: 0.9em;
}
</style>
