// resources/js/stores/objectCache.js
import { defineStore } from 'pinia';
import axios from 'axios';
import { THING_TYPE } from '@/constants.js'

export const useObjectCacheStore = defineStore('objectCache', {
    state: () => ({
        cache: new Map(),           // uuid → object
        recent: new Map(),          // type → [uuid, uuid, ...] — most recent first
        maxSize: 150,               // increased a bit — adjust as needed
        maxRecentPerType: 20
    }),

    actions: {
        // Add or update object in cache + update recent list
        cacheObject(uuid, data, type = THING_TYPE) {
            if (!uuid) return;

            // NEW: Skip caching if uuid is invalid or data lacks matching uuid
            if (typeof uuid !== 'string' || uuid.trim() === '' || !data?.thing_id || data.thing_id !== uuid) {
                console.warn('Skipping cache insert - invalid or missing uuid:', { passedUuid: uuid, dataUuid: data?.uuid });
                return;
            }

            // Promote / insert into cache with LRU behavior
            if (this.cache.has(uuid)) {
                this.cache.delete(uuid);
            } else if (this.cache.size >= this.maxSize) {
                const oldest = this.cache.keys().next().value;
                this.cache.delete(oldest);
            }
            this.cache.set(uuid, { ...data, cachedAt: Date.now() });

            // Update recent list per type (if type is known)
            if (type) {
                const key = `recent:${type}`;
                let list = this.recent.get(key) || [];

                // NEW: Only add valid uuid to recent list
                if (uuid && typeof uuid === 'string' && uuid.trim() !== '') {
                    list = list.filter(id => id !== uuid);     // remove if already present
                    list.unshift(uuid);                         // add to front
                    if (list.length > this.maxRecentPerType) {
                        list.pop();
                    }
                    this.recent.set(key, list);
                }
            }
        },

        getCachedObject(uuid) {
            return this.cache.get(uuid) || null;
        },

        getObject(uuid) {
            return this.getCachedObject(uuid);
        },

        hasCachedObject(uuid) {
            return this.cache.has(uuid);
        },

        // Get recently used objects of given type (great for initial dropdown)
        getRecent(type, limit = 12) {
            const key = `recent:${type}`;
            const uuids = this.recent.get(key) || [];
            return uuids
                .map(uuid => this.getCachedObject(uuid))
                .filter(Boolean)
                .slice(0, limit);
        },

        // Main method used by selector — get object (cache or fetch)
        async fetchOrGetObject(uuid, type = null) {
            if (this.hasCachedObject(uuid)) {
                const obj = this.getCachedObject(uuid);
                // Promote in LRU
                this.cache.delete(uuid);
                this.cache.set(uuid, obj);
                return obj;
            }

            try {
                const response = await axios.get(`/object/${uuid}`);
                const data = response.data.data;

                // Try to determine type if not provided
                const inferredType = data.type || THING_TYPE;
                this.cacheObject(uuid, data, inferredType);

                return data;
            } catch (error) {
                console.error('Error fetching object:', uuid, error);
                throw error;
            }
        },

        // Stub — replace with real search endpoint later
        // Currently only searches already cached items (good enough for start)
        searchCached(type, term, limit = 12) {
            if (!term?.trim()) {
                return this.getRecent(type, limit);
            }

            const searchTerm = term.toLowerCase().trim();
            const results = [];

            for (const [uuid, obj] of this.cache) {
                const name = (obj.name || obj.title || '').toLowerCase();
                const subtitle = (obj.subtitle || obj.description || '').toLowerCase();

                if (name.includes(searchTerm) || subtitle.includes(searchTerm)) {
                    // Optional: filter by type if we have type info
                    if (!type || obj.class_id === type || obj.type === type) {
                        results.push(obj);
                    }
                }
                if (results.length >= limit) break;
            }

            return results;
        }
    }
});
