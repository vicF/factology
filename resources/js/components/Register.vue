<!-- resources/js/components/Register.vue -->
<template>
    <div class="container my-5">
        <div class="row justify-content-center">
            <div class="col-12 col-md-8 col-lg-6 col-xl-5">
                <div class="card shadow-sm">
                    <div class="card-body p-4 p-md-5">
                        <h1 class="text-center mb-4">{{ $t('Register') }}</h1>
                        <hr class="mb-4"/>
                        <form @submit.prevent="register" class="row">
                            <div class="col-12" v-if="Object.keys(validationErrors).length > 0">
                                <div class="alert alert-danger">
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
                                >
                            </div>
                            <div class="col-12 mb-3">
                                <button type="submit" :disabled="processing" class="btn btn-primary btn-block w-100">
                                    {{ processing ? $t('Please wait') : $t('Register') }}
                                </button>
                            </div>
                            <div class="col-12 text-center">
                                <label>{{ $t('Already have an account?') }}
                                    <router-link :to="{name: 'login'}">{{ $t('Log in Now!') }}</router-link>
                                </label>
                            </div>
                        </form>
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

const validationErrors = ref({});
const processing = ref(false);

const register = async () => {
    processing.value = true;
    validationErrors.value = {};

    try {
        console.log('Starting registration process');

        // ORIGINAL FUNCTIONALITY - Keep exactly as it was
        const response = await axios.post('/register', user.value);

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

defineOptions({
    name: 'Register'
});
</script>
