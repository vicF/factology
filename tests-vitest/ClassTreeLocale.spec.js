// Integration check: the dashboard class tree must re-render with localized
// names when the UI locale is switched at runtime (offline local-tree payload).
// Regression guard for class names staying English after switching to Russian.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';

import { getDb, clearAll } from '@factology/engine/localDb/index.js';
import { seedLocalDb } from '@factology/engine/localDb/seeder.js';
import { handleLocalApiCall } from '@factology/engine/localDb/apiHandler.js';

// The tree store calls axios.post('/object', { tree: true }).
vi.mock('axios', () => ({
    default: {
        post: vi.fn(async (url, body) => {
            const res = await handleLocalApiCall('post', url, body);
            return { data: res.data };
        }),
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        patch: vi.fn(),
        defaults: { headers: { common: {} } },
    },
}));

import ClassTree from '@/components/ClassTree.vue';
import { i18n } from '@/lang/i18n.js';
import { setLanguage } from '@/lang/i18n.js';

describe('ClassTree locale switching', () => {
    beforeEach(async () => {
        setActivePinia(createPinia());
        await clearAll();
        await seedLocalDb();
        setLanguage('en');
    });

    it('shows Russian class names after switching to ru', async () => {
        const w = mount(ClassTree, {
            global: {
                plugins: [i18n],
                stubs: {
                    'router-link': { template: '<a><slot /></a>' },
                    Image: true,
                    ConfirmModal: true,
                },
            },
        });

        // Let the store's loadClassTree() resolve and the tree render.
        await vi.waitFor(() => {
            expect(w.text()).toContain('Living being');
        }, { timeout: 20000, interval: 200 });

        setLanguage('ru');
        await nextTick();
        await nextTick();

        const text = w.text();
        expect(text).toContain('Живое существо');
        expect(text).not.toContain('Living being');
        // loadClassTree() waits (raced) for the persisted checkbox state, which
        // can take up to 5s in the native/Capacitor storage path.
    }, 30000);
});
