import { ref } from 'vue';
import axios from 'axios';

/**
 * Expansion state + deeper-link loading for multilevel related objects.
 * Keeps per-node open/close state local to the component instance and loads
 * one additional level on demand from GET /object/{id}?depth=1.
 */
export function useRelatedExpansion() {
    const expandedIds = ref(new Set());

    const isOpen = (key) => expandedIds.value.has(key);
    const toggle = (key) => {
        const set = new Set(expandedIds.value);
        if (set.has(key)) {
            set.delete(key);
        } else {
            set.add(key);
        }
        expandedIds.value = set;
    };

    /**
     * Fetch one more level of related objects for a thing.
     * @returns {Promise<Array>} list of links (flat fields + shallow target)
     */
    async function loadDeeper(thingId, depth = 1) {
        const { data } = await axios.get(`/object/${thingId}?depth=${depth}`);
        return data?.data?.links ?? [];
    }

    return { expandedIds, isOpen, toggle, loadDeeper };
}
