/**
 * Lightweight performance measurement utilities.
 *
 * Wraps the Performance API for use in Vue components.
 * Usage:
 *
 *   import { startMark, endMark } from '@/utils/performance.js'
 *
 *   startMark('loadData')
 *   await loadData()
 *   endMark('loadData')  // logs warning if > threshold
 */

const THRESHOLD_MS = 500

export function startMark(name) {
  if (typeof performance === 'undefined') return
  performance.mark(`${name}-start`)
}

export function endMark(name, threshold = THRESHOLD_MS) {
  if (typeof performance === 'undefined') return
  performance.mark(`${name}-end`)
  performance.measure(name, `${name}-start`, `${name}-end`)

  const entries = performance.getEntriesByName(name)
  const last = entries[entries.length - 1]
  const duration = last ? Math.round(last.duration) : 0

  if (duration > threshold) {
    console.warn(`[Perf] ${name} took ${duration}ms (threshold: ${threshold}ms)`)
  }

  return duration
}
