// packages/engine/src/gedcom/gedcomImporter.js
//
// Client-side port of the redesigned server GEDCOM importer
// (app/Services/Importer/GedcomImporter.php on the feature/gedcom branch).
// It reproduces the SAME mapping so the offline app imports GEDCOM into the
// factology data model exactly as the server would:
//   • one GEDCOM source thing per file, class-linked to GEDCOM_CLASS
//   • people/events/families/places/sources as things, wired with real
//     relations (LINK_TO_CLASS / PRESENT / INSIDE / MARRIED_TO / EVIDENCE)
//   • every imported thing pinned to the file via IMPORTED_FROM links carrying
//     data.source_external_id (`<fileKey>/@I1@`, `<fileKey>/@I1@-BIRT-…`, …)
//
// The module is storage-agnostic: it talks to an injected async `store` (see
// createDexieStore()). Local rows are written as plain objects (not JSON
// strings) with sync-metadata columns stamped by the store.

import { parse, parseHeadMetadata, findChild, findChildren, childValue,
         getFullValue, extractPlaceName, extractPlaceCoordinates,
         normalizeGedcomDate } from './gedcomParser.js';
import { FlexibleDate } from '../utils/flexibleDate.js';
import { UUID } from '../constants/uuid.js';

// GEDCOM event tag → factology class (generic EVENT is the fallback).
const EVENT_CLASS_MAP = {
    BIRT: UUID.BIRTH_CLASS,
    DEAT: UUID.DEATH_CLASS,
    RESI: UUID.RESIDENCE_CLASS,
    OCCU: UUID.OCCUPATION_CLASS,
    MARR: UUID.MARRIAGE_CLASS,
    BURI: UUID.BURIAL_CLASS,
    EDUC: UUID.EDUCATION_CLASS,
    CHR: UUID.CHRISTENING_CLASS,
};

const EVENT_TYPE_LABELS = {
    birth: { en: 'Birth', ru: 'Рождение' },
    death: { en: 'Death', ru: 'Смерть' },
    occupation: { en: 'Occupation', ru: 'Работа' },
    residence: { en: 'Residence In', ru: 'Проживание в' },
    burial: { en: 'Burial', ru: 'Похороны' },
    education: { en: 'Education', ru: 'Образование' },
    christening: { en: 'Christening', ru: 'Крещение' },
};

function uuidv4() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

