// resources/js/utils/flexibleDate.js
//
// Mirrors app/Models/Data/FlexibleDate.php — a flexible date: a sortable
// canonical value (padded numeric digit string, YmdHis encoding, BC via
// leading '-') plus display metadata (qualifier, precision, era, alternatives,
// comment). Must stay in sync with the PHP implementation.

import { dateToDb } from '@/utils/dateUtils'
import { Era } from '@/constants/eras'

// Engine-bound module: the UI-facing formatters must not reach into the app's
// vue-i18n. The app registers a locale provider at bootstrap
// (setFlexibleDateLocaleProvider), so this file stays free of app imports.
let _localeProvider = null

export function setFlexibleDateLocaleProvider(provider) {
    _localeProvider = provider
}

function currentLocale() {
    return _localeProvider ? _localeProvider() : 'en'
}

export const QUALIFIER_EXACT = 'exact'
export const QUALIFIER_APPROX = 'approx'
export const QUALIFIER_BEFORE = 'before'
export const QUALIFIER_AFTER = 'after'
export const QUALIFIER_BETWEEN = 'between'
export const QUALIFIER_ALTERNATIVES = 'alternatives'
export const QUALIFIER_UNKNOWN = 'unknown'
export const QUALIFIERS = [
    QUALIFIER_EXACT, QUALIFIER_APPROX, QUALIFIER_BEFORE, QUALIFIER_AFTER,
    QUALIFIER_BETWEEN, QUALIFIER_ALTERNATIVES, QUALIFIER_UNKNOWN,
]

export const PRECISION_YEAR = 'year'
export const PRECISION_MONTH = 'month'
export const PRECISION_DAY = 'day'
export const PRECISION_MINUTE = 'minute'
export const PRECISION_SECOND = 'second'
export const PRECISIONS = [PRECISION_YEAR, PRECISION_MONTH, PRECISION_DAY, PRECISION_MINUTE, PRECISION_SECOND]

const QUALIFIER_PREFIXES = [
    [/^(?:circa|approx|approximate|around|about)\s+(.+)$/iu, QUALIFIER_APPROX],
    [/^(?:около|примерно|приблизительно|прибл\.?)\s+(.+)$/iu, QUALIFIER_APPROX],
    [/^~\s*(.+)$/iu, QUALIFIER_APPROX],
    [/^before\s+(.+)$/iu, QUALIFIER_BEFORE],
    [/^до\s+(.+)$/iu, QUALIFIER_BEFORE],
    [/^after\s+(.+)$/iu, QUALIFIER_AFTER],
    [/^после\s+(.+)$/iu, QUALIFIER_AFTER],
]

const ERA_MARKERS = [
    ['от сотворения мира', Era.WORLD_CREATION],
    ['от с.м.', Era.WORLD_CREATION],
    ['анно мунди', Era.WORLD_CREATION],
    ['старый стиль', Era.JULIAN],
    ['по старому стилю', Era.JULIAN],
    ['ст.ст.', Era.JULIAN],
    ['ст ст', Era.JULIAN],
    ['юлианский', Era.JULIAN],
    ['julian', Era.JULIAN],
    ['old style', Era.JULIAN],
    ['хиджра', Era.HIJRI],
    ['исламский', Era.HIJRI],
    ['hijri', Era.HIJRI],
    ['еврейский', Era.HEBREW],
    ['иудейский', Era.HEBREW],
    ['ивр.', Era.HEBREW],
    ['hebrew', Era.HEBREW],
]

function pad2(n) {
    return String(n).padStart(2, '0')
}

export class FlexibleDate {
    constructor() {
        this.qualifier = QUALIFIER_EXACT
        this.era = Era.GREGORIAN
        this.precision = PRECISION_YEAR
        this.value = null
        this.endValue = null
        this.alternatives = []
        this.comment = null
        this.original = null
        this.degrade = false
        this.fuzz = null  // uncertainty margin: { value, unit } e.g. { 2, 'year' } → ±2 years
    }

