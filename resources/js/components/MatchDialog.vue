<template>
    <div class="modal fade" tabindex="-1" data-bs-backdrop="static" ref="modalRef">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content">
                <div class="modal-header bg-primary text-white">
                    <h5 class="modal-title">{{ $t('MusicBrainz Match') }}</h5>
                    <button type="button" class="btn-close btn-close-white" @click="close"></button>
                </div>

                <div class="modal-body">
                    <!-- Error state -->
                    <div v-if="viewState === 'error'" class="mb-3">
                        <div class="alert alert-warning">
                            <strong>{{ $t('Error') }}:</strong> {{ errorMessage || $t('An unexpected error occurred.') }}
                        </div>
                        <button type="button" class="btn btn-warning" @click="retrySearch" :disabled="searching">
                            {{ searching ? $t('Searching...') : $t('Retry') }}
                        </button>
                    </div>

                    <!-- Rejected state -->
                    <div v-if="viewState === 'rejected'" class="mb-3">
                        <p>{{ $t('You rejected all MusicBrainz matches for this object.') }}</p>
                        <p>{{ $t('Would you like to search again?') }}</p>
                        <div class="d-flex gap-2">
                            <button type="button" class="btn btn-primary" @click="resetSearchForm">
                                {{ $t('Search again') }}
                            </button>
                            <button type="button" class="btn btn-secondary" @click="close">
                                {{ $t('Close') }}
                            </button>
                        </div>
                    </div>

                    <!-- Pending / auto-found state -->
                    <div v-if="viewState === 'pending'" class="mb-3">
                        <p v-if="bestCandidate" class="mb-2">
                            <strong>{{ $t('Best match') }}:</strong>
                        </p>
                        <div v-if="bestCandidate" class="candidate-card selected mb-3" @click="selectedCandidate = bestCandidate">
                            <div class="candidate-name">{{ bestCandidate.name }}</div>
                            <div class="candidate-meta">
                                <span v-if="bestCandidate.disambiguation" class="text-muted small">{{ bestCandidate.disambiguation }}</span>
                                <span v-if="bestCandidate.type" class="badge bg-secondary ms-2">{{ bestCandidate.type }}</span>
                                <span v-if="bestCandidate.payload?.artist && bestCandidate.payload?.artist !== bestCandidate.name" class="text-muted small ms-1">{{ bestCandidate.payload.artist }}</span>
                                <span v-if="bestCandidate.payload?.album" class="text-muted small ms-1">{{ bestCandidate.payload.album }}<template v-if="bestCandidate.payload?.albumYear"> ({{ bestCandidate.payload.albumYear }})</template></span>
                                <span v-if="bestCandidate.year" class="badge bg-info ms-2">{{ bestCandidate.year }}</span>
                                <span class="candidate-quality ms-2">
                                    {{ Math.round((bestCandidate.matchQuality || 0) * 100) }}%
                                </span>
                            </div>
                        </div>

                        <div v-if="otherCandidates.length" class="mt-3">
                            <p class="mb-2"><strong>{{ $t('Other results') }}:</strong></p>
                            <div
                                v-for="(c, idx) in otherCandidates"
                                :key="c.externalId + idx"
                                class="candidate-card"
                                :class="{ selected: selectedCandidate?.externalId === c.externalId }"
                                @click="selectedCandidate = c"
                            >
                                <div class="candidate-name">{{ c.name }}</div>
                                <div class="candidate-meta">
                                    <span v-if="c.disambiguation" class="text-muted small">{{ c.disambiguation }}</span>
                                    <span v-if="c.type" class="badge bg-secondary ms-2">{{ c.type }}</span>
                                    <span v-if="c.payload?.artist && c.payload?.artist !== c.name" class="text-muted small ms-1">{{ c.payload.artist }}</span>
                                    <span v-if="c.payload?.album" class="text-muted small ms-1">{{ c.payload.album }}<template v-if="c.payload?.albumYear"> ({{ c.payload.albumYear }})</template></span>
                                    <span v-if="c.year" class="badge bg-info ms-2">{{ c.year }}</span>
                                    <span class="candidate-quality ms-2">
                                        {{ Math.round((c.matchQuality || 0) * 100) }}%
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div class="d-flex gap-2 mt-3 flex-wrap">
                            <button type="button" class="btn btn-success" @click="confirmSelection" :disabled="!selectedCandidate || confirming">
                                {{ confirming ? $t('Confirming...') : ($t('Confirm') + ' — ' + (selectedCandidate?.name || '')) }}
                            </button>
                            <button type="button" class="btn btn-outline-primary" @click="resetSearchForm">
                                {{ $t('Search again') }}
                            </button>
                            <button type="button" class="btn btn-outline-secondary" @click="rejectAll">
                                {{ $t("No match exists") }}
                            </button>
                        </div>
                    </div>

                    <!-- Search form (for unmatched / none / or search-again) -->
                    <div v-if="viewState === 'unmatched' || viewState === 'none' || showSearchForm" class="mb-3">
                        <div v-if="searching" class="d-flex align-items-center gap-2 mb-2 text-muted">
                            <span class="spinner-border spinner-border-sm" role="status"></span>
                            <small>{{ $t('Searching MusicBrainz...') }}</small>
                        </div>
                        <div class="mb-2">
                            <label class="form-label small">{{ $t('Name') }}</label>
                            <input v-model="searchQuery" type="text" class="form-control form-control-sm" :placeholder="object?.name || ''" />
                        </div>
                        <div class="mb-2">
                            <label class="form-label small">{{ $t('Artist') }}</label>
                            <input v-model="searchArtist" type="text" class="form-control form-control-sm" :placeholder="object?.data?.artist || ''" />
                        </div>
                        <div class="d-flex gap-2">
                            <button type="button" class="btn btn-primary" @click="retrySearch" :disabled="searching">
                                {{ searching ? $t('Searching...') : $t('Search MusicBrainz') }}
                            </button>
                            <button v-if="viewState !== 'pending'" type="button" class="btn btn-outline-secondary" @click="rejectAll">
                                {{ $t("No match exists") }}
                            </button>
                        </div>

                        <!-- Search results in search mode -->
                        <div v-if="searchResults.length" class="mt-3">
                            <p class="mb-2"><strong>{{ $t('Results') }}:</strong></p>
                            <div
                                v-for="(c, idx) in searchResults"
                                :key="c.externalId + idx"
                                class="candidate-card"
                                :class="{ selected: selectedCandidate?.externalId === c.externalId }"
                                @click="selectedCandidate = c"
                            >
                                <div class="candidate-name">{{ c.name }}</div>
                                <div class="candidate-meta">
                                    <span v-if="c.disambiguation" class="text-muted small">{{ c.disambiguation }}</span>
                                    <span v-if="c.type" class="badge bg-secondary ms-2">{{ c.type }}</span>
                                    <span v-if="c.payload?.artist && c.payload?.artist !== c.name" class="text-muted small ms-1">{{ c.payload.artist }}</span>
                                    <span v-if="c.payload?.album" class="text-muted small ms-1">{{ c.payload.album }}<template v-if="c.payload?.albumYear"> ({{ c.payload.albumYear }})</template></span>
                                    <span v-if="c.year" class="badge bg-info ms-2">{{ c.year }}</span>
                                    <span class="candidate-quality ms-2">
                                        {{ Math.round((c.matchQuality || 0) * 100) }}%
                                    </span>
                                </div>
                            </div>
                            <div v-if="selectedCandidate" class="d-flex gap-2 mt-3">
                                <button type="button" class="btn btn-success" @click="confirmSelection" :disabled="confirming">
                                    {{ confirming ? $t('Confirming...') : ($t('Confirm') + ' — ' + selectedCandidate.name) }}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" @click="close">{{ $t('Close') }}</button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, nextTick, watch } from 'vue';
