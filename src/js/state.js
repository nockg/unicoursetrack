/**
 * Core application state — loading, persistence, migration, and derived helpers.
 *
 * Mutable cross-module state lives in `store` (store.js).
 * Pure constants and config live in config.js.
 * Pure utilities live in utils.js.
 */

import { store } from './store.js';
import {
  deepClone, loadJson, firstExisting, hasStoredKey,
  safeUrl, safeImageUrl, openTrustedUrl, navigateCalendarWindow,
  toDateInputValue, toTimeInputValue, normalizeEmail,
} from './utils.js';
import {
  KEY, PREFS_KEY, PENDING_NEW_ACCOUNT_EMAIL_KEY,
  LEGACY_TRACKER_KEY, LEGACY_PREFS_KEY,
  LEGACY_STATE_KEYS, LEGACY_BLACKBOARD_KEYS, LEGACY_FORMULA_KEYS, LEGACY_EXAM_KEYS,
  DEFAULT_PREFERENCES, BASE_MODULES, MODULE_TERM_OPTIONS, HERO_BACKGROUNDS,
  CALENDAR_PROVIDERS, SUPPORTED_GRADING_SYSTEMS, BLOCKING_MODAL_SELECTORS,
  LIGHT_MODULE_COLOURS, DARK_MODULE_COLOURS, QUIET_MODULE_COLOURS, DARK_OFFWHITE_MODULE_COLOURS,
} from './config.js';

// ── Module-local UI state ──────────────────────────────────────────────────

let selectedTopicKeys = new Set();
let lastSelectedTopicKey = null;

let undoStack = [];
let redoStack = [];
let historyCurrentSnapshot = null;
let historyLocked = false;

let openModuleSections = {};

let calendarComposerPrefill = null;
let courseSetupInitial = false;
let selectedSetupTemplate = 'blank';

let modalScrollY = 0;

// grading-system-modal-selector
let activeGradingSystemSelectId = 'pref-grading-system';
let activeGradingGuideRegion = '';
let activeGradingGuideView = 'world';

// grading-selector-source-modal-flow-fix
let gradingSelectorReturnModalId = '';

// ── Default data ───────────────────────────────────────────────────────────

const defaultProfile = {
  name: '',
  university: '',
  course: '',
  startYear: new Date().getFullYear(),
  creditsTarget: 120,
  gradingSystem: 'uk',
  customGradeMapping: null,
};

const defaultState = {
  profile: deepClone(defaultProfile),
  years: {},
  ui: { currentYearId: 'year1', currentTermFilter: 'all' },
  setup: { templateChoiceMade: false },
};

// ── Factory functions ──────────────────────────────────────────────────────

export function createYearStore(modules) {
  return {
    modules: deepClone(modules),
    topics: {},
    coursework: {},
    courseworkComponents: {},
    exams: {},
    finalGrades: {},
    majorModules: {},
    termOptions: deepClone(MODULE_TERM_OPTIONS),
    notes: {},
    blackboard: {},
    formulas: {},
    relevantLinks: {},
    customLibraries: {},
    moduleColors: {},
    customExams: [],
    todos: [],
    archived: false,
  };
}

export function createInitialState() {
  const initial = deepClone(defaultState);
  initial.years.year1 = {
    id: 'year1',
    label: 'Year 1',
    store: createYearStore([]),
  };
  return initial;
}

// ── Normalisation helpers ──────────────────────────────────────────────────

export function normalizeTopicEntry(topic) {
  if (typeof topic === 'string') return { title: topic, subtopics: [], collapsed: false };
  if (!topic || typeof topic !== 'object') return { title: 'Untitled Topic', subtopics: [], collapsed: false };
  return {
    title: String(topic.title || topic.name || '').trim() || 'Untitled Topic',
    subtopics: Array.isArray(topic.subtopics)
      ? topic.subtopics.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
    collapsed: !!topic.collapsed,
  };
}

function normalizeModuleData(module) {
  if (!module || typeof module !== 'object') return module;
  return Object.assign({}, module, {
    term: window.normalizeTermValue ? window.normalizeTermValue(module.term || 'full') : (module.term || 'full'),
    topics: Array.isArray(module.topics) ? module.topics.map(normalizeTopicEntry) : [],
  });
}

// ── Migration functions ────────────────────────────────────────────────────

/**
 * Migrates the pre-years flat state shape (uos_aero_jp_v2 etc.) into the
 * multi-year schema. Called once during boot before ensureYearsState().
 */
export function migrateLegacyFlatStateToYears(flatState) {
  const migrated = deepClone(defaultState);
  const legacy = firstExisting(LEGACY_STATE_KEYS, {});
  const legacyBoard = firstExisting(LEGACY_BLACKBOARD_KEYS, {});
  const legacyFormula = firstExisting(LEGACY_FORMULA_KEYS, {});
  const legacyExams = firstExisting(LEGACY_EXAM_KEYS, []);
  const yearId = 'year1';
  migrated.years[yearId] = {
    id: yearId,
    label: 'Year 1',
    store: createYearStore(BASE_MODULES),
  };
  const ys = migrated.years[yearId].store;

  BASE_MODULES.forEach((mod, mi) => {
    mod.topics.forEach((_, ti) => {
      const key = `t_${mi}_${ti}`;
      if (legacy[key]) ys.topics[key] = true;
    });
    const cwKey = `cw_${mi}`;
    const exKey = `ex_${mi}`;
    const notesKey = `notes_${mi}`;
    if (legacy[cwKey] !== undefined) ys.coursework[mi] = legacy[cwKey];
    if (legacy[exKey] !== undefined) ys.exams[mi] = legacy[exKey];
    if (legacy[notesKey] !== undefined) ys.notes[mi] = legacy[notesKey];
    if (legacyBoard && legacyBoard[mi]) ys.blackboard[mi] = legacyBoard[mi];
    if (legacyFormula && legacyFormula[mi]) {
      ys.formulas[mi] = Array.isArray(legacyFormula[mi])
        ? legacyFormula[mi]
        : [{ name: mod.short + ' Formula Sheet', url: legacyFormula[mi] }];
    }
  });

  if (Array.isArray(legacyExams)) ys.customExams = legacyExams;
  return migrated;
}

/**
 * Migrates stale preference values to current names.
 * Runs once at boot before applyPreferences().
 */
export function migratePreferences() {
  const prefs = store.preferences;
  // "dark-offwhite" was removed; fall back to "dark"
  if (prefs.theme === 'dark-offwhite') prefs.theme = 'dark';
  // "classic" font renamed to "mono"
  if (prefs.font === 'classic') prefs.font = 'mono';
}

// ── State initialisation ───────────────────────────────────────────────────

Object.assign(
  store.preferences,
  DEFAULT_PREFERENCES,
  loadJson(PREFS_KEY, loadJson(LEGACY_PREFS_KEY, {}))
);

store.state = loadJson(KEY, null);
if (!store.state) {
  store.state = createInitialState();
  localStorage.setItem(KEY, JSON.stringify(store.state));
  // Fix #14: do NOT call saveCloud() here — this is a first-time local init
  // and the cloud session is not ready yet at this point in the boot sequence.
}

export function ensureYearsState() {
  const s = store.state;
  if (!s.profile) s.profile = deepClone(defaultProfile);
  if (!s.setup) s.setup = { templateChoiceMade: false };
  if (!s.ui) s.ui = {};
  if (!s.ui.currentTermFilter) s.ui.currentTermFilter = 'all';

  if (s.years && Object.keys(s.years).length) {
    if (!s.ui.currentYearId || !s.years[s.ui.currentYearId]) {
      s.ui.currentYearId = Object.keys(s.years)[0];
    }
    Object.values(s.years).forEach((year) => {
      if (!year.store) year.store = createYearStore([]);
      if (typeof window.ensureStoreTermOptions === 'function') window.ensureStoreTermOptions(year.store);
    });
    return;
  }

  // Fix #15: flat-to-years migration is now a named function.
  store.state = migrateLegacyFlatStateToYears(s);
  Object.assign(store.state, {
    profile: s.profile || deepClone(defaultProfile),
    setup: s.setup || { templateChoiceMade: false },
    ui: { currentYearId: 'year1', currentTermFilter: 'all' },
  });
  if (typeof window.ensureStoreTermOptions === 'function') {
    window.ensureStoreTermOptions(store.state.years.year1.store);
  }
  save();
}

ensureYearsState();

// ── Preference migration (after initial load) ──────────────────────────────

migratePreferences();

// ── State accessors ────────────────────────────────────────────────────────

export function getCurrentYear() {
  const s = store.state;
  return s.years[s.ui.currentYearId];
}