    toArray() {
        const out = {}
        if (this.qualifier !== null) out.qualifier = this.qualifier
        if (this.era !== null) out.era = this.era
        if (this.precision !== null) out.precision = this.precision
        if (this.alternatives.length) out.alternatives = [...this.alternatives]
        if (this.comment !== null && this.comment !== '') out.comment = this.comment
        if (this.original !== null && this.original !== '') out.original = this.original
        if (this.degrade) out.degrade = true
        if (this.fuzz && this.fuzz.value != null && this.fuzz.value !== '') {
            out.fuzz = { value: Number(this.fuzz.value), unit: this.fuzz.unit || 'year' }
        }
        return out
    }

    static fromArray(data) {
        if (!data || typeof data !== 'object') return null
        const d = new FlexibleDate()
        d.qualifier = QUALIFIERS.includes(data.qualifier) ? data.qualifier : QUALIFIER_EXACT
        d.era = Era.isValid(data.era) ? data.era : Era.GREGORIAN
        d.precision = PRECISIONS.includes(data.precision) ? data.precision : PRECISION_DAY
        d.value = data.value != null ? String(data.value) : null
        d.endValue = data.endValue != null ? String(data.endValue) : null
        d.alternatives = (data.alternatives || []).map(String)
        d.comment = data.comment ?? null
        d.original = data.original ?? null
        d.degrade = !!data.degrade
        d.fuzz = (data.fuzz && data.fuzz.value != null && data.fuzz.value !== '')
            ? { value: Number(data.fuzz.value), unit: data.fuzz.unit || 'year' }
            : null
        return d
    }

    static parse(input, defaultEra = null) {
        const original = String(input || '').trim()
        if (original === '') return null
        const text = original.toLowerCase()

        const d = new FlexibleDate()
        d.original = original
        d.era = (defaultEra !== null && Era.isValid(defaultEra)) ? defaultEra : Era.GREGORIAN

        if (['unknown', '?', 'н/д', 'неизвестно'].includes(text)) {
            d.qualifier = QUALIFIER_UNKNOWN
            return d
        }

        // Alternatives: "A or B or C"
        const parts = text.split(/\s+(?:or|или)\s+/u)
        if (parts.length > 1) {
            d.qualifier = QUALIFIER_ALTERNATIVES
            let precision = null
            for (const part of parts) {
                const res = FlexibleDate._canonicalFromDateTextInner(part, d.era)
                if (res === null) return null
                d.alternatives.push(res.canonical)
                d.era = res.era
                precision = maxPrecision(precision, res.precision)
            }
            const vals = d.alternatives.filter((v) => v !== null)
            if (vals.length) {
                const sorted = vals.slice().sort((a, b) => bccomp(a, b))
                d.value = sorted[0]
                d.endValue = sorted[sorted.length - 1]
            }
            d.precision = precision || PRECISION_DAY
            return d
        }

        // Between: "between A and B" / "между A и B"
        let m = text.match(/^between\s+(.+?)\s+and\s+(.+)$/u) || text.match(/^между\s+(.+?)\s+и\s+(.+)$/u)
        if (m) {
            d.qualifier = QUALIFIER_BETWEEN
            const r1 = FlexibleDate._canonicalFromDateTextInner(m[1], d.era)
            if (!r1) return null
            const r2 = FlexibleDate._canonicalFromDateTextInner(m[2], r1.era)
            if (!r2) return null
            d.era = r2.era
            d.value = r1.canonical
            d.endValue = r2.canonical
            d.precision = maxPrecision(r1.precision, r2.precision)
            return d
        }

        // Qualifier prefix
        for (const [regex, qualifier] of QUALIFIER_PREFIXES) {
            m = text.match(regex)
            if (m) {
                d.qualifier = qualifier
                const r = FlexibleDate._canonicalFromDateTextInner(m[1], d.era)
                if (!r) return null
                d.era = r.era
                d.value = r.canonical
                d.precision = r.precision || PRECISION_DAY
                return d
            }
        }

        // Bare date
        const r = FlexibleDate._canonicalFromDateTextInner(text, d.era)
        if (!r) return null
        d.era = r.era
        d.value = r.canonical
        d.precision = r.precision || PRECISION_DAY
        return d
    }

