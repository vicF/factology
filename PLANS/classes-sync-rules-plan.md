# Factology — Object Model, Classes, Sync & Governance

Covers: identity model, class hierarchy, sync rules, difference tracking, cross-server sharing.

---

## 1. Everything is a Thing — Type Catalog

| Type | Code | Description | Example |
|------|------|-------------|---------|
| General object | 3 | Regular data items (events, notes, people...) | "Birthday party" |
| Class | 2 | A category in the class tree | "Events", "People" |
| Link type | 4 | A relationship type | "parent_of", "created_by" |
| Server | 5 | An API endpoint | "home-server", "work-server" |
| Application/Device | 6 | An installation instance | "my-android-phone" |
| Group | 7 | A user group for permissions | "family", "team" |

**Server/App is a Thing:** Every server and every local application instance gets its own UUID.
They are `things` records of type G_SERVER (5) or a future G_APP (6). This means:
- Servers/apps are first-class objects — they can be linked to, queried, referenced
- Source tracking uses links (`created_on`) instead of columns
- A server/app record can carry metadata (URL, name, public key)

**All objects are local-and-private by default** unless the user explicitly shares.

---

## 2. Identity Model: Person (cross-server) vs User (per-server)

### Two Concepts

| Concept | UUID scope | Purpose |
|---|---|---|
| **Person** | **Server-scoped** — each server generates its own UUID | Real-world identity. Objects are owned by Persons. |
| **User** | **Per-server** — different UUID on each server | Login credential. Authentication. |

**Why server-scoped Person UUIDs?**
If Person UUIDs were universal, anyone could create a user on their server claiming to be
"Victor Fokin" with the same UUID. Server-scoped UUIDs prevent this: Person UUID `Pa`
exists only on Server A. On Server B, the same person has UUID `Pb`. Nobody can hijack
`Pa` on Server B because `Pa` doesn't exist there.

### Cross-Server Identity via `same_as` Links

A `same_as` link explicitly connects two Person UUIDs across servers:

```
Person UUID Pa on Server A --(same_as)--> Person UUID Pb on Server B
```

Rules:
- A `same_as` link can only be created by someone who controls both accounts
- It is a user-authorized claim: "these Person UUIDs represent the same real person"
- Sync follows `same_as` links: objects owned by `Pa` on Server A are linked to Victor's
  view on Server B via the cross-reference

### Provenance Links (Immutable, Set at Creation)

Instead of columns, provenance is tracked via links:

| Link type | Purpose | Immutable? |
|---|---|---|
| `created_by` | Links object to the User UUID that created it | Yes |
| `created_on` | Links object to the Server/App UUID where it was created | Yes |
| `derived_from` | Links a copy to its source UUID | Yes |
| `imported_from` | Links an imported object to its origin server | Yes |

These are set at creation and never change. They provide a complete audit trail for every
object, regardless of later ownership changes.

### Identity Links (User-Managed)

| Link type | Purpose | Mutable? |
|---|---|---|
| `same_as` | "This UUID represents the same entity as that UUID" | Yes (user manages) |
| `superseded_by` | "This UUID is deprecated in favor of that UUID" | Yes (merge action) |

---

## 3. Ownership Through a System User

A fixed UUID (`UUID::SYSTEM`) represents the system. Objects owned by the System user are
read-only seeds that ship with every install. No special columns needed — ownership IS the
permission model.

Example system objects seeded on every install:
| thing_id | Name | Type | Owner |
|---|---|---|---|
| `UUID::ANYTHING` | Everything | Class | System |
| `UUID::SOMETHING` | General | Class | System |
| `UUID::LINK` | Link | Link type | System |
| `UUID::USER` | User | Class | System |
| `UUID::SYSTEM` | System | Class | System |

Plus the class tree (see §8) and provenance link types (see §9).

**Seed data never syncs between servers** — every server has its own copy.

---

## 4. Visibility Model

Replace the `public` boolean with a `visibility` enum (via `data` JSON field or column):

| Value | Readable by | Editable by | Sync behavior |
|---|---|---|---|
| `private` | Owner + group members | Owner only | Never leaves source server |
| `group` | Group members + owner | Owner only | Syncs to servers where group exists |
| `public` | Any authenticated user | Owner only | Syncs per `stored_on` links |

Objects are `private` by default. User must explicitly share.

---

## 5. Class Tree Rules

1. **System-owned classes** (owner = UUID::SYSTEM) ship with every install
2. Users **hide** classes they don't need (local preference, not a data change)
3. Users can **add child classes** under any class, system-owned or not
4. Users can **create new root-level classes**
5. A class **cannot be deleted** if linked objects exist under it
6. Custom classes are `private` by default

