// packages/engine/src/localDb/seedData.js
//
// Seed data for the local (standalone/offline) mode.
// Source of truth: database/seeders/DatabaseSeeder.php
//
// ⚠️ Keep in sync with DatabaseSeeder.php — the arrays below mirror the
// PHP bootstrap things/links, the class list and the class hierarchy links
// exactly (same thing_ids, names, and parent→child edges). The drift test
// (tests-vitest/localDb/schemaDrift.test.js) guards schema columns;
// seederParity.test.js guards that every entry here is actually inserted.

import { UUID } from '../constants/uuid.js';

// ── Bootstrap things (infrastructure records referenced by code) ──────
export const BOOTSTRAP_THINGS = [
    {
        thing_id: UUID.EVERYTHING,
        name: 'Everything',
        description: 'base object for everything',
        type: UUID.G_CLASS,
        public: 1,
    },
    {
        thing_id: UUID.LINK,
        name: 'Link',
        description: 'base object for links',
        type: UUID.G_LINK,
        public: 1,
    },
    {
        thing_id: UUID.LINK_TO_PARENT,
        name: 'is a superclass of',
        description: 'The object is a more general class/category that the linked object subclasses',
        type: UUID.G_LINK,
        public: 1,
    },
    {
        thing_id: UUID.LINK_TO_CLASS,
        name: 'is of class',
        description: 'Link to a class of an object',
        type: UUID.G_LINK,
        public: 1,
    },
    {
        thing_id: UUID.SOMETHING,
        name: 'Something',
        description: 'base class for all other classes',
        type: UUID.G_CLASS,
        public: 1,
    },
    {
        thing_id: UUID.USER,
        name: 'User',
        description: 'base class for user objects',
        type: UUID.G_CLASS,
        public: 1,
    },
    {
        thing_id: UUID.SYSTEM,
        name: 'System',
        description: 'system class',
        type: UUID.G_CLASS,
        public: 1,
    },
    {
        thing_id: UUID.VICTOR_FOKIN,
        name: 'Victor Fokin',
        description: 'System creator',
        type: UUID.GENERAL,
        public: 0,
        // Victor Fokin is an ordinary identity — the row represents that
        // person and is owned by him, NOT by the system (SYSTEM_OWNER).
        owner: UUID.VICTOR_FOKIN,
    },
    {
        thing_id: UUID.GROUP_READ_ACCESS,
        name: 'Group read access',
        description: 'Link type for group-based read access control',
        type: UUID.G_LINK,
        public: 1,
    },
    {
        thing_id: UUID.BELONGS_TO_USER_GROUP,
        name: 'Belongs to user group',
        description: 'Link type for user-to-group membership',
        type: UUID.G_LINK,
        public: 1,
    },
    // GEDCOM importer link types (mirror dev2 migrations/seed taxonomy)
    {
        thing_id: UUID.IMPORTED_FROM,
        name: 'imported from',
        description: 'Объект был импортирован из внешнего источника данных',
        type: UUID.G_LINK,
        public: 1,
    },
    {
        thing_id: UUID.PRESENT,
        name: 'participates in',
        description: 'Person participates in an event (участвует в)',
        type: UUID.G_LINK,
        public: 1,
    },
    {
        thing_id: UUID.INSIDE,
        name: 'inside',
        description: 'Object is inside / located within a place',
        type: UUID.G_LINK,
        public: 1,
    },
    {
        thing_id: UUID.EVIDENCE,
        name: 'is evidenced by',
        description: 'Statement/object is evidenced by a source (подтверждается источником)',
        type: UUID.G_LINK,
        public: 1,
    },
    {
        thing_id: UUID.FATHER,
        name: 'father',
        description: 'is father of',
        type: UUID.G_LINK,
        public: 1,
    },
    {
        thing_id: UUID.MOTHER,
        name: 'mother',
        description: 'is mother of',
        type: UUID.G_LINK,
        public: 1,
    },
];

