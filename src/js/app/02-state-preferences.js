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
  const requiresAuth = authScreenLoading || !currentUser || isRecoveryFlow();
  document.body.classList.toggle("auth-required", requiresAuth);
  document.body.classList.toggle("auth-loading", authScreenLoading);
  if (requiresAuth) renderAuthGate(isRecoveryFlow() ? "recovery" : authViewMode);
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
    if (window.innerWidth <= 760) return section === "coursework";
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
  if (!isEditingExisting && isInitialSetup) {
    document.getElementById("setup-name-input").focus();
  }
}

function closeCourseSetupModal() {
  if (courseSetupInitial) return;
  document.body.classList.remove("setup-required");
  document.getElementById("course-setup-modal").classList.add("hidden");
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
  if (customBgInput) customBgInput.value = "";
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
  const input = document.getElementById("custom-bg-url");
  const url = safeUrl(input.value);

  if (!url) return;

  const customKey = "custom_" + Date.now();

  if (!preferences.customBackgrounds) {
    preferences.customBackgrounds = {};
  }

  preferences.customBackgrounds[customKey] = url;
  preferences.hero = customKey;

  savePreferences();

  input.value = "";
  applyPreferences();
}

function setBodyBackground() {
  const input = document.getElementById("body-bg-url");
  if (!input) return;
  const raw = input.value.trim();
  preferences.bodyBackground = raw ? safeUrl(raw) : "";
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
  lockPageScroll();
}

function closeCalendarComposer() {
  document.getElementById("calendar-modal").classList.add("hidden");
  unlockPageScroll();
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
  window.open("https://www.youtube.com/", "_blank", "noopener");
}

function clearLocalTrackerStorage() {
  localStorage.removeItem(KEY);
  localStorage.removeItem(PREFS_KEY);

  localStorage.removeItem(LEGACY_TRACKER_KEY);
  localStorage.removeItem(LEGACY_PREFS_KEY);
  localStorage.removeItem("uos_aero_jp_v2");
  localStorage.removeItem("uos_aero_jp_v1");
  localStorage.removeItem("uos_blackboard_links_v1");
  localStorage.removeItem("uos_formula_links_v2");
  localStorage.removeItem("uos_formula_links_v1");
  localStorage.removeItem("uos_exams_v2");
  localStorage.removeItem("uos_exams_v1");
}

function save() {
  rememberUndoState();
  localStorage.setItem(KEY, JSON.stringify(state));
  saveCloudDebounced();
}

function savePreferences() {
  rememberUndoState();
  localStorage.setItem(PREFS_KEY, JSON.stringify(preferences));
  saveCloudDebounced();
}
