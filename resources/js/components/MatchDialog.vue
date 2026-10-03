<template>
    <div class="modal fade" tabindex="-1" data-bs-backdrop="static" ref="modalRef">
        <div class="modal-dialog modal-dialog-centered modal-lg">
            <div class="modal-content">
                <div class="modal-header bg-primary text-white">
                    <h5 class="modal-title">{{ $t('MusicBrainz Match') }}</h5>
                    <button type="button" class="btn-close btn-close-white" @click="close"></button>
                </div>

                <div class="modal-body">

                    <!-- Error banner -->
                    <div v-if="errorMessage" class="alert alert-warning alert-dismissible fade show mb-3">
                        <strong>{{ $t('Error') }}:</strong> {{ errorMessage }}
                        <p v-if="isMusicBrainzError" class="mt-2 mb-0 small">
                            {{ $t('If you are in Russia, MusicBrainz is blocked without a VPN.') }}
                        </p>
                        <button type="button" class="btn-close" @click="errorMessage = ''"></button>
                    </div>

                    <!-- Info banner (success messages) -->
                    <div v-if="infoMessage" class="alert alert-success alert-dismissible fade show mb-3">
                        {{ infoMessage }}
                        <button type="button" class="btn-close" @click="infoMessage = ''"></button>
                    </div>

                    <!-- Search form -->
                    <div class="mb-2">
                        <label class="form-label small">{{ $t('Name') }}</label>
                        <input v-model="searchQuery" type="text" class="form-control form-control-sm"
                            :placeholder="object?.name || ''" @keyup.enter="doSearch" />
                    </div>
                    <div class="mb-2">
                        <label class="form-label small">{{ $t('Artist') }}</label>
                        <div class="d-flex gap-1 align-items-center">
                            <input v-model="searchArtist" type="text" class="form-control form-control-sm flex-fill"
                                list="match-artist-list"
                                :placeholder="object?.data?.artistName || object?.data?.artist || ''"
                                @keyup.enter="doSearch" @input="onArtistInput" />
                            <button type="button" class="btn btn-outline-primary btn-sm"
                                :disabled="albumsLoading || !searchArtist.trim()"
                                @click="loadAlbums" :title="$t('Load albums for this artist')">
                                <span v-if="albumsLoading" class="spinner-border spinner-border-sm"></span>
                                <span v-else>{{ $t('Albums') }}</span>
                            </button>
                            <span v-if="artistConfirmed" class="badge bg-success p-1" :title="$t('Artist matched on MusicBrainz')">✓</span>
                            <span v-else-if="selectedArtist?.externalId" class="badge bg-info p-1" :title="$t('Artist candidate selected')">?</span>
                        </div>
                    </div>
                    <div class="mb-2">
                        <label class="form-label small">{{ $t('Album') }}</label>
                        <div class="d-flex gap-1 align-items-center">
                            <input v-model="searchAlbum" type="text" class="form-control form-control-sm flex-fill"
                                list="match-album-list"
                                :placeholder="albumsLoaded ? $t('Select album to narrow search') : $t('Click Albums to load')"
                                @keyup.enter="doSearch" />
                            <span v-if="albumsCount > 0" class="badge bg-secondary" :title="$t('Albums loaded')">
                                {{ albumsCount }}
                            </span>
                        </div>
                    </div>
                    <div class="mb-2">
                        <button type="button" class="btn btn-primary w-100 btn-sm" @click="doSearch" :disabled="searching">
                            <span v-if="searching" class="spinner-border spinner-border-sm me-1" role="status"></span>
                            {{ searching ? $t('Searching...') : $t('Search MusicBrainz') }}
                        </button>
                    </div>
                    <datalist id="match-artist-list">
                        <option v-for="a in localArtists" :key="a.thing_id" :value="a.name" />
                    </datalist>
                    <datalist id="match-album-list">
                        <option v-for="a in albums" :key="a.mbid"
                            :value="a.year ? a.title + ' (' + a.year + ')' : a.title" />
                    </datalist>

                    <div class="d-flex gap-2 mb-2 flex-wrap">
                        <button v-if="rejected" type="button" class="btn btn-outline-primary" @click="resetSearch">
                            {{ $t('Search again') }}
                        </button>
                        <button type="button" class="btn btn-outline-secondary btn-sm" @click="rejectAll">
                            {{ $t("No match exists") }}
                        </button>
                    </div>

                    <!-- ════════════════════ SONG SECTION ════════════════════ -->
                    <div v-if="songResults.length" class="mb-3">
                        <h6 class="mb-1 section-heading">
                            <IconSearch class="section-icon" />
                            {{ $t('Songs') }}
                            <span class="badge bg-secondary ms-1">{{ songResults.length }}</span>
                        </h6>
                        <div
                            v-for="(c, idx) in songResults"
                            :key="c.externalId + '-song-' + idx"
                            class="candidate-card"
                            :class="{ selected: selectedSong?.externalId === c.externalId }"
                            @click="selectedSong = c"
                        >
                            <div class="candidate-name">{{ c.name }}</div>
                            <div class="candidate-meta">
                                <span v-if="c.disambiguation" class="text-muted small">{{ c.disambiguation }}</span>
                                <span class="badge bg-secondary ms-2">{{ c.type }}</span>
                                <span v-if="c.payload?.artist" class="text-muted small ms-1">{{ c.payload.artist }}</span>
                                <span v-if="c.payload?.album" class="text-muted small ms-1">
                                    {{ c.payload.album }}<template v-if="c.payload?.albumYear"> ({{ c.payload.albumYear }})</template>
                                </span>
                                <span v-if="c.year" class="badge bg-info ms-2">{{ c.year }}</span>
                                <span class="candidate-quality ms-2">{{ Math.round((c.matchQuality || 0) * 100) }}%</span>
                            </div>
                        </div>
                        <div class="d-flex mt-1">
                            <button type="button" class="btn btn-sm btn-success"
                                @click="confirmSong" :disabled="!selectedSong || confirming">
                                <span v-if="confirming" class="spinner-border spinner-border-sm me-1"></span>
                                {{ $t('Confirm Song') }}
                            </button>
                        </div>
                    </div>

                    <!-- ════════════════════ ARTIST SECTION ════════════════════ -->
                    <div v-if="artistResults.length" class="mb-3">
                        <h6 class="mb-1 section-heading">
                            <IconUser class="section-icon" />
                            {{ $t('Artists') }}
                            <span class="badge bg-secondary ms-1">{{ artistResults.length }}</span>
                        </h6>
                        <div
                            v-for="(c, idx) in artistResults"
                            :key="c.externalId + '-artist-' + idx"
                            class="candidate-card"
                            :class="{ selected: selectedArtist?.externalId === c.externalId }"
                            @click="selectedArtist = c"
                        >
                            <div class="candidate-name">{{ c.name }}</div>
                            <div class="candidate-meta">
                                <span v-if="c.disambiguation" class="text-muted small">{{ c.disambiguation }}</span>
                                <span class="badge bg-secondary ms-2">{{ c.type }}</span>
                                <span v-if="c.payload?.country" class="text-muted small ms-1">{{ c.payload.country }}</span>
                                <span v-if="c.year" class="badge bg-info ms-2">{{ c.year }}</span>
                                <span class="candidate-quality ms-2">{{ Math.round((c.matchQuality || 0) * 100) }}%</span>
                            </div>
                        </div>
                        <div class="d-flex mt-1">
                            <button type="button" class="btn btn-sm btn-success"
                                @click="confirmArtist" :disabled="!selectedArtist || confirming">
                                <span v-if="confirming" class="spinner-border spinner-border-sm me-1"></span>
                                {{ $t('Confirm Artist') }}
                            </button>
                        </div>
                    </div>

                    <!-- ════════════════════ ALBUM SECTION ════════════════════ -->
                    <div v-if="albumResults.length" class="mb-3">
                        <h6 class="mb-1 section-heading">
                            <IconPublic class="section-icon" />
                            {{ $t('Albums') }}
                            <span class="badge bg-secondary ms-1">{{ albumResults.length }}</span>
                        </h6>
                        <div
                            v-for="(c, idx) in albumResults"
                            :key="c.externalId + '-album-' + idx"
                            class="candidate-card"
                            :class="{ selected: selectedAlbum?.externalId === c.externalId }"
                            @click="selectedAlbum = c"
                        >
                            <div class="candidate-name">{{ c.name }}</div>
                            <div class="candidate-meta">
                                <span v-if="c.disambiguation" class="text-muted small">{{ c.disambiguation }}</span>
                                <span class="badge bg-secondary ms-2">{{ c.type }}</span>
                                <span v-if="c.payload?.artist" class="text-muted small ms-1">{{ c.payload.artist }}</span>
                                <span v-if="c.year" class="badge bg-info ms-2">{{ c.year }}</span>
                                <span class="candidate-quality ms-2">{{ Math.round((c.matchQuality || 0) * 100) }}%</span>
                            </div>
                        </div>
                        <div class="d-flex mt-1">
                            <button type="button" class="btn btn-sm btn-success"
                                @click="confirmAlbum" :disabled="!selectedAlbum || confirming">
                                <span v-if="confirming" class="spinner-border spinner-border-sm me-1"></span>
                                {{ $t('Confirm Album') }}
                            </button>
                        </div>
                    </div>

                    <!-- No results message -->
                    <div v-if="searched && !songResults.length && !artistResults.length && !albumResults.length && !searching" class="text-muted small mb-2">
                        {{ $t('No matches found on MusicBrainz.') }}
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
import { computed, ref, nextTick, watch } from 'vue';
import { useMatchingStore } from '../stores/matching';
import { IconSearch, IconUser, IconPublic } from './icons';