import { useMatchingStore } from '../stores/matching';

const props = defineProps({
    object: { type: Object, default: null },
    show: { type: Boolean, default: false },
    /** Pre-fetched candidates from auto-match cache */
    candidates: { type: Array, default: () => [] },
});

const emit = defineEmits(['close', 'match-confirmed']);

const matchingStore = useMatchingStore();

const modalRef = ref(null);
let bsModal = null;

const viewState = ref('unmatched'); // error | rejected | pending | unmatched
const errorMessage = ref('');
const searching = ref(false);
const confirming = ref(false);
const showSearchForm = ref(false);
const searchQuery = ref('');
const searchArtist = ref('');
const searchResults = ref([]);
const selectedCandidate = ref(null);

// Derived view state from props
watch([() => props.object, () => props.candidates], async ([obj, cands]) => {
    if (!obj) return;
    selectedCandidate.value = null;
    searchResults.value = [];
    showSearchForm.value = false;

    const state = matchingStore.matchState(obj).state;
    viewState.value = state;

    if (state === 'pending' && cands.length) {
        const sorted = [...cands].sort((a, b) => (b.matchQuality || 0) - (a.matchQuality || 0));
        selectedCandidate.value = sorted[0] || null;
    }
}, { immediate: true });

const bestCandidate = computed(() => {
    const sorted = [...props.candidates].sort((a, b) => (b.matchQuality || 0) - (a.matchQuality || 0));
    return sorted[0] || null;
});

