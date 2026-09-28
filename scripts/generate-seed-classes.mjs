// scripts/generate-seed-classes.mjs
//
// Regenerates packages/engine/src/localDb/seedClasses.js from
// resources/js/localDb/system-objects.json (the canonical source of truth
// shared by all Factology platforms — web, standalone, desktop).
//
// Run: node scripts/generate-seed-classes.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

// ── Bootstrap UUIDs already handled in BOOTSTRAP_THINGS ──────────────
const BOOTSTRAP_UUIDS = new Set([
    '939cd822-9e23-450c-8c5e-c23f67cca792', // EVERYTHING
    '4b27fd0c-d8be-425c-a529-2186b2589e76', // LINK
    '361c19af-c011-4051-9329-49c75d1ca0fb', // LINK_TO_PARENT
    'c217c185-742f-4a9f-8e69-acea2b4f5aea', // LINK_TO_CLASS
    '3e15244c-a9e1-4a91-a0ca-1c65722a64df', // SOMETHING
    '664e746e-8f37-4f80-ba78-734424eab2a6', // USER
    'c0b920d7-8b14-43a4-a28a-16115d0bee9e', // SYSTEM
    'ea206516-9e45-482f-89be-05313f52e5e3', // GROUP_READ_ACCESS
    'e18d73eb-a5d3-47be-a785-106f6f185651', // BELONGS_TO_USER_GROUP
    '8811c270-4285-4534-bb2a-c4da1ba850e4', // PRESENT
    '922cca80-a0ba-4a5e-8344-769f083f0e72', // INSIDE
    '4eff773a-6bbd-410f-a668-681b41d69051', // EVIDENCE
    '29cafd84-0fc9-4295-afcc-d73b9613e39f', // FATHER
    'b7c887b7-cee4-452d-b491-bd552de79d70', // MOTHER
]);

// ── Manual override classes NOT in system-objects.json ────────────────
// These are seeded alongside the auto-generated classes from system-objects.json.
// When they are eventually added to system-objects.json, the manual entries
// become redundant (will be filtered by classIds check) and can be removed.
const MANUAL_CLASSES = [
    // GEDCOM event classes
    { thing_id: 'a565fc22-6dae-4b7a-bd9e-30df8bc8acca', name: 'Birth',          description: 'Birth of a person',                                                   type: 2, public: true },
    { thing_id: '6ea018a1-d71c-4655-89b9-9f469b979847', name: 'Death',          description: 'Death of a person',                                                   type: 2, public: true },
    { thing_id: '7fae11dc-3411-4652-9712-18729bf1e3a7', name: 'Occupation',     description: 'Occupation / work',                                                   type: 2, public: true },
    { thing_id: 'f5fe8e87-da33-4a40-ad7f-1b62b4e62299', name: 'Marriage',       description: 'Marriage',                                                            type: 2, public: true },
    { thing_id: '02a3040c-c9fd-48b7-9f1c-57ef66002aa6', name: 'Burial',         description: 'Burial',                                                              type: 2, public: true },
    { thing_id: '5092247b-8fff-475f-b90c-22b29bf59532', name: 'Education',      description: 'Education',                                                           type: 2, public: true },
    { thing_id: '2e3e8252-47c6-44e0-8804-6083ec506a92', name: 'Christening',    description: 'Christening / baptism',                                               type: 2, public: true },
    // Other manual overrides (not yet in the system-objects.json export)
    { thing_id: '42a2e356-8ad1-406a-b78e-db13febf0415', name: 'Address',        description: 'Postal / street address',                                             type: 2, public: true },
    { thing_id: '10b04205-aecb-406d-befc-c6362f7ac9fb', name: 'GEDCOM',         description: 'A GEDCOM genealogy file or other external data source',               type: 2, public: true },
    { thing_id: '9c79e684-ec31-45e1-a51a-7bbedd0aa041', name: 'Proof, evidence', description: 'Ссылка на подтверждение, доказательство',                           type: 2, public: true },
    { thing_id: 'a70ae070-0c52-4a89-84a0-5c76f76e5aa7', name: 'Residence',     description: 'Проживание, нахождение в каком то месте в течение длительного периода.', type: 2, public: true },
];

