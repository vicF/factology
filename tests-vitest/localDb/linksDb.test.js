// tests-vitest/localDb/linksDb.test.js

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    saveLink,
    deleteLink,
    getLink,
    listLinksForThing,
    replaceLinksForThing,
} from '@/localDb/links';
import { clearAll, getPendingCount, popPendingChanges } from '@/localDb/index';
import { CHANGE_OP } from '@/localDb/index';

describe('LocalDB — Link CRUD', () => {
    beforeEach(async () => {
        await clearAll();
    });

    afterEach(async () => {
        await clearAll();
    });

    it('saves a link', async () => {
        const linkId = await saveLink({
            link_id: 'link-1',
            one_thing_id: 'thing-a',
            link_type_id: 'type-parent',
            other_thing_id: 'thing-b',
            public: true,
        });

        expect(linkId).toBe('link-1');

        const link = await getLink('link-1');
        expect(link).toBeTruthy();
        expect(link.one_thing_id).toBe('thing-a');
        expect(link.other_thing_id).toBe('thing-b');
    });

    it('updates an existing link', async () => {
        await saveLink({
            link_id: 'link-2',
            one_thing_id: 'thing-a',
            link_type_id: 'type-parent',
            other_thing_id: 'thing-b',
            public: true,
        });

        await saveLink({
            link_id: 'link-2',
            one_thing_id: 'thing-a',
            link_type_id: 'type-parent',
            other_thing_id: 'thing-c', // changed
            public: true,
        });

        const link = await getLink('link-2');
        expect(link.other_thing_id).toBe('thing-c');
        expect(link._localRevision).toBe(2);
    });

    it('deletes a link', async () => {
        await saveLink({
            link_id: 'link-3',
            one_thing_id: 'thing-a',
            link_type_id: 'type-parent',
            other_thing_id: 'thing-b',
            public: true,
        });

        await deleteLink('link-3');

        const link = await getLink('link-3');
        expect(link).toBeNull();
    });

    it('enqueues change on save', async () => {
        await saveLink({
            link_id: 'link-4',
            one_thing_id: 'thing-a',
            link_type_id: 'type-parent',
            other_thing_id: 'thing-b',
            public: true,
        });

        const changes = await popPendingChanges();
        expect(changes[0].operation).toBe(CHANGE_OP.INSERT);
        expect(changes[0].table).toBe('links');
    });

    it('enqueues DELETE change on delete', async () => {
        await saveLink({
            link_id: 'link-5',
            one_thing_id: 'thing-a',
            link_type_id: 'type-parent',
            other_thing_id: 'thing-b',
            public: true,
        });
        await popPendingChanges(); // drain INSERT

        await deleteLink('link-5');

        const changes = await popPendingChanges();
        expect(changes[0].operation).toBe(CHANGE_OP.DELETE);
    });

    it('deletes non-existent link without error', async () => {
        await deleteLink('non-existent');
    });

    it('lists links for a thing', async () => {
        await saveLink({ link_id: 'l1', one_thing_id: 'thing-x', link_type_id: 't1', other_thing_id: 'thing-y', public: true });
        await saveLink({ link_id: 'l2', one_thing_id: 'thing-x', link_type_id: 't2', other_thing_id: 'thing-z', public: true });
        await saveLink({ link_id: 'l3', one_thing_id: 'thing-w', link_type_id: 't1', other_thing_id: 'thing-x', public: true }); // thing-x as other_thing_id

        const links = await listLinksForThing('thing-x');
        expect(links.length).toBe(3);
    });

    it('replaces all links for a thing', async () => {
        await saveLink({ link_id: 'l1', one_thing_id: 'thing-x', link_type_id: 't1', other_thing_id: 'thing-y', public: true });
        await saveLink({ link_id: 'l2', one_thing_id: 'thing-x', link_type_id: 't2', other_thing_id: 'thing-z', public: true });

        const newLinks = [
            { link_id: 'l3', one_thing_id: 'thing-x', link_type_id: 't3', other_thing_id: 'thing-w', public: true },
        ];

        await replaceLinksForThing('thing-x', newLinks);

        const links = await listLinksForThing('thing-x');
        expect(links.length).toBe(1);
        expect(links[0].link_id).toBe('l3');
    });
});
