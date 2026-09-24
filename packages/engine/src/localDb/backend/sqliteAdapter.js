// packages/engine/src/localDb/backend/sqliteAdapter.js
//
// SQLite adapter for @factology/engine — replaces Dexie on platforms where a
// shared SQLite database file is needed (Electron desktop, Capacitor iOS/Android).
// Exposes a Dexie-compatible table API so index.js, links.js and media.js work
// unchanged.
//
// sql.js (WASM) provides the actual SQLite engine. Platform file I/O is injected
// via the `fileIO` option so the same adapter works in Electron (node fs),
// Capacitor (Filesystem plugin), and Vitest (node fs).

const TABLE_DEFS = {
    objects: {
        pk: 'thing_id',
        autoIncrement: false,
        columns: [
            'thing_id TEXT PRIMARY KEY',
            'type INTEGER',
            'owner TEXT',
            'public INTEGER DEFAULT 0',
            'deleted INTEGER DEFAULT 0',
            'start TEXT',
            '"end" TEXT',
            'name TEXT',
            'description TEXT',
            'data TEXT',            // JSON blob
            'tags TEXT',            // JSON array (Dexie multi-value emulated)
            '_syncStatus TEXT',
            '_localRevision INTEGER DEFAULT 0',
            '_serverRevision INTEGER DEFAULT 0',
            '_serverId TEXT',
            '_createdAt INTEGER',
            '_updatedAt INTEGER',
        ],
        indexes: ['type', 'owner', 'public', 'deleted', '_syncStatus', '_serverId'],
    },
    links: {
        pk: 'link_id',
        autoIncrement: false,
        columns: [
            'link_id TEXT PRIMARY KEY',
            'link_uuid TEXT',
            'one_thing_id TEXT',
            'link_type_id INTEGER',
            'other_thing_id TEXT',
            'public INTEGER DEFAULT 0',
            'data TEXT',
            '_syncStatus TEXT',
            '_localRevision INTEGER DEFAULT 0',
            '_serverRevision INTEGER DEFAULT 0',
            '_serverId TEXT',
            '_createdAt INTEGER',
            '_updatedAt INTEGER',
        ],
        indexes: ['link_uuid', 'one_thing_id', 'link_type_id', 'other_thing_id',
            'public', '_syncStatus', '_serverId',
            { name: 'idx_links_compound', cols: ['one_thing_id', 'link_type_id', 'other_thing_id'] },
        ],
    },
    media: {
        pk: 'thing_id',
        autoIncrement: false,
        columns: [
            'thing_id TEXT PRIMARY KEY',
            'filename TEXT',
            'size INTEGER',
            'crc TEXT',
            'folder_id TEXT',
            'data TEXT',
            '_syncStatus TEXT',
            '_localRevision INTEGER DEFAULT 0',
            '_serverRevision INTEGER DEFAULT 0',
            '_serverId TEXT',
            '_createdAt INTEGER',
            '_updatedAt INTEGER',
        ],
        indexes: ['filename', 'size', 'crc', 'folder_id', '_syncStatus', '_serverId'],
    },
    pendingChanges: {
        pk: 'id',
        autoIncrement: true,
        columns: [
            'id INTEGER PRIMARY KEY AUTOINCREMENT',
            'operation TEXT',
            'table TEXT',
            'recordId TEXT',
            'payload TEXT',     // JSON
            'serverId TEXT',
            'timestamp INTEGER',
        ],
        indexes: ['operation', 'table', 'serverId', 'timestamp'],
    },
    syncMetadata: {
        pk: 'serverId',
        autoIncrement: false,
        columns: [
            'serverId TEXT PRIMARY KEY',
            'lastPullTimestamp INTEGER',
            'lastPushTimestamp INTEGER',
        ],
        indexes: [],
    },
    external_links: {
        pk: 'id',
        autoIncrement: false,
        columns: [
            'id TEXT PRIMARY KEY',
            'thing_id TEXT',
            'url TEXT',
            'data TEXT',
            '_syncStatus TEXT',
            '_serverId TEXT',
            '_localRevision INTEGER DEFAULT 0',
            '_serverRevision INTEGER DEFAULT 0',
            '_createdAt INTEGER',
            '_updatedAt INTEGER',
        ],
        indexes: ['thing_id', 'url', '_syncStatus', '_serverId'],
    },
};