const props = defineProps({
    object: { type: Object, default: null },
    show: { type: Boolean, default: false },
    /** Pre-fetched candidates from auto-match cache (kept for backward compat) */
    candidates: { type: Array, default: () => [] },
});

const emit = defineEmits(['close', 'match-confirmed']);

const matchingStore = useMatchingStore();

const modalRef = ref(null);
let bsModal = null;

const errorMessage = ref('');
const infoMessage = ref('');
const searching = ref(false);
const confirming = ref(false);
const browsing = ref(false);
const searched = ref(false);

// Track rejection state
const rejected = ref(false);

// Search form
const searchQuery = ref('');
const searchArtist = ref('');
const searchAlbum = ref('');

// Album browser
const albums = ref([]);
const albumsLoading = ref(false);
const albumsLoaded = ref(false);
const albumsCount = computed(() => albums.value.length);

// Local artist suggestions for datalist
const localArtists = ref([]);

// Timeout handle for debounced artist search
let localArtistsTimeout = null;

// Categorized results
const songResults = ref([]);
const artistResults = ref([]);
const albumResults = ref([]);
const selectedSong = ref(null);
const selectedArtist = ref(null);
const selectedAlbum = ref(null);

// Auto-load albums when artist is selected from results
watch(selectedArtist, (val) => {
    if (val?.externalId && !artistConfirmed.value) {
        browseArtistAlbums();
    }
});

