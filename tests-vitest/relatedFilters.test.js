// tests-vitest/relatedFilters.test.js
import { describe, it, expect } from 'vitest'
import {
    EVERYTHING_ID,
    nodeClassIds,
    linkPassesFilter,
    filterLinks,
    filterLinksDeep,
    collectNeighborhoodStats,
    pruneTaxonomy,
    topLevelTaxonomyNodes,
} from '@/utils/relatedFilters.js'

// A nested object payload shaped like GET /object/{id}?depth=N.
const ROOT = {
    thing_id: 'root',
    name: 'Root Event',
    class: { thing_id: 'c-event', name: 'Event' },
    classes: [{ thing_id: 'c-event', name: 'Event' }],
    links: [
        {
            link_id: 1,
            link_type_id: 'lt-perform',
            one_thing_id: 'root',
            other_thing_id: 'b',
            target: {
                thing_id: 'b',
                name: 'Band',
                classes: [{ thing_id: 'c-band', name: 'Music band' }],
                links: [
                    {
                        link_id: 2,
                        link_type_id: 'lt-member',
                        target: {
                            thing_id: 'g',
                            name: 'Guitarist',
                            class: { thing_id: 'c-human', name: 'Human' },
                        },
                    },
                ],
            },
        },
        {
            link_id: 3,
            link_type_id: 'lt-member',
            one_thing_id: 'root',
            other_thing_id: 's',
            target: {
                thing_id: 's',
                name: 'Singer',
                classes: [{ thing_id: 'c-human', name: 'Human' }],
            },
        },
    ],
}

describe('nodeClassIds', () => {
    it('reads the plural classes array', () => {
        expect(nodeClassIds({ classes: [{ thing_id: 'a' }, { thing_id: 'b' }] })).toEqual(['a', 'b'])
    })
    it('falls back to the singular class object', () => {
        expect(nodeClassIds({ class: { thing_id: 'a', name: 'A' } })).toEqual(['a'])
    })
    it('handles empty/null input', () => {
        expect(nodeClassIds(null)).toEqual([])
        expect(nodeClassIds({})).toEqual([])
    })
})

describe('linkPassesFilter', () => {
    const humanLink = ROOT.links[1]
    const bandLink = ROOT.links[0]

    it('keeps everything when no filter is set', () => {
        expect(linkPassesFilter(humanLink, null, null)).toBe(true)
        expect(linkPassesFilter(bandLink, null, null)).toBe(true)
    })
    it('filters by link type', () => {
        expect(linkPassesFilter(humanLink, null, ['lt-member'])).toBe(true)
        expect(linkPassesFilter(humanLink, null, ['lt-perform'])).toBe(false)
    })
    it('filters by target class', () => {
        expect(linkPassesFilter(humanLink, ['c-human'], null)).toBe(true)
        expect(linkPassesFilter(bandLink, ['c-human'], null)).toBe(false)
        expect(linkPassesFilter(bandLink, ['c-band'], null)).toBe(true)
    })
    it('ANDs class and link-type filters', () => {
        expect(linkPassesFilter(humanLink, ['c-human'], ['lt-member'])).toBe(true)
        expect(linkPassesFilter(humanLink, ['c-human'], ['lt-perform'])).toBe(false)
        expect(linkPassesFilter(bandLink, ['c-human'], ['lt-perform'])).toBe(false)
    })
    it('treats a multi-class target as matching when ANY class is selected', () => {
        const multi = { link_type_id: 'x', target: { classes: [{ thing_id: 'p' }, { thing_id: 'q' }] } }
        expect(linkPassesFilter(multi, ['q'], null)).toBe(true)
    })
    it('an empty allowed set hides everything (inclusion semantics)', () => {
        expect(linkPassesFilter(humanLink, [], null)).toBe(false)
        expect(linkPassesFilter(humanLink, null, [])).toBe(false)
        expect(filterLinks(ROOT.links, [], [])).toHaveLength(0)
    })
})

