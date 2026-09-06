// Shared logic for grouping chronologically-sorted lists by calendar date and
// rendering a one-line divider at each group boundary:
//
//     📅 2024-05-05 ────────── May 2024 ──────────      (first divider of a month)
//     📅 2024-05-12 ─────────────────────────────────   (later day within May)
//
// Used by the main search results (Search.vue) and the related-links list on
// the object page (Object.vue). The object's own date moves onto the divider,
// so the per-object date rows are dropped (saves vertical space).
import { FlexibleDate } from './flexibleDate.js';

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * Split a DB-canonical start value into a grouping bucket at the finest
 * precision the value actually carries: day-precision values group by exact
 * day (times folded), month/year-precision values group by their own bucket.
 *
 * Returns { key, coarse, precision } or null when the value cannot be parsed.
 * `coarse` is the month (or year) key used to decide whether the month/year
 * label should be centered on the divider line.
 */
export function dateBucket(start) {
    if (start === null || start === undefined || start === '') return null;
    const s = String(start);
    const c = FlexibleDate.componentsFromCanonical(s);
    if (!c) return null;
    const p = FlexibleDate.precisionFromValue(s);
    if (p === 'year') return { key: 'y' + c.y, coarse: 'y' + c.y, precision: 'year' };
    if (p === 'month') return { key: 'm' + c.y + '-' + pad2(c.m), coarse: 'm' + c.y + '-' + pad2(c.m), precision: 'month' };
    return {
        key: 'd' + c.y + '-' + pad2(c.m) + '-' + pad2(c.d),
        coarse: 'm' + c.y + '-' + pad2(c.m),
        precision: 'day',
    };
}

/**
 * Build a divider descriptor array parallel to `items`.
 *
 * A descriptor (non-null) means a divider line precedes items[i]. The opener
 * (first item of its day/coarse group) is what supplies the date shown at the
 * left of the line. `firstOfMonth` is true only on the first divider whose
 * month/year differs from the previous one — the caller renders the centered
 * month label there. `seam` marks the past/future transition.
 *
 * @param {Array} items  chronologically sorted list (desc is fine)
 * @param {object} opts
 * @param {(item:any)=>string|null} [opts.startOf]      accessor for the date value
 * @param {(item:any)=>boolean}      [opts.futureOf]    future-detector for seams
 */
export function buildDateGroupDividers(items, { startOf = (it) => it.start, futureOf = () => false } = {}) {
    const dividers = new Array(items.length).fill(null);
    let lastBucket = null;
    let lastCoarse = null;
    let lastFuture = null;

    items.forEach((item, i) => {
        const future = !!futureOf(item);
        const bucket = dateBucket(startOf(item));
        const seam = lastFuture !== null && future !== lastFuture;

        if (seam) {
            // Divider at the boundary between the past and future sections.
            dividers[i] = { bucket, future, seam: true, enteringFuture: future, firstOfMonth: false };
            lastFuture = future;
            lastBucket = bucket ? bucket.key : null;
            lastCoarse = bucket ? bucket.coarse : null;
            return;
        }
        lastFuture = future;
        if (!bucket) return; // undated items get no divider

        const newBucket = bucket.key !== lastBucket;
        const firstOfMonth = bucket.coarse !== lastCoarse;
        if (newBucket || firstOfMonth) {
            dividers[i] = { bucket, future, seam: false, enteringFuture: future, firstOfMonth };
            lastBucket = bucket.key;
            lastCoarse = bucket.coarse;
        }
    });
    return dividers;
}