    static _canonicalFromDateTextInner(text, startEra) {
        text = String(text || '').trim()
        if (text === '') return null
        let era = startEra || Era.GREGORIAN

        let bc = false
        if (/(?:^|\s)(?:до н\.?э\.?|bc|b\.c\.)(?:$|\s)/iu.test(text)) {
            bc = true
            text = text.replace(/(?:^|\s)(?:до н\.?э\.?|bc|b\.c\.)(?:$|\s)/iu, ' ').trim()
        }
        if (/(?:^|\s)(?:н\.э\.?|ad|a\.d\.)(?:$|\s)/iu.test(text)) {
            text = text.replace(/(?:^|\s)(?:н\.э\.?|ad|a\.d\.)(?:$|\s)/iu, ' ').trim()
        }
        for (const [marker, targetEra] of ERA_MARKERS) {
            if (text.includes(marker)) {
                era = targetEra
                text = text.replace(marker, '').trim()
                break
            }
        }
        if (/(?:^|\s)am(?:$|\s)/iu.test(text)) {
            era = Era.WORLD_CREATION
            text = text.replace(/(?:^|\s)am(?:$|\s)/iu, ' ').trim()
        } else if (/(?:^|\s)ah(?:$|\s)/iu.test(text)) {
            era = Era.HIJRI
            text = text.replace(/(?:^|\s)ah(?:$|\s)/iu, ' ').trim()
        }

        const components = parseDateComponents(text)
        if (components === null) return null
        if (bc) components.y = -components.y
        const canonical = canonicalFromComponents(components.y, components.m, components.d, components.h, components.mi, components.s, era)
        if (canonical === null) return null
        return { canonical, era, precision: components.precision }
    }

    static componentsFromCanonical(value) {
        if (value === null || value === undefined || value === '') return null
        let number = String(value)
        const bc = number.startsWith('-')
        if (bc) number = number.slice(1)
        let year, m, d, h, mi, s
        if (number.length >= 11) {
            // Canonical encoding (the engine's own read-back rule): a variable-
            // length year followed by an EXACTLY 10-digit MMDDHHMMSS tail. The
            // year is everything except the last 10 digits, so a year-1 date
            // stored as `10101000000` (leading zeros stripped by the numeric
            // column) parses back to year 1, not year 1010.
            const yearLen = number.length - 10
            year = parseInt(number.slice(0, yearLen), 10)
            const rest = number.slice(-10)
            m = parseInt(rest.slice(0, 2), 10)
            d = parseInt(rest.slice(2, 4), 10)
            h = parseInt(rest.slice(4, 6), 10)
            mi = parseInt(rest.slice(6, 8), 10)
            s = parseInt(rest.slice(8, 10), 10)
        } else {
            // Legacy unpadded values (e.g. '2026081112' = 2026-08-11 12:00) are
            // a 4-digit year followed by 2-digit groups. None should remain
            // after the backfill migration; kept as a defensive fallback.
            const parts = splitDigitDate(number)
            year = parseInt(parts.y, 10)
            m = parseInt(parts.mo, 10)
            d = parseInt(parts.d, 10)
            h = parseInt(parts.h, 10)
            mi = parseInt(parts.mi, 10)
            s = parseInt(parts.s, 10)
        }
        if (bc) {
            h = 23 - h
            mi = 59 - mi
            s = 59 - s
        }
        // Guard against malformed legacy canonicals (e.g. a huge BC year stored
        // with an invalid 24:60:60 tail): clamp out-of-range parts so the
        // display never renders negative/huge time values.
        if (m < 1 || m > 12) m = 1
        if (d < 1 || d > 31) d = 1
        if (h < 0 || h > 23) h = 0
        if (mi < 0 || mi > 59) mi = 0
        if (s < 0 || s > 59) s = 0
        return {
            y: bc ? -year : year,
            m, d, h, mi, s,
        }
    }

    // Re-encode a stored canonical into its canonical padded form, fixing any
    // malformed parts (e.g. a huge BC year stored with an invalid 24:60:60
    // tail). Returns the corrected value, or the input unchanged if already
    // canonical / unparseable. Idempotent.
    static sanitizeCanonical(value) {
        if (value === null || value === undefined || value === '') return value
        const c = FlexibleDate.componentsFromCanonical(value)
        if (!c) return value
        const reencoded = canonicalFromComponents(c.y, c.m, c.d, c.h, c.mi, c.s, Era.GREGORIAN)
        return reencoded ?? value
    }

