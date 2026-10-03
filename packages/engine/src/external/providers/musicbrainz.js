// packages/engine/src/external/providers/musicbrainz.js
//
// MusicBrainz provider adapter. Translates SetTempo's client.js API calls
// into the generic Candidate interface used by the matcher/registry.

import { UUID } from '../../constants/uuid.js';
import { registerProvider } from '../registry.js';

// ── Constants ──

/** MusicBrainz supports CORS, so the API can be called directly from the browser. */
const API_BASE = 'https://musicbrainz.org/ws/2';

const MB_MIN_INTERVAL_MS = 1100;
let lastMbCallAt = 0;
let blockedUntilMs = 0;
let blockedNote = '';
let consecutiveFailures = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForMbSlot() {
    const now = Date.now();
    const wait = lastMbCallAt + MB_MIN_INTERVAL_MS - now;
    if (wait > 0) await sleep(wait);
    lastMbCallAt = Date.now();
}

function failureKind(status, detail) {
    if (status === 429) return 'rate';
    if (/rate\s*limit|too many request|slow\s*down/i.test(detail)) return 'rate';
    if (status === 503 && /currently busy|temporari|try again later|unavailable|server overload/i.test(detail)) {
        return 'busy';
    }
    if (status >= 500) return 'busy';
    return 'other';
}

export function resetClientState() {
    lastMbCallAt = 0;
    blockedUntilMs = 0;
    blockedNote = '';
}

export function servicePaused() {
    const remaining = blockedUntilMs - Date.now();
    return remaining > 0 ? remaining : 0;
}

async function get(endpoint, params = {}) {
    const rel = `${API_BASE}/${endpoint}`;
    const url = API_BASE.startsWith('http')
        ? new URL(rel)
        : new URL(rel, (typeof location !== 'undefined' ? location.href : 'http://localhost/'));
    for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, String(v));
    }
    url.searchParams.set('fmt', 'json');

    const transient = new Set([429, 500, 502, 503, 504]);
    // User-Agent is a forbidden header in browser fetch();
    // the browser supplies its own UA, which MusicBrainz accepts.
    const headers = {
        Accept: 'application/json',
    };

    const now = Date.now();
    if (blockedUntilMs > now) {
        const s = Math.ceil((blockedUntilMs - now) / 1000);
        throw new Error(`${blockedNote || 'MusicBrainz is rate-limiting requests'} — wait ~${s}s and retry.`);
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
        await waitForMbSlot();
        let res;
        try {
            res = await fetch(url, { headers });
        } catch (e) {
            if (attempt < 2) {
                await sleep(700 * (attempt + 1));
                continue;
            }
            throw new Error(`Could not reach MusicBrainz. Check your connection or enable a VPN if MusicBrainz is blocked in your region.`);
        }
        if (res.ok) {
            blockedUntilMs = 0;
            consecutiveFailures = 0;
            return res.json();
        }
        if (transient.has(res.status) && attempt < 2) {
            await sleep(700 * (attempt + 1));
            continue;
        }
        let detail = '';
        try { detail = (await res.text()).slice(0, 300).replace(/\s+/g, ' ').trim(); } catch { /* ignore */ }
        const kind = failureKind(res.status, detail);
        let retryAfter = 0;
        try {
            if (typeof res.headers?.get === 'function') {
                const ra = Number.parseInt(res.headers.get('retry-after') || '', 10);
                if (Number.isFinite(ra) && ra > 0) retryAfter = ra;
            }
        } catch { /* ignore */ }
        let cooldown = 0;
        let note = '';
        if (kind === 'rate' || kind === 'busy') {
            consecutiveFailures += 1;
            const base = Math.max(5 * 60_000, retryAfter * 1000);
            const multiplier = Math.min(Math.pow(2, consecutiveFailures - 1), 12);
            cooldown = base * multiplier;
            note = kind === 'rate'
                ? 'MusicBrainz is rate-limiting requests'
                : 'MusicBrainz is temporarily busy';
        }
        if (cooldown > 0) {
            blockedUntilMs = Date.now() + cooldown;
            blockedNote = note;
        }
        const hint = note ? ` — ${note}; wait a bit and retry.` : '';
        throw new Error(
            `MusicBrainz request failed (${res.status}) for "${endpoint}".${detail ? ` Response: ${detail}` : ''}${hint}`
        );
    }
    throw new Error(`MusicBrainz request failed for "${endpoint}".`);
}

// ── Lucene-safe term ──

