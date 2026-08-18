// tests-vitest/localDb/apiHandler.test.js
//
// Guards the standalone local API mirrors the server:
//  1. links returned by GET /object/{id} carry resolved endpoint names
//     (fixes "Everything → Unknown → Unknown" in LinkDescription)
//  2. the class tree is rooted at Everything and mirrors the web hierarchy

import { describe, it, expect, beforeEach } from 'vitest';
import { getDb, clearAll } from '@/localDb/index';
import { seedLocalDb } from '@/localDb/seeder';
import { saveLink } from '@/localDb/links';
import { UUID } from '@/constants/uuid';
import { handleLocalApiCall, handleLocalLinkCall } from '@/localDb/apiHandler';

// Current user, injected by the standalone adapter on create/update.
const CURRENT_USER = UUID.VICTOR_FOKIN;
const CONTEXT = { userThingId: CURRENT_USER };

describe('Local API link enrichment (mirrors server LinkResource)', () => {
    beforeEach(async () => {
        await clearAll();
        await seedLocalDb();
    });

    it('resolves every link endpoint name on GET /object/{id}', async () => {
        const res = await handleLocalApiCall('get', `/object/${UUID.EVERYTHING}`);
        const obj = res.data.data;

        expect(obj.thing_id).toBe(UUID.EVERYTHING);
        expect(obj.links.length).toBeGreaterThan(0);

        for (const link of obj.links) {
            expect(link.name).toBeTruthy();
            expect(link.link_name).toBeTruthy();
            expect(link.name).not.toBe('Unknown');
            expect(link.link_name).not.toBe('Unknown');
        }

        // The "Everything is a parent of Something" link must resolve
        const toSomething = obj.links.find(l => l.other_thing_id === UUID.SOMETHING);
        expect(toSomething).toBeTruthy();
        expect(toSomething.name).toBe('Something');
        expect(toSomething.link_name).toBe('is a superclass of');
    });

    it('resolves names for links found via other_thing_id too', async () => {
        // Viewing "Event" (a child): its parent link has Event as other_thing_id
        const res = await handleLocalApiCall('get', `/object/${UUID.EVENT}`);
        const obj = res.data.data;
        const parentLink = obj.links.find(l =>
            l.link_type_id === UUID.LINK_TO_PARENT &&
            l.one_thing_id === UUID.SOMETHING,
        );
        expect(parentLink).toBeTruthy();
        expect(parentLink.name).toBe('Something'); // opposite endpoint
    });
});

describe('Local API class tree (mirrors server searchTree)', () => {
    beforeEach(async () => {
        await clearAll();
        await seedLocalDb();
    });

    it('returns a single tree rooted at Everything', async () => {
        const res = await handleLocalApiCall('post', '/object', JSON.stringify({ tree: true }));
        const tree = res.data.things;
        expect(tree.length).toBe(1);
        expect(tree[0].name).toBe('Everything');
        expect(tree[0].nodes.length).toBeGreaterThan(0);
    });

    it('sorts top-level siblings: classes first, link types, System last', async () => {
        const res = await handleLocalApiCall('post', '/object', JSON.stringify({ tree: true }));
        const topNames = res.data.things[0].nodes.map(n => n.name);
        expect(topNames.indexOf('Something')).toBeLessThan(topNames.indexOf('Link'));
        expect(topNames.indexOf('Link')).toBeLessThan(topNames.indexOf('System'));
    });

    it('includes the full web class hierarchy', async () => {
        const res = await handleLocalApiCall('post', '/object', JSON.stringify({ tree: true }));
        const names = [];
        const walk = (nodes) => {
            for (const n of nodes) {
                names.push(n.name);
                walk(n.nodes || []);
            }
        };
        walk(res.data.things);

        // Top-level branches
        expect(names).toContain('Something');
        expect(names).toContain('Link');
        expect(names).toContain('System');
        // Deep descendants
        expect(names).toContain('Event');
        expect(names).toContain('City');
        expect(names).toContain('Vehicle');
        expect(names).toContain('Guitar');
        expect(names).toContain('is a superclass of'); // link type node under Link
        // Orphans (not reachable from Everything) are excluded, like the server
        expect(names).not.toContain('Married to');
        expect(names).not.toContain('meanwhile');
    });
});

