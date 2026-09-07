<template>
    <div class="container py-4">
        <h1 class="mb-3">Identity</h1>

        <p class="text-muted">
            Your identity is a keypair. A passphrase-protected identity file lets you use the same
            identity (same owner uuid) on all your apps: generate it here, then import the file on
            your mobile or desktop app.
        </p>

        <!-- Current identity status -->
        <div v-if="identityStore.unlocked && identityStore.identity" class="card mb-4 shadow-sm">
            <div class="card-body">
                <h5 class="card-title">
                    <span class="badge bg-success me-2">Unlocked</span> {{ identityStore.identity.name }}
                </h5>
                <div class="small text-muted mb-2">Owner uuid (thing_id): <code>{{ identityStore.identity.thingId }}</code></div>
                <div class="small text-muted mb-3">Public key: <code class="text-break">{{ identityStore.identity.file.public_key }}</code></div>
                <div class="d-flex gap-2 align-items-center flex-wrap">
                    <button class="btn btn-outline-secondary btn-sm" @click="identityStore.lock()">Lock this device</button>
                    <button
                        v-if="canConnectIdentity"
                        class="btn btn-outline-primary btn-sm"
                        :disabled="bindingIdentity"
                        @click="connectIdentityToAccount"
                        data-testid="connect-identity-btn"
                    >
                        {{ bindingIdentity ? 'Please wait…' : 'Connect to this account' }}
                    </button>
                    <span v-if="identityConnected" class="small text-success" data-testid="identity-connected-hint">
                        Connected — you can now sign in with this identity file.
                    </span>
                </div>
            </div>
        </div>
        <div v-else-if="identityStore.identityFile" class="alert alert-warning">
            An identity file is stored but locked. <a href="#" @click.prevent="mode = 'unlock'">Unlock it</a>.
        </div>

        <div v-if="message" :class="['alert', messageType === 'error' ? 'alert-danger' : 'alert-success']" class="mt-2">
            <ul class="mb-0">
                <li v-for="(line, i) in messageLines" :key="i">{{ line }}</li>
            </ul>
        </div>

        <!-- Data import (needs an unlocked identity to determine ownership) -->
        <div v-if="identityStore.unlocked && identityStore.identity" class="card mb-4 shadow-sm" data-testid="data-import-panel">
            <div class="card-body">
                <h5 class="card-title">Import my data</h5>
                <p class="small text-muted">
                    Import the export file from your web app (Search page → Export) into this device.
                    Only objects owned by your identity are imported; everything else is skipped and reported.
                </p>
                <form @submit.prevent="importData">
                    <div class="mb-3">
                        <input type="file" class="form-control" accept="application/json,.json" @change="onDataFileChange" data-testid="data-file" />
                    </div>
                    <button type="submit" class="btn btn-primary" :disabled="dataImporting || !dataFile" data-testid="data-import-submit">
                        {{ dataImporting ? 'Please wait…' : 'Import data' }}
                    </button>
                </form>
                <div v-if="dataReport" class="mt-3">
                    <div :class="['alert', dataReport.errors.length ? 'alert-warning' : 'alert-success']" class="mb-0" data-testid="data-import-report">
                        <ul class="mb-0">
                            <li>{{ dataReport.imported }} objects imported</li>
                            <li>{{ dataReport.importedLinks }} links imported</li>
                            <li>{{ dataReport.skippedExisting }} already present</li>
                            <li>{{ dataReport.skippedNotYours }} not owned by you — skipped</li>
                            <li v-for="(err, i) in dataReport.errors" :key="i" class="text-danger">{{ err }}</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>

        <div v-if="mnemonic" class="card mb-4 shadow-sm border-warning">
            <div class="card-body">
                <h5 class="card-title text-warning">Backup phrase — write it down now</h5>
                <p class="small">
                    This 24-word phrase is the only way to restore your identity if you lose the file or
                    forget the passphrase. Anyone who has it controls your identity. Store it offline.
                </p>
                <div class="d-flex gap-2">
                    <textarea class="form-control font-monospace" :value="mnemonic" rows="3" readonly data-testid="mnemonic"></textarea>
                    <button class="btn btn-outline-secondary flex-shrink-0" @click="copyMnemonic" data-testid="copy-mnemonic">Copy</button>
                </div>
            </div>
        </div>

        <!-- Action tabs -->
        <ul class="nav nav-tabs mb-3">
            <li class="nav-item">
                <button class="nav-link" :class="{ active: mode === 'create' }" @click="mode = 'create'" data-testid="tab-create">Create identity</button>
            </li>
            <li class="nav-item">
                <button class="nav-link" :class="{ active: mode === 'import' }" @click="mode = 'import'" data-testid="tab-import">Import identity file</button>
            </li>
            <li class="nav-item" v-if="identityStore.identityFile">
                <button class="nav-link" :class="{ active: mode === 'unlock' }" @click="mode = 'unlock'" data-testid="tab-unlock">Unlock</button>
            </li>
        </ul>

        <!-- Create -->
        <div v-if="mode === 'create'" class="card shadow-sm" data-testid="create-panel">
            <div class="card-body">
                <p v-if="authStore.user?.thing_id" class="small text-muted">
                    Binds your current account ({{ authStore.user?.name }},
                    <code>{{ authStore.user?.thing_id }}</code>) to a fresh keypair — your existing
                    objects keep their owner.
                </p>
                <p v-else class="small text-muted">
                    No account here — a fresh self-sovereign identity is created and its owner uuid is
                    derived from your public key. Import this file into any other app of yours to use
                    the same identity there.
                </p>
                <form @submit.prevent="create">
                    <div class="mb-3">
                        <label class="form-label fw-semibold">Name</label>
                        <input type="text" class="form-control" v-model="name" data-testid="create-name" placeholder="Your name" />
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-semibold">Passphrase (protects the file)</label>
                        <input type="password" class="form-control" v-model="passphrase" autocomplete="new-password" data-testid="create-passphrase" />
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-semibold">Repeat passphrase</label>
                        <input type="password" class="form-control" v-model="passphrase2" autocomplete="new-password" data-testid="create-passphrase2" />
                    </div>
                    <button type="submit" class="btn btn-primary" :disabled="creating" data-testid="create-submit">
                        {{ creating ? 'Please wait…' : 'Generate identity' }}
                    </button>
                </form>
            </div>
        </div>

        <!-- Import -->
        <div v-if="mode === 'import'" class="card shadow-sm" data-testid="import-panel">
            <div class="card-body">
                <form @submit.prevent="importFile">
                    <div class="mb-3">
                        <label class="form-label fw-semibold">Identity file</label>
                        <input type="file" class="form-control" accept="application/json,.json" @change="onFileChange" data-testid="import-file" />
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-semibold">Passphrase</label>
                        <input type="password" class="form-control" v-model="passphrase" autocomplete="current-password" data-testid="import-passphrase" />
                    </div>
                    <button type="submit" class="btn btn-primary" :disabled="importing || !selectedFile" data-testid="import-submit">
                        {{ importing ? 'Please wait…' : 'Import identity' }}
                    </button>
                </form>
            </div>
        </div>

        <!-- Unlock -->
        <div v-if="mode === 'unlock'" class="card shadow-sm" data-testid="unlock-panel">
            <div class="card-body">
                <form @submit.prevent="unlock">
                    <div class="mb-3">
                        <label class="form-label fw-semibold">Passphrase</label>
                        <input type="password" class="form-control" v-model="passphrase" autocomplete="current-password" data-testid="unlock-passphrase" />
                    </div>
                    <button type="submit" class="btn btn-primary" :disabled="unlocking" data-testid="unlock-submit">
                        {{ unlocking ? 'Please wait…' : 'Unlock' }}
                    </button>
                </form>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import { useAuthStore } from '../stores/auth';