export function getStore() {
  return getCurrentYear().store;
}

export function refreshActiveYear() {
  const currentYear = getCurrentYear();
  if (typeof window.ensureStoreTermOptions === 'function') window.ensureStoreTermOptions(currentYear.store);
  const s = store.state;
  if (typeof window.isKnownTermValue === 'function' && !window.isKnownTermValue(s.ui.currentTermFilter)) {
    s.ui.currentTermFilter = 'all';
  }
  currentYear.store.modules = (currentYear.store.modules || []).map(normalizeModuleData);
  store.MODULES = currentYear.store.modules;
  const moduleCredits = store.MODULES.reduce((sum, mod) => sum + mod.credits, 0);
  const targetCredits = parseFloat(s.profile?.creditsTarget);
  store.TOTAL_CREDITS = Math.max(moduleCredits, Number.isFinite(targetCredits) ? targetCredits : 0);
}

refreshActiveYear();

// ── Topic entry helpers ────────────────────────────────────────────────────

export function getTopicEntry(mi, ti) {
  return normalizeTopicEntry(store.MODULES[mi]?.topics?.[ti]);
}

export function getModuleTopicStateSnapshot(mi) {
  const ys = getStore();
  return store.MODULES[mi].topics.map((_, ti) => {
    const topic = getTopicEntry(mi, ti);
    return {
      main: !!ys.topics[topicKey(mi, ti)],
      subs: topic.subtopics.map((_, si) => !!ys.topics[subtopicKey(mi, ti, si)]),
    };
  });
}

export function applyModuleTopicStateSnapshot(mi, snapshot) {
  const ys = getStore();
  Object.keys(ys.topics).forEach((key) => {
    if (key.startsWith(`t_${mi}_`) || key.startsWith(`s_${mi}_`)) delete ys.topics[key];
  });
  snapshot.forEach((value, ti) => {
    if (value.main) ys.topics[topicKey(mi, ti)] = true;
    value.subs.forEach((isDone, si) => {
      if (isDone) ys.topics[subtopicKey(mi, ti, si)] = true;
    });
  });
}

export function subtopicKey(mi, ti, si) {
  return `s_${mi}_${ti}_${si}`;
}

export function topicKey(mi, ti) {
  return `t_${mi}_${ti}`;
}

// ── Topic selection ────────────────────────────────────────────────────────

export function topicSelectionKey(mi, ti, si = null) {
  return si === null || si === undefined ? `m:${mi}:${ti}` : `s:${mi}:${ti}:${si}`;
}

export function parseTopicSelectionKey(key) {
  const parts = String(key || '').split(':');
  if (parts[0] === 'm' && parts.length === 3) {
    return { kind: 'main', mi: Number(parts[1]), ti: Number(parts[2]), si: null };
  }
  if (parts[0] === 's' && parts.length === 4) {
    return { kind: 'sub', mi: Number(parts[1]), ti: Number(parts[2]), si: Number(parts[3]) };
  }
  return null;
}

function getTopicSelectionOrder(mi) {
  const order = [];
  store.MODULES[mi]?.topics?.forEach((_, ti) => {
    order.push(topicSelectionKey(mi, ti));
    getTopicEntry(mi, ti).subtopics.forEach((__, si) => order.push(topicSelectionKey(mi, ti, si)));
  });
  return order;
}

export function isTopicSelected(mi, ti, si = null) {
  return selectedTopicKeys.has(topicSelectionKey(mi, ti, si));
}

export function getSelectedTopicCount(mi) {
  let count = 0;
  selectedTopicKeys.forEach((key) => {
    const parsed = parseTopicSelectionKey(key);
    if (parsed?.mi === mi) count += 1;
  });
  return count;
}

export function getSelectedTopicKeys() { return selectedTopicKeys; }

export function selectOnlyTopicKey(key) {
  selectedTopicKeys = new Set([key]);
  lastSelectedTopicKey = key;
}

export function clearTopicSelection(mi = null) {
  if (mi === null || mi === undefined) {
    selectedTopicKeys = new Set();
    lastSelectedTopicKey = null;
    return;
  }
  selectedTopicKeys = new Set(
    [...selectedTopicKeys].filter((key) => parseTopicSelectionKey(key)?.mi !== mi)
  );
  if (parseTopicSelectionKey(lastSelectedTopicKey)?.mi === mi) lastSelectedTopicKey = null;
}

export function getSelectedTopicModules() {
  return [...new Set(
    [...selectedTopicKeys]
      .map((key) => parseTopicSelectionKey(key)?.mi)
      .filter((value) => Number.isInteger(value))
  )];
}

export function applyTopicSelectionUI() {
  document.querySelectorAll('.topic-row').forEach((row) => {
    const key = row.dataset.topicKey;
    row.classList.toggle('selected', !!key && selectedTopicKeys.has(key));
  });
}

export function selectTopicRow(mi, ti, si = null, event = null) {
  const key = topicSelectionKey(mi, ti, si);
  if (event?.shiftKey) {
    const anchor = parseTopicSelectionKey(lastSelectedTopicKey);
    if (anchor && anchor.mi === mi) {
      const order = getTopicSelectionOrder(mi);
      const start = order.indexOf(lastSelectedTopicKey);
      const end = order.indexOf(key);
      if (start !== -1 && end !== -1) {
        const from = Math.min(start, end);
        const to = Math.max(start, end);
        clearTopicSelection(mi);
        order.slice(from, to + 1).forEach((entryKey) => selectedTopicKeys.add(entryKey));
        applyTopicSelectionUI();
        return;
      }
    }
  }
  if (event?.ctrlKey || event?.metaKey) {
    if (selectedTopicKeys.has(key)) selectedTopicKeys.delete(key);
    else selectedTopicKeys.add(key);
    lastSelectedTopicKey = key;
    applyTopicSelectionUI();
    return;
  }
  clearTopicSelection();
  selectedTopicKeys.add(key);
  lastSelectedTopicKey = key;
  applyTopicSelectionUI();
}

export async function handleSelectedTopicDeleteFromKeyboard(event) {
  if (event.key !== 'Delete' && event.key !== 'Backspace') return;
  const activeTag = document.activeElement?.tagName;
  if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
  const modules = getSelectedTopicModules();
  if (!modules.length) return;
  event.preventDefault();
  if (modules.length > 1) {
    await window.showAppNotice?.('One module at a time', 'Delete selected topics from one module at a time so the list stays predictable.');
    return;
  }
  await window.deleteSelectedTopicsInModule?.(modules[0]);
}

// ── Undo / redo ────────────────────────────────────────────────────────────

function serializeAppSnapshot() {
  return JSON.stringify({
    state: deepClone(store.state),
    preferences: deepClone(store.preferences),
  });
}

export function syncUndoBaseline() {
  undoStack.length = 0;
  redoStack.length = 0;
  historyCurrentSnapshot = serializeAppSnapshot();
}

export function rememberUndoState() {
  if (historyLocked) return;
  const nextSnapshot = serializeAppSnapshot();
  if (!historyCurrentSnapshot) {
    historyCurrentSnapshot = nextSnapshot;
    return;
  }
  if (nextSnapshot === historyCurrentSnapshot) return;
  redoStack.length = 0;
  undoStack.push(historyCurrentSnapshot);
  if (undoStack.length > 80) undoStack.shift();
  historyCurrentSnapshot = nextSnapshot;
}

function restoreAppSnapshot(snapshotString) {
  const snapshot = JSON.parse(snapshotString);
  historyLocked = true;
  store.state = snapshot.state;
  Object.keys(store.preferences).forEach((key) => delete store.preferences[key]);
  Object.assign(store.preferences, snapshot.preferences || DEFAULT_PREFERENCES);
  ensureYearsState();
  refreshActiveYear();
  applyPreferences();
  window.renderYearSelector?.();
  window.buildModules?.();
  window.renderStickyExams?.();
  window.renderDeadlineTimeline?.();
  window.updateGlobal?.();
  localStorage.setItem(KEY, JSON.stringify(store.state));
  localStorage.setItem(PREFS_KEY, JSON.stringify(store.preferences));
  historyLocked = false;
  historyCurrentSnapshot = serializeAppSnapshot();
  window.saveCloudDebounced?.();
}

export function undoLastAction() {
  const previous = undoStack.pop();
  if (!previous) return;
  redoStack.push(historyCurrentSnapshot);
  if (redoStack.length > 80) redoStack.shift();
  clearTopicSelection();
  restoreAppSnapshot(previous);
}

export function redoLastAction() {
  const next = redoStack.pop();
  if (!next) return;
  undoStack.push(historyCurrentSnapshot);
  if (undoStack.length > 80) undoStack.shift();
  clearTopicSelection();
  restoreAppSnapshot(next);
}

