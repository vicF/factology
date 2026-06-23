// resources/js/dataLayer/index.js
//
// Unified data layer: searches and reads across local DB + multiple servers,
// deduplicates by UUID, and tags results with source metadata.
//
// ── Core principle ──
// An object's presence on a server is tracked by a `stored_on` link:
//   thing ──STORED_ON──► server thing
//
// No stored_on link → local-only object.
// Multiple stored_on links → object lives on multiple servers.
//
// ── Sync status per object ──
// The object's _syncStatus field represents its dirtiest state across all servers.
// Per-server sync state is derived from stored_on links + server revision tracking.

import { getDb } from '../localDb/index';
import { UUID } from '../constants/uuid';
import { networkMonitor } from '../utils/networkMonitor';
import axios from 'axios';

export const STORED_ON = '1dcb897e-0f64-499f-b80d-2cac4a025ed4'; // LINK_TO_STORAGE — reuse existing link type

// ─── Source registry ──────────────────────────────────────────────────────
// Servers are stored in the local DB as things with type=G_EXTERNAL (5).
// The registry caches them for fast lookup.

let _serversCache = null;

export async function getServers() {
    if (_serversCache) return _serversCache;
    const db = getDb();
    const servers = await db.objects
        .where('type')
        .equals(UUID.G_SERVER)
        .toArray();
    _serversCache = servers.map(s => ({
        thing_id: s.thing_id,
        name: s.name,
        url: s.description,  // Server URL stored in description field
    }));
    return _serversCache;
}

export function clearServersCache() {
    _serversCache = null;
}

// ─── Query which servers have a given object ──────────────────────────────

export async function getObjectServers(thingId) {
    const db = getDb();
    const links = await db.links
        .where('[one_thing_id+link_type_id+other_thing_id]')
        .between([thingId, STORED_ON, ''], [thingId, STORED_ON, '\uffff'])
        .toArray();
    return links.map(l => l.other_thing_id);
}

// ─── Search across local + servers ────────────────────────────────────────
//
// Parallel search: queries local DB and all reachable servers simultaneously.
// Merges by UUID — local wins for display fields, server fills in gaps.

/**
 * Search across local DB and optionally servers.
 *
 * @param {string} query - Search text
 * @param {object} [opts]
 * @param {string[]} [opts.sources] - Server thing_ids to search.
 *   Omit or empty = local-only. 'all' = local + all registered servers.
 * @param {number[]} [opts.types] - Filter by thing type
 * @returns {Promise<Array<{thing_id, name, ..._source: string[]}>>}
 */
export async function search(query, opts = {}) {
    const results = new Map(); // thing_id → merged record

    // 1. Query local DB
    const db = getDb();
    let localResults = [];
    if (query?.trim()) {
        const term = query.toLowerCase();
        localResults = await db.objects
            .filter(o =>
                !o.deleted &&
                (o.name?.toLowerCase().includes(term) ||
                 o.description?.toLowerCase().includes(term))
            )
            .toArray();
    } else {
        localResults = await db.objects
            .filter(o => !o.deleted)
            .toArray();
    }

    for (const obj of localResults) {
        results.set(obj.thing_id, {
            ...obj,
            _source: ['local'],
        });
    }

    // 2. Determine which servers to query
    let servers = [];
    if (opts.sources === 'all') {
        servers = await getServers();
    } else if (Array.isArray(opts.sources)) {
        const allServers = await getServers();
        servers = allServers.filter(s => opts.sources.includes(s.thing_id));
    }

    // 3. Query remote servers in parallel
    if (servers.length > 0 && networkMonitor.isOnline.value) {
        const serverPromises = servers.map(async (server) => {
            try {
                const response = await axios.post(`${server.url}/object`, {
                    search: query || undefined,
                    type: opts.types || undefined,
                    limit: 50,
                }, { timeout: 5000 });
                return { server, things: response.data.things || [] };
            } catch {
                return { server, things: [] };
            }
        });

        const serverResponses = await Promise.allSettled(serverPromises);

        for (const settled of serverResponses) {
            if (settled.status !== 'fulfilled') continue;
            const { server, things } = settled.value;
            for (const obj of things) {
                const existing = results.get(obj.id || obj.thing_id);
                if (existing) {
                    // Merge: keep local fields, fill gaps from server
                    existing._source.push(server.name);
                    for (const key of Object.keys(obj)) {
                        if (existing[key] === undefined || existing[key] === null) {
                            existing[key] = obj[key];
                        }
                    }
                } else {
                    results.set(obj.id || obj.thing_id, {
                        ...obj,
                        thing_id: obj.id || obj.thing_id,
                        _source: [server.name],
                    });
                }
            }
        }
    }

    // 4. Convert to array, optional type filter
    let all = Array.from(results.values());
    if (opts.types && opts.types.length > 0) {
        all = all.filter(o => opts.types.includes(o.type));
    }

    return all;
}

