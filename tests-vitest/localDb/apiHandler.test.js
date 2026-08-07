// tests-vitest/localDb/apiHandler.test.js
//
// Guards the standalone local API mirrors the server:
//  1. links returned by GET /object/{id} carry resolved endpoint names
//     (fixes "Everything → Unknown → Unknown" in LinkDescription)
//  2. the class tree is rooted at Everything and mirrors the web hierarchy

import { describe, it, expect, beforeEach } from 'vitest';
import { getDb, clearAll } from '@/localDb/index';
import { seedLocalDb } from '@/localDb/seeder';
import { UUID } from '@/constants/uuid';
import { handleLocalApiCall } from '@/localDb/apiHandler';

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
        expect(toSomething.link_name).toBe('is a parent of');
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
        expect(names).toContain('is a parent of'); // link type node under Link
        // Orphans (not reachable from Everything) are excluded, like the server
        expect(names).not.toContain('Married to');
        expect(names).not.toContain('meanwhile');
    });
});
