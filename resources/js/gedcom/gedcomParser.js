// resources/js/gedcom/gedcomParser.js
//
// Pure GEDCOM 5.5.1 line parser — a direct mirror of the server-side
// redesigned importer's parser (app/Services/Importer/GedcomParser.php on the
// feature/gedcom branch). No fs, no IndexedDB, no framework: input is the
// whole file as a string, output is a tree of record nodes, so the same code
// runs in the offline app (WebView) and in the browser.
//
// Line grammar:   level [xref_id] TAG [value]
//   Level 0 starts a record (INDI, FAM, SOUR, …); deeper levels nest under it.
//   Structural records (HEAD, SUBM, SUBN) and the TRLR trailer are skipped —
//   HEAD metadata is exposed separately via parseHeadMetadata().

/** @typedef {{id:?string, tag:string, value:string, children:Array<object>}} GedcomNode */

/**
 * Parse raw GEDCOM text into level-0 record trees.
 * @param {string} gedcom
 * @returns {GedcomNode[]}
 */
export function parse(gedcom) {
    const records = [];
    const lines = String(gedcom || '').replace(/\r\n/g, '\n').split('\n');

    const stack = []; // stack[level] -> node (owner of children at that level)
    const LINE_RE = /^(\d+)\s*(@(\w+)@)?\s*(\w+)\s*(.*)$/s;

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (line === '' || line === '0 TRLR') continue;

        const m = line.match(LINE_RE);
        if (!m) continue;

        const level = parseInt(m[1], 10);
        const xrefId = m[2] ? m[2] : null; // e.g. "@I1@"
        const tag = m[4].toUpperCase();
        const value = (m[5] ?? '').trim();

        // Skip structural records — only data records are imported.
        if (level === 0 && (tag === 'HEAD' || tag === 'SUBM' || tag === 'SUBN')) continue;

        const node = { id: xrefId, tag, value, children: [] };

        if (level === 0) {
            records.push(node);
            stack.length = 0;
            stack[0] = node;
        } else {
            const parentLevel = level - 1;
            // Trim the stack down to the level just above this node.
            while (stack.length > parentLevel + 1) stack.pop();
            const parent = stack[parentLevel];
            if (parent) parent.children.push(node);
            stack[level] = node;
        }
    }

    return records;
}

/**
 * Parse metadata from the HEAD record.
 * @param {string} gedcom
 * @returns {{dbguid:?string, source_name:?string, source_fullname:?string, export_date:?string}}
 */
export function parseHeadMetadata(gedcom) {
    const result = {
        dbguid: null,
        source_name: null,
        source_fullname: null,
        export_date: null,
    };

    const lines = String(gedcom || '').replace(/\r\n/g, '\n').split('\n');
    const LINE_RE = /^(\d+)\s*(@(\w+)@)?\s*(\w+)\s*(.*)$/s;

    let inHead = false;
    let inSour = false;
    let sourLevel = 0;

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (line === '') continue;

        const m = line.match(LINE_RE);
        if (!m) continue;

        const level = parseInt(m[1], 10);
        const tag = m[4].toUpperCase();
        const value = (m[5] ?? '').trim();

        if (level === 0 && tag === 'HEAD') { inHead = true; continue; }
        if (level === 0 && inHead) break; // next level-0 record → HEAD is done

        if (tag === 'SOUR' && level === 1) {
            result.source_name = value || null;
            inSour = true;
            sourLevel = 1;
            continue;
        }
        if (inSour && level <= sourLevel) inSour = false;
        if (inSour && tag === 'NAME') result.source_fullname = value || null;

        if (tag === 'DATE' && level === 1) result.export_date = value || null;
        if (tag === '_DBGUID' && level === 1) result.dbguid = value || null;
    }

    return result;
}

/** Find the first child node with the given tag. */
export function findChild(node, tag) {
    for (const child of node.children || []) {
        if (child.tag === tag) return child;
    }
    return null;
}

/** Find all children with the given tag. */
export function findChildren(node, tag) {
    return (node.children || []).filter((c) => c.tag === tag);
}

/** Value of the first child with the given tag, else null. */
export function childValue(node, tag) {
    const child = findChild(node, tag);
    return child ? child.value : null;
}

/**
 * Concatenate a node's value with its CONT (newline) / CONC (concat) children.
 * @param {GedcomNode} node
 */
export function getFullValue(node) {
    let value = node.value;
    for (const child of node.children || []) {
        if (child.tag === 'CONT') value += '\n' + child.value;
        else if (child.tag === 'CONC') value += child.value;
    }
    return value;
}

const EN_MONTHS = {
    JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
    JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
};
const RU_MONTHS = {
    'ЯНВ': '01', 'ФЕВ': '02', 'МАР': '03', 'АПР': '04', 'МАЙ': '05',
    'ИЮН': '06', 'ИЮЛ': '07', 'АВГ': '08', 'СЕН': '09', 'ОКТ': '10',
    'НОЯ': '11', 'ДЕК': '12',
};

/**
 * Convert a bare GEDCOM date ("DD MMM YYYY", "MMM YYYY", "YYYY", RU months)
 * into ISO-like text that the project's FlexibleDate parser understands.
 */
