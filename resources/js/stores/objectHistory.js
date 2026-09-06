// resources/js/stores/objectHistory.js
//
// Persisted store for object selection history, frequency, and context-aware suggestions.
// Uses storage.js (localStorage on web, Capacitor Preferences on native).
// Favorites are stored as real links in the DB (MY_FAVORITE link type).

import { defineStore } from 'pinia';
import { storage, storageSync } from '@/utils/storage.js';
import { useAuthStore } from './auth';
import { useObjectCacheStore } from './objectCache';
import axios from 'axios';
import { UUID } from '@/constants/uuid.js';
import { THING_TYPE, LINK_TYPE, CLASS_TYPE } from '@/constants.js';

const STORAGE_PREFIX = 'objectHistory';
const MAX_RECENT = 200;
const MAX_CONTEXT_PER_KEY = 50;
const MAX_CONTEXT_KEYS = 500;

// The history is per-user: keys are namespaced by the logged-in user's thing_id
// (guests share a 'guest' namespace). Keeps users on the same browser from
// seeing each other's recently used / frequent lists.
function currentUserKey() {
    const authStore = useAuthStore();
    return authStore.user?.thing_id || 'guest';
}

function historyKey(suffix) {
    return `${STORAGE_PREFIX}:${currentUserKey()}:${suffix}`;
}

// True when an object matches the selector's numeric type. The `class_id`
// fallback is legacy (older cached objects carried a class reference).
function objectMatchesType(obj, type) {
    if (!type) return true;
    return !!obj && (obj.type === type || obj.class_id === type);
}

// Minimal renderable snapshot of an object so the recent list can be displayed
// immediately after a fresh session, before the object cache is repopulated.
// Kept deliberately small (name only, no long descriptions) to limit storage.
function makeSnapshot(obj, fallbackType) {
    if (!obj) return null;
    return {
        thing_id: obj.thing_id,
        type: obj.type || fallbackType,
        name: obj.name || '',
        name_translations: obj.name_translations || null,
    };
}