    static precisionFromValue(value) {
        if (value === null || value === undefined || value === '') return null
        const bc = String(value).startsWith('-')
        const digits = String(value).replace(/^-/, '')
        const len = digits.length
        // Canonical values (≥ 11 digits: variable year + 10-digit tail) are
        // always padded to seconds, so the finest precision actually encoded
        // is inferred from the trailing groups: a day-precision date has a
        // 000000 time tail, a month one has day=01, a year one day=01+month=01.
        // BC dates store an inverted clock, so un-invert before inspecting.
        if (len >= 11) {
            const tail = digits.slice(-10)
            let m = parseInt(tail.slice(0, 2), 10)
            let d = parseInt(tail.slice(2, 4), 10)
            let h = parseInt(tail.slice(4, 6), 10)
            let mi = parseInt(tail.slice(6, 8), 10)
            let s = parseInt(tail.slice(8, 10), 10)
            if (bc) { h = 23 - h; mi = 59 - mi; s = 59 - s }
            // Malformed legacy values (invalid time parts) infer as coarser.
            if (m < 1 || m > 12) m = 1
            if (d < 1 || d > 31) d = 1
            if (h < 0 || h > 23) h = 0
            if (mi < 0 || mi > 59) mi = 0
            if (s < 0 || s > 59) s = 0
            if (s !== 0) return PRECISION_SECOND
            if (mi !== 0 || h !== 0) return PRECISION_MINUTE
            if (d !== 1) return PRECISION_DAY
            if (m !== 1) return PRECISION_MONTH
            return PRECISION_YEAR
        }
        if (len <= 4) return PRECISION_YEAR
        const n = Math.floor((digits.slice(4).length + 1) / 2)
        if (n === 1) return PRECISION_MONTH
        if (n === 2) return PRECISION_DAY
        if (n === 3 || n === 4) return PRECISION_MINUTE
        return PRECISION_SECOND
    }

    toDb(side = 'start') {
        let start = null
        let end = null
        switch (this.qualifier) {
            case QUALIFIER_UNKNOWN:
                break
            case QUALIFIER_BEFORE:
                end = this.value
                break
            case QUALIFIER_AFTER:
                start = this.value
                break
            case QUALIFIER_BETWEEN:
            case QUALIFIER_ALTERNATIVES:
                start = this.value
                end = this.endValue
                break
            default:
                if (side === 'start') start = this.value
                else end = this.value
                break
        }
        return { start, end, meta: this.toArray() }
    }

    format() {
        const meta = this.toArray()
        switch (this.qualifier) {
            case QUALIFIER_BEFORE:
                return FlexibleDate.formatPair(null, this.value, meta, meta)
            case QUALIFIER_AFTER:
                return FlexibleDate.formatPair(this.value, null, meta, meta)
            default:
                return FlexibleDate.formatPair(this.value, this.endValue, meta, meta)
        }
    }

    static formatBound(value, meta) {
        if (value === null || value === undefined || value === '') return ''
        const c = FlexibleDate.componentsFromCanonical(value)
        if (!c) return value
        const precision = (meta && meta.precision) || FlexibleDate.precisionFromValue(value) || PRECISION_DAY
        const era = (meta && meta.era) || Era.GREGORIAN
        let y = c.y
        let m = c.m
        let d = c.d
        let eraSuffix = ''
        if (era !== Era.GREGORIAN && !(meta && meta.degrade)) {
            const conv = Era.fromCanonical(era, y, m, d)
            y = conv.year
            m = conv.month
            d = conv.day
            eraSuffix = ' (' + era + ')'
        }
        const bc = y < 0
        const abs = Math.abs(y)
        const yearPart = bc ? '-' + abs : abs
        let s
        switch (precision) {
            case PRECISION_YEAR:
                s = bc ? abs + ' BC' : String(abs)
                break
            case PRECISION_MONTH:
                s = yearPart + '-' + pad2(m)
                break
            case PRECISION_MINUTE:
                s = yearPart + '-' + pad2(m) + '-' + pad2(d) + ' ' + pad2(c.h) + ':' + pad2(c.mi)
                break
            case PRECISION_SECOND:
                s = yearPart + '-' + pad2(m) + '-' + pad2(d) + ' ' + pad2(c.h) + ':' + pad2(c.mi) + ':' + pad2(c.s)
                break
            default:
                s = yearPart + '-' + pad2(m) + '-' + pad2(d)
                break
        }
        return s + eraSuffix
    }

