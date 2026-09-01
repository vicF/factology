<template>
    <div class="tools-page container mt-3" data-testid="tools-page">
        <h1 class="mb-4">{{ $t('Tools') }}</h1>

        <!-- ── Export / Import JSON (all registered users) ───────────── -->
        <section v-if="authStore.authenticated" class="card mb-4" data-testid="export-import-section">
            <div class="card-header">
                <h5 class="mb-0">{{ $t('Export / Import JSON') }}</h5>
            </div>
            <div class="card-body">
                <p class="text-muted small">
                    {{ $t('Export everything you can see (your objects and public objects), or import a JSON backup.') }}
                </p>
                <div class="d-flex gap-2 align-items-center">
                    <button class="btn btn-outline-secondary" @click="exportData" :disabled="exporting">
                        {{ exporting ? $t('Exporting...') : $t('Export') }}
                    </button>
                    <button class="btn btn-outline-secondary" @click="showImportModal = true">
                        {{ $t('Import') }}
                    </button>
                    <label class="small text-muted mb-0 ms-2">
                        <input type="checkbox" v-model="includeDeleted" />
                        {{ $t('Include deleted') }}
                    </label>
                </div>
            </div>
            <ImportModal v-if="showImportModal" @close="showImportModal = false" />
        </section>

        <!-- ── Database Consistency Check (admin) ────────────────────── -->
        <section v-if="isAdmin" class="card mb-4" data-testid="consistency-section">
            <div class="card-header">
                <h5 class="mb-0">{{ $t('Database Consistency Check') }}</h5>
            </div>
            <div class="card-body">
                <p class="text-muted small">
                    {{ $t('Check for structural data problems: dangling links, self-references, objects without classes, classes outside the hierarchy, and link types not under the Link taxonomy.') }}
                </p>

                <button
                    class="btn btn-primary mb-3"
                    :disabled="checkingConsistency"
                    @click="runConsistencyCheck"
                    data-testid="run-consistency-check-btn"
                >
                    <span v-if="checkingConsistency" class="spinner-border spinner-border-sm me-2" role="status"></span>
                    {{ checkingConsistency ? $t('Checking...') : $t('Run Consistency Check') }}
                </button>

                <div v-if="consistencyError" class="alert alert-danger">{{ consistencyError }}</div>

                <div v-if="consistencyResult" data-testid="consistency-result">
                    <div v-if="consistencyResult.clean" class="alert alert-success">
                        {{ $t('The database is consistent. No issues found.') }}
                    </div>
                    <div v-else class="alert alert-warning">
                        {{ $t('Consistency issues found:') }}
                    </div>

                    <div class="small text-muted mb-3">
                        {{ $t('Last check: {time}', { time: formatCheckedAt(consistencyResult.checked_at) }) }}
                        — {{ $t('Showing results from the previous check. Run again to refresh.') }}
                    </div>

                    <table v-if="!consistencyResult.clean" class="table table-sm table-bordered mb-3">
                        <tbody>
                            <tr v-for="(count, check) in consistencyResult.summary" :key="check">
                                <td>{{ $t(checkLabel(check)) }}</td>
                                <td :class="count > 0 ? 'table-danger' : ''">{{ count }}</td>
                            </tr>
                        </tbody>
                    </table>

                    <template v-for="(items, check) in consistencyResult.issues" :key="check">
                        <div v-if="items.length">
                            <h6>{{ $t(checkLabel(check)) }} ({{ items.length }})</h6>
                            <ul class="list-group mb-3">
                                <li v-for="(item, i) in items" :key="i" class="list-group-item small d-flex flex-wrap gap-1 align-items-baseline">
                                    <template v-for="(part, pi) in issueParts(check, item)" :key="pi">
                                        <RouterLink
                                            v-if="part.thing_id"
                                            :to="`/object/${part.thing_id}`"
                                            :class="{ 'visited-link': isVisited(part.thing_id) }"
                                            @click="markVisited(part.thing_id)"
                                        >{{ part.text }}</RouterLink>
                                        <span v-else>{{ part.text }}</span>
                                    </template>
                                </li>
                            </ul>
                        </div>
                    </template>
                </div>
            </div>
        </section>

        <!-- ── GEDCOM Import ─────────────────────────────────────────── -->
        <section class="card mb-4" data-testid="gedcom-import-section">
            <div class="card-header">
                <h5 class="mb-0">{{ $t('Import GEDCOM') }}</h5>
            </div>
            <div class="card-body">
                <p class="text-muted small">
                    {{ $t('Import a GEDCOM 5.5.1 file (e.g. from the Древо Жизни program) as people, events, and family links.') }}
                </p>

                <!-- Result -->
                <div v-if="importResult" class="mb-3" data-testid="import-result">
                    <table class="table table-sm table-bordered mb-2">
                        <tbody>
                            <tr class="table-success">
                                <td>{{ $t('Imported') }}</td>
                                <td>{{ importResult.imported }}</td>
                            </tr>
                            <tr class="table-info">
                                <td>{{ $t('Updated') }}</td>
                                <td>{{ importResult.updated }}</td>
                            </tr>
                            <tr class="table-warning">
                                <td>{{ $t('Skipped') }}</td>
                                <td>{{ importResult.skipped }}</td>
                            </tr>
                            <tr class="table-danger">
                                <td>{{ $t('Errors') }}</td>
                                <td>{{ importResult.errors }}</td>
                            </tr>
                        </tbody>
                    </table>
                    <div v-if="importResult.details.length > 0" class="alert alert-warning small">
                        <ul class="mb-0">
                            <li v-for="(d, i) in importResult.details" :key="i">{{ d }}</li>
                        </ul>
                    </div>
                    <button class="btn btn-outline-primary btn-sm" @click="resetImport">{{ $t('Import Another') }}</button>
                </div>

                <!-- Form -->
                <div v-else>
                    <div class="mb-3">
                        <label class="form-label">{{ $t('GEDCOM file') }}</label>
                        <input type="file" class="form-control" accept=".ged,.txt" @change="onFileChange" data-testid="gedcom-file-input" />
                        <div class="form-text">{{ $t('Files exported from Древо Жизни or familio.org usually end in .ged') }}</div>
                    </div>

                    <div v-if="importError" class="alert alert-danger">{{ importError }}</div>

                    <button
                        class="btn btn-primary"
                        :disabled="!selectedFile || importing"
                        @click="importGedcom"
                        data-testid="import-gedcom-btn"
                    >
                        <span v-if="importing" class="spinner-border spinner-border-sm me-2" role="status"></span>
                        {{ importing ? $t('Importing...') : $t('Import') }}
                    </button>
                </div>
            </div>
        </section>

        <!-- ── Duplicate Finder ──────────────────────────────────────── -->
        <section class="card mb-4" data-testid="duplicates-section">
            <div class="card-header">
                <h5 class="mb-0">{{ $t('Find Duplicate Persons') }}</h5>
            </div>
            <div class="card-body">
                <p class="text-muted small">
                    {{ $t('Find people imported from different files that are likely the same person, and link them with a "is a duplicate of" link.') }}
                </p>

                <button
                    class="btn btn-primary mb-3"
                    :disabled="findingDuplicates"
                    @click="findDuplicates"
                    data-testid="find-duplicates-btn"
                >
                    <span v-if="findingDuplicates" class="spinner-border spinner-border-sm me-2" role="status"></span>
                    {{ findingDuplicates ? $t('Searching...') : $t('Find Duplicates') }}
                </button>

                <div v-if="duplicateError" class="alert alert-danger">{{ duplicateError }}</div>

                <div v-if="duplicateResult" class="mb-3" data-testid="duplicates-result">
                    <div v-if="duplicateResult.links_created > 0" class="alert alert-success">
                        {{ $t('Created {count} "is a duplicate of" links', { count: duplicateResult.links_created }) }}
                    </div>
                    <div v-else class="alert alert-info">
                        {{ $t('Nothing to do — no new duplicate links were created.') }}
                    </div>

                    <ul v-if="duplicateResult.matches.length > 0" class="list-group">
                        <li v-for="(m, i) in duplicateResult.matches" :key="i" class="list-group-item d-flex justify-content-between align-items-center">
                            <span>
                                <router-link :to="`/object/${m.thing_id_a}`">{{ m.name_a }}</router-link>
                                ↔
                                <router-link :to="`/object/${m.thing_id_b}`">{{ m.name_b }}</router-link>
                            </span>
                        </li>
                    </ul>
                </div>
            </div>
        </section>
    </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import axios from 'axios';