// ── Persistence ────────────────────────────────────────────────────────────

export function save() {
  rememberUndoState();
  if (typeof window.ensureLibraryState === 'function') window.ensureLibraryState();
  localStorage.setItem(KEY, JSON.stringify(store.state));
  window.saveCloudDebounced?.();
}

export function savePreferences() {
  rememberUndoState();
  localStorage.setItem(PREFS_KEY, JSON.stringify(store.preferences));
  window.saveCloudDebounced?.();
}

export function clearLocalTrackerStorage() {
  localStorage.removeItem(KEY);
  localStorage.removeItem(PREFS_KEY);
  localStorage.removeItem(LEGACY_TRACKER_KEY);
  localStorage.removeItem(LEGACY_PREFS_KEY);
  [...LEGACY_STATE_KEYS, ...LEGACY_BLACKBOARD_KEYS, ...LEGACY_FORMULA_KEYS, ...LEGACY_EXAM_KEYS]
    .forEach((k) => localStorage.removeItem(k));
}

// ── Undo baseline (after state is ready) ──────────────────────────────────

syncUndoBaseline();

// ── Module section management ─────────────────────────────────────────────

export function getModuleSectionStateKey(mi, section) {
  return `${store.state.ui?.currentYearId || 'year1'}:${mi}:${section}`;
}

export function isModuleSectionOpen(mi, section) {
  const key = getModuleSectionStateKey(mi, section);
  return openModuleSections[key] === undefined ? false : !!openModuleSections[key];
}

export function setModuleSectionOpen(mi, section, open) {
  const key = getModuleSectionStateKey(mi, section);
  openModuleSections[key] = !!open;
  const body = document.getElementById(`module-section-body-${mi}-${section}`);
  const chevron = document.getElementById(`module-section-chevron-${mi}-${section}`);
  if (body) body.classList.toggle('open', !!open);
  if (chevron) chevron.classList.toggle('open', !!open);
}

export function toggleModuleSection(mi, section, event) {
  if (event) event.stopPropagation();
  setModuleSectionOpen(mi, section, !isModuleSectionOpen(mi, section));
}

export function createModuleSection(mi, section, title, controlHtml = '') {
  const wrap = document.createElement('div');
  wrap.className = 'module-section ' + section + '-section' + (section === 'coursework' ? ' coursework-section' : '');
  wrap.innerHTML = `
    <div class="module-section-head">
      <button class="module-section-toggle" type="button" onclick="toggleModuleSection(${mi}, '${section}', event)">
        <span class="module-section-title">${title}</span>
        <span class="module-section-chevron" id="module-section-chevron-${mi}-${section}" aria-hidden="true"></span>
      </button>
      <div class="module-section-controls">${controlHtml}</div>
    </div>
    <div class="module-section-body" id="module-section-body-${mi}-${section}"></div>
  `;

  // Apply saved open/closed state immediately — avoids a collapsed-for-one-frame flash.
  const body = wrap.querySelector(`#module-section-body-${mi}-${section}`);
  const chevron = wrap.querySelector(`#module-section-chevron-${mi}-${section}`);
  const open = isModuleSectionOpen(mi, section);
  if (body) body.classList.toggle('open', open);
  if (chevron) chevron.classList.toggle('open', open);

  return { wrap, body };
}

// ── Module colour management ───────────────────────────────────────────────

export function isColourCustomisableTheme() {
  return store.preferences.theme === 'light' || store.preferences.theme === 'dark';
}

export function getModuleColourPalette() {
  if (store.preferences.theme === 'dark') return DARK_MODULE_COLOURS;
  if (store.preferences.theme === 'light') return LIGHT_MODULE_COLOURS;
  if (store.preferences.theme === 'quiet') return QUIET_MODULE_COLOURS;
  return DARK_MODULE_COLOURS;
}

export function getModuleColourChoice(mi) {
  const ys = getStore();
  if (!ys.moduleColors) ys.moduleColors = {};
  if (!isColourCustomisableTheme()) return 0;
  const chosen = ys.moduleColors[mi] || {};
  const family = store.preferences.theme === 'dark' ? 'dark' : 'light';
  const palette = getModuleColourPalette();
  const fallback = ((mi % palette.length) + palette.length) % palette.length;
  const index = Number.isInteger(chosen[family]) ? chosen[family] : fallback;
  return ((index % palette.length) + palette.length) % palette.length;
}

export function getModuleColourSet(mi) {
  const palette = getModuleColourPalette();
  if (!isColourCustomisableTheme()) return palette[((mi % palette.length) + palette.length) % palette.length];
  const ys = getStore();
  const chosen = ys.moduleColors?.[mi] || {};
  const family = store.preferences.theme === 'dark' ? 'dark' : 'light';
  const customHex = chosen[family];
  if (typeof customHex === 'string') return buildModuleColourFromHex(customHex);
  return palette[getModuleColourChoice(mi)] || palette[0];
}

function clampColourChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function normaliseHexColour(value, fallback = '#c0392b') {
  const text = String(value || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(text)) return text.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(text)) {
    return '#' + text.slice(1).split('').map((ch) => ch + ch).join('').toLowerCase();
  }
  return fallback;
}

function adjustHexColour(hex, amount) {
  const clean = normaliseHexColour(hex).slice(1);
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const next = [r, g, b]
    .map((channel) => clampColourChannel(channel + amount))
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('');
  return `#${next}`;
}

export function buildModuleColourFromHex(hex) {
  const base = normaliseHexColour(hex);
  const start = adjustHexColour(base, -18);
  const end = adjustHexColour(base, 26);
  const text = store.preferences.theme === 'dark' ? adjustHexColour(base, 72) : adjustHexColour(base, -8);
  return { stripe: base, fill: `linear-gradient(90deg, ${start}, ${end})`, text };
}

export function getStoredModuleColourHex(mi) {
  const palette = getModuleColourPalette();
  const fallback = (palette[getModuleColourChoice(mi)] || palette[0] || LIGHT_MODULE_COLOURS[0]).stripe;
  const ys = getStore();
  const chosen = ys.moduleColors?.[mi] || {};
  const family = store.preferences.theme === 'dark' ? 'dark' : 'light';
  return normaliseHexColour(chosen[family] || fallback, fallback);
}

export function setModuleColour(mi, colourValue, event) {
  if (event) event.stopPropagation();
  if (!isColourCustomisableTheme()) return;
  const ys = getStore();
  if (!ys.moduleColors) ys.moduleColors = {};
  const family = store.preferences.theme === 'dark' ? 'dark' : 'light';
  const current = ys.moduleColors[mi] || {};
  ys.moduleColors[mi] = Object.assign({}, current, { [family]: normaliseHexColour(colourValue) });
  save();
  window.buildModules?.();
  if (!document.getElementById('dashboard-modal').classList.contains('hidden')) {
    window.renderDashboardChart?.();
  }
}

// ── Auth UI helpers ────────────────────────────────────────────────────────

export function updateAuthLock() {
  const bootLocked = !store.bootComplete;
  const requiresAuth = bootLocked || store.authScreenLoading || !store.currentUser || window.isRecoveryFlow?.();
  document.body.classList.toggle('auth-required', requiresAuth);
  document.body.classList.toggle('auth-loading', bootLocked || store.authScreenLoading);
  if (requiresAuth) {
    window.renderAuthGate?.(window.isRecoveryFlow?.() ? 'recovery' : store.authViewMode);
  }
}

export function setAuthLoading(
  loading,
  title = 'Restoring your session...',
  message = 'Checking whether you are already signed in before showing anything.'
) {
  store.authScreenLoading = !!loading;
  store.authLoadingTitle = title;
  store.authLoadingMessage = message;
  updateAuthLock();
}

export function renderCloudUnavailableGate() {
  const host = document.getElementById('auth-gate-body');
  const asideCopy = document.querySelector('.auth-gate-copy');
  if (asideCopy) asideCopy.textContent = 'Cloud sign-in is unavailable.';
  if (!host) return;
  host.innerHTML = `
    <div class="auth-gate-card">
      <div class="auth-gate-label">Configuration Required</div>
      <div class="deadline-splash-title" style="color: var(--ink);">Cloud sign-in is not configured</div>
      <div class="auth-gate-message">Set <code>window.UNITRACK_CONFIG.supabaseUrl</code> and <code>window.UNITRACK_CONFIG.supabaseAnonKey</code> in <code>/config.js</code>, then refresh.</div>
      <div id="auth-gate-feedback" class="auth-error">The app is locked until Supabase configuration is available.</div>
    </div>
  `;
}

