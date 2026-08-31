/**
 * Unified frontend error tracking.
 *
 * Provides:
 *  - trackError(error, context) — log + notify subscribers
 *  - onError(callback)         — subscribe (returns unsubscribe)
 *  - reportToServer(error)     — POST to /api/v1/client-error
 *  - installVueErrorHandler(app)
 *  - installGlobalHandlers()
 *  - shouldIgnoreError(error)  — filter expected errors
 */

import axios from 'axios'

// ── Error type classification ────────────────────────────────

export function classifyServerError(error) {
  const status = error.response?.status
  const data = error.response?.data

  if (data?.error?.type) return data.error.type
  if (data?.error) return 'server_error'

  if (status >= 500) return 'server_error'
  if (status === 403) return 'authorization_error'
  if (status === 404) return 'not_found'
  if (status === 422) return 'validation_error'
  if (status === 429) return 'rate_limited'

  return 'unknown'
}

// ── Ignore filter ────────────────────────────────────────────

export function shouldIgnoreError(error) {
  const msg = String(error?.message ?? '').toLowerCase()
  const url = error?.config?.url ?? ''

  // Auth redirects are handled by the Axios interceptor, not by error UI
  if (error.response?.status === 401) return true

  // A 404 on a GET object fetch just means the object is not visible to the
  // current user (private / not owner) or doesn't exist. Callers already
  // treat that as "no object" (objectCache marks it missing, the Object page
  // renders its own "private or does not exist" screen), so surfacing it as a
  // global error toast is confusing noise — especially for logged-in users.
  if (error.response?.status === 404 &&
      error.config?.method?.toLowerCase() === 'get' &&
      /^\/object\/[0-9a-fA-F-]{36}/.test(url)) {
    return true
  }

  // Cancelled / aborted requests
  if (axios.isCancel(error)) return true
  if (error.name === 'CanceledError') return true
  if (msg.includes('cancel')) return true
  if (msg.includes('abort')) return true

  // Offline / network errors
  if (error.code === 'ERR_NETWORK' && !navigator.onLine) return true
  if (msg.includes('network error') && !navigator.onLine) return true

  // ResizeObserver loop limit (benign browser warning)
  if (msg.includes('resizeobserver')) return true

  // Lighthouse / devtools injections
  if (url.includes('lighthouse')) return true

  return false
}

// ── Subscription system ──────────────────────────────────────

const listeners = new Set()

export function onError(callback) {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

function notifySubscribers(error, context) {
  listeners.forEach(fn => {
    try { fn(error, context) } catch (e) { /* subscriber threw */ }
  })
}

// ── Track ────────────────────────────────────────────────────

export function trackError(error, context = {}) {
  if (shouldIgnoreError(error)) return

  const type = classifyServerError(error)

  console.group(`%c[${type}]`, 'color:#dc3545;font-weight:bold', error.message || error)
  if (context.vueComponent) console.log('Component:', context.vueComponent)
  if (context.vueInfo) console.log('Vue info:', context.vueInfo)
  if (error.config) {
    console.log(`${error.config.method?.toUpperCase()} ${error.config.url}`)
  }
  if (error.response) {
    console.log('Status:', error.response.status, error.response.statusText)
    if (error.response.data?.error) {
      console.log('Server error:', error.response.data.error)
    }
  }
  if (error.stack) {
    console.log('Stack:', error.stack)
  }
  console.groupEnd()

  notifySubscribers(error, { ...context, type })
}

// ── Report to server ─────────────────────────────────────────

export function reportToServer(error) {
  if (shouldIgnoreError(error)) return

  const body = {
    message: error.message || String(error),
    type: classifyServerError(error),
    url: location.href,
    userAgent: navigator.userAgent,
    stack: error.stack,
  }

  if (error.response) {
    body.status = error.response.status
    body.statusText = error.response.statusText
    body.responseData = error.response.data
  }

  if (error.config) {
    body.requestUrl = error.config.url
    body.requestMethod = error.config.method
  }

  // Fire-and-forget. Relative to axios.baseURL (/api/v1) — a leading-slash
  // absolute path would get the prefix applied twice (/api/v1/api/v1/...).
  axios.post('/client-error', body).catch(() => {})
}

// ── Vue handler ──────────────────────────────────────────────

export function installVueErrorHandler(app) {
  app.config.errorHandler = (error, instance, info) => {
    const componentName = instance?.$options?.name
      || instance?.$options?._componentTag
      || 'AnonymousComponent'

    trackError(error, {
      vueComponent: componentName,
      vueInfo: info,
    })

    reportToServer(error)
  }
}

// ── Global handlers (window.onerror + unhandledrejection) ────

export function installGlobalHandlers() {
  if (typeof window === 'undefined') return

  window.onerror = (message, source, line, col, error) => {
    trackError(error || new Error(String(message)), {
      source: `${source}:${line}:${col}`,
    })
    reportToServer(error || new Error(String(message)))
  }

  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason instanceof Error
      ? event.reason
      : new Error(String(event.reason ?? 'Unhandled Promise rejection'))
    trackError(error, { unhandledRejection: true })
    reportToServer(error)
  })
}