describe('Local API search sorting + class filter (mirrors server ApiController::search)', () => {
    beforeEach(async () => {
        await clearAll();
        await seedLocalDb();
    });

    it('sorts by updated desc by default (new objects at the top)', async () => {
        // Simulate a user-created object that is "newer" than the seed
        const newId = 'aaaaaaaa-0000-4000-a000-0000000000aa';
        await handleLocalApiCall('post', `/object/${newId}`, JSON.stringify({
            name: 'Собака',
            type: UUID.G_CLASS,
            public: 1,
        }), CONTEXT);

        // Force a newer timestamp so ordering is unambiguous
        await getDb().objects.update(newId, { _updatedAt: Date.now() + 60000 });

        const res = await handleLocalApiCall('post', '/object', JSON.stringify({}));
        const things = res.data.things;

        expect(things[0].thing_id).toBe(newId);
        // And it appears in the results at all
        expect(things.some(t => t.thing_id === newId)).toBe(true);
    });

    it('sorts by name asc when sort_by=name and sort_order=asc', async () => {
        const res = await handleLocalApiCall('post', '/object', JSON.stringify({
            sort_by: 'name',
            sort_order: 'asc',
        }));
        const names = res.data.things.map(t => t.name).filter(Boolean);
        const sorted = [...names].sort((a, b) => a.localeCompare(b));
        expect(names).toEqual(sorted);
    });

    it('filters things by checked classes (mirrors classes param)', async () => {
        // Create a thing of class City (a seeded class)
        const thingId = 'bbbbbbbb-0000-4000-a000-0000000000bb';
        await handleLocalApiCall('post', `/object/${thingId}`, JSON.stringify({
            name: 'Мона',
            type: UUID.G_THING,
            public: 1,
            class: { other_thing_id: '14cd9c8b-84a4-4fd2-82a8-97477ff2d5ee' }, // City
        }), CONTEXT);

        const res = await handleLocalApiCall('post', '/object', JSON.stringify({
            classes: ['14cd9c8b-84a4-4fd2-82a8-97477ff2d5ee'],
        }));
        const things = res.data.things;

        expect(things.some(t => t.thing_id === thingId)).toBe(true);
        // Seeded bootstrap objects without a City class link are excluded
        expect(things.some(t => t.thing_id === UUID.EVERYTHING)).toBe(false);
    });
});

describe('Local API create/update mirrors server store()', () => {
    beforeEach(async () => {
        await clearAll();
        await seedLocalDb();
    });

    it('defaults owner to the current user on create', async () => {
        const newId = 'cccccccc-0000-4000-a000-0000000000cc';
        const res = await handleLocalApiCall('post', `/object/${newId}`, JSON.stringify({
            name: 'Собака',
            type: UUID.G_CLASS,
            public: 1,
        }), CONTEXT);

        expect(res.data.data.owner).toBe(CURRENT_USER);

        const stored = await getDb().objects.get(newId);
        expect(stored.owner).toBe(CURRENT_USER);
    });

    it('keeps an explicitly provided owner', async () => {
        const newId = 'dddddddd-0000-4000-a000-0000000000dd';
        const res = await handleLocalApiCall('post', `/object/${newId}`, JSON.stringify({
            name: 'Мона',
            type: UUID.G_THING,
            owner: 'aaaaaaaa-0000-4000-a000-00000000000a',
            public: 1,
        }), CONTEXT);

        expect(res.data.data.owner).toBe('aaaaaaaa-0000-4000-a000-00000000000a');
    });

    it('creates the parent link when a class is created under a parent', async () => {
        const newClassId = 'eeeeeeee-0000-4000-a000-0000000000ee';
        await handleLocalApiCall('post', `/object/${newClassId}`, JSON.stringify({
            name: 'Собака',
            type: UUID.G_CLASS,
            public: 1,
            parent: { one_thing_id: UUID.SOMETHING },
        }), CONTEXT);

        const link = await getDb().links
            .where('link_type_id').equals(UUID.LINK_TO_PARENT)
            .and(l => l.one_thing_id === UUID.SOMETHING && l.other_thing_id === newClassId)
            .first();
        expect(link).toBeTruthy();

        // The new class appears in the tree under its parent
        const tree = (await handleLocalApiCall('post', '/object', JSON.stringify({ tree: true }))).data.things;
        const names = [];
        const walk = (nodes) => {
            for (const n of nodes) { names.push(n.name); walk(n.nodes || []); }
        };
        walk(tree);
        expect(names).toContain('Собака');
    });

    it('creates the class link for a thing and exposes it on GET', async () => {
        const thingId = 'ffffffff-0000-4000-a000-0000000000ff';
        const cityClassId = '14cd9c8b-84a4-4fd2-82a8-97477ff2d5ee';
        await handleLocalApiCall('post', `/object/${thingId}`, JSON.stringify({
            name: 'Мона',
            type: UUID.G_THING,
            public: 1,
            class: { other_thing_id: cityClassId },
        }), CONTEXT);

        const link = await getDb().links
            .where('link_type_id').equals(UUID.LINK_TO_CLASS)
            .and(l => l.one_thing_id === thingId && l.other_thing_id === cityClassId)
            .first();
        expect(link).toBeTruthy();

        const res = await handleLocalApiCall('get', `/object/${thingId}`);
        expect(res.data.data.class).toEqual({
            thing_id: cityClassId,
            name: 'City',
        });
    });

    it('handles links_to_add / links_to_delete on update', async () => {
        const thingId = '11111111-0000-4000-a000-000000000011';
        await handleLocalApiCall('post', `/object/${thingId}`, JSON.stringify({
            name: 'Мона',
            type: UUID.G_THING,
            public: 1,
        }), CONTEXT);

        // Add a link
        await handleLocalApiCall('put', `/object/${thingId}`, JSON.stringify({
            name: 'Мона',
            type: UUID.G_THING,
            public: 1,
            links_to_add: [{
                link_type_id: '4b27fd0c-d8be-425c-a529-2186b2589e76',
                other_thing_id: UUID.EVERYTHING,
            }],
        }), CONTEXT);

        const links = await getDb().links.where('one_thing_id').equals(thingId).toArray();
        expect(links.length).toBe(1);

        // Delete the link by id
        await handleLocalApiCall('put', `/object/${thingId}`, JSON.stringify({
            name: 'Мона',
            type: UUID.G_THING,
            public: 1,
            links_to_delete: [links[0].link_id],
        }), CONTEXT);

        const after = await getDb().links.where('one_thing_id').equals(thingId).toArray();
        expect(after.length).toBe(0);
    });
});