// ── User helpers ───────────────────────────────────────────────────────────

export function isFreshSupabaseUser(user) {
  const createdAt = user?.created_at ? Date.parse(user.created_at) : NaN;
  return Number.isFinite(createdAt) && Date.now() - createdAt < 20 * 60 * 1000;
}

export function markPendingNewAccount(email) {
  const normalized = normalizeEmail(email);
  if (normalized) localStorage.setItem(PENDING_NEW_ACCOUNT_EMAIL_KEY, normalized);
}

export function clearPendingNewAccount(email) {
  const normalized = normalizeEmail(email);
  if (!normalized || localStorage.getItem(PENDING_NEW_ACCOUNT_EMAIL_KEY) === normalized) {
    localStorage.removeItem(PENDING_NEW_ACCOUNT_EMAIL_KEY);
  }
}

export function isPendingNewAccount(email) {
  return !!email && localStorage.getItem(PENDING_NEW_ACCOUNT_EMAIL_KEY) === normalizeEmail(email);
}

// ── Course setup modal ─────────────────────────────────────────────────────

export function setupCourseIfNeeded() {
  const profile = store.state.profile || deepClone(defaultProfile);
  if (!store.pendingFirstRunSetup && profile.course && profile.university) return;
  openCourseSetupModal(true);
}

export function selectSetupTemplate(template) {
  selectedSetupTemplate = template === 'aero' ? 'aero' : 'blank';
  const blank = document.getElementById('setup-choice-blank');
  const aero = document.getElementById('setup-choice-aero');
  if (blank) blank.classList.toggle('active', selectedSetupTemplate === 'blank');
  if (aero) aero.classList.toggle('active', selectedSetupTemplate === 'aero');
}

export function openCourseSetupModal(isInitialSetup = false) {
  courseSetupInitial = isInitialSetup;
  const current = Object.assign({}, defaultProfile, store.state.profile || {});
  const isEditingExisting = !!(current.course && current.university);
  const linkedStatus = document.getElementById('setup-linked-status');
  document.getElementById('course-setup-title').textContent = isInitialSetup ? 'Set Up Your Tracker' : 'Edit Course Setup';
  document.getElementById('course-setup-copy').textContent = isInitialSetup
    ? 'Tell me a little about you and your course so the tracker starts off personalised from the first screen.'
    : 'Update your name, course details, and yearly targets here.';
  if (linkedStatus) {
    const showLinked = isInitialSetup && !!store.currentUser;
    linkedStatus.classList.toggle('hidden', !showLinked);
    linkedStatus.innerHTML = showLinked
      ? `Cloud account linked to <strong>${window.escapeHtml?.(store.currentUser.email || 'your email') || store.currentUser.email}</strong>`
      : '';
  }
  document.getElementById('setup-name-input').value = current.name || '';
  document.getElementById('setup-university-input').value = current.university || '';
  document.getElementById('setup-course-input').value = current.course || '';
  document.getElementById('setup-start-year-input').value = current.startYear || new Date().getFullYear();
  document.getElementById('setup-credits-input').value = current.creditsTarget || 120;
  const gradingInput = document.getElementById('setup-grading-system-input');
  if (gradingInput) gradingInput.value = current.gradingSystem || 'uk';
  updateSetupCreditLabel();
  document.getElementById('setup-template-block').classList.toggle('hidden', !isInitialSetup);
  document.getElementById('course-setup-cancel').classList.toggle('hidden', isInitialSetup);
  document.getElementById('course-setup-close').classList.toggle('hidden', isInitialSetup);
  if (isInitialSetup) {
    const hasModules = !!getCurrentYear()?.store?.modules?.length;
    selectSetupTemplate(hasModules ? 'aero' : 'blank');
  } else {
    selectSetupTemplate('blank');
  }
  document.body.classList.toggle('setup-required', isInitialSetup);
  document.getElementById('course-setup-modal').classList.remove('hidden');
  syncModalScrollLock();
  if (!isEditingExisting && isInitialSetup) {
    document.getElementById('setup-name-input').focus();
  }
}

export function closeCourseSetupModal() {
  if (courseSetupInitial) return;
  document.body.classList.remove('setup-required');
  document.getElementById('course-setup-modal').classList.add('hidden');
  syncModalScrollLock();
}

export function editCourseProfile() {
  window.closeAuthModal?.(true);
  openCourseSetupModal(false);
}

export function saveCourseSetup() {
  const name = document.getElementById('setup-name-input').value.trim();
  const universityInput = document.getElementById('setup-university-input').value.trim();
  const courseInput = document.getElementById('setup-course-input').value.trim();
  const startYearInput = parseInt(document.getElementById('setup-start-year-input').value, 10);
  const creditsInput = parseFloat(document.getElementById('setup-credits-input').value);
  const gradingInput = document.getElementById('setup-grading-system-input');
  const gradingSystem = SUPPORTED_GRADING_SYSTEMS.includes(gradingInput?.value) ? gradingInput.value : 'uk';

  const university = universityInput || (selectedSetupTemplate === 'aero' ? 'University of Sheffield' : 'University');
  const course = courseInput || (selectedSetupTemplate === 'aero' ? 'Aerospace Engineering' : 'Course');

  store.state.profile = {
    name,
    university,
    course,
    startYear: Number.isFinite(startYearInput) ? startYearInput : new Date().getFullYear(),
    creditsTarget: Number.isFinite(creditsInput) ? creditsInput : 120,
    gradingSystem,
    customGradeMapping: Array.isArray(store.state.profile?.customGradeMapping)
      ? store.state.profile.customGradeMapping
      : null,
  };
  if (gradingSystem === 'custom' && !Array.isArray(store.state.profile.customGradeMapping)) {
    store.state.profile.customGradeMapping = deepClone(window.US_GRADE_OPTIONS || []);
  }

  if (courseSetupInitial) {
    const currentYear = getCurrentYear();
    currentYear.store = createYearStore(selectedSetupTemplate === 'aero' ? BASE_MODULES : []);
    store.state.ui.currentTermFilter = 'all';
    if (!store.state.setup) store.state.setup = {};
    store.state.setup.templateChoiceMade = true;
  }

  save();
  refreshActiveYear();
  window.renderYearSelector?.();
  window.buildModules?.();
  window.renderStickyExams?.();
  window.updateGlobal?.();
  document.body.classList.remove('setup-required');
  document.getElementById('course-setup-modal').classList.add('hidden');
  courseSetupInitial = false;
  if (store.pendingFirstRunSetup) {
    clearPendingNewAccount(store.currentUser?.email);
    window.saveCloudNow?.();
  }
  if (store.pendingOnboarding) window.maybeShowOnboarding?.();
}

function getSetupCreditTargetLabel(system) {
  if (system === 'au7') return 'Target Units';
  if (system === 'au4') return 'Target Units';
  if (system === 'us4' || system === 'us43') return 'Target GPA Hours';
  if (system === 'nz9') return 'Target Points';
  if (system === 'de5') return 'Target ECTS';
  return 'Target Credits';
}

export function updateSetupCreditLabel() {
  const setupCreditsLabel = document.getElementById('setup-credits-label');
  const gradingInput = document.getElementById('setup-grading-system-input');
  if (!setupCreditsLabel) return;
  const system = SUPPORTED_GRADING_SYSTEMS.includes(gradingInput?.value)
    ? gradingInput.value
    : (store.state.profile?.gradingSystem || 'uk');
  setupCreditsLabel.textContent = getSetupCreditTargetLabel(system);
}

document.getElementById('setup-grading-system-input')?.addEventListener('change', updateSetupCreditLabel);

if (store.currentUser && store.pendingFirstRunSetup) {
  setupCourseIfNeeded();
}

export function shouldShowTemplateSplash() {
  const profile = store.state.profile || deepClone(defaultProfile);
  if (!profile.course || !profile.university) return false;
  if (store.state.setup?.templateChoiceMade) return false;
  const currentYear = getCurrentYear();
  return !!currentYear && currentYear.store.modules.length === 0;
}

export function showTemplateSplash() {
  if (!store.currentUser) return;
  if (!store.pendingFirstRunSetup) return;
  if (store.cloudHadSave) return;
  if (!shouldShowTemplateSplash()) return;
  document.getElementById('template-splash').classList.remove('hidden');
}

export function dismissTemplateSplash() {
  if (!store.state.setup) store.state.setup = {};
  store.state.setup.templateChoiceMade = true;
  save();
  document.getElementById('template-splash').classList.add('hidden');
}

// ── Preferences management ─────────────────────────────────────────────────

