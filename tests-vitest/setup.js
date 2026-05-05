// tests-vitest/setup.js
import { vi } from 'vitest'
import { config } from '@vue/test-utils'
import * as Icons from '@icons'

// Register all icons globally for tests
Object.entries(Icons).forEach(([name, component]) => {
    config.global.components[name] = component
})

// Mock the object cache store completely
vi.mock('@/stores/objectCache', () => ({
    useObjectCacheStore: vi.fn(() => ({
        hasCachedObject: vi.fn(() => false),
        getCachedObject: vi.fn(),
        fetchOrGetObject: vi.fn(),
        getRecent: vi.fn(() => []),
        searchCached: vi.fn(() => []),
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

vi.mock('@/eventBus', () => ({
    eventBus: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))