import { useIdentityStore } from '../stores/identity';
import { signBytes } from '../identity/identity';
import { importExportData } from '../localDb/importData';

const authStore = useAuthStore();
const identityStore = useIdentityStore();

const mode = ref('create');
const name = ref(authStore.user?.name || '');
const passphrase = ref('');
const passphrase2 = ref('');
const selectedFile = ref(null);
const creating = ref(false);
const importing = ref(false);
const unlocking = ref(false);
const mnemonic = ref('');
const message = ref('');
const messageType = ref('success');
const dataFile = ref(null);
const dataImporting = ref(false);
const dataReport = ref(null);
const bindingIdentity = ref(false);
const identityConnected = ref(false);

const messageLines = computed(() => (message.value ? message.value.split('\n') : []));

// Only a real server account (numeric id) can bind the public key. Offline /
// guest sessions use a uuid "id" and have no account to bind to.
const canConnectIdentity = computed(() =>
    authStore.authenticated
    && Number.isInteger(authStore.user?.id)
    && !!identityStore.identity?.file?.public_key,
);

function setMessage(text, type = 'success') {
    message.value = text;
    messageType.value = type;
}

function onFileChange(event) {
    selectedFile.value = event.target.files?.[0] || null;
}

async function create() {
    setMessage('');
    if (passphrase.value !== passphrase2.value) {
        setMessage('Passphrases do not match.', 'error');
        return;
    }
    if (!passphrase.value || passphrase.value.length < 8) {
        setMessage('Passphrase must be at least 8 characters.', 'error');
        return;
    }
    creating.value = true;
    try {
        const createdMnemonic = await identityStore.createAndSave({
            thingId: authStore.user?.thing_id,
            name: name.value || 'Identity',
            passphrase: passphrase.value,
            createdBy: 'web',
        });
        mnemonic.value = createdMnemonic;
        setMessage(
            'Identity created and unlocked. Download the identity file below, then import it on your other apps.\nBackup phrase (above): write it down now — it is the only way to restore the identity.',
        );
        passphrase.value = '';
        passphrase2.value = '';
        downloadFile(identityStore.identityFile, `factology-identity-${identityStore.identity.thingId}.json`);
    } catch (error) {
        setMessage(error.message, 'error');
    } finally {
        creating.value = false;
    }
}