// ---------------------------------------------------------------------------
// Query builder — mimics Dexie's fluent WhereClause + Collection API
// ---------------------------------------------------------------------------

class WhereClause {
    constructor(tableName, pk, column, db) {
        this._tableName = tableName;
        this._pk = pk;
        this._column = column;
        this._db = db;
        this._conditions = [];
        this._orConditions = [];
        this._mode = 'where'; // 'where' or 'or'
        this._orderByCol = null;
        this._orderDir = 'ASC';
        this._limitVal = null;
        this._offsetVal = null;
        this._filterFn = null;
    }

    equals(val) {
        const target = this._mode === 'or' ? this._orConditions : this._conditions;
        target.push({ column: this._column, op: '= ?', params: [val] });
        return this._buildCollection();
    }

    anyOf(values) {
        if (!Array.isArray(values)) values = [values];
        if (values.length === 0) {
            // Matches nothing
            this._conditions.push({ column: this._column, op: '=1', params: ['0'] });
            return this._buildCollection();
        }

        // Handle compound index anyOf (array of arrays, e.g.
        // anyOf([[id1, type1, id2], [id3, type3, id4]])).
        // Dexie matches the tuple across the compound index columns.
        if (Array.isArray(values[0])) {
            const orClauses = values.map(tuple => {
                const cols = this._column.split('+');
                const parts = cols.map((c, i) => `${quoteColumn(c)} = ?`);
                return parts.join(' AND ');
            });
            const flatParams = values.flat();
            const target = this._mode === 'or' ? this._orConditions : this._conditions;
            target.push({ column: `(${orClauses.join(' OR ')})`, op: '', params: flatParams, isRaw: true });
            return this._buildCollection();
        }

        const placeholders = values.map(() => '?').join(',');
        const target = this._mode === 'or' ? this._orConditions : this._conditions;
        target.push({ column: this._column, op: `IN (${placeholders})`, params: values });
        return this._buildCollection();
    }

    // Dexie-compatible alias: .and(fn) === .filter(fn)
    and(fn) {
        return this._buildCollection().and(fn);
    }

    first() {
        return this._buildCollection().first();
    }

    // Chain to or() for Dexie-compatible OR queries
    _buildCollection() {
        const col = new Collection(this._tableName, this._pk, this._db);
        col._conditions = [...this._conditions];
        col._orConditions = [...this._orConditions];
        col._orderByCol = this._orderByCol;
        col._orderDir = this._orderDir;
        col._limitVal = this._limitVal;
        col._offsetVal = this._offsetVal;
        col._filterFn = this._filterFn;
        return col;
    }
}

class Collection {
    constructor(tableName, pk, db) {
        this._tableName = tableName;
        this._pk = pk;
        this._db = db;
        this._conditions = [];
        this._orConditions = [];
        this._orderByCol = null;
        this._orderDir = 'ASC';
        this._limitVal = null;
        this._offsetVal = null;
        this._filterFn = null;
    }

    // Dexie-compatible: .and(fn) === .filter(fn)
    and(fn) {
        this._filterFn = fn;
        return this;
    }

    filter(fn) {
        this._filterFn = fn;
        return this;
    }

    limit(n) {
        this._limitVal = n;
        return this;
    }

    offset(n) {
        this._offsetVal = n;
        return this;
    }

    count() {
        const rows = this._execute();
        return rows.length;
    }

    first() {
        const rows = this._execute();
        return rows.length > 0 ? rows[0] : null;
    }

    toArray() {
        return this._execute();
    }

    keys() {
        const rows = this._execute();
        return rows.map(r => r[this._pk]);
    }

    primaryKeys() {
        const rows = this._execute();
        return rows.map(r => r[this._pk]);
    }

    sortBy(col) {
        this._orderByCol = col;
        this._orderDir = 'ASC';
        return this;
    }

    // Reverse the sort order (used before toArray)
    reverse() {
        this._orderDir = this._orderDir === 'ASC' ? 'DESC' : 'ASC';
        return this;
    }

