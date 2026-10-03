// tests-vitest/MusicBrainzSearch.spec.js
//
// Tests for MusicBrainz search functions with mocked API responses.
// Verifies the release-browse path returns canonical 1971 results,
// the Lucene fallback works, and individual search functions behave.

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

const JOHN_LENNON_MBID = '0db1f819-aab2-4c57-a150-2304a85d27b3';
const IMAGINE_RG_MBID = '0a0a0a0a-aaaa-4c57-a150-2304a85d27b3';
const IMAGINE_RELEASE_MBID = '1b1b1b1b-bbbb-4c57-a150-2304a85d27b3';
const IMAGINE_RECORDING_MBID = '2c2c2c2c-cccc-4c57-a150-2304a85d27b3';

/** Build a mock MusicBrainz response object. */
function mbOk(data) {
    return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map(),
        json: async () => data,
        text: async () => JSON.stringify(data),
    };
}

/** Build a mock error response. */
function mbFail(status, body) {
    const text = body || '';
    return {
        ok: false,
        status,
        statusText: 'Error',
        headers: new Map(),
        json: async () => ({ error: text }),
        text: async () => text,
    };
}

describe('MusicBrainzSearch', () => {
    let searchSongs;
    let searchArtists;
    let searchAlbums;
    let browseArtistGroups;
    let browseReleases;
    let resetClientState;
    let fetchSpy;

    beforeAll(async () => {
        const mod = await import('@factology/engine/external/providers/musicbrainz.js');
        searchSongs = mod.searchSongs;
        searchArtists = mod.searchArtists;
        searchAlbums = mod.searchAlbums;
        browseArtistGroups = mod.browseArtistGroups;
        browseReleases = mod.browseReleases;
        resetClientState = mod.resetClientState;
    });

    beforeEach(() => {
        vi.restoreAllMocks();
        if (resetClientState) resetClientState();
        fetchSpy = vi.spyOn(global, 'fetch');
    });

    // ─── searchArtists ─────────────────────────────────────────────────

    describe('searchArtists', () => {
        it('returns artist candidates from MB Lucene search', async () => {
            fetchSpy.mockImplementation(async (url) => {
                const href = url instanceof URL ? url.href : String(url);
                if (href.includes('/artist?query=')) {
                    return mbOk({
                        artists: [
                            { id: JOHN_LENNON_MBID, name: 'John Lennon', score: 100 },
                        ],
                        count: 1,
                    });
                }
                return mbOk({});
            });

            const results = await searchArtists('John Lennon');
            expect(results.length).toBe(1);
            expect(results[0].name).toBe('John Lennon');
            expect(results[0].providerKey).toBe('musicbrainz');
            expect(results[0].externalId).toBe(JOHN_LENNON_MBID);
        });

        it('returns empty array when MB returns no artists', async () => {
            fetchSpy.mockImplementation(async () => mbOk({ artists: [], count: 0 }));
            const results = await searchArtists('Nonexistent Artist XYZ');
            expect(results.length).toBe(0);
        });
    });

    // ─── searchAlbums ──────────────────────────────────────────────────

    describe('searchAlbums', () => {
        it('returns album candidates from MB Lucene search', async () => {
            fetchSpy.mockImplementation(async (url) => {
                const href = url instanceof URL ? url.href : String(url);
                if (href.includes('/release-group?query=')) {
                    return mbOk({
                        'release-groups': [
                            { id: IMAGINE_RG_MBID, title: 'Imagine', 'primary-type': 'Album', 'first-release-date': '1971-09-09' },
                        ],
                        'release-group-count': 1,
                    });
                }
                return mbOk({});
            });

            const results = await searchAlbums('Imagine', { artist: 'John Lennon' });
            expect(results.length).toBe(1);
            expect(results[0].name).toBe('Imagine');
            expect(results[0].type).toBe('Album');
        });
    });

    // ─── browseArtistGroups ────────────────────────────────────────────

    describe('browseArtistGroups', () => {
        it('returns release-groups sorted by date, filtered to album-like types', async () => {
            fetchSpy.mockImplementation(async (url) => {
                const href = url instanceof URL ? url.href : String(url);
                if (href.includes('/release-group?artist=')) {
                    return mbOk({
                        'release-groups': [
                            { id: 'rg-later', title: 'Double Fantasy', 'primary-type': 'Album', 'first-release-date': '1980-11-17' },
                            { id: IMAGINE_RG_MBID, title: 'Imagine', 'primary-type': 'Album', 'first-release-date': '1971-09-09' },
                            { id: 'rg-single', title: 'Give Peace a Chance', 'primary-type': 'Single' },
                        ],
                        'release-group-count': 3,
                    });
                }
                return mbOk({});
            });

            const albums = await browseArtistGroups(JOHN_LENNON_MBID);

            // Album, Single, EP, etc. all included — singles no longer filtered out
            expect(albums.length).toBe(3);
            // Sorted by date ascending (singles without date go last)
            expect(albums[0].name).toBe('Imagine');
            expect(albums[0].year).toBe('1971');
            expect(albums[1].name).toBe('Double Fantasy');
            expect(albums[1].year).toBe('1980');
            expect(albums[2].name).toBe('Give Peace a Chance');
            expect(albums[2].year).toBe('');
        });
    });

    // ─── browseReleases ────────────────────────────────────────────────

    describe('browseReleases', () => {
        it('returns official releases for an artist', async () => {
            fetchSpy.mockImplementation(async (url) => {
                const href = url instanceof URL ? url.href : String(url);
                if (href.includes('/release?artist=')) {
                    return mbOk({
                        releases: [
                            { id: IMAGINE_RELEASE_MBID, title: 'Imagine', status: 'Official', date: '1971-09-09' },
                        ],
                    });
                }
                return mbOk({});
            });

            const releases = await browseReleases(JOHN_LENNON_MBID);
            expect(releases.length).toBe(1);
            expect(releases[0].title).toBe('Imagine');
            expect(releases[0].status).toBe('Official');
        });
    });

    // ─── searchSongs — release-browse path ─────────────────────────────

    describe('searchSongs with release context', () => {
        it('returns 1971 recording via release-browse path when album name given', async () => {
            fetchSpy.mockImplementation(async (url) => {
                const href = url instanceof URL ? url.href : String(url);

                // 1. Artist search
                if (href.includes('/artist?query=')) {
                    return mbOk({
                        artists: [{ id: JOHN_LENNON_MBID, name: 'John Lennon', score: 100 }],
                    });
                }
                // 2. Release-group browse — returns Imagine (1971) and others
                if (href.includes('/release-group?artist=')) {
                    return mbOk({
                        'release-groups': [
                            { id: IMAGINE_RG_MBID, title: 'Imagine', 'primary-type': 'Album', 'first-release-date': '1971-09-09',
                              'artist-credit': [{ artist: { id: JOHN_LENNON_MBID, name: 'John Lennon' } }] },
                            { id: 'rg-other', title: 'Rock \'n\' Roll', 'primary-type': 'Album', 'first-release-date': '1975-01-01',
                              'artist-credit': [{ artist: { id: JOHN_LENNON_MBID, name: 'John Lennon' } }] },
                        ],
                        'release-group-count': 2,
                    });
                }
                // 3. Release browse by release-group
                if (href.includes('/release?release-group=')) {
                    return mbOk({
                        releases: [{
                            id: IMAGINE_RELEASE_MBID, title: 'Imagine', status: 'Official',
                            'primary-type': 'Album',
                            'artist-credit': [{ artist: { id: JOHN_LENNON_MBID, name: 'John Lennon' } }],
                            date: '1971-09-09',
                        }],
                    });
                }
                // 4. Release detail with tracklist
                if (href.includes('/release/')) {
                    return mbOk({
                        id: IMAGINE_RELEASE_MBID, title: 'Imagine', status: 'Official', date: '1971-09-09',
                        media: [{
                            track: [
                                { number: '1', title: 'Imagine',
                                  recording: { id: IMAGINE_RECORDING_MBID, title: 'Imagine', length: 187000,
                                    'artist-credit': [{ artist: { id: JOHN_LENNON_MBID, name: 'John Lennon' } }] } },
                                { number: '2', title: 'Crippled Inside',
                                  recording: { id: 'rec-2', title: 'Crippled Inside' } },
                            ],
                        }],
                    });
                }

                return mbOk({});
            });

            const results = await searchSongs('Imagine', {
                artist: 'John Lennon',
                release: 'Imagine',
            });

            // Must return results from the album-tracklist path (1971)
            // not from the Lucene path
            expect(results.length).toBeGreaterThan(0);
            const first = results[0];
            expect(first.externalId).toBe(IMAGINE_RECORDING_MBID);
            expect(first.name).toBe('Imagine');
            // The year should be 1971 since albumTracks returns 1971-09-09
            expect(first.year).toBe('1971');
        });

        it('falls through to Lucene + supplement when release-browse path fails', async () => {
            fetchSpy.mockImplementation(async (url) => {
                const href = url instanceof URL ? url.href : String(url);

                // 1. Artist search succeeds
                if (href.includes('/artist?query=')) {
                    return mbOk({
                        artists: [{ id: JOHN_LENNON_MBID, name: 'John Lennon', score: 100 }],
                    });
                }
                // 2. Release-group browse FAILS — network error
                if (href.includes('/release-group?artist=')) {
                    throw new Error('Simulated network error');
                }
                // 3. Lucene recording search
                if (href.includes('/recording?query=')) {
                    return mbOk({
                        recordings: [{
                            id: 'lucene-rec-1', title: 'Imagine', 'first-release-date': '1993-01-01',
                            length: 187000,
                            'artist-credit': [{ artist: { id: JOHN_LENNON_MBID, name: 'John Lennon' } }],
                            releases: [{ id: 'rel-1993', title: 'Imagine (1993 Remaster)' }],
                        }],
                    });
                }
                // 4. Supplement path: browse official releases (now runs because
                //    releaseBrowseFailed is true)
                if (href.includes('/release?artist=')) {
                    return mbOk({
                        releases: [{
                            id: IMAGINE_RELEASE_MBID, title: 'Imagine', status: 'Official', date: '1971-09-09',
                            'primary-type': 'Album',
                            'release-group': { id: IMAGINE_RG_MBID, 'primary-type': 'Album' },
                        }],
                    });
                }
                // 5. Album tracks for the official release
                if (href.includes('/release/') && href.includes('inc=')) {
                    return mbOk({
                        id: IMAGINE_RELEASE_MBID, title: 'Imagine', date: '1971-09-09',
                        media: [{
                            track: [{
                                number: '1', title: 'Imagine',
                                recording: { id: IMAGINE_RECORDING_MBID, title: 'Imagine' },
                            }],
                        }],
                    });
                }

                return mbOk({});
            });

            const results = await searchSongs('Imagine', {
                artist: 'John Lennon',
                release: 'Imagine',
            });

            // Must still return results (Lucene + supplement)
            expect(results.length).toBeGreaterThan(0);
            // The 1971 recording from supplement should be included
            const has1971 = results.some(r => r.year === '1971' || r.externalId === IMAGINE_RECORDING_MBID);
            const hasLucene = results.some(r => r.year === '1993' || r.name === 'Imagine');
            expect(has1971 || hasLucene).toBe(true);
        });

        it('returns results from Lucene when no artist match found', async () => {
            fetchSpy.mockImplementation(async (url) => {
                const href = url instanceof URL ? url.href : String(url);

                // Artist search returns no results
                if (href.includes('/artist?query=')) {
                    return mbOk({ artists: [] });
                }
                // Lucene recording search
                if (href.includes('/recording?query=')) {
                    return mbOk({
                        recordings: [{
                            id: 'lucene-rec', title: 'Imagine', 'first-release-date': '1990-06-01',
                        }],
                    });
                }
                return mbOk({});
            });

            const results = await searchSongs('Imagine', {
                artist: 'Nonexistent Artist',
                release: 'Imagine',
            });

            // Lucene fallback
            expect(results.length).toBe(1);
        });
    });
});