const otherCandidates = computed(() => {
    const best = bestCandidate.value;
    return best ? props.candidates.filter((c) => c.externalId !== best.externalId) : [];
});

watch(() => props.show, async (val) => {
    if (val) {
        await nextTick();
        const Modal = (await import('bootstrap/js/dist/modal')).default;
        bsModal = new Modal(modalRef.value);
        bsModal.show();
    }
});

function close() {
    if (bsModal) {
        bsModal.hide();
        bsModal = null;
    }
    emit('close');
}

async function confirmSelection() {
    if (!selectedCandidate.value || !props.object) return;
    confirming.value = true;
    try {
        await matchingStore.confirm(props.object.thing_id, selectedCandidate.value);
        emit('match-confirmed');
        close();
    } catch (err) {
        errorMessage.value = err.message;
        viewState.value = 'error';
    } finally {
        confirming.value = false;
    }
}

async function rejectAll() {
    if (!props.object) return;
    try {
        await matchingStore.reject(props.object.thing_id);
        viewState.value = 'rejected';
    } catch (err) {
        errorMessage.value = err.message;
        viewState.value = 'error';
    }
}

function resetSearchForm() {
    showSearchForm.value = true;
    searchQuery.value = props.object?.name || '';
    searchArtist.value = props.object?.data?.artist || '';
    viewState.value = 'unmatched';
    selectedCandidate.value = null;
    searchResults.value = [];
}

async function retrySearch() {
    if (!props.object) return;
    searching.value = true;
    errorMessage.value = '';
    try {
        const q = searchQuery.value || props.object.name;
        const ctx = { artist: searchArtist.value || props.object?.data?.artist || '' };
        const results = await matchingStore.manualSearch(props.object.thing_id, q, ctx);
        searchResults.value = results;
        if (results.length) {
            selectedCandidate.value = results[0];
            viewState.value = 'pending';
        } else {
            viewState.value = 'unmatched';
        }
    } catch (err) {
        errorMessage.value = err.message;
        viewState.value = 'error';
    } finally {
        searching.value = false;
    }
}
</script>

<style scoped>
.candidate-card {
    padding: 8px 12px;
    border: 1px solid #dee2e6;
    border-radius: 6px;
    margin-bottom: 4px;
    cursor: pointer;
    transition: background-color 0.15s;
}
.candidate-card:hover {
    background-color: #f0f4ff;
}
.candidate-card.selected {
    border-color: #2563eb;
    background-color: #dbeafe;
}
.candidate-name {
    font-weight: 600;
    font-size: 0.95rem;
}
.candidate-meta {
    font-size: 0.8rem;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
}
.candidate-quality {
    color: #6b7280;
    font-size: 0.75rem;
}
</style>