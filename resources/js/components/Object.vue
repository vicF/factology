<!-- Object page -->
<template>
    <div class="container" id="search">
        <!-- Loading state -->
        <div v-if="!loaded" class="row text-center py-5">
            <div class="spinner-border" role="status">
                <span class="visually-hidden">{{ $t('Loading...') }}</span>
            </div>
        </div>

        <!-- Object loaded successfully -->
        <div v-else-if="object" class="row">
            <div class="col">
                <h1>
                    {{ object.name }}
                    <button v-if="authenticated" class="btn btn-success ms-2" @click="openCreateLinkedModal">
                        {{ $t('Create') }}
                    </button>
                    <button v-if="authenticated" class="btn btn-primary ms-2" @click="openEditModal">
                        {{ $t('Edit') }}
                    </button>
                    <button v-if="authenticated" class="btn btn-success ms-2" @click="openEditLinkModal">
                        {{ $t('Link') }}
                    </button>
                    <button v-if="authenticated" class="btn btn-danger ms-2" @click="deleteObject">
                        {{ $t('Delete') }}
                    </button>
                </h1>

                <div class="col-md-10 col-md-offset-1">
                    <div class="row rounded border p-3 rounded-4">
                        <div class="col-md-2" style="font-size: x-small">
                            <RouterLink :to="{ name: 'object', params: { uid: object.thing_id } }">
                                <img :src="getThumbUrl(object.thing_id)" class="img-fluid" />
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
                                <img :src="getThumbUrl(object.class.thing_id)" width="50"/>
                            </RouterLink>
                            <RouterLink :to="{ name: 'object', params: { uid: object.class.link_type_id } }">
                                <img :src="getThumbUrl(object.class.link_type_id)" width="50"/>
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
                    <div v-for="link in object.links" :key="link.link_id" class="row p-3 border-top pt-3">
                        <div class="col-md-2">
                            <RouterLink :to="{ name: 'object', params: { uid: link.thing_id } }">
                                <img :src="getThumbUrl(link.thing_id)" width="50"/>
                            </RouterLink>
                            <RouterLink :to="{ name: 'object', params: { uid: link.link_type_id } }">
                                <img :src="getThumbUrl(link.link_type_id)" width="50"/>
                            </RouterLink>
                        </div>
                        <div class="col-md-10">
                            <div v-if="link.name">
                                <RouterLink :to="{ name: 'object', params: { uid: link.thing_id } }">
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
                            <div v-if="link.translation">{{ link.translation }}</div>
                            <div>
                                <button v-if="authenticated" class="btn btn-danger btn-sm" @click="deleteLink(link.link_id)">
                                    {{ $t('Delete') }}
                                </button>
                                <button v-if="authenticated" class="btn btn-primary btn-sm ms-2" @click="openEditLinkModal(link)">
                                    {{ $t('Edit') }}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Object not accessible or doesn't exist -->
        <div v-else class="row">
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
            :parentObjectId="object?.thing_id"
            :initialLinkedObjects="[]"
            @object-created="handleLinkedObjectCreated"
            @close="showCreateLinkedModal = false"
        />

        <!-- === МОДАЛЬНОЕ ОКНО РЕДАКТИРОВАНИЯ ССЫЛКИ === -->
        <EditLinkModal
            v-if="showEditLinkModal"
            :link="editingLink"
            :currentObjectUuid="object?.thing_id"
            :currentObjectName="object?.name"
            @save="handleLinkSave"
            @close="showEditLinkModal = false"
        />
    </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import axios from 'axios';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import EditObject from './EditObject.vue';
import EditLinkModal from './EditLinkModal.vue';
import { useAuthStore } from '../stores/auth';
import { useObjectCacheStore } from '@/stores/objectCache.js'

// Props definition
const props = defineProps({
    searchText: String,
    typeThing: String,
    typeClass: String
});

// Composables
const router = useRouter();
const route = useRoute();
const { t } = useI18n();
const authStore = useAuthStore();
const cacheStore = useObjectCacheStore();

// State
const object = ref(null);
const loaded = ref(false);

// Modals
const showEditModal = ref(false);
const showTreeModal = ref(false);
const showCreateLinkedModal = ref(false);
const showEditLinkModal = ref(false);

const editObject = ref(null);
const modalParams = ref({});
const treeModalParams = ref({});
const editingLink = ref(null);

