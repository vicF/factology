<template>
    <div class="container py-4">
        <h1 class="mb-3">Identity</h1>

        <p class="text-muted">
            Your identity is a keypair. A passphrase-protected identity file lets you use the same
            identity (same owner uuid) on all your apps: generate it here, then import the file on
            your mobile or desktop app. Only data owned by identities you have <em>unlocked</em> is
            visible — locking an identity hides its rows.
        </p>

        <!-- Current status -->
        <div v-if="identityStore.unlocked && identityStore.primary" class="card mb-4 shadow-sm">
            <div class="card-body">
                <h5 class="card-title">
                    <span class="badge bg-success me-2">Unlocked</span> {{ identityStore.primary.name }}
                </h5>
                <div class="small text-muted mb-2">Owner uuid (thing_id): <code>{{ identityStore.primary.thingId }}</code></div>
                <div class="small text-muted mb-3">Public key: <code class="text-break">{{ identityStore.primary.file.public_key }}</code></div>
                <div class="small mb-3" v-if="identityStore.items.length > 1">
                    Multiple identities unlocked: you see the combined data of
                    <b>{{ unlockedNames.join(', ') }}</b>. New objects are owned by the
                    <em>primary</em> identity.
                </div>
                <button class="btn btn-outline-secondary btn-sm" @click="lockCurrent" data-testid="lock-current">
                    Lock this identity
                </button>
                <button v-if="identityStore.unlockedSet.size > 1" class="btn btn-outline-secondary btn-sm ms-2" @click="identityStore.lockAll()">
                    Lock all identities
                </button>
                <div v-if="canConnectIdentity" class="d-flex gap-2 align-items-center flex-wrap mt-2">
                    <button
                        class="btn btn-outline-primary btn-sm"
                        :disabled="bindingIdentity"
                        @click="connectToAccount"
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
        <div v-else-if="identityStore.items.length > 0" class="alert alert-warning">
            All identities on this device are locked. Unlock one below to see its data again.
        </div>
        <div v-else-if="!identityStore.guestMode" class="alert alert-info">
            You are browsing as a <b>guest</b> — shared/system data only. Create or import an
            identity below to own new data and restore your own objects.
        </div>
        <div v-else class="alert alert-info">
            You chose to continue as a guest. Create or import an identity below whenever you are ready.
        </div>

        <div v-if="message" :class="['alert', messageType === 'error' ? 'alert-danger' : 'alert-success']" class="mt-2">
            <ul class="mb-0">
                <li v-for="(line, i) in messageLines" :key="i">{{ line }}</li>
            </ul>
        </div>

        <!-- Data import (needs an unlocked identity to determine ownership) -->
        <div v-if="unlockedIdentities.length" class="card mb-4 shadow-sm" data-testid="data-import-panel">
            <div class="card-body">
                <h5 class="card-title">Import my data</h5>
                <p class="small text-muted">
                    Import the export file from your web app (Search page → Export) into this device.
                    Only objects owned by the selected identity are imported; everything else is skipped and reported.
                </p>
                <form @submit.prevent="importData">
                    <div class="mb-3" v-if="unlockedIdentities.length > 1">
                        <label class="form-label fw-semibold">Import as</label>
                        <select class="form-select" v-model="importIdentityId" data-testid="data-import-identity">
                            <option v-for="opened in unlockedIdentities" :key="opened.thingId" :value="opened.thingId">
                                {{ opened.name }} ({{ shortId(opened.thingId) }})
                            </option>
                        </select>
                    </div>
                    <div class="mb-3">
                        <input type="file" class="form-control" accept="application/json,.json" @change="onDataFileChange" data-testid="data-file" />
                    </div>
                    <button type="submit" class="btn btn-primary" :disabled="dataImporting || !dataFile" data-testid="data-import-submit">
                        {{ dataImporting ? (dataImportPct > 0 ? `Importing… ${dataImportPct}%` : 'Please wait…') : 'Import data' }}
                    </button>
                </form>
                <div v-if="dataImporting" class="mt-3">
                    <div class="progress" style="height: 8px;">
                        <div
                            class="progress-bar progress-bar-striped"
                            :class="{ 'progress-bar-animated': dataImportPct <= 0 || dataImportPct >= 100 }"
                            :style="dataImportPct > 0 ? { width: dataImportPct + '%' } : { width: '100%' }"
                            role="progressbar"
                        ></div>
                    </div>
                    <div v-if="dataImportPct > 0" class="small text-muted mt-1 text-end">{{ dataImportPct }}%</div>
                </div>
                <div v-if="dataReport" class="mt-3">
                    <div :class="['alert', dataReport.errors.length ? 'alert-warning' : 'alert-success']" class="mb-0" data-testid="data-import-report">
                        <ul class="mb-0">
                            <li>{{ dataReport.imported }} objects imported</li>
                            <li>{{ dataReport.importedLinks }} links imported</li>
                            <li>{{ dataReport.skippedExisting }} already present</li>
                            <li>{{ dataReport.skippedNotYours }} not owned by the selected identity — skipped</li>
                            <li v-for="(err, i) in dataReport.errors" :key="i" class="text-danger">{{ err }}</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>

        <!-- Stored identities -->
        <template v-if="identityStore.items.length">
            <h5 class="mb-2">Identities on this device</h5>
            <div class="list-group mb-4 shadow-sm">
                <div v-for="item in identityStore.items" :key="item.thingId" class="list-group-item">
                    <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
                        <div>
                            <span class="fw-semibold">{{ item.name }}</span>
                            <span v-if="isPrimary(item)" class="badge bg-primary ms-2">primary</span>
                            <span v-if="isUnlocked(item)" class="badge bg-success ms-2">unlocked</span>
                            <span v-if="item.requirePassphraseOnOpen" class="badge bg-warning text-dark ms-2">asks passphrase on open</span>
                            <div class="small text-muted"><code>{{ item.thingId }}</code></div>
                        </div>
                        <div class="d-flex gap-2 flex-wrap align-items-center">
                            <button v-if="!isUnlocked(item)" class="btn btn-outline-primary btn-sm" @click="startUnlock(item)">
                                Unlock
                            </button>
                            <button v-else class="btn btn-outline-secondary btn-sm" @click="identityStore.lock(item.thingId)">
                                Lock
                            </button>
                            <button v-if="!isPrimary(item)" class="btn btn-outline-secondary btn-sm" @click="makePrimary(item)">
                                Make primary
                            </button>
                            <button class="btn btn-outline-danger btn-sm" @click="confirmRemove(item)">
                                Remove…
                            </button>
                        </div>
                    </div>

                    <div class="form-check form-switch small mt-2" v-if="isUnlocked(item) || item.autoOpen?.enabled">
                        <input class="form-check-input" type="checkbox" :id="'req-' + item.thingId"
                               :checked="item.requirePassphraseOnOpen"
                               @change="toggleRequire(item, $event.target.checked)" />
                        <label class="form-check-label" :for="'req-' + item.thingId">
                            Ask for the passphrase when the app opens
                        </label>
                    </div>

                    <form v-if="unlockTarget === item.thingId" class="d-flex gap-2 mt-2" @submit.prevent="unlock(item)">
                        <input type="password" class="form-control form-control-sm" v-model="passphrase"
                               autocomplete="current-password" placeholder="Passphrase" data-testid="unlock-passphrase" />
                        <button type="submit" class="btn btn-primary btn-sm" :disabled="unlocking" data-testid="unlock-submit">
                            Unlock
                        </button>
                    </form>
                </div>
            </div>
        </template>

        <!-- Create / import an identity -->
        <div class="card mb-4 shadow-sm">
            <div class="card-body">
                <button v-if="!showSetup" class="btn btn-primary" @click="showSetup = true" data-testid="add-identity">
                    {{ identityStore.items.length ? 'Add another identity' : 'Create or import an identity' }}
                </button>

                <div v-if="showSetup">
                    <ul class="nav nav-tabs mb-3">
                        <li class="nav-item">
                            <button class="nav-link" :class="{ active: mode === 'create' }" @click="mode = 'create'" data-testid="tab-create">Create identity</button>
                        </li>
                        <li class="nav-item">
                            <button class="nav-link" :class="{ active: mode === 'import' }" @click="mode = 'import'" data-testid="tab-import">Import identity file</button>
                        </li>
                    </ul>

                    <div v-if="mnemonic" class="alert alert-warning">
                        <h6 class="text-warning">Backup phrase — write it down now</h6>
                        <p class="small mb-2">
                            This 24-word phrase is the only way to restore your identity if you lose the file or
                            forget the passphrase. Anyone who has it controls your identity. Store it offline.
                        </p>
                        <div class="d-flex gap-2">
                            <textarea class="form-control font-monospace" :value="mnemonic" rows="3" readonly data-testid="mnemonic"></textarea>
                            <button class="btn btn-outline-secondary flex-shrink-0" @click="copyMnemonic" data-testid="copy-mnemonic">Copy</button>
                        </div>
                    </div>

                    <!-- Create -->
                    <form v-if="mode === 'create'" @submit.prevent="create" data-testid="create-panel">
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
                        <div class="form-check mb-3">
                            <input class="form-check-input" type="checkbox" id="require-open" v-model="requireOnOpen" data-testid="create-require-open" />
                            <label class="form-check-label" for="require-open">
                                Ask for the passphrase whenever the app opens (slower but hides your data at rest
                                of the app session). Leave off to open automatically on this device.
                            </label>
                        </div>
                        <button type="submit" class="btn btn-primary" :disabled="creating" data-testid="create-submit">
                            {{ creating ? 'Please wait…' : 'Generate identity' }}
                        </button>
                    </form>

                    <!-- Import -->
                    <form v-else @submit.prevent="importFile" data-testid="import-panel">
                        <div class="mb-3">
                            <label class="form-label fw-semibold">Identity file</label>
                            <input type="file" class="form-control" accept="application/json,.json" @change="onFileChange" data-testid="import-file" />
                        </div>
                        <div class="mb-3">
                            <label class="form-label fw-semibold">Passphrase</label>
                            <input type="password" class="form-control" v-model="passphrase" autocomplete="current-password" data-testid="import-passphrase" />
                        </div>
                        <div class="form-check mb-3">
                            <input class="form-check-input" type="checkbox" id="require-open-import" v-model="requireOnOpen" data-testid="import-require-open" />
                            <label class="form-check-label" for="require-open-import">
                                Ask for the passphrase whenever the app opens
                            </label>
                        </div>
                        <button type="submit" class="btn btn-primary" :disabled="importing || !selectedFile" data-testid="import-submit">
                            {{ importing ? 'Please wait…' : 'Import identity' }}
                        </button>
                    </form>
                </div>
            </div>
        </div>

        <!-- Danger zone -->
        <div class="card border-danger shadow-sm">
            <div class="card-body">
                <h5 class="card-title text-danger">Danger zone</h5>
                <p class="small text-muted">
                    Remove everything on this device: all stored identities and all local data.
                    Export/import your data again afterwards if you want to start over.
                </p>
                <button class="btn btn-outline-danger" data-testid="clear-all-data" @click="clearAll">
                    Clear all data…
                </button>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';
