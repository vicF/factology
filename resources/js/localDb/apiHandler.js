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
import { seedLocalDb } from './seeder';
import { UUID } from '../constants/uuid';

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
 * Seed the local DB with system objects and demo data.
 * Uses the standalone seeder for consistency across installations.
 */
export async function seedDemoData() {
    await seedLocalDb();
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
        // Return class tree built from objects + parent-child links
        const things = await listObjects({ type: [UUID.G_CLASS], includeDeleted: false });
        const tree = await buildClassTree(things);
        return {
            data: { things: tree },
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
 * Build a class tree from flat list of class objects + parent-child links.
 *
 * @param {Array} classObjects - Things with type=G_CLASS
 * @returns {Array} Tree structure with nodes, level, parent_id
 */
async function buildClassTree(classObjects) {
    const db = getDb();

    // Get all parent-child links between classes
    const allLinks = await db.links
        .where('link_type_id')
        .equals(UUID.LINK_TO_PARENT)
        .toArray();

    // Build parent → children map
    const parentMap = {};
    for (const link of allLinks) {
        if (!parentMap[link.one_thing_id]) {
            parentMap[link.one_thing_id] = [];
        }
        parentMap[link.one_thing_id].push(link.other_thing_id);
    }

    // Index class objects by UUID
    const thingMap = {};
    for (const obj of classObjects) {
        thingMap[obj.thing_id] = obj;
    }

    // Recursively build tree
    function buildNode(thingId, level) {
        const obj = thingMap[thingId];
        if (!obj) return null;

        const children = (parentMap[thingId] || [])
            .map(childId => buildNode(childId, level + 1))
            .filter(Boolean);

        // Find parent
        let parentId = null;
        for (const link of allLinks) {
            if (link.other_thing_id === thingId) {
                parentId = link.one_thing_id;
                break;
            }
        }

        return {
            id: thingId,
            name: obj.name,
            level,
            description: obj.description || null,
            public: obj.public || 0,
            nodes: children,
            translation: null,
            parent_id: parentId,
        };
    }

    // Roots = classes that have no parent link (parent not found in link data)
    const linkedChildren = new Set(allLinks.map(l => l.other_thing_id));
    const roots = classObjects
        .filter(obj => !linkedChildren.has(obj.thing_id))
        .map(obj => buildNode(obj.thing_id, 1))
        .filter(Boolean);

    return roots;
}
