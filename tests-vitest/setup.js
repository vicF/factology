import { config } from '@vue/test-utils'

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

vi.mock('axios', () => ({ default: { post: vi.fn() } }))
vi.mock('@/composables/useClickOutside', () => ({ useClickOutside: vi.fn() }))
vi.mock('@/eventBus', () => ({ eventBus: { on: vi.fn(), off: vi.fn(), emit: vi.fn() } }))