import { useAuthStore } from '../stores/auth';
import { useIdentityStore } from '../stores/identity';
import { importExportData } from '../localDb/importData';
import { onImportProgress } from '../utils/importProgress';
import { signBytes } from '../identity/identity';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const identityStore = useIdentityStore();

const mode = ref('create');
const showSetup = ref(false);
const name = ref(authStore.user?.name || '');
const passphrase = ref('');
const passphrase2 = ref('');
const requireOnOpen = ref(false);
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
const dataProg = ref({ things: { done: 0, total: 0 }, links: { done: 0, total: 0 } });
const dataImportPct = computed(() => {
    const { things, links } = dataProg.value;
    const total = things.total + links.total;
    if (!total) return 0;
    return Math.round(((things.done + links.done) / total) * 100);
});
const importIdentityId = ref(null);
const unlockTarget = ref(null);
const removeTarget = ref(null);
const bindingIdentity = ref(false);
const identityConnected = ref(false);

const messageLines = computed(() => (message.value ? message.value.split('\n') : []));
const unlockedIdentities = computed(() => identityStore.items
    .filter((i) => identityStore.unlockedSet.has(i.thingId))
    .map((i) => identityStore.unlockedMap.get(i.thingId) || i));
const unlockedNames = computed(() => unlockedIdentities.value.map((i) => i.name));