// ─── Get single object by UUID ────────────────────────────────────────────
//
// Tries local first (fast). Falls back to servers if not found locally
// and user is online. Caches server results in local DB.

export async function getObject(thingId, opts = {}) {
    const db = getDb();

    // 1. Try local
    const local = await db.objects.get(thingId);
    if (local) {
        const servers = await getObjectServers(thingId);
        return { ...local, _servers: servers };
    }

    // 2. Try servers (if online)
    if (!networkMonitor.isOnline.value || opts.localOnly) return null;

    const servers = await getServers();
    for (const server of servers) {
        try {
            const response = await axios.get(`${server.url}/object/${thingId}`, { timeout: 5000 });
            const obj = response.data?.data || response.data;
            if (obj) {
                // Cache locally
                await db.objects.put({
                    ...obj,
                    thing_id: obj.thing_id || thingId,
                    _syncStatus: 'server_only',
                    _serverRevision: obj._serverRevision || 0,
                    _localRevision: 0,
                    _updatedAt: Date.now(),
                });
                return { ...obj, _servers: [server.thing_id], _source: server.name };
            }
        } catch {
            continue;
        }
    }

    return null;
}

// ─── Save (always local-first) ────────────────────────────────────────────

export async function saveObject(data, opts = {}) {
    const db = getDb();
    const now = Date.now();

    const existing = await db.objects.get(data.thing_id);
    const record = {
        ...data,
        _syncStatus: existing?._syncStatus || 'local_only',
        _localRevision: (existing?._localRevision || 0) + 1,
        _updatedAt: now,
    };

    await db.objects.put(record);

    // Create stored_on links for target servers
    if (opts.syncToServers && opts.syncToServers.length > 0) {
        for (const serverId of opts.syncToServers) {
            // Upsert stored_on link
            const existingLinks = await db.links
                .where('[one_thing_id+link_type_id+other_thing_id]')
                .equals([data.thing_id, STORED_ON, serverId])
                .toArray();

            if (existingLinks.length === 0) {
                const linkId = crypto.randomUUID?.() || `${now}-${Math.random()}`;
                await db.links.put({
                    link_id: linkId,
                    one_thing_id: data.thing_id,
                    link_type_id: STORED_ON,
                    other_thing_id: serverId,
                    public: 0,
                });
            }
        }
    }

    // Enqueue pending changes per server
    const servers = opts.syncToServers?.length
        ? opts.syncToServers
        : await getObjectServers(data.thing_id);

    if (!opts.skipChangeLog) {
        for (const serverId of servers) {
            const change = {
                operation: existing ? 'update' : 'insert',
                table: 'objects',
                recordId: data.thing_id,
                payload: data,
                serverId,
                timestamp: now,
            };
            const existingChange = await db.pendingChanges
                .where({ recordId: data.thing_id, serverId })
                .first();
            if (existingChange) {
                await db.pendingChanges.update(existingChange.id, change);
            } else {
                await db.pendingChanges.add(change);
            }
        }
    }

    return data.thing_id;
}

// ─── Delete (soft delete, syncs to all stored_on servers) ─────────────────

export async function deleteObject(thingId, opts = {}) {
    const db = getDb();

    await db.objects.update(thingId, {
        deleted: 1,
        _syncStatus: 'local',
        _localRevision: Dexie.prototype.db?.objects?.get(thingId)?._localRevision + 1 || 1,
        _updatedAt: Date.now(),
    });

    const servers = opts.syncToServers?.length
        ? opts.syncToServers
        : await getObjectServers(thingId);

    if (!opts.skipChangeLog) {
        for (const serverId of servers) {
            await db.pendingChanges.add({
                operation: 'delete',
                table: 'objects',
                recordId: thingId,
                payload: null,
                serverId,
                timestamp: Date.now(),
            });
        }
    }
}