describe('Local API link creation (POST /link)', () => {
    beforeEach(async () => {
        await clearAll();
        await seedLocalDb();
    });

    it('generates a link_id when none is provided', async () => {
        const res = await handleLocalLinkCall('post', '/link', JSON.stringify({
            one_thing_id: UUID.EVERYTHING,
            link_type_id: '4b27fd0c-d8be-425c-a529-2186b2589e76',
            other_thing_id: UUID.SOMETHING,
        }));

        expect(res.data.data.link_id).toBeTruthy();
        const stored = await getDb().links.get(res.data.data.link_id);
        expect(stored).toBeTruthy();
        expect(stored.other_thing_id).toBe(UUID.SOMETHING);
    });
});

describe('Local API multilevel related (mirrors server depth)', () => {
    const A = 'aaaaaaaa-0000-4000-a000-0000000000a1';
    const B = 'aaaaaaaa-0000-4000-a000-0000000000a2';
    const C = 'aaaaaaaa-0000-4000-a000-0000000000a3';

    beforeEach(async () => {
        await clearAll();
        await seedLocalDb();
        for (const [id, name] of [[A, 'Alpha'], [B, 'Bravo'], [C, 'Charlie']]) {
            await handleLocalApiCall('post', `/object/${id}`, JSON.stringify({
                name,
                type: UUID.G_THING,
                public: 1,
            }), CONTEXT);
        }
        await saveLink({ link_id: 'lnk-ab', one_thing_id: A, other_thing_id: B, link_type_id: UUID.LINK_TO_PARENT, public: 1 });
        await saveLink({ link_id: 'lnk-bc', one_thing_id: B, other_thing_id: C, link_type_id: UUID.LINK_TO_PARENT, public: 1 });
    });

    it('GET /object/{id}?depth=2 returns nested target.links', async () => {
        const res = await handleLocalApiCall('get', `/object/${A}?depth=2`);
        const obj = res.data.data;

        const bLink = obj.links.find(l => l.target?.thing_id === B);
        expect(bLink).toBeTruthy();
        expect(bLink.target.links).toBeDefined();
        expect(bLink.target.links.some(l => l.target?.thing_id === C)).toBe(true);
        // Nested targets are shallow — no deeper recursion beyond the requested depth
        const cLink = bLink.target.links.find(l => l.target?.thing_id === C);
        expect(cLink.target.links).toBeUndefined();
    });

    it('default depth 1 returns shallow targets (no nesting)', async () => {
        const res = await handleLocalApiCall('get', `/object/${A}`);
        const obj = res.data.data;

        const bLink = obj.links.find(l => l.target?.thing_id === B);
        expect(bLink).toBeTruthy();
        expect(bLink.target.links).toBeUndefined();
    });

    it('cuts cycles so a thing appears once at its lowest level', async () => {
        // Add A-C chord: A-B, B-C, A-C
        await saveLink({ link_id: 'lnk-ac', one_thing_id: A, other_thing_id: C, link_type_id: UUID.LINK_TO_PARENT, public: 1 });

        const res = await handleLocalApiCall('get', `/object/${A}?depth=4`);
        const obj = res.data.data;

        // A's direct targets: B and C
        const directTargets = obj.links.map(l => l.target?.thing_id).sort();
        expect(directTargets).toEqual([B, C].sort());

        // B's deeper links are cut — both A and C are already at level 1,
        // so B (a recursed node) carries an empty target.links.
        const bLink = obj.links.find(l => l.target?.thing_id === B);
        expect(bLink.target.links).toEqual([]);
    });

    it('search with depth in the body attaches related links', async () => {
        const res = await handleLocalApiCall('post', '/object', JSON.stringify({ depth: 1 }));
        const thing = res.data.things.find(t => t.thing_id === A);

        expect(thing.links).toBeDefined();
        expect(thing.links.length).toBeGreaterThan(0);
        expect(thing.links[0].target).toBeDefined();
        expect(thing.links[0].target.name).toBeTruthy();
    });

    it('search with depth 0 disables related links', async () => {
        const res = await handleLocalApiCall('post', '/object', JSON.stringify({ depth: 0 }));
        const thing = res.data.things.find(t => t.thing_id === A);

        expect(thing.links).toBeUndefined();
    });
});
