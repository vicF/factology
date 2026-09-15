<!-- resources/js/components/Register.vue -->
<template>
    <div class="container my-5">
        <div class="row justify-content-center">
            <div class="col-12 col-md-8 col-lg-6 col-xl-5">
                <div class="card shadow-sm">
                    <div class="card-body p-4 p-md-5">
                        <h1 class="text-center mb-4">{{ $t('Register') }}</h1>
                        <hr class="mb-4"/>

                        <!-- Sign-up method tabs -->
                        <ul class="nav nav-pills nav-justified mb-3" data-testid="register-method-tabs">
                            <li class="nav-item">
                                <button type="button" class="nav-link" :class="{ active: mode === 'email' }" @click="mode = 'email'" data-testid="tab-email">
                                    {{ $t('Email') }}
                                </button>
                            </li>
                            <li class="nav-item">
                                <button type="button" class="nav-link" :class="{ active: mode === 'identity' }" @click="mode = 'identity'" data-testid="tab-identity">
                                    {{ $t('Identity') }}
                                </button>
                            </li>
                        </ul>

                        <!-- ─── Email tab (original registration) ─── -->
                        <form v-if="mode === 'email'" @submit.prevent="register" class="row" data-testid="register-form">
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
                                    :placeholder="$t('Enter name')"
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
                                    :placeholder="$t('Enter Email')"
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
                                    :placeholder="$t('Enter Password')"
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
                                    :placeholder="$t('Confirm Password')"
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

                        <!-- ─── Identity tab ─── -->
                        <div v-else data-testid="identity-register-panel">
                            <p class="text-muted text-center mb-3">
                                Create an account using only your identity file — no email, no password, no personal data.
                                Your identity is an Ed25519 keypair stored in a passphrase-protected file on your device.
                            </p>

                            <!-- Step 1: Identity selection / creation -->
                            <template v-if="regStep === 'select'">
                                <div v-if="identityStore.unlocked" class="alert alert-success text-center" data-testid="identity-unlocked">
                                    Using identity: <strong>{{ identityStore.identity?.name }}</strong>
                                </div>

                                <div v-if="!identityStore.unlocked" class="mb-3">
                                    <!-- Create new identity -->
                                    <label class="font-weight-bold mb-2">Create a new identity</label>
                                    <div class="form-group mb-2">
                                        <input type="text" class="form-control" v-model="identityName" placeholder="Display name (optional)" data-testid="identity-name" />
                                    </div>
                                    <div class="form-group mb-2">
                                        <input type="password" class="form-control" v-model="identityPassphrase" placeholder="Passphrase to protect your identity file" autocomplete="new-password" data-testid="identity-passphrase" />
                                    </div>
                                    <div class="form-group mb-3">
                                        <input type="password" class="form-control" v-model="identityPassphraseConfirm" placeholder="Confirm passphrase" autocomplete="new-password" data-testid="identity-passphrase-confirm" />
                                    </div>
                                    <div class="d-grid gap-2">
                                        <button type="button" class="btn btn-outline-primary" @click="createIdentity" :disabled="creating || !identityPassphrase" data-testid="create-identity-btn">
                                            {{ creating ? $t('Please wait') : 'Create identity' }}
                                        </button>
                                    </div>
                                    <hr class="my-3" />
                                    <!-- Or unlock existing -->
                                    <div class="d-grid gap-2">
                                        <button type="button" class="btn btn-outline-secondary" @click="triggerUnlock" data-testid="unlock-identity-btn">
                                            Unlock existing stored identity
                                        </button>
                                    </div>
                                </div>

                                <!-- Proceed to register with unlocked identity -->
                                <div v-if="identityStore.unlocked" class="d-grid gap-2">
                                    <button type="button" class="btn btn-primary" @click="startRegistration" data-testid="register-with-identity-btn">
                                        Register with this identity
                                    </button>
                                    <button type="button" class="btn btn-outline-secondary" @click="identityStore.lockAll()" data-testid="lock-identity-btn">
                                        Use a different identity
                                    </button>
                                </div>

                                <div v-if="identityError" class="alert alert-danger mt-3">{{ identityError }}</div>
                            </template>

                            <!-- Step 2: Signing challenge -->
                            <template v-if="regStep === 'signing'">
                                <div class="text-center">
                                    <div class="spinner-border text-primary mb-3" role="status"></div>
                                    <p class="text-muted">Signing challenge and registering with server...</p>
                                </div>
                            </template>

                            <!-- Step 3: Success / download -->
                            <template v-if="regStep === 'success'">
                                <div class="alert alert-success text-center" data-testid="register-success">
                                    <strong>{{ $t('Registration complete!') }}</strong>
                                </div>
                                <div class="d-grid gap-2">
                                    <button type="button" class="btn btn-primary" @click="downloadIdentityFile" data-testid="download-identity-btn">
                                        Download identity file
                                    </button>
                                    <button type="button" class="btn btn-outline-secondary" @click="goHome" data-testid="go-home-btn">
                                        Go to app
                                    </button>
                                </div>
                                <p class="text-muted small mt-3 text-center">
                                    Download your identity file now. Without it you cannot log in again.
                                    Keep it safe and remember your passphrase.
                                </p>
                            </template>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Legal Document Modal (email registration) -->
        <div v-if="showLegalModal" class="modal d-block" tabindex="-1" style="background-color: rgba(0,0,0,0.5);">
            <div class="modal-dialog modal-lg modal-dialog-scrollable">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">{{ legalDocTitle }}</h5>
                        <button type="button" class="close" @click="showLegalModal = false" :aria-label="$t('Close')">
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
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useIdentityStore } from '../stores/identity';
import { signBytes } from '@factology/engine/identity/identity.js';
import axios from 'axios';
import { useI18n } from 'vue-i18n';

