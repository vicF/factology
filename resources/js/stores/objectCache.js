import { defineStore } from 'pinia';
import axios from 'axios'; // Or use fetch if preferred

export const useObjectCacheStore = defineStore('objectCache', {
    state: () => ({
        cache: new Map(), // Reactive Map for LRU cache
        maxSize: 100 // Limit to 100 items; adjust based on your resource needs
    }),
    actions: {
        // Helper to add/update item in cache with LRU logic
        setToCache(uuid, data) {
            if (this.cache.has(uuid)) {
                // Move to end (most recent) if already exists
                this.cache.delete(uuid);
            } else if (this.cache.size >= this.maxSize) {
                // Evict oldest (first key in Map)
                const oldestKey = this.cache.keys().next().value;
                this.cache.delete(oldestKey);
            }
            this.cache.set(uuid, data);
        },
        // Main action: Get object by UUID (from cache or server)
        async getObject(uuid) {
            if (this.cache.has(uuid)) {
                // Retrieve and promote to most recent
                const data = this.cache.get(uuid);
                this.cache.delete(uuid);
                this.cache.set(uuid, data);
                return data;
            } else {
                // Fetch from Laravel API
                try {
                    const response = await axios.get(`/api/objects/${uuid}`);
                    const data = response.data;
                    this.setToCache(uuid, data);
                    return data;
                } catch (error) {
                    console.error('Error fetching object:', error);
                    throw error; // Handle as needed in your app
                }
            }
        }
    }
});
