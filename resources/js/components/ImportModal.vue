<template>
    <Teleport to="body">
        <div class="modal fade show" tabindex="-1" style="display: block;" @click.self="close">
            <div class="modal-dialog modal-lg modal-fullscreen-sm-down">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">{{ $t('Import Data') }}</h5>
                        <button type="button" class="btn-close" :disabled="importing" @click="close"></button>
                    </div>
                    <div class="modal-body">
                        <div v-if="importResult" class="mb-3">
                            <h6>{{ $t('Import Results') }}</h6>
                            <table class="table table-sm table-bordered">
                                <thead>
                                    <tr>
                                        <th></th>
                                        <th>{{ $t('Things') }}</th>
                                        <th>{{ $t('Links') }}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr class="table-success">
                                        <td>{{ $t('Imported') }}</td>
                                        <td>{{ importResult.imported.things }}</td>
                                        <td>{{ importResult.imported.links }}</td>
                                    </tr>
                                    <tr class="table-warning">
                                        <td>{{ $t('Skipped') }}</td>
                                        <td>{{ importResult.skipped.things }}</td>
                                        <td>{{ importResult.skipped.links }}</td>
                                    </tr>
                                    <tr class="table-danger">
                                        <td>{{ $t('Deleted') }}</td>
                                        <td>{{ importResult.deleted.things }}</td>
                                        <td>{{ importResult.deleted.links }}</td>
                                    </tr>
                                </tbody>
                            </table>
                            <div v-if="importResult.errors.length > 0" class="alert alert-warning mt-2">
                                <strong>{{ $t('Errors') }}:</strong>
                                <ul class="mb-0">
                                    <li v-for="(err, i) in importResult.errors" :key="i">{{ err }}</li>
                                </ul>
                            </div>
                            <button class="btn btn-primary" @click="importResult = null">{{ $t('Import Another') }}</button>
                        </div>

                        <div v-else-if="!importing">
                            <div class="mb-3">
                                <label class="form-label">{{ $t('JSON File') }}</label>
                                <input type="file" class="form-control" accept=".json" @change="onFileChange" />
                            </div>

                            <div class="mb-3">
                                <label class="form-label">{{ $t('Conflict Resolution') }}</label>
                                <select class="form-select" v-model="conflictMode">
                                    <option value="latest_wins">{{ $t('Keep latest (compare timestamps)') }}</option>
                                    <option value="keep_existing">{{ $t('Keep mine (skip existing records)') }}</option>
                                    <option value="overwrite">{{ $t('Overwrite (replace with imported data)') }}</option>
                                </select>
                            </div>

                            <div v-if="error" class="alert alert-danger">{{ error }}</div>
                        </div>

                        <div v-else class="text-center py-4">
                            <div class="spinner-border text-primary mb-3" role="status">
                                <span class="visually-hidden">{{ $t('Loading...') }}</span>
                            </div>
                            <p class="fw-bold mb-1">{{ $t('Importing {things} things and {links} links...', { things: fileInfo.things, links: fileInfo.links }) }}</p>
                            <p class="text-muted small mb-0">
                                {{ $t('This may take several minutes for large files. Please do not close this window.') }}
                            </p>
                            <div class="progress mt-3" style="height: 6px;">
                                <div class="progress-bar progress-bar-striped progress-bar-animated" style="width: 100%"></div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" :disabled="importing" @click="close">
                            {{ $t('Cancel') }}
                        </button>
                        <button
                            v-if="!importResult"
                            type="button"
                            class="btn btn-primary"
                            @click="importData"
                            :disabled="!selectedFile || importing"
                        >
                            {{ importing ? $t('Importing...') : $t('Import') }}
                        </button>
                    </div>
                </div>
            </div>
        </div>
        <div class="modal-backdrop fade show"></div>
    </Teleport>
</template>

<script setup>
import { ref } from 'vue';
import axios from 'axios';

const emit = defineEmits(['close']);

const selectedFile = ref(null);
const conflictMode = ref('latest_wins');
const importing = ref(false);
const importResult = ref(null);
const error = ref('');
const fileInfo = ref({ things: '...', links: '...' });

const onFileChange = async (event) => {
    const file = event.target.files[0] || null;
    selectedFile.value = file;
    error.value = '';
    importResult.value = null;

    // Read file header to extract stats before importing
    if (file) {
        try {
            const header = await readFileSlice(file, 0, 3000);
            const statsMatch = header.match(/"stats":\s*\{[^}]+}/);
            if (statsMatch) {
                const parsed = JSON.parse('{' + statsMatch[0] + '}');
                fileInfo.value = {
                    things: parsed.stats?.things ?? '?',
                    links: parsed.stats?.links ?? '?',
                };
            }
        } catch (e) {
            fileInfo.value = { things: '?', links: '?' };
        }
    }
};

const readFileSlice = (file, start, end) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsText(file.slice(start, end));
    });
};

const importData = async () => {
    if (!selectedFile.value) {
        error.value = 'Please select a JSON file';
        return;
    }

    importing.value = true;
    error.value = '';

    try {
        const formData = new FormData();
        formData.append('file', selectedFile.value);
        formData.append('conflict_mode', conflictMode.value);

        const response = await axios.post('/import', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });

        if (response.data.success) {
            importResult.value = response.data.result;
        } else {
            error.value = response.data.message || 'Import failed';
        }
    } catch (err) {
        console.error('Import error (full):', err);
        const status = err.response?.status;
        const serverMsg = err.response?.data?.message || err.response?.data?.error?.message;
        if (serverMsg) {
            error.value = serverMsg;
        } else if (status) {
            error.value = `Server returned ${status} with no details. Check console (F12).`;
        } else if (err.message) {
            error.value = `Request failed: ${err.message}. Check console (F12).`;
        } else {
            error.value = 'Import failed (unknown cause). Check console (F12).';
        }
    } finally {
        importing.value = false;
    }
};

const close = () => {
    if (!importing.value) {
        emit('close');
    }
};
</script>