export function convertGedcomDateToIso(date) {
    // DD MMM YYYY
    let m = date.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(-?\d{1,4})$/);
    if (m) {
        const month = EN_MONTHS[m[2].toUpperCase()] ?? null;
        if (month !== null) {
            const day = m[1].padStart(2, '0');
            return `${m[3]}-${month}-${day}`;
        }
    }
    // MMM YYYY
    m = date.match(/^([A-Za-z]{3})\s+(-?\d{1,4})$/);
    if (m) {
        const month = EN_MONTHS[m[1].toUpperCase()] ?? null;
        if (month !== null) return `${m[2]}-${month}`;
    }
    // YYYY
    m = date.match(/^(-?\d{1,4})$/);
    if (m) return m[1];
    // DD MON YYYY (Russian month abbreviations)
    m = date.match(/^(\d{1,2})\s+([А-ЯЁ]{3})\s+(-?\d{1,4})$/);
    if (m) {
        const month = RU_MONTHS[m[2].toUpperCase()] ?? null;
        if (month !== null) {
            const day = m[1].padStart(2, '0');
            return `${m[3]}-${month}-${day}`;
        }
    }
    return date;
}

/**
 * Convert any EN/RU month-word dates that remain inside a string ("12 APR 1856",
 * "ЯНВ 1856") into ISO numeric form, so the JS FlexibleDate parser (which only
 * understands digits/ISO, unlike the PHP one) can consume qualified strings
 * like "before 12 APR 1856" too.
 */
function isoifyDateWords(text) {
    return text
        .replace(/(\d{1,2})\s+([A-Za-zА-ЯЁ]{3})\s+(-?\d{1,4})/g, (all, day, mon, year) => {
            const mm = EN_MONTHS[mon.toUpperCase()] ?? RU_MONTHS[mon.toUpperCase()] ?? null;
            return mm !== null ? `${year}-${mm}-${day.padStart(2, '0')}` : all;
        })
        .replace(/(^|\s)([A-Za-zА-ЯЁ]{3})\s+(-?\d{1,4})(?=$|\s|[(),])/g, (all, lead, mon, year) => {
            const mm = EN_MONTHS[mon.toUpperCase()] ?? RU_MONTHS[mon.toUpperCase()] ?? null;
            return mm !== null ? `${lead}${year}-${mm}` : all;
        });
}

/**
 * Normalize a GEDCOM date string into text the FlexibleDate parser accepts
 * (mirror GedcomParser::parseGedcomDate): qualifier rewrites (ABT → "about",
 * BEF → "before", …) then month words → ISO numeric.
 * @param {?string} gedcomDate
 * @returns {?string}
 */
export function normalizeGedcomDate(gedcomDate) {
    if (!gedcomDate) return null;

    let text = String(gedcomDate).trim();

    const patterns = [
        [/^ABT\.?\s+(.+)$/i, 'about $1'],
        [/^APPROXIMATELY\s+(.+)$/i, 'about $1'],
        [/^BEF\.?\s+(.+)$/i, 'before $1'],
        [/^AFT\.?\s+(.+)$/i, 'after $1'],
        [/^BET\s+(.+)\s+AND\s+(.+)$/i, 'between $1 and $2'],
        [/^BET\s+(.+)\s+-\s+(.+)$/i, 'between $1 and $2'],
        [/^FROM\s+(.+)\s+TO\s+(.+)$/i, 'between $1 and $2'],
        [/^EST\s+(.+)$/i, 'about $1'],
        [/^CAL\s+(.+)$/i, 'about $1'],
        [/^INT\s+(.+?)\s*\((.+)\)\s*$/i, 'about $1 ($2)'],
    ];
    for (const [regex, replacement] of patterns) {
        const next = text.replace(regex, replacement);
        if (next !== text) return isoifyDateWords(next);
    }

    // Phrase parenthetical: "12 APR 1856 (certain)"
    let m = text.match(/^(.+?)\s*\((.+)\)\s*$/);
    if (m) return isoifyDateWords(`${m[1].trim()} (${m[2].trim()})`);

    return isoifyDateWords(convertGedcomDateToIso(text));
}

/**
 * Extract a place name from a PLAC node — the most specific (first
 * comma-separated) part of its value.
 * @param {GedcomNode} node
 */
export function extractPlaceName(node) {
    if (node.tag !== 'PLAC') return '';
    const value = String(node.value || '').trim();
    const parts = value.split(',');
    return (parts[0] || value).trim();
}

/**
 * Extract {lat, lng} from a PLAC node's MAP LATI/LONG child.
 * @param {GedcomNode} node
 * @returns {{lat:number, lng:number}|null}
 */
export function extractPlaceCoordinates(node) {
    const map = findChild(node, 'MAP');
    if (!map) return null;
    const lat = childValue(map, 'LATI');
    const lng = childValue(map, 'LONG');
    if (lat === null || lng === null) return null;

    const latVal = parseCoordinate(lat, ['N', 'S']);
    const lngVal = parseCoordinate(lng, ['E', 'W']);
    if (latVal === null || lngVal === null) return null;

    return { lat: latVal, lng: lngVal };
}

function parseCoordinate(raw, directions) {
    let value = String(raw || '').trim().toUpperCase();
    let sign = 1;

    // Direction suffix: "49.12345N"
    const last = value.slice(-1);
    if (directions.includes(last)) {
        value = value.slice(0, -1);
        if (last === directions[1]) sign = -1;
    }
    // Direction prefix: "N49.12345"
    else if (directions.includes(value.charAt(0))) {
        const dir = value.charAt(0);
        value = value.slice(1);
        if (dir === directions[1]) sign = -1;
    }

    const num = Number.parseFloat(value);
    if (Number.isNaN(num)) return null;
    return num * sign;
}
