// resources/js/localDb/localTools.js
//
// Offline implementations of the Tools-page endpoints, so the standalone
// desktop/mobile app has the same functionality as the web app without a
// server. Each function mirrors the corresponding Laravel controller/service:
//
//   POST /tools/consistency-check     → DatabaseConsistencyChecker::check()
//   POST /tools/consistency-delete    → ToolsController::deleteSelected()
//   GET  /export                      → ExportImportController::export()
//   POST /import                      → ExportImportController::import()
//   POST /import/find-duplicates      → DuplicatePersonMatcher::findDuplicates()
//
// Response *shapes* are identical to the server endpoints so Tools.vue and
// ImportModal need no mode-specific code (see the parity tests in
// tests-vitest/localDb/offlineRoutes.test.js).

import { getDb, SYNC_STATUS } from './index';
import { newLinkId } from './links';
import { isRowVisible } from './visibility';
import { UUID } from '../constants/uuid';
import { postImportProgress } from '../utils/importProgress';

const OBJECT_TYPES = [UUID.G_THING, UUID.G_EXTERNAL, UUID.G_SERVER];
// Types that may act as the "class" of an object: a class proper, or a model
// (a class-tree leaf under a class) — objects may belong to a model that in
// turn belongs to a class. Mirrors CLASS_TARGET_TYPES in the server checker.
const CLASS_TARGET_TYPES = [UUID.G_CLASS, UUID.G_MODEL];
const LINK_TYPE_ROOTS = [UUID.LINK, UUID.SYSTEM];
const NOT_VISIBLE_OWNER = null; // owner column null = legacy row, treated as own

function nameText(name) {
    if (typeof name === 'string') return name;
    if (name && typeof name === 'object') {
        return name.en || name.ru || Object.values(name).find(v => typeof v === 'string') || '';
    }
    return String(name ?? '');
}

function localSyncFields() {
    return {
        _syncStatus: SYNC_STATUS.LOCAL_ONLY,
        _localRevision: 0,
        _serverRevision: 0,
        _serverId: null,
    };
}

// ─────────────────────────────────────────────────────────────────────────
// Database consistency check (mirror DatabaseConsistencyChecker)
// ─────────────────────────────────────────────────────────────────────────