function safeTerm(value) {
    return String(value ?? '')
        .replace(/["()[\]{}*?~^:\\+\-=<>|&/!]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200);
}

// ── Normalization ──

const normText = (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();

function normalizeToCandidate(item, type, qualityBoost = 0) {
    const quality = (item.matchQuality ?? 0.5) + qualityBoost;
    return {
        providerKey: 'musicbrainz',
        externalId: item.mbid,
        name: item.title || item.name || '',
        disambiguation: item.disambiguation || '',
        matchQuality: Math.min(quality, 1),
        type,
        year: item.albumYear || item.year || item.begin || '',
        payload: item,
    };
}

// ── Artist helpers ──

function normalizeArtist(a) {
    return {
        mbid: a.id,
        name: a.name || '',
        disambiguation: a.disambiguation || '',
        type: a.type || '',
        country: a.country || '',
        begin: a['life-span']?.begin || '',
        ended: a['life-span']?.ended ?? false,
        matchQuality: a.score ? a.score / 100 : 0.5,
    };
}

// ── Recording (song) helpers ──

function pickRelease(r) {
    const rels = (r.releases || []).filter((x) => x && (x.title || x.date));
    if (rels.length === 0) return null;
    const chosen = rels.find((x) => x.date) || rels[0];
    const date = chosen.date || '';
    return {
        album: chosen.title || '',
        albumDate: date,
        albumYear: /^\d{4}/.test(date) ? date.slice(0, 4) : '',
    };
}

function normalizeRecording(r) {
    const artist = (r['artist-credit'] || [])
        .filter((c) => c.artist)
        .map((c) => c.name || c.artist?.name)
        .join('');
    const rel = pickRelease(r);
    return {
        mbid: r.id,
        title: r.title || '',
        artist,
        lengthMs: r.length || null,
        firstReleaseDate: r['first-release-date'] || '',
        disambiguation: r.disambiguation || '',
        album: rel?.album ?? '',
        albumDate: rel?.albumDate ?? '',
        albumYear: rel?.albumYear ?? '',
        matchQuality: r.score ? r.score / 100 : 0.5,
    };
}

function dedupeRecordings(rows) {
    const seen = new Set();
    const out = [];
    for (const r of rows) {
        const key = [r.title, r.disambiguation, r.album, r.albumYear, r.firstReleaseDate].join('|');
        if (!seen.has(key)) {
            seen.add(key);
            out.push(r);
        }
    }
    return out;
}

function rankSongs(rows, title) {
    const q = normText(title);
    const exact = (r) => (normText(r.title) === q ? 1 : 0);
    const albumYearVal = (r) => {
        if (!r.albumYear) return null;
        const y = parseInt(r.albumYear, 10);
        return Number.isFinite(y) ? y : null;
    };
    const dateVal = (r) => {
        if (!r.firstReleaseDate) return null;
        const t = Date.parse(r.firstReleaseDate);
        return Number.isNaN(t) ? null : t;
    };
    return rows.slice().sort((a, b) => {
        const ea = exact(a);
        const eb = exact(b);
        if (ea !== eb) return eb - ea;
        const ay = albumYearVal(a);
        const by = albumYearVal(b);
        if (ay !== null && by !== null && ay !== by) return ay - by;
        if (ay === null && by !== null) return 1;
        if (ay !== null && by === null) return -1;
        const ad = dateVal(a);
        const bd = dateVal(b);
        if (ad === null && bd === null) return 0;
        if (ad === null) return 1;
        if (bd === null) return -1;
        return ad - bd;
    });
}

// ── Release helpers ──

const creditName = (credit) => (credit || [])
    .filter((c) => c.artist)
    .map((c) => c.name || c.artist?.name)
    .join('');

function releaseDateOf(rel) {
    return rel.date
        || rel['release-events']?.[0]?.date
        || rel['release-group']?.['first-release-date']
        || '';
}

const releaseYearOf = (rel) => {
    const d = releaseDateOf(rel);
    return /^\d{4}/.test(d) ? d.slice(0, 4) : '';
};

function normalizeRelease(r) {
    return {
        mbid: r.id,
        title: r.title || '',
        artist: creditName(r['artist-credit']),
        status: r.status || '',
        type: r['primary-type'] || r['release-group']?.['primary-type'] || '',
        year: releaseYearOf(r),
    };
}

function chooseRelease(rows, name) {
    const q = normText(name);
    const official = rows.filter((r) => !r.status || normText(r.status) === 'official');
    const pool = official.length ? official : rows;
    const named = pool.filter((r) => normText(r.title) === q);
    const namedAlbums = named.filter((r) => normText(r.type) === 'album');
    const base = namedAlbums.length ? namedAlbums : (named.length ? named : pool);
    const sorted = base.slice().sort((a, b) => String(a.year || '9999').localeCompare(String(b.year || '9999')));
    return sorted[0] || rows[0] || null;
}

export function earliestOfficialAlbums(rows) {
    return rows
        .filter((r) => (!r.status || normText(r.status) === 'official') && normText(r.type) === 'album')
        .slice()
        .sort((a, b) => String(a.year || '9999').localeCompare(String(b.year || '9999')));
}

// ── Release-group (Album) helpers ──

function normalizeReleaseGroup(rg) {
    const artist = (rg['artist-credit'] || [])
        .filter((c) => c.artist)
        .map((c) => c.name || c.artist?.name)
        .join('');
    return {
        mbid: rg.id,
        name: rg.title || '',
        artist,
        type: rg['primary-type'] || rg['secondary-type'] || '',
        disambiguation: rg.disambiguation || '',
        firstReleaseDate: rg['first-release-date'] || '',
        year: rg['first-release-date'] ? rg['first-release-date'].slice(0, 4) : '',
        matchQuality: rg.score ? rg.score / 100 : 0.5,
    };
}

/**
 * Search for release-groups (albums) matching the query.
 * @param {string} query
 * @param {object} [ctx]
 * @param {string} [ctx.artist]
 * @returns {Promise<import('../types').Candidate[]>}
 */
export async function searchAlbums(query, ctx = {}) {
    const parts = [`release:${safeTerm(query)}`];
    if (ctx.artist) parts.push(`artist:${safeTerm(ctx.artist)}`);
    const data = await get('release-group', {
        query: parts.join(' AND '),
        limit: 15,
    });
    const groups = (data['release-groups'] || []).map(normalizeReleaseGroup);
    // Deduplicate by name+artist
    const seen = new Set();
    const deduped = [];
    for (const g of groups) {
        const key = [g.name, g.artist, g.type].join('|');
        if (!seen.has(key)) {
            seen.add(key);
            deduped.push(g);
        }
    }
    return deduped.map((g) => normalizeToCandidate(g, 'Album', 0.1));
}

// ── Public API (Candidate interface) ──

/**
 * Search for artists matching the query.
 * @param {string} query
 * @param {object} [_ctx]
 * @returns {Promise<import('../types').Candidate[]>}
 */
export async function searchArtists(query, _ctx) {
    const data = await get('artist', { query: `artist:${safeTerm(query)}`, limit: 8 });
    return (data.artists || []).map(normalizeArtist)
        .map((a) => normalizeToCandidate(a, 'Artist', 0.1));
}

/**
 * Search for recordings (songs) matching the query.
 * When ctx.release is provided, browses the release tracklist instead
 * of Lucene search (which buries canonical takes under live/bootleg).
 * @param {string} query  — Song title
 * @param {object} [ctx]
 * @param {string} [ctx.artist]
 * @param {string} [ctx.release]
 * @param {object} [ctx.data]
 * @returns {Promise<import('../types').Candidate[]>}
 */
export async function searchSongs(query, ctx = {}) {
    const title = query;
    const { artist, release } = ctx;

    let releaseBrowseFailed = false;

    if (release && release.trim()) {
        try {
            // Step 1: resolve artist → MBID for browse endpoint
            let artistMbid = null;
            if (artist) {
                const ad = await get('artist', { query: `artist:${safeTerm(artist)}`, limit: 3 });
                artistMbid = (ad.artists || [])[0]?.id;
            }
            if (artistMbid) {
                // Step 2: browse ALL release-groups for the artist (up to 100)
                // This is far more reliable than Lucene text search because:
                // - Release endpoint returns every format variant (CD/vinyl/digital/territory)
                // - Lucene rank buries 1971 originals under re-releases
                const rgData = await get('release-group', {
                    artist: artistMbid,
                    limit: 100,
                });
                const groups = (rgData['release-groups'] || []).map(normalizeReleaseGroup);
                // Step 3: filter by album-type, exact name match, earliest year
                const q = normText(release);
                const albums = groups.filter((g) => normText(g.name) === q && normText(g.type) === 'album');
                if (albums.length) {
                    albums.sort((a, b) => String(a.year || '9999').localeCompare(String(b.year || '9999')));
                    const bestGroup = albums[0];
                    // Step 4: get an official release within this group for tracklist browsing
                    const relData = await get('release', {
                        'release-group': bestGroup.mbid,
                        status: 'official',
                        limit: 1,
                    }).catch(() => null);
                    const chosen = relData ? (relData.releases || []).map(normalizeRelease)[0] : null;
                    if (chosen) {
                        const rows = await albumTracks(chosen);
                        const q = normText(title);
                        const exact = rows.filter((r) => normText(r.title) === q);
                        if (exact.length) return rankSongs(dedupeRecordings(exact), title)
                            .map((r) => normalizeToCandidate(r, 'Song', 0.2));
                        if (rows.length) return rankSongs(dedupeRecordings(rows), title)
                            .map((r) => normalizeToCandidate(r, 'Song', 0.1));
                    }
                }
            }
        } catch (e) {
            releaseBrowseFailed = true;
            console.warn('[MB] Release-browse path failed:', e?.message || String(e));
        }
    }

    const parts = [`recording:${safeTerm(title)}`];
    if (artist) parts.push(`artist:${safeTerm(artist)}`);
    if (release) parts.push(`release:${safeTerm(release)}`);
    const data = await get('recording', {
        query: parts.join(' AND '),
        limit: 25,
        inc: 'artist-credits+releases',
    });
    let rows = (data.recordings || []).map(normalizeRecording);

    // Supplement with tracks from the artist's official albums.
    // Also run when release was provided but the release-browse path
    // failed (e.g. rate-limited or too many release-groups) — this way
    // Lucene results get canonical album data added.
    if (artist && (!release || releaseBrowseFailed)) {
        try {
            const artistData = await get('artist', { query: `artist:${safeTerm(artist)}`, limit: 3 });
            const best = (artistData.artists || [])[0];
            if (best?.id) {
                const all = await browseReleases(best.id);
                const albums = earliestOfficialAlbums(all);
                const q = normText(title);
                const supplementRecording = async (album) => {
                    const tracks = await albumTracks(album);
                    const matching = tracks.filter((r) => normText(r.title) === q);
                    if (matching.length) {
                        const existingMbids = new Set(rows.map((r) => r.mbid));
                        for (const t of matching) {
                            if (!existingMbids.has(t.mbid)) {
                                rows.push(t);
                            } else {
                                // MBID already in Lucene results, but with a
                            // weaker/compilation album — overwrite with the
                            // canonical album info from the official release
                            const existing = rows.find((r) => r.mbid === t.mbid);
                            if (existing) {
                                const idx = rows.indexOf(existing);
                                rows[idx].album = t.album;
                                rows[idx].albumDate = t.albumDate;
                                rows[idx].albumYear = t.albumYear;
                                rows[idx].matchQuality = Math.max(rows[idx].matchQuality, t.matchQuality);
                            }
                            }
                        }
                        return true;
                    }
                    return false;
                };
                let found = false;
                for (const album of albums) {
                    if (await supplementRecording(album)) {
                        found = true;
                        break;
                    }
                }
                // Fallback: browseReleases(limit=50, newest-first) may not include
                // the canonical album (e.g. 1971 "Imagine" under hundreds of
                // compilations). Search for a release matching the song title.
                // NOTE: Always runs, even when the supplement loop found a match,
                // because compilations often include the song but we want the
                // canonical original album for better match quality.
                {
                    const releaseData = await get('release', {
                        query: `release:${safeTerm(title)} AND artist:${safeTerm(artist)}`,
                        limit: 5,
                        inc: 'release-groups',
                    }).catch(() => null);
                    if (releaseData?.releases?.length) {
                        const candidates = releaseData.releases.map(normalizeRelease);
                        const official = earliestOfficialAlbums(candidates);
                        const album = official[0] || candidates[0];
                        if (album) await supplementRecording(album);
                    }
                }
            }
        } catch (e) {
            // Non-critical — Lucene results are still available
        }
    }

    return rankSongs(dedupeRecordings(rows), title)
        .map((r) => normalizeToCandidate(r, 'Song', 0.05));
}

/**
 * Get full tracklist for a release.
 * @param {object} album  — { mbid, title, ... }
 * @returns {Promise<object[]>}  — raw rows with { mbid, title, artist, lengthMs, firstReleaseDate, album, albumDate, albumYear, matchQuality }
 *                           (callers wrap via normalizeToCandidate when needed)
 */
export async function albumTracks(album) {
    const rel = await get(`release/${encodeURIComponent(album.mbid)}`, { inc: 'recordings+artist-credits' });
    const rows = [];
    for (const media of rel.media || []) {
        for (const tr of media.track || []) {
            const rec = tr.recording || {};
            if (!rec.id) continue;
            const date = releaseDateOf(rel);
            rows.push({
                mbid: rec.id,
                title: rec.title || tr.title || '',
                artist: creditName(rec['artist-credit'] || rel['artist-credit']),
                lengthMs: rec.length || tr.length || null,
                firstReleaseDate: date,
                disambiguation: rec.disambiguation || '',
                album: rel.title || album.title,
                albumDate: date,
                albumYear: /^\d{4}/.test(date) ? date.slice(0, 4) : '',
                matchQuality: 0.8,
            });
        }
    }
    return rows;
}

/**
 * Browse all releases for an artist.
 * @param {string} artistMbid
 * @returns {Promise<object[]>}
 */
export async function browseReleases(artistMbid) {
    if (!artistMbid) return [];
    const data = await get('release', { artist: artistMbid, limit: 100, inc: 'release-groups' });
    return (data.releases || []).map(normalizeRelease);
}

/**
 * Browse all release-groups (canonical albums) for an artist.
 * Unlike browseReleases (which returns every format variant),
 * this returns one entry per logical album, deduplicating
 * re-releases, remasters, and territory-specific editions.
 * Results are sorted by first-release-date ascending.
 * @param {string} artistMbid
 * @param {object} [opts]
 * @param {number} [opts.limit=100]
 * @returns {Promise<object[]>} — { mbid, title, artist, type, firstReleaseDate, year }
 */
export async function browseArtistGroups(artistMbid, opts = {}) {
    if (!artistMbid) return [];
    const limit = opts.limit || 100;
    const data = await get('release-group', { artist: artistMbid, limit });
    const groups = (data['release-groups'] || []).map(normalizeReleaseGroup);
    // Filter to album type, sort by date ascending
    const albums = groups.filter((g) => normText(g.type) === 'album');
    albums.sort((a, b) => String(a.year || '9999').localeCompare(String(b.year || '9999')));
    return albums;
}

/**
 * Fetch a single artist or recording by MBID.
 * @param {string} id
 * @returns {Promise<import('../types').Candidate|null>}
 */
export async function fetchById(id) {
    // Try as artist first, then as recording
    try {
        const data = await get(`artist/${encodeURIComponent(id)}`, { inc: 'url-rels' });
        if (data?.id) {
            return {
                providerKey: 'musicbrainz',
                externalId: data.id,
                name: data.name || '',
                disambiguation: data.disambiguation || '',
                matchQuality: 1,
                type: 'Artist',
                payload: data,
            };
        }
    } catch { /* not an artist */ }

    try {
        const data = await get(`recording/${encodeURIComponent(id)}`, { inc: 'artist-credits+releases' });
        if (data?.id) {
            return {
                providerKey: 'musicbrainz',
                externalId: data.id,
                name: data.title || '',
                disambiguation: data.disambiguation || '',
                matchQuality: 1,
                type: 'Song',
                year: data['first-release-date'] ? data['first-release-date'].slice(0, 4) : '',
                payload: data,
            };
        }
    } catch { /* not a recording */ }

    return null;
}

/**
 * Build a URL to view this record on MusicBrainz.
 * @param {string} id  — MBID
 * @returns {string}
 */
export function externalUrl(id) {
    return `https://musicbrainz.org/recording/${encodeURIComponent(id)}`;
}

/**
 * Default search by name — detects type from context.
 * @param {string} query
 * @param {object} [ctx]
 * @returns {Promise<import('../types').Candidate[]>}
 */
export async function search(query, ctx = {}) {
    const artistProvided = !!(ctx.artist || ctx.data?.artist);
    const type = ctx.type || (artistProvided ? 'song' : 'artist');
    if (type === 'album' || type === 'release-group') {
        return searchAlbums(query, ctx);
    }
    if (type === 'song' || type === 'recording') {
        return searchSongs(query, ctx);
    }
    return searchArtists(query, ctx);
}

export const classIds = [
    UUID.MUSIC_BAND,
    UUID.MUSICIAN,
    UUID.SONG_CLASS,
    UUID.REPERTOIRE_CLASS,
    UUID.PRACTICE_LIST_CLASS,
];

export const name = 'MusicBrainz';

export const key = 'musicbrainz';

export const idScheme = 'uuid';

/**
 * Register this provider with the engine registry.
 * Call once on app startup.
 */
export function registerMusicBrainzProvider() {
    registerProvider({
        key,
        name,
        classIds,
        idScheme,
        search,
        searchArtists,
        searchSongs,
        searchAlbums,
        fetchById,
        externalUrl,
    });
}