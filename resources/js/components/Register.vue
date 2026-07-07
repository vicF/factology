<!-- resources/js/components/Register.vue -->
<template>
    <div class="container my-5">
        <div class="row justify-content-center">
            <div class="col-12 col-md-8 col-lg-6 col-xl-5">
                <div class="card shadow-sm">
                    <div class="card-body p-4 p-md-5">
                        <h1 class="text-center mb-4">{{ $t('Register') }}</h1>
                        <hr class="mb-4"/>
                        <form @submit.prevent="register" class="row" data-testid="register-form">
                            <div class="col-12" v-if="Object.keys(validationErrors).length > 0">
                                <div class="alert alert-danger" data-testid="register-error-alert">
                                    <ul class="mb-0">
                                        <li v-for="(value, key) in validationErrors" :key="key">{{ value[0] }}</li>
                                    </ul>
                                </div>
                            </div>
                            <div class="form-group col-12 mb-3">
                                <label for="name" class="font-weight-bold">{{ $t('Name') }}</label>
                                <input
                                    type="text"
                                    name="name"
                                    v-model="user.name"
                                    id="name"
                                    placeholder="Enter name"
                                    class="form-control"
                                    autocomplete="name"
                                    required
                                    data-testid="register-name"
                                >
                            </div>
                            <div class="form-group col-12 mb-3">
                                <label for="email" class="font-weight-bold">{{ $t('Email') }}</label>
                                <input
                                    type="email"
                                    name="email"
                                    v-model="user.email"
                                    id="email"
                                    placeholder="Enter Email"
                                    class="form-control"
                                    autocomplete="email"
                                    required
                                    data-testid="register-email"
                                >
                            </div>
                            <div class="form-group col-12 mb-3">
                                <label for="password" class="font-weight-bold">{{ $t('Password') }}</label>
                                <input
                                    type="password"
                                    name="password"
                                    v-model="user.password"
                                    id="password"
                                    placeholder="Enter Password"
                                    class="form-control"
                                    autocomplete="new-password"
                                    required
                                    data-testid="register-password"
                                >
                            </div>
                            <div class="form-group col-12 mb-4">
                                <label for="password_confirmation" class="font-weight-bold">{{ $t('Confirm Password') }}</label>
                                <input
                                    type="password"
                                    name="password_confirmation"
                                    v-model="user.password_confirmation"
                                    id="password_confirmation"
                                    placeholder="Confirm Password"
                                    class="form-control"
                                    autocomplete="new-password"
                                    required
                                    data-testid="register-password-confirmation"
                                >
                            </div>
                            <div class="form-group col-12 mb-3">
                                <div class="form-check">
                                    <input type="checkbox" v-model="acceptedTerms" id="accepted_terms" class="form-check-input" required data-testid="register-accepted-terms">
                                    <label class="form-check-label" for="accepted_terms">
                                        {{ $t('I accept the') }}
                                        <a href="#" @click.prevent="openLegalDocument('terms')" target="_blank">{{ $t('Terms of Service') }}</a>
                                    </label>
                                </div>
                                <div class="form-check">
                                    <input type="checkbox" v-model="acceptedPrivacy" id="accepted_privacy" class="form-check-input" required data-testid="register-accepted-privacy">
                                    <label class="form-check-label" for="accepted_privacy">
                                        {{ $t('I consent to the') }}
                                        <a href="#" @click.prevent="openLegalDocument('privacy')" target="_blank">{{ $t('Privacy Policy') }}</a>
                                        {{ $t('and agree to the processing of my personal data') }}
                                    </label>
                                </div>
                                <div v-if="legalDocError" class="text-danger small mt-1">{{ legalDocError }}</div>
                            </div>
                            <div class="col-12 mb-3">
                                <button type="submit" :disabled="processing || !acceptedTerms || !acceptedPrivacy" class="btn btn-primary btn-block w-100" data-testid="register-submit-btn">
                                    {{ processing ? $t('Please wait') : $t('Register') }}
                                </button>
                            </div>
                            <div class="col-12 text-center">
                                <label>{{ $t('Already have an account?') }}
                                    <router-link :to="{name: 'login'}" data-testid="login-link-from-register">{{ $t('Log in Now!') }}</router-link>
                                </label>
                            </div>
                        </form>

                        <!-- Legal Document Modal -->
                        <div v-if="showLegalModal" class="modal d-block" tabindex="-1" style="background-color: rgba(0,0,0,0.5);">
                            <div class="modal-dialog modal-lg modal-dialog-scrollable">
                                <div class="modal-content">
                                    <div class="modal-header">
                                        <h5 class="modal-title">{{ legalDocTitle }}</h5>
                                        <button type="button" class="close" @click="showLegalModal = false" aria-label="Close">
                                            <span aria-hidden="true">&times;</span>
                                        </button>
                                    </div>
                                    <div class="modal-body" v-html="legalDocContent"></div>
                                    <div class="modal-footer">
                                        <button type="button" class="btn btn-secondary" @click="showLegalModal = false">{{ $t('Close') }}</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import axios from 'axios';
import { useI18n } from 'vue-i18n';

const router = useRouter();
const authStore = useAuthStore();
const { t } = useI18n();

const user = ref({
    name: '',
    email: '',
    password: '',
    password_confirmation: ''
});

const acceptedTerms = ref(false);
const acceptedPrivacy = ref(false);
const showLegalModal = ref(false);
const legalDocContent = ref('');
const legalDocTitle = ref('');
const legalDocError = ref('');

const validationErrors = ref({});
const processing = ref(false);

const register = async () => {
    processing.value = true;
    validationErrors.value = {};

    try {
        console.log('Starting registration process');

        // ORIGINAL FUNCTIONALITY - Keep exactly as it was
        const response = await axios.post('/register', {
            ...user.value,
            accepted_terms: acceptedTerms.value ? 1 : 0,
            accepted_privacy: acceptedPrivacy.value ? 1 : 0,
        });

        console.log('Registration response:', response.data);

        // ORIGINAL: Extract authenticated user from Laravel response
        const authenticatedUser = response.data.user || response.data || {
            name: user.value.name,
            email: user.value.email
        };

        // ORIGINAL: Update Pinia auth store with login method
        authStore.login(authenticatedUser, response.data.token);

        console.log('User logged in locally:', authenticatedUser.name);

        // ORIGINAL: If backend returns token, store it and set Authorization header
        if (response.data.token) {
            localStorage.setItem('auth_token', response.data.token);
            axios.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
        }

        // ORIGINAL: Redirect to home
        console.log('Redirecting to home');
        await router.push('/');

    } catch (error) {
        console.error('Registration failed:', error);

        if (error.response?.status === 422) {
            validationErrors.value = error.response.data.errors || {};
        } else {
            alert(error.response?.data?.message || 'An error occurred during registration.');
        }
    } finally {
        processing.value = false;
    }
};

const openLegalDocument = async (type) => {
    try {
        legalDocError.value = '';
        const locale = localStorage.getItem('locale') || 'en';
        const response = await axios.get(`/legal/${type}`, {
            params: { locale }
        });
        legalDocTitle.value = response.data.title;
        legalDocContent.value = response.data.content;
        showLegalModal.value = true;
    } catch (error) {
        legalDocError.value = t('Failed to load document');
        console.error('Failed to load legal document:', error);
    }
};

defineOptions({
    name: 'Register'
});
</script>
