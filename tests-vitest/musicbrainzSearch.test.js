// tests-vitest/musicbrainzSearch.test.js
//
// Integration test for MusicBrainz search functions.
// Hits the real MB API (slow — 1.1s rate limit) to verify album search.
//
import { describe, it, expect } from 'vitest'

function normText(s) {
    return (s || '').normalize ? (s || '').normalize('NFD').replace(/[^a-zA-Z0-9\u0400-\u04FF]/g, '').toLowerCase() : (s || '').toLowerCase().trim();
}

describe('MusicBrainz release-group browse', () => {
    it('raw API: browseArtistGroups + searchSongs', async () => {
        const mod = await import('@factology/engine/external/providers/musicbrainz.js')
        const { searchArtists, browseArtistGroups, searchSongs } = mod

        // ── Step 1: find John Lennon's MBID ──
        const artists = await searchArtists('John Lennon')
        const mbid = artists?.[0]?.mbid
        console.log('1. searchArtists returned', artists?.length, 'results, first mbid:', mbid)
        expect(mbid).toBeTruthy()

        // ── Step 2: browse ALL release-groups ──
        const groups = await browseArtistGroups(mbid)
        console.log(`2. browseArtistGroups returned ${groups.length} release-groups`)
        expect(groups.length).toBeGreaterThan(0)

        // ── Step 3: find Imagine (Album, earliest = 1971) ──
        const imagine = groups.filter(g => normText(g.name) === 'imagine' && normText(g.type) === 'album')
        console.log(`3. "Imagine" (Album) groups: ${imagine.length}`)
        for (const g of imagine) {
            console.log(`   mbid=${g.mbid}, name="${g.name}", type="${g.type}", year=${g.year}`)
        }
        expect(imagine.length).toBeGreaterThan(0)
        imagine.sort((a, b) => String(a.year || '9999').localeCompare(String(b.year || '9999')))
        console.log(`   → Earliest: year=${imagine[0].year}, mbid=${imagine[0].mbid}`)
        expect(imagine[0].year).toBe('1971')

        // ── Step 4: call searchSongs (should use release-group browse path) ──
        console.log('\n4. Calling searchSongs("Imagine", {artist:"John Lennon", release:"Imagine"})...')
        const results = await searchSongs('Imagine', { artist: 'John Lennon', release: 'Imagine' })
        console.log(`   searchSongs returned ${results.length} results`)
        const years = results.map(r => r.albumYear).filter(Boolean).sort()
        console.log(`   Years found:`, JSON.stringify(years))
        for (const r of results) {
            console.log(`   "${r.title}" | album="${r.albumTitle}" (${r.albumYear}) | quality=${r.matchQuality}`)
        }
        if (years.length > 0) {
            console.log(`   → Earliest year in results: ${Math.min(...years)}`)
            expect(Math.min(...years)).toBeLessThanOrEqual(1971)
        } else {
            console.log(`   ⚠️ No years in results — release-browse path may have fallen through`)
        }
    }, 180000)
})