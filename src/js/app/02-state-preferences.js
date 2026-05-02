const KEY = "course_progress_tracker_v1";
const PREFS_KEY = "course_progress_prefs_v1";
const LEGACY_TRACKER_KEY = "uos_aero_tracker_v4";
const LEGACY_PREFS_KEY = "uos_aero_prefs_v1";
const LEGACY_STATE_KEYS = ["uos_aero_jp_v2", "uos_aero_jp_v1"];
const LEGACY_BLACKBOARD_KEYS = ["uos_blackboard_links_v1"];
const LEGACY_FORMULA_KEYS = ["uos_formula_links_v2", "uos_formula_links_v1"];
const LEGACY_EXAM_KEYS = ["uos_exams_v2", "uos_exams_v1"];

const defaultProfile = {
  name: "",
  university: "",
  course: "",
  startYear: new Date().getFullYear(),
  creditsTarget: 120,
  gradingSystem: "uk",
  customGradeMapping: null
};

const defaultState = {
  profile: deepClone(defaultProfile),
  years: {},
  ui: { currentYearId: "year1", currentTermFilter: "all" },
  setup: { templateChoiceMade: false }
};

let MODULES = [];
let TOTAL_CREDITS = 0;
const DEFAULT_PREFERENCES = { theme: "light", density: "comfortable", font: "japanese", hero: "bg8", bodyBackground: "", calendarProvider: "google", showCountdownHeader: true };
const preferences = Object.assign(
  {},
  DEFAULT_PREFERENCES,
  loadJson(PREFS_KEY, loadJson(LEGACY_PREFS_KEY, {}))
);

function updateAuthLock() {
  const bootLocked = !window.unitrackBootComplete;
  const requiresAuth = bootLocked || authScreenLoading || !currentUser || isRecoveryFlow();

  document.body.classList.toggle("auth-required", requiresAuth);
  document.body.classList.toggle("auth-loading", bootLocked || authScreenLoading);

  if (requiresAuth) {
    renderAuthGate(isRecoveryFlow() ? "recovery" : authViewMode);
  }
}

function setAuthLoading(loading, title = "Restoring your session...", message = "Checking whether you are already signed in before showing anything.") {
  authScreenLoading = !!loading;
  authLoadingTitle = title;
  authLoadingMessage = message;
  updateAuthLock();
}

function renderCloudUnavailableGate() {
  const host = document.getElementById("auth-gate-body");
  const asideCopy = document.querySelector(".auth-gate-copy");
  if (asideCopy) asideCopy.textContent = "Cloud sign-in is unavailable.";
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

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

function safeUrl(value, options = {}) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const url = new URL(raw, window.location.origin);
    const allowedProtocols = options.allowMailto
      ? ["https:", "http:", "mailto:"]
      : ["https:", "http:"];

    if (!allowedProtocols.includes(url.protocol)) return "";
    return url.href;
  } catch {
    return "";
  }
}

function safeImageUrl(value) {
  return safeUrl(value);
}

function firstExisting(keys, fallback) {
  for (const key of keys) {
    const value = loadJson(key, null);
    if (value !== null) return value;
  }
  return fallback;
}

function hasStoredKey(key) {
  try {
    return localStorage.getItem(key) !== null;
  } catch (error) {
    return false;
  }
}

function createInitialState() {
  const initial = deepClone(defaultState);
  initial.years.year1 = {
    id: "year1",
    label: "Year 1",
    store: createYearStore([])
  };
  return initial;
}

function createYearStore(modules) {
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
    archived: false
  };
}

function normalizeTopicEntry(topic) {
  if (typeof topic === "string") return { title: topic, subtopics: [], collapsed: false };
  if (!topic || typeof topic !== "object") return { title: "Untitled Topic", subtopics: [], collapsed: false };
  return {
    title: String(topic.title || topic.name || "").trim() || "Untitled Topic",
    subtopics: Array.isArray(topic.subtopics) ? topic.subtopics.map((item) => String(item || "").trim()).filter(Boolean) : [],
    collapsed: !!topic.collapsed
  };
}

function normalizeModuleData(module) {
  if (!module || typeof module !== "object") return module;
  return Object.assign({}, module, {
    term: normalizeTermValue(module.term || "full"),
    topics: Array.isArray(module.topics) ? module.topics.map(normalizeTopicEntry) : []
  });
}

function getTopicEntry(mi, ti) {
  return normalizeTopicEntry(MODULES[mi]?.topics?.[ti]);
}

function getModuleTopicStateSnapshot(mi) {
  const store = getStore();
  return MODULES[mi].topics.map((_, ti) => {
    const topic = getTopicEntry(mi, ti);
    return {
      main: !!store.topics[topicKey(mi, ti)],
      subs: topic.subtopics.map((_, si) => !!store.topics[subtopicKey(mi, ti, si)])
    };
  });
}

function applyModuleTopicStateSnapshot(mi, snapshot) {
  const store = getStore();
  Object.keys(store.topics).forEach((key) => {
    if (key.startsWith(`t_${mi}_`) || key.startsWith(`s_${mi}_`)) delete store.topics[key];
  });
  snapshot.forEach((value, ti) => {
    if (value.main) store.topics[topicKey(mi, ti)] = true;
    value.subs.forEach((isDone, si) => {
      if (isDone) store.topics[subtopicKey(mi, ti, si)] = true;
    });
  });
}

function subtopicKey(mi, ti, si) {
  return `s_${mi}_${ti}_${si}`;
}

function topicSelectionKey(mi, ti, si = null) {
  return si === null || si === undefined ? `m:${mi}:${ti}` : `s:${mi}:${ti}:${si}`;
}

function parseTopicSelectionKey(key) {
  const parts = String(key || "").split(":");
  if (parts[0] === "m" && parts.length === 3) {
    return { kind: "main", mi: Number(parts[1]), ti: Number(parts[2]), si: null };
  }
  if (parts[0] === "s" && parts.length === 4) {
    return { kind: "sub", mi: Number(parts[1]), ti: Number(parts[2]), si: Number(parts[3]) };
  }
  return null;
}

function getTopicSelectionOrder(mi) {
  const order = [];
  MODULES[mi]?.topics?.forEach((_, ti) => {
    order.push(topicSelectionKey(mi, ti));
    getTopicEntry(mi, ti).subtopics.forEach((__, si) => order.push(topicSelectionKey(mi, ti, si)));
  });
  return order;
}

function isTopicSelected(mi, ti, si = null) {
  return selectedTopicKeys.has(topicSelectionKey(mi, ti, si));
}

function getSelectedTopicCount(mi) {
  let count = 0;
  selectedTopicKeys.forEach((key) => {
    const parsed = parseTopicSelectionKey(key);
    if (parsed?.mi === mi) count += 1;
  });
  return count;
}