    static formatPair(start, end, startMeta, endMeta) {
        const sm = startMeta && typeof startMeta === 'object' ? startMeta : {}
        const em = endMeta && typeof endMeta === 'object' ? endMeta : {}
        const qualifier = sm.qualifier || em.qualifier || QUALIFIER_EXACT

        if (qualifier === QUALIFIER_BETWEEN && start !== null && start !== undefined && end !== null && end !== undefined) {
            return 'between ' + FlexibleDate.formatBound(start, sm) + ' and ' + FlexibleDate.formatBound(end, sm)
        }
        if (qualifier === QUALIFIER_ALTERNATIVES) {
            const alts = sm.alternatives || []
            return alts.map((a) => FlexibleDate.formatBound(String(a), sm)).join(' or ')
        }
        if (qualifier === QUALIFIER_BEFORE && end !== null && end !== undefined) {
            return 'before ' + FlexibleDate.formatBound(end, em && em.qualifier ? em : sm)
        }
        if (qualifier === QUALIFIER_AFTER && start !== null && start !== undefined) {
            return 'after ' + FlexibleDate.formatBound(start, sm)
        }
        if (qualifier === QUALIFIER_UNKNOWN) {
            return 'unknown'
        }
        const s = start !== null && start !== undefined ? FlexibleDate.formatBound(start, sm) : ''
        const e = end !== null && end !== undefined ? FlexibleDate.formatBound(end, em) : ''
        if (s !== '' && e !== '') return s + ' — ' + e
        if (qualifier === QUALIFIER_APPROX) {
            return 'circa ' + (s !== '' ? s : e)
        }
        return s !== '' ? s : e
    }
}

// ─── Localized display (i18n-aware) ───
// `t` is a vue-i18n translate function (e.g. $t or i18n.global.t).

export function formatBoundLocalized(value, meta, t) {
    if (value === null || value === undefined || value === '') return ''
    let s = FlexibleDate.formatBound(value, meta || {})
    const eraKey = (meta && meta.era) || Era.GREGORIAN
    if (eraKey !== Era.GREGORIAN) {
        s = s.replace(/\s*\(world_creation\)$/, ' (' + t('era.world_creation') + ')')
        s = s.replace(/\s*\(julian\)$/, ' (' + t('era.julian') + ')')
        s = s.replace(/\s*\(hijri\)$/, ' (' + t('era.hijri') + ')')
        s = s.replace(/\s*\(hebrew\)$/, ' (' + t('era.hebrew') + ')')
    }
    if (/ BC$/.test(s)) s = s.replace(/ BC$/, ' ' + t('dates.bc'))
    if (meta && meta.fuzz) {
        const f = formatFuzz(meta.fuzz, t)
        if (f) s = s + ' ' + f
    }
    return s
}

// ─── Uncertainty margin ("fuzz") ───
// Legacy start_variety/end_variety columns encoded this as an opaque number;
// the flexible-date meta stores it structured as { value, unit }.

const FUZZ_UNIT_ALIASES = {
    year: 'year', years: 'year', y: 'year', 'г': 'year', 'год': 'year', 'года': 'year', 'лет': 'year',
    month: 'month', months: 'month', 'мес': 'month', 'мес.': 'month', 'месяц': 'month', 'месяца': 'month', 'месяцев': 'month',
    day: 'day', days: 'day', d: 'day', 'дн': 'day', 'дн.': 'day', 'день': 'day', 'дня': 'day', 'дней': 'day',
    hour: 'hour', hours: 'hour', h: 'hour', 'ч': 'hour', 'час': 'hour', 'часа': 'hour', 'часов': 'hour',
    minute: 'minute', minutes: 'minute', min: 'minute', 'мин': 'minute', 'мин.': 'minute', 'минута': 'minute', 'минуты': 'minute', 'минут': 'minute',
    second: 'second', seconds: 'second', sec: 'second', 'сек': 'second', 'сек.': 'second', 'секунда': 'second', 'секунды': 'second', 'секунд': 'second',
}

