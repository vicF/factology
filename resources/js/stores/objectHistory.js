// resources/js/stores/objectHistory.js
//
// Persisted store for object selection history, frequency, and context-aware suggestions.
// Uses storage.js (localStorage on web, Capacitor Preferences on native).
// Favorites are stored as real links in the DB (MY_FAVORITE link type).

import { defineStore } from 'pinia';
import { storage } from '@/utils/storage.js';
import { useAuthStore } from './auth';
import { useObjectCacheStore } from './objectCache';
import axios from 'axios';
import { UUID } from '@/constants/uuid.js';
import { THING_TYPE } from '@/constants.js';

const STORAGE_PREFIX = 'objectHistory';
const MAX_RECENT = 200;
const MAX_CONTEXT_PER_KEY = 50;
const MAX_CONTEXT_KEYS = 500;

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
    let favoritesCache = [];       // cached favorite UUIDs from DB
    let favoritesLoaded = false;   // favorites have been fetched at least once this session

    // ── Hydration ──
    async function hydrate() {
        if (hydrated) return;
        try {
            const [recentRaw, freqRaw, contextRaw] = await Promise.all([
                storage.get(`${STORAGE_PREFIX}:recent`),
                storage.get(`${STORAGE_PREFIX}:freq`),
                storage.get(`${STORAGE_PREFIX}:context`),
            ]);
            if (recentRaw) recentCache = JSON.parse(recentRaw);
            if (freqRaw) freqCache = JSON.parse(freqRaw);
            if (contextRaw) contextCache = JSON.parse(contextRaw);
        } catch (e) {
            console.warn('objectHistory: hydration failed', e);
        }
        hydrated = true;
    }

    // ── Persistence ──
    async function persist() {
        await Promise.all([
            storage.set(`${STORAGE_PREFIX}:recent`, JSON.stringify(recentCache)),
            storage.set(`${STORAGE_PREFIX}:freq`, JSON.stringify(freqCache)),
            storage.set(`${STORAGE_PREFIX}:context`, JSON.stringify(contextCache)),
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
        for (const e of recentCache) {
            if (results.length >= limit) break;
            // Prefer the live cache; fall back to the persisted display
            // snapshot so recent items survive a fresh session.
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

        return results;
    }

    // ── Reset / clear ──
    async function clearAll() {
        recentCache = [];
        freqCache = {};
        contextCache = {};
        hydrated = true;
        favoritesCache = [];
        favoritesLoaded = false;
        await persist();
    }

    return {
        recordSelection,
        getRecent,
        getMostFrequent,
        getContextSuggestions,
        getCurrentUserObject,
        getGlobalSuggestions,
        getSuggestions,
        fetchFavorites,
        ensureFavorites,
        toggleFavorite,
        isFavorite,
        clearAll,
        hydrate,
    };
});