import { useAuthStore } from '../stores/auth';
import { storageSync } from '../utils/storage';
import ImportModal from "./ImportModal.vue";

defineOptions({ name: 'Tools' });

const authStore = useAuthStore();
const isAdmin = computed(() => !!authStore.user?.is_admin);

// ── Export / Import state ──
const exporting = ref(false);
const includeDeleted = ref(false);
const showImportModal = ref(false);

const exportData = async () => {
    exporting.value = true;
    try {
        const response = await axios.get('/export', {
            params: { include_deleted: includeDeleted.value },
            responseType: 'blob',
        });

        // Trigger browser download using raw blob (avoids double-encoding)
        const blob = new Blob([response.data], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        a.download = `factology-export-${timestamp}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Export failed:', error);
        alert('Export failed: ' + (error.response?.data?.message || error.message));
    } finally {
        exporting.value = false;
    }
};

// ── GEDCOM import state ──
const selectedFile = ref(null);
const importing = ref(false);
const importError = ref('');
const importResult = ref(null);

const onFileChange = (event) => {
    selectedFile.value = event.target.files[0] || null;
    importError.value = '';
    importResult.value = null;
};

const resetImport = () => {
    importResult.value = null;
    importError.value = '';
    selectedFile.value = null;
};

const importGedcom = async () => {
    if (!selectedFile.value) {
        importError.value = 'Please select a GEDCOM file';
        return;
    }

    importing.value = true;
    importError.value = '';

    try {
        const formData = new FormData();
        formData.append('file', selectedFile.value);

        const response = await axios.post('/import/gedcom', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });

        if (response.data.success) {
            importResult.value = response.data.result;
            selectedFile.value = null;
        } else {
            importError.value = response.data.message || 'Import failed';
        }
    } catch (err) {
        console.error('GEDCOM import error:', err);
        const serverMsg = err.response?.data?.message || err.response?.data?.error?.message;
        importError.value = serverMsg || `Request failed: ${err.message}. Check console (F12).`;
    } finally {
        importing.value = false;
    }
};

// ── Duplicate finder state ──
const findingDuplicates = ref(false);
const duplicateError = ref('');
const duplicateResult = ref(null);

const findDuplicates = async () => {
    findingDuplicates.value = true;
    duplicateError.value = '';

    try {
        const response = await axios.post('/import/find-duplicates');
        if (response.data.success) {
            duplicateResult.value = response.data.result;
        } else {
            duplicateError.value = response.data.message || 'Duplicate search failed';
        }
    } catch (err) {
        console.error('Duplicate search error:', err);
        const serverMsg = err.response?.data?.message || err.response?.data?.error?.message;
        duplicateError.value = serverMsg || `Request failed: ${err.message}. Check console (F12).`;
    } finally {
        findingDuplicates.value = false;
    }
};

// ── Database consistency check state ──
const CONSISTENCY_CACHE_KEY = 'tools_consistency_result';
const CONSISTENCY_VISITED_KEY = 'tools_consistency_visited';

// Seed from sync storage so returning to this page (or reloading) shows the
// last run's result instead of forcing a full re-check every time.
const loadCachedConsistency = () => {
    const raw = storageSync.get(CONSISTENCY_CACHE_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
};

const checkingConsistency = ref(false);
const consistencyError = ref('');
const consistencyResult = ref(loadCachedConsistency());

// Thing ids already opened from the report — shown struck-through so the user
// can see at a glance which objects they've already visited.
const visitedIds = ref(new Set(JSON.parse(storageSync.get(CONSISTENCY_VISITED_KEY) || '[]')));

const isVisited = (id) => visitedIds.value.has(id);

const markVisited = (id) => {
    if (visitedIds.value.has(id)) return;
    visitedIds.value.add(id);
    storageSync.set(CONSISTENCY_VISITED_KEY, JSON.stringify([...visitedIds.value]));
};

const formatCheckedAt = (ts) => {
    if (!ts) return '';
    const date = new Date(ts);
    return isNaN(date) ? String(ts) : date.toLocaleString();
};

const checkLabels = {
    links_to_missing_objects: 'Links to missing objects',
    self_referencing_links: 'Self-referencing links',
    objects_without_classes: 'Objects without classes',
    classes_without_parent: 'Classes without parent',
    links_not_below_link_parent: 'Link types not below the Link parent',
    class_links_to_non_classes: 'Class links pointing to non-class objects',
};

const checkLabel = (key) => checkLabels[key] || key;

// Render an issue as a list of parts; parts with a thing_id become links to
// the object page, so every object mentioned in the report is navigable.
const issueParts = (check, item) => {
    const obj = (text, thing_id) => ({ text, thing_id });
    const plain = (text) => ({ text, thing_id: null });
    const nameOf = (name, id) => (name && name !== id) ? `${name} (${id})` : id;

    switch (check) {
        case 'links_to_missing_objects': {
            const parts = [plain(`#${item.link_id}: `)];
            const add = (id, missing) => {
                parts.push(missing ? plain(id) : obj(id, id));
                parts.push(plain(' — '));
            };
            add(item.one_thing_id, item.missing.includes('one_thing_id'));
            add(item.link_type_id, item.missing.includes('link_type_id'));
            add(item.other_thing_id, item.missing.includes('other_thing_id'));
            parts.pop(); // trailing separator
            parts.push(plain(` (missing: ${item.missing.join(', ')})`));
            return parts;
        }
        case 'self_referencing_links':
            return [
                plain(`#${item.link_id}: `),
                obj(item.one_thing_id, item.one_thing_id),
                plain(' refers to itself'),
            ];
        case 'objects_without_classes':
        case 'classes_without_parent':
            return [
                obj(nameOf(item.name, item.thing_id), item.thing_id),
            ];
        case 'links_not_below_link_parent':
            return [
                obj(nameOf(item.name, item.thing_id), item.thing_id),
                plain(` — ${item.problem}`),
            ];
        case 'class_links_to_non_classes':
            return [
                obj(nameOf(item.target_name, item.other_thing_id), item.other_thing_id),
                plain(' (used as the class of '),
                obj(item.one_thing_id, item.one_thing_id),
                plain(`) — ${item.problem}`),
            ];
        default:
            return [plain(JSON.stringify(item))];
    }
};

const runConsistencyCheck = async () => {
    checkingConsistency.value = true;
    consistencyError.value = '';

    try {
        const response = await axios.post('/tools/consistency-check');
        if (response.data.success) {
            consistencyResult.value = response.data.result;
            storageSync.set(CONSISTENCY_CACHE_KEY, JSON.stringify(response.data.result));
        } else {
            consistencyError.value = response.data.message || 'Consistency check failed';
        }
    } catch (err) {
        console.error('Consistency check error:', err);
        const serverMsg = err.response?.data?.message || err.response?.data?.error?.message;
        consistencyError.value = serverMsg || `Request failed: ${err.message}. Check console (F12).`;
    } finally {
        checkingConsistency.value = false;
    }
};
</script>

<style scoped>
.visited-link {
    text-decoration: line-through;
    opacity: 0.55;
}
</style>