export async function localConsistencyCheck(ownerThingId = null) {
    const db = getDb();
    const [things, links] = await Promise.all([
        db.objects.toArray(),
        db.links.toArray(),
    ]);

    const liveThing = new Map(); // id -> thing (only non-deleted)
    const byType = (type) => [...liveThing.values()].filter(t => t.type === type);
    for (const t of things) {
        if (t.deleted) continue;
        liveThing.set(t.thing_id, t);
    }
    const liveLinks = links.filter(l => !l.deleted);

    const ownedScoped = (t) => {
        if (ownerThingId == null) return true;
        return t.owner === ownerThingId;
    };

    const issues = {};

    // 1. links_to_missing_objects
    issues.links_to_missing_objects = liveLinks
        .filter(l => {
            if (ownerThingId != null && !(liveThing.get(l.one_thing_id)?.owner === ownerThingId)) return false;
            return !liveThing.has(l.one_thing_id)
                || !liveThing.has(l.link_type_id)
                || !liveThing.has(l.other_thing_id);
        })
        .sort((a, b) => (a.link_id < b.link_id ? -1 : 1))
        .map(l => {
            const missing = [];
            if (!liveThing.has(l.one_thing_id)) missing.push('one_thing_id');
            if (!liveThing.has(l.link_type_id)) missing.push('link_type_id');
            if (!liveThing.has(l.other_thing_id)) missing.push('other_thing_id');
            return {
                link_id: l.link_id,
                one_thing_id: l.one_thing_id,
                link_type_id: l.link_type_id,
                other_thing_id: l.other_thing_id,
                missing,
            };
        });

    // 2. self_referencing_links
    issues.self_referencing_links = liveLinks
        .filter(l => l.one_thing_id === l.other_thing_id
            && (ownerThingId == null || liveThing.get(l.one_thing_id)?.owner === ownerThingId))
        .sort((a, b) => (a.link_id < b.link_id ? -1 : 1))
        .map(l => ({
            link_id: l.link_id,
            one_thing_id: l.one_thing_id,
            link_type_id: l.link_type_id,
            other_thing_id: l.other_thing_id,
        }));

    // 3. objects_without_classes
    issues.objects_without_classes = byType(UUID.G_THING).concat(byType(UUID.G_EXTERNAL), byType(UUID.G_SERVER))
        .filter(t => ownedScoped(t))
        .filter(t => !liveLinks.some(l =>
            l.one_thing_id === t.thing_id && l.link_type_id === UUID.LINK_TO_CLASS))
        .sort((a, b) => nameText(a.name).localeCompare(nameText(b.name)))
        .map(t => ({ thing_id: t.thing_id, name: nameText(t.name), type: t.type }));

    // 4. classes_without_parent
    issues.classes_without_parent = byType(UUID.G_CLASS)
        .filter(t => ownedScoped(t))
        .filter(t => !liveLinks.some(l =>
            l.other_thing_id === t.thing_id && l.link_type_id === UUID.LINK_TO_PARENT))
        .sort((a, b) => nameText(a.name).localeCompare(nameText(b.name)))
        .map(t => ({ thing_id: t.thing_id, name: nameText(t.name) }));

    // 5. links_not_below_link_parent
    const parents = new Map(); // child thing_id -> [parent ids]
    for (const l of liveLinks) {
        if (l.link_type_id === UUID.LINK_TO_PARENT) {
            const child = l.other_thing_id;
            if (!parents.has(child)) parents.set(child, []);
            parents.get(child).push(l.one_thing_id);
        }
    }
    const allAncestors = (id) => {
        const seen = new Set([id]);
        const ancestors = [];
        const queue = [...(parents.get(id) || [])];
        while (queue.length) {
            const current = queue.pop();
            if (seen.has(current)) continue;
            seen.add(current);
            ancestors.push(current);
            for (const p of parents.get(current) || []) {
                if (!seen.has(p)) queue.push(p);
            }
        }
        return ancestors;
    };
    issues.links_not_below_link_parent = byType(UUID.G_LINK)
        .filter(t => ownedScoped(t) && t.thing_id !== UUID.LINK)
        .filter(t => {
            const ancestors = allAncestors(t.thing_id);
            return ancestors.every(a => !LINK_TYPE_ROOTS.includes(a));
        })
        .sort((a, b) => nameText(a.name).localeCompare(nameText(b.name)))
        .map(t => {
            const ancestors = allAncestors(t.thing_id);
            return {
                thing_id: t.thing_id,
                name: nameText(t.name),
                problem: ancestors.length === 0 ? 'no parent' : 'not under the Link or System parent',
            };
        });

    // 6. class_links_to_non_classes
    issues.class_links_to_non_classes = liveLinks
        .filter(l => l.link_type_id === UUID.LINK_TO_CLASS
            && (ownerThingId == null || liveThing.get(l.one_thing_id)?.owner === ownerThingId))
        .map(l => {
            const target = liveThing.get(l.other_thing_id);
            if (!target || target.deleted || !CLASS_TARGET_TYPES.includes(target.type)) {
                const wasDeleted = target && target.deleted;
                return {
                    link_id: l.link_id,
                    one_thing_id: l.one_thing_id,
                    other_thing_id: l.other_thing_id,
                    target_name: target ? nameText(target.name) : null,
                    problem: !target ? 'target is not a class'
                        : (wasDeleted ? 'target class is deleted' : 'target is not a class'),
                };
            }
            return null;
        })
        .filter(Boolean)
        .sort((a, b) => (a.link_id < b.link_id ? -1 : 1));

    const summary = {};
    for (const key of Object.keys(issues)) summary[key] = issues[key].length;
    return {
        checked_at: new Date().toISOString(),
        clean: Object.values(summary).every(n => n === 0),
        summary,
        issues,
    };
}