// Bind a real server account (numeric id) to the unlocked identity that
// belongs to it (same thing_id). Offline/guest sessions use a uuid "id" and
// self-sovereign identities with a different owner are not eligible.
const canConnectIdentity = computed(() =>
    authStore.authenticated
    && Number.isInteger(authStore.user?.id)
    && identityStore.primary?.thingId === authStore.user?.thing_id
    && !!identityStore.primary?.file?.public_key,
);

function shortId(uid) {
    return uid ? uid.slice(0, 8) : '';
}
function isUnlocked(item) {
    return identityStore.unlockedSet.has(item.thingId);
}
function isPrimary(item) {
    return item.thingId === identityStore.primaryItem?.thingId;
}
function setMessage(text, type = 'success') {
    message.value = text;
    messageType.value = type;
}

function onFileChange(event) {
    selectedFile.value = event.target.files?.[0] || null;
}
function onDataFileChange(event) {
    dataFile.value = event.target.files?.[0] || null;
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
            requirePassphraseOnOpen: requireOnOpen.value,
        });
        mnemonic.value = createdMnemonic;
        setMessage(
            'Identity created and unlocked. Download the identity file below, then import it on your other apps.\nBackup phrase (above): write it down now — it is the only way to restore the identity.',
        );
        passphrase.value = '';
        passphrase2.value = '';
        requireOnOpen.value = false;
        importIdentityId.value = identityStore.primary?.thingId || null;
        const opened = identityStore.primary;
        if (opened) {
            downloadFile(opened.file, `factology-identity-${opened.thingId}.json`);
        }
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
        const opened = await identityStore.adoptFile(file, passphrase.value, {
            requirePassphraseOnOpen: requireOnOpen.value,
        });
        setMessage(
            `Identity adopted: ${opened.name} (${opened.thingId}).\n` +
            'It is now primary — newly created objects are owned by it.',
        );
        passphrase.value = '';
        selectedFile.value = null;
        mnemonic.value = '';
        mode.value = 'create';
        showSetup.value = false;
        requireOnOpen.value = false;
        importIdentityId.value = opened.thingId;
    } catch (error) {
        setMessage(error.message, 'error');
    } finally {
        importing.value = false;
    }
}