export function parseFuzz(text) {
    const s = String(text || '').trim().replace(/^±\s*/u, '')
    if (s === '') return null
    const m = s.match(/^(\d{1,4})\s*(.+)$/)
    if (!m) return null
    const unit = FUZZ_UNIT_ALIASES[m[2].toLowerCase()]
    if (!unit) return null
    const value = parseInt(m[1], 10)
    if (!Number.isFinite(value) || value <= 0 || value > 9999) return null
    return { value, unit }
}

function pluralRu(n, one, few, many) {
    const n10 = n % 10
    const n100 = n % 100
    if (n10 === 1 && n100 !== 11) return one
    if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few
    return many
}

const RU_FUZZ_FORMS = {
    year: ['год', 'года', 'лет'],
    month: ['месяц', 'месяца', 'месяцев'],
    day: ['день', 'дня', 'дней'],
    hour: ['час', 'часа', 'часов'],
    minute: ['минута', 'минуты', 'минут'],
    second: ['секунда', 'секунды', 'секунд'],
}

export function formatFuzz(fuzz, t) {
    if (!fuzz || fuzz.value == null || fuzz.value === '') return ''
    const n = Number(fuzz.value)
    if (!Number.isFinite(n) || n <= 0) return ''
    const unit = RU_FUZZ_FORMS[fuzz.unit] ? fuzz.unit : 'year'
    if (currentLocale() === 'ru') {
        const [one, few, many] = RU_FUZZ_FORMS[unit]
        return '±' + n + ' ' + pluralRu(n, one, few, many)
    }
    const label = t('dates.fuzz.' + unit)
    return '±' + n + ' ' + label + (n === 1 ? '' : 's')
}

export function formatLocalized(start, end, startMeta, endMeta, t) {
    const sm = startMeta && typeof startMeta === 'object' ? startMeta : {}
    const em = endMeta && typeof endMeta === 'object' ? endMeta : {}
    const qualifier = sm.qualifier || em.qualifier || QUALIFIER_EXACT
    const fmt = (v, meta) => formatBoundLocalized(v, meta, t)

    if (qualifier === QUALIFIER_BETWEEN && start !== null && start !== undefined && end !== null && end !== undefined) {
        return t('dates.between') + ' ' + fmt(start, sm) + ' ' + t('dates.and') + ' ' + fmt(end, sm)
    }
    if (qualifier === QUALIFIER_ALTERNATIVES) {
        const alts = sm.alternatives || []
        return alts.map((a) => fmt(String(a), sm)).join(' ' + t('dates.or') + ' ')
    }
    if (qualifier === QUALIFIER_BEFORE && end !== null && end !== undefined) {
        return t('dates.before') + ' ' + fmt(end, em && em.qualifier ? em : sm)
    }
    if (qualifier === QUALIFIER_AFTER && start !== null && start !== undefined) {
        return t('dates.after') + ' ' + fmt(start, sm)
    }
    if (qualifier === QUALIFIER_UNKNOWN) {
        return t('dates.unknown')
    }
    const s = start !== null && start !== undefined ? fmt(start, sm) : ''
    const e = end !== null && end !== undefined ? fmt(end, em) : ''
    if (s !== '' && e !== '') {
        // Identical bounds (e.g. a single exact date stored in both columns)
        // have nothing to compare — show the date once.
        if (s === e) return s
        return s + ' — ' + e
    }
    if (qualifier === QUALIFIER_APPROX) {
        return t('dates.circa') + ' ' + (s !== '' ? s : e)
    }
    return s !== '' ? s : e
}

