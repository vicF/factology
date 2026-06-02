<template>
    <div class="container d-flex justify-content-center align-items-start min-vh-100 py-4">
        <div class="col-12 col-md-6">
            <div class="card shadow-sm">
                <div class="card-body">
                    <h1 class="text-center">{{ $t('Log in') }}</h1>
                    <hr/>

                    <form @submit.prevent="login" class="row" data-testid="login-form">
                        <div class="col-12" v-if="Object.keys(validationErrors).length > 0">
                            <div class="alert alert-danger">
                                <ul class="mb-0">
                                    <li v-for="(value, key) in validationErrors" :key="key">{{ value[0] }}</li>
                                </ul>
                            </div>
                        </div>

                        <div class="form-group col-12">
                            <label for="email" class="font-weight-bold">{{ $t('Email') }}</label>
                            <input type="email" v-model="auth.email" name="email" id="email" class="form-control" required autocomplete="email" data-testid="login-email">
                        </div>

                        <div class="form-group col-12 my-2">
                            <label for="password" class="font-weight-bold">{{ $t('Password') }}</label>
                            <input type="password" v-model="auth.password" name="password" id="password" class="form-control" required autocomplete="current-password" data-testid="login-password">
                        </div>

                        <div class="col-12 mb-2 d-flex gap-2">
                            <button type="submit" :disabled="processing" class="btn btn-primary flex-fill" data-testid="login-submit-btn">
                                {{ processing ? $t('Please wait') : $t('Log in') }}
                            </button>
                            <button type="button" class="btn btn-secondary flex-fill" @click="cancel" data-testid="login-cancel-btn">
                                {{ $t('Cancel') }}
                            </button>
                        </div>

                        <div class="col-12 text-center">
                            <label>{{ $t('Don\'t have an account?') }} <router-link :to="{name:'register'}" data-testid="register-link-from-login">{{ $t('Register Now!') }}</router-link></label>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import axios from 'axios';
import { useAuthStore } from '../stores/auth';

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

const login = async () => {
    processing.value = true;
    validationErrors.value = {};

    try {
        const response = await axios.post('/login', auth);

        authStore.login(response.data.user, response.data.token);

        const redirectTo = route.query.redirect || '/';
        console.debug('await router.push(redirectTo);');
        await router.push(redirectTo);

    } catch (error) {
        if (error.response?.status === 422) {
            validationErrors.value = error.response.data.errors;
        } else {
            console.error('Login failed:', error);
            alert(t('Login failed'));
        }
    } finally {
        processing.value = false;
    }
};

const cancel = () => {
    router.push({name: 'dashboard'});
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
