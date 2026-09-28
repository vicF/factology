// @factology/engine — public entry.
//
// Universal, Vue-free core shared by every Factology-family app
// (Factology, Pawlo, Genealogy, …). Modules are progressively moved here
// from resources/js as they are decoupled from the UI layer.

export const ENGINE_NAME = '@factology/engine';
export const ENGINE_VERSION = '0.1.0';

// ── Constants (moved from resources/js/constants) ──
export * from './constants/uuid.js';
export * from './constants/eras.js';
export * from './constants/syncStatus.js';

// ── External object matching (providers, matcher, promoter) ──
export { registerProvider, getProvider, getProvidersForClasses, listProviders } from './external/registry.js';
export { HttpClient } from './external/client.js';
export {
    initMatcher, matchObject, scheduleMatch, scheduleAllUnmatched,
    ensurePeriodicRetry, stopPeriodicRetry, confirmMatch, rejectMatch, getMatchState,
} from './external/matcher.js';
export { promoteObject, remapReferences } from './external/promoter.js';
export { searchProvider, fetchById as externalFetchById } from './external/search.js';

// ── MusicBrainz provider (most commonly used) ──
export {
    registerMusicBrainzProvider,
    searchArtists, searchSongs, albumTracks, browseReleases, earliestOfficialAlbums,
    servicePaused, resetClientState,
} from './external/providers/musicbrainz.js';
