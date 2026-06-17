// tests-vitest/localDb/conflictResolver.test.js

import { describe, it, expect } from 'vitest';
import {
    hasConflict,
    detectFieldConflicts,
    resolveConflict,
    RESOLVE_STRATEGY,
} from '@/sync/ConflictResolver';
import { SYNC_STATUS } from '@/localDb/index';

describe('ConflictResolver — Detection', () => {
    it('detects conflict when both sides changed', () => {
        const local = { _localRevision: 3 };
        const server = { _serverRevision: 5 };
        expect(hasConflict(local, server, 2)).toBe(true);
    });

    it('no conflict when only local changed', () => {
        const local = { _localRevision: 3 };
        const server = { _serverRevision: 2 };
        expect(hasConflict(local, server, 2)).toBe(false);
    });

    it('no conflict when only server changed (local unchanged)', () => {
        const local = { _localRevision: 0 };
        const server = { _serverRevision: 5 };
        // localChanged = 0 > 0 = false → no conflict
        expect(hasConflict(local, server, 2)).toBe(false);
    });

    it('not a conflict if localRev is 0', () => {
        const local = { _localRevision: 0 };
        const server = { _serverRevision: 5 };
        // localChanged = 0 > 0 → false. No conflict.
        expect(hasConflict(local, server, 2)).toBe(false);
    });
});

describe('ConflictResolver — Field-Level Detection', () => {
    it('detects no conflicts when only local changed fields', () => {
        const local = { name: 'New Name', description: 'Old Desc' };
        const server = { name: 'Old Name', description: 'Old Desc' };
        const ancestor = { name: 'Old Name', description: 'Old Desc' };

        const { conflicts } = detectFieldConflicts(local, server, ancestor);
        expect(conflicts).toHaveLength(0); // only local changed 'name'
    });

    it('detects conflicting field when both changed the same field', () => {
        const local = { name: 'Local Name', description: 'Same' };
        const server = { name: 'Server Name', description: 'Same' };
        const ancestor = { name: 'Old Name', description: 'Same' };

        const { conflicts } = detectFieldConflicts(local, server, ancestor);
        expect(conflicts).toContain('name');
        expect(conflicts).toHaveLength(1);
    });

    it('auto-merges non-conflicting fields', () => {
        // name: only local changed, desc: only server changed, start: neither changed
        const local = { name: 'Local Name', description: 'Old Desc', start: '20250101' };
        const server = { name: 'Old Name', description: 'Server Desc', start: '20250101' };
        const ancestor = { name: 'Old Name', description: 'Old Desc', start: '20250101' };

        const { conflicts, merged } = detectFieldConflicts(local, server, ancestor);

        expect(conflicts).toHaveLength(0);
        expect(merged.name).toBe('Local Name');        // only local changed
        expect(merged.description).toBe('Server Desc'); // only server changed
        expect(merged.start).toBe('20250101');         // neither changed
    });

    it('handles JSON data field in field-level detection', () => {
        const local = { data: { tags: ['a', 'b'] }, name: 'Same' };
        const server = { data: { tags: ['c'] }, name: 'Same' };
        const ancestor = { data: { tags: ['a'] }, name: 'Same' };

        const { conflicts, merged } = detectFieldConflicts(local, server, ancestor);

        // Both changed 'data' → conflict
        expect(conflicts).toContain('data');
        expect(merged.data).toEqual({ tags: ['a', 'b'] }); // local value as default
    });

    it('without ancestor, all differing fields conflict', () => {
        const local = { name: 'Local', description: 'Local Desc' };
        const server = { name: 'Server', description: 'Server Desc' };

        const { conflicts } = detectFieldConflicts(local, server);

        expect(conflicts).toContain('name');
        expect(conflicts).toContain('description');
    });
});

