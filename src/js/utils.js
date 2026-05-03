/**
 * Shared pure utility functions.
 * No dependencies on store or any other app module.
 */

// ── HTML escaping ──────────────────────────────────────────────────────────

const HTML_ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch]);
}

// ── Deep clone ─────────────────────────────────────────────────────────────

export function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

// ── localStorage helpers ───────────────────────────────────────────────────

export function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function hasStoredKey(key) {
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

export function firstExisting(keys, fallback) {
  for (const key of keys) {
    const value = loadJson(key, null);
    if (value !== null) return value;
  }
  return fallback;
}

// ── URL safety ─────────────────────────────────────────────────────────────

export function safeUrl(value, options = {}) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw, window.location.origin);
    const allowedProtocols = options.allowMailto
      ? ['https:', 'http:', 'mailto:']
      : ['https:', 'http:'];
    if (!allowedProtocols.includes(url.protocol)) return '';
    return url.href;
  } catch {
    return '';
  }
}

export function safeImageUrl(value) {
  return safeUrl(value);
}

// ── Trusted URL navigation ─────────────────────────────────────────────────

export function openTrustedUrl(url) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function navigateCalendarWindow(url) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

// ── Date helpers ───────────────────────────────────────────────────────────

export function toDateInputValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function toTimeInputValue(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// ── Index-shift helpers (used when deleting items from ordered maps) ────────

export function shiftIndexedObjectAfterDelete(map, deletedIndex) {
  if (!map || typeof map !== 'object') return {};
  const result = {};
  Object.keys(map).forEach((key) => {
    const index = Number(key);
    if (!Number.isFinite(index) || index === deletedIndex) return;
    result[index < deletedIndex ? index : index - 1] = map[key];
  });
  return result;
}

// ── Normalisation helpers (reused across state.js and grading.js) ──────────

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}
