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

/** Generate a unique id for locally-created links (crypto.randomUUID is
 *  available in the Android WebView and Node — avoids bundling the `uuid` npm
 *  package into the dynamically-imported local API chunk). */
function newLinkId() {
    return `link-${crypto.randomUUID()}`;
}

/** Base path to strip from URLs */
const API_PREFIX = '/object';

/**
 * Handle /user endpoint (auth check).
 * In offline mode, returns a local anonymous user.
 */
export async function handleLocalUserCall() {
    return {
        data: {
            id: 1,
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
export async function handleLocalApiCall(method, url, data = null, context = {}) {
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
        return handleCreate(id, data, context);
    }

    if (method === 'put') {
        return handleUpdate(id, data, context);
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
        // Return class tree built from objects + parent-child links.
        // Mirrors the server (searchTree): classes AND link types that
        // descend from Everything via "is a parent of" links.
        const things = await listObjects({ type: [UUID.G_CLASS, UUID.G_LINK], includeDeleted: false });
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

    // Filter by checked classes (things linked to any of the selected classes)
    if (params.classes && params.classes.length > 0) {
        const classIds = new Set(params.classes);
        const filtered = [];
        for (const obj of results) {
            const links = await listLinksForThing(obj.thing_id);
            const hasClassLink = links.some(l =>
                l.one_thing_id === obj.thing_id && classIds.has(l.other_thing_id));
            if (hasClassLink) filtered.push(obj);
        }
        results = filtered;
    }

    // Apply sorting (mirror server ApiController::search):
    //   default sort_by=updated → _updatedAt, default order desc
    const sortMap = {
        updated: '_updatedAt',
        created: '_createdAt',
        start: 'start',
        name: 'name',
    };
    const sortBy = params.sort_by || 'updated';
    const sortDir = (params.sort_order || 'desc') === 'asc' ? 1 : -1;
    const sortKey = sortMap[sortBy] || '_updatedAt';
    results.sort((a, b) => {
        const va = a[sortKey];
        const vb = b[sortKey];
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        if (typeof va === 'number' && typeof vb === 'number') {
            return (va - vb) * sortDir;
        }
        return String(va).localeCompare(String(vb)) * sortDir;
    });

    // Enrich with links + resolved class info
    const thingsWithLinks = [];
    for (const obj of results) {
        const links = await enrichLinks(
            await listLinksForThing(obj.thing_id),
            obj.thing_id,
        );
        thingsWithLinks.push({
            ...obj,
            class: await resolveClassInfo(obj.thing_id),
            links: links.length > 0 ? links : undefined,
        });
    }

    return {
        data: { things: thingsWithLinks },
        status: 200,
    };
}

/**
 * Resolve the class of a thing (mirrors the server's class lookup that sets
 * `thing.class = { thing_id, name }`). Classes come from a LINK_TO_CLASS link
 * where one_thing_id is the object and other_thing_id is the class.
 *
 * @param {string} thingId
 * @returns {Promise<object|null>} { thing_id, name } or null
 */
async function resolveClassInfo(thingId) {
    const db = getDb();
    const classLink = await db.links
        .where('one_thing_id')
        .equals(thingId)
        .and(l => l.link_type_id === UUID.LINK_TO_CLASS)
        .first();
    if (!classLink?.other_thing_id) return null;

    const classObj = await getObject(classLink.other_thing_id);
    if (!classObj) return null;

    return {
        thing_id: classObj.thing_id,
        name: classObj.name,
    };
}

async function handleGet(id) {
    const obj = await getObject(id);
    if (!obj) {
        throw { response: { status: 404, data: { message: 'Not found' } } };
    }

    const links = await enrichLinks(await listLinksForThing(id), id);

    return {
        data: {
            data: {
                ...obj,
                class: await resolveClassInfo(id),
                links: links.length > 0 ? links : undefined,
            },
            success: true,
        },
        status: 200,
    };
}

/** Link-related payload keys — processed separately, never stored on the object row. */
const LINK_PAYLOAD_KEYS = [
    'class', 'parent', 'links_to_add', 'links_to_update', 'links_to_delete', 'external_links',
];

async function handleCreate(id, body, context = {}) {
    const data = typeof body === 'string' ? JSON.parse(body) : body;

    // Strip link-payload keys so they don't pollute the object record
    // (mirrors the server model's _tableFields whitelist).
    const objFields = { ...data, thing_id: id };
    for (const key of LINK_PAYLOAD_KEYS) {
        delete objFields[key];
    }

    const objData = {
        ...objFields,
        // Mirror the server (Everything::save): a newly created object is
        // owned by the current user unless the client explicitly sets owner.
        owner: data.owner || context.userThingId || null,
    };

    await createObject(objData, { skipChangeLog: true });

    // Process special + regular links (mirror server store())
    await processLinksForObject(id, data);

    const created = await getObject(id);
    return {
        data: { data: created || objData, success: true },
        status: 200,
    };
}

async function handleUpdate(id, body, context = {}) {
    const data = typeof body === 'string' ? JSON.parse(body) : body;

    // Only scalar object fields are persisted; link payloads are handled below.
    const changes = { ...data };
    delete changes.thing_id;
    for (const key of LINK_PAYLOAD_KEYS) {
        delete changes[key];
    }

    await updateObject(id, changes, { skipChangeLog: true });

    // Process special + regular links (mirror server store())
    await processLinksForObject(id, data);

    const updated = await getObject(id);
    return {
        data: { data: updated, success: true },
        status: 200,
    };
}

/**
 * Mirror the server's store() link handling for create/update payloads:
 *   parent             → LINK_TO_PARENT link (class hierarchy)
 *   class              → LINK_TO_CLASS link (thing membership)
 *   links_to_add       → create each link
 *   links_to_update    → update each link (by link_id)
 *   links_to_delete    → delete each link (by link_id)
 *
 * @param {string} thingId - The object being created/updated
 * @param {object} data - The raw request payload
 */
async function processLinksForObject(thingId, data) {
    // ── class / parent special links ────────────────────────────────
    if (data.class && data.class.other_thing_id) {
        const cls = data.class;
        await saveLink({
            link_id: cls.link_id || newLinkId(),
            one_thing_id: thingId,
            link_type_id: UUID.LINK_TO_CLASS,
            other_thing_id: cls.other_thing_id,
            translation: cls.description || cls.translation || '',
            public: cls.public ?? 1,
        }, { skipChangeLog: true });
    }

    if (data.parent && data.parent.one_thing_id) {
        const parent = data.parent;
        // Parent link is stored as one_thing_id=parent, other_thing_id=child
        // (mirrors the server's setParent() and buildClassTree).
        await saveLink({
            link_id: parent.link_id || newLinkId(),
            one_thing_id: parent.one_thing_id,
            link_type_id: UUID.LINK_TO_PARENT,
            other_thing_id: parent.other_thing_id || thingId,
            translation: parent.description || parent.translation || '',
            public: parent.public ?? 1,
        }, { skipChangeLog: true });
    }

    // ── regular links ───────────────────────────────────────────────
    for (const link of data.links_to_add || []) {
        await saveLink({
            link_id: link.link_id || newLinkId(),
            one_thing_id: link.one_thing_id || thingId,
            link_type_id: link.link_type_id,
            other_thing_id: link.other_thing_id,
            translation: link.description || link.translation || '',
            public: link.public ?? 0,
        }, { skipChangeLog: true });
    }

    for (const link of data.links_to_update || []) {
        if (!link.link_id) continue;
        await saveLink({
            link_id: link.link_id,
            one_thing_id: link.one_thing_id || thingId,
            link_type_id: link.link_type_id,
            other_thing_id: link.other_thing_id,
            translation: link.description || link.translation || '',
            public: link.public ?? 0,
        }, { skipChangeLog: true });
    }

    for (const linkId of data.links_to_delete || []) {
        await deleteLink(linkId, { skipChangeLog: true });
    }
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
        const linkData = {
            ...body,
            link_id: linkId || body.link_id || newLinkId(),
        };
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
 * Enrich raw link records with endpoint display names, mirroring what the
 * server does (LinkResource: links joined with `things.name` and
 * `link_types.name as link_name`). Without this, LinkDescription renders
 * "Unknown" for every link endpoint in standalone mode.
 *
 * @param {Array} links - Raw links from the local DB
 * @param {string} currentThingId - The object these links belong to
 * @returns {Promise<Array>} Links with name/link_name/type/target_public
 */
async function enrichLinks(links, currentThingId) {
    if (!links || links.length === 0) return links;
    const db = getDb();

    // Collect every endpoint UUID we need to resolve
    const ids = new Set();
    for (const link of links) {
        if (link.one_thing_id !== currentThingId) ids.add(link.one_thing_id);
        if (link.other_thing_id !== currentThingId) ids.add(link.other_thing_id);
        ids.add(link.link_type_id);
    }

    const found = await db.objects.bulkGet([...ids]);
    const byId = {};
    for (const o of found) {
        if (o) byId[o.thing_id] = o;
    }

    return links.map(link => {
        // The "name" the UI shows is the link's opposite endpoint
        const targetId = link.one_thing_id === currentThingId
            ? link.other_thing_id
            : link.one_thing_id;
        const target = byId[targetId];
        const linkType = byId[link.link_type_id];

        return {
            ...link,
            name: target?.name ?? link.name ?? null,
            link_name: linkType?.name ?? link.link_name ?? null,
            type: target?.type ?? link.type,
            target_public: target?.public ?? link.target_public,
        };
    });
}

/**
 * Build a class tree from flat list of class/link-type objects + the
 * parent-child links. Mirrors the server (searchTree recursive CTE):
 * the tree starts at Everything and descends via "is a parent of" links.
 *
 * @param {Array} classObjects - Things with type=G_CLASS or G_LINK
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
        if (level > 10) return null; // mirrors the server's depth limit
        const obj = thingMap[thingId];
        if (!obj) return null;

        const children = (parentMap[thingId] || [])
            .map(childId => buildNode(childId, level + 1))
            .filter(Boolean);

        // Sort siblings to match the server (searchTree): classes first,
        // then link types, and "System" last.
        const sortPriority = node => node.id === UUID.SYSTEM ? 2 : (node.type === UUID.G_CLASS ? 0 : 1);
        children.sort((a, b) => sortPriority(a) - sortPriority(b) || a.name.localeCompare(b.name));

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
            type: obj.type,
            public: obj.public || 0,
            nodes: children,
            translation: null,
            parent_id: parentId,
        };
    }

    // Single root: Everything (mirrors the server's `WHERE c.thing_id = ?`)
    const root = buildNode(UUID.EVERYTHING, 1);
    return root ? [root] : [];
}