export function applyPreferences() {
  const prefs = store.preferences;
  if (!CALENDAR_PROVIDERS[prefs.calendarProvider]) {
    prefs.calendarProvider = DEFAULT_PREFERENCES.calendarProvider;
  }
  document.body.classList.toggle('theme-dark', prefs.theme === 'dark');
  document.body.classList.toggle('theme-quiet', prefs.theme === 'quiet');
  document.body.classList.toggle('compact-ui', prefs.density === 'compact');
  document.body.classList.toggle('font-sans', prefs.font === 'sans');
  document.body.classList.toggle('font-mono', prefs.font === 'mono');
  document.body.classList.toggle('countdown-header-hidden', prefs.showCountdownHeader === false);

  const themeSelect = document.getElementById('pref-theme');
  const densitySelect = document.getElementById('pref-density');
  const fontSelect = document.getElementById('pref-font');
  const calendarSelect = document.getElementById('pref-calendar');
  const gradingSelect = document.getElementById('pref-grading-system');
  const countdownToggle = document.getElementById('pref-countdown-header-toggle');
  const customBgInput = document.getElementById('custom-bg-url');
  const bodyBgInput = document.getElementById('body-bg-url');
  const hero = document.querySelector('.hero');
  const allBackgrounds = { ...HERO_BACKGROUNDS, ...(prefs.customBackgrounds || {}) };
  if (!allBackgrounds[prefs.hero]) prefs.hero = DEFAULT_PREFERENCES.hero;

  if (hero && allBackgrounds[prefs.hero]) {
    hero.style.setProperty('--hero-bg', `url("${allBackgrounds[prefs.hero]}")`);
  }
  if (prefs.bodyBackground) {
    document.body.classList.add('has-body-background');
    document.body.style.setProperty('--page-bg', `url("${prefs.bodyBackground}")`);
  } else {
    document.body.classList.remove('has-body-background');
    document.body.style.removeProperty('--page-bg');
  }
  if (themeSelect) themeSelect.value = prefs.theme;
  if (densitySelect) densitySelect.value = prefs.density;
  if (fontSelect) fontSelect.value = prefs.font || 'japanese';
  if (calendarSelect) calendarSelect.value = prefs.calendarProvider || 'google';
  if (gradingSelect) gradingSelect.value = window.getGradingSystem?.() || 'uk';
  document.getElementById('custom-grade-map-field')?.classList.toggle(
    'hidden', (window.getGradingSystem?.() || 'uk') !== 'custom'
  );
  if (countdownToggle) {
    const countdownVisible = prefs.showCountdownHeader !== false;
    countdownToggle.textContent = countdownVisible ? 'Shown' : 'Hidden';
    countdownToggle.classList.toggle('is-on', countdownVisible);
    countdownToggle.setAttribute('aria-pressed', String(countdownVisible));
  }
  if (customBgInput) {
    const heroKey = prefs.hero || '';
    const currentCustomUrl = heroKey.startsWith('custom_') ? (prefs.customBackgrounds?.[heroKey] || '') : '';
    customBgInput.value = currentCustomUrl;
  }
  if (bodyBgInput) bodyBgInput.value = prefs.bodyBackground || '';

  window.renderBackgroundPicker?.();
}

export function setPreference(key, value) {
  store.preferences[key] = value;
  savePreferences();
  applyPreferences();
  window.buildModules?.();
  window.updateGlobal?.();
  if (!document.getElementById('dashboard-modal').classList.contains('hidden')) {
    window.renderDashboardChart?.();
  }
}

export function setGradingSystemPreference(value) {
  const gradingSystem = SUPPORTED_GRADING_SYSTEMS.includes(value) ? value : 'uk';
  if (!store.state.profile) store.state.profile = deepClone(defaultProfile);
  store.state.profile.gradingSystem = gradingSystem;
  if (gradingSystem === 'custom' && !Array.isArray(store.state.profile.customGradeMapping)) {
    store.state.profile.customGradeMapping = deepClone(window.US_GRADE_OPTIONS || []);
  }
  save();
  applyPreferences();
  window.buildModules?.();
  window.updateGlobal?.();
  if (!document.getElementById('dashboard-modal').classList.contains('hidden')) {
    window.renderDashboardChart?.();
  }
}

export async function editCustomGradeMapping() {
  if (!store.state.profile) store.state.profile = deepClone(defaultProfile);
  const current = window.serializeGradeMapping?.(window.getCustomGradeOptions?.()) || '';
  const result = await window.appPrompt?.({
    label: 'Grade Mapping',
    title: 'Edit Custom Grade Mapping',
    message: 'Use comma-separated grade=point pairs. Example: A+=4.30, A=4.00, B=3.00, F=0.00',
    inputLabel: 'Mapping',
    defaultValue: current,
    placeholder: 'A=4.00, B=3.00, C=2.00, D=1.00, F=0.00',
    confirmText: 'Save Mapping',
  });
  if (!result) return;
  const parsed = window.parseCustomGradeMapping?.(result.value) || [];
  if (!parsed.length) {
    await window.showAppNotice?.('Mapping not saved', 'Enter at least one grade=point pair, such as A=4.00.');
    return;
  }
  store.state.profile.customGradeMapping = parsed;
  store.state.profile.gradingSystem = 'custom';
  save();
  applyPreferences();
  window.buildModules?.();
  window.updateGlobal?.();
}

export function toggleCountdownHeaderPreference() {
  store.preferences.showCountdownHeader = store.preferences.showCountdownHeader === false;
  savePreferences();
  applyPreferences();
}

export function addCustomBackground() {
  const rawUrl = document.getElementById('custom-bg-url').value.trim();
  const url = safeImageUrl(rawUrl);
  if (!url) {
    window.showAppNotice?.('Invalid image URL', 'Use a normal http or https image URL.');
    return;
  }
  if (!store.preferences.customBackgrounds) store.preferences.customBackgrounds = {};
  const currentKey = store.preferences.hero || '';
  const customKey = currentKey.startsWith('custom_') ? currentKey : 'custom_' + Date.now();
  store.preferences.customBackgrounds[customKey] = url;
  store.preferences.hero = customKey;
  savePreferences();
  applyPreferences();
}

export function setBodyBackground() {
  const rawUrl = document.getElementById('body-bg-url').value.trim();
  const url = rawUrl ? safeImageUrl(rawUrl) : '';
  if (rawUrl && !url) {
    window.showAppNotice?.('Invalid image URL', 'Use a normal http or https image URL.');
    return;
  }
  store.preferences.bodyBackground = url;
  savePreferences();
  applyPreferences();
}

export function clearBodyBackground() {
  store.preferences.bodyBackground = '';
  savePreferences();
  applyPreferences();
}

export function clearCustomBackground() {
  const heroKey = store.preferences.hero || '';
  if (heroKey.startsWith('custom_') && store.preferences.customBackgrounds) {
    delete store.preferences.customBackgrounds[heroKey];
  }
  store.preferences.hero = DEFAULT_PREFERENCES.hero;
  savePreferences();
  applyPreferences();
}

export function setPreferencesOpen(open) {
  const panel = document.getElementById('prefs-panel');
  if (!panel) return;
  const shouldOpen = open === undefined ? panel.classList.contains('hidden') : !!open;
  if (!shouldOpen && panel.contains(document.activeElement)) {
    (document.querySelector('.prefs-toggle-btn') || document.body).focus();
  }
  panel.classList.toggle('hidden', !shouldOpen);
  panel.setAttribute('aria-hidden', String(!shouldOpen));
  if (shouldOpen) panel.scrollTop = 0;
}

export function openPreferences() { setPreferencesOpen(true); }
export function closePreferences() { setPreferencesOpen(false); }
export function togglePreferences() { setPreferencesOpen(); }

export function openPreferredCalendar() { openCalendarComposer(); }

// ── Scroll lock ────────────────────────────────────────────────────────────

export function isMobileViewport() {
  return window.matchMedia?.('(max-width: 760px)')?.matches || window.innerWidth <= 760;
}

export function lockPageScroll() {
  if (document.body.classList.contains('modal-scroll-locked')) return;
  modalScrollY = window.scrollY || document.documentElement.scrollTop || 0;
  const fixedScrollLock = !isMobileViewport();
  document.body.dataset.scrollLockFixed = fixedScrollLock ? 'true' : 'false';
  if (fixedScrollLock) document.body.style.top = `-${modalScrollY}px`;
  document.body.classList.add('modal-scroll-locked');
}