function selectOnlyTopicKey(key) {
  selectedTopicKeys = new Set([key]);
  lastSelectedTopicKey = key;
}

function clearTopicSelection(mi = null) {
  if (mi === null || mi === undefined) {
    selectedTopicKeys = new Set();
    lastSelectedTopicKey = null;
    return;
  }
  selectedTopicKeys = new Set([...selectedTopicKeys].filter((key) => parseTopicSelectionKey(key)?.mi !== mi));
  if (parseTopicSelectionKey(lastSelectedTopicKey)?.mi === mi) lastSelectedTopicKey = null;
}

function serializeAppSnapshot() {
  return JSON.stringify({
    state: deepClone(state),
    preferences: deepClone(preferences)
  });
}

function syncUndoBaseline() {
  undoStack.length = 0;
  redoStack.length = 0;
  historyCurrentSnapshot = serializeAppSnapshot();
}

function rememberUndoState() {
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
  state = snapshot.state;
  Object.keys(preferences).forEach((key) => delete preferences[key]);
  Object.assign(preferences, snapshot.preferences || DEFAULT_PREFERENCES);
  ensureYearsState();
  refreshActiveYear();
  applyPreferences();
  renderYearSelector();
  buildModules();
  renderStickyExams();
  renderDeadlineTimeline();
  updateGlobal();
  localStorage.setItem(KEY, JSON.stringify(state));
  localStorage.setItem(PREFS_KEY, JSON.stringify(preferences));
  historyLocked = false;
  historyCurrentSnapshot = serializeAppSnapshot();
  saveCloudDebounced();
}

function undoLastAction() {
  const previous = undoStack.pop();
  if (!previous) return;
  redoStack.push(historyCurrentSnapshot);
  if (redoStack.length > 80) redoStack.shift();
  clearTopicSelection();
  restoreAppSnapshot(previous);
}

function redoLastAction() {
  const next = redoStack.pop();
  if (!next) return;
  undoStack.push(historyCurrentSnapshot);
  if (undoStack.length > 80) undoStack.shift();
  clearTopicSelection();
  restoreAppSnapshot(next);
}

function getSelectedTopicModules() {
  return [...new Set(
    [...selectedTopicKeys]
      .map((key) => parseTopicSelectionKey(key)?.mi)
      .filter((value) => Number.isInteger(value))
  )];
}

function applyTopicSelectionUI() {
  document.querySelectorAll('.topic-row').forEach((row) => {
    const key = row.dataset.topicKey;
    row.classList.toggle('selected', !!key && selectedTopicKeys.has(key));
  });
}

function selectTopicRow(mi, ti, si = null, event = null) {
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

async function handleSelectedTopicDeleteFromKeyboard(event) {
  if (event.key !== "Delete" && event.key !== "Backspace") return;
  const activeTag = document.activeElement?.tagName;
  if (activeTag === "INPUT" || activeTag === "TEXTAREA" || document.activeElement?.isContentEditable) return;
  const modules = getSelectedTopicModules();
  if (!modules.length) return;
  event.preventDefault();
  if (modules.length > 1) {
    await showAppNotice("One module at a time", "Delete selected topics from one module at a time so the list stays predictable.");
    return;
  }
  await deleteSelectedTopicsInModule(modules[0]);
}

function isColourCustomisableTheme() {
  return preferences.theme === "light" || preferences.theme === "dark";
}

function getModuleColourPalette() {
  if (preferences.theme === "dark") return DARK_MODULE_COLOURS;
  if (preferences.theme === "light") return LIGHT_MODULE_COLOURS;
  if (preferences.theme === "quiet") return QUIET_MODULE_COLOURS;
  return DARK_OFFWHITE_MODULE_COLOURS;
}

function getModuleColourChoice(mi) {
  const store = getStore();
  if (!store.moduleColors) store.moduleColors = {};
  if (!isColourCustomisableTheme()) return 0;
  const chosen = store.moduleColors[mi] || {};
  const family = preferences.theme === "dark" ? "dark" : "light";
  const palette = getModuleColourPalette();
  const fallback = ((mi % palette.length) + palette.length) % palette.length;
  const index = Number.isInteger(chosen[family]) ? chosen[family] : fallback;
  return ((index % palette.length) + palette.length) % palette.length;
}

function getModuleColourSet(mi) {
  const palette = getModuleColourPalette();
  if (!isColourCustomisableTheme()) return palette[0];
  const store = getStore();
  const chosen = store.moduleColors?.[mi] || {};
  const family = preferences.theme === "dark" ? "dark" : "light";
  const customHex = chosen[family];
  if (typeof customHex === "string") return buildModuleColourFromHex(customHex);
  return palette[getModuleColourChoice(mi)] || palette[0];
}

function clampColourChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function normaliseHexColour(value, fallback = "#c0392b") {
  const text = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(text)) return text.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(text)) {
    return "#" + text.slice(1).split("").map((ch) => ch + ch).join("").toLowerCase();
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
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("");
  return `#${next}`;
}

function buildModuleColourFromHex(hex) {
  const base = normaliseHexColour(hex);
  const start = adjustHexColour(base, -18);
  const end = adjustHexColour(base, 26);
  const text = preferences.theme === "dark" ? adjustHexColour(base, 72) : adjustHexColour(base, -8);
  return { stripe: base, fill: `linear-gradient(90deg, ${start}, ${end})`, text };
}

function getStoredModuleColourHex(mi) {
  const palette = getModuleColourPalette();
  const fallback = (palette[getModuleColourChoice(mi)] || palette[0] || LIGHT_MODULE_COLOURS[0]).stripe;
  const store = getStore();
  const chosen = store.moduleColors?.[mi] || {};
  const family = preferences.theme === "dark" ? "dark" : "light";
  return normaliseHexColour(chosen[family] || fallback, fallback);
}

function setModuleColour(mi, colourValue, event) {
  if (event) event.stopPropagation();
  if (!isColourCustomisableTheme()) return;
  const store = getStore();
  if (!store.moduleColors) store.moduleColors = {};
  const family = preferences.theme === "dark" ? "dark" : "light";
  const current = store.moduleColors[mi] || {};
  store.moduleColors[mi] = Object.assign({}, current, { [family]: normaliseHexColour(colourValue) });
  save();
  buildModules();
  if (!document.getElementById("dashboard-modal").classList.contains("hidden")) renderDashboardChart();
}