// Track what the user already confirmed so we don't re-show it
const artistConfirmed = ref(false);
const albumConfirmed = ref(false);

async function browseArtistAlbums() {
    if (!selectedArtist.value?.externalId || browsing.value) return;
    browsing.value = true;
    try {
        const albums = await matchingStore.browseArtistAlbums(selectedArtist.value.externalId);
        if (albums && albums.length) {
            albumResults.value = albums;
            selectedAlbum.value = albums[0];
        } else {
            errorMessage.value = 'No albums found for this artist.';
        }
    } catch (err) {
        errorMessage.value = err.message;
    } finally {
        browsing.value = false;
    }
}

/** Load albums for the typed artist from MusicBrainz into the album datalist */
async function loadAlbums() {
    const name = searchArtist.value.trim();
    if (!name) return;
    albumsLoading.value = true;
    albumsLoaded.value = false;
    albums.value = [];
    try {
        const albumsList = await matchingStore.searchArtistAlbums(name);
        if (albumsList && albumsList.length) {
            albums.value = albumsList;
            albumsLoaded.value = true;
        } else {
            errorMessage.value = 'No albums found for this artist on MusicBrainz.';
        }
    } catch (err) {
        errorMessage.value = err.message;
    } finally {
        albumsLoading.value = false;
    }
}

/** Load local artists for the datalist */
async function loadLocalArtists() {
    try {
        localArtists.value = await matchingStore.searchLocalArtists(searchArtist.value || '');
    } catch { /* non-critical */ }
}

/** Called on artist input — debounce-reload local artist suggestions */
function onArtistInput() {
    if (localArtistsTimeout) clearTimeout(localArtistsTimeout);
    localArtistsTimeout = setTimeout(() => loadLocalArtists(), 300);
}

/** Detect MusicBrainz connectivity errors to show a localized VPN hint */
const isMusicBrainzError = computed(() => {
    return errorMessage.value?.includes('Could not reach MusicBrainz') ?? false;
});

