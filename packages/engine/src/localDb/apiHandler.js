// packages/engine/src/localDb/apiHandler.js
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
    matchesSearchText,
    getDb,
    SYNC_STATUS,
} from './index.js';
import { saveLink, deleteLink, getLink, listLinksForThing } from './links.js';
import { seedLocalDb } from './seeder.js';
import { UUID } from '../constants/uuid.js';
import { filterVisible, isRowVisible } from './visibility.js';
import {
    localConsistencyCheck,
    localConsistencyDelete,
    localExportJson,
    localImportJson,
    localFindDuplicates,
} from './localTools.js';
import { importGedcom } from '../gedcom/gedcomImporter.js';
import { createDexieStore } from '../gedcom/dexieStore.js';

/** Generate a unique id for locally-created links (crypto.randomUUID is
 *  available in the Android WebView and Node — avoids bundling the `uuid` npm
 *  package into the dynamically-imported local API chunk). */
function newLinkId() {
    return `link-${crypto.randomUUID()}`;
}

/** Base path to strip from URLs */
const API_PREFIX = '/object';

/** True in the standalone offline build (mirrors utils/objectImages). */
const OFFLINE_ONLY = import.meta.env.VITE_TARGET === 'capacitor' && !import.meta.env.VITE_API_URL;

// Multilevel related-object limits (mirror App\Services\RelatedObjectsResolver).
const DEPTH_CAP = 6;
const SEARCH_BREADTH = 5;
const BREADTH_CAP = 8;

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
    // `depth` may arrive as a query string (GET /object/{id}?depth=N).
    const [pathPart, queryPart] = String(url).split('?');
    const depthParam = queryPart ? new URLSearchParams(queryPart).get('depth') : null;
    const depth = depthParam != null
        ? Math.min(Math.max(parseInt(depthParam, 10) || 0, 0), DEPTH_CAP)
        : 1;

    // Client error reports (from errorTracker.js) — silently ignore in local mode
    if (pathPart === '/client-error' || pathPart === 'client-error') {
        return { data: { success: true }, status: 200 };
    }

    const normalizedUrl = pathPart.replace(API_PREFIX, '').replace(/^\/+/, '');
    const parts = normalizedUrl.split('/').filter(Boolean);

    // ── Server-mirror Tools endpoints, implemented locally for the offline
    //    app (same response shapes as the Laravel controllers — see
    //    localTools.js). Handled before the /object-only guard below.
    const localTool = await handleLocalTool(method, parts, queryPart, data, context);
    if (localTool !== undefined) {
        return localTool;
    }

    // The local mirror only knows /object (and /user, /link, /client-error,
    // handled before reaching here). A write to any other path is a
    // server-only endpoint (e.g. /import/gedcom, /search/options); sending it
    // into handleCreate below would "create" a junk object whose id is the
    // path segment (thing_id 'import', 'tools', …) and silently report
    // success. Reject it with a clean, visible message instead.
    const isObjectPath = pathPart === API_PREFIX || pathPart.startsWith(API_PREFIX + '/');
    if (['post', 'put', 'patch', 'delete'].includes(method) && !isObjectPath) {
        throw offlineError(501, `Not available in the offline app: ${method.toUpperCase()} ${pathPart}`);
    }

    // ── /object (POST - search) ──────────────────────────────────────
    if (method === 'post' && parts.length === 0) {
        return handleSearch(data, context);
    }

    // ── /object/{id} ─────────────────────────────────────────────────
    const id = parts[0];

    // /object/{id}/thumb — per-object image file on the device (offline
    // standalone only; the UI layer usually talks to deviceImages directly).
    if (OFFLINE_ONLY && id && parts[1] === 'thumb') {
        return handleDeviceThumb(method, id, data);
    }

    // /object/{id}/graph — the Graph tab (mirrors ApiController::graph).
    if (method === 'get' && parts[1] === 'graph') {
        return handleLocalGraph(id, depth, context);
    }

    // Everything else must be exactly /object/{id} — never let an extra
    // segment (e.g. a server-mode thumb request) silently fall through to
    // handleUpdate/handleGet with the wrong payload.
    if (parts.length !== 1) {
        throw new Error(`Unhandled local API: ${method} ${url}`);
    }

    if (method === 'get') {
        return handleGet(id, depth, context);
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

/**
 * Shape an error like an axios failure so UI catch handlers surface `message`.
 */
function offlineError(status, message) {
    const err = new Error(message);
    err.response = { status, data: { message, code: 'offline_unavailable' } };
    return err;
}

/**
 * Tools-page endpoints implemented locally (see localTools.js). Returns the
 * axios-shaped success object, or undefined when the path is not one of ours
 * (then the normal /object dispatch / guard applies).
 */
async function handleLocalTool(method, parts, queryPart, data, context = {}) {
    const first = parts[0];

    // GET /export?include_deleted=… → JSON backup string (Tools downloads it).
    if (method === 'get' && first === 'export') {
        const includeDeleted = queryPart
            ? new URLSearchParams(queryPart).get('include_deleted') === 'true'
            : false;
        const text = await localExportJson({
            includeDeleted,
            visibleOwners: context.visibleOwners ?? null,
            exportedBy: context.userThingId ?? null,
        });
        return { data: text, status: 200 };
    }

    // POST /import → JSON backup restore (ImportModal). The file arrives as
    // FormData from the modal.
    if (method === 'post' && first === 'import' && parts.length === 1) {
        const result = await readImportRequest(data);
        return { data: { success: true, result }, status: 200 };
    }

    // POST /import/gedcom → client-side GEDCOM parser + importer, same mapping
    // as the redesigned server importer (see gedcom/gedcomImporter.js).
    if (method === 'post' && first === 'import' && parts[1] === 'gedcom') {
        if (!context.userThingId) {
            throw offlineError(403, 'Offline data is read-only until you create or import an identity.');
        }
        const fileData = (data && typeof data.get === 'function') ? data.get('file') : null;
        if (!fileData) throw offlineError(422, 'No file provided for import.');
        const content = await fileData.text();
        if (!content.trim()) throw offlineError(422, 'Empty or unreadable file');

        const result = await importGedcom({
            content,
            ownerId: context.userThingId,
            store: createDexieStore(),
        });
        return { data: { success: true, result }, status: 200 };
    }

    // POST /import/find-duplicates → DuplicatePersonMatcher mirror.
    if (method === 'post' && first === 'import' && parts[1] === 'find-duplicates') {
        const result = await localFindDuplicates(context.visibleOwners ?? null);
        return { data: { success: true, result }, status: 200 };
    }

    // POST /tools/consistency-check → DatabaseConsistencyChecker mirror.
    if (method === 'post' && first === 'tools' && parts[1] === 'consistency-check') {
        const result = await localConsistencyCheck();
        return { data: { success: true, result }, status: 200 };
    }

    // POST /tools/consistency-delete → ToolsController::deleteSelected mirror.
    if (method === 'post' && first === 'tools' && parts[1] === 'consistency-delete') {
        const body = typeof data === 'string' ? JSON.parse(data) : (data || {});
        const res = await localConsistencyDelete(body.ids, context.visibleOwners ?? null);
        return { data: { success: true, deleted: res.deleted, failed: res.failed }, status: 200 };
    }

    return undefined;
}

/**
 * Unwrap the /import request body (FormData file upload from ImportModal, or a
 * raw JSON string/object in tests) and run the local import.
 */
async function readImportRequest(data) {
    let payload;
    let conflictMode = 'latest_wins';

    const reject = () => offlineError(422, 'Invalid import data. Expected JSON with "data" key containing "things" and/or "links".');

    if (data && typeof data === 'object' && typeof data.get === 'function') {
        conflictMode = String(data.get('conflict_mode') || 'latest_wins');
        const file = data.get('file');
        if (!file) throw offlineError(422, 'No file provided for import.');
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (!parsed?.data) throw reject();
        payload = parsed.data;
    } else if (typeof data === 'string') {
        const parsed = JSON.parse(data);
        payload = parsed?.data ?? parsed;
        conflictMode = parsed?.conflict_mode || conflictMode;
    } else {
        payload = data?.data ?? data;
        conflictMode = data?.conflict_mode || conflictMode;
    }

    if (!payload || typeof payload !== 'object') throw reject();
    if (!Array.isArray(payload.things) && !Array.isArray(payload.links)) throw reject();

    return localImportJson(payload, conflictMode);
}

/**
 * Offline thumbnails: GET /object/{id}/thumb → existence check,
 * PUT /object/{id}/thumb → write the picked file, DELETE → remove it.
 */
async function handleDeviceThumb(method, thingId, body) {
    const device = await import('../media/deviceImages.js');

    if (method === 'get') {
        const custom = await device.hasDeviceThumb(thingId);
        return {
            data: {
                success: true,
                thing_id: thingId,
                custom,
                thumb: `/thumbs/${thingId.charAt(0)}/${thingId.charAt(1)}/${thingId}.jpg`,
            },
            status: 200,
        };
    }

    if (method === 'put') {
        const raw = typeof body === 'string' ? JSON.parse(body) : (body || {});
        const form = raw instanceof FormData ? raw : null;
        const file = form ? form.get('file') : null;
        if (!file) {
            throw new Error('Offline image upload requires a file (URL import is handled in the UI).');
        }
        await device.writeDeviceThumb(thingId, file);
        return {
            data: { success: true, thumb: `/thumbs/${thingId.charAt(0)}/${thingId.charAt(1)}/${thingId}.jpg` },
            status: 200,
        };
    }

    if (method === 'delete') {
        await device.removeDeviceThumb(thingId);
        return { data: { success: true }, status: 200 };
    }

    throw new Error(`Unhandled local thumb API: ${method} /object/${thingId}/thumb`);
}

async function handleSearch(body, context = {}) {
    const params = typeof body === 'string' ? JSON.parse(body) : (body || {});

    // Owners visible to this session (null = filter disabled). The offline
    // adapter supplies this; UI never sees rows owned by a locked/unknown
    // identity (see localDb/visibility.js).
    const visibleOwners = context.visibleOwners ?? null;

    if (params.tree) {
        // Return class tree built from objects + parent-child links.
        // Mirrors the server (searchTree): classes, models AND link types that
        // descend from Everything via "is a parent of" links.
        const all = await listObjects({ type: [UUID.G_CLASS, UUID.G_MODEL, UUID.G_LINK], includeDeleted: false });
        const things = filterVisible(all, visibleOwners);
        const tree = await buildClassTree(things);
        return {
            data: { things: tree },
            status: 200,
        };
    }

    const typeFilter = Array.isArray(params.type) ? params.type : (params.type ? [params.type] : []);
    const searchTerm = (params.search || '').trim().toLowerCase();

    let results;
    if (params.classes && params.classes.length > 0) {
        // Mirror the server plan: with a class filter, start from the class
        // links (like the server's links join) rather than scanning the whole
        // `type` column. The default search view (a whole subtree checked, no
        // text) would otherwise read every object of that type from IndexedDB.
        const classIds = new Set(params.classes);
        const classLinks = await getDb().links
            .where('other_thing_id')
            .anyOf([...classIds])
            .and(l => l.link_type_id === UUID.LINK_TO_CLASS)
            .toArray();
        const candidateIds = [...new Set(classLinks.map(l => l.one_thing_id))];
        const candidates = candidateIds.length ? await getDb().objects.bulkGet(candidateIds) : [];
        results = candidates.filter(obj => obj && !obj.deleted);
        if (typeFilter.length > 0) results = results.filter(o => typeFilter.includes(o.type));
        if (searchTerm) results = results.filter(o => matchesSearchText(o, searchTerm));
    } else {
        // Search through the Dexie `type` index when a type filter is present —
        // a full collection scan per keystroke is the dominant cost on large
        // local DBs.
        results = await searchObjects(params.search || '', {
            includeDeleted: false,
            type: typeFilter,
        });
    }

    // Apply sorting (mirror server ApiController::search):
    //   default sort_by=start → start, default order desc
    const sortMap = {
        updated: '_updatedAt',
        created: '_createdAt',
        start: 'start',
        name: 'name',
    };
    const sortBy = params.sort_by || 'start';
    const sortDir = (params.sort_order || 'desc') === 'asc' ? 1 : -1;
    const sortKey = sortMap[sortBy] || 'start';
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

    // Drop rows owned by identities that are locked/not active BEFORE the cap,
    // so hidden rows never consume UI slots.
    results = filterVisible(results, visibleOwners);

    // Cap at 100 like the server LIMIT 100 — the enrichment below is
    // per-object, so the cap must come first (it did in the server SQL too).
    const page = results.slice(0, 100);
    if (page.length === 0) {
        return { data: { things: [] }, status: 200 };
    }

    // Enrich with links + resolved class info. `depth` mirrors the server:
    // depth 0 → no links, depth 1 → direct related (breadth-capped), deeper →
    // nested target.links.
    const parsedDepth = parseInt(params.depth ?? '1', 10);
    const depth = Number.isNaN(parsedDepth) ? 1 : Math.min(Math.max(parsedDepth, 0), DEPTH_CAP);

    // Batch the per-object lookups (class membership + related links) into
    // three queries for the whole page instead of 3 per object.
    const [classesByThing, linksByThing] = await Promise.all([
        resolveClassesInfoFor(page.map(o => o.thing_id)),
        listLinksForThings(page.map(o => o.thing_id)),
    ]);

    const thingsWithLinks = [];
    for (const obj of page) {
        // Class membership (LINK_TO_CLASS) is not a relation — exclude it from
        // the related-links enrichment (mirrors the server).
        const relatedLinks = (linksByThing.get(obj.thing_id) || [])
            .filter(l => l.link_type_id !== UUID.LINK_TO_CLASS);
        const links = depth > 0
            ? await enrichNested(relatedLinks, obj.thing_id, depth, null, SEARCH_BREADTH, SEARCH_BREADTH, visibleOwners)
            : undefined;
        const classes = classesByThing.get(obj.thing_id) || [];
        thingsWithLinks.push({
            ...obj,
            classes,
            class: classes[0] ?? null,
            links: links && links.length > 0 ? links : undefined,
        });
    }

    return {
        data: { things: thingsWithLinks },
        status: 200,
    };
}

/**
 * Resolve all classes of a thing (multi-class, mirrors the server's `classes`
 * array; the first entry is the primary `class`). Classes come from
 * LINK_TO_CLASS links where one_thing_id is the object and other_thing_id is
 * the class.
 *
 * @param {string} thingId
 * @returns {Promise<Array<{thing_id, name}>>}
 */
async function resolveClassesInfo(thingId) {
    const db = getDb();
    const classLinks = await db.links
        .where('one_thing_id')
        .equals(thingId)
        .and(l => l.link_type_id === UUID.LINK_TO_CLASS)
        .toArray();

    const classObjs = await Promise.all(
        classLinks.map(link => link.other_thing_id ? getObject(link.other_thing_id) : Promise.resolve(null))
    );
    return classObjs.filter(Boolean).map(classObj => ({
        thing_id: classObj.thing_id,
        name: classObj.name,
    }));
}

/**
 * Batch variant of resolveClassesInfo for search results: one links query +
 * one bulkGet for the whole page. Returns Map<thing_id, classes[]>.
 * Mirrors the server's batched attachClasses.
 */
async function resolveClassesInfoFor(thingIds) {
    const db = getDb();
    if (!thingIds.length) return new Map();

    const classLinks = await db.links
        .where('one_thing_id')
        .anyOf(thingIds)
        .and(l => l.link_type_id === UUID.LINK_TO_CLASS)
        .toArray();

    const classIds = [...new Set(classLinks.map(l => l.other_thing_id))];
    const classObjs = classIds.length ? await db.objects.bulkGet(classIds) : [];
    const byId = {};
    for (const c of classObjs) {
        if (c) byId[c.thing_id] = c;
    }

    const map = new Map();
    for (const l of classLinks) {
        const c = byId[l.other_thing_id];
        if (!c) continue;
        if (!map.has(l.one_thing_id)) map.set(l.one_thing_id, []);
        map.get(l.one_thing_id).push({ thing_id: c.thing_id, name: c.name });
    }
    return map;
}

/**
 * Batch variant of listLinksForThing for many things at once: one query per
 * endpoint column (two total), deduped within each thing's bucket. Returns
 * Map<thing_id, links[]> — a link linking two result objects lands in both
 * buckets, exactly like the per-thing `.or()` query did.
 */
async function listLinksForThings(thingIds) {
    const db = getDb();
    if (!thingIds.length) return new Map();

    const [byOne, byOther] = await Promise.all([
        db.links.where('one_thing_id').anyOf(thingIds).toArray(),
        db.links.where('other_thing_id').anyOf(thingIds).toArray(),
    ]);

    const bucket = new Map(); // thing_id -> Map<link_id, link>
    const push = (link, tid) => {
        if (!bucket.has(tid)) bucket.set(tid, new Map());
        bucket.get(tid).set(link.link_id, link);
    };
    for (const l of byOne) push(l, l.one_thing_id);
    for (const l of byOther) push(l, l.other_thing_id);

    const map = new Map();
    for (const [tid, linksById] of bucket) {
        map.set(tid, [...linksById.values()]);
    }
    return map;
}

async function handleGet(id, depth = 1, context = {}) {
    const obj = await getObject(id);
    if (!obj) {
        throw { response: { status: 404, data: { message: 'Not found' } } };
    }

    // A locked identity's own row must not be reachable even by direct
    // deep-link — hide it like the server would (404).
    const visibleOwners = context.visibleOwners ?? null;
    if (!isRowVisible(obj, visibleOwners)) {
        throw { response: { status: 404, data: { message: 'Not found' } } };
    }

    // depth 1 (default) → direct related links with a resolved `target`;
    // depth >= 2 → nested target.links, mirroring GET /object/{id}?depth=N.
    // The top level stays unlimited (all direct links are returned, like the
    // server's flat list); only deeper levels are breadth-capped. Class
    // membership (LINK_TO_CLASS) is not a relation — the server excludes it.
    const relatedLinks = (await listLinksForThing(id))
        .filter(l => l.link_type_id !== UUID.LINK_TO_CLASS);
    const links = depth > 0
        ? await enrichNested(relatedLinks, id, depth, null, BREADTH_CAP, Infinity, visibleOwners)
        : undefined;

    const classes = await resolveClassesInfo(id);

    return {
        data: {
            data: {
                ...obj,
                classes,
                class: classes[0] ?? null,
                links: links && links.length > 0 ? links : undefined,
            },
            success: true,
        },
        status: 200,
    };
}

const GRAPH_DEPTH_CAP = 6;
const GRAPH_BREADTH = 8;

/**
 * Offline mirror of ApiController::graph / RelatedObjectsResolver::forGraph:
 * BFS out from the root over the local links table and return the server's
 * shape { root_id, nodes:[...], edges:[...] } so the Graph tab works in the
 * standalone (Dexie) app without a backend.
 *
 * Rules mirror the server resolver: the top level is uncapped, deeper levels
 * are breadth-capped per parent, a node is shown at its lowest level only,
 * class-membership (LINK_TO_CLASS) rows are not relations, and edges are every
 * link between two displayed nodes.
 */
async function handleLocalGraph(id, depth = 1, context = {}) {
    const db = getDb();
    const root = await getObject(id);
    if (!root) {
        throw { response: { status: 404, data: { message: 'Not found' } } };
    }
    const visibleOwners = context.visibleOwners ?? null;
    if (!isRowVisible(root, visibleOwners)) {
        throw { response: { status: 404, data: { message: 'Not found' } } };
    }
    depth = Number.isFinite(depth)
        ? Math.min(Math.max(Math.trunc(depth), 1), GRAPH_DEPTH_CAP)
        : 1;

    const nodeIds = [id];
    const visited = new Set([id]);
    let frontier = [id];

    for (let level = 1; level <= depth && frontier.length > 0; level++) {
        const [byOne, byOther] = await Promise.all([
            db.links.where('one_thing_id').anyOf(frontier).toArray(),
            db.links.where('other_thing_id').anyOf(frontier).toArray(),
        ]);

        const frontierSet = new Set(frontier);
        const seen = new Set();
        const perParent = new Map();
        for (const link of [...byOne, ...byOther]) {
            if (link.deleted) continue;
            if (link.link_type_id === UUID.LINK_TO_CLASS) continue;
            if (seen.has(link.link_id)) continue;
            seen.add(link.link_id);

            const oneIn = frontierSet.has(link.one_thing_id);
            const otherIn = frontierSet.has(link.other_thing_id);
            if (oneIn === otherIn) continue; // self-link or both endpoints in the frontier
            const parent = oneIn ? link.one_thing_id : link.other_thing_id;
            const child = oneIn ? link.other_thing_id : link.one_thing_id;
            if (level > 1 && visited.has(child)) continue; // lowest level wins
            if (!perParent.has(parent)) perParent.set(parent, []);
            perParent.get(parent).push({ link, child });
        }

        const next = [];
        for (const items of perParent.values()) {
            // Deterministic order: dated links first (desc), then by child id.
            items.sort((a, b) => {
                const la = a.link.link_start ?? null;
                const lb = b.link.link_start ?? null;
                if (la != null && lb == null) return -1;
                if (lb != null && la == null) return 1;
                if (la != null && lb != null) return String(lb).localeCompare(String(la));
                return String(a.child).localeCompare(String(b.child));
            });
            // Top level is uncapped; deeper levels are breadth-capped per parent.
            const limit = level === 1 ? Infinity : GRAPH_BREADTH;
            let kept = 0;
            for (const { child } of items) {
                if (kept >= limit) break;
                if (visited.has(child)) continue;
                visited.add(child);
                nodeIds.push(child);
                next.push(child);
                kept++;
            }
        }
        frontier = next;
    }

    // ── Nodes (metadata the graph needs) ──────────────────────────────
    const rows = await db.objects.bulkGet(nodeIds);
    const byId = new Map();
    for (const o of rows) {
        if (o && !o.deleted && isRowVisible(o, visibleOwners)) byId.set(o.thing_id, o);
    }
    const keptIds = [...byId.keys()];
    const classes = await resolveClassesInfoFor(keptIds);
    const nodes = keptIds.map((thingId) => {
        const o = byId.get(thingId);
        const cls = classes.get(thingId) || [];
        return {
            thing_id: thingId,
            name: o.name ?? null,
            name_translations: o.name_translations ?? null,
            type: o.type != null ? Number(o.type) : null,
            start: o.start != null ? String(o.start) : null,
            end: o.end != null ? String(o.end) : null,
            classes: cls,
            class: cls[0] ?? null,
        };
    });

    // ── Edges between displayed nodes (undirected, incl. cross-links) ──
    const keptSet = new Set(keptIds);
    const [eByOne, eByOther] = await Promise.all([
        db.links.where('one_thing_id').anyOf(keptIds).toArray(),
        db.links.where('other_thing_id').anyOf(keptIds).toArray(),
    ]);
    const edgeRows = [];
    const edgeSeen = new Set();
    for (const link of [...eByOne, ...eByOther]) {
        if (link.deleted) continue;
        if (link.link_type_id === UUID.LINK_TO_CLASS) continue;
        if (edgeSeen.has(link.link_id)) continue;
        edgeSeen.add(link.link_id);
        if (link.one_thing_id === link.other_thing_id) continue;
        if (!keptSet.has(link.one_thing_id) || !keptSet.has(link.other_thing_id)) continue;
        edgeRows.push(link);
    }
    const typeRows = await db.objects.bulkGet([...new Set(edgeRows.map((l) => l.link_type_id))]);
    const typeById = new Map();
    for (const t of typeRows) if (t) typeById.set(t.thing_id, t);
    const edges = edgeRows.map((link) => {
        const type = typeById.get(link.link_type_id);
        return {
            link_id: link.link_id,
            one_thing_id: link.one_thing_id,
            other_thing_id: link.other_thing_id,
            link_type_id: link.link_type_id,
            link_name: type?.name ?? null,
            link_name_translations: type?.name_translations ?? null,
        };
    });

    return {
        data: { root_id: id, nodes, edges },
        status: 200,
    };
}

/** Link-related payload keys — processed separately, never stored on the object row. */
const LINK_PAYLOAD_KEYS = [
    'class', 'classes', 'parent', 'links_to_add', 'links_to_update', 'links_to_delete', 'external_links',
];

/**
 * Objects (type 3) must belong to at least one class. Mirrors the server's
 * store() validation; only affects user-facing create/update calls.
 * @throws {object} a 422-shaped error for the axios interceptor to surface
 */
function assertThingHasClass(data) {
    if (Number(data.type) !== 3) return;
    let hasClassInfo = !!(data.class && data.class.other_thing_id)
        || (Array.isArray(data.classes) && data.classes.length > 0);
    if (!hasClassInfo && Array.isArray(data.links_to_add)) {
        hasClassInfo = data.links_to_add.some(l => l.link_type_id === UUID.LINK_TO_CLASS);
    }
    if (!hasClassInfo) {
        throw { response: { status: 422, data: { errors: { classes: 'Objects must belong to at least one class.' } } } };
    }
}

async function handleCreate(id, body, context = {}) {
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    assertThingHasClass(data);

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
    // Note: no at-least-one-class assertion here — an update is a partial patch
    // of an existing object that already carries its classes (mirrors server).

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
    // `classes` (multi-class, full replacement) wins over singular `class`,
    // mirroring the server's setClasses()/setClass() precedence.
    if (Array.isArray(data.classes)) {
        const desired = new Set();
        const db = getDb();
        for (const cls of data.classes) {
            if (!cls.other_thing_id) continue;
            desired.add(cls.other_thing_id);
            // Reuse an existing class link for the same endpoint pair (like the
            // server's addLink) so re-saving the same class updates instead of
            // inserting a duplicate row.
            const existing = await db.links
                .where('one_thing_id')
                .equals(thingId)
                .and(l => l.link_type_id === UUID.LINK_TO_CLASS && l.other_thing_id === cls.other_thing_id)
                .first();
            await saveLink({
                link_id: cls.link_id || existing?.link_id || newLinkId(),
                one_thing_id: thingId,
                link_type_id: UUID.LINK_TO_CLASS,
                other_thing_id: cls.other_thing_id,
                description: cls.description || '',
                public: cls.public ?? 1,
            }, { skipChangeLog: true });
        }
        // Diff: remove class links the caller no longer wants (edit flow).
        const existingClassLinks = await db.links
            .where('one_thing_id')
            .equals(thingId)
            .and(l => l.link_type_id === UUID.LINK_TO_CLASS)
            .toArray();
        for (const link of existingClassLinks) {
            if (!desired.has(link.other_thing_id)) {
                await deleteLink(link.link_id, { skipChangeLog: true });
            }
        }
    } else if (data.class && data.class.other_thing_id) {
        const cls = data.class;
        await saveLink({
            link_id: cls.link_id || newLinkId(),
            one_thing_id: thingId,
            link_type_id: UUID.LINK_TO_CLASS,
            other_thing_id: cls.other_thing_id,
            description: cls.description || '',
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
            description: parent.description || '',
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
            description: link.description || '',
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
            description: link.description || '',
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

    // Class membership of the counterpart objects, so the object-page
    // class/link-type filter can judge each row: link.target carries the
    // classes here, exactly like the server's nested resolver. Without it a
    // checked class (the panel starts all-checked) would never match a target
    // with empty `classes` and the whole related list would vanish.
    const counterpartIds = [...new Set(links.map((link) =>
        (link.other_thing_id === currentThingId ? link.one_thing_id : link.other_thing_id),
    ))].filter(Boolean);
    const classesMap = await resolveClassesInfoFor(counterpartIds);

    return links.map(link => {
        // Mirror the server LinkResource contract: `name` is the name of
        // other_thing_id, `one_name` the name of one_thing_id — the UI picks
        // the one matching the target endpoint.
        const other = byId[link.other_thing_id];
        const source = byId[link.one_thing_id];
        const linkType = byId[link.link_type_id];

        // `target` is the endpoint on the OTHER side of the current object.
        // For an incoming link (other_thing_id === currentThingId) that is
        // one_thing_id — resolving the wrong endpoint here makes incoming
        // relations look like self-links and they get pruned by enrichNested,
        // so the object page and graph silently lose every such link.
        const counterpartId = link.other_thing_id === currentThingId
            ? link.one_thing_id
            : link.other_thing_id;
        const counterpart = byId[counterpartId];
        const cls = counterpartId ? (classesMap.get(counterpartId) || []) : [];

        return {
            ...link,
            name: other?.name ?? link.name ?? null,
            one_name: source?.name ?? link.one_name ?? null,
            link_name: linkType?.name ?? link.link_name ?? null,
            link_name_translations: linkType?.name_translations ?? link.link_name_translations ?? null,
            type: counterpart?.type ?? link.type,
            target_public: counterpart?.public ?? link.target_public,
            // Convenience: the counterpart object's own flexible date. Event and
            // involvement dates are independent (a link may carry its own
            // link_start/link_end), so the object's date lives here for the UI
            // to fall back on when the link itself is undated.
            start: counterpart?.start ?? null,
            end: counterpart?.end ?? null,
            start_meta: counterpart?.start_meta ?? null,
            end_meta: counterpart?.end_meta ?? null,
            // Resolved opposite endpoint, mirroring the server's `link.target`.
            target: counterpart ? {
                thing_id: counterpart.thing_id,
                name: counterpart.name ?? null,
                name_translations: counterpart.name_translations ?? null,
                type: counterpart.type ?? null,
                classes: cls,
                class: cls[0] ?? null,
                public: counterpart.public ?? null,
                description: counterpart.description ?? null,
                start: counterpart.start ?? null,
                end: counterpart.end ?? null,
                start_meta: counterpart.start_meta ?? null,
                end_meta: counterpart.end_meta ?? null,
            } : undefined,
        };
    });
}

/**
 * Rank raw links by "richness" (target has description/data) → recency
 * (link_start desc, fallback target _updatedAt desc) → name, then cap to the
 * breadth limit. Mirrors the server's RelatedObjectsResolver ordering.
 */
async function rankLinksForBreadth(rawLinks, currentThingId, breadth, visibleOwners = null) {
    if (!rawLinks || rawLinks.length === 0) return [];
    const enriched = await enrichLinks(rawLinks, currentThingId);

    const targetIds = enriched.map(l => l.target?.thing_id).filter(Boolean);
    const objs = await getDb().objects.bulkGet(targetIds);
    const objById = {};
    for (const o of objs) {
        if (o) objById[o.thing_id] = o;
    }

    // Do not surface a related link whose endpoint belongs to a locked/unknown
    // identity — the target row is invisible, so the relation must not leak it.
    const visible = enriched.filter((l) => {
        const target = l.target?.thing_id ? objById[l.target.thing_id] : null;
        return isRowVisible(target, visibleOwners);
    });

    visible.sort((a, b) => {
        const ta = objById[a.target?.thing_id];
        const tb = objById[b.target?.thing_id];
        const ra = richnessOf(ta);
        const rb = richnessOf(tb);
        if (ra !== rb) return rb - ra;

        const la = a.link_start ?? null;
        const lb = b.link_start ?? null;
        if (la != null && lb == null) return -1;
        if (lb != null && la == null) return 1;
        if (la != null && lb != null) return Number(lb) - Number(la);

        const ua = ta?._updatedAt ?? 0;
        const ub = tb?._updatedAt ?? 0;
        if (ua !== ub) return ub - ua;

        return String(a.target?.name ?? '').localeCompare(String(b.target?.name ?? ''));
    });

    return visible.slice(0, breadth);
}

function richnessOf(obj) {
    if (!obj) return 0;
    const hasDescription = typeof obj.description === 'string' && obj.description.trim() !== '';
    const hasData = obj.data && typeof obj.data === 'object' && Object.keys(obj.data).length > 0;
    return hasDescription || hasData ? 1 : 0;
}

/**
 * Recursively enrich links with nested `target.links` up to `remainingDepth`.
 * Mirrors the server's BFS:
 *  - the top level accepts every link (no cross-root dedupe),
 *  - self-links are dropped,
 *  - at deeper levels a thing already visited (placed at a lower level) is cut,
 *  - only the top `breadth` links at a node get nested children.
 *
 * @param {Array} rawLinks        links of `currentThingId` from listLinksForThing
 * @param {string} currentThingId
 * @param {number} remainingDepth 1 = direct only, >=2 = nested target.links
 * @param {Set|null} visited      pass null for the top level
 * @param {number} breadth        max links per node at deeper levels
 * @param {number|null} topLevelLimit cap for the top level (Infinity = all,
 *                                   e.g. GET /object/{id}; SEARCH_BREADTH for
 *                                   search results)
 */
async function enrichNested(rawLinks, currentThingId, remainingDepth, visited = null, breadth = BREADTH_CAP, topLevelLimit = null, visibleOwners = null) {
    const isTopLevel = visited === null;
    if (isTopLevel) {
        visited = new Set([currentThingId]);
    }

    const limit = topLevelLimit != null ? topLevelLimit : breadth;
    const ranked = await rankLinksForBreadth(rawLinks, currentThingId, limit, visibleOwners);
    if (remainingDepth <= 1 || ranked.length === 0) return ranked;

    // Children of this whole level, so deeper recursion dedupes against them.
    const childIds = new Set();
    for (const link of ranked) {
        const tid = link.target?.thing_id;
        if (tid && tid !== currentThingId) childIds.add(tid);
    }

    const result = [];
    for (let i = 0; i < ranked.length; i++) {
        const link = ranked[i];
        const tid = link.target?.thing_id;
        if (!tid || tid === currentThingId) {
            continue; // self-link — never returned
        }
        if (!isTopLevel && visited.has(tid)) {
            continue; // already placed at a lower level — cut (server dedupe)
        }
        if (i < breadth) {
            const nextVisited = new Set([...visited, ...childIds]);
            // Class membership is not a relation — exclude it at nested levels
            // too (mirrors the server).
            const childLinks = (await listLinksForThing(tid))
                .filter(l => l.link_type_id !== UUID.LINK_TO_CLASS);
            const nested = await enrichNested(childLinks, tid, remainingDepth - 1, nextVisited, breadth, null, visibleOwners);
            // Recursed links always carry `target.links` (possibly empty) —
            // mirrors the server, so the frontend can distinguish a resolved
            // but empty node from one that was never loaded.
            link.target.links = nested;
        }
        result.push(link);
    }
    return result;
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
            name_translations: obj.name_translations ?? null,
            level,
            description: obj.description || null,
            type: obj.type,
            public: obj.public || 0,
            nodes: children,
            parent_id: parentId,
        };
    }

    // Single root: Everything (mirrors the server's `WHERE c.thing_id = ?`)
    const root = buildNode(UUID.EVERYTHING, 1);
    return root ? [root] : [];
}
