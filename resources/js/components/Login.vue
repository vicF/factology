<!-- factology/resources/js/components/Login.vue -->
<template>
    <div class="container d-flex justify-content-center align-items-start min-vh-100 py-4">
        <div class="col-12 col-md-6">
            <div class="card shadow-sm">
                <div class="card-body">
                    <h1 class="text-center">{{ $t('Login') }}</h1>
                    <hr/>
                    <form @submit.prevent="login" class="row">
                        <div class="col-12" v-if="Object.keys(validationErrors).length > 0">
                            <div class="alert alert-danger">
                                <ul class="mb-0">
                                    <li v-for="(value, key) in validationErrors" :key="key">{{ value[0] }}</li>
                                </ul>
                            </div>
                        </div>
                        <div class="form-group col-12">
                            <label for="email" class="font-weight-bold">{{ $t('Email') }}</label>
                            <input type="email" v-model="auth.email" name="email" id="email" class="form-control" required>
                        </div>
                        <div class="form-group col-12 my-2">
                            <label for="password" class="font-weight-bold">{{ $t('Password') }}</label>
                            <input type="password" v-model="auth.password" name="password" id="password" class="form-control" required>
                        </div>
                        <div class="col-12 mb-2">
                            <button type="submit" :disabled="processing" class="btn btn-primary btn-block">
                                {{ processing ? $t('Please wait') : $t('Login') }}
                            </button>
                        </div>
                        <div class="col-12 mb-2">
                            <button type="button" class="btn btn-secondary btn-block" @click="cancel">{{ $t('Cancel') }}</button>
                        </div>
                        <div class="col-12 text-center">
                            <label>{{ $t('Don\'t have an account?') }} <router-link :to="{name:'register'}">{{ $t('Register Now!') }}</router-link></label>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import { reactive, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import axios from 'axios';
import { useAuthStore } from '../stores/auth';

export default {
    name: "login",
    setup() {
        const router = useRouter();
        const route = useRoute();
        const { t } = useI18n();
        const authStore = useAuthStore();
        const auth = reactive({
            email: "",
            password: ""
        });
        const validationErrors = ref({});
        const processing = ref(false);

        // Debug route and query
        console.log('Login.vue setup - Route:', route);
        console.log('Login.vue setup - Query:', route.query);
        console.log('Login.vue setup - Redirect:', route.query.redirect);

        const login = async () => {
            processing.value = true;
            try {
                console.log('Fetching CSRF cookie...');
                const csrfResponse = await axios.get('/sanctum/csrf-cookie');
                console.log('CSRF response:', csrfResponse);
                console.log('CSRF cookie fetched, sending login request...');
                const response = await axios.post('/login', auth, {
                    headers: {
                        'Accept': 'application/json',
                        'X-XSRF-TOKEN': getCookie('XSRF-TOKEN')
                    }
                });
                console.log('Login response:', response);
                if (!response.data.user) {
                    throw new Error('User data missing in response');
                }
                if (typeof authStore.login !== 'function') {
                    throw new Error('authStore.login is not a function');
                }
                authStore.login(response.data.user);
                console.log('Login successful, user:', response.data.user);
                console.log('Cookies after login:', document.cookie);

                // Handle redirect
                const redirect = route.query.redirect || '/dashboard';
                console.log('Login.vue login - Redirect value:', redirect);
                if (!redirect) {
                    console.warn('Redirect is empty, defaulting to /dashboard');
                }
                try {
                    console.log('Attempting router.push to:', redirect);
                    await router.push(redirect);
                    console.log('Navigation successful');
                } catch (error) {
                    console.error('Navigation error:', error);
                    window.location.href = redirect;
                }
            } catch (error) {
                console.error('Login error:', {
                    status: error.response?.status,
                    data: error.response?.data,
                    message: error.message,
                    headers: error.response?.headers
                });
                if (error.response?.status === 422) {
                    validationErrors.value = error.response.data.errors;
                } else {
                    validationErrors.value = {};
                    alert(error.message || error.response?.data?.message || t('Login failed'));
                }
            } finally {
                processing.value = false;
            }
        };

        const cancel = () => {
            router.push({ name: 'dashboard' });
        };

        const getCookie = (name) => {
            const value = `; ${document.cookie}`;
            const parts = value.split(`; ${name}=`);
            if (parts.length === 2) return parts.pop().split(';').shift();
            return null;
        };

        return {
            auth,
            validationErrors,
            processing,
            login,
            cancel,
            t
        };
    }
};
</script>

<style scoped>
.min-vh-100 {
    min-height: 100vh;
}
.card {
    max-width: 400px;
    width: 100%;
}
@media (max-height: 600px) {
    .align-items-start {
        align-items: flex-start !important;
    }
    .py-4 {
        padding-top: 1rem !important;
    }
}
</style>