    or(column) {
        const wc = new WhereClause(this._tableName, this._pk, column, this._db);
        wc._conditions = [...this._conditions];
        wc._orConditions = [...this._orConditions];
        wc._mode = 'or';
        wc._orderByCol = this._orderByCol;
        wc._orderDir = this._orderDir;
        wc._limitVal = this._limitVal;
        wc._offsetVal = this._offsetVal;
        wc._filterFn = this._filterFn;
        return wc;
    }

    _execute() {
        const clauses = [];
        const params = [];

        // Build WHERE clause from conditions and orConditions.
        // Dexie's .or() creates OR between the base and or conditions:
        //   .where('a').equals(1).or('b').equals(2) → WHERE a = 1 OR b = 2
        const allConditions = [...this._conditions, ...this._orConditions];
        if (allConditions.length > 0) {
            const parts = [];
            for (const cond of allConditions) {
                if (cond.isRaw) {
                    parts.push(cond.column);
                    params.push(...cond.params);
                } else {
                    parts.push(`${quoteColumn(cond.column)} ${cond.op}`);
                    params.push(...cond.params);
                }
            }
            clauses.push(`WHERE ${parts.join(' OR ')}`);
        }

        let sql = `SELECT * FROM ${quoteColumn(this._tableName)} ${clauses.join(' ')}`;

        if (this._orderByCol) {
            // Map Dexie index names to column names
            const col = mapDexieIndexToColumn(this._orderByCol);
            sql += ` ORDER BY ${quoteColumn(col)} ${this._orderDir}`;
        }

        if (this._limitVal !== null) {
            sql += ` LIMIT ${this._limitVal}`;
        }
        if (this._offsetVal) {
            sql += ` OFFSET ${this._offsetVal}`;
        }

        let rows;
        try {
            const stmt = this._db._execPrepared(sql, params);
            rows = this._db._stmtToObjects(stmt, this._tableName);
            // Don't free — cached by _execPrepared for reuse
        } catch (e) {
            rows = [];
        }

        if (this._filterFn) {
            rows = rows.filter(this._filterFn);
        }

        return rows;
    }
}

// ---------------------------------------------------------------------------
// Table — mimics Dexie.Table
// ---------------------------------------------------------------------------

class Table {
    constructor(name, def, db) {
        this.name = name;
        this._def = def;
        this._db = db;
        this._pk = def.pk;
        this._autoIncrement = def.autoIncrement;
    }