### Hiding (Local-Only)
```
localDb.preferences: { key: "hidden_classes", value: ["uuid1", "uuid2", ...] }
```

---

## 6. Every Object Must Have a Class

Enforced by a required link:
```
[object] --(link_type_id = LINK_TO_CLASS)--> [class]
```

- New objects default to `UUID::SOMETHING` ("General") if user doesn't pick one
- The class link is required for display, filtering, and delete protection

---

## 7. User Creation Flow

### Onboarding Screen (First Launch)

```
[Welcome to Factology]
─────────────────────
  [Start Offline]      [Connect to Server]
       │                       │
       │ Creates:              │ Shows: server URL input
       │  • Local Person       │ Authenticates
       │  • User (per-server)  │
       │  • App/Device thing   │ Creates Person + User on server
       │  • Seeds classes +    │ Links local Person to server Person
       │    system objects     │ via same_as (if reconnecting)
       │                       │
       └───────┬───────────────┘
               │
        [App ready - browse/search/create]
```

### Linking Local User to Server
```
[local Person UUID] --(same_as)--> [server Person UUID]
```

---

## 8. Standard Classes Tree

Shipped via seeder, owned by UUID::SYSTEM:

```
Everything (UUID::ANYTHING)
└── Something (UUID::SOMETHING)     ← base class for all classes
    ├── Events (UUID::EVENTS)
    │   ├── Personal
    │   ├── Work
    │   └── Historical
    ├── People (UUID::PEOPLE)
    │   ├── Family
    │   ├── Friends
    │   ├── Colleagues
    │   └── Public Figures
    ├── Places (UUID::PLACES)
    │   ├── Cities
    │   ├── Buildings
    │   └── Natural
    ├── Media (UUID::MEDIA)
    │   ├── Photos
    │   ├── Videos
    │   └── Documents
    ├── Organizations (UUID::ORGANIZATIONS)
    │   ├── Companies
    │   ├── Schools
    │   └── Governments
    └── System (UUID::SYSTEM_CLASS, hidden by default)
        ├── Link Types
        ├── Permission Types
        ├── Server Registry
        └── Application Registry
```

---

## 9. Provenance & Identity Link Types

Seeded under the `Link` root class:

| UUID constant | Name | Purpose |
|---|---|---|
| `CREATED_BY` | created by | Links object → User UUID that created it |
| `CREATED_ON` | created on | Links object → Server/App UUID where created |
| `SAME_AS` | same as | Two UUIDs represent the same real-world entity |
| `DERIVED_FROM` | derived from | Copied object → source object |
| `SUPERSEDED_BY` | superseded by | Deprecated object → replacement |
| `SUGGESTS_CHANGE` | suggests change to | Suggestion object → target object |

---

## 10. Distribution & Sync Rules

### Default: Local-Only

All user-created objects are local-only unless the user explicitly adds a `stored_on` link
to a Server.

### Stored On Links (Bidirectional)
```
[Data Object] --(stored_on)--> [Server]     (user stores on server)
[Data Object] <--(stored_on)-- [Server]     (server pushes to app)
```

### Sync Decision Table

| Object state | Pull (server → local) | Push (local → server) |
|---|---|---|
| `private`, no server link | Never | Never |
| `private`, linked to Server A | Yes (encrypted) | Yes (to Server A only) |
| `public`, linked to Server A | Yes | Yes (to Server A only) |
| `public`, no server link, server pushes | Yes (if server-initiated) | Never |
| Owned by system user | Never (already seeded) | Never |

### Sync Flow

```
[Start Sync for Server A]
  │
  ├── PULL: fetch from server
  │     └── For each pulled object:
  │         ├── New UUID? → create local copy
  │         ├── Same UUID?
  │         │   ├── Already local? → compare fields, flag differences
  │         │   └── New? → create with provenance
  │         └── Server-initiated (no local stored_on)?
  │             └── Create with server_stored_on link
  │
  └── PUSH: send local changes
        ├── Objects with stored_on → Server A
        └── Objects where visibility ≠ private
```

---

## 11. Difference Tracking (Not Conflict Resolution)

The system does NOT auto-resolve conflicts. Instead, it tracks differences and presents
them to the user.

### How it Works

When two `same_as`-linked objects have different values for the same field, the system
shows a hint:

```
"User C (on Server 2) has birth_year = 1908 for this person.
 Your value: 1910. Options: [Adopt] [Ignore] [Suggest correction]"
```

### User Options

