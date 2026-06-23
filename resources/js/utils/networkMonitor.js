// resources/js/utils/networkMonitor.js

import { ref } from 'vue';
import { eventBus } from '../eventBus';

/**
 * Reactive network monitor.
 *
 * Detects online/offline state changes and exposes them
 * as a reactive ref. Listens to browser `online`/`offline`
 * events and also pings the API server periodically.
 */
export function createNetworkMonitor(healthCheckUrl = '/api/v1/object?limit=1') {
    const isOnline = ref(navigator.onLine);
    const isServerReachable = ref(false);
    let checkInterval = null;
    let listenersAttached = false;

    function attachListeners() {
        if (listenersAttached) return;
        listenersAttached = true;

        window.addEventListener('online', () => {
            isOnline.value = true;
            eventBus.emit('network:online');
            checkServer(); // Verify server is reachable too
        });

        window.addEventListener('offline', () => {
            isOnline.value = false;
            isServerReachable.value = false;
            eventBus.emit('network:offline');
        });
    }

    async function checkServer() {
        if (!isOnline.value) {
            isServerReachable.value = false;
            return false;
        }

        try {
            const response = await fetch(healthCheckUrl, {
                method: 'HEAD',
                cache: 'no-cache',
                // Timeout: 5 seconds
                signal: AbortSignal.timeout(5000),
            });
            const reachable = response.ok;
            if (isServerReachable.value !== reachable) {
                isServerReachable.value = reachable;
                eventBus.emit(reachable ? 'network:server-reachable' : 'network:server-unreachable');
            }
            return reachable;
        } catch {
            if (isServerReachable.value !== false) {
                isServerReachable.value = false;
                eventBus.emit('network:server-unreachable');
            }
            return false;
        }
    }

    /**
     * Start periodic health checks.
     *
     * @param {number} intervalMs - Check interval in ms (default 30s)
     */
    function start(intervalMs = 30000) {
        attachListeners();
        checkServer(); // immediate first check
        checkInterval = setInterval(checkServer, intervalMs);
    }

    /**
     * Stop periodic health checks.
     */
    function stop() {
        if (checkInterval) {
            clearInterval(checkInterval);
            checkInterval = null;
        }
    }

    return {
        isOnline,
        isServerReachable,
        checkServer,
        start,
        stop,
    };
}

/**
 * Singleton instance for app-wide use.
 * Start it during app initialization.
 */
export const networkMonitor = createNetworkMonitor();
