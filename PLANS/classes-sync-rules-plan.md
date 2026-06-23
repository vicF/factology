# Plan: Classes Tree, Sync Rules & Object Distribution (Refined)

## 1. Everything is a Thing — Type Catalog

| Type | Code | Description | Example |
|------|------|-------------|---------|
| General object | 3 | Regular data items (events, notes, people...) | "Birthday party" |
| Class | 2 | A category in the class tree | "Events", "People" |
| Link type | 4 | A relationship type | "parent_of", "belongs_to_class" |
| Server | 5 | An API endpoint | "home-server", "work-server" |
| Application/Device | 6 | An installation instance | "my-android-phone" |
| Group | 7 | A user group for permissions | "family", "team" |

All local-and-private by default unless user explicitly shares.

---

## 2. Ownership Through a System User

Instead of 3 boolean columns (`is_system`, `is_deletable`, `is_editable`), use a **system user**:

- A fixed UUID (`UUID::SYSTEM = "00000000-0000-0000-0000-000000000000"`) represents the system
- Objects owned by the System user are **read-only seeds** that ship with every install
- These classes cannot be deleted unless a class has no assigned objects
- No new columns needed — just `owner` field already exists

Example system objects:
| thing_id | name | owner | type |
|---|---|---|---|
| `UUID::ANYTHING` | Everything | `UUID::SYSTEM` | 2 (class) |
| `UUID::SOMETHING` | General | `UUID::SYSTEM` | 2 (class) |
| `UUID::LINK_TO_CLASS` | Belongs to class | `UUID::SYSTEM` | 4 (link type) |
| `UUID::LINK_TO_PARENT` | Parent of | `UUID::SYSTEM` | 4 (link type) |
| `UUID::G_CLASS` | Class | `UUID::SYSTEM` | 2 (class) |
| `UUID::G_LINK` | Link Type | `UUID::SYSTEM` | 4 (link type) |