// Compact form for result lists: when two EXACT bounds fall on the same
// calendar date and only the times differ, collapse to "DATE HH:MM → HH:MM"
// (e.g. "2026-08-11 12:00 → 22:00") instead of repeating the date twice.
export function formatRangeShort(start, end, startMeta, endMeta, t) {
    if (start === null || start === undefined || start === '' || end === null || end === undefined || end === '') {
        return formatLocalized(start, end, startMeta, endMeta, t)
    }
    const sm = startMeta && typeof startMeta === 'object' ? startMeta : {}
    const em = endMeta && typeof endMeta === 'object' ? endMeta : {}
    const qualifier = sm.qualifier || em.qualifier || QUALIFIER_EXACT
    if (qualifier === QUALIFIER_EXACT && !sm.fuzz && !em.fuzz) {
        const cs = FlexibleDate.componentsFromCanonical(start)
        const ce = FlexibleDate.componentsFromCanonical(end)
        const hasTime = (p) => p === PRECISION_MINUTE || p === PRECISION_SECOND
        if (
            cs && ce
            && cs.y === ce.y && cs.m === ce.m && cs.d === ce.d
            && hasTime(FlexibleDate.precisionFromValue(start))
            && hasTime(FlexibleDate.precisionFromValue(end))
        ) {
            const pad = (n) => String(n).padStart(2, '0')
            const ps = FlexibleDate.precisionFromValue(start)
            const pe = FlexibleDate.precisionFromValue(end)
            const timeOf = (c, p) => {
                const t1 = pad(c.h) + ':' + pad(c.mi)
                return (p === PRECISION_SECOND && c.s !== 0)
                    ? t1 + ':' + pad(c.s)
                    : t1
            }
            const t1 = timeOf(cs, ps)
            const t2 = timeOf(ce, pe)
            if (t1 !== t2) {
                const dateStr = formatBoundLocalized(start, { ...sm, precision: PRECISION_DAY }, t)
                return dateStr + ' ' + t1 + ' → ' + t2
            }
        }
    }
    return formatLocalized(start, end, startMeta, endMeta, t)
}

function maxPrecision(a, b) {
    const rank = {}
    PRECISIONS.forEach((p, i) => { rank[p] = i })
    const ra = a != null ? (rank[a] ?? 0) : 0
    const rb = b != null ? (rank[b] ?? 0) : 0
    return PRECISIONS[Math.max(ra, rb)]
}

// String-compare two canonical digit strings numerically (like PHP bccomp).
function bccomp(a, b) {
    const an = BigInt(a)
    const bn = BigInt(b)
    return an === bn ? 0 : (an > bn ? 1 : -1)
}

