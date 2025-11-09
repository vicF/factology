<template>
    <div class="container" id="search">
        <div v-if="!loaded" class="row">{{ $t('Loading...') }}</div>
        <div v-else class="row">
            <div class="col">
                <h1>
                    {{ object.name }}
                    <button class="btn btn-outline-primary ms-2" @click="openCreateModal('Class')">
                        {{ $t('Create') }}
                    </button>
                    <button class="btn btn-success ms-2" @click="openCreateLinkedModal">
                        Создать связанный объект
                    </button>
                    <button class="btn btn-primary ms-2" @click="openEditModal">
                        {{ $t('Edit') }}
                    </button>
                    <button class="btn btn-danger ms-2" @click="deleteObject">
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
                    <div class="row p-3">
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
                                <button class="btn btn-danger btn-sm mt-2" @click="deleteLink(link.link_id)">
                                    {{ $t('Delete') }}
                                </button>
                            </div>
                        </div>
                    </div>
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
            :parentObjectId="object.thing_id"
            :initialLinkedObjects="[]"
            @object-created="handleLinkedObjectCreated"
            @close="showCreateLinkedModal = false"
        />
    </div>
</template>

<script>
import { ref, computed, onMounted, watch } from 'vue';
import axios from 'axios';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import EditObject from './EditObject.vue';
import { useAuthStore } from '../stores/auth';

export default {
    name: "Object",
    components: { EditObject },
    props: ["searchText", "typeThing", "typeClass"],
    setup(props) {
        const router = useRouter();
        const route = useRoute();
        const { t } = useI18n();
        const authStore = useAuthStore();

        const object = ref({});
        const loaded = ref(false);

        // Модалки
        const showEditModal = ref(false);
        const showTreeModal = ref(false);
        const showCreateLinkedModal = ref(false);

        const editObject = ref(null);
        const modalParams = ref({});
        const treeModalParams = ref({});

        const getThumbUrl = (thing_id) => {
            return `/thumbs/${thing_id.charAt(0)}/${thing_id.charAt(1)}/${thing_id}.jpg`;
        };

        const getObject = async () => {
            try {
                loaded.value = false;
                const response = await axios.get(`/api/v1/object/${route.params.uid}`);
                object.value = response.data.data;
                console.log('Object.vue - Fetched object:', object.value);
                loaded.value = true;
            } catch (error) {
                console.error('Get object error:', error);
                handleApiError(error);
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
                alert(t('Error loading object'));
                loaded.value = true;
            }
        };

        // Открыть создание в дереве классов
        const openCreateModal = (type) => {
            modalParams.value = {
                classId: object.value.class?.thing_id,
                type: type === 'Class' ? 2 : 3
            };
            showTreeModal.value = true;
        };

        // Открыть редактирование текущего объекта
        const openEditModal = () => {
            editObject.value = { ...object.value };
            modalParams.value = {
                classId: object.value.class?.thing_id,
                type: object.value.type || 3
            };
            showEditModal.value = true;
        };

        // === НОВАЯ КНОПКА: Создать связанный объект ===
        const openCreateLinkedModal = () => {
            showCreateLinkedModal.value = true;
        };

        const deleteObject = async () => {
            if (!confirm(t('Are you sure you want to delete this object?'))) return;
            try {
                await axios.get('/sanctum/csrf-cookie');
                await axios.delete(`/api/v1/object/${object.value.thing_id}`);
                router.push('/');
            } catch (error) {
                alert(t('Failed to delete object'));
            }
        };

        const deleteLink = async (link_id) => {
            if (!confirm(t('Are you sure you want to delete this link?'))) return;
            try {
                await axios.get('/sanctum/csrf-cookie');
                await axios.delete(`/api/v1/link/${link_id}`);
                await getObject();
            } catch (error) {
                alert(t('Failed to delete link'));
            }
        };

        // Создание через ClassTree
        const handleObjectCreated = (newObject) => {
            console.log('Object.vue - Created via tree:', newObject);
            showTreeModal.value = false;
            router.push({ name: 'object', params: { uid: newObject.data.thing_id } });
        };

        // Обновление текущего объекта
        const handleObjectUpdated = (updatedObject) => {
            console.log('Object.vue - Object updated:', updatedObject);
            object.value = { ...object.value, ...updatedObject.data };
            showEditModal.value = false;
        };

        // === СОЗДАНИЕ СВЯЗАННОГО ОБЪЕКТА (главное!) ===
        const handleLinkedObjectCreated = async () => {
            console.log('Object.vue - Linked object created → refreshing current object');
            showCreateLinkedModal.value = false;
            await getObject(); // ← Обновляем текущий объект → новая связь появится
        };

        // Формируем linkRecords только для редактирования
        const linkRecords = computed(() => {
            if (!Array.isArray(object.value.links)) return [];
            return object.value.links.map(l => ({
                link_id: l.link_id,
                link_type_id: l.link_type_id,
                other_thing_id: l.thing_id,
                description: l.description || '',
                public: l.public ?? 0,
            }));
        });

        onMounted(() => {
            getObject();
        });

        watch(() => route.params.uid, (newUid) => {
            if (newUid) getObject();
        });

        return {
            object,
            loaded,
            showEditModal,
            showTreeModal,
            showCreateLinkedModal,
            editObject,
            modalParams,
            treeModalParams,
            getThumbUrl,
            openCreateModal,
            openEditModal,
            openCreateLinkedModal,
            deleteObject,
            deleteLink,
            handleObjectCreated,
            handleObjectUpdated,
            handleLinkedObjectCreated,
            linkRecords,
            t,
        };
    },
};
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