// ── Property definitions seeded in offline mode ──────────────────────
// Mirrors database/seeders/ListDividersSeeder.php.
export const PROPERTY_THINGS = [
    {
        thing_id: UUID.DIVIDER_PROPERTY,
        name: 'Dividers',
        description: 'List dividers or time breaks that live with the list object (not as separate entries). Dividers mark positions within an ordered list — for example, setbreak markers in a performance setlist.',
        type: UUID.G_THING,
        public: 1,
        data: { inherited: true },
    },
    {
        thing_id: UUID.COMMON_PUBLIC,
        name: 'Common public',
        description: 'Marks an object as intended to be compared against public databases (MusicBrainz, OSM, etc.). When a canonical public record exists, the local object is replaced by the canonical one.',
        type: UUID.G_THING,
        public: 1,
        data: { inherited: true },
    },
];

// Property membership + association links (use explicit link_type_id,
// unlike BOOTSTRAP_LINKS / CLASS_LINKS which all use LINK_TO_PARENT).
export const PROPERTY_LINKS = [
    { one: UUID.DIVIDER_PROPERTY, link_type_id: UUID.LINK_TO_CLASS,      other: UUID.PROPERTY_CLASS,  description: 'Dividers is a member of Property class' },
    { one: UUID.DIVIDER_PROPERTY, link_type_id: UUID.PROPERTY_APPLIES_TO, other: UUID.LIST_CLASS,      description: 'Dividers property applies to List class' },
    { one: UUID.COMMON_PUBLIC,    link_type_id: UUID.LINK_TO_CLASS,      other: UUID.PROPERTY_CLASS,  description: 'Common public is a member of Property class' },
    { one: UUID.COMMON_PUBLIC,    link_type_id: UUID.PROPERTY_APPLIES_TO, other: UUID.EVERYTHING,      description: 'Common public property applies to Everything' },
];

// ── Bootstrap links (top-level class hierarchy edges) ─────────────────
export const BOOTSTRAP_LINKS = [
    { one: UUID.EVERYTHING, other: UUID.SOMETHING,      description: '"Something" is subclass of "Everything"' },
    { one: UUID.EVERYTHING, other: UUID.LINK,           description: '"Link" is subclass of "Everything"' },
    { one: UUID.EVERYTHING, other: UUID.SYSTEM,         description: '"System" is subclass of "Everything"' },
    { one: UUID.LINK,       other: UUID.LINK_TO_PARENT, description: '"Superclass" is subclass of "Link"' },
    { one: UUID.LINK,       other: UUID.LINK_TO_CLASS,  description: '"Class of" is subclass of "Link"' },
    // GEDCOM importer link types live under the Link root (mirror dev2).
    { one: UUID.LINK,       other: UUID.IMPORTED_FROM,  description: '"Imported from" is subclass of "Link"' },
    { one: UUID.LINK,       other: UUID.PRESENT,        description: '"Participates in" is subclass of "Link"' },
    { one: UUID.LINK,       other: UUID.INSIDE,         description: '"Inside" is subclass of "Link"' },
    { one: UUID.LINK,       other: UUID.EVIDENCE,       description: '"Is evidenced by" is subclass of "Link"' },
    { one: UUID.LINK,       other: UUID.FATHER,         description: '"Father" is subclass of "Link"' },
    { one: UUID.LINK,       other: UUID.MOTHER,         description: '"Mother" is subclass of "Link"' },
    // Abstract link type bases under the Link root (mirror PHP migrations).
    { one: UUID.LINK,       other: '733112a1-9e87-47ee-8a86-81cc38e77a41', description: '"Hierarchy" is subclass of "Link"' },
    { one: UUID.LINK,       other: '79762fd7-e52d-4401-8010-fda9a7e81aa0', description: '"Containment" is subclass of "Link"' },
    { one: UUID.LINK,       other: '16414472-da4b-427d-8886-b7c75d133750', description: '"Equivalence" is subclass of "Link"' },
    { one: UUID.LINK,       other: 'b04d6a70-fb73-4ccf-badc-a7b1a9ff3dde', description: '"Kinship" is subclass of "Link"' },
];

// ── Classes and class-hierarchy links are now in seedClasses.js ─────
// (auto-generated from resources/js/localDb/system-objects.json).
// Remove this comment when the migration is fully complete.
