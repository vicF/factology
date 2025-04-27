<!-- factology/resources/js/components/Object.vue -->
<template>
    <div class="container" id="search">
        <div v-if="!loaded" class="row">{{ $t('Loading...') }}</div>
        <div v-else class="row">
            <div class="col">
                <h1>
                    <TextField
                        fieldName="name"
                        v-model="object.name"
                        :isEditable="isEditing"
                    />
                    <button class="btn btn-outline-primary" @click="openCreateModal('Class')">{{ $t('Class') }}</button>
                    <button @click="toggleEditMode" class="btn btn-primary">
                        {{ isEditing ? $t('Cancel') : $t('Edit') }}
                    </button>
                </h1>
                <button v-if="isEditing" @click="saveChanges" class="btn btn-success">{{ $t('Save') }}</button>
                <div class="col-md-10 col-md-offset-1">
                    <div class="row rounded border p-3 rounded-4">
                        <div class="col-md-2" style="font-size: x-small">
                            <RouterLink :to="{ name: 'object', params: { uid: object.thing_id } }">
                                <img :src="getThumbUrl(object.thing_id)" class="img-fluid" />
                                <template v-if="isEditing">{{ $t('Upload') }}</template>
                            </RouterLink>
                        </div>
                        <div class="col-md-10">
                            <DateField
                                fieldName="start"
                                v-model="object.start"
                                :isEditable="isEditing"
                                :label="tc('Start', object.class?.thing_id)"
                            />
                            <DateField
                                fieldName="end"
                                v-model="object.end"
                                :isEditable="isEditing"
                                :label="tc('End', object.class?.thing_id)"
                            />
                            <TextField
                                fieldName="description"
                                v-model="object.description"
                                :isEditable="isEditing"
                                :label="tc('Description', object.class?.thing_id)"
                            />
                            <div v-if="object.record_created">{{ $t('Record created') }}: {{ object.record_created }}</div>
                            <div v-if="object.record_updated">{{ $t('Record updated') }}: {{ object.record_updated }}</div>
                            <RadioGroupField
                                fieldName="visibility"
                                v-model="object.public"
                                :options="{ 0: $t('Private'), 1: $t('Public') }"
                                :isEditable="isEditing"
                                :label="$t('Access')"
                            />
                            {{ object.description }}
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
                            <TextField
                                fieldName="description"
                                v-model="link.description"
                                :isEditable="isEditing"
                                :label="tc('Description', object.class?.thing_id)"
                            />
                            <div v-if="link.description">{{ $truncateText(link.description, 300) }}</div>
                            {{ link.translation }}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import { ref, onMounted, watch } from 'vue';
import axios from 'axios';
import ClassTree from "./ClassTree.vue";
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import RadioGroupField from "./Fields/RadioGroupField.vue";
import TextField from "./Fields/TextField.vue";
import DateField from "./Fields/DateField.vue";
import { eventBus } from '../eventBus';
import { useAuthStore } from '../stores/auth';

export default {
    name: "Object",
    components: { RadioGroupField, DateField, TextField, ClassTree },
    props: ["searchText", "typeThing", "typeClass"],
    setup(props) {
        const router = useRouter();
        const route = useRoute();
        const { t, tc } = useI18n();
        const authStore = useAuthStore();

        const object = ref({});
        const loaded = ref(false);
        const isEditing = ref(false);
        const originalObject = ref({});
        const validationErrors = ref({});
        const processing = ref(false);

        const getThumbUrl = (thing_id) => {
            return `/thumbs/${thing_id.charAt(0)}/${thing_id.charAt(1)}/${thing_id}.jpg`;
        };

        const getObject = async () => {
            try {
                loaded.value = false;
                const response = await axios.get(`/api/v1/object/${route.params.uid}`);
                object.value = response.data.data;
                originalObject.value = JSON.parse(JSON.stringify(response.data.data));
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
                    // Avoid redirect loop if already on /login
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

        const toggleEditMode = () => {
            if (isEditing.value) {
                object.value = JSON.parse(JSON.stringify(originalObject.value));
            }
            isEditing.value = !isEditing.value;
        };

        const saveChanges = async () => {
            try {
                processing.value = true;
                const response = await axios.put(`/api/v1/object/${route.params.uid}`, object.value);
                originalObject.value = JSON.parse(JSON.stringify(object.value));
                isEditing.value = false;
                alert($t('Changes saved successfully'));
            } catch (error) {
                handleApiError(error);
            } finally {
                processing.value = false;
            }
        };

        const openCreateModal = (type) => {
            eventBus.emit('open-create-modal', type);
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
            isEditing,
            toggleEditMode,
            saveChanges,
            getThumbUrl,
            t,
            tc,
            openCreateModal,
            validationErrors,
            processing
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