export function unlockPageScroll() {
  if (!document.body.classList.contains('modal-scroll-locked')) return;
  const shouldRestoreScroll = document.body.dataset.scrollLockFixed === 'true';
  document.body.classList.remove('modal-scroll-locked');
  document.body.style.top = '';
  delete document.body.dataset.scrollLockFixed;
  if (shouldRestoreScroll) window.scrollTo(0, modalScrollY);
}

export function isBlockingModalOpen() {
  return BLOCKING_MODAL_SELECTORS.some((selector) => {
    const node = document.querySelector(selector);
    return !!node && !node.classList.contains('hidden');
  });
}

export function syncModalScrollLock() {
  if (isBlockingModalOpen()) lockPageScroll();
  else unlockPageScroll();
}

// ── Calendar composer ─────────────────────────────────────────────────────

export function openSelectedCalendar() {
  const providerKey = store.preferences.calendarProvider || 'google';
  if (providerKey === 'outlook') {
    navigateCalendarWindow('https://outlook.live.com/calendar/0/view/month');
    return;
  }
  if (providerKey === 'apple') {
    navigateCalendarWindow('https://www.icloud.com/calendar/');
    return;
  }
  navigateCalendarWindow('https://calendar.google.com/calendar/u/0/r');
}

export function openCalendarComposer(prefill = null) {
  calendarComposerPrefill = prefill;
  const now = new Date();
  const later = new Date(now.getTime() + 60 * 60 * 1000);
  const start = prefill?.start || now;
  const end = prefill?.end || later;
  document.getElementById('calendar-form-title').textContent = prefill?.title ? 'Add Calendar Event' : 'Open Calendar';
  document.getElementById('calendar-title-input').value = prefill?.title || '';
  document.getElementById('calendar-start-date-input').value = toDateInputValue(start);
  document.getElementById('calendar-start-time-input').value = toTimeInputValue(start);
  document.getElementById('calendar-end-date-input').value = toDateInputValue(end);
  document.getElementById('calendar-end-time-input').value = toTimeInputValue(end);
  document.getElementById('calendar-all-day-input').value = prefill?.allDay ? 'true' : 'false';
  document.getElementById('calendar-show-as-input').value = prefill?.availability || 'BUSY';
  document.getElementById('calendar-location-input').value = prefill?.location || '';
  document.getElementById('calendar-notes-input').value = prefill?.details || '';
  if (typeof window.setCalendarComposerPriority === 'function') {
    window.setCalendarComposerPriority(prefill?.priority || 'default');
  }
  updateCalendarComposerMode();
  document.getElementById('calendar-modal').classList.remove('hidden');
  syncModalScrollLock();
}

export function closeCalendarComposer() {
  document.getElementById('calendar-modal').classList.add('hidden');
  syncModalScrollLock();
}

export function updateCalendarComposerMode() {
  const allDay = document.getElementById('calendar-all-day-input')?.value === 'true';
  const startTime = document.getElementById('calendar-start-time-input');
  const endTime = document.getElementById('calendar-end-time-input');
  if (startTime) startTime.disabled = allDay;
  if (endTime) endTime.disabled = allDay;
}

export function buildCalendarEventFromComposer() {
  const title = document.getElementById('calendar-title-input').value.trim();
  const startDate = document.getElementById('calendar-start-date-input').value;
  const startTime = document.getElementById('calendar-start-time-input').value || '09:00';
  const endDate = document.getElementById('calendar-end-date-input').value || startDate;
  const endTime = document.getElementById('calendar-end-time-input').value || startTime;
  const allDay = document.getElementById('calendar-all-day-input').value === 'true';
  const availability = document.getElementById('calendar-show-as-input').value || 'BUSY';
  const location = document.getElementById('calendar-location-input').value.trim();
  const rawDetails = document.getElementById('calendar-notes-input').value.trim();
  const priority = typeof window.getSelectedCalendarComposerPriority === 'function'
    ? window.getSelectedCalendarComposerPriority()
    : 'default';
  const details = priority !== 'default'
    ? [`Priority: ${priority.charAt(0).toUpperCase() + priority.slice(1)}`, rawDetails].filter(Boolean).join('\n\n')
    : rawDetails;
  if (!title || !startDate || !endDate) return null;
  const start = allDay ? new Date(`${startDate}T00:00`) : new Date(`${startDate}T${startTime}`);
  const end = allDay
    ? new Date(new Date(`${endDate}T00:00`).getTime() + 24 * 60 * 60 * 1000)
    : new Date(`${endDate}T${endTime}`);
  if (!(start instanceof Date) || Number.isNaN(start.getTime()) || !(end instanceof Date) || Number.isNaN(end.getTime()) || end <= start) return null;
  return { title, start, end, allDay, availability, location, details, priority };
}

export function submitCalendarComposer() {
  const eventData = buildCalendarEventFromComposer();
  if (!eventData) return;
  window.openCalendarEvent?.(eventData);
  closeCalendarComposer();
}

export function openYouTube() {
  openTrustedUrl('https://www.youtube.com/');
}

// ── Grading system guide modal ─────────────────────────────────────────────

export function getGradingSystemGuideOptions() {
  return [
    {
      group: 'UK', tone: 'uk',
      items: [{ value: 'uk', title: 'UK Honours / Percentage', meta: '0–100% · First · 2:1 · 2:2 · Third' }],
    },
    {
      group: 'United States', tone: 'us',
      items: [
        { value: 'us4', title: 'US 4.00 GPA', meta: 'A / A+ = 4.00 · B+ = 3.30' },
        { value: 'us43', title: 'US 4.30 GPA', meta: 'A+ = 4.30 · A = 4.00' },
      ],
    },
    {
      group: 'Australia', tone: 'au',
      items: [
        { value: 'au7', title: 'Australia 7.00 GPA', meta: 'HD = 7 · D = 6 · Credit = 5 · Pass = 4' },
        { value: 'au4', title: 'Australia 4.00 GPA', meta: 'HD = 4 · D = 3 · Credit = 2 · Pass = 1' },
      ],
    },
    {
      group: 'Asia-Pacific', tone: 'apac',
      items: [
        { value: 'my4', title: 'Malaysia 4.00 GPA', meta: 'A = 4.00 · A- = 3.67 · B+ = 3.33' },
        { value: 'cn4', title: 'China Mainland 100-point', meta: 'Main score: 0–100 · GPA estimate shown' },
        { value: 'nz9', title: 'New Zealand 9.00 GPA', meta: 'A+ = 9 · A = 8 · A- = 7' },
      ],
    },
    {
      group: 'Europe', tone: 'eu',
      items: [{ value: 'de5', title: 'Germany 1.0–5.0 Grade', meta: '1.0 best · 4.0 pass · 5.0 fail' }],
    },
    {
      group: 'Advanced', tone: 'advanced',
      items: [{ value: 'custom', title: 'Custom Mapping', meta: "Use your university's own table" }],
    },
  ];
}

export function getGradingGuideGroupForValue(value) {
  for (const group of getGradingSystemGuideOptions()) {
    if (group.items.some((item) => item.value === value)) return group.group;
  }
  return getGradingSystemGuideOptions()[0]?.group || 'UK';
}

export function setActiveGradingGuideRegion(groupName) {
  activeGradingGuideRegion = groupName;
  ensureGradingSystemGuideModal();
}

export function setGradingGuideViewMode(mode) {
  activeGradingGuideView = mode === 'world' ? 'world' : 'list';
  ensureGradingSystemGuideModal();
}

export function previewGradingGuideRegion(groupName) {
  const canHover = window.matchMedia?.('(hover: hover) and (min-width: 761px)')?.matches;
  if (!canHover) return;
  document.querySelectorAll('.grading-map-pin').forEach((pin) => {
    pin.classList.toggle('is-preview', pin.dataset.region === groupName);
  });
}

export function clearGradingGuideRegionPreview() {
  document.querySelectorAll('.grading-map-pin').forEach((pin) => {
    pin.classList.remove('is-preview');
  });
}

export function getGradingSystemOptionTitle(value) {
  for (const group of getGradingSystemGuideOptions()) {
    const found = group.items.find((item) => item.value === value);
    if (found) return found.title;
  }
  return 'Choose grading system';
}