function migrateLegacyState() {
  const migrated = deepClone(defaultState);
  const legacy = firstExisting(LEGACY_STATE_KEYS, {});
  const legacyBoard = firstExisting(LEGACY_BLACKBOARD_KEYS, {});
  const legacyFormula = firstExisting(LEGACY_FORMULA_KEYS, {});
  const legacyExams = firstExisting(LEGACY_EXAM_KEYS, []);
  const yearId = "year1";
  migrated.years[yearId] = {
    id: yearId,
    label: "Year 1",
    store: createYearStore(BASE_MODULES)
  };
  const store = migrated.years[yearId].store;

  BASE_MODULES.forEach((mod, mi) => {
    mod.topics.forEach((_, ti) => {
      const key = `t_${mi}_${ti}`;
      if (legacy[key]) store.topics[key] = true;
    });
    const cwKey = `cw_${mi}`;
    const exKey = `ex_${mi}`;
    const notesKey = `notes_${mi}`;
    if (legacy[cwKey] !== undefined) store.coursework[mi] = legacy[cwKey];
    if (legacy[exKey] !== undefined) store.exams[mi] = legacy[exKey];
    if (legacy[notesKey] !== undefined) store.notes[mi] = legacy[notesKey];
    if (legacyBoard && legacyBoard[mi]) store.blackboard[mi] = legacyBoard[mi];
    if (legacyFormula && legacyFormula[mi]) {
      store.formulas[mi] = Array.isArray(legacyFormula[mi])
        ? legacyFormula[mi]
        : [{ name: mod.short + " Formula Sheet", url: legacyFormula[mi] }];
    }
  });

  if (Array.isArray(legacyExams)) store.customExams = legacyExams;
  return migrated;
}

let state = loadJson(KEY, null);
if (!state) {
  state = createInitialState();
  localStorage.setItem(KEY, JSON.stringify(state));
  saveCloud();
}

function ensureYearsState() {
  if (!state.profile) state.profile = deepClone(defaultProfile);
  if (!state.setup) state.setup = { templateChoiceMade: false };
  if (!state.ui) state.ui = {};
  if (!state.ui.currentTermFilter) state.ui.currentTermFilter = "all";

  if (state.years && Object.keys(state.years).length) {
    if (!state.ui.currentYearId || !state.years[state.ui.currentYearId]) {
      state.ui.currentYearId = Object.keys(state.years)[0];
    }
    Object.values(state.years).forEach((year) => {
      if (!year.store) year.store = createYearStore([]);
      ensureStoreTermOptions(year.store);
    });
    return;
  }

  const legacyStore = {
    modules: deepClone(BASE_MODULES),
    topics: state.topics || {},
    coursework: state.coursework || {},
    courseworkComponents: state.courseworkComponents || {},
    exams: state.exams || {},
    finalGrades: state.finalGrades || {},
    majorModules: state.majorModules || {},
    termOptions: state.termOptions || deepClone(MODULE_TERM_OPTIONS),
    notes: state.notes || {},
    blackboard: state.blackboard || {},
    formulas: state.formulas || {},
    relevantLinks: state.relevantLinks || {},
    customLibraries: state.customLibraries || {},
    customExams: state.customExams || [],
    todos: state.todos || [],
    archived: false
  };
  state = {
    profile: state.profile || deepClone(defaultProfile),
    setup: state.setup || { templateChoiceMade: false },
    years: {
      year1: {
        id: "year1",
        label: "Year 1",
        store: legacyStore
      }
    },
    ui: { currentYearId: "year1", currentTermFilter: "all" }
  };
  ensureStoreTermOptions(legacyStore);
  save();
}

ensureYearsState();

