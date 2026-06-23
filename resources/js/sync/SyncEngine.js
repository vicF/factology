// resources/js/sync/SyncEngine.js

import {
    getObject,
    updateObject,
    hardDeleteObject,
    createObject,
    updateSyncMetadata,
    getSyncMetadata,
    popPendingChanges,
    getPendingCount,
    enqueueChange,
    SYNC_STATUS,
    CHANGE_OP,
} from '../localDb/index';
import { saveLink, deleteLink, listLinksForThing, replaceLinksForThing, getLink } from '../localDb/links';
import { hasConflict, resolveConflict, RESOLVE_STRATEGY } from './ConflictResolver';
import { eventBus } from '../eventBus';
import { networkMonitor } from '../utils/networkMonitor';
import axios from 'axios';

/**
 * SyncEngine — bridges local DB ↔ server API.
 *
 * Lifecycle per sync cycle:
 *   1. PULL — fetch server changes since last sync
 *   2. MERGE — apply server changes to local DB, detect conflicts
 *   3. PUSH — send pending local changes to server
 *   4. RESOLVE — apply server resolution to conflicts
 *
 * Supports multiple servers (each with independent sync state).
 */

const DEFAULT_STRATEGY = RESOLVE_STRATEGY.FIELD_LEVEL;

export class SyncEngine {
    /**
     * @param {object} [options]
     * @param {string} [options.baseUrl] — API base URL (default: '/api/v1')
     * @param {string} [options.strategy] — default conflict resolution strategy
     * @param {boolean} [options.autoSync] — start periodic sync automatically
     * @param {number} [options.syncIntervalMs] — interval between sync cycles (default 30000)
     */
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || '/api/v1';
        this.defaultStrategy = options.strategy || DEFAULT_STRATEGY;
        this.autoSync = options.autoSync ?? false;
        this.syncIntervalMs = options.syncIntervalMs || 30000;
        this._intervalId = null;
        this._syncing = new Set(); // serverIds currently in a sync cycle
    }

    // ─── Public API ────────────────────────────────────────────────────────

    /**
     * Full sync cycle: pull → merge → push for a given server.
     *
     * @param {string} serverId
     * @param {object} [opts]
     * @param {string} [opts.strategy] — override default conflict strategy
     * @returns {Promise<{ pulled: number, pushed: number, conflicts: number }>}
     */
    async sync(serverId, opts = {}) {
        if (this._syncing.has(serverId)) {
            console.warn('Sync already in progress for server:', serverId);
            return { pulled: 0, pushed: 0, conflicts: 0 };
        }

        this._syncing.add(serverId);
        eventBus.emit('sync:start', { serverId });

        try {
            const pullResult = await this.pull(serverId);
            const pushResult = await this.push(serverId, opts);

            eventBus.emit('sync:complete', {
                serverId,
                pulled: pullResult.applied,
                pushed: pushResult.accepted,
                conflicts: pushResult.conflicts + pullResult.conflicts,
            });

            return {
                pulled: pullResult.applied,
                pushed: pushResult.accepted,
                conflicts: pushResult.conflicts + pullResult.conflicts,
            };
        } catch (error) {
            eventBus.emit('sync:error', { serverId, error });
            throw error;
        } finally {
            this._syncing.delete(serverId);
        }
    }

    /**
     * Pull changes from a server since the last known sync timestamp.
     *
     * @param {string} serverId
     * @returns {Promise<{ applied: number, conflicts: number, serverTimestamp: number }>}
     */
    async pull(serverId) {
        const meta = await getSyncMetadata(serverId);
        const lastPull = meta?.lastPullTimestamp || 0;

        // Request changes since last pull
        const response = await axios.post(`${this.baseUrl}/sync/pull`, {
            server_id: serverId,
            since: lastPull,
        });

        const { changes, server_timestamp: serverTimestamp } = response.data;
        if (!changes) {
            return { applied: 0, conflicts: 0, serverTimestamp };
        }

        let applied = 0;
        let conflicts = 0;

        // Apply object changes
        if (changes.objects && changes.objects.length > 0) {
            for (const serverObj of changes.objects) {
                const result = await this._applyServerObject(serverObj);
                if (result === 'applied') applied++;
                else if (result === 'conflict') conflicts++;
            }
        }

        // Apply link changes
        if (changes.links && changes.links.length > 0) {
            for (const link of changes.links) {
                await this._applyServerLink(link);
                applied++;
            }
        }

        // Update sync metadata
        await updateSyncMetadata(serverId, 'pull', serverTimestamp);

        eventBus.emit('sync:pulled', { serverId, applied, conflicts });
        return { applied, conflicts, serverTimestamp };
    }

    /**
     * Push pending local changes to a server.
     *
     * @param {string} serverId
     * @param {object} [opts]
     * @param {string} [opts.strategy]
     * @returns {Promise<{ accepted: number, conflicts: number, serverTimestamp: number }>}
     */
    async push(serverId, opts = {}) {
        const strategy = opts.strategy || this.defaultStrategy;

        // Get pending changes for this server
        const pending = await popPendingChanges(serverId);
        if (pending.length === 0) {
            return { accepted: 0, conflicts: 0, serverTimestamp: Date.now() };
        }

        // Build push payload: group by table
        const payload = {
            server_id: serverId,
            changes: {
                objects: pending.filter(c => c.table === 'objects').map(c => ({
                    operation: c.operation,
                    record_id: c.recordId,
                    payload: c.payload,
                })),
                links: pending.filter(c => c.table === 'links').map(c => ({
                    operation: c.operation,
                    record_id: c.recordId,
                    payload: c.payload,
                })),
                media: pending.filter(c => c.table === 'media').map(c => ({
                    operation: c.operation,
                    record_id: c.recordId,
                    payload: c.payload,
                })),
            },
        };

        const response = await axios.post(`${this.baseUrl}/sync/push`, payload);
        const { accepted, conflicts: serverConflicts, server_timestamp: serverTimestamp } = response.data;

        // Mark accepted changes as synced
        if (accepted && accepted.length > 0) {
            for (const id of accepted) {
                const change = pending.find(c => c.recordId === id);
                if (!change) continue;
                await this._markSynced(change.recordId, change.table);
            }
        }

        // Handle conflicts from server
        let conflictCount = 0;
        if (serverConflicts && serverConflicts.length > 0) {
            for (const conflict of serverConflicts) {
                await this._handlePushConflict(conflict, strategy);
                conflictCount++;
            }
        }

        await updateSyncMetadata(serverId, 'push', serverTimestamp);

        eventBus.emit('sync:pushed', { serverId, accepted: accepted?.length || 0, conflicts: conflictCount });
        return { accepted: accepted?.length || 0, conflicts: conflictCount, serverTimestamp };
    }

    /**
     * Manually resolve a conflicted record.
     *
     * @param {string} thingId
     * @param {object} resolution
     * @param {string} resolution.strategy — one of RESOLVE_STRATEGY
     * @param {object} [resolution.fieldOverrides] — { fieldName: 'local'|'server' }
     */
    async resolveConflictedObject(thingId, resolution) {
        const record = await getObject(thingId);
        if (!record || record._syncStatus !== SYNC_STATUS.CONFLICT) {
            throw new Error(`Record ${thingId} is not in conflict state`);
        }

        const local = record._localConflictData || record;
        const server = record._serverConflictData;
        if (!server) {
            throw new Error(`No server conflict data for ${thingId}`);
        }

        const result = resolveConflict(local, server, resolution.strategy, {
            fieldOverrides: resolution.fieldOverrides,
        });

        // Apply the resolved version
        const cleanRecord = this._stripSyncMeta(result.resolved);
        cleanRecord._syncStatus = result.resolved._syncStatus;
        cleanRecord._localRevision = result.resolved._localRevision;
        cleanRecord._serverRevision = result.resolved._serverRevision;
        // Explicitly clear conflict data
        cleanRecord._localConflictData = null;
        cleanRecord._serverConflictData = null;
        cleanRecord._conflictFields = null;

        await updateObject(thingId, cleanRecord, { skipChangeLog: true });

        // If resolution changes are not SYNCED, enqueue for next push
        if (cleanRecord._syncStatus !== SYNC_STATUS.SYNCED) {
            await enqueueChange({
                operation: CHANGE_OP.UPDATE,
                table: 'objects',
                recordId: thingId,
                payload: cleanRecord,
                serverId: record._serverId,
            });
        }

        eventBus.emit('sync:resolved', { thingId, strategy: resolution.strategy });
    }

    // ─── Periodic Sync ────────────────────────────────────────────────────

    /**
     * Start periodic background sync when online.
     */
    startAutoSync() {
        if (this._intervalId) return;
        this.autoSync = true;

        this._intervalId = setInterval(() => {
            if (networkMonitor.isServerReachable.value) {
                this._syncAllServers().catch(err =>
                    console.warn('Auto-sync failed:', err)
                );
            }
        }, this.syncIntervalMs);

        // Trigger sync when coming back online
        eventBus.on('network:server-reachable', () => {
            this._syncAllServers().catch(err =>
                console.warn('Reconnect-sync failed:', err)
            );
        });
    }

    /**
     * Stop periodic background sync.
     */
    stopAutoSync() {
        if (this._intervalId) {
            clearInterval(this._intervalId);
            this._intervalId = null;
        }
        this.autoSync = false;
    }

    async _syncAllServers() {
        const db = (await import('../localDb/index')).getDb();
        const allMeta = await db.syncMetadata.toArray();
        const serverIds = allMeta.map(m => m.serverId);

        for (const serverId of serverIds) {
            try {
                await this.sync(serverId);
            } catch (err) {
                console.error(`Sync failed for server ${serverId}:`, err);
            }
        }
    }

    // ─── Internal helpers ─────────────────────────────────────────────────

    /**
     * Apply a server-side object change to local DB.
     *
     * @param {object} serverObj — full server record (thing_id, _serverRevision, ...)
     * @returns {Promise<'applied'|'conflict'|'skipped'>}
     */
    async _applyServerObject(serverObj) {
        const thingId = serverObj.thing_id;
        const local = await getObject(thingId);

        // Server says deleted → hard-delete locally (or soft-delete if has local changes)
        if (serverObj.deleted || serverObj._deleted) {
            if (local && local._syncStatus !== SYNC_STATUS.LOCAL && local._syncStatus !== SYNC_STATUS.LOCAL_ONLY) {
                await hardDeleteObject(thingId);
                return 'applied';
            }
            // Local has un-pushed changes → keep, don't delete
            return 'skipped';
        }

        // New to local → create
        if (!local) {
            const record = {
                ...serverObj,
                _syncStatus: SYNC_STATUS.SERVER_ONLY,
                _localRevision: 0,
                _serverRevision: serverObj._serverRevision || 0,
                _serverId: serverObj._serverId || serverObj.server_id || null,
            };
            const db = (await import('../localDb/index')).getDb();
            await db.objects.put(record);
            return 'applied';
        }

        // Both changed → conflict
        if (hasConflict(local, serverObj, local._serverRevision)) {
            await this._markConflict(local, serverObj);
            return 'conflict';
        }

        // Server is newer, local unchanged → accept server version
        if (local._syncStatus === SYNC_STATUS.SERVER_ONLY || local._syncStatus === SYNC_STATUS.SYNCED) {
            const updated = {
                ...serverObj,
                _syncStatus: SYNC_STATUS.SERVER_ONLY,
                _localRevision: 0,
                _serverRevision: serverObj._serverRevision || 0,
                _serverId: serverObj._serverId || serverObj.server_id || local._serverId || null,
            };
            await updateObject(thingId, updated, { skipChangeLog: true });
            return 'applied';
        }

        // Local has changes waiting to be pushed → don't overwrite
        return 'skipped';
    }

    /**
     * Apply a server-side link change to local DB.
     *
     * @param {object} link — server link record
     * @returns {Promise<void>}
     */
    async _applyServerLink(link) {
        const existing = await getLink(link.link_id);

        if (link._deleted) {
            if (!existing || existing._syncStatus === SYNC_STATUS.SERVER_ONLY || existing._syncStatus === SYNC_STATUS.SYNCED) {
                await deleteLink(link.link_id, { skipChangeLog: true });
            }
            return;
        }

        const record = {
            ...link,
            _syncStatus: existing && existing._syncStatus !== SYNC_STATUS.SERVER_ONLY
                ? existing._syncStatus
                : SYNC_STATUS.SERVER_ONLY,
            _localRevision: 0,
            _serverRevision: link._serverRevision || 0,
            _serverId: link._serverId || link.server_id || null,
        };
        await saveLink(record, { skipChangeLog: true });
    }

    /**
     * Mark a record as conflicted in local DB.
     *
     * @param {object} local
     * @param {object} server
     */
    async _markConflict(local, server) {
        const thingId = local.thing_id;

        const result = resolveConflict(local, server, RESOLVE_STRATEGY.FIELD_LEVEL);

        await updateObject(thingId, {
            ...result.resolved,
            _localConflictData: local,
            _serverConflictData: server,
        }, { skipChangeLog: true });

        eventBus.emit('sync:conflict-detected', {
            thingId,
            name: local.name || server.name,
            conflictingFields: result.conflictingFields,
        });
    }

    /**
     * Handle a conflict returned by the server during push.
     *
     * @param {object} conflict — { record_id, server_version, reason }
     * @param {string} strategy
     */
    async _handlePushConflict(conflict, strategy) {
        const thingId = conflict.record_id;
        const local = await getObject(thingId);
        if (!local) return;

        const server = conflict.server_version;

        const result = resolveConflict(local, server, strategy);

        if (result.resolved._syncStatus === SYNC_STATUS.CONFLICT) {
            // Could not auto-resolve — flag for user
            await updateObject(thingId, {
                ...result.resolved,
                _localConflictData: local,
                _serverConflictData: server,
            }, { skipChangeLog: true });

            eventBus.emit('sync:push-conflict', { thingId, strategy });
        } else {
            // Auto-resolved — update and re-enqueue for next push
            const cleanRecord = this._stripSyncMeta(result.resolved);
            cleanRecord._syncStatus = result.resolved._syncStatus;
            cleanRecord._localRevision = result.resolved._localRevision;
            cleanRecord._serverRevision = result.resolved._serverRevision;

            await updateObject(thingId, cleanRecord, { skipChangeLog: true });

            if (cleanRecord._syncStatus === SYNC_STATUS.LOCAL) {
                await enqueueChange({
                    operation: CHANGE_OP.UPDATE,
                    table: 'objects',
                    recordId: thingId,
                    payload: cleanRecord,
                    serverId: local._serverId,
                });
            }
        }
    }

    /**
     * Mark a change as synced after server accepts it.
     *
     * @param {string} recordId
     * @param {string} table
     */
    async _markSynced(recordId, table) {
        if (table === 'objects') {
            const existing = await getObject(recordId);
            if (!existing) return;

            await updateObject(recordId, {
                _syncStatus: SYNC_STATUS.SYNCED,
                _localRevision: 0,
                _serverRevision: existing._serverRevision
                    ? existing._serverRevision + 1
                    : 1,
            }, { skipChangeLog: true });
        }
        // Links: if fully synced (no local changes), mark SERVER_ONLY/SYNCED
        if (table === 'links') {
            const existing = await getLink(recordId);
            if (!existing) return;

            await saveLink({
                ...existing,
                _syncStatus: SYNC_STATUS.SYNCED,
                _localRevision: 0,
                _serverRevision: (existing._serverRevision || 0) + 1,
            }, { skipChangeLog: true });
        }
    }

    /**
     * Strip internal sync fields from a record so they don't leak
     * into the actual data fields.
     *
     * @param {object} record
     * @returns {object}
     */
    _stripSyncMeta(record) {
        const {
            _syncStatus, _localRevision, _serverRevision, _serverId,
            _createdAt, _updatedAt, _localConflictData, _serverConflictData,
            _conflictFields, ...clean
        } = record;
        return clean;
    }
}

/**
 * Singleton instance for app-wide use.
 */
export const syncEngine = new SyncEngine({ autoSync: false });