// ─────────────────────────────────────────────────────────────────────────
// Consistency delete (mirror ToolsController::deleteSelected). Offline, a
// device "admin" is whoever unlocked an identity; we only delete rows owned
// by an unlocked identity (or legacy null-owner rows) and cascade their links.
// ─────────────────────────────────────────────────────────────────────────

export async function localConsistencyDelete(ids, allowedOwners = null) {
    const db = getDb();
    const deleted = [];
    const failed = [];

    const allowed = allowedOwners == null
        ? null
        : (allowedOwners instanceof Set ? allowedOwners : new Set(allowedOwners));

    const uniqueIds = [...new Set(ids || [])];
    for (const id of uniqueIds) {
        const obj = await db.objects.get(id);
        if (!obj) continue;

        // Rights mirror the server tool: only rows owned by an unlocked
        // identity (or legacy null-owner rows) may be deleted here. SYSTEM_OWNER
        // rows are the shared seed/system taxonomy and are never deleted.
        if (obj.owner === UUID.SYSTEM_OWNER) continue;
        const ownedHere = allowed == null
            ? obj.owner == null
            : obj.owner == null || allowed.has(obj.owner);
        if (!ownedHere) continue;

        try {
            // Soft-delete the object.
            await db.objects.update(id, { deleted: 1, ...localSyncFields() });
            // Cascade: soft-delete links touching it so the next consistency
            // run doesn't report them as dangling.
            const touching = await db.links
                .where('one_thing_id').equals(id)
                .or('other_thing_id').equals(id)
                .toArray();
            for (const link of touching) {
                await db.links.update(link.link_id, { deleted: 1 });
            }
            deleted.push(id);
        } catch {
            failed.push(id);
        }
    }

    return { deleted: deleted.length, deletedIds: deleted, failed };
}

// ─────────────────────────────────────────────────────────────────────────
// Export (mirror ExportImportController::export). Produces the same JSON
// envelope the web export writes, containing the rows currently visible to
// the unlocked identities (context.visibleOwners = null disables filtering).
// ─────────────────────────────────────────────────────────────────────────

export async function localExportJson({ includeDeleted = false, visibleOwners = null, exportedBy = null } = {}) {
    const db = getDb();
    const things = await db.objects.toArray();
    const links = await db.links.toArray();

    const ownerSet = visibleOwners == null ? null : new Set(visibleOwners);

    const visibleThings = things.filter(t => {
        if (!includeDeleted && t.deleted) return false;
        if (ownerSet == null) return true;
        return isRowVisible(t, ownerSet);
    });

    const visibleIds = new Set(visibleThings.map(t => t.thing_id));
    const visibleLinks = links.filter(l => {
        if (!includeDeleted && l.deleted) return false;
        return visibleIds.has(l.one_thing_id)
            && visibleIds.has(l.link_type_id)
            && visibleIds.has(l.other_thing_id);
    });

    // Drop sync-only internal columns from the payload.
    const clean = (row) => {
        const copy = { ...row };
        delete copy._syncStatus;
        delete copy._localRevision;
        delete copy._serverRevision;
        delete copy._serverId;
        delete copy._updatedAt;
        return copy;
    };

    // Throttled progress emitter (~0.25% steps per phase) → importProgress bus.
    const progress = (() => {
        const step = {};
        return (phase, done, total) => {
            if (!total) return;
            const bucket = Math.floor((done / total) * 400);
            if (done === total || bucket !== step[phase]) {
                step[phase] = bucket;
                postImportProgress({ phase, done, total, percent: Math.round((done / total) * 100) });
            }
        };
    })();

    // Serialize each table chunk by chunk (cleaning + JSON-encoding in bounded
    // slices) so huge exports don't block on one giant JSON.stringify and can
    // report progress. Parts are comma-joined item strings without brackets.
    const serialize = (rows, phase) => {
        const parts = [];
        let done = 0;
        const CHUNK = 3000;
        for (let i = 0; i < rows.length; i += CHUNK) {
            const slice = rows.slice(i, i + CHUNK);
            parts.push(JSON.stringify(slice.map(clean)).slice(1, -1));
            done += slice.length;
            progress(phase, done, rows.length);
        }
        return `[${parts.join(',')}]`;
    };

    const thingsText = serialize(visibleThings, 'things');
    const linksText = serialize(visibleLinks, 'links');

    const head = JSON.stringify({
        version: 1,
        exported_at: new Date().toISOString(),
        server_uuid: null,
        exported_by: exportedBy,
        include_deleted: includeDeleted,
        export_scope: ownerSet == null ? 'all' : 'visible',
        stats: { things: visibleThings.length, links: visibleLinks.length },
    });

    return head.slice(0, -1) + `,"data":{"things":${thingsText},"links":${linksText}}}`;
}

