<!-- resources/js/components/InviteClaim.vue -->
<template>
    <div class="container my-5">
        <div class="row justify-content-center">
            <div class="col-12 col-md-8 col-lg-6 col-xl-5">
                <div class="card shadow-sm">
                    <div class="card-body p-4 p-md-5">
                        <h1 class="text-center mb-4">Claim Invitation</h1>
                        <hr class="mb-4"/>

                        <!-- Error -->
                        <div v-if="error" class="alert alert-danger" data-testid="claim-error">
                            {{ error }}
                        </div>

                        <!-- Loading / validating token -->
                        <div v-if="step === 'loading'" class="text-center">
                            <div class="spinner-border text-primary mb-3" role="status"></div>
                            <p class="text-muted">Validating invitation...</p>
                        </div>

                        <!-- Identity selection -->
                        <div v-else-if="step === 'select'" data-testid="claim-select-panel">
                            <p class="text-muted text-center mb-3">
                                You have been invited to join. Claim your account using your identity file.
                            </p>

                            <div v-if="identityStore.unlocked" class="alert alert-success text-center" data-testid="claim-identity-status">
                                Using identity: <strong>{{ identityStore.identity?.name }}</strong>
                            </div>

                            <div v-if="!identityStore.unlocked" class="mb-3">
                                <label class="font-weight-bold mb-2">Create a new identity</label>
                                <div class="form-group mb-2">
                                    <input type="text" class="form-control" v-model="identityName" placeholder="Display name (optional)" data-testid="claim-identity-name" />
                                </div>
                                <div class="form-group mb-2">
                                    <input type="password" class="form-control" v-model="identityPassphrase" placeholder="Passphrase" autocomplete="new-password" data-testid="claim-passphrase" />
                                </div>
                                <div class="form-group mb-3">
                                    <input type="password" class="form-control" v-model="identityPassphraseConfirm" placeholder="Confirm passphrase" autocomplete="new-password" data-testid="claim-passphrase-confirm" />
                                </div>
                                <div class="d-grid gap-2 mb-3">
                                    <button type="button" class="btn btn-outline-primary" @click="createIdentity" :disabled="creating || !identityPassphrase" data-testid="claim-create-btn">
                                        {{ creating ? 'Please wait...' : 'Create identity' }}
                                    </button>
                                </div>
                                <hr class="my-3" />
                                <div class="d-grid gap-2">
                                    <button type="button" class="btn btn-outline-secondary" @click="triggerUnlock" data-testid="claim-unlock-btn">
                                        Unlock existing stored identity
                                    </button>
                                </div>
                            </div>

                            <div v-if="identityStore.unlocked" class="d-grid gap-2 mt-3">
                                <button type="button" class="btn btn-primary" @click="claimInvitation" :disabled="claiming" data-testid="claim-submit-btn">
                                    {{ claiming ? 'Claiming...' : 'Claim invitation' }}
                                </button>
                                <button type="button" class="btn btn-outline-secondary" @click="identityStore.lockAll()">
                                    Use a different identity
                                </button>
                            </div>
                        </div>

                        <!-- Signing -->
                        <div v-else-if="step === 'signing'" class="text-center">
                            <div class="spinner-border text-primary mb-3" role="status"></div>
                            <p class="text-muted">Signing challenge and claiming invitation...</p>
                        </div>

                        <!-- Success -->
                        <div v-else-if="step === 'success'" class="text-center">
                            <div class="alert alert-success" data-testid="claim-success">
                                <strong>Invitation claimed!</strong>
                            </div>
                            <p class="text-muted">Your account has been created. You are now logged in.</p>
                            <button type="button" class="btn btn-primary" @click="goHome" data-testid="claim-go-home">
                                Go to app
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useIdentityStore } from '../stores/identity';
import { signBytes } from '@factology/engine/identity/identity.js';
import axios from 'axios';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const identityStore = useIdentityStore();

const step = ref('loading');
const error = ref('');
const token = ref('');
const claiming = ref(false);
const creating = ref(false);
const identityName = ref('');
const identityPassphrase = ref('');
const identityPassphraseConfirm = ref('');

onMounted(() => {
    token.value = route.params.token || route.query.token || '';
    if (!token.value) {
        error.value = 'Invalid invitation link. No token provided.';
        step.value = 'select';
        return;
    }
    step.value = 'select';
});

const createIdentity = async () => {
    if (identityPassphrase.value !== identityPassphraseConfirm.value) {
        error.value = 'Passphrases do not match';
        return;
    }
    if (!identityPassphrase.value || identityPassphrase.value.length < 4) {
        error.value = 'Passphrase must be at least 4 characters';
        return;
    }

    creating.value = true;
    error.value = '';
    try {
        const name = identityName.value.trim() || undefined;
        await identityStore.createAndSave({
            name,
            passphrase: identityPassphrase.value,
        });
    } catch (e) {
        error.value = e.message || 'Failed to create identity';
    } finally {
        creating.value = false;
    }
};

const triggerUnlock = async () => {
    error.value = '';
    try {
        await identityStore.unlock();
    } catch (e) {
        error.value = e?.message || 'Failed to unlock identity';
    }
};

const claimInvitation = async () => {
    claiming.value = true;
    error.value = '';
    step.value = 'signing';

    try {
        const active = identityStore.identity;
        if (!active || !active.publicKey || !active.secretKey) {
            throw new Error('No unlocked identity');
        }

        // Use the base64url string from the identity file, strip trailing = for server
        const publicKeyB64 = (active.file?.public_key ?? '').replace(/=+$/, '');

        // 1. Claim challenge
        const { data: challengeData } = await axios.post('/invitations/claim-challenge', {
            token: token.value,
            public_key: publicKeyB64,
        });

        // 2. Sign the challenge
        const signature = await signBytes(challengeData.challenge, active.secretKey);

        // 3. Complete the claim
        const { data: claimData } = await axios.post('/invitations/claim-complete', {
            token: token.value,
            public_key: publicKeyB64,
            challenge: challengeData.challenge,
            signature,
            name: active.name || undefined,
        });

        // 4. Set auth state
        authStore.login(claimData.user, claimData.token);
        if (claimData.token) {
            localStorage.setItem('auth_token', claimData.token);
            axios.defaults.headers.common['Authorization'] = `Bearer ${claimData.token}`;
        }

        step.value = 'success';
    } catch (e) {
        error.value = e.response?.data?.message || e.message || 'Failed to claim invitation';
        step.value = 'select';
    } finally {
        claiming.value = false;
    }
};

const goHome = () => {
    router.push('/');
};

defineOptions({
    name: 'InviteClaim'
});
</script>