describe('filterLinks / filterLinksDeep', () => {
    it('returns the same array when nothing is filtered', () => {
        expect(filterLinks(ROOT.links, null, null)).toBe(ROOT.links)
        expect(filterLinksDeep(ROOT.links, null, null)).toBe(ROOT.links)
    })
    it('filters one level by class', () => {
        const out = filterLinks(ROOT.links, ['c-human'], null)
        expect(out).toHaveLength(1)
        expect(out[0].link_id).toBe(3)
    })
    it('filters one level by link type', () => {
        const out = filterLinks(ROOT.links, null, ['lt-perform'])
        expect(out).toHaveLength(1)
        expect(out[0].link_id).toBe(1)
    })
    it('recursively drops children of filtered-out rows and prunes matching rows', () => {
        const out = filterLinksDeep(ROOT.links, ['c-human'], null)
        // Only link 3 (human target) survives at the top level.
        expect(out.map((l) => l.link_id)).toEqual([3])
    })
    it('keeps a matching top row but prunes its non-matching children', () => {
        // "Music band" matches link 1 but its nested Guitarist (Human) does not.
        const out = filterLinksDeep(ROOT.links, ['c-band'], null)
        expect(out.map((l) => l.link_id)).toEqual([1])
        expect(out[0].target.links).toEqual([])
        // The nested row still carries original object references (not mutated).
        expect(ROOT.links[0].target.links).toHaveLength(1)
    })
    it('descends into children that pass the filter', () => {
        // Selecting Human keeps link 1 only if its child Guitarist link survives?
        // Link 1 targets a band -> dropped, so its child is unreachable.
        // Instead check a parent row that itself matches AND has matching child:
        const fixture = {
            links: [
                {
                    link_id: 1,
                    link_type_id: 't',
                    target: {
                        thing_id: 'b',
                        class: { thing_id: 'c-human', name: 'Human' },
                        links: [
                            { link_id: 2, link_type_id: 't', target: { thing_id: 'g', class: { thing_id: 'c-human', name: 'Human' } } },
                        ],
                    },
                },
            ],
        }
        const out = filterLinksDeep(fixture.links, ['c-human'], ['t'])
        expect(out).toHaveLength(1)
        expect(out[0].target.links.map((l) => l.link_id)).toEqual([2])
    })
})

describe('collectNeighborhoodStats', () => {
    it('collects classes, link types and counts from the nested payload', () => {
        const stats = collectNeighborhoodStats(ROOT)
        expect([...stats.classIds].sort()).toEqual(['c-band', 'c-event', 'c-human'])
        expect([...stats.linkTypeIds].sort()).toEqual(['lt-member', 'lt-perform'])
        // Root Event + 2 humans + 1 band each count once.
        expect(stats.classCounts.get('c-event')).toBe(1)
        expect(stats.classCounts.get('c-human')).toBe(2)
        expect(stats.classCounts.get('c-band')).toBe(1)
        expect(stats.linkTypeCounts.get('lt-member')).toBe(2)
        expect(stats.linkTypeCounts.get('lt-perform')).toBe(1)
    })
    it('treats a null payload as empty', () => {
        const stats = collectNeighborhoodStats(null)
        expect(stats.classIds.size).toBe(0)
        expect(stats.linkTypeCounts.size).toBe(0)
    })
})

describe('pruneTaxonomy / topLevelTaxonomyNodes', () => {
    const tree = [
        {
            id: EVERYTHING_ID,
            nodes: [
                {
                    id: 'something', name: 'Something', type: 2, nodes: [
                        { id: 'living', name: 'Living being', type: 2, nodes: [{ id: 'human', name: 'Human', type: 2, nodes: [] }] },
                        { id: 'place', name: 'Place', type: 2, nodes: [] },
                    ],
                },
                {
                    id: 'link-root', name: 'Link', type: 4, nodes: [
                        { id: 'kinship', name: 'Kinship', type: 4, nodes: [{ id: 'married', name: 'Married to', type: 4, nodes: [] }] },
                        { id: 'time', name: 'Time', type: 4, nodes: [] },
                    ],
                },
            ],
        },
    ]

    it('keeps used ids and their ancestors and drops unrelated branches', () => {
        const pruned = pruneTaxonomy(topLevelTaxonomyNodes(tree), new Set(['human', 'married']))
        const something = pruned.find((n) => n.id === 'something')
        const linkRoot = pruned.find((n) => n.id === 'link-root')
        expect(pruned.map((n) => n.id).sort()).toEqual(['link-root', 'something'])

        const living = something.nodes[0]
        expect(living.nodes.map((n) => n.id)).toEqual(['human'])
        expect(something.nodes.map((n) => n.id)).toEqual(['living']) // Place dropped

        const kinship = linkRoot.nodes[0]
        expect(kinship.nodes.map((n) => n.id)).toEqual(['married'])
        expect(linkRoot.nodes.map((n) => n.id)).toEqual(['kinship']) // Time dropped
    })

    it('keeps a used internal node even with no used descendants', () => {
        const pruned = pruneTaxonomy(topLevelTaxonomyNodes(tree), new Set(['place']))
        const something = pruned.find((n) => n.id === 'something')
        expect(something.nodes.map((n) => n.id)).toEqual(['place'])
    })

    it('does not mutate the source tree', () => {
        pruneTaxonomy(topLevelTaxonomyNodes(tree), new Set(['human']))
        const source = topLevelTaxonomyNodes(tree)[0]
        expect(source.nodes).toHaveLength(2) // Something + Link untouched
    })

    it('unwraps a lone Everything root', () => {
        const top = topLevelTaxonomyNodes(tree)
        expect(top.map((n) => n.name)).toEqual(['Something', 'Link'])
    })
})