const router = useRouter();
const authStore = useAuthStore();
const identityStore = useIdentityStore();
const { t } = useI18n();

// Email registration state
const mode = ref('email');
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

// Identity registration state
const regStep = ref('select'); // 'select' | 'signing' | 'success'
const creating = ref(false);
const identityError = ref('');
const pendingChallenge = ref(null);
const createdIdentityFile = ref(null);
const identityName = ref('');
const identityPassphrase = ref('');
const identityPassphraseConfirm = ref('');

// ─── Email registration ───

const register = async () => {
    processing.value = true;
    validationErrors.value = {};

    try {
        const response = await axios.post('/register', {
            ...user.value,
            accepted_terms: acceptedTerms.value ? 1 : 0,
            accepted_privacy: acceptedPrivacy.value ? 1 : 0,
        });

        const authenticatedUser = response.data.user || response.data || {
            name: user.value.name,
            email: user.value.email
        };

        authStore.login(authenticatedUser, response.data.token);

        if (response.data.token) {
            localStorage.setItem('auth_token', response.data.token);
            axios.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
        }

        await router.push('/');

    } catch (error) {
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
    }
};

// ─── Identity registration ───

const createIdentity = async () => {
    if (identityPassphrase.value !== identityPassphraseConfirm.value) {
        identityError.value = 'Passphrases do not match';
        return;
    }
    if (!identityPassphrase.value || identityPassphrase.value.length < 4) {
        identityError.value = 'Passphrase must be at least 4 characters';
        return;
    }

    creating.value = true;
    identityError.value = '';

    try {
        const name = identityName.value.trim() || undefined;
        await identityStore.createAndSave({
            name,
            passphrase: identityPassphrase.value,
        });
    } catch (e) {
        identityError.value = e.message || 'Failed to create identity';
    } finally {
        creating.value = false;
    }
};

const triggerUnlock = async () => {
    identityError.value = '';
    try {
        // Show the identity store's unlock prompt (modal or file-picker)
        await identityStore.unlock();
    } catch (e) {
        identityError.value = e?.message || 'Failed to unlock identity';
    }
};

const startRegistration = async () => {
    regStep.value = 'signing';
    identityError.value = '';

    try {
        const active = identityStore.identity;
        if (!active || !active.publicKey || !active.secretKey) {
            throw new Error('No unlocked identity available');
        }

        // 1. Initiate registration with public key only
        const publicKeyStr = active.file?.public_key?.replace(/=+$/, '');
        if (!publicKeyStr) {
            throw new Error('No public key in identity file');
        }

        const { data: challengeData } = await axios.post('/identity/register', {
            public_key: publicKeyStr,
        });

        pendingChallenge.value = challengeData;

        // 2. Sign the challenge (Uint8Array)
        const signature = await signBytes(
            challengeData.challenge,
            active.secretKey,
        );

        // 3. Complete registration
        const { data: regData } = await axios.post('/identity/register-complete', {
            public_key: publicKeyStr,
            challenge: challengeData.challenge,
            signature,
            name: active.name || undefined,
            thing_id: active.file?.thing_id || undefined,
        });

        // 4. Set auth state
        authStore.login(regData.user, regData.token);
        if (regData.token) {
            localStorage.setItem('auth_token', regData.token);
            axios.defaults.headers.common['Authorization'] = `Bearer ${regData.token}`;
        }

        // 5. Reference the identity's file for download
        createdIdentityFile.value = active.file;

        regStep.value = 'success';
    } catch (error) {
        identityError.value = error.response?.data?.message || error.message || 'Registration failed';
        regStep.value = 'select';
    }
};

const downloadIdentityFile = () => {
    if (!createdIdentityFile.value) return;

    const blob = new Blob([JSON.stringify(createdIdentityFile.value, null, 2)], {
        type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `identity-${createdIdentityFile.value.thing_id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

const goHome = async () => {
    await router.push('/');
};

defineOptions({
    name: 'Register'
});
</script>