The local seeder creates these on first launch. The sync engine never pushes them to a server (since they're already there).

---

## 3. Visibility Model

Replace the `public` boolean with a `visibility` enum (no new migration needed — just use the `data` JSON field or add column):

| Value | Readable by | Editable by | Synced to | Example |
|---|---|---|---|---|
| `private` | Owner only | Owner only | Nowhere (local) | Personal notes |
| `public` | Any authenticated user | Owner (+ server policy) | Assigned server | Shared events |
| `group` | Group members | Owner (+ group write permission) | Assigned server | Family photos |
| `system` | Everyone (seeded data) | System user only | Everywhere (pre-installed) | Class tree |

Objects are `private` by default. User must explicitly choose to make something `public` or `group`.

---

## 4. Class Tree — Immutable Seeds, Extensible Branches

### Rules
1. **System-owned classes** (owner = UUID::SYSTEM) are shipped with every install
2. Users **hide** classes they don't need (local-only setting, not a server change)
3. Users can **add children** to any class, system-owned or not
4. Users can **create new root-level classes**
5. A class **cannot be deleted** if it has linked objects (things or links to child classes)
6. Custom classes are `private` by default — not synced or shared unless user chooses

### Hiding (Local-Only)
```
localDb.preferences: { key: "hidden_classes", value: ["uuid1", "uuid2", ...] }
```
Class tree render filters these out. "Show hidden" toggle reveals them.

---

## 5. Every Object Must Have a Class

Enforced by a required link:
```
[object] --(link_type_id = UUID::LINK_TO_CLASS)--> [class]
```

- New objects default to `UUID::SOMETHING` ("General") class if user doesn't pick one
- The class link is required for permissions, display, and delete protection

---

## 6. Distribution Rules

### Default Behavior: Local-Only
All user-created objects are local-only unless the user explicitly adds a `stored_on` link to a Server.

### Stored On Links (Bidirectional)
```
[Data Object] --(stored_on)--> [Server]
```
or:
```
[Data Object] <--(stored_on)--> [Server]  (server can also push to app)
```

The bidirectional nature solves the "popular objects" problem:
- User stores an object "on Server A" = user wants it synced up
- Server links a public object "on Application" = server pushes this to the user's device
- This avoids needing one link per user for popular shared objects

### Sync Decision Table

| Object state | Pull (server → local) | Push (local → server) |
|---|---|---|
| `private`, no server link | Never | Never |
| `private`, linked to Server A | Yes (encrypted) | Yes (to Server A only) |
| `public`, linked to Server A | Yes | Yes (to Server A only) |
| `public`, no server link, server pushes to app | Yes (if server-initiated link exists) | Never |
| Owned by system user | Never (already seeded) | Never |
| Hidden class | No effect (local-only preference) | No effect |

### Sync Flow

```
[Start Sync for Server A]
  │
  ├── PULL: fetch from server
  │     ├── For each pulled object:
  │     │   ├── Already local? → merge/conflict resolve
  │     │   ├── New? → create local copy
  │     │   └── Server-initiated (no local stored_on link)?
  │     │       └── Create with server_stored_on link → user can later "star" it
  │     └── Update lastPullTimestamp
  │
  └── PUSH: send local changes
        ├── Objects with stored_on → Server A
        ├── Objects where visibility ≠ private
        └── Update lastPushTimestamp
```

---

## 7. User Creation Flow

### Onboarding Screen (First Launch)

```
[Welcome to Factology]
─────────────────────
  [Start Offline]      [Connect to Server]
       │                       │
       │ Creates:              │ Shows: server URL input
       │  • Local User thing   │ Authenticates
       │  • App/Device thing   │
       │  • Seeds classes +    │ Pulls user profile
       │    system objects     │ Merges (or creates) local user
       │  • 5 demo objects     │ Seeds classes (if server has none)
       │                       │ Syncs user's data
       └───────┬───────────────┘
               │
        [App ready - browse/search/create]
```

### Unauthenticated User
- Can browse public records without logging in
- Can use the app entirely offline (local user)
- Only prompted to connect to a server when they try to make something public or share with group

### Linking Local User to Server
```
[local-user-thing] ---(mirrors)---> [server-user-thing]
```
Same identity, different storage locations. The `mirrors` link means "this is the same person."

---

## 8. Standard Classes Tree

Shipped via seeder, owned by UUID::SYSTEM:

```
Everything (UUID::ANYTHING)
├── Events
│   ├── Personal
│   ├── Work
│   └── Historical
├── People
│   ├── Family
│   ├── Friends
│   ├── Colleagues
│   └── Public Figures
├── Places
│   ├── Cities
│   ├── Buildings
│   └── Natural
├── Media
│   ├── Photos
│   ├── Videos
│   └── Documents
├── Organizations
│   ├── Companies
│   ├── Schools
│   └── Governments
└── System (hidden by default for normal users)
    ├── Link Types
    ├── Permission Types
    ├── Server Registry
    └── Application Registry
```

Users can hide any branch, extend any branch, or add new root nodes.

---

## 9. Key Design Decisions Summary

| Question | Decision | Why |
|---|---|---|
| Read-only objects? | Owned by system user UUID, no extra columns | Simpler schema, single source of truth for ownership |
| Visibility model? | `private` → `public` → `group` → `system` enum | `public` = visible to any authenticated user |
| Default sharing? | **Never** — all objects start private | User must explicitly share |
| Class protection? | Can't delete a class with assigned objects | Prevents orphaned data |
| Every object needs a class? | Yes, enforced via LINK_TO_CLASS link | Consistency for permissions, display, sync |
| Popular objects overhead? | Bidirectional `stored_on` links | Server can push to app without per-user links |
| `is_system`/`is_deletable`/`is_editable` columns? | **Not needed** — owner UUID replaces all | Ownership IS the permission model |