function startUnlock(item) {
    unlockTarget.value = item.thingId;
    passphrase.value = '';
}

async function unlock(item) {
    setMessage('');
    unlocking.value = true;
    try {
        const opened = await identityStore.unlock(item.thingId, passphrase.value);
        setMessage(`Identity unlocked: ${opened.name}.`);
        passphrase.value = '';
        unlockTarget.value = null;
    } catch (error) {
        setMessage(error.message, 'error');
    } finally {
        unlocking.value = false;
    }
}

async function lockCurrent() {
    if (!identityStore.primary) return;
    await identityStore.lock(identityStore.primary.thingId);
}

async function makePrimary(item) {
    await identityStore.setPrimary(item.thingId);
    importIdentityId.value = item.thingId;
    setMessage(`Primary identity is now ${item.name} — new objects are owned by it.`);
}

async function toggleRequire(item, on) {
    await identityStore.setRequirePassphraseOnOpen(item.thingId, on);
    if (on) {
        setMessage('From the next app open this identity will ask for its passphrase.');
    }
}

function confirmRemove(item) {
    const wipe = confirm(
        `Remove identity "${item.name}" from this device?\n\n` +
        'Check "erase data" in the next dialog to also delete every local object it owns.',
    );
    if (!wipe) return;
    const eraseData = confirm('Also erase this identity\'s local data (objects it owns)? Cancel to keep its data.');
    removeIdentity(item, eraseData);
}

async function removeIdentity(item, wipeData) {
    try {
        await identityStore.removeIdentity(item.thingId, { wipeData });
        setMessage(`Identity removed${wipeData ? ' and its data erased' : ''}.`);
    } catch (error) {
        setMessage(error.message, 'error');
    }
}

async function connectToAccount() {
    setMessage('');
    const identity = identityStore.primary;
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

async function importData() {
    setMessage('');
    if (!dataFile.value) return;
    const targetId = importIdentityId.value || identityStore.primary?.thingId;
    if (!targetId) return;
    dataImporting.value = true;
    dataProg.value = { things: { done: 0, total: 0 }, links: { done: 0, total: 0 } };

    let unsubscribe = null;
    try {
        unsubscribe = onImportProgress((info) => {
            const side = info.phase === 'links' ? 'links' : 'things';
            const cur = dataProg.value[side];
            cur.done = info.done;
            cur.total = info.total;
        });
        const text = await dataFile.value.text();
        const file = JSON.parse(text);
        dataReport.value = await importExportData(file, targetId);
        setMessage('Import finished. See the report below.');
    } catch (error) {
        setMessage(error.message, 'error');
    } finally {
        if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
        }
        dataImporting.value = false;
    }
}

function copyMnemonic() {
    navigator.clipboard?.writeText(mnemonic.value);
}

async function clearAll() {
    const ok = confirm(
        'Clear ALL data on this device?\n\n' +
        'All identities, all imported objects and all local data will be deleted. ' +
        'This cannot be undone. Consider exporting your data first.',
    );
    if (!ok) return;
    await identityStore.clearAllData();
    window.location.reload();
}

onMounted(async () => {
    await identityStore.restore();
    // Reopen with a passphrase-protected identity → park on the unlock panel.
    if (route.query.reopen === '1' && identityStore.primaryItem) {
        const primary = identityStore.primaryItem;
        if (primary.requirePassphraseOnOpen && !isUnlocked(primary)) {
            unlockTarget.value = primary.thingId;
        }
    }
    const active = identityStore.primary || identityStore.items[0];
    importIdentityId.value = active?.thingId || null;
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