async function sha256Hex(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function trim1(s) {
    return String(s == null ? '' : s).trim();
}
function ucfirst(s) {
    s = String(s || '');
    return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Remove '/' slashes and collapse whitespace (person name clean-up). */
function cleanGedcomName(name) {
    return trim1(String(name || '').replace(/\//g, '').replace(/\s+/g, ' '));
}

/** Title used for dedupe: lowercase, whitespace-collapsed. */
function normKey(text) {
    return trim1(text).toLowerCase().replace(/\s+/g, ' ');
}
function titleKey(title) {
    return normKey(title);
}

function looksLikeUrl(value) {
    const v = trim1(value);
    if (v === '') return false;
    return (/^https?:\/\//i).test(v) || (/^www\.[a-z0-9.-]+/i).test(v);
}

/** PHP filter_var(url, FILTER_VALIDATE_URL) equivalent (absolute http only). */
function isValidAbsoluteUrl(value) {
    const v = trim1(value);
    if (v === '') return false;
    if (!/^https?:\/\/./i.test(v)) return false;
    try { new URL(v); return true; } catch { return false; }
}

/**
 * Build start/end canonical bounds + start meta from a raw GEDCOM date, using
 * the FlexibleDate engine exactly as PHP does:
 *   parsed = FlexibleDate.parse(normalizeGedcomDate(raw)); parsed.toDb('start').
 */
function flexibleBounds(rawDate) {
    const out = { start: null, end: null, startMeta: null };
    if (rawDate == null) return out;
    const parsed = FlexibleDate.parse(normalizeGedcomDate(rawDate));
    if (!parsed) return out;
    const db = parsed.toDb('start');
    out.start = db.start != null ? db.start : null;
    out.end = db.end != null ? db.end : null;
    out.startMeta = db.meta && Object.keys(db.meta).length ? db.meta : null;
    return out;
}

/**
 * Import a GEDCOM document into the local factology model.
 *
 * @param {object} a
 * @param {string} a.content    full GEDCOM file text
 * @param {string} a.ownerId    owning identity thing_id (e.g. UUID.VICTOR_FOKIN)
 * @param {object} a.store      async data source (see createDexieStore)
 * @param {string} [a.fileKey]  optional 16-hex key — the route computes sha256
 *                              of content; tests pass a fixed value.
 * @returns {Promise<{imported:number, updated:number, skipped:number,
 *                    errors:number, details:string[],
 *                    source_thing_id:string|null}>}
 */
export async function importGedcom({ content, ownerId, store, fileKey }) {
    const ctx = {
        ownerId,
        store,
        fileKey: fileKey || (await sha256Hex(content || '')).slice(0, 16),
        imported: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
        details: [],
        sourceThingId: null,
        sourceGuid: null,
        personIdMap: {},             // GEDCOM '@I1@' → factology thing_id
        placeCache: {},              // lowercased place name → factology thing_id
        existingSourceLinks: new Map(), // source_external_id → thing_id
        pendingCitations: [],
        urlOnlySources: {},          // '@S1@' → { urls: [...] }
        // Undated-event ordinals are reset per top-level importGedcom() so a
        // re-import of the same file yields identical external ids and stays
        // idempotent. (The PHP `static` counter would drift upward across runs;
        // we deliberately reset here for correctness.)
        eventCounters: {},
    };
    // Shortcut: prepend the current fileKey to a GEDCOM-local id.
    ctx.ext = (localId) => ctx.fileKey + '/' + localId;

    const headMeta = parseHeadMetadata(content);
    ctx.sourceGuid = headMeta.dbguid;
    const records = parse(content);

    ctx.sourceThingId = await ensureGedcomSource(ctx, headMeta);
    ctx.existingSourceLinks = await store.preloadImportedFrom(ctx.sourceThingId);

    // Persons → families → sources. Sources run last so every citation that was
    // collected while importing people/events is resolvable once the source
    // things exist.
    for (const record of records) if (record.tag === 'INDI') await importPerson(ctx, record);
    for (const record of records) if (record.tag === 'FAM') await importFamily(ctx, record);
    for (const record of records) if (record.tag === 'SOUR') await importSource(ctx, record);

    await wireCitations(ctx);

    return {
        imported: ctx.imported,
        updated: ctx.updated,
        skipped: ctx.skipped,
        errors: ctx.errors,
        details: ctx.details,
        source_thing_id: ctx.sourceThingId,
    };
}

// ── GEDCOM source thing ───────────────────────────────────────

async function ensureGedcomSource(ctx, headMeta) {
    const properties = {};
    if (headMeta.dbguid != null) properties.source_guid = headMeta.dbguid;
    if (headMeta.source_name != null) properties.source_app = headMeta.source_name;
    if (headMeta.export_date != null) properties.export_date = headMeta.export_date;
    properties.file_key = ctx.fileKey;

    const sourceName = headMeta.source_fullname
        ?? headMeta.source_name
        ?? 'GEDCOM Import';

    const row = {
        name: sourceName,
        type: UUID.G_THING,
        owner: ctx.ownerId,
        public: false,
        deleted: false,
        data: { properties },
    };

    // Reuse an existing source thing for THIS file (dedupe by file_key in data
    // properties + owner — mirrors the PHP file_key JSON query).
    let existing = await findSourceThingByFileKey(ctx);
    if (existing) {
        await updateThing(ctx, existing, row);
        return existing;
    }

    const thingId = uuidv4();
    await ctx.store.putThing({ thing_id: thingId, ...row });
    await putLinkGuard(ctx, {
        one_thing_id: thingId, link_type_id: UUID.LINK_TO_CLASS, other_thing_id: UUID.GEDCOM_CLASS,
    });
    return thingId;
}

async function findSourceThingByFileKey(ctx) {
    return firstThingWhere(ctx, (o) =>
        o.owner === ctx.ownerId
        && o.type === UUID.G_THING
        && o.deleted !== true
        && o.data && o.data.properties && o.data.properties.file_key === ctx.fileKey);
}

// ── generic data helpers ──

async function firstThingWhere(ctx, predicate) {
    const hits = await ctx.store.db.objects
        .filter(predicate)
        .limit(1)
        .toArray();
    return hits.length ? hits[0].thing_id : null;
}

/** Merge changes into an existing row, preserving sync metadata. */
async function updateThing(ctx, thingId, changes) {
    const existing = await ctx.store.db.objects.get(thingId);
    if (existing) {
        await ctx.store.db.objects.put({ ...existing, ...changes });
    } else {
        await ctx.store.putThing({ thing_id: thingId, ...changes });
    }
}

/** Refresh an existing link row's data/desc, keeping its id. */
async function updateLink(ctx, linkId, changes) {
    const existing = await ctx.store.db.links.get(linkId);
    if (!existing) return;
    await ctx.store.db.links.put({ ...existing, ...changes });
}

/**
 * Insert a link row unless an equivalent row already exists. This idempotency
 * guard is a deliberate JS-side addition (the PHP importer relied on DB-level
 * unique rows / insert-or-ignore): on re-import we must never mint duplicate
 * PRESENT / LINK_TO_CLASS / IMPORTED_FROM edges.
 */
async function putLinkGuard(ctx, row, undirected = false) {
    const exists = await ctx.store.linkExists(row.one_thing_id, row.link_type_id, row.other_thing_id);
    if (exists) return false;
    if (undirected) {
        const flipped = await ctx.store.pairLinkExists(row.one_thing_id, row.other_thing_id, [row.link_type_id]);
        if (flipped) return false;
    }
    await ctx.store.putLink(row);
    return true;
}

/** Pin a thing to the GEDCOM source via an IMPORTED_FROM link. */
async function ensureImportLink(ctx, thingId, sourceExternalId) {
    if (await ctx.store.linkExists(thingId, UUID.IMPORTED_FROM, ctx.sourceThingId)) {
        if (!ctx.existingSourceLinks.has(sourceExternalId)) {
            ctx.existingSourceLinks.set(sourceExternalId, thingId);
        }
        return;
    }
    await ctx.store.putLink({
        one_thing_id: thingId,
        link_type_id: UUID.IMPORTED_FROM,
        other_thing_id: ctx.sourceThingId,
        data: { source_external_id: sourceExternalId },
    });
    ctx.existingSourceLinks.set(sourceExternalId, thingId);
}

function findExisting(ctx, sourceExternalId) {
    return ctx.existingSourceLinks.get(sourceExternalId) ?? null;
}

// ── Persons ───────────────────────────────────────────────────

async function importPerson(ctx, record) {
    const gedcomId = record.id;
    if (gedcomId == null) {
        ctx.errors++;
        ctx.details.push('INDI record without ID');
        return;
    }

    const sourceExternalId = ctx.ext(gedcomId);

    const nameNode = findChild(record, 'NAME');
    const rawName = nameNode ? trim1(nameNode.value) : 'Unknown';
    const givenName = nameNode ? childValue(nameNode, 'GIVN') : null;
    let surname = nameNode ? childValue(nameNode, 'SURN') : null;
    const marriedName = nameNode ? childValue(nameNode, '_MARNM') : null;

    // Fallback: pull the surname from the /.../ in the NAME value.
    if (surname == null) {
        const m = rawName.match(/\/([^/]+)\//);
        if (m) surname = trim1(m[1]);
    }

    let cleanName = cleanGedcomName(rawName);
    const sex = childValue(record, 'SEX');
    if (givenName != null && surname != null) {
        if (sex === 'F' && marriedName != null && marriedName !== surname) {
            cleanName = trim1(givenName + ' ' + marriedName + ' (' + surname + ')');
        } else {
            cleanName = trim1(givenName + ' ' + surname);
        }
    } else if (givenName != null) {
        cleanName = givenName;
    }

    const existingThingId = findExisting(ctx, sourceExternalId);

    // Person-level citations (SOUR @S#@ directly under the INDI record).
    collectCitations(ctx, record, sourceExternalId);

    const birthNode = findChild(record, 'BIRT');
    const deathNode = findChild(record, 'DEAT');

    let start = null, end = null, startMeta = null, endMeta = null;
    if (birthNode) {
        const dateNode = findChild(birthNode, 'DATE');
        if (dateNode) {
            const b = flexibleBounds(dateNode.value);
            start = b.start; end = b.end; startMeta = b.startMeta;
        }
    }
    if (deathNode) {
        const dateNode = findChild(deathNode, 'DATE');
        if (dateNode) {
            const d = flexibleBounds(dateNode.value);
            // Death narrows the upper bound; its range-start is the death point.
            end = d.start !== null ? d.start : end;
            endMeta = d.startMeta !== null ? d.startMeta : endMeta;
        }
    }

    const properties = {};
    if (sex != null) properties.sex = sex;
    if (givenName != null) properties.given_name = givenName;
    if (surname != null) properties.surname = surname;
    if (sex === 'F' && marriedName != null && marriedName !== surname) {
        properties.married_name = marriedName;
    }
    if (ctx.sourceGuid != null) properties.source_guid = ctx.sourceGuid;

    const data = {
        name: cleanName,
        type: UUID.G_THING,
        start: start == null ? null : start,
        end: end == null ? null : end,
        start_meta: startMeta == null ? null : startMeta,
        end_meta: endMeta == null ? null : endMeta,
        owner: ctx.ownerId,
        public: false,
        deleted: false,
        data: Object.keys(properties).length ? { properties } : null,
    };

    if (existingThingId) {
        await updateThing(ctx, existingThingId, data);
        ctx.personIdMap[gedcomId] = existingThingId;
        ctx.updated++;
        await importPersonEventSet(ctx, record, existingThingId, cleanName);
        return;
    }

    const thingId = uuidv4();
    await ctx.store.putThing({ thing_id: thingId, ...data });
    ctx.personIdMap[gedcomId] = thingId;

    await putLinkGuard(ctx, {
        one_thing_id: thingId, link_type_id: UUID.LINK_TO_CLASS, other_thing_id: UUID.HUMAN,
    });
    await ensureImportLink(ctx, thingId, sourceExternalId);

    await importPersonEventSet(ctx, record, thingId, cleanName);
    ctx.imported++;
}

async function importPersonEventSet(ctx, record, personId, cleanName) {
    const spec = [];
    const b = findChild(record, 'BIRT'); if (b) spec.push([b, 'BIRT', 'birth']);
    const d = findChild(record, 'DEAT'); if (d) spec.push([d, 'DEAT', 'death']);
    const tagTypes = [
        ['OCCU', 'occupation'], ['RESI', 'residence'], ['BURI', 'burial'],
        ['EDUC', 'education'], ['CHR', 'christening'], ['EVEN', 'event'],
    ];
    for (const [tag, type] of tagTypes) {
        for (const n of findChildren(record, tag)) spec.push([n, tag, type]);
    }
    for (const [node, tag, type] of spec) {
        await importPersonEvent(ctx, node, personId, cleanName, tag, type);
    }
}

// ── Person events ─────────────────────────────────────────────

async function importPersonEvent(ctx, eventNode, personId, personName, gedcomTag, eventType) {
    const dateNode = findChild(eventNode, 'DATE');
    const placeNode = findChild(eventNode, 'PLAC');
    const noteNode = findChild(eventNode, 'NOTE');

    const placeName = placeNode ? extractPlaceName(placeNode) || null : null;
    const note = noteNode ? getFullValue(noteNode) : null;

    const eventExternalId = findEventExternalId(ctx, personId, eventNode, gedcomTag);
    const existingThingId = findExisting(ctx, eventExternalId);

    // Event-level citations (SOUR @S#@ under BIRT/DEAT/OCCU/RESI/...).
    collectCitations(ctx, eventNode, eventExternalId);

    const bounds = flexibleBounds(dateNode ? dateNode.value : null);
    const start = bounds.start, end = bounds.end, startMeta = bounds.startMeta;

    const label = EVENT_TYPE_LABELS[eventType] ?? { en: ucfirst(eventType), ru: ucfirst(eventType) };

    let eventName, nameTranslations;
    if (eventType === 'residence' && placeName != null) {
        // "Проживание в <place>" — Residence In is named after the place.
        eventName = `${label.ru} ${placeName}`;
        nameTranslations = { lang: 'ru', en: `${label.en} ${placeName}`, ru: eventName };
    } else {
        eventName = `${ucfirst(eventType)}: ${personName}`;
        nameTranslations = {
            lang: 'en',
            en: `${label.en}: ${personName}`,
            ru: `${label.ru}: ${personName}`,
        };
    }

    let description = note;
    if (placeName != null) {
        description = description
            ? description + '\nPlace: ' + placeName
            : 'Place: ' + placeName;
    }

    const classId = EVENT_CLASS_MAP[gedcomTag] ?? UUID.EVENT;

    const data = {
        name: eventName,
        name_translations: nameTranslations,
        description: description != null ? description : null,
        type: UUID.G_THING,
        start: start == null ? null : start,
        end: end == null ? null : end,
        start_meta: startMeta == null ? null : startMeta,
        end_meta: null,
        owner: ctx.ownerId,
        public: false,
        deleted: false,
        data: { properties: { event_type: eventType } },
    };

    if (existingThingId) {
        await updateThing(ctx, existingThingId, data);
        ctx.updated++;
        return;
    }

    const thingId = uuidv4();
    await ctx.store.putThing({ thing_id: thingId, ...data });
    ctx.imported++;

    await putLinkGuard(ctx, {
        one_thing_id: thingId, link_type_id: UUID.LINK_TO_CLASS, other_thing_id: classId,
    });

    // PRESENT (person → PRESENT → event), carrying the event's bounds.
    const presentLink = {
        one_thing_id: personId, link_type_id: UUID.PRESENT, other_thing_id: thingId,
    };
    if (start != null) { presentLink.link_start = start; presentLink.link_start_meta = startMeta; }
    if (end != null) { presentLink.link_end = end; presentLink.link_end_meta = endMeta; }
    await putLinkGuard(ctx, presentLink);

    await ensureImportLink(ctx, thingId, eventExternalId);

    if (placeName != null) {
        const placeId = await findOrCreatePlace(ctx, placeName, placeNode);
        if (placeId != null && !(await ctx.store.linkExists(thingId, UUID.INSIDE, placeId))) {
            await ctx.store.putLink({
                one_thing_id: thingId, link_type_id: UUID.INSIDE, other_thing_id: placeId,
            });
        }
    }
}

function findEventExternalId(ctx, personId, eventNode, gedcomTag) {
    const dateNode = findChild(eventNode, 'DATE');
    const dateVal = dateNode ? trim1(dateNode.value) : '';
    const gedcomPersonId = Object.keys(ctx.personIdMap)
        .find((k) => ctx.personIdMap[k] === personId) || null;

    if (dateVal !== '') {
        return ctx.ext((gedcomPersonId || 'person') + '-' + gedcomTag + '-' + dateVal);
    }
    const key = (gedcomPersonId || 'person') + '-' + gedcomTag;
    ctx.eventCounters[key] = (ctx.eventCounters[key] || 0) + 1;
    return ctx.ext(key + '-' + ctx.eventCounters[key]);
}

// ── Families / marriage ───────────────────────────────────────

async function importFamily(ctx, record) {
    const gedcomId = record.id;
    if (gedcomId == null) return;

    const husbandId = resolvePersonRef(ctx, childValue(record, 'HUSB'));
    const wifeId = resolvePersonRef(ctx, childValue(record, 'WIFE'));
    const children = findChildren(record, 'CHIL');

    if (husbandId != null && wifeId != null) {
        const newMarriage = await putLinkGuard(ctx, {
            one_thing_id: husbandId, link_type_id: UUID.MARRIED_TO, other_thing_id: wifeId,
        }, true);
        if (newMarriage) ctx.imported++;

        const marrNode = findChild(record, 'MARR');
        if (marrNode) await importMarriageEvent(ctx, marrNode, husbandId, wifeId, gedcomId);
    }

    for (const childNode of children) {
        const childId = resolvePersonRef(ctx, childNode.value);
        if (childId == null) continue;
        if (husbandId != null) await ensureParentLink(ctx, husbandId, childId, UUID.FATHER);
        if (wifeId != null) await ensureParentLink(ctx, wifeId, childId, UUID.MOTHER);
    }
}

async function importMarriageEvent(ctx, marrNode, husbandId, wifeId, familyGedcomId) {
    const dateNode = findChild(marrNode, 'DATE');
    const placeNode = findChild(marrNode, 'PLAC');
    const placeName = placeNode ? extractPlaceName(placeNode) || null : null;

    const eventExternalId = ctx.ext(familyGedcomId + '-marriage');
    const existingThingId = findExisting(ctx, eventExternalId);

    collectCitations(ctx, marrNode, eventExternalId);

    const bounds = flexibleBounds(dateNode ? dateNode.value : null);
    const start = bounds.start, end = bounds.end, startMeta = bounds.startMeta;

    const husbandName = (await ctx.store.thingName(husbandId)) || '';
    const wifeName = (await ctx.store.thingName(wifeId)) || '';
    const nameTranslations = {
        lang: 'ru',
        en: `Marriage: ${husbandName}, ${wifeName}`,
        ru: `Свадьба: ${husbandName}, ${wifeName}`,
    };

    const data = {
        name: nameTranslations.ru,
        name_translations: nameTranslations,
        type: UUID.G_THING,
        start: start == null ? null : start,
        end: end == null ? null : end,
        start_meta: startMeta == null ? null : startMeta,
        end_meta: null,
        owner: ctx.ownerId,
        public: false,
        deleted: false,
        data: { properties: { event_type: 'marriage' } },
    };
    if (placeName != null) data.description = 'Place: ' + placeName;

    if (existingThingId) {
        await updateThing(ctx, existingThingId, data);
        ctx.updated++;
        return;
    }

    const thingId = uuidv4();
    await ctx.store.putThing({ thing_id: thingId, ...data });
    ctx.imported++;

    await putLinkGuard(ctx, {
        one_thing_id: thingId, link_type_id: UUID.LINK_TO_CLASS, other_thing_id: UUID.MARRIAGE_CLASS,
    });

    // PRESENT for BOTH spouses, with link dates.
    for (const spouseId of [husbandId, wifeId]) {
        const presentLink = {
            one_thing_id: spouseId, link_type_id: UUID.PRESENT, other_thing_id: thingId,
        };
        if (start != null) { presentLink.link_start = start; presentLink.link_start_meta = startMeta; }
        if (end != null) { presentLink.link_end = end; presentLink.link_end_meta = endMeta; }
        await putLinkGuard(ctx, presentLink);
    }

    await ensureImportLink(ctx, thingId, eventExternalId);

    if (placeName != null) {
        const placeId = await findOrCreatePlace(ctx, placeName, placeNode);
        if (placeId != null && !(await ctx.store.linkExists(thingId, UUID.INSIDE, placeId))) {
            await ctx.store.putLink({
                one_thing_id: thingId, link_type_id: UUID.INSIDE, other_thing_id: placeId,
            });
        }
    }
}

async function ensureParentLink(ctx, parentId, childId, linkTypeId) {
    if (!(await ctx.store.linkExists(parentId, linkTypeId, childId))) {
        await ctx.store.putLink({
            one_thing_id: parentId, link_type_id: linkTypeId, other_thing_id: childId,
        });
    }
}

function resolvePersonRef(ctx, gedcomRef) {
    if (gedcomRef == null) return null;
    const key = trim1(gedcomRef);
    return ctx.personIdMap[key] || null;
}

// ── GEDCOM SOUR record ────────────────────────────────────────

async function importSource(ctx, record) {
    const gedcomId = record.id;
    if (gedcomId == null) return;

    const noteNode = findChild(record, 'NOTE');
    const note = noteNode ? getFullValue(noteNode) : null;

    let title = childValue(record, 'TITL');
    const author = childValue(record, 'AUTH');
    const publisher = childValue(record, 'PUBL');

    // Collect URLs from WWW sub-records, a URL-as-title, and <a href> in NOTE.
    const urls = [];
    for (const www of findChildren(record, 'WWW')) {
        const u = trim1(www.value);
        if (isValidAbsoluteUrl(u)) urls.push(u);
    }
    if (looksLikeUrl(title)) {
        const u = trim1(title);
        if (isValidAbsoluteUrl(u)) urls.push(u);
        title = null; // the "title" was really the URL
    }
    for (const u of extractHrefs(note ?? '')) urls.push(u);

    const hasBibliographic = (author != null && trim1(author) !== '')
        || (publisher != null && trim1(publisher) !== '');
    const titleMeaningful = title != null
        && trim1(title) !== ''
        && !looksLikeUrl(title);

    // A bare-URL source creates no object; its URL is attached to the citing
    // objects instead (via wireCitations).
    if (!hasBibliographic && !titleMeaningful) {
        if (urls.length) ctx.urlOnlySources[gedcomId] = { urls };
        return;
    }

    const sourceName = trim1(title ?? '') !== '' ? trim1(title) : 'Source';

    let description = '';
    if (author) description += 'Author: ' + author + '\n';
    if (publisher) description += 'Publisher: ' + publisher + '\n';
    const noteText = trim1(note ?? '');
    if (noteText !== '') {
        // Drop a note that is purely the <a href=…>…</a> link placeholder.
        if (!/^<a[^>]*>.*<\/a>$/is.test(noteText)) description += noteText + '\n';
    }
    description = trim1(description) !== '' ? trim1(description) : null;

    const sourceExternalId = ctx.ext(gedcomId);

    // Bibliographic sources dedupe by normalized title (one object per book
    // across SOUR @ids and across import files).
    const sourceKey = titleMeaningful ? titleKey(title) : null;
    let thingId = sourceKey != null
        ? await ctx.store.sourceIdByKey(ctx.ownerId, sourceKey)
        : null;
    if (thingId == null) thingId = findExisting(ctx, sourceExternalId);

    // Preserve any previously stored properties on an existing source (source_key).
    const existingRow = thingId ? await ctx.store.db.objects.get(thingId) : null;
    const properties = {};
    if (existingRow && existingRow.data && existingRow.data.properties) {
        Object.assign(properties, existingRow.data.properties);
    }
    if (sourceKey != null) properties.source_key = sourceKey;

    const data = {
        name: sourceName,
        type: UUID.G_THING,
        description: description != null ? description : null,
        owner: ctx.ownerId,
        public: false,
        deleted: false,
        data: sourceKey != null ? { properties } : null,
    };

    if (thingId != null) {
        await updateThing(ctx, thingId, data);
        ctx.updated++;
        await ensureImportLink(ctx, thingId, sourceExternalId);
        await attachSourceUrls(ctx, thingId, urls);
        return;
    }

    thingId = uuidv4();
    await ctx.store.putThing({ thing_id: thingId, ...data });
    await putLinkGuard(ctx, {
        one_thing_id: thingId, link_type_id: UUID.LINK_TO_CLASS, other_thing_id: UUID.SOURCE_CLASS,
    });
    await ensureImportLink(ctx, thingId, sourceExternalId);
    await attachSourceUrls(ctx, thingId, urls);
    ctx.imported++;
}

async function attachSourceUrls(ctx, thingId, urls) {
    const existingAll = await ctx.store.db.external_links
        .filter((l) => l.thing_id === thingId)
        .toArray();
    const have = new Set(existingAll.map((l) => l.url));
    const rows = [];
    for (const url of Array.from(new Set(urls))) {
        if (have.has(url)) continue;
        rows.push({ thing_id: thingId, url });
    }
    if (rows.length) await ctx.store.bulkPutExternalLinks(rows);
}

function extractHrefs(text) {
    const urls = [];
    const re = /href\s*=\s*["']([^"']+)["']/gi;
    let m;
    while ((m = re.exec(String(text))) != null) {
        const u = trim1(m[1]);
        if (isValidAbsoluteUrl(u)) urls.push(u);
    }
    return urls;
}

// ── Places / addresses ────────────────────────────────────────

async function findOrCreatePlace(ctx, placeNameRaw, placeNode) {
    const trimmedName = trim1(placeNameRaw);
    const key = trimmedName.toLowerCase();
    if (key === '') return null;
    if (ctx.placeCache[key]) return ctx.placeCache[key];

    // Reuse an existing PUBLIC place of the same exact name (any thing, but
    // not a class definition).
    const existingPlaceId = await ctx.store.publicThingIdByName(trimmedName);
    if (existingPlaceId) {
        ctx.placeCache[key] = existingPlaceId;
        return existingPlaceId;
    }

    const sourceExternalId = ctx.ext('place:' + key);
    const existingThingId = findExisting(ctx, sourceExternalId);
    if (existingThingId) {
        ctx.placeCache[key] = existingThingId;
        return existingThingId;
    }

    const isAddress = isStreetAddress(trimmedName);
    const classId = isAddress ? UUID.ADDRESS_CLASS : UUID.PLACE_CLASS;

    const row = {
        name: trimmedName,
        type: UUID.G_THING,
        owner: ctx.ownerId,
        public: false,
        deleted: false,
    };
    if (placeNode != null) {
        const coords = extractPlaceCoordinates(placeNode);
        if (coords != null) {
            row.data = {
                properties: {
                    [UUID.COORDINATES_PROPERTY]: {
                        type: 'Point',
                        coordinates: [coords.lng, coords.lat],
                    },
                },
            };
        }
    }

    const thingId = uuidv4();
    await ctx.store.putThing({ thing_id: thingId, ...row });
    ctx.imported++;

    await putLinkGuard(ctx, {
        one_thing_id: thingId, link_type_id: UUID.LINK_TO_CLASS, other_thing_id: classId,
    });
    await ensureImportLink(ctx, thingId, sourceExternalId);

    ctx.placeCache[key] = thingId;
    return thingId;
}

function isStreetAddress(placeName) {
    const specific = trim1(String(placeName || '').split(',')[0]).toLowerCase();
    const indicators = [
        'пр.', 'проспект', 'проезд', 'ул.', 'улица', 'переулок', 'пер.',
        'бульвар', 'б-р', 'шоссе', 'наб.', 'набережная', 'площадь', 'пл.',
        'д.', 'дом', 'корп.', 'корпус', 'кв.', 'квартира',
    ];
    for (const ind of indicators) if (specific.includes(ind)) return true;
    if (/\d+/.test(specific)) return true;
    return false;
}

// ── Citations ─────────────────────────────────────────────────

function collectCitations(ctx, node, citingExternalId) {
    if (node == null) return;
    for (const sour of findChildren(node, 'SOUR')) {
        const ref = trim1(sour.value);
        if (!/^@.+@$/.test(ref)) continue;

        const pageNode = findChild(sour, 'PAGE');
        let page = pageNode ? trim1(pageNode.value) : null;
        if (page != null && page === '') page = null;

        let text = null;
        const dataNode = findChild(sour, 'DATA');
        if (dataNode != null) {
            const textNode = findChild(dataNode, 'TEXT');
            if (textNode != null) {
                const full = getFullValue(textNode);
                text = trim1(full) !== '' ? trim1(full) : null;
            }
        }

        let url = null;
        if (page != null && isValidAbsoluteUrl(page)) url = page;

        ctx.pendingCitations.push({
            citingExternalId, sourceRef: ref, page, text, url,
        });
    }
}

async function wireCitations(ctx) {
    for (const citation of ctx.pendingCitations) {
        const citingThingId = findExisting(ctx, citation.citingExternalId);
        if (citingThingId == null) continue;

        const sourceThingId = findExisting(ctx, ctx.ext(citation.sourceRef));
        if (sourceThingId != null) {
            await createEvidenceLink(ctx, sourceThingId, citingThingId, citation);
            continue;
        }

        const urlOnly = ctx.urlOnlySources[citation.sourceRef];
        if (urlOnly != null) {
            await attachSourceUrls(ctx, citingThingId, urlOnly.urls);
        }
    }
}

async function createEvidenceLink(ctx, sourceThingId, citingThingId, citation) {
    let description = null;
    if (citation.page && !isValidAbsoluteUrl(citation.page)) description = citation.page;
    else if (citation.url) description = citation.url;

    const props = {};
    for (const key of ['page', 'text', 'url']) if (citation[key]) props[key] = citation[key];

    const fields = {
        description: description != null ? description : null,
        data: Object.keys(props).length ? props : null,
    };

    // EVIDENCE edges are undirected for dedupe purposes; refresh if present.
    const allLinks = await ctx.store.db.links.toArray();
    const edge = allLinks.find((l) =>
        l.link_type_id === UUID.EVIDENCE
        && !l.deleted
        && ((l.one_thing_id === sourceThingId && l.other_thing_id === citingThingId)
            || (l.one_thing_id === citingThingId && l.other_thing_id === sourceThingId)));

    if (edge) {
        await updateLink(ctx, edge.link_id, fields);
        return;
    }
    await ctx.store.putLink({
        one_thing_id: sourceThingId,
        link_type_id: UUID.EVIDENCE,
        other_thing_id: citingThingId,
        ...fields,
    });
}