// Computed
const authenticated = computed(() => authStore.authenticated);

// Methods
const getThumbUrl = (thing_id) => {
    return `/thumbs/${thing_id.charAt(0)}/${thing_id.charAt(1)}/${thing_id}.jpg`;
};

const getObject = async () => {
    try {
        loaded.value = false;
        const response = await axios.get(`/object/${route.params.uid}`);
        object.value = response.data.data;
        cacheStore.cacheObject(object.value.thing_id, object.value, object.value.type);
    } catch (error) {
        if (error.response?.status === 401 || error.response?.status === 404) {
            console.log('Object not accessible for current user');
            object.value = null;
        } else {
            console.error('Get object error:', error);
        }
    } finally {
        loaded.value = true;
    }
};

const handleApiError = (error) => {
    const status = error.response?.status;
    if (status === 401) {
        const data = error.response?.data;
        if (data?.data?.public === 1) {
            object.value = data.data;
            loaded.value = true;
        } else {
            localStorage.removeItem('authenticated');
            router.push({ path: '/login', query: { redirect: route.fullPath } });
        }
    } else {
        loaded.value = true;
    }
};

const openCreateModal = (type) => {
    modalParams.value = {
        classId: object.value.class?.thing_id,
        type: type === 'Class' ? 2 : 3
    };
    showTreeModal.value = true;
};

const openEditModal = () => {
    editObject.value = { ...object.value };
    modalParams.value = {
        classId: object.value.class?.thing_id,
        type: object.value.type || 3
    };
    showEditModal.value = true;
};

const openCreateLinkedModal = () => {
    showCreateLinkedModal.value = true;
};

const openEditLinkModal = (link) => {
    editingLink.value = link;
    showEditLinkModal.value = true;
};

const deleteObject = async () => {
    if (!confirm(t('Are you sure you want to delete this object?'))) return;
    try {
        await axios.delete(`/object/${object.value.thing_id}`);
        router.push('/');
    } catch (error) {
        alert(t('Failed to delete object'));
    }
};

const deleteLink = async (link_id) => {
    if (!confirm(t('Are you sure you want to delete this link?'))) return;
    try {
        await axios.delete(`/link/${link_id}`);
        await getObject();
    } catch (error) {
        alert(t('Failed to delete link'));
    }
};

const handleLinkSave = async (result) => {
    showEditLinkModal.value = false;

    if (result.delete) {
        // Удаление ссылки
        await deleteLink(result.linkId);
    } else {
        // Обновление ссылки
        await updateLink(result.data);
    }
};

const updateLink = async (linkData) => {
    try {
        // Подготавливаем данные для отправки
        const payload = {
            thing_id: linkData.thing_id,
            link_type_id: linkData.link_type_id,
            description: linkData.description,
            // Сохраняем существующие даты
            start: linkData.start,
            end: linkData.end,
            link_start: linkData.link_start,
            link_end: linkData.link_end
        };

        await axios.put(`/link/${linkData.link_id}`, payload);

        // Обновляем объект после успешного обновления ссылки
        await getObject();

    } catch (error) {
        console.error('Failed to update link:', error);
        alert(t('Failed to update link'));
    }
};

const handleObjectCreated = (newObject) => {
    console.log('Object.vue - Created via tree:', newObject);
    showTreeModal.value = false;
    router.push({ name: 'object', params: { uid: newObject.data.thing_id } });
};

const handleObjectUpdated = (updatedObject) => {
    console.log('Object.vue - Object updated:', updatedObject);
    object.value = { ...object.value, ...updatedObject.data };
    showEditModal.value = false;
};

const handleLinkedObjectCreated = async () => {
    console.log('Object.vue - Linked object created → refreshing current object');
    showCreateLinkedModal.value = false;
    await getObject();
};

const linkRecords = computed(() => {
    if (!Array.isArray(object.value?.links)) return [];
    return object.value.links.map(l => ({
        link_id: l.link_id,
        link_type_id: l.link_type_id,
        other_thing_id: l.thing_id,
        description: l.description || '',
        public: l.public ?? 0,
    }));
});

// Lifecycle
onMounted(() => {
    getObject();
});

// Watchers
watch(() => route.params.uid, (newUid) => {
    if (newUid) getObject();
});
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
</style>
