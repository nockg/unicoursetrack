/**
 * Central mutable state store.
 *
 * All state that crosses module boundaries lives here as properties of a
 * single exported object.  Modules import `store` and read/write via
 * `store.xxx` so that every module always sees the latest value – no stale
 * closures from module-level destructuring.
 *
 * Pure constants that never change belong in config.js, not here.
 */

export const store = {
  // ── Core app data ──────────────────────────────────────────────────────────
  /** The primary application state object (years, modules, topics, marks…). */
  state: null,
  /** User preferences (theme, font, hero, calendar, grading system…). */
  preferences: {},
  /** Flat array of modules for the active year/term – derived from state. */
  MODULES: [],
  /** Effective credit total for the active year. */
  TOTAL_CREDITS: 0,

  // ── Supabase client ────────────────────────────────────────────────────────
  supabaseClient: null,

  // ── Auth / cloud context ───────────────────────────────────────────────────
  currentUser: null,
  currentSession: null,
  cloudReady: false,
  cloudHadSave: false,
  cloudLoadSucceeded: false,
  recoveryModeActive: false,
  pendingOnboarding: false,
  pendingFirstRunSetup: false,
  accountCreationInProgress: false,
  cloudLoadPromise: null,
  cloudSaveTimer: null,

  // ── Auth UI state ──────────────────────────────────────────────────────────
  authViewMode: 'login',
  authStatusMessage: '',
  authStatusTone: 'error',
  authScreenLoading: false,
  authLoadingTitle: 'Restoring your session…',
  authLoadingMessage: 'Checking whether you are already signed in before showing anything.',
  deadlineSplashShownThisLoad: false,
  welcomeSplashShownThisLoad: false,

  // ── Boot flag ──────────────────────────────────────────────────────────────
  /** Set to true once the full boot sequence finishes. */
  bootComplete: false,
};
