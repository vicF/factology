<template>
    <div class="tools-page container mt-3" data-testid="tools-page">
        <h1 class="mb-4">{{ $t('Tools') }}</h1>

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

        <!-- ── Export (admin) ────────────────────────────────────────── -->
        <section v-if="isAdmin" class="card mb-4" data-testid="export-section">
            <div class="card-header">
                <h5 class="mb-0">{{ $t('Export / Import JSON') }}</h5>
            </div>
            <div class="card-body">
                <p class="text-muted small">
                    {{ $t('Full database export and JSON import are available to admins from the dashboard toolbar.') }}
                </p>
                <button class="btn btn-outline-secondary" @click="$router.push('/')">
                    {{ $t('Go to Dashboard') }}
                </button>
            </div>
        </section>
    </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import axios from 'axios';
import { useAuthStore } from '../stores/auth';

defineOptions({ name: 'Tools' });

const authStore = useAuthStore();
const isAdmin = computed(() => !!authStore.user?.is_admin);

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
</script>