async function importFile() {
    setMessage('');
    if (!selectedFile.value) return;
    importing.value = true;
    try {
        const text = await selectedFile.value.text();
        const file = JSON.parse(text);
        const opened = await identityStore.adoptFile(file, passphrase.value);
        setMessage(
            `Identity adopted: ${opened.name} (${opened.thingId}).\n` +
            'Your local owner uuid is now this identity — newly created objects are owned by it.',
        );
        passphrase.value = '';
        selectedFile.value = null;
        mnemonic.value = '';
        mode.value = 'create';
    } catch (error) {
        setMessage(error.message, 'error');
    } finally {
        importing.value = false;
    }
}

async function unlock() {
    setMessage('');
    unlocking.value = true;
    try {
        const opened = await identityStore.unlock(passphrase.value);
        setMessage(`Identity unlocked: ${opened.name} (${opened.thingId}).`);
        passphrase.value = '';
        mode.value = 'create';
    } catch (error) {
        setMessage(error.message, 'error');
    } finally {
        unlocking.value = false;
    }
}

function onDataFileChange(event) {
    dataFile.value = event.target.files?.[0] || null;
}

async function importData() {
    setMessage('');
    if (!dataFile.value) return;
    dataImporting.value = true;
    try {
        const text = await dataFile.value.text();
        const file = JSON.parse(text);
        dataReport.value = await importExportData(file, identityStore.identity.thingId);
        setMessage('Import finished. See the report below.');
    } catch (error) {
        setMessage(error.message, 'error');
    } finally {
        dataImporting.value = false;
    }
}

function copyMnemonic() {
    navigator.clipboard?.writeText(mnemonic.value);
}

/**
 * Register the unlocked identity's public key with the current server account.
 * The server issues a single-use challenge; signing it proves we hold the
 * private key before the key is bound (enables identity-file login).
 */
async function connectIdentityToAccount() {
    setMessage('');
    const identity = identityStore.identity;
    if (!identity?.file?.public_key) {
        setMessage('Unlock an identity first.', 'error');
        return;
    }
    bindingIdentity.value = true;
    identityConnected.value = false;
    try {
        const publicKey = identity.file.public_key;
        const { data: challengeData } = await axios.post('/identity/bind-challenge', { public_key: publicKey });
        const signature = signBytes(challengeData.challenge, identity.secretKey);
        await axios.post('/identity/bind', {
            public_key: publicKey,
            challenge: challengeData.challenge,
            signature,
        });
        identityConnected.value = true;
        setMessage('Identity connected to this account — you can now sign in with the identity file.');
    } catch (error) {
        const detail = error.response?.data?.errors?.public_key?.[0]
            || error.response?.data?.errors?.signature?.[0]
            || error.response?.data?.message
            || error.message;
        setMessage(`Could not connect identity: ${detail}`, 'error');
    } finally {
        bindingIdentity.value = false;
    }
}

onMounted(async () => {
    await identityStore.restore();
    // A stored identity survives restarts — only the keys need re-unlocking.
    if (identityStore.identityFile && !identityStore.unlocked) {
        mode.value = 'unlock';
    }
});

function downloadFile(file, filename) {
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
</script>
