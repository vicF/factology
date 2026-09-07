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
            <li class="nav-item">
                <button class="nav-link" :class="{ active: mode === 'restore' }" @click="mode = 'restore'" data-testid="tab-restore">Restore from backup phrase</button>
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

        <!-- Restore from backup phrase -->
        <div v-if="mode === 'restore'" class="card shadow-sm" data-testid="restore-panel">
            <div class="card-body">
                <p class="text-muted small">
                    Rebuild your identity from the 24-word backup phrase if you lost the identity file.
                    The rebuilt file has the same public key, so any server that had it connected still
                    recognises it.
                </p>
                <form @submit.prevent="restoreFromMnemonic">
                    <div class="mb-3">
                        <label class="form-label fw-semibold">Backup phrase (24 words)</label>
                        <textarea class="form-control font-monospace" rows="3" v-model="recoverMnemonic" data-testid="restore-mnemonic" placeholder="word1 word2 … word24"></textarea>
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-semibold">Name</label>
                        <input type="text" class="form-control" v-model="name" data-testid="restore-name" placeholder="Your name" />
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-semibold">New passphrase (protects the rebuilt file)</label>
                        <input type="password" class="form-control" v-model="passphrase" autocomplete="new-password" data-testid="restore-passphrase" />
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-semibold">Repeat passphrase</label>
                        <input type="password" class="form-control" v-model="passphrase2" autocomplete="new-password" data-testid="restore-passphrase2" />
                    </div>
                    <button type="submit" class="btn btn-primary" :disabled="recovering" data-testid="restore-submit">
                        {{ recovering ? 'Please wait…' : 'Restore identity' }}
                    </button>
                </form>
            </div>
        </div>

        <!-- Social backup: split the backup phrase between friends -->
        <div class="card mb-4 shadow-sm mt-4" data-testid="social-backup-card">
            <div class="card-body">
                <h5 class="card-title">Backup with friends (optional)</h5>
                <p class="text-muted small">
                    Split your backup phrase into N shares; any K of them rebuild it. Give one share to
                    each of several trusted people/places. If you lose everything, ask any K of them for
                    their shares. Fewer than K shares reveal nothing about the phrase.
                </p>

                <ul class="nav nav-tabs mb-3">
                    <li class="nav-item">
                        <button class="nav-link" :class="{ active: backupMode === 'split' }" @click="backupMode = 'split'" data-testid="tab-shares-split">Split phrase</button>
                    </li>
                    <li class="nav-item">
                        <button class="nav-link" :class="{ active: backupMode === 'combine' }" @click="backupMode = 'combine'" data-testid="tab-shares-combine">Recover from shares</button>
                    </li>
                </ul>

                <template v-if="backupMode === 'split'">
                    <form @submit.prevent="splitBackup">
                        <div class="mb-3">
                            <label class="form-label fw-semibold">Backup phrase to protect</label>
                            <textarea class="form-control font-monospace" rows="2" v-model="sharePhrase" data-testid="share-phrase" placeholder="24 words"></textarea>
                        </div>
                        <div class="row g-2 mb-3">
                            <div class="col-6">
                                <label class="form-label fw-semibold">Total shares (N)</label>
                                <input type="number" class="form-control" min="2" max="255" v-model.number="shareTotal" data-testid="share-total" />
                            </div>
                            <div class="col-6">
                                <label class="form-label fw-semibold">Needed to recover (K)</label>
                                <input type="number" class="form-control" min="2" v-model.number="shareThreshold" data-testid="share-threshold" />
                            </div>
                        </div>
                        <button type="submit" class="btn btn-primary" data-testid="share-split-submit">Split into shares</button>
                    </form>

                    <div v-if="generatedShares.length" class="mt-3">
                        <h6 class="mb-2">Your shares — send one to each friend</h6>
                        <div v-for="(share, i) in generatedShares" :key="i" class="mb-2">
                            <div class="d-flex gap-2 align-items-center">
                                <span class="badge bg-secondary flex-shrink-0">Share {{ i + 1 }}</span>
                                <textarea class="form-control font-monospace form-control-sm" :value="share" rows="2" readonly data-testid="generated-share"></textarea>
                                <button type="button" class="btn btn-outline-secondary btn-sm flex-shrink-0" @click="copyText(share)" data-testid="copy-share">Copy</button>
                            </div>
                        </div>
                    </div>
                </template>

                <template v-else>
                    <form @submit.prevent="recoverFromShares">
                        <div class="mb-3">
                            <label class="form-label fw-semibold">Shares (one per line)</label>
                            <textarea class="form-control font-monospace" rows="5" v-model="shareTexts" data-testid="share-texts" placeholder='Paste each share on its own line'></textarea>
                        </div>
                        <button type="submit" class="btn btn-primary" :disabled="recoveringShares" data-testid="shares-recover-submit">
                            {{ recoveringShares ? 'Please wait…' : 'Recover backup phrase' }}
                        </button>
                    </form>
                    <div v-if="recoveredPhrase" class="mt-3 alert alert-success">
                        <h6 class="text-success">Recovered backup phrase</h6>
                        <textarea class="form-control font-monospace mb-2" :value="recoveredPhrase" rows="2" readonly data-testid="recovered-phrase"></textarea>
                        <button type="button" class="btn btn-outline-success btn-sm" @click="useRecoveredPhrase" data-testid="use-recovered-phrase">
                            Use it to restore my identity
                        </button>
                    </div>
                </template>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import { useAuthStore } from '../stores/auth';
