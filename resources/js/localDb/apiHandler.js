// resources/js/localDb/apiHandler.js
//
// Local API handler that mirrors the server API using the local Dexie DB.
// When the app is in standalone/offline mode, axios calls are redirected here
// so UI components work without any changes.
//
// Supported routes (mirrors routes/api.php):
//   POST /object          → search objects
//   GET  /object/{id}     → get single object
//   POST /object/{id}     → create object
//   PUT  /object/{id}     → update object
//   DELETE /object/{id}   → delete object
//   POST /link            → create link
//   PUT  /link/{id}       → update link
//   DELETE /link/{id}     → delete link
//   GET  /user            → get current user
//

import {
    createObject,
    updateObject,
    deleteObject,
    getObject,
    searchObjects,
    listObjects,
    getDb,
    SYNC_STATUS,
} from './index';
import { saveLink, deleteLink, getLink, listLinksForThing } from './links';

/** Base path to strip from URLs */
const API_PREFIX = '/object';

/**
 * Handle /user endpoint (auth check).
 * In offline mode, returns a local anonymous user.
 */
export async function handleLocalUserCall() {
    return {
        data: {
            id: 0,
            name: 'Offline User',
            email: 'offline@local',
            thing_id: 'local-user-thing',
        },
        status: 200,
    };
}

/**
 * Seed the local DB with demo data for first-launch experience.
 * Only runs if the objects store is empty.
 */
export async function seedDemoData() {
    const db = getDb();
    const count = await db.objects.count();
    if (count > 0) return; // already seeded

    const demoObjects = [
        {
            thing_id: 'a0000000-0000-0000-0000-000000000001',
            name: 'Welcome to Factology',
            type: 3,
            description: 'This is a demo object stored locally on your device. Everything works offline!',
            start: '20260101000000',
            end: '20261231235959',
            public: 1,
            owner: 'local-user',
            data: { tags: ['demo', 'offline'] },
        },
        {
            thing_id: 'a0000000-0000-0000-0000-000000000002',
            name: 'Offline Note',
            type: 3,
            description: 'You can create, edit, and delete objects without an internet connection. All changes are saved locally.',
            start: '20260201000000',
            public: 1,
            owner: 'local-user',
            data: { priority: 'high' },
        },
        {
            thing_id: 'a0000000-0000-0000-0000-000000000003',
            name: 'How Sync Works',
            type: 3,
            description: 'When you connect to a server, your local changes will sync automatically. Conflicts are resolved field-by-field.',
            start: '20260301000000',
            public: 1,
            owner: 'local-user',
            data: { type: 'info' },
        },
        {
            thing_id: 'a0000000-0000-0000-0000-000000000004',
            name: 'Private Object Example',
            type: 3,
            description: 'This object is marked private. Private objects stay on your device and never sync to any server.',
            start: '20260401000000',
            public: 0,
            owner: 'local-user',
            data: { tags: ['private'] },
        },
        {
            thing_id: 'a0000000-0000-0000-0000-000000000005',
            name: 'Classes & Categories',
            type: 2,
            description: 'This is a class/category object (type 2). Use classes to organize your objects into groups.',
            public: 1,
            owner: 'local-user',
            data: { color: '#4A90D9' },
        },
    ];

    for (const obj of demoObjects) {
        await createObject(obj, { skipChangeLog: true });
    }

    console.log('Local DB seeded with', demoObjects.length, 'demo objects');
}

/**
 * Match a URL to an API action and handle it locally.
 *
 * @param {string} method - HTTP method (get, post, put, delete)
 * @param {string} url - Request URL (without base)
 * @param {object|null} data - Request body (for post/put)
 * @returns {object} { data: {...}, status: 200 } or throws
 */
export async function handleLocalApiCall(method, url, data = null) {
    const normalizedUrl = url.replace(API_PREFIX, '').replace(/^\/+/, '');
    const parts = normalizedUrl.split('/').filter(Boolean);

    // ── /object (POST - search) ──────────────────────────────────────
    if (method === 'post' && parts.length === 0) {
        return handleSearch(data);
    }

    // ── /object/{id} ─────────────────────────────────────────────────
    const id = parts[0];

    if (method === 'get') {
        return handleGet(id);
    }

    if (method === 'post') {
        return handleCreate(id, data);
    }

    if (method === 'put') {
        return handleUpdate(id, data);
    }

    if (method === 'delete') {
        return handleDelete(id);
    }

    throw new Error(`Unhandled local API: ${method} ${url}`);
}

async function handleSearch(body) {
    const params = typeof body === 'string' ? JSON.parse(body) : (body || {});

    let results;
    if (params.tree) {
        // Return all class-type objects as flat list for tree rendering
        results = await listObjects({ type: [2, 5], includeDeleted: false });
        return {
            data: { things: buildClassTree(results) },
            status: 200,
        };
    }

    results = await searchObjects(params.search || '', {
        includeDeleted: false,
    });

    // Filter by type if specified
    if (params.type && params.type.length > 0) {
        results = results.filter(o => params.type.includes(o.type));
    }

    // Enrich with links
    const thingsWithLinks = [];
    for (const obj of results) {
        const links = await listLinksForThing(obj.thing_id);
        thingsWithLinks.push({
            ...obj,
            links: links.length > 0 ? links : undefined,
        });
    }

    return {
        data: { things: thingsWithLinks },
        status: 200,
    };
}

async function handleGet(id) {
    const obj = await getObject(id);
    if (!obj) {
        throw { response: { status: 404, data: { message: 'Not found' } } };
    }

    const links = await listLinksForThing(id);

    return {
        data: {
            data: { ...obj, links: links.length > 0 ? links : undefined },
            success: true,
        },
        status: 200,
    };
}

async function handleCreate(id, body) {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    const objData = { ...data, thing_id: id };

    await createObject(objData, { skipChangeLog: true });

    return {
        data: { data: objData, success: true },
        status: 200,
    };
}

async function handleUpdate(id, body) {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    const { thing_id, ...changes } = data;

    await updateObject(id, changes, { skipChangeLog: true });

    const updated = await getObject(id);
    return {
        data: { data: updated, success: true },
        status: 200,
    };
}

async function handleDelete(id) {
    await deleteObject(id, { skipChangeLog: true });
    return {
        data: { success: true },
        status: 200,
    };
}

/**
 * Handle link endpoints.
 */
export async function handleLocalLinkCall(method, url, data = null) {
    const parts = url.replace('/link', '').split('/').filter(Boolean);
    const linkId = parts[0];
    const body = typeof data === 'string' ? JSON.parse(data) : (data || {});

    if (method === 'post') {
        const linkData = { ...body, link_id: linkId || body.link_id };
        await saveLink(linkData, { skipChangeLog: true });
        return { data: { data: linkData, success: true }, status: 200 };
    }

    if (method === 'put') {
        const existing = await getLink(linkId);
        const linkData = { ...existing, ...body };
        await saveLink(linkData, { skipChangeLog: true });
        return { data: { data: linkData, success: true }, status: 200 };
    }

    if (method === 'delete') {
        await deleteLink(linkId, { skipChangeLog: true });
        return { data: { message: 'Link deleted successfully' }, status: 200 };
    }

    throw new Error(`Unhandled local link API: ${method} ${url}`);
}

/**
 * Build a simple class tree from flat list.
 */
function buildClassTree(items) {
    // For now return flat with empty nodes arrays
    // Full tree building would need parent_id tracking
    return items.map(item => ({
        id: item.thing_id,
        name: item.name,
        level: 1,
        description: item.description,
        public: item.public || 0,
        nodes: [],
        translation: null,
        parent_id: null,
    }));
}
