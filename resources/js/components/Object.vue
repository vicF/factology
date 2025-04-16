<!-- resources/js/components/Object.vue -->
<template>
    <div class="container" id="search">
        <div v-if="!loaded && !showLoginModal" class="row">Loading...</div>
        <div v-else-if="showLoginModal" class="row">
            <!-- Simple login modal -->
            <div class="col-md-6 offset-md-3">
                <div class="card shadow">
                    <div class="card-body">
                        <h3 class="text-center">{{ $t('Login Required') }}</h3>
                        <form @submit.prevent="handleLogin">
                            <div class="mb-3">
                                <label for="email" class="form-label">{{ $t('Email') }}</label>
                                <input type="email" class="form-control" id="email" v-model="loginForm.email" required>
                            </div>
                            <div class="mb-3">
                                <label for="password" class="form-label">{{ $t('Password') }}</label>
                                <input type="password" class="form-control" id="password" v-model="loginForm.password" required>
                            </div>
                            <div v-if="loginError" class="alert alert-danger">{{ loginError }}</div>
                            <div class="d-flex justify-content-between">
                                <button type="button" class="btn btn-secondary" @click="cancelLogin">{{ $t('Cancel') }}</button>
                                <button type="submit" class="btn btn-primary" :disabled="processing">{{ processing ? $t('Logging in...') : $t('Login') }}</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
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
                            <!-- <pre style="font-size: x-small">{{ object }}</pre> -->
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
import { reactive } from 'vue';
import TextField from "./Fields/TextField.vue";
import DateField from "./Fields/DateField.vue";
import { useI18n } from 'vue-i18n';
import RadioGroupField from "./Fields/RadioGroupField.vue";
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
        const showLoginModal = ref(false);
        const loginForm = reactive({
            email: '',
            password: ''
        });
        const loginError = ref('');

        const getThumbUrl = (thing_id) => {
            return `/thumbs/${thing_id.charAt(0)}/${thing_id.charAt(1)}/${thing_id}.jpg`;
        };

        const getObject = async () => {
            try {
                loaded.value = false;
                showLoginModal.value = false;
                const response = await axios.get(`/api/v1/object/${route.params.uid}`);
                object.value = response.data.data;
                originalObject.value = JSON.parse(JSON.stringify(response.data.data));
                loaded.value = true;
            } catch (error) {
                handleApiError(error);
            }
        };

        const handleApiError = (error) => {
            const response = error.response;
            if (response?.status === 401 && !authStore.authenticated) {
                // Restricted object, unauthenticated user
                if (object.value.public === 1) {
                    // Public object: should already be loaded
                    loaded.value = true;
                } else {
                    // Private object: show login
                    showLoginModal.value = true;
                }
            } else if (response?.status === 422) {
                validationErrors.value = response.data.errors;
                loaded.value = true;
            } else {
                alert(response?.data?.message || 'Error loading object');
                loaded.value = true;
            }
        };

        const handleLogin = async () => {
            try {
                processing.value = true;
                loginError.value = '';
                await axios.get('/sanctum/csrf-cookie');
                const response = await axios.post('/login', loginForm);
                authStore.login(response.data.user || { email: loginForm.email });
                showLoginModal.value = false;
                await getObject(); // Retry loading object
            } catch (error) {
                loginError.value = error.response?.data?.message || 'Login failed';
                processing.value = false;
            }
        };

        const cancelLogin = () => {
            showLoginModal.value = false;
            router.push({ name: 'dashboard' });
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
                alert(t('Changes saved successfully'));
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
            getObject();
        });

        watch(() => route.params.uid, (newParam, oldParam) => {
            if (newParam !== oldParam) {
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
            showLoginModal,
            loginForm,
            loginError,
            processing,
            handleLogin,
            cancelLogin
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