// ── Manual hierarchy links for classes NOT in system-objects.json ─────
const MANUAL_LINKS = [
    // GEDCOM event classes → subclass of Event
    { one: '0eed3b56-bdd6-47f0-9413-d9640a9dcafc', other: 'a565fc22-6dae-4b7a-bd9e-30df8bc8acca', description: 'Birth is subclass of Event' },
    { one: '0eed3b56-bdd6-47f0-9413-d9640a9dcafc', other: '6ea018a1-d71c-4655-89b9-9f469b979847', description: 'Death is subclass of Event' },
    { one: '0eed3b56-bdd6-47f0-9413-d9640a9dcafc', other: '7fae11dc-3411-4652-9712-18729bf1e3a7', description: 'Occupation is subclass of Event' },
    { one: '0eed3b56-bdd6-47f0-9413-d9640a9dcafc', other: 'f5fe8e87-da33-4a40-ad7f-1b62b4e62299', description: 'Marriage is subclass of Event' },
    { one: '0eed3b56-bdd6-47f0-9413-d9640a9dcafc', other: '02a3040c-c9fd-48b7-9f1c-57ef66002aa6', description: 'Burial is subclass of Event' },
    { one: '0eed3b56-bdd6-47f0-9413-d9640a9dcafc', other: '5092247b-8fff-475f-b90c-22b29bf59532', description: 'Education is subclass of Event' },
    { one: '0eed3b56-bdd6-47f0-9413-d9640a9dcafc', other: '2e3e8252-47c6-44e0-8804-6083ec506a92', description: 'Christening is subclass of Event' },
    // Address → subclass of Place
    { one: 'dc006cda-047a-4862-acf7-e215355b6890', other: '42a2e356-8ad1-406a-b78e-db13febf0415', description: 'Address is subclass of Place' },
    // GEDCOM → subclass of System
    { one: 'c0b920d7-8b14-43a4-a28a-16115d0bee9e', other: '10b04205-aecb-406d-befc-c6362f7ac9fb', description: 'GEDCOM is subclass of System' },
    // Residence → subclass of Event
    { one: '0eed3b56-bdd6-47f0-9413-d9640a9dcafc', other: 'a70ae070-0c52-4a89-84a0-5c76f76e5aa7', description: 'Residence is subclass of Event' },
];

// ── Read source ──────────────────────────────────────────────────────
const srcPath = path.resolve(REPO_ROOT, 'resources/js/localDb/system-objects.json');
const systemObjects = JSON.parse(fs.readFileSync(srcPath, 'utf-8'));

// ── Build CLASSES from system-objects.json ────────────────────────────
const classes = [];
const classIds = new Set();

for (const thing of systemObjects.data.things) {
    // Only include CLASS (2), LINK (4), and MODEL (7) types
    if (thing.type !== 2 && thing.type !== 4 && thing.type !== 7) continue;
    // Skip bootstrap UUIDs (already in BOOTSTRAP_THINGS)
    if (BOOTSTRAP_UUIDS.has(thing.thing_id)) continue;
    classes.push({
        thing_id: thing.thing_id,
        name: thing.name,
        description: thing.description || '',
        type: thing.type,
        public: thing.public != null ? Boolean(thing.public) : true,
    });
    classIds.add(thing.thing_id);
}

// Add manual overrides (skipped if the uuid already came from system-objects.json)
for (const mc of MANUAL_CLASSES) {
    if (!classIds.has(mc.thing_id)) {
        classes.push(mc);
        classIds.add(mc.thing_id);
    }
}

// Sort by name for readability
classes.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

// ── Build CLASS_LINKS from system-objects.json ────────────────────────
const links = [];
const linkSeen = new Set();

for (const link of systemObjects.data.links) {
    // Only "is a superclass of" (LINK_TO_PARENT) hierarchy edges
    if (link.link_type_id !== '361c19af-c011-4051-9329-49c75d1ca0fb') continue;
    // Both endpoints must be in our class set (non-bootstrap classes)
    if (!classIds.has(link.one_thing_id) || !classIds.has(link.other_thing_id)) continue;
    const key = `${link.one_thing_id}|${link.other_thing_id}`;
    if (linkSeen.has(key)) continue;
    linkSeen.add(key);
    links.push({
        one: link.one_thing_id,
        other: link.other_thing_id,
        description: link.description || '',
    });
}

// Add manual links (for manual override classes, skipped if already in source)
for (const ml of MANUAL_LINKS) {
    const key = `${ml.one}|${ml.other}`;
    if (!linkSeen.has(key)) {
        links.push(ml);
        linkSeen.add(key);
    }
}

// Sort by parent id then child id for consistency
links.sort((a, b) => a.one.localeCompare(b.one) || a.other.localeCompare(b.other));

// ── Write seedClasses.js ──────────────────────────────────────────────
const LINK_TO_PARENT = '361c19af-c011-4051-9329-49c75d1ca0fb';

const outPath = path.resolve(REPO_ROOT, 'packages/engine/src/localDb/seedClasses.js');
const stream = fs.createWriteStream(outPath);

stream.write(`// packages/engine/src/localDb/seedClasses.js
//
// Auto-generated from resources/js/localDb/system-objects.json (the canonical
// source of truth shared by all Factology platforms — web, standalone, desktop).
// Manual overrides for types not yet in system-objects.json are appended below.
//
// Regenerated ${new Date().toISOString().slice(0, 10)}.
// Re-run after adding new classes to system-objects.json:
//   node scripts/generate-seed-classes.mjs
//
// NOTE: system-objects.json is the single source — seedData.js should eventually
// consume it directly for ALL seed objects. See seedClasses.js for the migration.

export const CLASSES = [
`);
for (const c of classes) {
    const pub = c.public === true || c.public === 1 ? 'true' : 'false';
    stream.write(`    { thing_id: '${c.thing_id}', name: '${c.name.replace(/'/g, "\\'")}', description: '${(c.description || '').replace(/'/g, "\\'")}', type: ${c.type}, public: ${pub} },\n`);
}

stream.write(`];

export const CLASS_LINKS = [
`);
for (const l of links) {
    stream.write(`    { one: '${l.one}', other: '${l.other}', description: '${(l.description || '').replace(/'/g, "\\'")}' },\n`);
}
stream.write(`];
`);

stream.end();
console.log(`Generated ${classes.length} classes and ${links.length} hierarchy links → ${outPath}`);