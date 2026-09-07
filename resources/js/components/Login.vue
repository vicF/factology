<template>
    <div class="container d-flex justify-content-center align-items-start min-vh-100 py-4">
        <div class="col-12 col-md-6 d-flex justify-content-center">
            <div class="card shadow-sm">
                <div class="card-body">
                    <h1 class="text-center">{{ $t('Log in') }}</h1>
                    <hr/>

                    <!-- Sign-in method tabs -->
                    <ul class="nav nav-pills nav-justified mb-3" data-testid="login-method-tabs">
                        <li class="nav-item">
                            <button type="button" class="nav-link" :class="{ active: mode === 'password' }" @click="mode = 'password'" data-testid="tab-password">
                                {{ $t('Email') }}
                            </button>
                        </li>
                        <li class="nav-item">
                            <button type="button" class="nav-link" :class="{ active: mode === 'identity' }" @click="mode = 'identity'" data-testid="tab-identity">
                                Identity file
                            </button>
                        </li>
                    </ul>

                    <!-- Shared error area -->
                    <div class="col-12" v-if="Object.keys(validationErrors).length > 0 || identityMessage">
                        <div class="alert alert-danger">
                            <ul class="mb-0">
                                <li v-for="(value, key) in validationErrors" :key="key">{{ value[0] }}</li>
                                <li v-if="identityMessage">{{ identityMessage }}</li>
                            </ul>
                        </div>
                    </div>

                    <!-- Password login -->
                    <form v-if="mode === 'password'" @submit.prevent="login" class="row" data-testid="login-form">
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

                        <div class="col-12 text-center" v-if="registrationEnabled">
                            <label>{{ $t('Don\'t have an account?') }} <router-link :to="{name:'register'}" data-testid="register-link-from-login">{{ $t('Register Now!') }}</router-link></label>
                        </div>
                    </form>

                    <!-- Identity-file login -->
                    <div v-else data-testid="identity-login-panel">
                        <p class="text-muted small">
                            Sign in with the passphrase-protected identity file you generated on the
                            Identity page. The identity must be connected to your account first.
                        </p>
                        <form @submit.prevent="loginWithIdentity" class="row">
                            <div class="form-group col-12">
                                <label class="font-weight-bold">Identity file</label>
                                <input type="file" class="form-control" accept="application/json,.json" @change="onIdentityFileChange" data-testid="identity-file" />
                            </div>
                            <div class="form-group col-12 my-2">
                                <label class="font-weight-bold">Passphrase</label>
                                <input type="password" class="form-control" v-model="identityPassphrase" autocomplete="current-password" placeholder="Identity file passphrase" data-testid="identity-passphrase" />
                            </div>
                            <div class="col-12 mb-2 d-flex gap-2">
                                <button type="submit" :disabled="processing || !selectedIdentityFile" class="btn btn-primary flex-fill" data-testid="identity-login-submit">
                                    {{ processing ? $t('Please wait') : 'Log in with identity file' }}
                                </button>
                                <button type="button" class="btn btn-secondary flex-fill" @click="cancel" data-testid="login-cancel-btn">
                                    {{ $t('Cancel') }}
                                </button>
                            </div>
                        </form>
                    </div>
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
import { storeToRefs } from 'pinia';
import { openIdentityFile, signBytes } from '../identity/identity';

const router = useRouter();
const route = useRoute();
const { t } = useI18n();
const authStore = useAuthStore();
const { registrationEnabled } = storeToRefs(authStore);

const mode = ref('password');

const auth = reactive({
    email: "",
    password: ""
});

const validationErrors = ref({});
const processing = ref(false);

// Identity-file login state
const selectedIdentityFile = ref(null);
const identityPassphrase = ref('');
const identityMessage = ref('');

const onIdentityFileChange = (event) => {
    selectedIdentityFile.value = event.target.files?.[0] || null;
    identityMessage.value = '';
};

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

const loginWithIdentity = async () => {
    processing.value = true;
    validationErrors.value = {};
    identityMessage.value = '';

    try {
        if (!selectedIdentityFile.value) {
            identityMessage.value = 'Choose your identity file.';
            return;
        }
        const file = JSON.parse(await selectedIdentityFile.value.text());
        const opened = await openIdentityFile(file, identityPassphrase.value);
        const publicKey = opened.file.public_key;

        const { data: challengeData } = await axios.post('/identity/challenge', { public_key: publicKey });
        const signature = signBytes(challengeData.challenge, opened.secretKey);

        const response = await axios.post('/identity/login', {
            public_key: publicKey,
            challenge: challengeData.challenge,
            signature,
        });

        authStore.login(response.data.user, response.data.token);
        identityPassphrase.value = '';
        selectedIdentityFile.value = null;

        const redirectTo = route.query.redirect || '/';
        await router.push(redirectTo);
    } catch (error) {
        if (error.response?.status === 422) {
            // Laravel validation errors: prefer the specific field message.
            const errors = error.response.data.errors || {};
            const firstField = Object.values(errors)[0];
            identityMessage.value = Array.isArray(firstField) ? firstField[0] : error.response.data.message;
        } else {
            console.error('Identity login failed:', error);
            identityMessage.value = error.message || t('Login failed');
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
