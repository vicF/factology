// tests-vitest/utils/objectImages.test.js
import { describe, it, expect } from 'vitest';
import { IMAGE_VARIANTS, fitWithin, isValidSize } from '../../resources/js/utils/imageEditing';
import { thumbRelPath, thumbUrl, isOfflineOnly } from '../../resources/js/utils/objectImages';

describe('imageEditing profiles', () => {
    it('declares small, medium and original sizes', () => {
        expect(Object.keys(IMAGE_VARIANTS).sort()).toEqual(['medium', 'original', 'small']);
        expect(IMAGE_VARIANTS.small.maxDimension).toBe(100);
        expect(IMAGE_VARIANTS.medium.maxDimension).toBe(512);
        expect(IMAGE_VARIANTS.original.maxDimension).toBeNull();
    });

    it('validates sizes', () => {
        expect(isValidSize('small')).toBe(true);
        expect(isValidSize('original')).toBe(true);
        expect(isValidSize('huge')).toBe(false);
    });

    it('fits wide images inside the profile square', () => {
        expect(fitWithin(200, 100, 100)).toEqual([100, 50]);
        expect(fitWithin(100, 200, 100)).toEqual([50, 100]);
        expect(fitWithin(50, 50, 100)).toEqual([50, 50]);
        expect(fitWithin(100, 100, null)).toEqual([100, 100]);
    });
});

describe('thumb URL helpers (web build)', () => {
    it('builds the server-style relative path from a UUID', () => {
        const uuid = 'ab12cd34-5678-4abc-9def-001122334455';
        expect(thumbRelPath(uuid)).toBe(`/thumbs/${uuid[0]}/${uuid[1]}/${uuid}.jpg`);
        expect(thumbRelPath('')).toBe('');
    });

    it('keeps the same-origin URL in the default web build', () => {
        // In the vitest (web) build no VITE_TARGET/VITE_API_URL is defined.
        expect(isOfflineOnly()).toBe(false);
        expect(thumbUrl('ab12cd34-0000-4000-8000-000000000000')).toBe(
            '/thumbs/a/b/ab12cd34-0000-4000-8000-000000000000.jpg'
        );
    });
});
