// resources/js/composables/useClickOutside.js
import { onMounted, onBeforeUnmount } from 'vue'

/**
 * Composable that calls a callback when user clicks outside of one or more elements
 * @param {import('vue').Ref<HTMLElement | null>[] | import('vue').Ref<HTMLElement | null>} targets - ref(s) to the element(s) to watch
 * @param {Function} callback - function to call on outside click
 * @param {Object} [options] - optional settings
 * @param {boolean} [options.ignoreInputEvents=false] - skip if click happened inside input/textarea
 */
export function useClickOutside(targets, callback, options = {}) {
    // Normalize to array
    const elements = Array.isArray(targets) ? targets : [targets]

    function handler(event) {
        // Skip if click was inside any of the watched elements
        const clickedInside = elements.some(elRef => {
            const el = elRef.value
            return el && (el === event.target || el.contains(event.target))
        })

        if (!clickedInside) {
            callback(event)
        }
    }

    onMounted(() => {
        document.addEventListener('click', handler, true) // capture phase – better for modals/portals
    })

    onBeforeUnmount(() => {
        document.removeEventListener('click', handler, true)
    })

    // Return stop function (good practice)
    return () => {
        document.removeEventListener('click', handler, true)
    }
}