watch(() => props.show, async (val) => {
    if (val) {
        await nextTick();
        const Modal = (await import('bootstrap/js/dist/modal')).default;
        bsModal = new Modal(modalRef.value);
        // Initialize search fields from object
        searchQuery.value = props.object?.name || '';
        searchArtist.value = props.object?.data?.artistName || props.object?.data?.artist || '';
        searchAlbum.value = '';
        searched.value = false;
        songResults.value = [];
        artistResults.value = [];
        albumResults.value = [];
        selectedSong.value = null;
        selectedArtist.value = null;
        selectedAlbum.value = null;
        artistConfirmed.value = false;
        albumConfirmed.value = false;
        errorMessage.value = '';
        infoMessage.value = '';
        albums.value = [];
        albumsLoaded.value = false;

        // Pre-populate with cached candidates as song results
        if (props.candidates && props.candidates.length) {
            songResults.value = [...props.candidates];
            selectedSong.value = songResults.value[0];
        }

        // Load local artists for the datalist
        loadLocalArtists();

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

function resetSearch() {
    searched.value = false;
    rejected.value = false;
    songResults.value = [];
    artistResults.value = [];
    albumResults.value = [];
    selectedSong.value = null;
    selectedArtist.value = null;
    selectedAlbum.value = null;
    errorMessage.value = '';
    infoMessage.value = '';
}

async function doSearch() {
    if (!props.object) return;
    searching.value = true;
    errorMessage.value = '';
    infoMessage.value = '';
    searched.value = false;

    try {
        const q = searchQuery.value || props.object.name;
        const ctx = {
            artist: searchArtist.value || props.object?.data?.artistName || props.object?.data?.artist || '',
        };
        // Pass release (album) context when user has selected one — this
        // triggers the release-browse path in searchSongs which finds
        // canonical album recordings instead of Lucene search
        if (searchAlbum.value.trim()) {
            ctx.release = searchAlbum.value.trim();
            // Strip trailing year suffix "(YYYY)" added by the datalist
            ctx.release = ctx.release.replace(/\s*\(\d{4}\)\s*$/, '');
        }

        const { songs, artists, albums } = await matchingStore.manualSearchAll(q, ctx);

        songResults.value = songs;
        artistResults.value = artists;
        albumResults.value = albums;
        searched.value = true;

        if (songs.length) selectedSong.value = songs[0];
        if (artists.length) selectedArtist.value = artists[0];
        if (albums.length) selectedAlbum.value = albums[0];
    } catch (err) {
        errorMessage.value = err.message;
    } finally {
        searching.value = false;
    }
}

async function confirmSong() {
    if (!selectedSong.value || !props.object || confirming.value) return;
    confirming.value = true;
    try {
        await matchingStore.confirm(props.object.thing_id, selectedSong.value);
        infoMessage.value = `Song matched to "${selectedSong.value.name}".`;
        selectedSong.value = null;
        emit('match-confirmed');
    } catch (err) {
        errorMessage.value = err.message;
    } finally {
        confirming.value = false;
    }
}

async function confirmArtist() {
    if (!selectedArtist.value || !props.object || confirming.value) return;
    confirming.value = true;
    try {
        await matchingStore.confirmArtist(props.object.thing_id, selectedArtist.value);
        infoMessage.value = `Artist "${selectedArtist.value.name}" saved and linked to this song.`;
        artistConfirmed.value = true;
        selectedArtist.value = null;
        artistResults.value = [];
        emit('match-confirmed');
    } catch (err) {
        errorMessage.value = err.message;
    } finally {
        confirming.value = false;
    }
}

async function confirmAlbum() {
    if (!selectedAlbum.value || !props.object || confirming.value) return;
    confirming.value = true;
    try {
        await matchingStore.confirmAlbum(props.object.thing_id, selectedAlbum.value);
        infoMessage.value = `Album "${selectedAlbum.value.name}" saved and linked to this song.`;
        albumConfirmed.value = true;
        selectedAlbum.value = null;
        albumResults.value = [];
        emit('match-confirmed');
    } catch (err) {
        errorMessage.value = err.message;
    } finally {
        confirming.value = false;
    }
}

async function rejectAll() {
    if (!props.object) return;
    try {
        await matchingStore.reject(props.object.thing_id);
        rejected.value = true;
        songResults.value = [];
        artistResults.value = [];
        albumResults.value = [];
    } catch (err) {
        errorMessage.value = err.message;
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
.section-heading {
    font-size: 0.85rem;
    font-weight: 600;
    color: #374151;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 0;
    border-bottom: 1px solid #e5e7eb;
}
.section-icon {
    width: 18px;
    height: 18px;
    opacity: 0.7;
}
</style>