export const useObjectHistoryStore = defineStore('objectHistory', () => {
    // ── In-memory caches (hydrated once from storage) ──
    let recentCache = [];          // { uuid, type, selectedAt, obj? } — obj is a display snapshot
    let freqCache = {};            // { uuid: count }
    let contextCache = {};         // { 'type:linkType': [ {uuid, count, lastSelectedAt} ] }
    let hydrated = false;
    let hydratedUserKey = null;    // user key the in-memory caches belong to
    let favoritesCache = [];       // cached favorite UUIDs from DB
    let favoritesLoaded = false;   // favorites have been fetched at least once this session
    let otherCache = {};           // { type: [object, ...] } — fallback filler objects, cached per session

    // ── Hydration ──
    async function hydrate() {
        const userKey = currentUserKey();
        if (hydrated && hydratedUserKey === userKey) return;
        hydrated = false;
        try {
            // Legacy fallback: before per-user namespacing the keys were stored
            // flat (objectHistory:recent, ...). The first user to load after the
            // upgrade takes over that data and the flat keys are removed.
            const read = async (suffix) => {
                let raw = await storage.get(historyKey(suffix));
                if (raw === null) {
                    const legacyKey = `${STORAGE_PREFIX}:${suffix}`;
                    raw = await storage.get(legacyKey);
                    if (raw !== null) {
                        await storage.set(historyKey(suffix), raw);
                        await storage.remove(legacyKey);
                    }
                }
                return raw;
            };
            const [recentRaw, freqRaw, contextRaw] = await Promise.all([
                read('recent'),
                read('freq'),
                read('context'),
            ]);
            recentCache = recentRaw ? JSON.parse(recentRaw) : [];
            freqCache = freqRaw ? JSON.parse(freqRaw) : {};
            contextCache = contextRaw ? JSON.parse(contextRaw) : {};
        } catch (e) {
            console.warn('objectHistory: hydration failed', e);
        }
        hydratedUserKey = userKey;
        hydrated = true;
    }

    // ── Persistence ──
    async function persist() {
        await Promise.all([
            storage.set(historyKey('recent'), JSON.stringify(recentCache)),
            storage.set(historyKey('freq'), JSON.stringify(freqCache)),
            storage.set(historyKey('context'), JSON.stringify(contextCache)),
        ]);
    }

    // ── Pruning helpers ──
    function pruneRecent() {
        if (recentCache.length > MAX_RECENT) {
            recentCache = recentCache.slice(0, MAX_RECENT);
        }
    }

    function pruneContextKeys() {
        const keys = Object.keys(contextCache);
        if (keys.length > MAX_CONTEXT_KEYS) {
            const scored = keys.map(k => ({
                key: k,
                score: Math.min(...(contextCache[k].map(e => e.lastSelectedAt))),
            }));
            scored.sort((a, b) => b.score - a.score);
            const newContext = {};
            for (let i = 0; i < MAX_CONTEXT_KEYS; i++) {
                newContext[scored[i].key] = contextCache[scored[i].key];
            }
            contextCache = newContext;
        }
    }

    function pruneContextPerKey(key) {
        if (contextCache[key] && contextCache[key].length > MAX_CONTEXT_PER_KEY) {
            contextCache[key] = contextCache[key].slice(0, MAX_CONTEXT_PER_KEY);
        }
    }

    // ── Record selection (called when user picks an object in dropdown) ──
    async function recordSelection(uuid, type, contextType = null, linkTypeId = null) {
        await hydrate();
        if (!uuid) return;

        const now = Date.now();

        // Snapshot the object now (it is cached right before recording) so the
        // recent list stays renderable across sessions without refetching.
        const cacheStore = useObjectCacheStore();
        const snapshot = makeSnapshot(cacheStore.getCachedObject(uuid), type);

        // Update recent list
        recentCache = recentCache.filter(e => e.uuid !== uuid);
        recentCache.unshift({ uuid, type, selectedAt: now, obj: snapshot });
        pruneRecent();

        // Update frequency counter
        freqCache[uuid] = (freqCache[uuid] || 0) + 1;

        // Update context-aware suggestions
        if (contextType !== null && linkTypeId !== null) {
            const contextKey = `${contextType}:${linkTypeId}`;
            if (!contextCache[contextKey]) {
                contextCache[contextKey] = [];
            }
            let entries = contextCache[contextKey];
            const existing = entries.find(e => e.uuid === uuid);
            if (existing) {
                existing.count += 1;
                existing.lastSelectedAt = now;
            } else {
                entries.push({ uuid, count: 1, lastSelectedAt: now });
            }
            entries.sort((a, b) => b.count - a.count || b.lastSelectedAt - a.lastSelectedAt);
            contextCache[contextKey] = entries;
            pruneContextPerKey(contextKey);
            pruneContextKeys();
        }

        await persist();
    }

    // ── Get recently used ──
    async function getRecent(type, limit = 15) {
        await hydrate();
        const cacheStore = useObjectCacheStore();
        const results = [];
        const needsFetch = [];
        for (const e of recentCache) {
            if (results.length >= limit) break;
            // Prefer the live cache; fall back to the persisted display
            // snapshot so recent items survive a fresh session.
            const obj = cacheStore.getCachedObject(e.uuid) || e.obj;
            if (!obj) {
                // Legacy entries (recorded before snapshots existed) have no
                // name on a fresh session — fetch them so they still render.
                needsFetch.push(e);
                continue;
            }
            if (!objectMatchesType(obj, type)) continue;
            results.push(obj);
        }
        // Recover legacy entries in parallel (fetchOrGetObject caches the
        // result, and skips already-known-missing ids, so this is one-time).
        if (needsFetch.length) {
            const settled = await Promise.allSettled(
                needsFetch.map(e => cacheStore.fetchOrGetObject(e.uuid))
            );
            for (let i = 0; i < needsFetch.length && results.length < limit; i++) {
                const obj = settled[i].status === 'fulfilled' ? settled[i].value : null;
                if (obj && objectMatchesType(obj, type)) results.push(obj);
            }
        }
        return results;
    }

    // ── Synchronous variant of getRecent ──
    // Renders the persisted recent list (plus the in-memory object cache)
    // without any await, so a dropdown can paint its items on the very first
    // frame instead of waiting for hydrate()/the network. Falls back to a
    // synchronous localStorage read when the store has not been hydrated yet.
    function getRecentSync(type, limit = 15) {
        let recent = recentCache;
        if (!hydrated) {
            const raw = storageSync.get(historyKey('recent')) ?? storageSync.get(`${STORAGE_PREFIX}:recent`);
            try { if (raw) recent = JSON.parse(raw); } catch (e) { /* ignore */ }
        }
        const cacheStore = useObjectCacheStore();
        const results = [];
        for (const e of recent) {
            if (results.length >= limit) break;
            const obj = cacheStore.getCachedObject(e.uuid) || e.obj;
            if (!obj || !objectMatchesType(obj, type)) continue;
            results.push(obj);
        }
        return results;
    }

    // ── Get most frequently used ──
    async function getMostFrequent(type, limit = 15) {
        await hydrate();
        const cacheStore = useObjectCacheStore();
        const entries = Object.entries(freqCache)
            .map(([uuid, count]) => ({ uuid, count, obj: cacheStore.getCachedObject(uuid) }))
            .filter(e => e.obj && objectMatchesType(e.obj, type))
            .sort((a, b) => b.count - a.count);
        return entries.slice(0, limit).map(e => e.obj);
    }

    // ── Get context-aware suggestions ──
    async function getContextSuggestions(contextType, linkTypeId, limit = 12) {
        await hydrate();
        const cacheStore = useObjectCacheStore();
        const key = `${contextType}:${linkTypeId}`;
        const entries = contextCache[key] || [];
        const objects = [];
        for (const entry of entries) {
            if (objects.length >= limit) break;
            const obj = cacheStore.getCachedObject(entry.uuid);
            if (obj) objects.push(obj);
        }
        return objects;
    }

    // ── Per-object usage score for ranking typed search results ──
    // Returns a Map<uuid, number>; a higher number means the current user picks
    // the object more often / more recently (optionally within a link-type
    // context). Pickers re-rank the server's `/object` response with this so a
    // frequently-used object surfaces above rare same-name matches. Synchronous:
    // falls back to a sync storage read before hydration, mirroring getRecentSync.
    function getUsageRank(contextType = null, linkTypeId = null) {
        let recent = recentCache;
        let freq = freqCache;
        let contextArr = null;
        let favs = favoritesCache;
        if (!hydrated) {
            const syncLoad = (suffix) => {
                const raw = storageSync.get(historyKey(suffix)) ?? storageSync.get(`${STORAGE_PREFIX}:${suffix}`);
                try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
            };
            recent = syncLoad('recent') || [];
            freq = syncLoad('freq') || {};
            if (contextType !== null && linkTypeId !== null) {
                const rawCtx = syncLoad('context');
                contextArr = rawCtx?.[`${contextType}:${linkTypeId}`] || null;
            }
        } else if (contextType !== null && linkTypeId !== null) {
            contextArr = contextCache[`${contextType}:${linkTypeId}`] || null;
        }

        const scores = new Map();
        const bump = (uuid, amount) => {
            if (!uuid) return;
            scores.set(uuid, (scores.get(uuid) || 0) + amount);
        };

        // Recency: position-weighted, the most recent contributes ~0.4, fading fast.
        recent.forEach((e, i) => bump(e.uuid, Math.max(0, 1 - i / 20) * 0.4));

        // Global frequency: saturating so a handful of picks already ranks high.
        for (const [uuid, count] of Object.entries(freq)) {
            bump(uuid, Math.min(count, 25) / 25 * 0.5);
        }

        // Link-type context: only relevant when the picker knows which link type
        // is being added (e.g. "Маша Фокина" is always the author of photos).
        if (contextArr) {
            contextArr.forEach((e, i) => bump(e.uuid, Math.max(0, 1 - i / 12) * 0.5));
        }

        // Favorites (DB-backed, cached once fetched this session): flat strong boost.
        for (const uuid of favs) bump(uuid, 0.6);

        return scores;
    }

    // ── Get current user as a selectable object ──
    async function getCurrentUserObject() {
        const authStore = useAuthStore();
        if (!authStore.user?.thing_id) return null;
        const cacheStore = useObjectCacheStore();
        if (cacheStore.hasCachedObject(authStore.user.thing_id)) {
            return cacheStore.getCachedObject(authStore.user.thing_id);
        }
        try {
            return await cacheStore.fetchOrGetObject(authStore.user.thing_id, THING_TYPE);
        } catch {
            return null;
        }
    }

    // ── Fetch favorites from DB ──
    async function fetchFavorites() {
        const authStore = useAuthStore();
        if (!authStore.user?.thing_id) return [];
        try {
            const response = await axios.post('/object', {
                favorites: true,
                type: [],
                classes: [],
            });
            const things = response.data?.things || [];
            favoritesCache = things.map(t => t.thing_id);
            // Cache the favorite objects so dropdowns can render them without a
            // second fetch (they are not part of the regular search flow).
            const cacheStore = useObjectCacheStore();
            for (const t of things) {
                if (t?.thing_id) cacheStore.cacheObject(t.thing_id, t, t.type);
            }
            return things;
        } catch (e) {
            console.warn('Failed to fetch favorites:', e);
            return [];
        }
    }

    // Fetch favorites at most once per session (lazily, on first use).
    async function ensureFavorites() {
        if (favoritesLoaded) return;
        favoritesLoaded = true;
        try {
            await fetchFavorites();
        } catch (e) {
            console.warn('Failed to preload favorites:', e);
        }
    }

    // ── Toggle favorite status ──
    async function toggleFavorite(thingId) {
        const authStore = useAuthStore();
        if (!authStore.user?.thing_id || !thingId) return false;
        try {
            const response = await axios.post(`/object/${thingId}/favorite`);
            const isFav = response.data?.favorite;
            if (isFav) {
                if (!favoritesCache.includes(thingId)) favoritesCache.push(thingId);
            } else {
                favoritesCache = favoritesCache.filter(id => id !== thingId);
            }
            return isFav;
        } catch (e) {
            console.warn('Failed to toggle favorite:', e);
            return null;
        }
    }

    // ── Check if an object is favorited ──
    function isFavorite(thingId) {
        return favoritesCache.includes(thingId);
    }

    // ── Get global DB suggestions ──
    async function getGlobalSuggestions(oneThingId, linkTypeId, limit = 12) {
        try {
            const response = await axios.post('/suggest/links', {
                one_thing_id: oneThingId,
                link_type_id: linkTypeId,
                limit,
            });
            const ids = response.data?.data || [];
            const cacheStore = useObjectCacheStore();
            const results = [];
            for (const id of ids) {
                const obj = cacheStore.getCachedObject(id);
                if (obj) results.push(obj);
                else {
                    try {
                        const fetched = await cacheStore.fetchOrGetObject(id);
                        if (fetched) results.push(fetched);
                    } catch { /* skip */ }
                }
                if (results.length >= limit) break;
            }
            return results;
        } catch (e) {
            console.warn('Global suggestions failed:', e);
            return [];
        }
    }

    // ── Get any other objects of the requested type (fallback filler) ──
    // Ensures the dropdown always has something to choose from, even when the
    // user has no local history yet. Cached in-memory per type for the session.
    async function getOtherObjects(type, limit = 15) {
        if (otherCache[type]?.length) return otherCache[type].slice(0, limit);
        try {
            const response = await axios.post('/object', {
                search: '',
                type: type ? [type] : [],
                classes: [],
            });
            let things = response.data?.things;
            if (things && typeof things === 'object' && !Array.isArray(things)) {
                things = Object.values(things);
            }
            things = Array.isArray(things) ? things : [];
            const results = [];
            for (const t of things) {
                if (!t?.thing_id) continue;
                if (objectMatchesType(t, type)) results.push(t);
                if (results.length >= limit) break;
            }
            otherCache[type] = results;
            return results;
        } catch (e) {
            console.warn('Failed to load fallback objects:', e);
            return [];
        }
    }

    // ── Get combined suggestions for dropdown ──
    async function getSuggestions(type, contextType = null, linkTypeId = null, oneThingId = null, limit = 15) {
        await hydrate();
        const results = [];
        const seen = new Set();
        const cacheStore = useObjectCacheStore();

        const add = (obj, tag) => {
            if (!obj?.thing_id || seen.has(obj.thing_id)) return;
            if (!objectMatchesType(obj, type)) return;
            if (results.length >= limit) return;
            results.push({ ...obj, _suggestionType: tag });
            seen.add(obj.thing_id);
        };

        // 1. Recently used (persisted locally, most recent first) — always on top.
        const recent = await getRecent(type, limit);
        for (const obj of recent) add(obj, 'recent');

        // 2. Favorites (from DB — authoritative, user-curated). Only fetched
        //    when recent items do not already fill the dropdown.
        if (results.length < limit) {
            await ensureFavorites();
            for (const id of favoritesCache) {
                add(cacheStore.getCachedObject(id), 'favorite');
            }
        }

        // 3. Current user suggestion
        if (type === THING_TYPE && results.length < limit) {
            add(await getCurrentUserObject(), 'current_user');
        }

        // 4. Context-aware
        if (contextType !== null && linkTypeId !== null && results.length < limit) {
            const ctxSuggestions = await getContextSuggestions(contextType, linkTypeId, limit);
            for (const obj of ctxSuggestions) add(obj, 'context');
        }

        // 5. Most frequent
        if (results.length < limit) {
            const freq = await getMostFrequent(type, limit);
            for (const obj of freq) add(obj, 'frequent');
        }

        // 6. Global DB suggestions (network — last-resort filler)
        if (results.length < limit && oneThingId && linkTypeId) {
            const global = await getGlobalSuggestions(oneThingId, linkTypeId, limit - results.length);
            for (const obj of global) add(obj, 'global');
        }

        // 7. Any other objects of the requested type — the dropdown must never
        //    be empty, so when no history/suggestions exist, fill with objects
        //    from the server.
        if (results.length < limit) {
            const other = await getOtherObjects(type, limit - results.length);
            for (const obj of other) add(obj, 'other');
        }

        return results;
    }

    // ── Preload the user's quick lists from the server ──
    // Called once at app load. Seeds the local recent/frequent caches with the
    // user's most-used link types, things and classes so the first dropdown of
    // the session opens instantly — even on a fresh device with no local
    // history. The result is persisted, so later sessions render offline too.
    async function preloadFromServer() {
        const authStore = useAuthStore();
        if (!authStore.token || !authStore.user?.thing_id) return;
        await hydrate();
        try {
            const res = await axios.get('/suggest/lists');
            const { links = [], things = [], classes = [] } = res.data || {};
            const cacheStore = useObjectCacheStore();

            const seed = (objects, type) => {
                for (let i = 0; i < objects.length; i++) {
                    const obj = objects[i];
                    if (!obj?.thing_id) continue;
                    if (obj.type !== undefined && !objectMatchesType(obj, type)) continue;
                    cacheStore.cacheObject(obj.thing_id, obj, obj.type || type);
                    // Append to recent (real user selections stay on top).
                    if (!recentCache.some(e => e.uuid === obj.thing_id)) {
                        recentCache.push({
                            uuid: obj.thing_id,
                            type: obj.type || type,
                            selectedAt: Date.now(),
                            obj: makeSnapshot(obj, type),
                        });
                    }
                    // Rank-derived base frequency; never overwrite real usage.
                    const rankWeight = objects.length - i;
                    freqCache[obj.thing_id] = Math.max(freqCache[obj.thing_id] || 0, rankWeight);
                }
            };

            seed(links, LINK_TYPE);
            seed(things, THING_TYPE);
            seed(classes, CLASS_TYPE);
            pruneRecent();
            await persist();
        } catch (e) {
            console.warn('objectHistory: server preload failed', e);
        }
    }

    // ── Reset / clear ──
    async function clearAll() {
        recentCache = [];
        freqCache = {};
        contextCache = {};
        hydrated = true;
        favoritesCache = [];
        favoritesLoaded = false;
        otherCache = {};
        await persist();
    }

    return {
        recordSelection,
        getRecent,
        getRecentSync,
        preloadFromServer,
        getMostFrequent,
        getContextSuggestions,
        getUsageRank,
        getCurrentUserObject,
        getGlobalSuggestions,
        getOtherObjects,
        getSuggestions,
        fetchFavorites,
        ensureFavorites,
        toggleFavorite,
        isFavorite,
        clearAll,
        hydrate,
    };
});