function setupCourseIfNeeded() {
  const profile = state.profile || deepClone(defaultProfile);
  if (!pendingFirstRunSetup && profile.course && profile.university) return;
  openCourseSetupModal(true);
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function markPendingNewAccount(email) {
  const normalized = normalizeEmail(email);
  if (normalized) localStorage.setItem(PENDING_NEW_ACCOUNT_EMAIL_KEY, normalized);
}

function clearPendingNewAccount(email) {
  const normalized = normalizeEmail(email);
  if (!normalized || localStorage.getItem(PENDING_NEW_ACCOUNT_EMAIL_KEY) === normalized) {
    localStorage.removeItem(PENDING_NEW_ACCOUNT_EMAIL_KEY);
  }
}

function isPendingNewAccount(email) {
  return !!email && localStorage.getItem(PENDING_NEW_ACCOUNT_EMAIL_KEY) === normalizeEmail(email);
}

function getModuleSectionStateKey(mi, section) {
  return `${state.ui?.currentYearId || "year1"}:${mi}:${section}`;
}

function isModuleSectionOpen(mi, section) {
  const key = getModuleSectionStateKey(mi, section);

  if (openModuleSections[key] === undefined) {
    return false;
  }

  return !!openModuleSections[key];
}

function setModuleSectionOpen(mi, section, open) {
  const key = getModuleSectionStateKey(mi, section);
  openModuleSections[key] = !!open;
  const body = document.getElementById(`module-section-body-${mi}-${section}`);
  const chevron = document.getElementById(`module-section-chevron-${mi}-${section}`);
  if (body) body.classList.toggle("open", !!open);
  if (chevron) chevron.classList.toggle("open", !!open);
}

function toggleModuleSection(mi, section, event) {
  if (event) event.stopPropagation();
  setModuleSectionOpen(mi, section, !isModuleSectionOpen(mi, section));
}

function createModuleSection(mi, section, title, controlHtml = "") {
  const wrap = document.createElement("div");
  wrap.className = "module-section " + section + "-section" + (section === "coursework" ? " coursework-section" : "");
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

  // Apply the saved open/closed state immediately while building the node.
  // The old setTimeout version rendered the body closed for one frame, which
  // looked like the Topics dropdown was collapsing whenever the list rebuilt.
  const body = wrap.querySelector(`#module-section-body-${mi}-${section}`);
  const chevron = wrap.querySelector(`#module-section-chevron-${mi}-${section}`);
  const open = isModuleSectionOpen(mi, section);
  if (body) body.classList.toggle("open", open);
  if (chevron) chevron.classList.toggle("open", open);

  return { wrap, body };
}

function isFreshSupabaseUser(user) {
  const createdAt = user?.created_at ? Date.parse(user.created_at) : NaN;
  return Number.isFinite(createdAt) && Date.now() - createdAt < 20 * 60 * 1000;
}

function selectSetupTemplate(template) {
  selectedSetupTemplate = template === "aero" ? "aero" : "blank";
  const blank = document.getElementById("setup-choice-blank");
  const aero = document.getElementById("setup-choice-aero");
  if (blank) blank.classList.toggle("active", selectedSetupTemplate === "blank");
  if (aero) aero.classList.toggle("active", selectedSetupTemplate === "aero");
}

function openCourseSetupModal(isInitialSetup = false) {
  courseSetupInitial = isInitialSetup;
  const current = Object.assign({}, defaultProfile, state.profile || {});
  const isEditingExisting = !!(current.course && current.university);
  const linkedStatus = document.getElementById("setup-linked-status");
  document.getElementById("course-setup-title").textContent = isInitialSetup ? "Set Up Your Tracker" : "Edit Course Setup";
  document.getElementById("course-setup-copy").textContent = isInitialSetup
    ? "Tell me a little about you and your course so the tracker starts off personalised from the first screen."
    : "Update your name, course details, and yearly targets here.";
  if (linkedStatus) {
    const showLinked = isInitialSetup && !!currentUser;
    linkedStatus.classList.toggle("hidden", !showLinked);
    linkedStatus.innerHTML = showLinked
      ? `Cloud account linked to <strong>${escapeHtml(currentUser.email || "your email")}</strong>`
      : "";
  }
  document.getElementById("setup-name-input").value = current.name || "";
  document.getElementById("setup-university-input").value = current.university || "";
  document.getElementById("setup-course-input").value = current.course || "";
  document.getElementById("setup-start-year-input").value = current.startYear || new Date().getFullYear();
  document.getElementById("setup-credits-input").value = current.creditsTarget || 120;
  const setupCreditsLabel = document.getElementById("setup-credits-label");
  const gradingInput = document.getElementById("setup-grading-system-input");
  if (gradingInput) gradingInput.value = current.gradingSystem || "uk";
  updateSetupCreditLabel();
  document.getElementById("setup-template-block").classList.toggle("hidden", !isInitialSetup);
  document.getElementById("course-setup-cancel").classList.toggle("hidden", isInitialSetup);
  document.getElementById("course-setup-close").classList.toggle("hidden", isInitialSetup);
  if (isInitialSetup) {
    const hasModules = !!getCurrentYear()?.store?.modules?.length;
    selectSetupTemplate(hasModules ? "aero" : "blank");
  } else {
    selectSetupTemplate("blank");
  }
  document.body.classList.toggle("setup-required", isInitialSetup);
  document.getElementById("course-setup-modal").classList.remove("hidden");
  syncModalScrollLock();
  if (!isEditingExisting && isInitialSetup) {
    document.getElementById("setup-name-input").focus();
  }
}

function closeCourseSetupModal() {
  if (courseSetupInitial) return;
  document.body.classList.remove("setup-required");
  document.getElementById("course-setup-modal").classList.add("hidden");
  syncModalScrollLock();
}

function editCourseProfile() {
  closeAuthModal(true);
  openCourseSetupModal(false);
}

function saveCourseSetup() {
  const name = document.getElementById("setup-name-input").value.trim();
  const universityInput = document.getElementById("setup-university-input").value.trim();
  const courseInput = document.getElementById("setup-course-input").value.trim();
  const startYearInput = parseInt(document.getElementById("setup-start-year-input").value, 10);
  const creditsInput = parseFloat(document.getElementById("setup-credits-input").value);
  const gradingInput = document.getElementById("setup-grading-system-input");
  const gradingSystem = SUPPORTED_GRADING_SYSTEMS.includes(gradingInput?.value) ? gradingInput.value : "uk";

  const university = universityInput || (selectedSetupTemplate === "aero" ? "University of Sheffield" : "University");
  const course = courseInput || (selectedSetupTemplate === "aero" ? "Aerospace Engineering" : "Course");

  state.profile = {
    name,
    university,
    course,
    startYear: Number.isFinite(startYearInput) ? startYearInput : new Date().getFullYear(),
    creditsTarget: Number.isFinite(creditsInput) ? creditsInput : 120,
    gradingSystem,
    customGradeMapping: Array.isArray(state.profile?.customGradeMapping) ? state.profile.customGradeMapping : null
  };
  if (gradingSystem === "custom" && !Array.isArray(state.profile.customGradeMapping)) {
    state.profile.customGradeMapping = deepClone(US_GRADE_OPTIONS);
  }

  if (courseSetupInitial) {
    const currentYear = getCurrentYear();
    currentYear.store = createYearStore(selectedSetupTemplate === "aero" ? BASE_MODULES : []);
    state.ui.currentTermFilter = "all";
    if (!state.setup) state.setup = {};
    state.setup.templateChoiceMade = true;
  }

  save();
  refreshActiveYear();
  renderYearSelector();
  buildModules();
  renderStickyExams();
  updateGlobal();
  document.body.classList.remove("setup-required");
  document.getElementById("course-setup-modal").classList.add("hidden");
  courseSetupInitial = false;
  if (pendingFirstRunSetup) {
    clearPendingNewAccount(currentUser?.email);
    saveCloudNow();
  }
  if (pendingOnboarding) maybeShowOnboarding();
}

function getSetupCreditTargetLabel(system) {
  if (system === "au7") return "Target Units";
  if (system === "au4") return "Target Units";
  if (system === "us4" || system === "us43") return "Target GPA Hours";
  if (system === "nz9") return "Target Points";
  if (system === "de5") return "Target ECTS";
  return "Target Credits";
}

function updateSetupCreditLabel() {
  const setupCreditsLabel = document.getElementById("setup-credits-label");
  const gradingInput = document.getElementById("setup-grading-system-input");
  if (!setupCreditsLabel) return;
  const system = SUPPORTED_GRADING_SYSTEMS.includes(gradingInput?.value)
    ? gradingInput.value
    : (state.profile?.gradingSystem || "uk");
  setupCreditsLabel.textContent = getSetupCreditTargetLabel(system);
}

document.getElementById("setup-grading-system-input")?.addEventListener("change", updateSetupCreditLabel);

if (currentUser && pendingFirstRunSetup) {
  setupCourseIfNeeded();
}

function shouldShowTemplateSplash() {
  const profile = state.profile || deepClone(defaultProfile);
  if (!profile.course || !profile.university) return false;
  if (state.setup?.templateChoiceMade) return false;
  const currentYear = getCurrentYear();
  return !!currentYear && currentYear.store.modules.length === 0;
}

function showTemplateSplash() {
  if (!currentUser) return;
  if (!pendingFirstRunSetup) return;
  if (cloudHadSave) return;
  if (!shouldShowTemplateSplash()) return;
  document.getElementById("template-splash").classList.remove("hidden");
}

function dismissTemplateSplash() {
  if (!state.setup) state.setup = {};
  state.setup.templateChoiceMade = true;
  save();
  document.getElementById("template-splash").classList.add("hidden");
}

function getCurrentYear() {
  return state.years[state.ui.currentYearId];
}

function getStore() {
  return getCurrentYear().store;
}

function refreshActiveYear() {
  const currentYear = getCurrentYear();
  ensureStoreTermOptions(currentYear.store);
  if (!isKnownTermValue(state.ui.currentTermFilter)) state.ui.currentTermFilter = "all";
  currentYear.store.modules = (currentYear.store.modules || []).map(normalizeModuleData);
  MODULES = currentYear.store.modules;
  const moduleCredits = MODULES.reduce((sum, mod) => sum + mod.credits, 0);
  const targetCredits = parseFloat(state.profile?.creditsTarget);
  TOTAL_CREDITS = Math.max(moduleCredits, Number.isFinite(targetCredits) ? targetCredits : 0);
}

refreshActiveYear();
syncUndoBaseline();

function applyPreferences() {
  const removedTheme = "dark" + "-offwhite";
  if (preferences.theme === removedTheme) preferences.theme = "dark";
  if (preferences.font === "classic") preferences.font = "mono";
  if (!CALENDAR_PROVIDERS[preferences.calendarProvider]) preferences.calendarProvider = DEFAULT_PREFERENCES.calendarProvider;
  document.body.classList.toggle("theme-dark", preferences.theme === "dark");
  document.body.classList.toggle("theme-quiet", preferences.theme === "quiet");
  document.body.classList.toggle("compact-ui", preferences.density === "compact");
  document.body.classList.toggle("font-sans", preferences.font === "sans");
  document.body.classList.toggle("font-mono", preferences.font === "mono");
  document.body.classList.toggle("countdown-header-hidden", preferences.showCountdownHeader === false);
  const themeSelect = document.getElementById("pref-theme");
  const densitySelect = document.getElementById("pref-density");
  const fontSelect = document.getElementById("pref-font");
  const calendarSelect = document.getElementById("pref-calendar");
  const gradingSelect = document.getElementById("pref-grading-system");
  const countdownToggle = document.getElementById("pref-countdown-header-toggle");
  const customBgInput = document.getElementById("custom-bg-url");
  const bodyBgInput = document.getElementById("body-bg-url");
  const hero = document.querySelector(".hero");
  const allBackgrounds = { ...HERO_BACKGROUNDS, ...(preferences.customBackgrounds || {}) };
  if (!allBackgrounds[preferences.hero]) preferences.hero = DEFAULT_PREFERENCES.hero;

  if (hero && allBackgrounds[preferences.hero]) {
    hero.style.setProperty("--hero-bg", `url("${allBackgrounds[preferences.hero]}")`);
  }
  if (preferences.bodyBackground) {
    document.body.classList.add("has-body-background");
    document.body.style.setProperty("--page-bg", `url("${preferences.bodyBackground}")`);
  } else {
    document.body.classList.remove("has-body-background");
    document.body.style.removeProperty("--page-bg");
  }
  if (themeSelect) themeSelect.value = preferences.theme;
  if (densitySelect) densitySelect.value = preferences.density;
  if (fontSelect) fontSelect.value = preferences.font || "japanese";
  if (calendarSelect) calendarSelect.value = preferences.calendarProvider || "google";
  if (gradingSelect) gradingSelect.value = getGradingSystem();
  document.getElementById("custom-grade-map-field")?.classList.toggle("hidden", getGradingSystem() !== "custom");
  if (countdownToggle) {
    const countdownVisible = preferences.showCountdownHeader !== false;
    countdownToggle.textContent = countdownVisible ? "Shown" : "Hidden";
    countdownToggle.classList.toggle("is-on", countdownVisible);
    countdownToggle.setAttribute("aria-pressed", String(countdownVisible));
  }
  if (customBgInput) {
    const heroKey = preferences.hero || "";
    const currentCustomUrl = heroKey.startsWith("custom_") ? (preferences.customBackgrounds?.[heroKey] || "") : "";
    customBgInput.value = currentCustomUrl;
  }
  if (bodyBgInput) bodyBgInput.value = preferences.bodyBackground || "";

  renderBackgroundPicker();
}

function setPreference(key, value) {
  preferences[key] = value;
  savePreferences();
  applyPreferences();
  buildModules();
  updateGlobal();
  if (!document.getElementById("dashboard-modal").classList.contains("hidden")) renderDashboardChart();
}

function setGradingSystemPreference(value) {
  const gradingSystem = SUPPORTED_GRADING_SYSTEMS.includes(value) ? value : "uk";
  if (!state.profile) state.profile = deepClone(defaultProfile);
  state.profile.gradingSystem = gradingSystem;
  if (gradingSystem === "custom" && !Array.isArray(state.profile.customGradeMapping)) {
    state.profile.customGradeMapping = deepClone(US_GRADE_OPTIONS);
  }
  save();
  applyPreferences();
  buildModules();
  updateGlobal();
  if (!document.getElementById("dashboard-modal").classList.contains("hidden")) renderDashboardChart();
}

async function editCustomGradeMapping() {
  if (!state.profile) state.profile = deepClone(defaultProfile);
  const current = serializeGradeMapping(getCustomGradeOptions());
  const result = await appPrompt({
    label: "Grade Mapping",
    title: "Edit Custom Grade Mapping",
    message: "Use comma-separated grade=point pairs. Example: A+=4.30, A=4.00, B=3.00, F=0.00",
    inputLabel: "Mapping",
    defaultValue: current,
    placeholder: "A=4.00, B=3.00, C=2.00, D=1.00, F=0.00",
    confirmText: "Save Mapping"
  });
  if (!result) return;
  const parsed = parseCustomGradeMapping(result.value);
  if (!parsed.length) {
    await showAppNotice("Mapping not saved", "Enter at least one grade=point pair, such as A=4.00.");
    return;
  }
  state.profile.customGradeMapping = parsed;
  state.profile.gradingSystem = "custom";
  save();
  applyPreferences();
  buildModules();
  updateGlobal();
}

function toggleCountdownHeaderPreference() {
  preferences.showCountdownHeader = preferences.showCountdownHeader === false;
  savePreferences();
  applyPreferences();
}

function addCustomBackground() {
  const rawUrl = document.getElementById("custom-bg-url").value.trim();
  const url = safeImageUrl(rawUrl);

  if (!url) {
    showAppNotice?.("Invalid image URL", "Use a normal http or https image URL.");
    return;
  }

  if (!preferences.customBackgrounds) preferences.customBackgrounds = {};

  const currentKey = preferences.hero || "";
  const customKey = currentKey.startsWith("custom_") ? currentKey : "custom_" + Date.now();

  preferences.customBackgrounds[customKey] = url;
  preferences.hero = customKey;

  savePreferences();
  applyPreferences();
}

function setBodyBackground() {
  const rawUrl = document.getElementById("body-bg-url").value.trim();
  const url = rawUrl ? safeImageUrl(rawUrl) : "";

  if (rawUrl && !url) {
    showAppNotice?.("Invalid image URL", "Use a normal http or https image URL.");
    return;
  }

  preferences.bodyBackground = url;
  savePreferences();
  applyPreferences();
}

function clearBodyBackground() {
  preferences.bodyBackground = "";
  savePreferences();
  applyPreferences();
}

function clearCustomBackground() {
  const heroKey = preferences.hero || "";
  if (heroKey.startsWith("custom_") && preferences.customBackgrounds) {
    delete preferences.customBackgrounds[heroKey];
  }
  preferences.hero = DEFAULT_PREFERENCES.hero;
  savePreferences();
  applyPreferences();
}

function togglePreferences() {
  document.getElementById("prefs-panel").classList.toggle("hidden");
}

function openPreferredCalendar() {
  openCalendarComposer();
}

let modalScrollY = 0;
const BLOCKING_MODAL_SELECTORS = [
  "#app-dialog-modal",
  "#auth-modal",
  "#dashboard-modal",
  "#timeline-modal",
  "#todo-modal",
  "#calendar-modal",
  "#deadline-form-modal",
  "#module-form-modal",
  "#link-form-modal",
  "#module-library-modal",
  "#course-setup-modal",
  "#onboarding-modal"
];

function isMobileViewport() {
  return window.matchMedia?.("(max-width: 760px)")?.matches || window.innerWidth <= 760;
}

function lockPageScroll() {
  if (document.body.classList.contains("modal-scroll-locked")) return;
  modalScrollY = window.scrollY || document.documentElement.scrollTop || 0;
  const fixedScrollLock = !isMobileViewport();
  document.body.dataset.scrollLockFixed = fixedScrollLock ? "true" : "false";
  if (fixedScrollLock) document.body.style.top = `-${modalScrollY}px`;
  document.body.classList.add("modal-scroll-locked");
}

function unlockPageScroll() {
  if (!document.body.classList.contains("modal-scroll-locked")) return;
  const shouldRestoreScroll = document.body.dataset.scrollLockFixed === "true";
  document.body.classList.remove("modal-scroll-locked");
  document.body.style.top = "";
  delete document.body.dataset.scrollLockFixed;
  if (shouldRestoreScroll) window.scrollTo(0, modalScrollY);
}

function isBlockingModalOpen() {
  return BLOCKING_MODAL_SELECTORS.some((selector) => {
    const node = document.querySelector(selector);
    return !!node && !node.classList.contains("hidden");
  });
}

function syncModalScrollLock() {
  if (isBlockingModalOpen()) lockPageScroll();
  else unlockPageScroll();
}

function toDateInputValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function toTimeInputValue(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function openSelectedCalendar() {
  const providerKey = preferences.calendarProvider || "google";
  if (providerKey === "outlook") {
    navigateCalendarWindow("https://outlook.live.com/calendar/0/view/month");
    return;
  }
  if (providerKey === "apple") {
    navigateCalendarWindow("https://www.icloud.com/calendar/");
    return;
  }
  navigateCalendarWindow("https://calendar.google.com/calendar/u/0/r");
}

function openCalendarComposer(prefill = null) {
  calendarComposerPrefill = prefill;
  const now = new Date();
  const later = new Date(now.getTime() + 60 * 60 * 1000);
  const start = prefill?.start || now;
  const end = prefill?.end || later;
  document.getElementById("calendar-form-title").textContent = prefill?.title ? "Add Calendar Event" : "Open Calendar";
  document.getElementById("calendar-title-input").value = prefill?.title || "";
  document.getElementById("calendar-start-date-input").value = toDateInputValue(start);
  document.getElementById("calendar-start-time-input").value = toTimeInputValue(start);
  document.getElementById("calendar-end-date-input").value = toDateInputValue(end);
  document.getElementById("calendar-end-time-input").value = toTimeInputValue(end);
  document.getElementById("calendar-all-day-input").value = prefill?.allDay ? "true" : "false";
  document.getElementById("calendar-show-as-input").value = prefill?.availability || "BUSY";
  document.getElementById("calendar-location-input").value = prefill?.location || "";
  document.getElementById("calendar-notes-input").value = prefill?.details || "";
  if (typeof setCalendarComposerPriority === "function") setCalendarComposerPriority(prefill?.priority || "default");
  updateCalendarComposerMode();
  document.getElementById("calendar-modal").classList.remove("hidden");
  syncModalScrollLock();
}

function closeCalendarComposer() {
  document.getElementById("calendar-modal").classList.add("hidden");
  syncModalScrollLock();
}

function updateCalendarComposerMode() {
  const allDay = document.getElementById("calendar-all-day-input")?.value === "true";
  const startTime = document.getElementById("calendar-start-time-input");
  const endTime = document.getElementById("calendar-end-time-input");
  if (startTime) startTime.disabled = allDay;
  if (endTime) endTime.disabled = allDay;
}

function buildCalendarEventFromComposer() {
  const title = document.getElementById("calendar-title-input").value.trim();
  const startDate = document.getElementById("calendar-start-date-input").value;
  const startTime = document.getElementById("calendar-start-time-input").value || "09:00";
  const endDate = document.getElementById("calendar-end-date-input").value || startDate;
  const endTime = document.getElementById("calendar-end-time-input").value || startTime;
  const allDay = document.getElementById("calendar-all-day-input").value === "true";
  const availability = document.getElementById("calendar-show-as-input").value || "BUSY";
  const location = document.getElementById("calendar-location-input").value.trim();
  const rawDetails = document.getElementById("calendar-notes-input").value.trim();
  const priority = typeof getSelectedCalendarComposerPriority === "function" ? getSelectedCalendarComposerPriority() : "default";
  const details = priority !== "default"
    ? [`Priority: ${priority.charAt(0).toUpperCase() + priority.slice(1)}`, rawDetails].filter(Boolean).join("\n\n")
    : rawDetails;
  if (!title || !startDate || !endDate) return null;
  const start = allDay ? new Date(`${startDate}T00:00`) : new Date(`${startDate}T${startTime}`);
  const end = allDay ? new Date(new Date(`${endDate}T00:00`).getTime() + 24 * 60 * 60 * 1000) : new Date(`${endDate}T${endTime}`);
  if (!(start instanceof Date) || Number.isNaN(start.getTime()) || !(end instanceof Date) || Number.isNaN(end.getTime()) || end <= start) return null;
  return { title, start, end, allDay, availability, location, details, priority };
}

function submitCalendarComposer() {
  const eventData = buildCalendarEventFromComposer();
  if (!eventData) return;
  openCalendarEvent(eventData);
  closeCalendarComposer();
}

function openYouTube() {
  openTrustedUrl("https://www.youtube.com/");
}

function clearLocalTrackerStorage() {
  localStorage.removeItem(KEY);
  localStorage.removeItem(PREFS_KEY);
  localStorage.removeItem(LEGACY_TRACKER_KEY);
  localStorage.removeItem(LEGACY_PREFS_KEY);
  [...LEGACY_STATE_KEYS, ...LEGACY_BLACKBOARD_KEYS, ...LEGACY_FORMULA_KEYS, ...LEGACY_EXAM_KEYS]
    .forEach(k => localStorage.removeItem(k));
}

function save() {
  rememberUndoState();
  if (typeof ensureLibraryState === "function") ensureLibraryState();
  localStorage.setItem(KEY, JSON.stringify(state));
  saveCloudDebounced();
}

function savePreferences() {
  rememberUndoState();
  localStorage.setItem(PREFS_KEY, JSON.stringify(preferences));
  saveCloudDebounced();
}


function openGradingSystemGuideModal(event, selectId = "pref-grading-system") {
  if (event) event.stopPropagation();

  activeGradingSystemSelectId = selectId || "pref-grading-system";

  const select = document.getElementById(activeGradingSystemSelectId);
  const currentValue = select?.value || state.profile?.gradingSystem || "uk";
  activeGradingGuideRegion = getGradingGuideGroupForValue(currentValue);

  // Desktop opens in World View by default. Mobile stays List View because tiny map pins are awkward to tap.
  const isMobile = window.matchMedia?.("(max-width: 760px)")?.matches;
  activeGradingGuideView = isMobile ? "list" : "world";

  const modal = ensureGradingSystemGuideModal();
  modal.classList.remove("hidden");

  if (typeof syncModalScrollLock === "function") syncModalScrollLock();
}





function closeGradingSystemGuideModal() {
  document.getElementById("grading-system-guide-modal")?.classList.add("hidden");
  if (typeof syncModalScrollLock === "function") syncModalScrollLock();
}


/* grading-system-modal-selector */
let activeGradingSystemSelectId = "pref-grading-system";
let activeGradingGuideRegion = "";
let activeGradingGuideView = "world";

function getGradingSystemGuideOptions() {
  return [
    {
      group: "UK",
      tone: "uk",
      items: [
        {
          value: "uk",
          title: "UK Honours / Percentage",
          meta: "0–100% · First · 2:1 · 2:2 · Third"
        }
      ]
    },
    {
      group: "United States",
      tone: "us",
      items: [
        {
          value: "us4",
          title: "US 4.00 GPA",
          meta: "A / A+ = 4.00 · B+ = 3.30"
        },
        {
          value: "us43",
          title: "US 4.30 GPA",
          meta: "A+ = 4.30 · A = 4.00"
        }
      ]
    },
    {
      group: "Australia",
      tone: "au",
      items: [
        {
          value: "au7",
          title: "Australia 7.00 GPA",
          meta: "HD = 7 · D = 6 · Credit = 5 · Pass = 4"
        },
        {
          value: "au4",
          title: "Australia 4.00 GPA",
          meta: "HD = 4 · D = 3 · Credit = 2 · Pass = 1"
        }
      ]
    },
    {
      group: "Asia-Pacific",
      tone: "apac",
      items: [
        {
          value: "my4",
          title: "Malaysia 4.00 GPA",
          meta: "A = 4.00 · A- = 3.67 · B+ = 3.33"
        },
        {
          value: "cn4",
          title: "China Mainland 100-point",
          meta: "Main score: 0–100 · GPA estimate shown"
        },
        {
          value: "nz9",
          title: "New Zealand 9.00 GPA",
          meta: "A+ = 9 · A = 8 · A- = 7"
        }
      ]
    },
    {
      group: "Europe",
      tone: "eu",
      items: [
        {
          value: "de5",
          title: "Germany 1.0–5.0 Grade",
          meta: "1.0 best · 4.0 pass · 5.0 fail"
        }
      ]
    },
    {
      group: "Advanced",
      tone: "advanced",
      items: [
        {
          value: "custom",
          title: "Custom Mapping",
          meta: "Use your university’s own table"
        }
      ]
    }
  ];
}





function getGradingGuideGroupForValue(value) {
  for (const group of getGradingSystemGuideOptions()) {
    if (group.items.some((item) => item.value === value)) return group.group;
  }
  return getGradingSystemGuideOptions()[0]?.group || "UK";
}

function setActiveGradingGuideRegion(groupName) {
  activeGradingGuideRegion = groupName;
  ensureGradingSystemGuideModal();
}

function setGradingGuideViewMode(mode) {
  activeGradingGuideView = mode === "world" ? "world" : "list";
  ensureGradingSystemGuideModal();
}

function previewGradingGuideRegion(groupName) {
  const canHover = window.matchMedia?.("(hover: hover) and (min-width: 761px)")?.matches;
  if (!canHover) return;

  document.querySelectorAll(".grading-map-pin").forEach((pin) => {
    pin.classList.toggle("is-preview", pin.dataset.region === groupName);
  });
}



function clearGradingGuideRegionPreview() {
  document.querySelectorAll(".grading-map-pin").forEach((pin) => {
    pin.classList.remove("is-preview");
  });
}

function getGradingSystemOptionTitle(value) {
  for (const group of getGradingSystemGuideOptions()) {
    const found = group.items.find((item) => item.value === value);
    if (found) return found.title;
  }
  return "Choose grading system";
}

function getGradingGuideWorldMapSvg() {
  // Equirectangular projection calibrated to match pin % positions:
  // x = (lon + 161) * 2.367   y = (98 - lat) * 2.489
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

        <!-- Iberian Peninsula (Spain/Portugal) -->
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

        <!-- Indonesia / Borneo (simplified island chain) -->
        <path d="M636,196 C648,196 660,199 670,206 C678,212 682,220 676,227
                 C668,232 655,230 645,223 C635,216 632,206 636,196 Z" />
        <path d="M680,208 C692,213 703,220 710,229 C715,236 713,243 706,245
                 C698,245 688,239 682,230 C677,221 677,212 680,208 Z" />
        <path d="M644,224 C654,226 662,233 664,241 C662,248 654,250 645,247
                 C638,242 636,234 644,224 Z" />

        <!-- Philippines (tiny stub) -->
        <path d="M688,168 C692,165 697,166 698,172 C697,177 692,178 688,175
                 C686,172 686,169 688,168 Z" />

        <!-- Japan — Honshu -->
        <path d="M716,106 C720,102 727,101 731,107 C732,114 729,120 723,121
                 C717,119 714,114 716,106 Z" />

        <!-- Japan — Kyushu/Shikoku stub -->
        <path d="M709,120 C713,117 719,118 721,123 C721,129 717,132 712,131
                 C708,128 708,123 709,120 Z" />

        <!-- Hokkaido stub -->
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
                 C600,395 680,402 760,397"
              class="map-antarctica" />

      </g>
    </svg>`;
}



function ensureGradingSystemGuideModal() {
  let modal = document.getElementById("grading-system-guide-modal");

  if (!modal) {
    modal = document.createElement("div");
    modal.id = "grading-system-guide-modal";
    modal.className = "dashboard-modal hidden grading-system-guide-shell";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "grading-system-guide-title");
    document.body.appendChild(modal);

    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeGradingSystemGuideModal();
    });
  }

  const select = document.getElementById(activeGradingSystemSelectId);
  const currentValue = select?.value || state.profile?.gradingSystem || "uk";
  const groups = getGradingSystemGuideOptions();
  const currentGroupName = activeGradingGuideRegion || getGradingGuideGroupForValue(currentValue);
  const activeGroup = groups.find((group) => group.group === currentGroupName) || groups[0];
  const viewMode = activeGradingGuideView === "world" ? "world" : "list";

  const regionButtons = groups.map((group) => `
    <button
      type="button"
      class="grading-guide-region-btn tone-${escapeHtml(group.tone || "uk")} ${group.group === activeGroup.group ? "active" : ""}"
      onclick="setActiveGradingGuideRegion('${escapeHtml(group.group)}')"
    >
      ${escapeHtml(group.group)}
    </button>
  `).join("");

  const systemCards = activeGroup.items.map((item) => `
    <button
      class="module-library-card grading-guide-row ${item.value === currentValue ? "selected active" : ""}"
      type="button"
      onclick="chooseGradingSystemFromGuide('${escapeHtml(item.value)}')"
    >
      <span class="module-library-module-accent" aria-hidden="true"></span>
      <span class="module-library-card-head">
        <span>
          <span class="module-library-card-title grading-guide-row-title">${escapeHtml(item.title)}</span>
          <span class="module-library-card-meta">
            <span class="module-library-pill">${escapeHtml(item.meta)}</span>
            ${item.value === currentValue ? '<span class="module-library-pill grading-guide-current-pill">Current</span>' : ""}
          </span>
        </span>
      </span>
    </button>
  `).join("");

  const pinPositions = {
    uk: "left: 47.6%; top: 27.5%;",
    us: "left: 19.2%; top: 35.5%;",
    au: "left: 82.8%; top: 74.5%;",
    apac: "left: 78.6%; top: 50.8%;",
    eu: "left: 53.2%; top: 29.8%;",
    advanced: "left: 50%; top: 91.5%;"
  };

  const worldPins = groups.map((group) => {
    const tone = escapeHtml(group.tone || "uk");
    const label = escapeHtml(group.group);
    const isActive = group.group === activeGroup.group ? "active" : "";
    const pinStyle = pinPositions[group.tone || "uk"] || "left:50%;top:50%;";

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
  }).join("");

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
    <div class="dashboard-content module-library-content grading-guide-modal grading-guide-modal--library grading-guide-modal--focused view-${viewMode} tone-${escapeHtml(activeGroup.tone || "uk")}" onclick="event.stopPropagation()">
      <button class="dashboard-close" type="button" aria-label="Close grading guide" onclick="closeGradingSystemGuideModal()">&times;</button>

      <div class="timeline-head">
        <div class="timeline-subtitle">Grading Systems</div>
        <div class="timeline-topline module-library-topline grading-guide-topline">
          <div class="timeline-page-title" id="grading-system-guide-title">Choose Your Grading System</div>
          <div class="grading-guide-view-toggle" role="group" aria-label="Grading guide view">
            <button class="${viewMode === "list" ? "active" : ""}" type="button" onclick="setGradingGuideViewMode('list')">List View</button>
            <button class="${viewMode === "world" ? "active" : ""}" type="button" onclick="setGradingGuideViewMode('world')">World View</button>
          </div>
        </div>
      </div>

      <div class="grading-guide-focus-layout">
        ${viewMode === "world" ? worldSelector : listSelector}

        <section class="module-library-section grading-guide-section grading-guide-focused-section tone-${escapeHtml(activeGroup.tone || "uk")}">
          <div class="module-library-section-head">
            <div>
              <div class="module-library-section-label">${escapeHtml(activeGroup.group)}</div>
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













function updateGradingSystemChooserButtons() {
  document.querySelectorAll(".grading-system-modal-button").forEach((button) => {
    const select = document.getElementById(button.dataset.selectId);
    const value = select?.value || state.profile?.gradingSystem || "uk";
    button.querySelector(".grading-system-modal-current").textContent = getGradingSystemOptionTitle(value);
  });
}

function installGradingSystemModalSelector() {
  ["pref-grading-system", "setup-grading-system-input"].forEach((selectId) => {
    const select = document.getElementById(selectId);
    if (!select) return;

    select.classList.add("grading-native-select-hidden");

    const existing = document.querySelector(`.grading-system-modal-button[data-select-id="${selectId}"]`);
    if (existing) existing.remove();

    const button = document.createElement("button");
    button.type = "button";
    button.className = "nav-btn grading-system-modal-button";
    button.dataset.selectId = selectId;
    button.innerHTML = `
      <span class="grading-system-modal-label">Grading System</span>
      <span class="grading-system-modal-current">${escapeHtml(getGradingSystemOptionTitle(select.value || "uk"))}</span>
      <span class="grading-system-modal-action">Change</span>
    `;

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openGradingSystemGuideModal(event, selectId);
    });

    select.insertAdjacentElement("afterend", button);
  });

  updateGradingSystemChooserButtons();
}

function openGradingSystemGuideModal(event, selectId = "pref-grading-system") {
  if (event) event.stopPropagation();
  activeGradingSystemSelectId = selectId || "pref-grading-system";
  const modal = ensureGradingSystemGuideModal();
  modal.classList.remove("hidden");
  if (typeof syncModalScrollLock === "function") syncModalScrollLock();
}

function closeGradingSystemGuideModal() {
  document.getElementById("grading-system-guide-modal")?.classList.add("hidden");
  if (typeof syncModalScrollLock === "function") syncModalScrollLock();
}

function chooseGradingSystemFromGuide(system) {
  if (!SUPPORTED_GRADING_SYSTEMS.includes(system)) return;

  const select = document.getElementById(activeGradingSystemSelectId);
  if (select) select.value = system;

  if (activeGradingSystemSelectId === "pref-grading-system") {
    setGradingSystemPreference(system);
  } else {
    updateSetupCreditLabel();
  }

  updateGradingSystemChooserButtons();
  closeGradingSystemGuideModal();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", installGradingSystemModalSelector);
} else {
  installGradingSystemModalSelector();
}