For each differing field across `same_as`-linked objects:
- **Adopt** — copy the other value to your object
- **Ignore** — dismiss this hint (can be re-shown)
- **Suggest correction** — create a suggestion to the other user (see §12)

### Key Principle

Divergent information is ALLOWED. Two users can have different birth years for the same
person, and both are valid in their respective contexts. The system tracks and shows
differences but does not force alignment.

---

## 12. Suggestion Protocol

Users can propose changes to objects they don't own.

### Flow
1. User views an object they don't own
2. User creates a suggestion with proposed changes
3. The suggestion is stored as a special object linked via `suggests_change`:
   ```
   [Suggestion UUID] --(suggests_change)--> [Target UUID]
   ```
4. The owner sees pending suggestions on their objects
5. Owner can: **accept** (applies the change) or **decline** (records as declined)
6. Both parties can view suggestion history on any object

This covers "tell user C that his date is wrong" — you send a suggestion instead of
editing directly.

---

## 13. Genealogy Use Cases

### Scenario A — Reference (Read-Only)

B creates "Grandpa Smith" (UUID-Gb). A links to it without owning it:
- A sees B's data in read-only mode
- Changes B makes are reflected for A
- A cannot edit UUID-Gb unless B grants permission

### Scenario B — Clone (Copy + Own)

A clones UUID-Gb to UUID-Ga:
- UUID-Ga has the same content as UUID-Gb
- `derived_from` link: UUID-Ga → UUID-Gb
- A owns UUID-Ga and can edit freely
- Changes to UUID-Gb do NOT affect UUID-Ga (and vice versa)

### Scenario C — Grant Edit

B explicitly grants A write permission on UUID-Gb:
- Both can edit the same object
- `created_by` still shows B as the original creator
- Edit history is tracked per-user

### Scenario D — Merge

A and B decide to merge UUID-Ga and UUID-Gb:
- Choose a canonical UUID (e.g., UUID-Ga)
- UUID-Gb gets `superseded_by` → UUID-Ga
- Reads of UUID-Gb transparently redirect to UUID-Ga

### Scenario E — Cross-Server

C is on Server 2. A and B import C's tree to Server 1:
- Objects keep their UUIDs
- `created_on` → Server 2 (preserved)
- `owner` = C's Person UUID on Server 2 (preserved)
- A and B can reference (read-only) or clone objects they need to edit

---

## 14. Trust & Authenticity (No Crypto in MVP)

**Fundamental limitation:** Anyone can create a server claiming any UUID. Just like anyone
can create a website saying "2+2=5". There is no technical mechanism to prevent this.

**Protection is trust-based:**
1. **API-level auth** — normal sync between trusted servers is authenticated and owner-checked
2. **`created_on` link** — every object carries its origin server UUID. You choose which servers to trust
3. **Guarded import** — when importing JSON from an unknown source, create copies (new UUIDs) with provenance links. Don't blindly accept claimed ownership
4. **Optional HMAC** — between trusted server pairs, sign exports with a shared secret (catches casual tampering)

Per-object cryptographic signatures (Ed25519) can be added in a future phase if needed.
Not in MVP.

---

## 15. Key Design Decisions

| Question | Decision | Rationale |
|---|---|---|
| Person UUID scope | **Server-scoped** | Prevents UUID hijacking across servers |
| Source tracking | `created_on` **link** (not column) | Fits "everything is a thing" model |
| Creator tracking | `created_by` link, **immutable** | Audit trail regardless of ownership |
| Conflict model | **Difference tracking**, not resolution | Divergent info allowed. Users decide. |
| Cross-server identity | `same_as` link, **explicitly authorized** | User must control both accounts |
| Object editing | On **source server** by default | Simple authority. Transfer is future. |
| Suggesting changes | **Suggestion objects** linked via `suggests_change` | Formal protocol for proposing changes |
| Authenticity | **Trust-based** (no crypto in MVP) | Social, not cryptographic |
| Import from untrusted source | Creates **copies with provenance** | Protects existing objects from spoofed claims |
| Public reference data | Stable UUIDs, **never change** | Links depend on UUID stability |
| Edit permission | Owner grants explicitly | Scoped to specific objects and users |
| Read-only objects | Owned by system user UUID | No extra columns needed |
| Visibility model | `private` → `group` → `public` enum | Simple, covers all cases |
| Default sharing | **Never** — all objects start private | User must explicitly share |
| Every object needs a class | Yes, via LINK_TO_CLASS | Required for display and permissions |
| Popular objects overhead | Bidirectional `stored_on` links | No per-user links needed |
| `is_system` / `is_deletable` columns | **Not needed** | Owner UUID replaces all |
