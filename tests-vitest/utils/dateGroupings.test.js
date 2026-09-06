import { describe, it, expect } from 'vitest';
import { dateBucket, buildDateGroupDividers } from '../../resources/js/utils/dateGroupings';

describe('dateBucket', () => {
    it('groups day-precision values by day (time folded)', () => {
        expect(dateBucket('20240505120000')).toEqual({
            key: 'd2024-05-05',
            coarse: 'm2024-05',
            precision: 'day',
        });
        expect(dateBucket('20240505234500')).toEqual({
            key: 'd2024-05-05',
            coarse: 'm2024-05',
            precision: 'day',
        });
    });

    it('keeps month and year precision in their own buckets', () => {
        expect(dateBucket('202405')).toEqual({ key: 'm2024-05', coarse: 'm2024-05', precision: 'month' });
        expect(dateBucket('2024')).toEqual({ key: 'y2024', coarse: 'y2024', precision: 'year' });
    });

    it('returns null for empty values', () => {
        expect(dateBucket(null)).toBeNull();
        expect(dateBucket('')).toBeNull();
    });
});

describe('buildDateGroupDividers', () => {
    const items = [
        { start: '20240505120000' }, // day 1
        { start: '20240505130000' }, // same day
        { start: '20240512200000' }, // day 2 (still May)
        { start: '20240602090000' }, // June
        { start: '20240715080000' }, // July
        { start: null },             // undated (sorts last)
    ];

    it('puts a divider only when the day or month changes', () => {
        const dividers = buildDateGroupDividers(items);
        expect(dividers.map(d => d && d.bucket.key)).toEqual([
            'd2024-05-05',
            null,
            'd2024-05-12',
            'd2024-06-02',
            'd2024-07-15',
            null,
        ]);
    });

    it('flags firstOfMonth only on the first divider of each month', () => {
        const dividers = buildDateGroupDividers(items);
        expect(dividers.map(d => (d ? d.firstOfMonth : null))).toEqual([
            true, null, false, true, true, null,
        ]);
    });

    it('emits a past/future seam divider when the future flag flips', () => {
        const past = { start: '20200101100000' };
        const future = { start: '29990101100000' };
        const dividers = buildDateGroupDividers([past, future], {
            futureOf: (it) => Number(String(it.start).slice(0, 4)) > 2500,
        });
        expect(dividers[1]).not.toBeNull();
        expect(dividers[1].seam).toBe(true);
        expect(dividers[1].enteringFuture).toBe(true);
    });
});
