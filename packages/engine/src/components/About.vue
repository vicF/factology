<template>
    <div class="about-page" data-testid="about-page">
        <h1 class="mb-4">{{ $t('About') }}</h1>

        <!-- ── App Info ────────────────────────────────── -->
        <section class="card mb-4">
            <div class="card-header">
                <h5 class="mb-0">{{ $t('Application') }}</h5>
            </div>
            <div class="card-body">
                <table class="table table-sm table-borderless mb-0">
                    <tbody>
                        <tr>
                            <td class="text-muted" style="width: 160px;">{{ $t('Build') }}</td>
                            <td><code>{{ buildId }}</code></td>
                        </tr>
                        <tr>
                            <td class="text-muted">{{ $t('Platform') }}</td>
                            <td><code>{{ platformLabel }}</code></td>
                        </tr>
                        <tr>
                            <td class="text-muted">{{ $t('Backend') }}</td>
                            <td><code>{{ backendLabel }}</code></td>
                        </tr>
                        <tr>
                            <td class="text-muted">{{ $t('Database') }}</td>
                            <td><code>{{ dbLocation }}</code></td>
                        </tr>
                        <tr>
                            <td class="text-muted">{{ $t('Mode') }}</td>
                            <td><code>{{ isDevelopment ? $t('Development') : $t('Production') }}</code></td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </section>

        <!-- ── Session Info ────────────────────────────── -->
        <section class="card mb-4">
            <div class="card-header">
                <h5 class="mb-0">{{ $t('Session') }}</h5>
            </div>
            <div class="card-body">
                <table class="table table-sm table-borderless mb-0">
                    <tbody>
                        <tr>
                            <td class="text-muted" style="width: 160px;">{{ $t('Route') }}</td>
                            <td><code>{{ currentSection }}</code></td>
                        </tr>
                        <tr>
                            <td class="text-muted">{{ $t('Authenticated') }}</td>
                            <td><code>{{ identityLabel }}</code></td>
                        </tr>
                        <tr v-if="identityId">
                            <td class="text-muted">{{ $t('User ID') }}</td>
                            <td><code>{{ identityId }}</code></td>
                        </tr>
                        <tr v-for="(extra, idx) in identityExtra" :key="idx">
                            <td class="text-muted">{{ extra.label }}</td>
                            <td><code>{{ extra.value }}</code></td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </section>

        <!-- ── Environment ─────────────────────────────── -->
        <section class="card mb-4">
            <div class="card-header">
                <h5 class="mb-0">{{ $t('Environment') }}</h5>
            </div>
            <div class="card-body">
                <table class="table table-sm table-borderless mb-0">
                    <tbody>
                        <tr>
                            <td class="text-muted" style="width: 160px;">{{ $t('Window') }}</td>
                            <td><code>{{ windowWidth }} x {{ windowHeight }}</code></td>
                        </tr>
                        <tr>
                            <td class="text-muted">{{ $t('Mobile view') }}</td>
                            <td><code>{{ windowWidth < 768 }}</code></td>
                        </tr>
                        <tr>
                            <td class="text-muted">{{ $t('User Agent') }}</td>
                            <td><code class="user-agent-cell">{{ navigatorInfo }}</code></td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </section>

        <!-- ── Internal State (collapsible) ─────────────── -->
        <section class="card mb-4">
            <div class="card-header d-flex align-items-center justify-content-between"
                 @click="showInternal = !showInternal" style="cursor:pointer">
                <h5 class="mb-0">{{ $t('Internal State') }}</h5>
                <span class="small text-muted">{{ showInternal ? '▲' : '▼' }}</span>
            </div>
            <div v-if="showInternal" class="card-body">
                <pre class="internal-pre">{{ internalInfo }}</pre>
            </div>
        </section>
    </div>
</template>

<script setup>
import { computed, ref } from 'vue';

const props = defineProps({
    /** Current route or section name (displayed as the "Route" value) */
    currentSection: { type: String, default: '/' },
    /** Auth status label (e.g. "true"/"false" or "Guest"/"Authenticated") */
    identityLabel: { type: [String, Boolean], default: false },
    /** Identity/User ID to display (hidden when falsy) */
    identityId: { type: String, default: '' },
    /** Debug/internal state JSON to display in the collapsible section */
    internalInfo: { type: String, default: '' },
    /** Extra rows for the Session card, e.g. [{ label: 'Admin', value: 'Yes' }] */
    identityExtra: { type: Array, default: () => [] },
});

const isDevelopment = import.meta.env.DEV;
const buildId = import.meta.env.VITE_BUILD_ID || 'dev';

const windowWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 0);
const windowHeight = ref(typeof window !== 'undefined' ? window.innerHeight : 0);
const navigatorInfo = ref(typeof navigator !== 'undefined' ? navigator.userAgent : '');
const showInternal = ref(false);

const platformLabel = computed(() => {
    const cap = typeof window !== 'undefined' ? window.Capacitor : null;
    if (cap?.isNativePlatform?.()) {
        const p = cap.getPlatform();
        if (p === 'android') return 'Android (Capacitor)';
        if (p === 'ios') return 'iOS (Capacitor)';
        if (p === 'electron') return 'Electron (Capacitor)';
        return `Capacitor (${p})`;
    }
    if (/electron/i.test(navigator.userAgent)) return 'Electron (Chromium)';
    return 'Web Browser';
});

const backendLabel = computed(() => {
    if (typeof window !== 'undefined' && window.__factology_electron_fs) return 'SQLite (Electron preload)';
    const cap = typeof window !== 'undefined' ? window.Capacitor : null;
    if (cap?.isNativePlatform?.()) return 'SQLite (native)';
    return 'Dexie / IndexedDB';
});

const dbLocation = computed(() => {
    if (typeof window !== 'undefined' && window.__factology_db_path) {
        return window.__factology_db_path;
    }
    const cap = typeof window !== 'undefined' ? window.Capacitor : null;
    if (cap?.isNativePlatform?.()) {
        const p = cap.getPlatform();
        if (p === 'android') return 'Documents/factology/factology_local.sqlite (device storage)';
        if (p === 'ios') return 'AppGroup (group.com.factology.shared)';
        if (p === 'electron') return '~/.factology/factology_local.sqlite';
        return 'Shared SQLite (device storage)';
    }
    return 'Browser IndexedDB (Dexie)';
});
</script>

<style scoped>
.about-page {
    max-width: 660px;
    width: 100%;
}
.internal-pre {
    font-size: 11px;
    line-height: 1.4;
    background: var(--about-pre-bg, #f5f5f5);
    color: var(--about-pre-color, inherit);
    border-radius: 6px;
    padding: 12px;
    max-height: 300px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-all;
}
.user-agent-cell {
    font-size: 10px;
    word-break: break-all;
    max-width: 500px;
    display: inline-block;
}
</style>