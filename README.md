# Factology

**A flexible system for describing and visualizing relationships between any entities.**

The project enables modeling knowledge, events, concepts, objects, and their interconnections as a directed graph. Each relationship can have its own type, and entities can carry arbitrary attributes. The system is designed as a browser-based server application, with plans for mobile platforms.

## Key features

- **Any type of entity**: people, places, events, abstract ideas, files – anything you want.
- **Custom link types** – define your own relationships (e.g., "includes", "is parent of", "manufactures", "causes").
- **Directed edges** – the arrow expresses the semantics of the relation.
- **Grouping via binary edges** – "element → belongs to → set".
- **Data exchange between applications** – export/import in standard formats (JSON, XML, with GEDCOM planned).
- **Backend**: PHP. Provides an API for client applications.
- **Standard client**: Vue 3.

## Repository status

> **Status**: MVP (Minimum Viable Product) – basic entity and link management works, minimal graph visualization is available.

## Immediate plans

- Data export and import
- Support for a wide range of dates (historical, future, fuzzy)
- Image handling
- Adaptation for mobile applications
## Commercial licensing

Interested in commercial use? Contact me: [victor.fokin@gmail.com]

## Quick start (production)

**Requires: Docker** (the install script installs it if missing).

### One-command install

```bash
curl -fsSL https://raw.githubusercontent.com/vicF/factology/main/bin/install | bash
```

This will:
1. Install Docker Engine if not present
2. Clone the repository into `~/factology`
3. Create `.env` with production defaults (passwords auto-generated)
4. Build the production Docker image (multi-stage: Node builds frontend, then PHP runtime)
5. Start PostgreSQL + the application
6. Generate `APP_KEY`, run migrations, cache config

The app is then available at **http://localhost:8003**.

### Manual install

```bash
git clone https://github.com/vicF/factology
cd factology
cp .env.example .env
# Edit .env — at minimum set DB_PASSWORD and DB_ROOT_PASSWORD
docker compose up -d
```

### Updating

```bash
cd ~/factology
git pull
docker compose up -d --build
```

The entrypoint automatically runs pending migrations and re-caches config on every start.

### Credentials

On first install, `bin/install` generates random passwords for both `DB_PASSWORD` (application user) and `DB_ROOT_PASSWORD` (PostgreSQL superuser). These are stored in `.env` — keep this file safe.

| User | Role | Set in |
|------|------|--------|
| `dbuser` | Application database user (restricted — no superuser) | `.env` → `DB_PASSWORD` |
| `postgres` | Database superuser (provisioning only) | `.env` → `DB_ROOT_PASSWORD` |

## Support the project

<a href="https://boosty.to/vfokin/donate">Boosty</a>