import { useIdentityStore } from '../stores/identity';
import { isValidMnemonic, recoverIdentityFile, signBytes } from '../identity/identity';
import { combineSharesToString, parseShare, serializeShare, splitSecretString } from '../identity/shamir';
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

// Restore from backup phrase
const recoverMnemonic = ref('');
const recovering = ref(false);

// Social backup (Shamir)
const backupMode = ref('split');
const sharePhrase = ref('');
const shareTotal = ref(3);
const shareThreshold = ref(2);
const generatedShares = ref([]);
const shareTexts = ref('');
const recoveringShares = ref(false);
const recoveredPhrase = ref('');

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
 * Rebuild the identity file from the BIP-39 backup phrase and adopt it as the
 * current identity (same key, same public_key — servers/apps that had the key
 * bound still recognise it).
 */
async function restoreFromMnemonic() {
    setMessage('');
    if (passphrase.value !== passphrase2.value) {
        setMessage('Passphrases do not match.', 'error');
        return;
    }
    if (!passphrase.value || passphrase.value.length < 8) {
        setMessage('Passphrase must be at least 8 characters.', 'error');
        return;
    }
    recovering.value = true;
    try {
        const { file } = await recoverIdentityFile({
            mnemonic: recoverMnemonic.value,
            name: name.value || 'Identity',
            passphrase: passphrase.value,
        });
        const opened = await identityStore.adoptFile(file, passphrase.value);
        setMessage(
            `Identity restored: ${opened.name} (${opened.thingId}).\n` +
            'Store this new identity file in a safe place, or split its backup phrase below.',
        );
        passphrase.value = '';
        passphrase2.value = '';
        recoverMnemonic.value = '';
        mode.value = 'create';
    } catch (error) {
        setMessage(error.message, 'error');
    } finally {
        recovering.value = false;
    }
}

function splitBackup() {
    setMessage('');
    const phrase = sharePhrase.value.trim();
    if (!isValidMnemonic(phrase)) {
        setMessage('That does not look like a valid 12/24-word backup phrase.', 'error');
        return;
    }
    const total = Number(shareTotal.value);
    const threshold = Number(shareThreshold.value);
    if (!Number.isInteger(total) || !Number.isInteger(threshold)
        || threshold < 2 || threshold > total || total > 255) {
        setMessage('Shares and threshold must satisfy 2 ≤ threshold ≤ total ≤ 255.', 'error');
        return;
    }
    try {
        generatedShares.value = splitSecretString(phrase, total, threshold).map(serializeShare);
        setMessage(
            `Backup phrase split into ${total} shares — any ${threshold} of them rebuild it. ` +
            'Give exactly one share to each of your trusted people/places. Never send two shares together.',
        );
    } catch (error) {
        setMessage(error.message, 'error');
    }
}

async function recoverFromShares() {
    setMessage('');
    const lines = shareTexts.value.split('\n').map((s) => s.trim()).filter(Boolean);
    if (lines.length < 2) {
        setMessage('Paste at least two shares, one per line.', 'error');
        return;
    }
    recoveringShares.value = true;
    try {
        const phrase = combineSharesToString(lines.map(parseShare));
        recoveredPhrase.value = phrase;
        setMessage('Backup phrase recovered. Use it to restore the identity in the tab above.');
    } catch (error) {
        setMessage(error.message, 'error');
    } finally {
        recoveringShares.value = false;
    }
}

function copyText(text) {
    navigator.clipboard?.writeText(text);
}

function useRecoveredPhrase() {
    recoverMnemonic.value = recoveredPhrase.value;
    recoveredPhrase.value = '';
    mode.value = 'restore';
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
