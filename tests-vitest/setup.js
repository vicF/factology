// tests-vitest/setup.js
import { vi } from 'vitest'
import { config } from '@vue/test-utils'
import * as Icons from '@icons'

// Register all icons globally for tests
Object.entries(Icons).forEach(([name, component]) => {
    config.global.components[name] = component
})

// Provide a trivial $t for components whose specs don't install a real i18n
// instance (translations return the key — English catalogs are key-identical).
config.global.mocks['$t'] = (key) => key
config.global.mocks['$getClassesList'] = (obj) => {
    if (obj && Array.isArray(obj.classes) && obj.classes.length > 0) return obj.classes;
    if (obj && obj.class && obj.class.thing_id) return [obj.class];
    return [];
}

// Mock the object cache store completely
vi.mock('@/stores/objectCache', () => ({
    useObjectCacheStore: vi.fn(() => ({
        hasCachedObject: vi.fn(() => false),
        getCachedObject: vi.fn(),
        fetchOrGetObject: vi.fn(),
        getRecent: vi.fn(() => []),
        searchCached: vi.fn(() => []),
        cacheObject: vi.fn(),
    })),
}))

// Mock the object history store (needs no active Pinia in unit tests)
vi.mock('@/stores/objectHistory', () => ({
    useObjectHistoryStore: vi.fn(() => ({
        hydrate: vi.fn(),
        getRecent: vi.fn(() => []),
        getRecentSync: vi.fn(() => []),
        getSuggestions: vi.fn(() => []),
        recordSelection: vi.fn(),
        getUsageRank: vi.fn(() => new Map()),
    })),
}))

vi.mock('axios', () => ({
    default: {
        post: vi.fn(),
        get: vi.fn(),
        delete: vi.fn(),
        put: vi.fn()
    }
}))

vi.mock('@/composables/useClickOutside', () => ({
    useClickOutside: vi.fn()
}))

vi.mock('@factology/engine/eventBus.js', () => ({
    eventBus: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))
