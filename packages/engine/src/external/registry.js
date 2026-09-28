// packages/engine/src/external/registry.js
//
// Provider registry for external data matching.
// Each provider implements:
//   { key, name, classIds[], search(query, ctx), fetchById(id), externalUrl(id), idScheme }

/** @type {Map<string, import('./types').ExternalProvider>} */
const providers = new Map();

/**
 * Register an external provider.
 * @param {import('./types').ExternalProvider} provider
 */
export function registerProvider(provider) {
    if (!provider.key || !provider.name || !provider.search) {
        throw new Error(`Invalid provider: missing required fields (key, name, search)`);
    }
    providers.set(provider.key, provider);
}

/**
 * Get a single provider by key.
 * @param {string} key
 * @returns {import('./types').ExternalProvider|undefined}
 */
export function getProvider(key) {
    return providers.get(key);
}

/**
 * Get all providers that can handle any of the given classIds.
 * @param {string[]} classIds
 * @returns {import('./types').ExternalProvider[]}
 */
export function getProvidersForClasses(classIds) {
    const matched = [];
    for (const p of providers.values()) {
        if (p.classIds && classIds.some(cid => p.classIds.includes(cid))) {
            matched.push(p);
        }
    }
    return matched;
}

/**
 * List all registered providers.
 * @returns {import('./types').ExternalProvider[]}
 */
export function listProviders() {
    return Array.from(providers.values());
}

/**
 * Remove a registered provider.
 * @param {string} key
 */
export function unregisterProvider(key) {
    providers.delete(key);
}