    async put(obj) {
        if (this._autoIncrement && !obj[this._pk]) {
            // Insert without PK; SQLite will auto-generate
            const cols = Object.keys(obj);
            const placeholders = cols.map(() => '?').join(',');
            const colNames = cols.map(quoteColumn).join(',');
            const sql = `INSERT INTO ${quoteColumn(this.name)} (${colNames}) VALUES (${placeholders})`;
            const vals = cols.map(c => serializeValue(obj[c]));
            this._db._run(sql, vals);
            this._db._markDirty();
            return this._db._getLastInsertId();
        }

        // INSERT OR REPLACE with all table columns (same pattern as bulkPut).
        // Eliminates the preliminary SELECT (this.get()) that doubled SQL ops.
        const def = this._def;
        const allCols = def.columns.map(c => c.split(' ')[0].replace(/"/g, ''));
        const colNames = allCols.map(c => `"${c}"`).join(',');
        const placeholders = allCols.map(() => '?').join(',');
        const sql = `INSERT OR REPLACE INTO "${this.name}" (${colNames}) VALUES (${placeholders})`;
        const vals = allCols.map(c => serializeValue(c in obj ? obj[c] : null));
        this._db._run(sql, vals);
        this._db._markDirty();
        return obj[this._pk];
    }

    async get(id) {
        const sql = `SELECT * FROM ${quoteColumn(this.name)} WHERE ${quoteColumn(this._pk)} = ?`;
        const stmt = this._db._execPrepared(sql, [id]);
        const rows = this._db._stmtToObjects(stmt, this.name);
        // Don't free — cached by _execPrepared for reuse
        return rows.length > 0 ? rows[0] : undefined;
    }

    async update(id, changes) {
        const cols = Object.keys(changes);
        if (cols.length === 0) return;
        const setClauses = cols.map(c => `${quoteColumn(c)} = ?`).join(', ');
        const vals = cols.map(c => serializeValue(changes[c]));
        vals.push(id);
        const sql = `UPDATE ${quoteColumn(this.name)} SET ${setClauses} WHERE ${quoteColumn(this._pk)} = ?`;
        this._db._run(sql, vals);
        this._db._markDirty();
    }

    async delete(id) {
        const sql = `DELETE FROM ${quoteColumn(this.name)} WHERE ${quoteColumn(this._pk)} = ?`;
        this._db._run(sql, [id]);
        this._db._markDirty();
    }

    async clear() {
        this._db._run(`DELETE FROM ${quoteColumn(this.name)}`);
        this._db._markDirty();
    }

    async bulkDelete(ids) {
        if (ids.length === 0) return;
        const placeholders = ids.map(() => '?').join(',');
        const sql = `DELETE FROM ${quoteColumn(this.name)} WHERE ${quoteColumn(this._pk)} IN (${placeholders})`;
        this._db._run(sql, ids);
        this._db._markDirty();
    }

    async add(obj) {
        // Dexie add() throws if the key already exists
        const existing = obj[this._pk] ? await this.get(obj[this._pk]) : undefined;
        if (existing) {
            throw new Error(`Key already exists: ${obj[this._pk]}`);
        }
        return this.put(obj);
    }

    async bulkGet(ids) {
        if (!ids || ids.length === 0) return [];
        const CHUNK_SIZE = 999; // sql.js default SQLITE_MAX_VARIABLE_NUMBER
        const allRows = [];
        for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
            const chunk = ids.slice(i, i + CHUNK_SIZE);
            const placeholders = chunk.map(() => '?').join(',');
            const sql = `SELECT * FROM ${quoteColumn(this.name)} WHERE ${quoteColumn(this._pk)} IN (${placeholders})`;
            const stmt = this._db._execPrepared(sql, chunk);
            const rows = this._db._stmtToObjects(stmt, this.name);
            // Don't free — cached by _execPrepared for reuse
            allRows.push(...rows);
        }

        // Dexie bulkGet returns results in the same order as ids, with
        // undefined for missing keys.
        const byId = {};
        for (const row of allRows) {
            byId[row[this._pk]] = row;
        }
        return ids.map(id => byId[id] !== undefined ? byId[id] : undefined);
    }

    async bulkPut(rows) {
        if (rows.length === 0) return;

        const def = this._def;
        const allCols = def.columns.map(c => c.split(' ')[0].replace(/"/g, ''));
        const colNames = allCols.map(c => `"${c}"`).join(',');
        const placeholders = allCols.map(() => '?').join(',');
        const sql = `INSERT OR REPLACE INTO "${this.name}" (${colNames}) VALUES (${placeholders})`;

        this._db._run('BEGIN');
        try {
            for (const row of rows) {
                const stmt = this._db._execPrepared(sql);
                stmt.bind(allCols.map(c => serializeValue(c in row ? row[c] : null)));
                stmt.step();
            }
            this._db._run('COMMIT');
            this._db._markDirty();
        } catch (e) {
            this._db._run('ROLLBACK');
            throw e;
        }
    }

    filter(fn) {
        return this.toCollection().filter(fn);
    }

    count() {
        return this.toCollection().count();
    }

    toArray() {
        return this.toCollection().toArray();
    }

    toCollection() {
        const col = new Collection(this.name, this._pk, this._db);
        return col;
    }

    orderBy(index) {
        const col = new Collection(this.name, this._pk, this._db);
        col._orderByCol = index;
        return col;
    }

// Dexie-compatible shortcuts that delegate to Collection
    limit(n) {
        return this.toCollection().limit(n);
    }

    first() {
        return this.toCollection().first();
    }

    keys() {
        return this.toCollection().keys();
    }

    primaryKeys() {
        return this.toCollection().primaryKeys();
    }

    sortBy(col) {
        return this.toCollection().sortBy(col);
    }

    reverse() {
        return this.toCollection().reverse();
    }

    where(column) {
        return new WhereClause(this.name, this._pk, column, this._db);
    }
}

// ---------------------------------------------------------------------------
// SQLiteAdapter — replaces Dexie instance
// ---------------------------------------------------------------------------

export class SQLiteAdapter {
    constructor(fileIO, initSqlJsOptions = {}) {
        this._fileIO = fileIO; // { read(): Promise<Uint8Array>, write(Uint8Array): Promise<void> }
        this._initSqlJsOptions = initSqlJsOptions; // passed to initSqlJs() for locateFile etc.
        this._db = null;
        this._SQL = null;
        this._tables = {};
        this._ready = false;
        this._prepCache = new Map();     // LRU: prepared statements keyed by SQL
        this._colNames = {};             // tableName → array of column name strings
        this._saveTimer = null;
        this._savePromise = null;
        this._dirty = false;        // true when in-memory data diverges from disk
        this._autoSaveTimer = null; // setInterval handle for periodic flushing
    }

    async init(dbName = 'factology_local') {
        this._dbName = dbName;

        // Load sql.js WASM (lazy — only when SQLite adapter is actually used)
        const initSqlJs = (await import('sql.js')).default;
        this._SQL = await initSqlJs(this._initSqlJsOptions);

        // Try to load existing database file
        let buffer;
        try {
            buffer = await this._fileIO.read();
        } catch (e) {
            // File doesn't exist yet — create new DB
            buffer = null;
        }

        if (buffer && buffer.byteLength > 0) {
            this._db = new this._SQL.Database(buffer);
        } else {
            this._db = new this._SQL.Database();
        }

        // Enable WAL mode for concurrent multi-process access
        this._db.run('PRAGMA journal_mode=WAL');
        this._db.run('PRAGMA foreign_keys=OFF');

        // Create tables
        this._ensureTables();

        this._ready = true;

        // Auto-save: persist dirty data to disk every 2 seconds so user data
        // is never more than a couple seconds away from a stable file. The
        // interval is coarse enough that bulk operations (import, seed) only
        // trigger 1-2 writes, but frequent enough that crash resilience is
        // reasonable. close() flushes immediately.
        this._startAutoSave();

        // New database — persist the empty schema to disk immediately so the
        // file and directory exist (visible in About page, confirmed on disk).
        if (buffer === null) {
            const data = this._db.export();
            await this._fileIO.write(data);
        }

        return this;
    }

    _ensureTables() {
        for (const [name, def] of Object.entries(TABLE_DEFS)) {
            // Quote each column name in the CREATE TABLE to handle reserved
            // words like "table" and "end".
            const colDefs = def.columns.map(col => {
                const [colName, ...rest] = col.trim().split(/\s+/);
                const clean = colName.replace(/^"|"$/g, '');
                return `"${clean}" ${rest.join(' ')}`;
            }).join(', ');
            const sql = `CREATE TABLE IF NOT EXISTS "${name}" (${colDefs})`;
            this._db.run(sql);

            // Create indexes
            for (const idx of def.indexes) {
                if (typeof idx === 'string') {
                    const idxSql = `CREATE INDEX IF NOT EXISTS idx_${name}_${idx} ON ${quoteColumn(name)} (${quoteColumn(idx)})`;
                    try { this._db.run(idxSql); } catch (e) { /* index may already exist */ }
                } else if (typeof idx === 'object') {
                    const cols = idx.cols.map(quoteColumn).join(', ');
                    const idxSql = `CREATE INDEX IF NOT EXISTS ${idx.name} ON ${quoteColumn(name)} (${cols})`;
                    try { this._db.run(idxSql); } catch (e) { /* index may already exist */ }
                }
            }
        }
    }

    // Expose tables as properties — same as Dexie's `db.objects`, `db.links`, etc.
    get objects() { return this._table('objects'); }
    get links() { return this._table('links'); }
    get media() { return this._table('media'); }
    get pendingChanges() { return this._table('pendingChanges'); }
    get syncMetadata() { return this._table('syncMetadata'); }
    get external_links() { return this._table('external_links'); }

    _table(name) {
        if (!this._tables[name]) {
            const def = TABLE_DEFS[name];
            if (!def) throw new Error(`Unknown table: ${name}`);
            this._tables[name] = new Table(name, def, this);
        }
        return this._tables[name];
    }

    // Transaction wrapper — SQLite runs each statement in auto-commit by default,
    // so BEGIN/COMMIT gives us atomicity for multi-statement operations.
    async transaction(mode, tables, fn) {
        this._db.run('BEGIN');
        try {
            await fn();
            this._db.run('COMMIT');
        } catch (e) {
            this._db.run('ROLLBACK');
            throw e;
        }
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    _run(sql, params = []) {
        this._db.run(sql, params);
    }

    _execPrepared(sql, params = []) {
        if (!this._prepCache.has(sql)) {
            this._prepCache.set(sql, this._db.prepare(sql));
        }
        const stmt = this._prepCache.get(sql);
        stmt.reset();
        if (params.length > 0) {
            stmt.bind(params);
        }
        return stmt;
    }

    _stmtToObjects(stmt, tableName) {
        const rows = [];
        if (!this._colNames[tableName]) {
            const def = TABLE_DEFS[tableName];
            this._colNames[tableName] = def.columns.map(c => c.split(' ')[0].replace(/"/g, ''));
        }
        const columnNames = this._colNames[tableName];
        while (stmt.step()) {
            const raw = stmt.getAsObject();
            const obj = {};
            for (const key of Object.keys(raw)) {
                obj[key] = deserializeValue(raw[key]);
            }
            rows.push(obj);
        }
        return rows;
    }

    _getLastInsertId() {
        const stmt = this._execPrepared('SELECT last_insert_rowid() as id');
        stmt.step();
        const row = stmt.getAsObject();
        return row.id;
    }

    // Mark the database as dirty (in-memory data diverged from disk).
    // The auto-save timer picks this up within ~2 seconds.
    _markDirty() {
        this._dirty = true;
    }

    // Start the periodic auto-save timer (2-second interval). Persists
    // dirty data to disk so the SQLite file stays reasonably current.
    //
    // NOTE: sql.js's export() finalizes ALL prepared statements and
    // reopens the database. We must clear the statement cache after
    // every export so the next query re-prepares from the new handle.
    _startAutoSave() {
        if (this._autoSaveTimer) return;
        this._autoSaveTimer = setInterval(() => {
            if (!this._dirty || !this._fileIO) return;
            this._dirty = false;
            try {
                const data = this._db.export();
                // export() freed all statements — clear cache so stale
                // Statement objects aren't reused (throws "Statement closed")
                this._prepCache.clear();
                this._fileIO.write(data).catch(() => { this._dirty = true; });
            } catch (e) {
                this._dirty = true;
            }
        }, 2000);
        // Don't prevent Node.js/vitest from exiting
        if (this._autoSaveTimer.unref) {
            this._autoSaveTimer.unref();
        }
    }

    // Persist the database to disk immediately.
    // Note: sql.js's export() finalizes all prepared statements, so the
    // statement cache must be cleared.
    async save() {
        if (!this._fileIO) return;
        this._dirty = false;
        const data = this._db.export();
        this._prepCache.clear();
        await this._fileIO.write(data);
    }

    // Close the database (flush pending writes, free cached statements)
    async close() {
        if (this._autoSaveTimer) {
            clearInterval(this._autoSaveTimer);
            this._autoSaveTimer = null;
        }
        if (this._fileIO) {
            const data = this._db.export();
            await this._fileIO.write(data);
        }
        this._dirty = false;
        for (const stmt of this._prepCache.values()) {
            stmt.free();
        }
        this._prepCache.clear();
        if (this._db) {
            this._db.close();
            this._db = null;
        }
        this._ready = false;
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function quoteColumn(name) {
    // Map Dexie compound index names like 'one_thing_id+link_type_id+other_thing_id'
    // to their first column for SQL (compound indexes are pre-created)
    if (name.includes('+')) {
        return `"${name.split('+')[0]}"`;
    }
    return `"${name}"`;
}

function mapDexieIndexToColumn(index) {
    if (index === 'id') return 'id';
    return index;
}

// Serialize values for SQLite: objects/arrays → JSON string, booleans → 0/1
function serializeValue(val) {
    if (val === undefined || val === null) return null;
    if (typeof val === 'object' && !(val instanceof Date)) {
        return JSON.stringify(val);
    }
    if (typeof val === 'boolean') return val ? 1 : 0;
    return val;
}

// Deserialize values from SQLite: JSON strings → objects
function deserializeValue(val) {
    if (val === null || val === undefined) return undefined;
    if (typeof val === 'string') {
        // Try parsing as JSON for known JSON fields
        if ((val.startsWith('{') && val.endsWith('}')) ||
            (val.startsWith('[') && val.endsWith(']'))) {
            try {
                return JSON.parse(val);
            } catch (e) {
                return val;
            }
        }
        return val;
    }
    return val;
}