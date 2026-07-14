<template>
    <Teleport to="body">
        <div class="modal fade show" tabindex="-1" style="display: block;" @click.self="close">
            <div class="modal-dialog modal-lg modal-fullscreen-sm-down">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Import Data</h5>
                        <button type="button" class="btn-close" @click="close"></button>
                    </div>
                    <div class="modal-body">
                        <div v-if="importResult" class="mb-3">
                            <h6>Import Results</h6>
                            <table class="table table-sm table-bordered">
                                <thead>
                                    <tr>
                                        <th></th>
                                        <th>Things</th>
                                        <th>Links</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr class="table-success">
                                        <td>Imported</td>
                                        <td>{{ importResult.imported.things }}</td>
                                        <td>{{ importResult.imported.links }}</td>
                                    </tr>
                                    <tr class="table-warning">
                                        <td>Skipped</td>
                                        <td>{{ importResult.skipped.things }}</td>
                                        <td>{{ importResult.skipped.links }}</td>
                                    </tr>
                                    <tr class="table-danger">
                                        <td>Deleted</td>
                                        <td>{{ importResult.deleted.things }}</td>
                                        <td>{{ importResult.deleted.links }}</td>
                                    </tr>
                                </tbody>
                            </table>
                            <div v-if="importResult.errors.length > 0" class="alert alert-warning mt-2">
                                <strong>Errors:</strong>
                                <ul class="mb-0">
                                    <li v-for="(err, i) in importResult.errors" :key="i">{{ err }}</li>
                                </ul>
                            </div>
                            <button class="btn btn-primary" @click="importResult = null">Import Another</button>
                        </div>

                        <div v-else>
                            <div class="mb-3">
                                <label class="form-label">JSON File</label>
                                <input type="file" class="form-control" accept=".json" @change="onFileChange" />
                            </div>

                            <div class="mb-3">
                                <label class="form-label">Conflict Resolution</label>
                                <select class="form-select" v-model="conflictMode">
                                    <option value="latest_wins">Keep latest (compare timestamps)</option>
                                    <option value="keep_existing">Keep mine (skip existing records)</option>
                                    <option value="overwrite">Overwrite (replace with imported data)</option>
                                </select>
                            </div>

                            <div v-if="error" class="alert alert-danger">{{ error }}</div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" @click="close">
                            Cancel
                        </button>
                        <button
                            v-if="!importResult"
                            type="button"
                            class="btn btn-primary"
                            @click="importData"
                            :disabled="!selectedFile || importing"
                        >
                            {{ importing ? 'Importing...' : 'Import' }}
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

const onFileChange = (event) => {
    selectedFile.value = event.target.files[0] || null;
    error.value = '';
    importResult.value = null;
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
        error.value = err.response?.data?.message || err.message || 'Import failed';
        console.error('Import error:', err);
    } finally {
        importing.value = false;
    }
};

const close = () => {
    emit('close');
};
</script>
