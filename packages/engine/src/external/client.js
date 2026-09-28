// packages/engine/src/external/client.js
//
// Generic HTTP client with rate limiting, retry with backoff, and circuit
// breaker for external API calls. Extracted from SetTempo's MusicBrainz
// client pattern.

/**
 * @typedef {object} HttpClientOptions
 * @property {string} [userAgent]   User-Agent header value
 * @property {number} [minIntervalMs=1100]  Minimum ms between requests
 * @property {number} [maxRetries=3]        Max retry attempts
 * @property {number} [baseBackoffMs=300000]  Initial backoff (5 min)
 * @property {number} [maxBackoffMs=3600000]  Max backoff (60 min)
 * @property {function(number): void} [onBackoff]  Called with ms before each backoff wait
 */

export class HttpClient {
    /**
     * @param {HttpClientOptions} [options]
     */
    constructor(options = {}) {
        this.userAgent = options.userAgent || 'Factology/1.0';
        this.minIntervalMs = options.minIntervalMs || 1100;
        this.maxRetries = options.maxRetries ?? 3;
        this.baseBackoffMs = options.baseBackoffMs || 300_000;
        this.maxBackoffMs = options.maxBackoffMs || 3_600_000;
        this.onBackoff = options.onBackoff;

        /** @type {number|null} */
        this._lastCallAt = null;

        /** @type {boolean} */
        this._paused = false;

        /** @type {number|null} */
        this._pauseUntil = null;

        /** @type {number} */
        this._consecutiveErrors = 0;

        /** @type {Array<() => void>} */
        this._waiting = [];

        /** @type {number} */
        this._circuitBreakAfter = 5;
    }

    /**
     * Wait for an available slot (rate limit), then fetch.
     * @param {string} url
     * @param {RequestInit} [init]
     * @returns {Promise<Response>}
     */
    async fetch(url, init = {}) {
        await this._waitForSlot();

        const headers = { ...init.headers };
        if (this.userAgent && !headers['User-Agent']) {
            headers['User-Agent'] = this.userAgent;
        }

        const response = await fetch(url, { ...init, headers });

        // Handle rate limiting (429) or server errors (503)
        if (response.status === 429 || response.status === 503) {
            this._consecutiveErrors++;
            if (this._consecutiveErrors >= this._circuitBreakAfter) {
                this._pauseService();
            }
            if (this.maxRetries > 0) {
                const retryAfter = this._parseRetryAfter(response);
                const backoff = retryAfter || this._nextBackoff();
                this._lastCallAt = null; // reset so next call waits full interval
                await this._backoffWait(backoff);
                return this.fetch(url, init);
            }
        } else {
            this._consecutiveErrors = 0;
            this._lastCallAt = Date.now();
        }

        return response;
    }

    /**
     * Fetch and parse JSON in one call.
     * @param {string} url
     * @param {RequestInit} [init]
     * @returns {Promise<any>}
     */
    async fetchJson(url, init = {}) {
        const res = await this.fetch(url, init);
        if (!res.ok) {
            throw new Error(`HTTP ${res.status} from ${url}`);
        }
        return res.json();
    }

    /**
     * Whether the service is currently paused (circuit breaker open).
     * @returns {boolean}
     */
    get isPaused() {
        if (!this._paused) return false;
        if (this._pauseUntil && Date.now() >= this._pauseUntil) {
            this._paused = false;
            this._pauseUntil = null;
            return false;
        }
        return true;
    }

    /**
     * Reset circuit breaker state (e.g. after user action or network restored).
     */
    resetCircuitBreaker() {
        this._consecutiveErrors = 0;
        this._paused = false;
        this._pauseUntil = null;
    }

    /** Wait until the minimum interval has elapsed since the last call. */
    async _waitForSlot() {
        if (this.isPaused) {
            await new Promise(r => this._waiting.push(r));
        }

        if (this._lastCallAt) {
            const elapsed = Date.now() - this._lastCallAt;
            if (elapsed < this.minIntervalMs) {
                await new Promise(r => setTimeout(r, this.minIntervalMs - elapsed));
            }
        }
    }

    /** Compute exponentially increasing backoff (regressive ladder). */
    _nextBackoff() {
        const backoff = Math.min(
            this.baseBackoffMs * Math.pow(2, this._consecutiveErrors - this._circuitBreakAfter),
            this.maxBackoffMs
        );
        return backoff;
    }

    /** Pause the service for a period (circuit breaker open). */
    _pauseService() {
        this._paused = true;
        this._pauseUntil = Date.now() + 5 * 60 * 1000; // 5 min
        // Release all queued waiters
        for (const resolve of this._waiting) {
            resolve();
        }
        this._waiting = [];
    }

    /** Wait for the backoff period. */
    async _backoffWait(ms) {
        if (this.onBackoff) {
            this.onBackoff(ms);
        }
        await new Promise(r => setTimeout(r, ms));
    }

    /** Parse Retry-After header (seconds or date). */
    _parseRetryAfter(response) {
        const val = response.headers.get('Retry-After');
        if (!val) return null;
        const seconds = parseInt(val, 10);
        if (!isNaN(seconds)) return seconds * 1000;
        return null;
    }
}