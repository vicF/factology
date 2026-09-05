<template>
    <div class="logs-page container mt-3" data-testid="logs-page">
        <div class="d-flex align-items-center justify-content-between mb-3">
            <h1 class="mb-0">Error log</h1>
            <div class="d-flex gap-2">
                <button
                    class="btn btn-outline-secondary btn-sm"
                    @click="copyAll"
                    :disabled="log.length === 0"
                    data-testid="logs-copy-btn"
                >
                    {{ copied ? 'Copied!' : 'Copy all' }}
                </button>
                <button
                    class="btn btn-outline-danger btn-sm"
                    @click="clearAll"
                    :disabled="log.length === 0"
                    data-testid="logs-clear-btn"
                >
                    Clear
                </button>
            </div>
        </div>

        <p class="text-muted small">
            Errors, warnings and console output captured by this app while it runs
            (kept on this device — up to 300 entries, newest first). This page exists
            because the desktop and mobile apps have no browser console to open.
            Use “Copy all” when reporting a problem.
        </p>

        <div v-if="log.length === 0" class="alert alert-success" data-testid="logs-empty">
            No errors recorded yet.
        </div>

        <div v-else class="list-group" data-testid="logs-list">
            <div v-for="entry in log" :key="entry.id" class="list-group-item" :data-level="entry.level">
                <div class="d-flex align-items-center justify-content-between gap-2">
                    <span class="badge" :class="entry.level === 'warn' ? 'text-bg-warning' : 'text-bg-danger'">
                        {{ entry.level.toUpperCase() }}<template v-if="entry.count > 1"> ×{{ entry.count }}</template>
                    </span>
                    <small class="text-muted text-nowrap">{{ formatTime(entry.ts) }} · {{ entry.origin }}</small>
                </div>
                <pre class="log-line mt-2 mb-0">{{ entry.message }}</pre>
                <pre v-if="entry.stack" class="log-stack mt-1 mb-0">{{ entry.stack }}</pre>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import {
    getLogEntries,
    subscribeToLog,
    clearLogEntries,
    copyLogToClipboard,
} from '../utils/appLog.js';

defineOptions({ name: 'Logs' });

const log = ref([...getLogEntries()].reverse());
const copied = ref(false);
let unsubscribe = null;

onMounted(() => {
    unsubscribe = subscribeToLog((entries) => {
        log.value = [...entries].reverse();
    });
});

onUnmounted(() => {
    if (unsubscribe) unsubscribe();
});

const formatTime = (ts) => {
    const date = new Date(ts);
    return isNaN(date) ? String(ts) : date.toLocaleString();
};

const copyAll = async () => {
    try {
        await copyLogToClipboard();
        copied.value = true;
        setTimeout(() => { copied.value = false; }, 1500);
    } catch {
        copied.value = false;
    }
};

const clearAll = () => {
    if (!confirm('Clear the recorded error log?')) return;
    clearLogEntries();
};
</script>

<style scoped>
.log-line {
    font-size: 0.8rem;
    white-space: pre-wrap;
    word-break: break-word;
    background: #f8f9fa;
    border-radius: 4px;
    padding: 6px 8px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.log-stack {
    font-size: 0.72rem;
    white-space: pre-wrap;
    word-break: break-word;
    color: #6c757d;
    margin-left: 8px;
    max-height: 220px;
    overflow: auto;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
</style>