// ─────────────────────────────────────────────────────────────────────────
// JSON import (mirror ExportImportController::import). Restores a whole
// backup (owners preserved), honouring the conflict_mode select, batched for
// speed so large files don't appear to hang.
// ─────────────────────────────────────────────────────────────────────────

const CHUNK = 500;

async function bulkPut(table, rows, onChunk) {
    for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK);
        await table.bulkPut(slice);
        if (onChunk) await onChunk(slice.length);
    }
}

/** Fetch rows matching many keys on an index, in bounded anyOf batches. */
async function bulkAnyOf(table, index, keys) {
    const out = [];
    for (let i = 0; i < keys.length; i += 1000) {
        const slice = keys.slice(i, i + 1000);
        if (slice.length) out.push(...(await table.where(index).anyOf(slice).toArray()));
    }
    return out;
}

/**
 * @param {object} input { things?: [], links?: [] }
 * @param {string} conflictMode latest_wins | keep_existing | overwrite
 * @returns {Promise<{imported:{things,links}, skipped:{things,links}, deleted:{things,links}, errors:string[]}>}
 */
export async function localImportJson(input, conflictMode = 'latest_wins') {
    const db = getDb();
    const result = {
        imported: { things: 0, links: 0 },
        skipped: { things: 0, links: 0 },
        deleted: { things: 0, links: 0 },
        errors: [],
    };

    const hasThings = Array.isArray(input?.things);
    const hasLinks = Array.isArray(input?.links);
    if (!input || typeof input !== 'object' || (!hasThings && !hasLinks)) {
        throw { response: { status: 422, data: { message: 'Invalid import data. Expected JSON with "data" key containing "things" and/or "links".' } } };
    }

    const rawThings = hasThings ? input.things : [];
    const rawLinks = hasLinks ? input.links : [];

    // Throttled progress emitter (~0.25% steps per phase).
    const progress = (() => {
        const step = {};
        return (phase, done, total) => {
            if (!total) return;
            const bucket = Math.floor((done / total) * 400);
            if (done === total || bucket !== step[phase]) {
                step[phase] = bucket;
                postImportProgress({ phase, done, total, percent: Math.round((done / total) * 100) });
            }
        };
    })();

    // ── Things ─────────────────────────────────────────────────────
    const existingById = new Map();
    const wantedIds = rawThings.map(t => t.thing_id).filter(Boolean);
    if (wantedIds.length) {
        // bulkGet returns undefined for missing keys.
        const rows = await db.objects.bulkGet(wantedIds);
        wantedIds.forEach((id, i) => {
            if (rows[i]) existingById.set(id, rows[i]);
        });
    }

    const toWrite = [];
    let thingsDone = 0;
    for (const thing of rawThings) {
        if (!thing?.thing_id) {
            result.errors.push('Thing missing thing_id, skipping');
            thingsDone++;
            progress('things', thingsDone, rawThings.length);
            continue;
        }
        const id = thing.thing_id;
        const existing = existingById.get(id);

        if (!existing) {
            if (thing.deleted) {
                result.skipped.things++;
                thingsDone++;
                progress('things', thingsDone, rawThings.length);
                continue;
            }
            toWrite.push({ ...thing, ...localSyncFields() });
            result.imported.things++;
            thingsDone++;
            progress('things', thingsDone, rawThings.length);
            continue;
        }

        if (conflictMode === 'keep_existing') {
            result.skipped.things++;
            thingsDone++;
            progress('things', thingsDone, rawThings.length);
            continue;
        }
        if (conflictMode === 'latest_wins') {
            const tIm = thing.record_updated;
            const tEx = existing.record_updated;
            if (tIm && tEx && (tEx >= tIm)) {
                result.skipped.things++;
                thingsDone++;
                progress('things', thingsDone, rawThings.length);
                continue;
            }
        }
        if (thing.deleted) {
            existingById.set(id, { ...existing, deleted: 1 });
            toWrite.push({ ...existing, ...thing, deleted: 1, ...localSyncFields() });
            result.deleted.things++;
            thingsDone++;
            progress('things', thingsDone, rawThings.length);
            continue;
        }
        toWrite.push({ ...existing, ...thing, ...localSyncFields() });
        result.imported.things++;
        thingsDone++;
        progress('things', thingsDone, rawThings.length);
    }
    await bulkPut(db.objects, toWrite);
    progress('things', rawThings.length, rawThings.length);

    // ── Links ──────────────────────────────────────────────────────
    // Prefetch every possibly-matching existing link ONCE (by link_uuid and by
    // endpoint triplet) instead of querying the DB twice per row — with
    // hundreds of thousands of links that's the difference between minutes
    // and seconds. Semantics are unchanged from the per-row version below.
    const allIds = new Set(await db.objects.toCollection().keys());
    const uuidMap = new Map();
    const uuidKeys = rawLinks.map(l => (l && l.link_uuid) ? l.link_uuid : null).filter(Boolean);
    for (const row of await bulkAnyOf(db.links, 'link_uuid', uuidKeys)) {
        if (row.link_uuid) uuidMap.set(row.link_uuid, row);
    }
    const tripletMap = new Map();
    const tripletOf = (l) => `${l.one_thing_id}|${l.link_type_id}|${l.other_thing_id}`;
    const tripletKeys = rawLinks
        .filter(l => l && l.one_thing_id && l.other_thing_id && l.link_type_id)
        .map(tripletOf);
    for (const row of await bulkAnyOf(db.links, '[one_thing_id+link_type_id+other_thing_id]', tripletKeys)) {
        tripletMap.set(`${row.one_thing_id}|${row.link_type_id}|${row.other_thing_id}`, row);
    }

    const linkWrites = [];
    let linksDone = 0;
    const progressLink = () => progress('links', ++linksDone, rawLinks.length);
    for (const link of rawLinks) {
        if (!link?.one_thing_id || !link?.other_thing_id || !link?.link_type_id) {
            result.skipped.links++;
            progressLink();
            continue;
        }

        // Existing match: by canonical link_uuid, else by endpoint triplet.
        const matched = (link.link_uuid ? (uuidMap.get(link.link_uuid) || null) : null)
            || tripletMap.get(tripletOf(link)) || null;

        if (matched) {
            if (link.deleted) {
                linkWrites.push({ ...matched, deleted: 1, ...localSyncFields() });
                result.deleted.links++;
                progressLink();
                continue;
            }
            if (conflictMode === 'overwrite') {
                linkWrites.push({ ...matched, ...link, link_id: matched.link_id, ...localSyncFields() });
                result.imported.links++;
            } else {
                result.skipped.links++;
            }
            progressLink();
            continue;
        }

        if (link.deleted) {
            result.skipped.links++;
            progressLink();
            continue;
        }
        if (!allIds.has(link.one_thing_id) || !allIds.has(link.other_thing_id)) {
            result.skipped.links++;
            progressLink();
            continue;
        }

        linkWrites.push({
            ...link,
            link_id: newLinkId(),
            link_uuid: link.link_uuid || null,
            ...localSyncFields(),
        });
        result.imported.links++;
        progressLink();
    }
    await bulkPut(db.links, linkWrites);
    progress('links', rawLinks.length, rawLinks.length);

    return result;
}

