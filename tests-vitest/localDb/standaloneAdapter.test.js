// tests-vitest/localDb/standaloneAdapter.test.js
//
// Guards the standalone (Electron/Capacitor) axios adapter: it must forward the
// FULL request URL — query string included — to the local handlers, because the
// depth of every related-object/graph fetch rides in `?depth=N`. Stripping the
// query made GET /object/{id}/graph?depth=4 behave as depth 1 (the Graph tab
// showed a single level no matter which Levels button was pressed).

import { describe, it, expect, beforeEach, vi } from 'vitest';

// The shared setup mocks axios without a `defaults` object; this file needs the
// real thing's shape because bootstrapStandalone() installs a custom adapter on
// axios.defaults.adapter.
vi.mock('axios', () => {
    const axiosMock = {
        get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(),
        defaults: {},
    };
    return { default: axiosMock, ...axiosMock };
});

const apiMock = vi.hoisted(() => ({
    handleLocalApiCall: vi.fn(async () => ({ data: { ok: true }, status: 200 })),
    handleLocalLinkCall: vi.fn(async () => ({ data: { ok: true }, status: 200 })),
    handleLocalUserCall: vi.fn(async () => ({ data: { ok: true }, status: 200 })),
    seedDemoData: vi.fn(async () => {}),
}));

vi.mock('@factology/engine/localDb/schema.js', () => ({ createDatabase: () => {} }));
vi.mock('@factology/engine/localDb/apiHandler.js', () => apiMock);
vi.mock('@factology/engine/media/deviceImages.js', () => ({ initDeviceThumbs: async () => {} }));
vi.mock('@/stores/auth', () => ({
    useAuthStore: () => ({ token: null, restoreAuth: async () => {} }),
}));
vi.mock('@/stores/identity', () => ({
    useIdentityStore: () => ({
        // An unlocked identity, so write routes reach their handlers instead of
        // tripping the guest read-only guard.
        primary: { thingId: 'owner-1', name: 'Test Identity' },
        restore: async () => {},
        currentVisibleOwners: () => null,
    }),
}));

import axios from 'axios';
import { bootstrapStandalone } from '@/localDb/standaloneBootstrap.js';

const callAdapter = (url, method = 'get', data = null) =>
    axios.defaults.adapter({ url, method, data, headers: {} });

describe('standalone axios adapter (offline builds)', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        await bootstrapStandalone();
    });

    it('forwards the graph depth query string to the local API handler', async () => {
        await callAdapter('/object/abc/graph?depth=4');

        expect(apiMock.handleLocalApiCall).toHaveBeenCalledTimes(1);
        const [method, url] = apiMock.handleLocalApiCall.mock.calls[0];
        expect(method).toBe('get');
        expect(url).toBe('/object/abc/graph?depth=4');
    });

    it('forwards the object-relations depth query string', async () => {
        await callAdapter('/object/abc?depth=3');

        expect(apiMock.handleLocalApiCall.mock.calls[0][1]).toBe('/object/abc?depth=3');
    });

    it('strips the query before matching link writes (link id stays clean)', async () => {
        await callAdapter('/link/link-1?foo=bar', 'put', '{}');

        expect(apiMock.handleLocalLinkCall).toHaveBeenCalledTimes(1);
        expect(apiMock.handleLocalLinkCall.mock.calls[0][1]).toBe('/link/link-1');
    });

    it('matches auth routes whose query string would break equality', async () => {
        await callAdapter('/user?ts=1');

        expect(apiMock.handleLocalUserCall).toHaveBeenCalledTimes(1);
        expect(apiMock.handleLocalApiCall).not.toHaveBeenCalled();
    });

    it('reports the unlocked identity as the session user for GET /user', async () => {
        await callAdapter('/user');

        // Without this the offline /user returns a stand-in ('local-user-thing')
        // and boot-time checkAuth() clobbers the identity session, which makes
        // canEdit/canDelete false for every object the identity owns.
        expect(apiMock.handleLocalUserCall.mock.calls[0][0]).toEqual({
            userThingId: 'owner-1',
            userName: 'Test Identity',
        });
    });

    it('still treats a bare POST /object as search, not a write', async () => {
        const res = await callAdapter('/object', 'post', '{}');

        expect(apiMock.handleLocalApiCall).toHaveBeenCalledTimes(1);
        expect(res.status).toBe(200);
    });
});