function parseDateComponents(text) {
    text = String(text || '').trim()
    let m = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{1,4})(?:[ T](\d{1,2}):(\d{2}))?$/)
    if (m) {
        const precision = m[5] != null ? PRECISION_MINUTE : (m[4] != null ? PRECISION_MINUTE : PRECISION_DAY)
        return { y: parseInt(m[3], 10), m: parseInt(m[2], 10), d: parseInt(m[1], 10), h: parseInt(m[4] || 0, 10), mi: parseInt(m[5] || 0, 10), s: 0, precision }
    }
    // Digit date + space-separated time: "20260816 19:30" (also "20260816 19:30:45")
    m = text.match(/^(\d{8})\s+(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?$/)
    if (m) {
        const h = parseInt(m[2], 10)
        const mi = m[3] != null && m[3] !== '' ? parseInt(m[3], 10) : 0
        const s = m[4] != null && m[4] !== '' ? parseInt(m[4], 10) : 0
        if (h > 23 || mi > 59 || s > 59) return null
        const parts = splitDigitDate(m[1])
        const precision = m[4] != null && m[4] !== '' ? PRECISION_SECOND : PRECISION_MINUTE
        return { y: parseInt(parts.y, 10), m: parseInt(parts.mo, 10), d: parseInt(parts.d, 10), h, mi, s, precision }
    }
    // Year-first with standard delimiters: "2026-08", "2026-08-16", "2026/08/16",
    // "2026.08.16" (all optionally followed by a space/T-separated time).
    m = text.match(/^(-?\d+)[/.-](\d{1,2})(?:[/.-](\d{1,2}))?(?:[ T](\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?)?$/)
    if (m) {
        const month = parseInt(m[2], 10)
        const day = m[3] != null && m[3] !== '' ? parseInt(m[3], 10) : null
        if (month < 1 || month > 12 || (day !== null && (day < 1 || day > 31))) return null
        let precision
        if (m[6] != null && m[6] !== '') precision = PRECISION_SECOND
        else if (m[5] != null && m[5] !== '') precision = PRECISION_MINUTE
        else if (m[4] != null && m[4] !== '') precision = PRECISION_MINUTE
        else precision = day !== null ? PRECISION_DAY : PRECISION_MONTH
        return { y: parseInt(m[1], 10), m: month, d: day || 1, h: parseInt(m[4] || 0, 10), mi: parseInt(m[5] || 0, 10), s: parseInt(m[6] || 0, 10), precision }
    }
    // Space-separated year month day: "2026 08 15" (also "2026 08 15 19:30",
    // and "2026 08" for year+month).
    m = text.match(/^(-?\d+)\s+(\d{1,2})(?:\s+(\d{1,2}))?(?:\s+(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?)?$/)
    if (m) {
        const month = parseInt(m[2], 10)
        const day = m[3] != null && m[3] !== '' ? parseInt(m[3], 10) : null
        if (month < 1 || month > 12 || (day !== null && (day < 1 || day > 31))) return null
        let precision
        if (m[6] != null && m[6] !== '') precision = PRECISION_SECOND
        else if (m[5] != null && m[5] !== '') precision = PRECISION_MINUTE
        else if (m[4] != null && m[4] !== '') precision = PRECISION_MINUTE
        else precision = day !== null ? PRECISION_DAY : PRECISION_MONTH
        return { y: parseInt(m[1], 10), m: month, d: day || 1, h: parseInt(m[4] || 0, 10), mi: parseInt(m[5] || 0, 10), s: parseInt(m[6] || 0, 10), precision }
    }
    m = text.match(/^(-?\d+)$/)
    if (m) {
        const sign = m[1].startsWith('-') ? '-' : ''
        const digits = m[1].replace(/^-/, '')
        if (digits.length < 1 || digits.length > 14) return null
        // A 5–14-digit string that does not read as a valid YYYYMMDD… pattern is
        // a huge year (e.g. "13800000000000" = 13.8 trillion BC), NOT a 4-digit
        // year followed by time groups. Years with > 4 digits are year-precision.
        if (digits.length > 4) {
            const mo = parseInt(digits.slice(4, 6), 10)
            const day = digits.length > 6 ? parseInt(digits.slice(6, 8), 10) : 1
            const validYmd = (mo >= 1 && mo <= 12) && (day >= 1 && day <= 31)
            if (!validYmd) {
                return { y: parseInt(sign + digits, 10), m: 1, d: 1, h: 0, mi: 0, s: 0, precision: PRECISION_YEAR }
            }
        }
        const parts = splitDigitDate(digits)
        return { y: parseInt(sign + parts.y, 10), m: parseInt(parts.mo, 10), d: parseInt(parts.d, 10), h: parseInt(parts.h, 10), mi: parseInt(parts.mi, 10), s: parseInt(parts.s, 10), precision: parts.precision }
    }
    return null
}

function splitDigitDate(digits) {
    const len = digits.length
    if (len <= 4) {
        return { y: digits, mo: '01', d: '01', h: '0', mi: '0', s: '0', precision: PRECISION_YEAR }
    }
    if (len > 14) {
        return { y: digits, mo: '01', d: '01', h: '0', mi: '0', s: '0', precision: PRECISION_YEAR }
    }
    const year = digits.slice(0, 4)
    const rest = digits.slice(4)
    const g = []
    for (let i = 0; i < 5; i++) {
        g.push(rest.length >= (i + 1) * 2 ? rest.slice(i * 2, i * 2 + 2) : '')
    }
    const n = Math.floor((rest.length + 1) / 2)
    let precision = PRECISION_SECOND
    if (n === 1) precision = PRECISION_MONTH
    else if (n === 2) precision = PRECISION_DAY
    else if (n === 3 || n === 4) precision = PRECISION_MINUTE
    return {
        y: year, mo: g[0] !== '' ? g[0] : '01', d: g[1] !== '' ? g[1] : '01',
        h: g[2] !== '' ? g[2] : '0', mi: g[3] !== '' ? g[3] : '0', s: g[4] !== '' ? g[4] : '0',
        precision,
    }
}

function canonicalFromComponents(y, m, d, h, mi, s, era) {
    if (era !== Era.GREGORIAN) {
        const conv = Era.toCanonical(era, y, m, d)
        y = conv.year
        m = conv.month
        d = conv.day
    }
    const dateStr = String(y).padStart(4, '0') + '-' + pad2(m) + '-' + pad2(d) + ' ' + pad2(h) + ':' + pad2(mi) + ':' + pad2(s)
    try {
        return dateToDb(dateStr, 'UTC')
    } catch (e) {
        return null
    }
}