// ─────────────────────────────────────────────────────────────────────────
// Duplicate finder (mirror DuplicatePersonMatcher). Runs over the unlocked
// owners' persons imported from GEDCOM files and links duplicates.
// ─────────────────────────────────────────────────────────────────────────

const normalizeName = (name) => String(name ?? '')
    .replace(/\//g, '')
    .replace(/\s+/g, ' ')
    .trim();

async function sourceFileOf(db, thingId) {
    const link = await db.links
        .where('one_thing_id').equals(thingId)
        .and(l => l.link_type_id === UUID.IMPORTED_FROM)
        .first();
    if (!link?.data) return null;
    const linkData = typeof link.data === 'string' ? JSON.parse(link.data) : link.data;
    const externalId = linkData?.source_external_id;
    if (!externalId) return null;
    return String(externalId).split('/')[0] || null;
}

export async function localFindDuplicates(ownerIds = null) {
    const db = getDb();
    const ownerSet = ownerIds == null ? null : new Set(ownerIds);

    const allThings = await db.objects.toArray();
    const allLinks = await db.links.toArray();

    const isPerson = (t) => !t.deleted && allLinks.some(l =>
        l.one_thing_id === t.thing_id
        && l.link_type_id === UUID.LINK_TO_CLASS
        && l.other_thing_id === UUID.HUMAN
        && !l.deleted);

    const hasImportedFrom = (t) => allLinks.some(l =>
        l.one_thing_id === t.thing_id && l.link_type_id === UUID.IMPORTED_FROM && !l.deleted);

    const persons = allThings
        .filter(t => !t.deleted && isPerson(t) && hasImportedFrom(t))
        .filter(t => ownerSet == null || (t.owner && ownerSet.has(t.owner)));

    const fileCache = new Map();
    const records = persons.map((p) => {
        const props = {};
        if (p.data) {
            const parsed = typeof p.data === 'string' ? JSON.parse(p.data) : p.data;
            if (parsed?.properties && typeof parsed.properties === 'object') {
                Object.assign(props, parsed.properties);
            }
        }
        const birthYear = p.start ? parseInt(String(p.start).slice(0, 4), 10) : null;
        return {
            thing_id: p.thing_id,
            owner: p.owner,
            name: normalizeName(nameText(p.name)),
            sex: props.sex ?? null,
            birth_year: Number.isNaN(birthYear) ? null : birthYear,
        };
    });

    const groups = new Map();
    for (const r of records) {
        const key = `${r.name.toLowerCase()}|${r.sex ?? ''}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(r);
    }

    const matches = [];
    let linksCreated = 0;
    let skipped = 0;
    const existingLinks = allLinks.filter(l => l.link_type_id === UUID.DUPLICATE_OF && !l.deleted);
    const alreadyLinked = (aId, bId) => existingLinks.some(l =>
        (l.one_thing_id === aId && l.other_thing_id === bId)
        || (l.one_thing_id === bId && l.other_thing_id === aId));

    for (const group of groups.values()) {
        if (group.length < 2) continue;
        for (let i = 0; i < group.length; i++) {
            for (let j = i + 1; j < group.length; j++) {
                const a = group[i];
                const b = group[j];

                if (a.owner === b.owner
                    && (await sourceFileOf(db, a.thing_id)) === (await sourceFileOf(db, b.thing_id))) {
                    skipped++;
                    continue;
                }

                const byA = a.birth_year;
                const byB = b.birth_year;
                if (byA != null && byB != null && Math.abs(byA - byB) > 2) {
                    skipped++;
                    continue;
                }

                if (alreadyLinked(a.thing_id, b.thing_id)) {
                    skipped++;
                    continue;
                }

                matches.push({
                    thing_id_a: a.thing_id,
                    name_a: a.name,
                    thing_id_b: b.thing_id,
                    name_b: b.name,
                });

                await db.links.put({
                    link_id: newLinkId(),
                    link_uuid: null,
                    one_thing_id: a.thing_id,
                    link_type_id: UUID.DUPLICATE_OF,
                    other_thing_id: b.thing_id,
                    public: false,
                    deleted: 0,
                    ...localSyncFields(),
                });
                linksCreated++;
            }
        }
    }

    return { links_created: linksCreated, skipped, matches };
}
