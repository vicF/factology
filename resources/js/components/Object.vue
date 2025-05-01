<!-- factology/resources/js/components/Object.vue -->
<template>
    <div class="container" id="search">
        <div v-if="!loaded" class="row">{{ $t('Loading...') }}</div>
        <div v-else class="row">
            <div class="col">
                <h1>
                    {{ object.name }}
                    <button class="btn btn-outline-primary ms-2" @click="openCreateModal('Class')">{{ $t('Create') }}</button>
                    <button class="btn btn-primary ms-2" @click="openEditModal">{{ $t('Edit') }}</button>
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
                    <!-- Going through links -->
                    <div v-for="link in object.links" :key="link.link_type_id" class="row p-3">
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
                                <RouterLink :to="{ name: 'object', params: { uid: link.thing_id } }">{{ link.name }}</RouterLink>
                            </div>
                            <div v-if="link.start">{{ $t('Start') }}: {{ $dateFromDb(link.start) }}</div>
                            <div v-if="link.end">{{ $t('End') }}: {{ $dateFromDb(link.end) }}</div>
                            <div v-if="link.link_start">{{ $t('Link start') }}: {{ $dateFromDb(link.link_start) }}</div>
                            <div v-if="link.link_end">{{ $t('Link end') }}: {{ $dateFromDb(link.link_end) }}</div>
                            <div v-if="link.description">{{ $t('Description') }}: {{ $truncateText(link.description, 300) }}</div>
                            <div v-if="link.translation">{{ link.translation }}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <!-- Dynamically render EditObject modal -->
        <EditObject
            v-if="showEditModal"
            :object="editObject"
            :params="modalParams"
            @object-created="handleObjectCreated"
            @object-updated="handleObjectUpdated"
            @close="showEditModal = false"
        />
    </div>
</template>

<script>
import { ref, onMounted, watch } from 'vue';
import axios from 'axios';
import ClassTree from "./ClassTree.vue";
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import EditObject from './EditObject.vue';
import { useAuthStore } from '../stores/auth';

export default {
    name: "Object",
    components: { ClassTree, EditObject },
    props: ["searchText", "typeThing", "typeClass"],
    setup(props) {
        const router = useRouter();
        const route = useRoute();
        const { t } = useI18n();
        const authStore = useAuthStore();

        const object = ref({});
        const loaded = ref(false);
        const showEditModal = ref(false);
        const editObject = ref(null);
        const modalParams = ref({});

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
                console.error('Get object error:', {
                    status: error.response?.status,
                    data: error.response?.data,
                    message: error.message,
                    config: error.config
                });
                handleApiError(error);
            }
        };

        const handleApiError = (error) => {
            console.log('handleApiError - Current route:', route.path, 'Query:', route.query);
            if (!router) {
                console.error('Router is undefined in handleApiError');
                window.location.href = '/login';
                return;
            }

            const status = error.response?.status;
            const data = error.response?.data;

            if (status === 401) {
                if (data?.data?.public === 1) {
                    object.value = data.data;
                    loaded.value = true;
                } else {
                    if (route.path === '/login') {
                        console.log('Already on login page, skipping redirect');
                        return;
                    }
                    console.log('Redirecting to login due to 401 for private object');
                    router.push({
                        path: '/login',
                        query: { redirect: route.fullPath }
                    });
                }
            } else {
                console.error('Unhandled error in handleApiError:', {
                    status,
                    data,
                    message: error.message
                });
                alert(data?.message || t('Error loading object'));
                loaded.value = true;
            }
        };

        const openCreateModal = (type) => {
            console.log('Object.vue - Opening create modal for type:', type);
            editObject.value = null; // No object for create mode
            modalParams.value = { classId: object.value.class?.thing_id }; // Pass classId if needed
            showEditModal.value = true;
        };

        const openEditModal = () => {
            console.log('Object.vue - Opening edit modal for object:', object.value);
            editObject.value = {
                thing_id: object.value.thing_id,
                name: object.value.name,
                description: object.value.description,
                start: object.value.start,
                end: object.value.end,
                public: object.value.public,
                class: object.value.class,
            };
            modalParams.value = { classId: object.value.class?.thing_id };
            showEditModal.value = true;
        };

        const handleObjectCreated = (newObject) => {
            console.log('Object.vue - Object created:', newObject);
            showEditModal.value = false;
            router.push({ name: 'object', params: { uid: newObject.data.id } });
        };

        const handleObjectUpdated = (updatedObject) => {
            console.log('Object.vue - Object updated:', updatedObject);
            object.value = updatedObject.data;
            showEditModal.value = false;
        };

        onMounted(() => {
            console.log('Object.vue mounted - Calling getObject');
            getObject();
        });

        watch(() => route.params.uid, (newParam, oldParam) => {
            if (newParam !== oldParam) {
                console.log('Object.vue watch - UID changed:', newParam);
                getObject();
            }
        });

        return {
            object,
            loaded,
            showEditModal,
            editObject,
            modalParams,
            getThumbUrl,
            openCreateModal,
            openEditModal,
            handleObjectCreated,
            handleObjectUpdated,
            t,
        };
    },
};
</script>

<style scoped>
.card {
    margin-top: 2rem;
}
.alert {
    margin-bottom: 1rem;
}
</style>