describe('ConflictResolver — Resolution Strategies', () => {
    const local = {
        thing_id: 'test-1',
        name: 'Local Name',
        description: 'Local Desc',
        _localRevision: 5,
        _serverRevision: 2,
    };
    const server = {
        thing_id: 'test-1',
        name: 'Server Name',
        description: 'Server Desc',
        _serverRevision: 5,
    };

    it('LOCAL_WINS: takes local version', () => {
        const { resolved, strategy } = resolveConflict(local, server, RESOLVE_STRATEGY.LOCAL_WINS);
        expect(resolved.name).toBe('Local Name');
        expect(resolved.description).toBe('Local Desc');
        expect(resolved._syncStatus).toBe(SYNC_STATUS.LOCAL);
        expect(resolved._localRevision).toBe(6);
    });

    it('SERVER_WINS: takes server version', () => {
        const { resolved, strategy } = resolveConflict(local, server, RESOLVE_STRATEGY.SERVER_WINS);
        expect(resolved.name).toBe('Server Name');
        expect(resolved.description).toBe('Server Desc');
        expect(resolved._syncStatus).toBe(SYNC_STATUS.SERVER_ONLY);
        expect(resolved._localRevision).toBe(0);
    });

    it('LWW: local wins when localRevision >= serverRevision', () => {
        const { resolved } = resolveConflict(local, server, RESOLVE_STRATEGY.LWW);
        // local._localRevision = 5, server._serverRevision = 5 → local >= server → local wins
        expect(resolved.name).toBe('Local Name');
    });

    it('LWW: server wins when serverRevision > localRevision', () => {
        const lowLocal = { ...local, _localRevision: 2 };
        const highServer = { ...server, _serverRevision: 10 };
        const { resolved } = resolveConflict(lowLocal, highServer, RESOLVE_STRATEGY.LWW);
        expect(resolved.name).toBe('Server Name');
    });

    it('FIELD_LEVEL: auto-merge when no conflicts', () => {
        const loc = { name: 'Local Only', description: 'Same', _localRevision: 1 };
        const srv = { name: 'Old Name', description: 'Same', _serverRevision: 1 };
        const ancestor = { name: 'Old Name', description: 'Same' };

        const { resolved, conflictingFields } = resolveConflict(
            loc, srv, RESOLVE_STRATEGY.FIELD_LEVEL, { ancestor }
        );

        expect(conflictingFields).toHaveLength(0);
        expect(resolved.name).toBe('Local Only'); // local changed, server didn't
        expect(resolved._syncStatus).toBe(SYNC_STATUS.SYNCED);
    });

    it('FIELD_LEVEL: marks as CONFLICT when fields clash', () => {
        const loc = { name: 'Local', _localRevision: 1 };
        const srv = { name: 'Server', _serverRevision: 1 };
        const ancestor = { name: 'Old' };

        const { resolved, conflictingFields } = resolveConflict(
            loc, srv, RESOLVE_STRATEGY.FIELD_LEVEL, { ancestor }
        );

        expect(conflictingFields).toContain('name');
        expect(resolved._syncStatus).toBe(SYNC_STATUS.CONFLICT);
        expect(resolved._localConflictData).toBeDefined();
        expect(resolved._serverConflictData).toBeDefined();
    });

    it('FIELD_LEVEL with fieldOverrides: applies manual selection', () => {
        const loc = { name: 'Local Name', description: 'Local Desc', _localRevision: 1 };
        const srv = { name: 'Server Name', description: 'Server Desc', _serverRevision: 1 };
        const ancestor = { name: 'Old', description: 'Old' };

        const { resolved } = resolveConflict(
            loc, srv, RESOLVE_STRATEGY.FIELD_LEVEL,
            {
                ancestor,
                fieldOverrides: { name: 'local', description: 'server' },
            }
        );

        expect(resolved.name).toBe('Local Name');
        expect(resolved.description).toBe('Server Desc');
        expect(resolved._syncStatus).toBe(SYNC_STATUS.LOCAL);
    });

    it('MANUAL: flags for user review', () => {
        const { resolved } = resolveConflict(local, server, RESOLVE_STRATEGY.MANUAL);
        expect(resolved._syncStatus).toBe(SYNC_STATUS.CONFLICT);
        expect(resolved._localConflictData).toEqual(local);
        expect(resolved._serverConflictData).toEqual(server);
    });

    it('unchanged records (localRev=0) are server wins by default', () => {
        const untouched = { ...local, _localRevision: 0 };
        const { resolved } = resolveConflict(untouched, server, RESOLVE_STRATEGY.LWW);
        expect(resolved._syncStatus).toBe(SYNC_STATUS.SERVER_ONLY);
        expect(resolved.name).toBe('Server Name');
    });
});