function getGradingGuideWorldMapSvg() {
  // Equirectangular projection: x = (lon + 161) * 2.367   y = (98 - lat) * 2.489
  return `
    <svg viewBox="0 0 800 420" class="grading-guide-world-svg" role="img" aria-label="World map" preserveAspectRatio="xMidYMid meet">
      <g class="map-outline">
        <!-- North America -->
        <path d="M12,67 C6,74 0,82 0,92 L0,107 C10,103 16,101 21,100
                 C44,97 60,104 73,105 C82,113 88,119 90,122
                 C89,127 88,129 88,130 C90,140 91,146 92,150
                 C98,158 102,161 104,164 C111,173 117,181 121,187
                 C132,192 144,195 154,197 C161,195 166,193 169,192
                 C176,200 181,206 184,209 C192,219 199,224 199,224
                 C205,218 208,208 204,194 C199,187 194,184 191,182
                 C194,172 198,164 200,157 C206,150 211,144 215,139
                 C220,136 222,135 224,134 C234,130 245,128 255,127
                 C251,121 249,119 247,117 C246,113 245,111 245,110
                 C237,101 232,96 229,92 C222,89 218,88 216,87
                 C208,78 199,73 191,70 C175,67 148,65 109,65
                 C90,66 72,68 50,72 Z" />
        <!-- Florida peninsula stub -->
        <path d="M191,182 C188,185 186,188 185,192 C183,197 186,200 191,198
                 C194,196 195,190 191,182 Z" />
        <!-- Greenland -->
        <path d="M252,60 C258,50 270,44 283,41 C296,38 306,41 310,49
                 C306,59 298,64 284,66 C268,67 255,64 252,60 Z" />
        <!-- South America -->
        <path d="M199,224 C201,231 200,239 200,245
                 C207,251 215,256 216,260 C222,260 230,259 237,259
                 C240,263 240,267 239,272 C233,281 227,290 222,302
                 C218,312 217,320 218,331 C216,341 214,347 214,349
                 C215,360 217,369 218,376 C217,381 214,384 213,384
                 C207,376 204,364 202,353 C200,340 198,328 198,318
                 C198,307 200,297 202,287 C203,275 202,263 200,251
                 C199,243 198,233 199,224 Z" />
        <!-- Cuba (island stub) -->
        <path d="M183,190 C188,188 196,187 202,190 C200,193 194,193 183,190 Z" />
        <!-- UK — Great Britain -->
        <path d="M373,100 C377,96 384,96 388,102 C391,110 389,118 383,122
                 C377,121 373,117 371,112 C370,106 371,103 373,100 Z" />
        <!-- UK — Ireland -->
        <path d="M362,107 C366,101 372,101 374,107 C374,114 369,118 363,114
                 C360,110 360,108 362,107 Z" />
        <!-- Iberian Peninsula -->
        <path d="M357,134 C362,130 368,128 372,127 C377,126 380,125 381,117
                 C384,115 388,114 391,114 C389,122 387,127 384,132
                 C380,137 376,142 375,148 C372,152 367,154 362,154
                 C357,150 355,143 357,134 Z" />
        <!-- Europe mainland + Scandinavia -->
        <path d="M381,117 C384,115 388,114 391,114 C397,110 401,104 403,102
                 C401,99 399,98 400,99 C395,92 392,88 391,87
                 C395,81 403,76 413,73 C421,71 430,70 437,69
                 C441,69 445,68 448,70 C451,80 453,88 453,95
                 C455,104 458,114 460,121 C461,128 460,131 459,130
                 C462,127 465,124 467,121 C470,117 472,112 472,107
                 C464,108 460,109 453,109 C443,116 435,121 426,127
                 C418,132 413,134 413,134 C410,134 407,133 407,132
                 C404,132 400,134 393,134 C388,138 383,142 381,144
                 C378,148 375,151 375,148 C378,142 381,136 381,130
                 C381,125 381,120 381,117 Z" />
        <!-- Italian peninsula -->
        <path d="M413,134 C415,137 417,141 418,145 C420,149 419,152 416,154
                 C413,151 410,146 409,140 C408,136 410,133 413,134 Z" />
        <!-- Scandinavian peninsula -->
        <path d="M403,102 C401,97 399,91 400,87 C403,81 408,77 414,74
                 C421,71 430,70 437,69 C441,69 445,68 448,70
                 C446,77 442,83 436,87 C429,91 422,94 416,96
                 C410,99 405,101 403,102 Z" />
        <!-- Africa -->
        <path d="M357,154 C362,154 367,154 375,152 C381,157 388,164 393,172
                 C398,181 400,191 400,201 C401,213 399,223 398,233
                 C397,244 400,255 406,266 C411,278 417,291 419,306
                 C421,320 417,335 408,346 C399,357 386,364 374,363
                 C361,360 351,352 345,338 C340,322 342,306 346,290
                 C350,273 353,257 352,241 C351,225 347,209 344,193
                 C342,179 345,166 350,158 Z" />
        <!-- Horn of Africa -->
        <path d="M419,306 C422,313 424,320 422,328 C416,337 408,346 408,346
                 C411,338 418,328 417,318 C415,312 416,308 419,306 Z" />
        <!-- Asia (main body) -->
        <path d="M453,95 C450,99 447,103 443,107 C440,110 436,112 432,114
                 C427,117 422,120 415,124 C411,127 408,130 407,132
                 C410,133 413,134 413,134 C420,132 429,130 438,130
                 C446,129 454,127 461,123 C468,119 476,113 483,107
                 C492,100 503,94 516,89 C530,84 547,81 565,80
                 C583,79 602,81 622,85 C641,89 660,95 678,102
                 C694,108 708,115 720,123 C731,130 740,138 744,147
                 C746,155 744,163 736,168 C726,173 712,174 696,172
                 C680,170 662,166 644,163 C628,160 612,160 597,163
                 C580,167 565,174 551,181 C539,187 528,194 518,199
                 C510,203 501,206 492,205 C481,204 471,199 463,191
                 C456,183 452,172 452,161 C452,148 453,120 453,95 Z" />
        <!-- Indian subcontinent -->
        <path d="M518,199 C523,200 531,199 539,195 C547,190 553,183 556,190
                 C559,199 559,212 555,226 C551,240 543,254 534,266
                 C525,277 516,285 514,287 C507,279 500,265 496,249
                 C492,233 492,217 496,205 C502,198 510,196 518,199 Z" />
        <!-- SE Asia / Malay Peninsula -->
        <path d="M597,163 C611,162 624,162 636,164 C648,167 658,172 664,180
                 C668,186 666,193 658,197 C649,200 637,199 625,196
                 C614,192 604,186 598,179 C593,172 593,166 597,163 Z" />
        <!-- Indonesia / Borneo -->
        <path d="M636,196 C648,196 660,199 670,206 C678,212 682,220 676,227
                 C668,232 655,230 645,223 C635,216 632,206 636,196 Z" />
        <path d="M680,208 C692,213 703,220 710,229 C715,236 713,243 706,245
                 C698,245 688,239 682,230 C677,221 677,212 680,208 Z" />
        <path d="M644,224 C654,226 662,233 664,241 C662,248 654,250 645,247
                 C638,242 636,234 644,224 Z" />
        <!-- Philippines -->
        <path d="M688,168 C692,165 697,166 698,172 C697,177 692,178 688,175
                 C686,172 686,169 688,168 Z" />
        <!-- Japan — Honshu -->
        <path d="M716,106 C720,102 727,101 731,107 C732,114 729,120 723,121
                 C717,119 714,114 716,106 Z" />
        <!-- Japan — Kyushu/Shikoku -->
        <path d="M709,120 C713,117 719,118 721,123 C721,129 717,132 712,131
                 C708,128 708,123 709,120 Z" />
        <!-- Hokkaido -->
        <path d="M726,93 C730,89 735,91 737,97 C736,102 733,104 729,102
                 C726,100 725,96 726,93 Z" />
        <!-- Australia -->
        <path d="M607,296 C620,286 638,281 656,279 C674,277 691,281 706,291
                 C720,300 731,313 735,328 C738,342 734,356 725,365
                 C715,374 700,378 683,378 C666,376 649,370 634,360
                 C618,349 607,334 603,318 Z" />
        <!-- Tasmania -->
        <path d="M662,379 C667,379 671,383 671,388 C669,392 664,392 661,389
                 C658,385 659,380 662,379 Z" />
        <!-- New Zealand — North Island -->
        <path d="M748,336 C753,330 760,331 763,337 C764,345 760,352 754,353
                 C749,350 746,343 748,336 Z" />
        <!-- New Zealand — South Island -->
        <path d="M747,356 C751,351 758,352 760,358 C762,367 758,375 752,377
                 C748,373 746,364 747,356 Z" />
        <!-- Antarctica coastline hint -->
        <path d="M40,408 C120,399 200,406 280,402 C360,397 440,404 520,400
                 C600,395 680,402 760,397" class="map-antarctica" />
      </g>
    </svg>`;
}

