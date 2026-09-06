// Helpers for external links (annotations pointing to URLs).
// The URL string is the source of truth; presentation is derived at render
// time from the domain, so arbitrary sites work without any setup.

/**
 * Whether the URL points at the app itself (same origin or a relative path).
 * Same-origin links navigate inside the SPA instead of opening a new tab.
 */
export function isInternalUrl(url) {
    if (url.startsWith('/')) return true;
    try {
        return new URL(url, window.location.origin).origin === window.location.origin;
    } catch {
        return false;
    }
}

/** Lowercased hostname without the leading www. prefix, or '' for bad URLs. */
export function getDomain(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return '';
    }
}

// Domain mask registry — curated branding for known services.
// Anything not listed falls back to the raw domain label.
const KNOWN = {
    'wikipedia.org': { label: 'Wikipedia' },
    'vk.com':        { label: 'VK' },
    'youtube.com':   { label: 'YouTube' },
    'youtu.be':      { label: 'YouTube' },
    'facebook.com':  { label: 'Facebook' },
    'instagram.com': { label: 'Instagram' },
    'x.com':         { label: 'X (Twitter)' },
    'twitter.com':   { label: 'X (Twitter)' },
};

export function getExternalLinkMeta(url) {
    const domain = getDomain(url);
    const known = KNOWN[domain];
    return { domain, label: known?.label || domain, isKnown: !!known };
}

/**
 * Google's favicon service — no backend or fetch needed at render time.
 * Returns '' for unparseable URLs so callers can fall back to an icon.
 */
export function faviconUrl(url, size = 32) {
    const domain = getDomain(url);
    return domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}` : '';
}