export function ensureGradingSystemGuideModal() {
  let modal = document.getElementById('grading-system-guide-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'grading-system-guide-modal';
    modal.className = 'dashboard-modal hidden grading-system-guide-shell';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'grading-system-guide-title');
    document.body.appendChild(modal);
    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeGradingSystemGuideModal();
    });
  }

  const select = document.getElementById(activeGradingSystemSelectId);
  const currentValue = select?.value || store.state.profile?.gradingSystem || 'uk';
  const groups = getGradingSystemGuideOptions();
  const currentGroupName = activeGradingGuideRegion || getGradingGuideGroupForValue(currentValue);
  const activeGroup = groups.find((group) => group.group === currentGroupName) || groups[0];
  const viewMode = activeGradingGuideView === 'world' ? 'world' : 'list';

  const escHtml = window.escapeHtml || ((s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]));

  const regionButtons = groups.map((group) => `
    <button
      type="button"
      class="grading-guide-region-btn tone-${escHtml(group.tone || 'uk')} ${group.group === activeGroup.group ? 'active' : ''}"
      onclick="setActiveGradingGuideRegion('${escHtml(group.group)}')"
    >
      ${escHtml(group.group)}
    </button>
  `).join('');

  const systemCards = activeGroup.items.map((item) => `
    <button
      class="module-library-card grading-guide-row ${item.value === currentValue ? 'selected active' : ''}"
      type="button"
      onclick="chooseGradingSystemFromGuide('${escHtml(item.value)}')"
    >
      <span class="module-library-module-accent" aria-hidden="true"></span>
      <span class="module-library-card-head">
        <span>
          <span class="module-library-card-title grading-guide-row-title">${escHtml(item.title)}</span>
          <span class="module-library-card-meta">
            <span class="module-library-pill">${escHtml(item.meta)}</span>
            ${item.value === currentValue ? '<span class="module-library-pill grading-guide-current-pill">Current</span>' : ''}
          </span>
        </span>
      </span>
    </button>
  `).join('');

  const pinPositions = {
    uk: 'left: 47.6%; top: 27.5%;',
    us: 'left: 19.2%; top: 35.5%;',
    au: 'left: 82.8%; top: 74.5%;',
    apac: 'left: 78.6%; top: 50.8%;',
    eu: 'left: 53.2%; top: 29.8%;',
    advanced: 'left: 50%; top: 91.5%;',
  };

  const worldPins = groups.map((group) => {
    const tone = escHtml(group.tone || 'uk');
    const label = escHtml(group.group);
    const isActive = group.group === activeGroup.group ? 'active' : '';
    const pinStyle = pinPositions[group.tone || 'uk'] || 'left:50%;top:50%;';
    return `
      <button
        type="button"
        class="grading-map-pin tone-${tone} ${isActive}"
        data-region="${label}"
        aria-label="${label}"
        style="${pinStyle}"
        onmouseenter="previewGradingGuideRegion('${label}')"
        onmouseleave="clearGradingGuideRegionPreview()"
        onfocus="previewGradingGuideRegion('${label}')"
        onblur="clearGradingGuideRegionPreview()"
        onclick="setActiveGradingGuideRegion('${label}')"
      >
        <span class="grading-map-pin-dot"></span>
        <span class="grading-map-pin-label">${label}</span>
      </button>
    `;
  }).join('');

  const listSelector = `
    <aside class="grading-guide-region-nav" aria-label="Grading regions">
      ${regionButtons}
    </aside>
  `;

  const worldSelector = `
    <div class="grading-guide-world-card" aria-label="World grading regions">
      <div class="grading-guide-world-map" aria-hidden="true">
        ${getGradingGuideWorldMapSvg()}
      </div>
      ${worldPins}
      <div class="grading-guide-world-hint">Hover a pin to see the region · Click to select</div>
    </div>
  `;

  modal.innerHTML = `
    <div class="dashboard-content module-library-content grading-guide-modal grading-guide-modal--library grading-guide-modal--focused view-${viewMode} tone-${escHtml(activeGroup.tone || 'uk')}" onclick="event.stopPropagation()">
      <button class="dashboard-close" type="button" aria-label="Close grading guide" onclick="closeGradingSystemGuideModal()">&times;</button>
      <div class="timeline-head">
        <div class="timeline-subtitle">Grading Systems</div>
        <div class="timeline-topline module-library-topline grading-guide-topline">
          <div class="timeline-page-title" id="grading-system-guide-title">Choose Your Grading System</div>
          <div class="grading-guide-view-toggle" role="group" aria-label="Grading guide view">
            <button class="${viewMode === 'list' ? 'active' : ''}" type="button" onclick="setGradingGuideViewMode('list')">List View</button>
            <button class="${viewMode === 'world' ? 'active' : ''}" type="button" onclick="setGradingGuideViewMode('world')">World View</button>
          </div>
        </div>
      </div>
      <div class="grading-guide-focus-layout">
        ${viewMode === 'world' ? worldSelector : listSelector}
        <section class="module-library-section grading-guide-section grading-guide-focused-section tone-${escHtml(activeGroup.tone || 'uk')}">
          <div class="module-library-section-head">
            <div>
              <div class="module-library-section-label">${escHtml(activeGroup.group)}</div>
              <div class="module-library-section-copy">Select the scale closest to your transcript.</div>
            </div>
          </div>
          <div class="module-library-list grading-guide-list grading-guide-list--focused">
            ${systemCards}
          </div>
        </section>
      </div>
    </div>
  `;

  return modal;
}

export function updateGradingSystemChooserButtons() {
  document.querySelectorAll('.grading-system-modal-button').forEach((button) => {
    const select = document.getElementById(button.dataset.selectId);
    const value = select?.value || store.state.profile?.gradingSystem || 'uk';
    button.querySelector('.grading-system-modal-current').textContent = getGradingSystemOptionTitle(value);
  });
}

export function installGradingSystemModalSelector() {
  ['pref-grading-system', 'setup-grading-system-input'].forEach((selectId) => {
    const select = document.getElementById(selectId);
    if (!select) return;
    select.classList.add('grading-native-select-hidden');
    const existing = document.querySelector(`.grading-system-modal-button[data-select-id="${selectId}"]`);
    if (existing) existing.remove();
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nav-btn grading-system-modal-button';
    button.dataset.selectId = selectId;
    const escHtml = window.escapeHtml || ((s) => s);
    button.innerHTML = `
      <span class="grading-system-modal-label">Grading System</span>
      <span class="grading-system-modal-current">${escHtml(getGradingSystemOptionTitle(select.value || 'uk'))}</span>
      <span class="grading-system-modal-action">Change</span>
    `;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openGradingSystemGuideModal(event, selectId);
    });
    select.insertAdjacentElement('afterend', button);
  });
  updateGradingSystemChooserButtons();
}

function pauseModalBeforeGradingSelector(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal || modal.classList.contains('hidden')) return false;
  modal.classList.add('hidden');
  modal.dataset.restoreAfterGradingSelector = 'true';
  gradingSelectorReturnModalId = modalId;
  if (modalId === 'course-setup-modal') document.body.classList.remove('setup-required');
  return true;
}

function restoreModalAfterGradingSelector() {
  if (!gradingSelectorReturnModalId) return;
  const modal = document.getElementById(gradingSelectorReturnModalId);
  if (modal?.dataset.restoreAfterGradingSelector === 'true') {
    modal.classList.remove('hidden');
    delete modal.dataset.restoreAfterGradingSelector;
    if (gradingSelectorReturnModalId === 'course-setup-modal' && courseSetupInitial) {
      document.body.classList.add('setup-required');
    }
  }
  gradingSelectorReturnModalId = '';
  syncModalScrollLock();
}

export function openGradingSystemGuideModal(event, selectId = 'pref-grading-system') {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  activeGradingSystemSelectId = selectId || 'pref-grading-system';
  pauseModalBeforeGradingSelector('course-setup-modal') || pauseModalBeforeGradingSelector('auth-modal');
  const modal = ensureGradingSystemGuideModal();
  modal.classList.remove('hidden');
  syncModalScrollLock();
}

export function closeGradingSystemGuideModal() {
  document.getElementById('grading-system-guide-modal')?.classList.add('hidden');
  restoreModalAfterGradingSelector();
  syncModalScrollLock();
}

export function chooseGradingSystemFromGuide(system) {
  if (!SUPPORTED_GRADING_SYSTEMS.includes(system)) return;
  const select = document.getElementById(activeGradingSystemSelectId);
  if (select) select.value = system;
  if (activeGradingSystemSelectId === 'pref-grading-system') {
    setGradingSystemPreference(system);
  } else {
    updateSetupCreditLabel();
  }
  updateGradingSystemChooserButtons();
  closeGradingSystemGuideModal();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', installGradingSystemModalSelector);
} else {
  installGradingSystemModalSelector();
}
