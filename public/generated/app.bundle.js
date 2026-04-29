/* 00-config-auth-state.js */
/* Full app script. This file is intentionally kept syntactically complete for clean troubleshooting. */

const runtimeConfig = Object.freeze(window.UNITRACK_CONFIG || {});
const SUPABASE_URL = String(runtimeConfig.supabaseUrl || "").trim();
const SUPABASE_ANON_KEY = String(runtimeConfig.supabaseAnonKey || "").trim();
const cloudConfigMissing = !SUPABASE_URL || !SUPABASE_ANON_KEY;

const supabaseClient = !cloudConfigMissing && window.supabase?.createClient ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storageKey: "unitrack-cloud-auth",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
}) : null;
let currentUser = null;
let currentSession = null;
let cloudReady = false;
let cloudHadSave = false;
let cloudLoadSucceeded = false;
let recoveryModeActive = false;
let authViewMode = "login";
let authStatusMessage = "";
let authStatusTone = "error";
let pendingOnboarding = false;
let pendingFirstRunSetup = false;
let accountCreationInProgress = false;

// AUTH STATE SYNCHRONIZATION
// Tracks when Supabase has checked the session, preventing premature app init
let authStateKnown = false;
let authStateResolver = null;
const authStateInitialized = new Promise(resolve => {
  authStateResolver = resolve;
});

function markAuthStateKnown() {
  if (!authStateKnown) {
    authStateKnown = true;
    authStateResolver?.();
  }
}

function clearLogoutFlagForSignedInUser() {
  // justLoggedOut is only meant to protect the immediate signed-out screen.
  // If another account signs in during the same browser session, this stale flag
  // must be cleared or it will wrongly block first-run setup/template screens.
  if (currentUser) sessionStorage.removeItem("justLoggedOut");
}

let onboardingStepIndex = 0;
const PENDING_NEW_ACCOUNT_EMAIL_KEY = "unitrack_pending_new_account_email";

const ONBOARDING_STEPS = [
  {
    label: "Modules",
    title: "Build your year",
    copy: "Start simple. Add modules, then open each card when you want more detail.",
    preview: [
      "Add or edit modules",
      "Tick topics as you finish them",
      "Drag topics into your preferred order"
    ]
  },
  {
    label: "Marks",
    title: "Track your marks",
    copy: "Enter marks in your selected grading system. UniTrack updates the prediction automatically.",
    preview: [
      "Semester and full-year results use the same course data",
      "Use components for UK-style multi-part coursework",
      "Clear marks per module when needed"
    ]
  },
  {
    label: "Deadlines",
    title: "Stay ahead of deadlines",
    copy: "Add deadlines once. The nearest one stays easy to see.",
    preview: [
      "Top bar shows upcoming deadlines",
      "Timeline gives notes and larger countdowns",
      "Nearest deadline is prioritised"
    ]
  },
  {
    label: "Style",
    title: "Make it yours",
    copy: "Use Preferences for themes, fonts, backgrounds, and course details.",
    preview: [
      "Switch themes and font styles",
      "Change header and page backgrounds",
      "Edit your course setup anytime"
    ]
  }
];

const BASE_MODULES = [
  { name:"Introduction to Aerospace Materials", kanji:"CMB121", short:"Materials", credits:20, cw:0, exam:100,
    topics:["Intensive and Extensive Properties","Introduction to Mechanical Properties","Material Classes, Ashby Diagrams, HHI","Types of Bonding, Interatomic Forces","Packing and Temperature, Unit Cells, FCC/HCP/BCC","Essential Crystallography, Miller Indices","Tensile Tests, Elastic Properties, Bond Stiffness","Strength of Materials, Power Law & Work Hardening, Hardness","Theoretical Strength, Defects and Dislocations","Ductility and Brittleness, Charpy Impact Testing","Fracture Mechanics, Defects and Fatigue","Bending or Twisting, 3-point Bending, Second Moment of Area","Scalars, Vectors and Matrix Tensors","Directionality in Crystals","Rotation of Stress, Principal Stress, Mohr's Circle, Failure Criteria","Glass, Glass Properties","Technical and Non-Technical Ceramics, Porosity","Metals, Steel Properties, Hall-Petch Relationship","Types of Ferrous Materials, Fe-C Phase Diagram","Non-Ferrous Alloys (Al, Mg, Ni, Ti)","Polymer Chains","Thermoplastics, Thermosets, Elastomers","Composites, Fibre Reinforced, Mixture Rules","Wood, Particulate Composites, MMC, Concrete","Materials Selection, Ashby Diagrams","Conflicting Constraints, Min-Max, Penalty Functions","Life-Cycle Analysis, Embodied Energy","Recycling, Materials Selection, LCA"]},
  { name:"Aerospace Engineering Design, Build and Test", kanji:"ELE101", short:"Design", credits:20, cw:60, exam:40,
    topics:["Moving Aerodynamic Surfaces, Wing Shapes, Wing Sections","Air Speed, Bernoulli Equation, Lift Generation","Pressure Coefficient, Lift Coefficient, 3D effects","Boundary Layer, Reynolds Number, High Lift Devices","Boundary Layer Design, Stall, NACA Airfoils","Drag, Induced Drag","Compressibility and High Speed Flows","Forces & Moments on Aircraft, Longitudinal & Lateral Stability","Gliding","Range and Endurance","Take Off and Landing","Climbing Flight","V-n Diagram","The Space Environment, Spacecraft Systems, Orbit Classification","Spacecraft Propulsion and the Rocket Equation","Celestial Mechanics, Kepler's Laws and Orbital Elements","Orbit, Trajectory Design, Orbit Transfers"]},
  { name:"Analysis and Modelling of Aerospace Systems", kanji:"ELE112", short:"Analysis", credits:15, cw:50, exam:50,
    topics:["Analytical Solution of ODEs","Laplace Transform","System Responses and Transfer Functions","First-Order Systems","Second-Order Systems","Block Diagrams","Introduction to Feedback","Proportional Control","PID Control","PID Controller","Introduction to Frequency Response","Frequency Response: Performance and Stability Criteria"]},
  { name:"Electrical Fundamentals", kanji:"ELE113", short:"Electrical", credits:15, cw:20, exam:80,
    topics:["Basic Concepts","Network Analysis","Circuit Components","Transient Circuits","First Order AC Circuits","Second Order AC Circuits","Power Dissipation in AC Circuits","Magnetism and Electromagnetics","Motor and Machines","Semiconductors and P-N Junction","Diode Applications","Transistors","DC and AC Bias","Op-Amplifiers"]},
  { name:"Engineering Statics and Dynamics", kanji:"MAC117", short:"Statics & Dyn.", credits:15, cw:0, exam:100,
    topics:["Forces, Moments and Equilibrium","Connections, Supports and Reaction Forces","Truss Structures","Beams and Section Forces","Frames and Section Forces","Introduction to Cables","Introduction to Dynamics and Coordinate Systems","Normal and Tangential Coordinates","Polar Coordinates","Polar Coordinates, Relative Motion and Rigid Body Motion","Kinematics of Rigid Bodies, Instantaneous Centres","Kinematics of Rigid Bodies, Worked Examples","Introduction to Kinetics, Centre of Mass","Second Moment of Inertia, Theory and Examples","Moment Equations in Dynamics","Introduction to Work, Energy, Momentum, Impulse and Power"]},
  { name:"Aerospace Aerodynamics and Thermodynamics", kanji:"MAC118", short:"Thermo.", credits:15, cw:30, exam:70,
    topics:["Liquids and Gases","Types of Energy","The First Law","The Second Law","Steady Flow Devices","Heat Engine and Refrigeration Cycles","The Brayton Cycle"]},
  { name:"Mathematics", kanji:"MPS123", short:"Mathematics", credits:20, cw:50, exam:50,
    topics:["Functions","Differentiation","Integration","Complex Numbers","Vectors","Matrices","Differential Equations"]}
];

const HERO_BACKGROUNDS = {
  bg1: "https://i.redd.it/qizurgr6zha21.png",
  bg2: "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?q=80&w=1172&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  bg3: "https://www.easyairportparking.uk/assets/boing-747-bild-1.jpg",
  bg4: "https://media.defense.gov/2021/May/25/2002727568/2000/2000/0/180108-F-KX404-9002.JPG",
  bg5: "https://www.bremont.com/cdn/shop/articles/Concorde_G-BOAA_4_bc1e1d5d-4ac4-42bf-9608-73925821dc1d.jpg?v=1634534775&width=1500",
  bg6: "https://nafc.org.au/wp-content/uploads/2021/07/Q400drop_QFES-image-1-scaled-e1627614915571.jpeg",
  bg8: "https://images.squarespace-cdn.com/content/v1/564d14dfe4b0290681184a82/1479853193364-00HU0OCI0KNVLZQRKMCX/20160819-JI-Lake+Clark+National+Park-_DSF2859.jpg?format=1500w",
  bg9: "https://cdn.mos.cms.futurecdn.net/fnfyE7cDwV9JWCopNK8Ycb-1024-80.jpg"
};

const CALENDAR_PROVIDERS = {
  google: { label: "Google Calendar", url: "https://calendar.google.com/calendar/u/0/r" },
  apple: { label: "Apple Calendar", url: "https://www.icloud.com/calendar/" },
  outlook: { label: "Outlook Calendar", url: "https://outlook.live.com/calendar/" }
};

const SUPPORTED_GRADING_SYSTEMS = ["uk", "us4", "us43", "au7", "au4", "my4", "cn4", "nz9", "de5", "custom"];

const MODULE_TERM_OPTIONS = [
  { value: "sem1", label: "Semester 1" },
  { value: "sem2", label: "Semester 2" },
  { value: "sem3", label: "Semester 3" },
  { value: "full", label: "Full Year" }
];

const LIGHT_MODULE_COLOURS = [
  { stripe: "#9c3a2e", fill: "linear-gradient(90deg, #c0392b, #e74c3c)", text: "#c0392b" },
  { stripe: "#7a5c1e", fill: "linear-gradient(90deg, #b8860b, #d4a017)", text: "#b8860b" },
  { stripe: "#1a4a6e", fill: "linear-gradient(90deg, #1a5c8c, #2980b9)", text: "#1a5c8c" },
  { stripe: "#2d5a27", fill: "linear-gradient(90deg, #2d5a27, #4a8c42)", text: "#2d5a27" },
  { stripe: "#5a2d7a", fill: "linear-gradient(90deg, #6c3483, #8e44ad)", text: "#6c3483" },
  { stripe: "#1a4a4a", fill: "linear-gradient(90deg, #0e6655, #1abc9c)", text: "#0e6655" },
  { stripe: "#4a2d1a", fill: "linear-gradient(90deg, #784212, #a04000)", text: "#784212" }
];

const DARK_MODULE_COLOURS = [
  { stripe: "#db5c4e", fill: "linear-gradient(90deg, #cf5246, #f07b6f)", text: "#f0a196" },
  { stripe: "#d6a33a", fill: "linear-gradient(90deg, #b8860b, #e5b64c)", text: "#e6c97a" },
  { stripe: "#4d93cf", fill: "linear-gradient(90deg, #357ab7, #63a7df)", text: "#8fc4ef" },
  { stripe: "#63a35f", fill: "linear-gradient(90deg, #3f7040, #75bb72)", text: "#9bd49a" },
  { stripe: "#9a78d1", fill: "linear-gradient(90deg, #6c3483, #a783db)", text: "#c2a8ec" },
  { stripe: "#4fb0a5", fill: "linear-gradient(90deg, #24786f, #59c1b5)", text: "#93ddd5" },
  { stripe: "#be8a58", fill: "linear-gradient(90deg, #8b5a2b, #d29a66)", text: "#e4bb94" }
];

const QUIET_MODULE_COLOURS = [
  { stripe: "#988775", fill: "linear-gradient(90deg, #a69480, #c1b19f)", text: "#786857" }
];

const DARK_OFFWHITE_MODULE_COLOURS = [
  { stripe: "#1a2c4a", fill: "linear-gradient(90deg, #1a2c4a, #1a2c4a)", text: "#1a2c4a" }
];

let deadlineSplashInterval = null;
let deadlineTimelineInterval = null;
let editingDeadlineIndex = null;
let activeDeadlineFormType = "date";
let activeDeadlineTab = "upcoming";
let courseworkFormModuleIndex = null;
let linkFormContext = null;
let editingModuleIndex = null;
let materialLibraryModuleIndex = null;
let moduleLibraryScopeMi = null;
let moduleLibraryScopeCustomId = null;
let moduleLibraryViewMode = "list";
let moduleLibrarySearch = "";
let moduleLibraryFilter = "all";
let moduleLibraryFolderFilter = "all";
let moduleLibraryFolderFilters = { formula: "all", relevant: "all" };
let moduleLibraryFolderHistory = { formula: ["all"], relevant: ["all"] };
let moduleLibraryFolderHistoryIndex = { formula: 0, relevant: 0 };
let moduleLibraryClipboard = null;
let moduleLibrarySelectedFolders = { formula: null, relevant: null };
let moduleLibraryActiveFolderType = "formula";
let moduleLibraryLinksOpen = false;
let moduleLibraryMaterialsOpen = false;
let isDraggingTopics = false;
let dragTopicValue = null;
let draggedTopic = null;
let draggedTopicStartX = 0;
let topicDropSuppressUntil = 0;
let selectedTopicKeys = new Set();
let lastSelectedTopicKey = null;
const undoStack = [];
const redoStack = [];
let historyCurrentSnapshot = "";
let historyLocked = false;
let courseSetupInitial = false;
let selectedSetupTemplate = "blank";
const openModules = new Set();
const openModuleSections = {};
let authScreenLoading = true;
let authLoadingTitle = "Restoring your session...";
let authLoadingMessage = "Checking whether you are already signed in before showing anything.";
let deadlineSplashShownThisLoad = false;
let welcomeSplashShownThisLoad = false;
let calendarComposerPrefill = null;
let todoPanelDrag = null;
let todoPanelResizeObserver = null;
let todoPanelResize = null;

/* 01-topic-splash-storage.js */
function setTopicCheckbox(checkbox, mi, ti, value) {
  const store = getStore();
  const topic = getTopicEntry(mi, ti);

  checkbox.checked = value;

  if (value) store.topics[topicKey(mi, ti)] = true;
  else delete store.topics[topicKey(mi, ti)];

  topic.subtopics.forEach((_, si) => {
    if (value) store.topics[subtopicKey(mi, ti, si)] = true;
    else delete store.topics[subtopicKey(mi, ti, si)];
  });

  const label = checkbox.parentElement.querySelector(".topic-label");
  if (label) label.className = "topic-label" + (value ? " done" : "");
  const subtopicList = checkbox.closest(".topic-row")?.nextElementSibling;
  if (subtopicList?.classList?.contains("subtopic-list")) {
    subtopicList.querySelectorAll('input[type="checkbox"]').forEach((node) => { node.checked = value; });
    subtopicList.querySelectorAll(".topic-label").forEach((node) => {
      node.className = "topic-label" + (value ? " done" : "");
    });
  }

  save();
  updateModule(mi);
  updateGlobal();
}

function setSubtopicCheckbox(mi, ti, si, value) {
  const store = getStore();
  const subKey = subtopicKey(mi, ti, si);
  const parentKey = topicKey(mi, ti);
  const topic = getTopicEntry(mi, ti);
  if (!topic?.subtopics?.[si]) return;

  if (value) store.topics[subKey] = true;
  else delete store.topics[subKey];

  const allDone = topic.subtopics.length > 0 && topic.subtopics.every((_, index) => !!store.topics[subtopicKey(mi, ti, index)]);
  if (allDone) store.topics[parentKey] = true;
  else delete store.topics[parentKey];

  const subRow = document.querySelector(`[data-topic-key="${topicSelectionKey(mi, ti, si)}"]`);
  const subCheckbox = subRow?.querySelector('input[type="checkbox"]');
  const subLabel = subRow?.querySelector(".topic-label");
  if (subCheckbox) subCheckbox.checked = value;
  if (subLabel) subLabel.className = "topic-label" + (value ? " done" : "");

  const parentRow = document.querySelector(`[data-topic-key="${topicSelectionKey(mi, ti)}"]`);
  const parentCheckbox = parentRow?.querySelector('input[type="checkbox"]');
  const parentLabel = parentRow?.querySelector(".topic-label");
  if (parentCheckbox) parentCheckbox.checked = allDone;
  if (parentLabel) parentLabel.className = "topic-label" + (allDone ? " done" : "");

  save();
  updateModule(mi);
  updateGlobal();
}

function refreshTopicStructure(mi) {
  const modulesContainer = document.getElementById("modules");
  const scrollYBeforeRefresh = window.scrollY;
  const stableHeight = modulesContainer?.offsetHeight || 0;

  if (Number.isInteger(mi)) openModules.add(mi);
  document.body.classList.add("suppress-topic-refresh");
  if (modulesContainer && stableHeight) modulesContainer.style.minHeight = `${stableHeight}px`;

  save();
  buildModules();
  updateGlobal();
  window.scrollTo(0, scrollYBeforeRefresh);

  requestAnimationFrame(() => {
    window.scrollTo(0, scrollYBeforeRefresh);
    requestAnimationFrame(() => {
      if (modulesContainer) modulesContainer.style.minHeight = "";
      document.body.classList.remove("suppress-topic-refresh");
    });
  });
}

function startTopicDrag(checkbox) {
  isDraggingTopics = true;
  dragTopicValue = checkbox.checked;
}

function dragOverTopic(checkbox, mi, ti) {
  if (!isDraggingTopics) return;
  setTopicCheckbox(checkbox, mi, ti, dragTopicValue);
}

function stopTopicDrag() {
  isDraggingTopics = false;
  dragTopicValue = null;
}

function getNearestUpcomingDeadline() {
  const store = getStore();
  const exams = (store.customExams || []).filter((exam) => !exam.completed);
  const now = Date.now();

  return exams
    .filter(exam => new Date(exam.date).getTime() > now)
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0] || null;
}

function restoreDeadlineSplashCard() {
  const splash = document.getElementById("deadline-splash");
  if (!splash) return null;

  splash.innerHTML = `
    <div class="deadline-splash-card">
      <button class="deadline-splash-close" type="button" onclick="closeDeadlineSplash()">X</button>
      <div class="deadline-splash-label">Nearest Deadline</div>
      <div id="deadline-splash-title" class="deadline-splash-title"></div>
      <div id="deadline-splash-time" class="deadline-splash-time"></div>
    </div>
  `;

  return splash;
}

function showDeadlineSplash(options = {}) {
  const upcoming = getNearestUpcomingDeadline();
  if (!upcoming) return false;

  if (!options.force && deadlineSplashShownThisLoad) return false;

  const splash = restoreDeadlineSplashCard();
  if (!splash) return false;

  const titleEl = document.getElementById("deadline-splash-title");
  const timeEl = document.getElementById("deadline-splash-time");
  if (!titleEl || !timeEl) return false;

  titleEl.textContent = upcoming.mod || "Upcoming deadline";

  function updateSplashTimer() {
    timeEl.textContent = formatCountdown(upcoming.date);
  }

  updateSplashTimer();

  clearInterval(deadlineSplashInterval);
  deadlineSplashInterval = setInterval(updateSplashTimer, 1000);

  deadlineSplashShownThisLoad = true;
  splash.classList.remove("hidden");
  return true;
}

function closeDeadlineSplash() {
  document.getElementById("deadline-splash").classList.add("hidden");

  if (deadlineSplashInterval) {
    clearInterval(deadlineSplashInterval);
    deadlineSplashInterval = null;
  }
}

function renderBackgroundPicker() {
  const picker = document.getElementById("bg-picker");
  if (!picker) return;

  const allBackgrounds = { ...HERO_BACKGROUNDS, ...(preferences.customBackgrounds || {}) };

  picker.innerHTML = Object.entries(allBackgrounds).map(([key, url]) => `
    <div class="bg-thumb-wrap">
      <button 
        class="bg-thumb ${preferences.hero === key ? "active" : ""}"
        style="background-image: url('${url}')"
        onclick="setPreference('hero', '${key}'); renderBackgroundPicker();"
        title="${key}">
      </button>

      ${key.startsWith("custom_") ? `
        <button class="bg-delete-btn" onclick="deleteCustomBackground('${key}')">X</button>
      ` : ""}
    </div>
  `).join("");
}

/* 02-state-preferences.js */
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

/* 03-marks-links-library.js */
function parseMark(value) {
  return parseGradeValue(value);
}

function parseGradeValue(value, system = getGradingSystem()) {
  if (value === "" || value === null || value === undefined) return null;
  const gradeMap = getGradePointMap(system);
  if (gradeMap) {
    const grade = gradeMap[normaliseGradeCode(value)];
    if (grade !== undefined) return grade.value;
    if (!getGradeScaleConfig(system).allowNumericGradeInput) return null;
  }
  const num = parseFloat(value);
  if (Number.isNaN(num)) return null;
  const config = getGradeScaleConfig(system);
  const min = config.min ?? 0;
  return Math.max(min, Math.min(config.max, num));
}

const AU_GRADE_OPTIONS = [
  { code: "HD", value: 7, label: "High Distinction", short: "HD" },
  { code: "D", value: 6, label: "Distinction", short: "D" },
  { code: "CR", value: 5, label: "Credit", short: "Credit" },
  { code: "P", value: 4, label: "Pass", short: "Pass" },
  { code: "F", value: 0, label: "Fail", short: "Fail" }
];

const US_GRADE_OPTIONS = [
  { code: "A+", value: 4.0, label: "A+" },
  { code: "A", value: 4.0, label: "A" },
  { code: "A-", value: 3.7, label: "A-" },
  { code: "B+", value: 3.3, label: "B+" },
  { code: "B", value: 3.0, label: "B" },
  { code: "B-", value: 2.7, label: "B-" },
  { code: "C+", value: 2.3, label: "C+" },
  { code: "C", value: 2.0, label: "C" },
  { code: "C-", value: 1.7, label: "C-" },
  { code: "D+", value: 1.3, label: "D+" },
  { code: "D", value: 1.0, label: "D" },
  { code: "D-", value: 0.7, label: "D-" },
  { code: "F", value: 0, label: "F" }
];

const MY_GRADE_OPTIONS = [
  { code: "A+", value: 4.0, label: "A+" },
  { code: "A", value: 4.0, label: "A" },
  { code: "A-", value: 3.67, label: "A-" },
  { code: "B+", value: 3.33, label: "B+" },
  { code: "B", value: 3.0, label: "B" },
  { code: "B-", value: 2.67, label: "B-" },
  { code: "C+", value: 2.33, label: "C+" },
  { code: "C", value: 2.0, label: "C" },
  { code: "C-", value: 1.67, label: "C-" },
  { code: "D+", value: 1.33, label: "D+" },
  { code: "D", value: 1.0, label: "D" },
  { code: "D-", value: 0.67, label: "D-" },
  { code: "E", value: 0, label: "E" },
  { code: "F", value: 0, label: "F" }
];

const NZ_GRADE_OPTIONS = [
  { code: "A+", value: 9, label: "A+" },
  { code: "A", value: 8, label: "A" },
  { code: "A-", value: 7, label: "A-" },
  { code: "B+", value: 6, label: "B+" },
  { code: "B", value: 5, label: "B" },
  { code: "B-", value: 4, label: "B-" },
  { code: "C+", value: 3, label: "C+" },
  { code: "C", value: 2, label: "C" },
  { code: "C-", value: 1, label: "C-" },
  { code: "D", value: 0, label: "D" },
  { code: "E", value: 0, label: "E" }
];

// Grade thresholds and letter-to-point mappings vary by institution.
// AU HD cutoffs are commonly 85%, but some universities, such as Monash, use 80%.
// US 4.00 is the mainstream transcript model, though a few institutions use 4.3 for A+.
// Malaysia commonly treats both E and F as 0 points; the distinction is institution-specific.
// China GPA conversion is especially institution-specific, so cn4 accepts common letters and direct 0-4 grade points.
const CN_GRADE_OPTIONS = [
  { code: "A", value: 4.0, label: "A" },
  { code: "B", value: 3.0, label: "B" },
  { code: "C", value: 2.0, label: "C" },
  { code: "D", value: 1.0, label: "D" },
  { code: "F", value: 0, label: "F" }
];

const DE_GRADE_OPTIONS = [
  { code: "1.0", value: 1.0, label: "1.0 Very Good" },
  { code: "1.3", value: 1.3, label: "1.3 Very Good" },
  { code: "1.7", value: 1.7, label: "1.7 Good" },
  { code: "2.0", value: 2.0, label: "2.0 Good" },
  { code: "2.3", value: 2.3, label: "2.3 Good" },
  { code: "2.7", value: 2.7, label: "2.7 Satisfactory" },
  { code: "3.0", value: 3.0, label: "3.0 Satisfactory" },
  { code: "3.3", value: 3.3, label: "3.3 Satisfactory" },
  { code: "3.7", value: 3.7, label: "3.7 Sufficient" },
  { code: "4.0", value: 4.0, label: "4.0 Sufficient" },
  { code: "5.0", value: 5.0, label: "5.0 Fail" }
];

const GRADE_POINT_OPTIONS = {
  au7: AU_GRADE_OPTIONS,
  us4: US_GRADE_OPTIONS,
  my4: MY_GRADE_OPTIONS,
  cn4: CN_GRADE_OPTIONS,
  nz9: NZ_GRADE_OPTIONS,
  de5: DE_GRADE_OPTIONS
};

function normaliseGradeCode(value) {
  return String(value ?? "").trim().toUpperCase();
}

function getGradePointMap(system = getGradingSystem()) {
  const options = GRADE_POINT_OPTIONS[system];
  if (!options) return null;
  return options.reduce((map, option) => {
    map[normaliseGradeCode(option.code)] = option;
    return map;
  }, {});
}

function getGradeOptions(system = getGradingSystem()) {
  return GRADE_POINT_OPTIONS[system] || null;
}

function getGradeOption(system, value) {
  const map = getGradePointMap(system);
  return map ? map[normaliseGradeCode(value)] || null : null;
}

function getGradingSystem() {
  const system = state.profile?.gradingSystem || "uk";
  return SUPPORTED_GRADING_SYSTEMS.includes(system) ? system : "uk";
}

function getCreditUnitLabel(options = {}) {
  const plural = options.plural !== false;
  const system = options.system || getGradingSystem();
  // Credit naming is local: AU units/credit points, US/MY credit hours, NZ points, DE ECTS.
  if (system === "au7") return plural ? "units" : "unit";
  if (system === "us4") return plural ? "GPA hours" : "GPA hour";
  if (system === "nz9") return plural ? "points" : "point";
  if (system === "de5") return "ECTS";
  return plural ? "credits" : "credit";
}

function getModuleCreditFieldLabel(system = getGradingSystem()) {
  if (system === "au7") return "Units / Credit Points";
  if (system === "us4") return "Credit Hours / GPA Hours";
  if (system === "nz9") return "Course Points";
  if (system === "de5") return "ECTS Credits";
  return "Credits";
}

function getGradeScaleConfig(system = getGradingSystem()) {
  if (system === "us4") {
    return {
      min: 0,
      max: 4,
      step: "0.01",
      suffix: "GPA",
      finalLabel: "Course Grade",
      markLabel: "Grade",
      placeholder: "Select grade"
    };
  }
  if (system === "my4") {
    return {
      min: 0,
      max: 4,
      step: "0.01",
      suffix: "GPA",
      finalLabel: "Course Grade",
      markLabel: "Grade",
      placeholder: "Select grade"
    };
  }
  if (system === "cn4") {
    return {
      min: 0,
      max: 4,
      step: "0.01",
      suffix: "GPA",
      finalLabel: "Course Grade / GPA",
      markLabel: "Grade / GPA",
      placeholder: "A-F or 0.00-4.00",
      allowNumericGradeInput: true,
      freeformGradeInput: true
    };
  }
  if (system === "au7") {
    return {
      min: 0,
      max: 7,
      step: "0.01",
      suffix: "GPA",
      finalLabel: "Course Grade",
      markLabel: "Grade",
      placeholder: "Select grade"
    };
  }
  if (system === "nz9") {
    return {
      min: 0,
      max: 9,
      step: "0.01",
      suffix: "GPA",
      finalLabel: "Paper Grade",
      markLabel: "Grade",
      placeholder: "Select grade"
    };
  }
  if (system === "de5") {
    return {
      min: 1,
      max: 5,
      step: "0.1",
      suffix: "grade",
      finalLabel: "Module Grade",
      markLabel: "Grade",
      placeholder: "1.0-5.0"
    };
  }
  return {
    min: 0,
    max: 100,
    step: "0.1",
    suffix: "%",
    finalLabel: "Final %",
    courseworkLabel: "Coursework %",
    examLabel: "Exam %",
    markLabel: "Mark %",
    placeholder: "-"
  };
}

function formatGradeInputValue(value) {
  if (value === null || value === undefined) return "";
  return getGradingSystem() === "uk" ? value.toFixed(1) : value.toFixed(2);
}

function clampGradeInputValue(value, system = getGradingSystem()) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const gradeMap = getGradePointMap(system);
  if (gradeMap && gradeMap[normaliseGradeCode(raw)]) return normaliseGradeCode(raw);
  if (gradeMap && !getGradeScaleConfig(system).allowNumericGradeInput) return "";
  const num = parseFloat(raw);
  if (Number.isNaN(num)) return raw;
  const config = getGradeScaleConfig(system);
  const min = config.min ?? 0;
  if (num > config.max) return system === "uk" ? String(config.max) : config.max.toFixed(system === "de5" ? 1 : 2);
  if (num < min) return system === "uk" ? String(min) : min.toFixed(system === "de5" ? 1 : 2);
  return raw;
}

function classifyFourPointGpa(mark) {
  if (mark >= 3.7) return { label: "A", badge: "A", cls: "cls-s-first", heroCls: "cls-first" };
  if (mark >= 3.3) return { label: "B+", badge: "B+", cls: "cls-s-21", heroCls: "cls-21" };
  if (mark >= 3.0) return { label: "B", badge: "B", cls: "cls-s-21", heroCls: "cls-21" };
  if (mark >= 2.7) return { label: "B-", badge: "B-", cls: "cls-s-22", heroCls: "cls-22" };
  if (mark >= 2.3) return { label: "C+", badge: "C+", cls: "cls-s-22", heroCls: "cls-22" };
  if (mark >= 2.0) return { label: "C", badge: "C", cls: "cls-s-third", heroCls: "cls-third" };
  if (mark >= 1.0) return { label: "D", badge: "D", cls: "cls-s-third", heroCls: "cls-third" };
  return { label: "F", badge: "F", cls: "", heroCls: "" };
}

function classifyAuGpa(mark) {
  if (mark >= 6.5) return { label: "HD", badge: "High Distinction", cls: "cls-s-first", heroCls: "cls-first" };
  if (mark >= 5.5) return { label: "D", badge: "Distinction", cls: "cls-s-21", heroCls: "cls-21" };
  if (mark >= 4.5) return { label: "Credit", badge: "Credit", cls: "cls-s-22", heroCls: "cls-22" };
  if (mark >= 4.0) return { label: "Pass", badge: "Pass", cls: "cls-s-third", heroCls: "cls-third" };
  return { label: "Fail", badge: "Fail", cls: "", heroCls: "" };
}

function classifyNzGpa(mark) {
  if (mark >= 8) return { label: "A", badge: "A range", cls: "cls-s-first", heroCls: "cls-first" };
  if (mark >= 6) return { label: "B+", badge: "B range", cls: "cls-s-21", heroCls: "cls-21" };
  if (mark >= 4) return { label: "B-", badge: "B range", cls: "cls-s-22", heroCls: "cls-22" };
  if (mark >= 1) return { label: "C", badge: "Pass", cls: "cls-s-third", heroCls: "cls-third" };
  return { label: "Fail", badge: "Fail", cls: "", heroCls: "" };
}

function classifyGermanGrade(mark) {
  if (mark <= 1.4) return { label: "Very Good", badge: "Very Good", cls: "cls-s-first", heroCls: "cls-first" };
  if (mark <= 2.4) return { label: "Good", badge: "Good", cls: "cls-s-21", heroCls: "cls-21" };
  if (mark <= 3.4) return { label: "Satisfactory", badge: "Satisfactory", cls: "cls-s-22", heroCls: "cls-22" };
  if (mark <= 4.0) return { label: "Sufficient", badge: "Sufficient", cls: "cls-s-third", heroCls: "cls-third" };
  return { label: "Fail", badge: "Fail", cls: "", heroCls: "" };
}

function formatGradePointValue(value, system = getGradingSystem()) {
  if (system === "au7" || system === "nz9") return value.toFixed(0);
  if (system === "de5") return value.toFixed(1);
  return value.toFixed(2);
}

function formatGradeOptionLabel(option, system = getGradingSystem()) {
  if (system === "de5") return option.label || option.code;
  return `${option.label || option.code} (${formatGradePointValue(option.value, system)})`;
}

function formatSelectedGrade(mark, options = {}) {
  if (mark === null || mark === undefined) return { main: "-", label: "", secondary: "" };
  const system = getGradingSystem();
  if (["us4", "my4"].includes(system)) {
    const exact = options.courseDisplay ? getGradeOption(system, options.rawValue) : null;
    const grade = exact || classifyFourPointGpa(mark);
    const pointLabel = system === "us4" ? "quality points" : "grade points";
    if (options.courseDisplay) {
      return {
        main: grade.short || grade.label || exact?.code || "-",
        label: `${mark.toFixed(2)} ${pointLabel}`,
        secondary: ""
      };
    }
    return {
      main: `${mark.toFixed(2)} GPA`,
      label: grade.label,
      secondary: ""
    };
  }
  if (system === "cn4") {
    const exact = options.courseDisplay ? getGradeOption(system, options.rawValue) : null;
    const grade = exact || classifyFourPointGpa(mark);
    return {
      main: options.courseDisplay && exact ? exact.label : `${mark.toFixed(2)} GPA`,
      label: options.courseDisplay ? `${mark.toFixed(2)} grade points` : grade.label,
      secondary: ""
    };
  }
  if (system === "au7") {
    const exact = options.courseDisplay ? getGradeOption(system, options.rawValue) : null;
    const grade = exact || classifyAuGpa(mark);
    if (options.courseDisplay) {
      return {
        main: grade.short || grade.label || exact?.code || "-",
        label: `${mark.toFixed(0)} grade points`,
        secondary: ""
      };
    }
    return {
      main: `${mark.toFixed(2)} GPA`,
      label: grade.label,
      secondary: ""
    };
  }
  if (system === "nz9") {
    const exact = options.courseDisplay ? getGradeOption(system, options.rawValue) : null;
    const grade = exact || classifyNzGpa(mark);
    if (options.courseDisplay) {
      return {
        main: grade.short || grade.label || exact?.code || "-",
        label: `${mark.toFixed(0)} grade points`,
        secondary: ""
      };
    }
    return {
      main: `${mark.toFixed(2)} GPA`,
      label: grade.label,
      secondary: ""
    };
  }
  if (system === "de5") {
    const grade = classifyGermanGrade(mark);
    return {
      main: `${mark.toFixed(2)} grade`,
      label: grade.label,
      secondary: "Lower is better"
    };
  }
  const percent = `${mark.toFixed(1)}%`;
  const cls = classify(mark);
  return { main: percent, label: cls?.label || "", secondary: "" };
}

function formatModuleGradeDisplay(mi) {
  const final = getModuleFinal(mi);
  const rawValue = getStore().finalGrades?.[mi];
  return formatSelectedGrade(final, { courseDisplay: true, rawValue });
}

function normalizeTermValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return "full";
  if (getCurrentTermOptions().some((option) => option.value === raw)) return raw;
  if (/^sem\d+$/i.test(raw)) return raw.toLowerCase();
  if (raw === "all") return "all";
  return "full";
}

function getTermLabel(value) {
  const normalised = normalizeTermValue(value);
  if (normalised === "all") return "Full Year";
  return getCurrentTermOptions().find((option) => option.value === normalised)?.label || "Full Year";
}

function getModuleTerm(mi) {
  return normalizeTermValue(MODULES[mi]?.term);
}

function uniqueTermOptions(options) {
  const seen = new Set();
  return (options || []).filter((option) => {
    const value = String(option?.value || "").trim();
    const label = String(option?.label || "").trim();
    if (!value || !label || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function ensureStoreTermOptions(store = getStore()) {
  if (!store) return deepClone(MODULE_TERM_OPTIONS);
  const existing = Array.isArray(store.termOptions) ? store.termOptions : [];
  const fromModules = (store.modules || [])
    .map((mod) => String(mod?.term || "").trim())
    .filter((term) => term && !MODULE_TERM_OPTIONS.some((option) => option.value === term))
    .map((term) => ({ value: term, label: /^sem(\d+)$/i.test(term) ? `Semester ${term.match(/\d+/)?.[0]}` : term }));
  store.termOptions = uniqueTermOptions([...MODULE_TERM_OPTIONS, ...existing, ...fromModules]);
  return store.termOptions;
}

function getCurrentTermOptions(store = null) {
  try {
    return ensureStoreTermOptions(store || getStore());
  } catch (error) {
    return deepClone(MODULE_TERM_OPTIONS);
  }
}

function isKnownTermValue(value, store = null) {
  const raw = String(value || "").trim();
  if (raw === "all") return true;
  return getCurrentTermOptions(store).some((option) => option.value === raw);
}

function getActiveTermFilter() {
  const term = state.ui?.currentTermFilter || "all";
  return isKnownTermValue(term) ? term : "all";
}

function isModuleVisibleInActiveTerm(mi) {
  const active = getActiveTermFilter();
  return active === "all" || getModuleTerm(mi) === active;
}

function createNextTermOption(store = getStore()) {
  const options = getCurrentTermOptions(store);
  let number = 1;
  while (options.some((option) => option.value === `sem${number}`)) number += 1;
  return { value: `sem${number}`, label: `Semester ${number}` };
}

function topicKey(mi, ti) { return `t_${mi}_${ti}`; }
function getModuleDone(mi) {
  const store = getStore();
  return MODULES[mi].topics.reduce((sum, _, ti) => {
    const topic = getTopicEntry(mi, ti);
    let done = store.topics[topicKey(mi, ti)] ? 1 : 0;
    done += topic.subtopics.filter((_, si) => !!store.topics[subtopicKey(mi, ti, si)]).length;
    return sum + done;
  }, 0);
}
function getModuleTotal(mi) {
  return MODULES[mi].topics.reduce((sum, _, ti) => sum + 1 + getTopicEntry(mi, ti).subtopics.length, 0);
}
function getModulePct(mi) { return getModuleTotal(mi) ? (getModuleDone(mi) / getModuleTotal(mi)) * 100 : 0; }
function getBlackboardLink(mi) {
  const store = getStore();
  return store.blackboard[mi] || "";
}


function getLibraryFolderRuntime() {
  if (!window.__unitrackLibraryFolders) {
    window.__unitrackLibraryFolders = {
      active: { formula: "", relevant: "" },
      history: { formula: [""], relevant: [""] },
      historyIndex: { formula: 0, relevant: 0 }
    };
  }
  return window.__unitrackLibraryFolders;
}
function getLibraryTypeKey(type) { return type === "formula" ? "formula" : "relevant"; }
function normaliseLibraryFolderPath(path) {
  return String(path || "").replace(/\\+/g, "/").split("/").map((part) => part.trim()).filter(Boolean).join("/");
}
function getLibraryFolderName(path) {
  const parts = normaliseLibraryFolderPath(path).split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "All";
}
function getLibraryFolderParent(path) {
  const parts = normaliseLibraryFolderPath(path).split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}
function joinLibraryFolderPath(parent, child) {
  return [normaliseLibraryFolderPath(parent), normaliseLibraryFolderPath(child)].filter(Boolean).join("/");
}
function jsString(value) {
  return JSON.stringify(String(value || "")).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
function getActiveLibraryFolder(type) {
  const runtime = getLibraryFolderRuntime();
  return normaliseLibraryFolderPath(runtime.active[getLibraryTypeKey(type)] || "");
}
function setActiveLibraryFolder(type, folder, options = {}) {
  const runtime = getLibraryFolderRuntime();
  const key = getLibraryTypeKey(type);
  const next = normaliseLibraryFolderPath(folder);
  const current = normaliseLibraryFolderPath(runtime.active[key] || "");
  runtime.active[key] = next;
  if (!options.skipHistory && next !== current) {
    const history = runtime.history[key] || [""];
    const index = Number.isInteger(runtime.historyIndex[key]) ? runtime.historyIndex[key] : history.length - 1;
    const trimmed = history.slice(0, index + 1);
    trimmed.push(next);
    runtime.history[key] = trimmed.slice(-40);
    runtime.historyIndex[key] = runtime.history[key].length - 1;
  }
}
function getLibraryTarget() {
  if (moduleLibraryScopeCustomId) return { customId: moduleLibraryScopeCustomId, mi: null };
  if (moduleLibraryScopeMi !== null && moduleLibraryScopeMi !== undefined) return { customId: null, mi: moduleLibraryScopeMi };
  return parseLibraryFilterValue(moduleLibraryFilter);
}
function getLibraryFolderRegistry(type, target = null) {
  const store = getStore();
  if (!store.libraryFolders || typeof store.libraryFolders !== "object" || Array.isArray(store.libraryFolders)) {
    store.libraryFolders = { formula: {}, relevant: {}, custom: {} };
  }
  if (!store.libraryFolders.formula) store.libraryFolders.formula = {};
  if (!store.libraryFolders.relevant) store.libraryFolders.relevant = {};
  if (!store.libraryFolders.custom) store.libraryFolders.custom = {};
  const typeKey = getLibraryTypeKey(type);
  const parsed = target || getLibraryTarget();
  if (parsed.customId) {
    if (!store.libraryFolders.custom[parsed.customId]) store.libraryFolders.custom[parsed.customId] = { formula: [], relevant: [] };
    if (!Array.isArray(store.libraryFolders.custom[parsed.customId][typeKey])) store.libraryFolders.custom[parsed.customId][typeKey] = [];
    return store.libraryFolders.custom[parsed.customId][typeKey];
  }
  if (parsed.mi !== null && parsed.mi !== undefined) {
    const key = String(parsed.mi);
    if (!Array.isArray(store.libraryFolders[typeKey][key])) store.libraryFolders[typeKey][key] = [];
    return store.libraryFolders[typeKey][key];
  }
  return [];
}
function addLibraryFolderToRegistry(type, path, target = null) {
  const clean = normaliseLibraryFolderPath(path);
  if (!clean) return;
  const registry = getLibraryFolderRegistry(type, target);
  if (!registry.includes(clean)) registry.push(clean);
  registry.sort((a,b)=>a.localeCompare(b));
}
function removeLibraryFolderFromRegistry(type, predicate, target = null) {
  const registry = getLibraryFolderRegistry(type, target);
  for (let i = registry.length - 1; i >= 0; i -= 1) if (predicate(registry[i])) registry.splice(i, 1);
}
function renameLibraryFolderInRegistry(type, oldPath, newPath, target = null) {
  const registry = getLibraryFolderRegistry(type, target);
  const oldClean = normaliseLibraryFolderPath(oldPath);
  const newClean = normaliseLibraryFolderPath(newPath);
  const next = new Set();
  registry.forEach((folder) => {
    const clean = normaliseLibraryFolderPath(folder);
    if (clean === oldClean) next.add(newClean);
    else if (clean.startsWith(oldClean + "/")) next.add(newClean + clean.slice(oldClean.length));
    else next.add(clean);
  });
  registry.splice(0, registry.length, ...Array.from(next).filter(Boolean).sort((a,b)=>a.localeCompare(b)));
}
function getLibrarySourceArray(type, target = null) {
  const parsed = target || getLibraryTarget();
  const store = getStore();
  if (parsed.customId) {
    const library = getCustomLibrary(parsed.customId);
    if (!library) return null;
    const key = type === "formula" ? "materials" : "relevantLinks";
    if (!Array.isArray(library[key])) library[key] = [];
    return library[key];
  }
  if (parsed.mi !== null && parsed.mi !== undefined) {
    if (type === "formula") {
      if (!store.formulas) store.formulas = {};
      if (!Array.isArray(store.formulas[parsed.mi])) store.formulas[parsed.mi] = getFormulaLinks(parsed.mi);
      return store.formulas[parsed.mi];
    }
    if (!store.relevantLinks) store.relevantLinks = {};
    if (!Array.isArray(store.relevantLinks[parsed.mi])) store.relevantLinks[parsed.mi] = getRelevantLinks(parsed.mi);
    return store.relevantLinks[parsed.mi];
  }
  return null;
}
function getAllLibraryFolderPaths(type, items, target = null) {
  const paths = new Set();
  getLibraryFolderRegistry(type, target).forEach((folder) => {
    const clean = normaliseLibraryFolderPath(folder);
    if (!clean) return;
    const parts = clean.split("/");
    parts.forEach((_, index) => paths.add(parts.slice(0, index + 1).join("/")));
  });
  (items || []).forEach((item) => {
    const folder = normaliseLibraryFolderPath(item.folder);
    if (!folder) return;
    const parts = folder.split("/");
    parts.forEach((_, index) => paths.add(parts.slice(0, index + 1).join("/")));
  });
  return Array.from(paths).sort((a,b)=>a.localeCompare(b));
}
function getImmediateLibrarySubfolders(type, items, currentFolder, target = null) {
  const current = normaliseLibraryFolderPath(currentFolder);
  const prefix = current ? current + "/" : "";
  const children = new Map();
  getAllLibraryFolderPaths(type, items, target).forEach((path) => {
    if (current && path === current) return;
    if (!path.startsWith(prefix)) return;
    const rest = path.slice(prefix.length);
    if (!rest || rest.includes("/")) return;
    const fullPath = joinLibraryFolderPath(current, rest);
    const count = (items || []).filter((item) => {
      const folder = normaliseLibraryFolderPath(item.folder);
      return folder === fullPath || folder.startsWith(fullPath + "/");
    }).length;
    children.set(fullPath, { name: rest, path: fullPath, count });
  });
  return Array.from(children.values()).sort((a,b)=>a.name.localeCompare(b.name));
}
function itemIsInLibraryFolder(item, currentFolder, includeDescendants = false) {
  const folder = normaliseLibraryFolderPath(item.folder);
  const current = normaliseLibraryFolderPath(currentFolder);
  if (!current) return includeDescendants ? true : folder === "";
  return includeDescendants ? (folder === current || folder.startsWith(current + "/")) : folder === current;
}
function normaliseLibraryTimestamp(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}
function libraryTimestampMs(value) {
  const iso = normaliseLibraryTimestamp(value);
  return iso ? Date.parse(iso) : 0;
}
function libraryNowIso() {
  return new Date().toISOString();
}
function normalizeLibraryItem(item, fallbackName = "Saved item") {
  if (typeof item === "string") {
    return { name: fallbackName, url: item, tag: "", notes: "", folder: "", createdAt: "", updatedAt: "" };
  }
  if (!item || typeof item !== "object") {
    return { name: fallbackName, url: "", tag: "", notes: "", folder: "", createdAt: "", updatedAt: "" };
  }
  const createdAt = normaliseLibraryTimestamp(item.createdAt || item.addedAt || item.savedAt || "");
  const updatedAt = normaliseLibraryTimestamp(item.updatedAt || createdAt || item.addedAt || item.savedAt || "");
  return {
    name: String(item.name || item.title || fallbackName).trim() || fallbackName,
    url: String(item.url || item.href || "").trim(),
    tag: String(item.tag || item.category || "").trim(),
    notes: String(item.notes || item.note || "").trim(),
    folder: normaliseLibraryFolderPath(item.folder || item.folderPath || ""),
    createdAt,
    updatedAt
  };
}

function getFormulaLinks(mi) {
  const store = getStore();
  const raw = store.formulas?.[mi];
  if (Array.isArray(raw)) {
    const mod = MODULES[mi];
    return raw
      .map((item) => normalizeLibraryItem(item, `${mod?.short || mod?.kanji || "Module"} Material`))
      .filter((item) => item.url);
  }
  if (typeof raw === "string" && raw.trim()) {
    const mod = MODULES[mi];
    return [normalizeLibraryItem(raw, `${mod?.short || mod?.kanji || "Module"} Material`)];
  }
  return [];
}

function getRelevantLinks(mi) {
  const store = getStore();
  if (!store.relevantLinks) store.relevantLinks = {};
  const raw = store.relevantLinks[mi];
  if (Array.isArray(raw)) {
    return raw
      .map((item) => normalizeLibraryItem(item, "Useful resource"))
      .filter((item) => item.url);
  }
  if (typeof raw === "string" && raw.trim()) {
    return [normalizeLibraryItem(raw, "Useful resource")];
  }
  return [];
}

function getCustomLibraries() {
  const store = getStore();
  if (!store.customLibraries || typeof store.customLibraries !== "object" || Array.isArray(store.customLibraries)) {
    store.customLibraries = {};
  }
  return store.customLibraries;
}

function getCustomLibrary(id) {
  return getCustomLibraries()[id] || null;
}

function getCustomLibraryItems(id, type) {
  const library = getCustomLibrary(id);
  const key = type === "formula" ? "materials" : "relevantLinks";
  const raw = library?.[key];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => normalizeLibraryItem(item, type === "formula" ? "Saved material" : "Useful resource"))
    .filter((item) => item.url);
}

function getLibraryContextLabel(context) {
  if (context?.customId) return getCustomLibrary(context.customId)?.name || "Custom Library";
  const mod = MODULES[context?.mi];
  return mod?.short || mod?.kanji || "Module";
}

const DEFAULT_LIBRARY_TYPE_SUGGESTIONS = {
  formula: [
    "Lecture slides",
    "Lecture notes",
    "Revision notes",
    "Tutorial sheet",
    "Worksheet",
    "Past paper",
    "Model answers",
    "Formula sheet",
    "Lab handout",
    "Assignment brief",
    "Reading",
    "Recording"
  ],
  relevant: [
    "Article",
    "Reference site",
    "Video",
    "Documentation",
    "Research paper",
    "Textbook chapter",
    "Dataset",
    "Guide",
    "Forum thread",
    "Tool"
  ]
};

function getLibraryTypeSuggestions(type = "formula") {
  const store = getStore();
  if (!store.libraryItemTypes || typeof store.libraryItemTypes !== "object" || Array.isArray(store.libraryItemTypes)) {
    store.libraryItemTypes = {};
  }
  const key = type === "relevant" ? "relevant" : "formula";
  const saved = Array.isArray(store.libraryItemTypes[key]) ? store.libraryItemTypes[key] : [];
  const combined = [...DEFAULT_LIBRARY_TYPE_SUGGESTIONS[key], ...saved]
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  return Array.from(new Set(combined)).sort((a, b) => a.localeCompare(b));
}

function saveLibraryTypeSuggestion(type, value) {
  const text = String(value || "").trim();
  if (!text) return;
  const store = getStore();
  if (!store.libraryItemTypes || typeof store.libraryItemTypes !== "object" || Array.isArray(store.libraryItemTypes)) {
    store.libraryItemTypes = {};
  }
  const key = type === "relevant" ? "relevant" : "formula";
  const current = Array.isArray(store.libraryItemTypes[key]) ? store.libraryItemTypes[key] : [];
  if (current.some((item) => String(item || "").trim().toLowerCase() === text.toLowerCase())) return;
  store.libraryItemTypes[key] = [...current, text].sort((a, b) => a.localeCompare(b));
}

function populateLibraryTypeOptions(type = "formula") {
  const list = document.getElementById("link-tag-options");
  if (!list) return;
  list.innerHTML = getLibraryTypeSuggestions(type)
    .map((item) => `<option value="${escapeHtml(item)}"></option>`)
    .join("");
}

function parseLibraryFilterValue(value) {
  const raw = value === undefined || value === null || value === "" ? "all" : String(value);
  if (raw.startsWith("custom:")) return { customId: raw.slice(7), mi: null };
  if (raw === "all") return { customId: null, mi: null };
  const mi = Number(raw);
  return { customId: null, mi: Number.isInteger(mi) ? mi : null };
}

function getActiveCustomLibraryId() {
  if (moduleLibraryScopeCustomId) return moduleLibraryScopeCustomId;
  return parseLibraryFilterValue(moduleLibraryFilter).customId;
}

function getCourseworkComponents(mi) {
  const store = getStore();
  if (!store.courseworkComponents) store.courseworkComponents = {};
  if (!Array.isArray(store.courseworkComponents[mi])) store.courseworkComponents[mi] = [];
  return store.courseworkComponents[mi];
}

function calculateCourseworkFromComponents(mi) {
  const components = getCourseworkComponents(mi);
  const valid = components
    .map((component, index) => ({
      index,
      name: component.name || `Component ${index + 1}`,
      mark: parseGradeValue(component.mark),
      weight: parseGradeValue(component.weight, "uk")
    }))
    .filter((component) => component.mark !== null);

  if (!valid.length) {
    return { mark: null, weightTotal: 0, count: components.length };
  }

  const explicit = valid.filter((component) => component.weight !== null);
  const unweighted = valid.filter((component) => component.weight === null);
  const explicitTotal = explicit.reduce((sum, component) => sum + component.weight, 0);
  const remaining = Math.max(0, 100 - explicitTotal);
  const autoWeight = unweighted.length ? remaining / unweighted.length : 0;

  let weightedSum = 0;
  let assignedTotal = 0;

  valid.forEach((component) => {
    const weight = component.weight !== null ? component.weight : autoWeight;
    weightedSum += component.mark * weight;
    assignedTotal += weight;
  });

  if (assignedTotal <= 0) return { mark: null, weightTotal: 0, count: components.length };

  return {
    mark: weightedSum / assignedTotal,
    weightTotal: assignedTotal,
    count: components.length
  };
}

function getEffectiveCourseworkMark(mi) {
  const calculated = calculateCourseworkFromComponents(mi);
  if (calculated.mark !== null) return calculated.mark;
  return parseMark(getStore().coursework[mi]);
}

function getModuleFinal(mi) {
  const mod = MODULES[mi];
  const store = getStore();
  if (getGradingSystem() !== "uk") {
    if (!store.finalGrades) store.finalGrades = {};
    return parseMark(store.finalGrades[mi]);
  }
  const cw = getEffectiveCourseworkMark(mi);
  const ex = parseMark(store.exams[mi]);
  if (mod.cw === 0) return ex;
  if (cw === null || ex === null) return null;
  const final = (cw * mod.cw + ex * mod.exam) / 100;
  return Math.max(0, Math.min(getGradeScaleConfig().max, final));
}

function classify(mark) {
  if (mark === null) return null;
  const system = getGradingSystem();
  if (system === "us4" || system === "my4" || system === "cn4") return classifyFourPointGpa(mark);
  if (system === "au7") return classifyAuGpa(mark);
  if (system === "nz9") return classifyNzGpa(mark);
  if (system === "de5") return classifyGermanGrade(mark);
  if (mark >= 70) return { label: "1st", badge: "1st Class", cls: "cls-s-first", heroCls: "cls-first" };
  if (mark >= 60) return { label: "2:1", badge: "2:1", cls: "cls-s-21", heroCls: "cls-21" };
  if (mark >= 50) return { label: "2:2", badge: "2:2", cls: "cls-s-22", heroCls: "cls-22" };
  if (mark >= 40) return { label: "3rd", badge: "3rd", cls: "cls-s-third", heroCls: "cls-third" };
  return { label: "Fail", badge: "Fail", cls: "", heroCls: "" };
}

function getGradeAggregate(filterFn = null, options = {}) {
  const respectActiveTerm = options.respectActiveTerm !== false;
  const activeTerm = respectActiveTerm ? getActiveTermFilter() : "all";
  let weighted = 0;
  let credits = 0;
  let attemptedCredits = 0;
  let count = 0;
  MODULES.forEach((mod, mi) => {
    if (activeTerm !== "all" && getModuleTerm(mi) !== activeTerm) return;
    if (filterFn && !filterFn(mod, mi)) return;
    const moduleCredits = Number(mod.credits) || 0;
    attemptedCredits += moduleCredits;
    const final = getModuleFinal(mi);
    if (final !== null) {
      weighted += final * moduleCredits;
      credits += moduleCredits;
      count += 1;
    }
  });
  return credits ? { value: weighted / credits, credits, attemptedCredits, gradePoints: weighted, count } : null;
}

function getWeightedAvg() {
  const aggregate = getGradeAggregate();
  return aggregate ? aggregate.value : null;
}

function getMajorGpa() {
  if (getGradingSystem() !== "us4") return null;
  const store = getStore();
  const activeTerm = getActiveTermFilter();
  let weighted = 0;
  let credits = 0;
  MODULES.forEach((mod, mi) => {
    if (activeTerm !== "all" && getModuleTerm(mi) !== activeTerm) return;
    if (!store.majorModules?.[mi]) return;
    const final = getModuleFinal(mi);
    if (final !== null) {
      weighted += final * mod.credits;
      credits += mod.credits;
    }
  });
  return credits ? { value: weighted / credits, credits } : null;
}

function getTermBreakdown() {
  return getCurrentTermOptions().map((term) => {
    const aggregate = getGradeAggregate((_, mi) => getModuleTerm(mi) === term.value, { respectActiveTerm: false });
    const totalCredits = MODULES.reduce((sum, mod, mi) => {
      if (getModuleTerm(mi) !== term.value) return sum;
      return sum + (Number(mod.credits) || 0);
    }, 0);
    const moduleCount = MODULES.filter((_, mi) => getModuleTerm(mi) === term.value).length;
    return Object.assign({
      value: null,
      credits: 0,
      attemptedCredits: totalCredits,
      gradePoints: 0,
      count: 0
    }, aggregate || {}, {
      term: term.value,
      label: term.label,
      attemptedCredits: totalCredits,
      moduleCount
    });
  }).filter((term) => term.moduleCount > 0);
}

function getAggregateMetricLabel(system = getGradingSystem()) {
  if (system === "uk") return "Weighted average";
  if (system === "de5") return "Weighted grade";
  return "GPA";
}

function formatGradeAggregateStatus(aggregate) {
  if (!aggregate) return "Enter module grades below";
  const system = getGradingSystem();
  const unitLabel = getCreditUnitLabel({ plural: aggregate.credits !== 1 });
  const totalCredits = getActiveTermFilter() === "all"
    ? (TOTAL_CREDITS || aggregate.attemptedCredits || aggregate.credits)
    : (aggregate.attemptedCredits || aggregate.credits);
  const metric = system === "uk"
    ? "Cumulative year average"
    : system === "de5"
      ? "Cumulative weighted grade"
      : "Cumulative GPA";
  let text = `${metric} based on ${aggregate.credits} / ${totalCredits} ${unitLabel}`;
  if (system !== "uk" && system !== "de5") text += ` · Total grade points ${aggregate.gradePoints.toFixed(2)}`;
  if (system === "de5") text += " · Lower is better";
  return text;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeUrl(url) {
  const trimmed = String(url || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return "https://" + trimmed.replace(/^\/+/, "");
}

function parseDeadlineInput(input) {
  const raw = String(input || "").trim();
  const match = raw.match(/^(\d{1,2})[\/\-. ](\d{1,2})[\/\-. ](\d{4})(?:[ ,]+(\d{1,2}):(\d{2}))?$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const hours = Number(match[4] ?? 0);
  const minutes = Number(match[5] ?? 0);
  const date = new Date(year, month - 1, day, hours, minutes);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    hours > 23 ||
    minutes > 59
  ) return null;
  return date;
}

function toDeadlineStorageString(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function setBlackboardLink(mi, event) {
  if (event) event.stopPropagation();
  openLinkForm({ type: "blackboard", mi });
}

function openLinkForm(context) {
  linkFormContext = context;
  const modal = document.getElementById("link-form-modal");
  const subtitle = document.getElementById("link-form-subtitle");
  const title = document.getElementById("link-form-title");
  const nameField = document.getElementById("link-name-field");
  const nameInput = document.getElementById("link-name-input");
  const urlInput = document.getElementById("link-url-input");
  const tagInput = document.getElementById("link-tag-input");
  const tagLabel = document.getElementById("link-tag-label");
  const tagField = document.getElementById("link-tag-field");
  const notesInput = document.getElementById("link-notes-input");
  const folderInput = document.getElementById("link-folder-input");
  const folderField = document.getElementById("link-folder-field");

  nameInput.value = "";
  urlInput.value = "";
  tagInput.value = "";
  notesInput.value = "";
  if (folderInput) folderInput.value = normaliseLibraryFolderPath(context.folder || getActiveLibraryFolder(context.type));
  nameField.style.display = "block";
  if (folderField) folderField.style.display = "block";
  if (tagField) tagField.style.display = "block";

  const editingItem = context.mode === "edit"
    ? (context.customId
      ? getCustomLibraryItems(context.customId, context.type)[context.index]
      : (context.type === "formula" ? getFormulaLinks(context.mi)[context.index] : getRelevantLinks(context.mi)[context.index]))
    : null;

  if (context.type === "blackboard") {
    subtitle.textContent = "Blackboard";
    title.textContent = "Set Blackboard Link";
    nameField.style.display = "none";
    urlInput.value = getBlackboardLink(context.mi) || "";
    tagInput.closest(".deadline-form-row").style.display = "none";
    if (tagField) tagField.style.display = "none";
    if (folderField) folderField.style.display = "none";
  } else if (context.type === "formula") {
    subtitle.textContent = "Module Material";
    title.textContent = context.mode === "edit" ? "Edit Module Material" : "Add Module Material";
    nameInput.value = editingItem?.name || (getLibraryContextLabel(context) + " Material");
    tagInput.closest(".deadline-form-row").style.display = "grid";
    if (tagLabel) tagLabel.textContent = "Resource Type";
    tagInput.placeholder = "Lecture slides";
    populateLibraryTypeOptions("formula");
  } else {
    subtitle.textContent = "Relevant Links";
    title.textContent = context.mode === "edit" ? "Edit Relevant Link" : "Add Relevant Link";
    nameInput.value = editingItem?.name || "Useful resource";
    tagInput.closest(".deadline-form-row").style.display = "grid";
    if (tagLabel) tagLabel.textContent = "Link Type";
    tagInput.placeholder = "Reference site";
    populateLibraryTypeOptions("relevant");
  }

  if (editingItem) {
    urlInput.value = editingItem.url || "";
    tagInput.value = editingItem.tag || "";
    notesInput.value = editingItem.notes || "";
    if (folderInput) folderInput.value = normaliseLibraryFolderPath(editingItem.folder || context.folder || getActiveLibraryFolder(context.type));
  }

  if (context?.fromLibrary) modal.classList.add("library-v10-link-modal");
  else modal.classList.remove("library-v10-link-modal");
  modal.classList.remove("hidden");
  setTimeout(() => (nameField.style.display === "none" ? urlInput : nameInput).focus(), 0);
}

function closeLinkForm() {
  const shouldReturnToLibrary = !!linkFormContext?.fromLibrary;
  const modal = document.getElementById("link-form-modal");
  modal.classList.add("hidden");
  modal.classList.remove("library-v10-link-modal");
  linkFormContext = null;
  if (shouldReturnToLibrary) {
    document.getElementById("module-library-modal")?.classList.remove("hidden");
    renderModuleLibrary();
  }
}

function saveLinkForm() {
  if (!linkFormContext) return;
  const nameInput = document.getElementById("link-name-input");
  const urlInput = document.getElementById("link-url-input");
  const tagInput = document.getElementById("link-tag-input");
  const notesInput = document.getElementById("link-notes-input");
  const folderInput = document.getElementById("link-folder-input");
  const folderField = document.getElementById("link-folder-field");
  const url = (urlInput.value || "").trim();
  const store = getStore();

  if (linkFormContext.type === "blackboard") {
    if (url) store.blackboard[linkFormContext.mi] = safeUrl(url);
    else delete store.blackboard[linkFormContext.mi];
    save();
    updateBlackboardButton(linkFormContext.mi);
    closeLinkForm();
    return;
  }

  const name = (nameInput.value || "").trim();
  const tag = (tagInput.value || "").trim();
  const notes = (notesInput.value || "").trim();
  const folder = normaliseLibraryFolderPath(folderInput?.value || linkFormContext.folder || getActiveLibraryFolder(linkFormContext.type));
  if (!name || !url) {
    alert("Please enter both a name and a URL.");
    return;
  }
  let existingItem = null;
  if (linkFormContext.mode === "edit") {
    if (linkFormContext.customId) existingItem = getCustomLibraryItems(linkFormContext.customId, linkFormContext.type)[linkFormContext.index] || null;
    else if (linkFormContext.type === "formula") existingItem = getFormulaLinks(linkFormContext.mi)[linkFormContext.index] || null;
    else existingItem = getRelevantLinks(linkFormContext.mi)[linkFormContext.index] || null;
  }
  const now = libraryNowIso();
  const payload = {
    name,
    url: safeUrl(url),
    tag,
    notes,
    folder,
    createdAt: normaliseLibraryTimestamp(existingItem?.createdAt) || now,
    updatedAt: now
  };
  if (tag) saveLibraryTypeSuggestion(linkFormContext.type, tag);
  if (folder) addLibraryFolderToRegistry(linkFormContext.type, folder, { customId: linkFormContext.customId || null, mi: linkFormContext.mi ?? null });

  if (linkFormContext.customId) {
    const libraries = getCustomLibraries();
    const library = libraries[linkFormContext.customId];
    if (!library) return;
    const key = linkFormContext.type === "formula" ? "materials" : "relevantLinks";
    const items = getCustomLibraryItems(linkFormContext.customId, linkFormContext.type).slice();
    if (linkFormContext.mode === "edit" && items[linkFormContext.index]) items[linkFormContext.index] = payload;
    else items.push(payload);
    library[key] = items;
    library.updatedAt = now;
    save();
  } else if (linkFormContext.type === "formula") {
    const items = getFormulaLinks(linkFormContext.mi).slice();
    if (linkFormContext.mode === "edit" && items[linkFormContext.index]) items[linkFormContext.index] = payload;
    else items.push(payload);
    store.formulas[linkFormContext.mi] = items;
    save();
    updateFormulaButton(linkFormContext.mi);
  } else if (linkFormContext.type === "relevant") {
    if (!store.relevantLinks) store.relevantLinks = {};
    const items = getRelevantLinks(linkFormContext.mi).slice();
    if (linkFormContext.mode === "edit" && items[linkFormContext.index]) items[linkFormContext.index] = payload;
    else items.push(payload);
    store.relevantLinks[linkFormContext.mi] = items;
    save();
    renderRelevantLinks(linkFormContext.mi);
  }
  closeLinkForm();
  renderModuleLibrary();
}

function openBlackboardLink(mi, event) {
  if (event) event.stopPropagation();
  const url = getBlackboardLink(mi);
  if (url) window.open(url, "_blank", "noopener");
  else setBlackboardLink(mi);
}

function updateBlackboardButton(mi) {
  const btn = document.getElementById(`bb-link-${mi}`);
  if (!btn) return;
  const hasLink = !!getBlackboardLink(mi);
  const compact = document.body.classList.contains("compact-ui");
  if (compact) btn.textContent = hasLink ? "Blackboard" : "Set";
  else btn.textContent = hasLink ? "Launch Blackboard" : "Set Blackboard";
}

function setFormulaLink(mi, event) {
  if (event) event.stopPropagation();
  openLinkForm({ type: "formula", mi });
}

function getModuleLibraryItems(type, moduleIndex = null, options = {}) {
  const items = [];
  MODULES.forEach((mod, mi) => {
    if (moduleIndex !== null && mi !== moduleIndex) return;
    const source = type === "formula" ? getFormulaLinks(mi) : getRelevantLinks(mi);
    source.forEach((item, index) => {
      items.push({
        type,
        mi,
        index,
        moduleCode: mod.kanji || mod.short || `Module ${mi + 1}`,
        moduleName: mod.name || mod.short || `Module ${mi + 1}`,
        name: item.name || "",
        url: item.url || "",
        tag: item.tag || "",
        notes: item.notes || "",
        folder: normaliseLibraryFolderPath(item.folder || "")
      });
    });
  });
  Object.entries(getCustomLibraries()).forEach(([id, library]) => {
    if (moduleIndex !== null) return;
    if (moduleLibraryScopeCustomId && id !== moduleLibraryScopeCustomId) return;
    getCustomLibraryItems(id, type).forEach((item, index) => {
      items.push({
        type,
        mi: null,
        customId: id,
        index,
        moduleCode: library.name || "Custom Library",
        moduleName: library.description || library.name || "Custom Library",
        name: item.name || "",
        url: item.url || "",
        tag: item.tag || "",
        notes: item.notes || "",
        folder: normaliseLibraryFolderPath(item.folder || "")
      });
    });
  });
  const search = moduleLibrarySearch.trim().toLowerCase();
  const filter = moduleLibraryScopeMi === null && !moduleLibraryScopeCustomId ? moduleLibraryFilter : (moduleLibraryScopeCustomId ? `custom:${moduleLibraryScopeCustomId}` : String(moduleLibraryScopeMi));
  const currentFolder = getActiveLibraryFolder(type);
  return items.filter((item) => {
    if (filter !== "all") {
      if (filter.startsWith("custom:")) {
        if (item.customId !== filter.slice(7)) return false;
      } else if (String(item.mi) !== filter) return false;
    }
    if (!options.ignoreFolder) {
      if (!itemIsInLibraryFolder(item, currentFolder, !!search)) return false;
    }
    if (!search) return true;
    return [item.name, item.url, item.tag, item.notes, item.folder, item.moduleCode, item.moduleName]
      .join(" ")
      .toLowerCase()
      .includes(search);
  });
}

function deleteFormulaLink(mi, index, event) {
  if (event) event.stopPropagation();
  const items = getFormulaLinks(mi).slice();
  if (!items[index]) return;
  items.splice(index, 1);
  const store = getStore();
  if (items.length) store.formulas[mi] = items; else delete store.formulas[mi];
  save();
  updateFormulaButton(mi);
  renderModuleLibrary();
}

function openFormulaLink(mi, event) {
  openModuleLibrary(mi, "materials", event);
}

function renderFormulaLinks(mi) {
  const host = document.getElementById(`formula-links-${mi}`);
  if (!host) return;
  const items = getFormulaLinks(mi);
  if (!items.length) {
    host.innerHTML = '<div class="formula-empty">No module material added yet.</div>';
    return;
  }
  host.innerHTML = items.map((item, index) => `
    <div class="formula-chip">
      <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.name)}</a>
      <button class="formula-remove-btn" type="button" onclick="deleteFormulaLink(${mi}, ${index}, event)" title="Delete module material">x</button>
    </div>
  `).join("");
}

function addRelevantLink(mi, event) {
  if (event) event.stopPropagation();
  openLinkForm({ type: "relevant", mi });
}

function deleteRelevantLink(mi, index, event) {
  if (event) event.stopPropagation();
  const items = getRelevantLinks(mi).slice();
  if (!items[index]) return;
  items.splice(index, 1);
  const store = getStore();
  if (!store.relevantLinks) store.relevantLinks = {};
  if (items.length) store.relevantLinks[mi] = items; else delete store.relevantLinks[mi];
  save();
  renderRelevantLinks(mi);
  renderModuleLibrary();
}

function renderRelevantLinks(mi) {
  const host = document.getElementById(`relevant-links-${mi}`);
  if (!host) return;
  const items = getRelevantLinks(mi);
  if (!items.length) {
    host.innerHTML = '<div class="relevant-links-empty">No relevant links added yet.</div>';
    return;
  }
  host.innerHTML = items.map((item, index) => `
    <div class="relevant-link-chip">
      <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.name)}</a>
      <button class="relevant-link-remove-btn" type="button" onclick="deleteRelevantLink(${mi}, ${index}, event)" title="Delete relevant link">x</button>
    </div>
  `).join("");
}

function updateFormulaButton(mi) {
  const btn = document.getElementById(`formula-btn-${mi}`);
  if (btn) {
    const count = getFormulaLinks(mi).length;
    const compact = document.body.classList.contains("compact-ui");
    const mod = MODULES[mi] || {};
    const labelBase = mod.kanji || mod.short || "Module";
    btn.textContent = compact
      ? "Library"
      : `${labelBase} Library`;
    btn.title = `${mod.name || labelBase} Library`;
    btn.style.opacity = count ? "1" : "0.65";
  }
  renderFormulaLinks(mi);
}

/* UniTrack Library Clean V10
   Clean unified materials library:
   - Keeps old storage shapes: store.formulas[mi] and customLibraries[id].materials
   - Relevant Links are no longer rendered in the library UI
   - Single click selects folders/materials; double click opens
   - Keyboard Delete removes selected folder/material; F2 renames folders/materials
   - New Folder is contextual and creates subfolders inside the current folder
   - Drag a material onto a folder to move it
*/

function libraryCleanState() {
  if (!window.__unitrackLibraryCleanV10) {
    window.__unitrackLibraryCleanV10 = {
      sourceKey: "all",
      folderBySource: {},
      historyBySource: {},
      historyIndexBySource: {},
      selected: null,
      dragRecordKey: "",
      sortMode: "recent",
      viewMode: "details",
      showAllSources: false,
      sourceMenuKey: ""
    };
  }
  return window.__unitrackLibraryCleanV10;
}

function libraryCleanSourceKey(source) {
  if (!source) return "all";
  if (source.kind === "module") return `module:${source.mi}`;
  if (source.kind === "custom") return `custom:${source.customId}`;
  return "all";
}

function getPinnedLibrarySourceKeys() {
  const store = getStore();
  if (!Array.isArray(store.pinnedLibrarySources)) store.pinnedLibrarySources = [];
  return store.pinnedLibrarySources
    .map((key) => String(key || "").trim())
    .filter((key) => key && key !== "all");
}

function libraryCleanPinnedSourceKeys() {
  const valid = new Set(libraryCleanAllSources().map((source) => source.key));
  const next = getPinnedLibrarySourceKeys().filter((key) => valid.has(key));
  const store = getStore();
  if (next.length !== store.pinnedLibrarySources.length) store.pinnedLibrarySources = next;
  return next;
}

function libraryCleanIsPinnedSource(key) {
  return libraryCleanPinnedSourceKeys().includes(String(key || ""));
}

function togglePinnedLibrarySource(key, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const sourceKey = String(key || "").trim();
  if (!sourceKey || sourceKey === "all") return;
  const store = getStore();
  const current = libraryCleanPinnedSourceKeys();
  store.pinnedLibrarySources = current.includes(sourceKey)
    ? current.filter((item) => item !== sourceKey)
    : [...current, sourceKey];
  libraryCleanState().sourceMenuKey = "";
  save();
  renderModuleLibrary();
}

function libraryCleanToggleAllSources(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const stateV10 = libraryCleanState();
  stateV10.showAllSources = !stateV10.showAllSources;
  renderModuleLibrary();
}

function libraryCleanToggleSourceMenu(key, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const stateV10 = libraryCleanState();
  const sourceKey = String(key || "").trim();
  stateV10.sourceMenuKey = stateV10.sourceMenuKey === sourceKey ? "" : sourceKey;
  renderModuleLibrary();
}

function libraryCleanCloseSourceMenu() {
  const stateV10 = libraryCleanState();
  if (!stateV10.sourceMenuKey) return;
  stateV10.sourceMenuKey = "";
  renderModuleLibrary();
}

function getCustomLibraryColourHex(customId) {
  const library = getCustomLibrary(customId);
  const fallback = "#7f6aa7";
  if (!library || !isColourCustomisableTheme()) return fallback;
  const family = preferences.theme === "dark" ? "dark" : "light";
  return normaliseHexColour(library.colour?.[family] || library.color?.[family] || fallback, fallback);
}

function getCustomLibraryColourSet(customId) {
  return buildModuleColourFromHex(getCustomLibraryColourHex(customId));
}

function setCustomLibraryColour(customId, colourValue, event) {
  if (event) event.stopPropagation();
  if (!isColourCustomisableTheme()) return;
  const library = getCustomLibrary(customId);
  if (!library) return;
  const family = preferences.theme === "dark" ? "dark" : "light";
  library.colour = Object.assign({}, library.colour || library.color || {}, { [family]: normaliseHexColour(colourValue, "#7f6aa7") });
  library.updatedAt = libraryNowIso();
  save();
  renderModuleLibrary();
}

function libraryCleanParseSourceKey(key) {
  const raw = String(key || "all");
  if (raw.startsWith("module:")) {
    const mi = Number(raw.slice(7));
    if (Number.isInteger(mi) && MODULES[mi]) return libraryCleanAllSources().find((src) => src.kind === "module" && src.mi === mi) || { kind: "module", mi, key: raw };
  }
  if (raw.startsWith("custom:")) {
    const customId = raw.slice(7);
    const library = getCustomLibrary(customId);
    if (library) return libraryCleanAllSources().find((src) => src.kind === "custom" && src.customId === customId) || { kind: "custom", customId, key: raw };
  }
  return { kind: "all", key: "all", code: "Library Home", label: "Library Home", name: "All Content", accent: "var(--gold2)" };
}

function libraryCleanAllSources() {
  const sources = [{
    kind: "all",
    key: "all",
    code: "Library Home",
    label: "Library Home",
    name: "All Content",
    accent: "var(--gold2)"
  }];

  MODULES.forEach((mod, mi) => {
    const colour = getModuleColourSet(mi);
    sources.push({
      kind: "module",
      key: `module:${mi}`,
      mi,
      code: mod.kanji || mod.short || `Module ${mi + 1}`,
      label: mod.kanji || mod.short || `Module ${mi + 1}`,
      name: mod.name || mod.short || `Module ${mi + 1}`,
      accent: colour?.stripe || colour?.text || "var(--gold2)"
    });
  });

  Object.entries(getCustomLibraries()).forEach(([customId, library]) => {
    const colour = getCustomLibraryColourSet(customId);
    sources.push({
      kind: "custom",
      key: `custom:${customId}`,
      customId,
      code: library.name || "Custom",
      label: library.name || "Custom Library",
      name: library.name || "Custom Library",
      description: library.description || "",
      accent: colour?.stripe || colour?.text || "#7f6aa7"
    });
  });

  return sources;
}

function libraryCleanSelectedSource() {
  return libraryCleanParseSourceKey(libraryCleanState().sourceKey || "all");
}

function libraryCleanSetSource(key, options = {}) {
  const source = libraryCleanParseSourceKey(key);
  const stateV10 = libraryCleanState();
  stateV10.sourceKey = libraryCleanSourceKey(source);
  stateV10.selected = null;
  if (!stateV10.folderBySource[stateV10.sourceKey]) stateV10.folderBySource[stateV10.sourceKey] = "";
  if (!stateV10.historyBySource[stateV10.sourceKey]) stateV10.historyBySource[stateV10.sourceKey] = [stateV10.folderBySource[stateV10.sourceKey] || ""];
  if (!Number.isInteger(stateV10.historyIndexBySource[stateV10.sourceKey])) stateV10.historyIndexBySource[stateV10.sourceKey] = stateV10.historyBySource[stateV10.sourceKey].length - 1;
  moduleLibraryFilter = source.kind === "all" ? "all" : source.kind === "custom" ? `custom:${source.customId}` : String(source.mi);
  moduleLibraryScopeMi = source.kind === "module" ? source.mi : null;
  moduleLibraryScopeCustomId = source.kind === "custom" ? source.customId : null;
  if (!options.silent) renderModuleLibrary();
}

function libraryCleanCurrentFolder(source = libraryCleanSelectedSource()) {
  if (!source || source.kind === "all") return "";
  const key = libraryCleanSourceKey(source);
  return normaliseLibraryFolderPath(libraryCleanState().folderBySource[key] || "");
}

function libraryCleanSetFolder(folder, source = libraryCleanSelectedSource(), options = {}) {
  if (!source || source.kind === "all") return;
  const key = libraryCleanSourceKey(source);
  const clean = normaliseLibraryFolderPath(folder);
  const stateV10 = libraryCleanState();
  stateV10.folderBySource[key] = clean;
  stateV10.selected = null;
  if (!stateV10.historyBySource[key]) stateV10.historyBySource[key] = [""];
  if (!Number.isInteger(stateV10.historyIndexBySource[key])) stateV10.historyIndexBySource[key] = stateV10.historyBySource[key].length - 1;
  if (!options.replaceHistory) {
    const history = stateV10.historyBySource[key].slice(0, stateV10.historyIndexBySource[key] + 1);
    if (history[history.length - 1] !== clean) history.push(clean);
    stateV10.historyBySource[key] = history;
    stateV10.historyIndexBySource[key] = history.length - 1;
  }
  if (!options.silent) renderModuleLibrary();
}

function libraryCleanStepHistory(direction, event) {
  if (event) event.stopPropagation();
  const source = libraryCleanSelectedSource();
  if (source.kind === "all") return;
  const key = libraryCleanSourceKey(source);
  const stateV10 = libraryCleanState();
  const history = stateV10.historyBySource[key] || [""];
  const nextIndex = Math.max(0, Math.min(history.length - 1, (stateV10.historyIndexBySource[key] || 0) + direction));
  stateV10.historyIndexBySource[key] = nextIndex;
  stateV10.folderBySource[key] = history[nextIndex] || "";
  stateV10.selected = null;
  renderModuleLibrary();
}

function libraryCleanParentFolder(event) {
  if (event) event.stopPropagation();
  const folder = libraryCleanCurrentFolder();
  if (!folder) return;
  libraryCleanSetFolder(getLibraryFolderParent(folder));
}

function libraryCleanNormaliseArrayItems(raw, fallbackName = "Saved material") {
  if (Array.isArray(raw)) {
    return raw
      .map((item) => normalizeLibraryItem(item, fallbackName))
      .filter((item) => item.url);
  }
  if (typeof raw === "string" && raw.trim()) return [normalizeLibraryItem(raw, fallbackName)];
  return [];
}

const LIBRARY_CLEAN_ITEM_TYPES = ["formula", "relevant"];

function libraryCleanItemTypeLabel(type) {
  return type === "relevant" ? "Link" : "Material";
}

function libraryCleanCollectionKey(type) {
  return type === "relevant" ? "relevantLinks" : "materials";
}

function libraryCleanTargetForSource(source) {
  if (!source || source.kind === "all") return null;
  return source.kind === "custom" ? { customId: source.customId } : { mi: source.mi };
}

function libraryCleanSourceItems(source, type = "formula") {
  const store = getStore();
  if (!source || source.kind === "all") return [];
  if (source.kind === "module") {
    const mod = MODULES[source.mi] || {};
    if (type === "relevant") {
      if (!store.relevantLinks) store.relevantLinks = {};
      const items = libraryCleanNormaliseArrayItems(store.relevantLinks[source.mi], `${mod.short || mod.kanji || "Module"} Link`);
      store.relevantLinks[source.mi] = items;
      return items;
    }
    if (!store.formulas) store.formulas = {};
    const items = libraryCleanNormaliseArrayItems(store.formulas[source.mi], `${mod.short || mod.kanji || "Module"} Material`);
    store.formulas[source.mi] = items;
    return items;
  }
  if (source.kind === "custom") {
    const library = getCustomLibrary(source.customId);
    if (!library) return [];
    const key = libraryCleanCollectionKey(type);
    library[key] = libraryCleanNormaliseArrayItems(library[key], type === "relevant" ? "Saved link" : "Saved material");
    return library[key];
  }
  return [];
}

function libraryCleanRecords(options = {}) {
  const sourceFilter = options.source || null;
  const types = options.type && LIBRARY_CLEAN_ITEM_TYPES.includes(options.type) ? [options.type] : LIBRARY_CLEAN_ITEM_TYPES;
  const sources = sourceFilter && sourceFilter.kind !== "all"
    ? [sourceFilter]
    : libraryCleanAllSources().filter((source) => source.kind !== "all");
  const records = [];
  sources.forEach((source) => {
    types.forEach((type) => {
      libraryCleanSourceItems(source, type).forEach((item, index) => {
        records.push({
          kind: "item",
          type,
          typeLabel: libraryCleanItemTypeLabel(type),
          key: `${source.key}:${type}:item:${index}`,
          sourceKey: source.key,
          source,
          index,
          item,
          name: item.name || (type === "relevant" ? "Saved link" : "Saved material"),
          url: item.url || "",
          tag: item.tag || "",
          notes: item.notes || "",
          folder: normaliseLibraryFolderPath(item.folder || ""),
          createdAt: normaliseLibraryTimestamp(item.createdAt || ""),
          updatedAt: normaliseLibraryTimestamp(item.updatedAt || item.createdAt || ""),
          accent: source.accent
        });
      });
    });
  });
  return records;
}

function libraryCleanRegistry(source, type = null) {
  if (!source || source.kind === "all") return [];
  const target = libraryCleanTargetForSource(source);
  if (type && LIBRARY_CLEAN_ITEM_TYPES.includes(type)) return getLibraryFolderRegistry(type, target);
  return libraryCleanEnsureFolderAncestors([
    ...getLibraryFolderRegistry("formula", target),
    ...getLibraryFolderRegistry("relevant", target)
  ]);
}

function libraryCleanEnsureFolderAncestors(paths) {
  const set = new Set();
  paths.forEach((path) => {
    const clean = normaliseLibraryFolderPath(path);
    if (!clean) return;
    const parts = clean.split("/");
    for (let i = 1; i <= parts.length; i += 1) set.add(parts.slice(0, i).join("/"));
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function libraryCleanAllFolderPathsForSource(source) {
  if (!source || source.kind === "all") return [];
  const registry = libraryCleanRegistry(source).map(normaliseLibraryFolderPath).filter(Boolean);
  const fromItems = libraryCleanRecords({ source }).map((record) => normaliseLibraryFolderPath(record.folder)).filter(Boolean);
  const all = libraryCleanEnsureFolderAncestors([...registry, ...fromItems]);
  const target = libraryCleanTargetForSource(source);
  LIBRARY_CLEAN_ITEM_TYPES.forEach((type) => {
    const registryForType = getLibraryFolderRegistry(type, target);
    all.forEach((folder) => {
      if (folder && !registryForType.includes(folder)) registryForType.push(folder);
    });
    registryForType.sort((a, b) => a.localeCompare(b));
  });
  return all;
}

function libraryCleanAllFolderRecords() {
  const folders = [];
  libraryCleanAllSources().filter((source) => source.kind !== "all").forEach((source) => {
    libraryCleanAllFolderPathsForSource(source).forEach((folder) => {
      folders.push({
        kind: "folder",
        key: `${source.key}:folder:${folder}`,
        sourceKey: source.key,
        source,
        folder,
        name: getLibraryFolderName(folder),
        accent: source.accent
      });
    });
  });
  return folders;
}

function libraryCleanImmediateFolders(source, parentFolder = "") {
  const parent = normaliseLibraryFolderPath(parentFolder);
  const out = new Map();
  libraryCleanAllFolderPathsForSource(source).forEach((folder) => {
    const clean = normaliseLibraryFolderPath(folder);
    if (!clean) return;
    let childPath = "";
    if (!parent) {
      childPath = clean.split("/")[0];
    } else if (clean.startsWith(parent + "/")) {
      const rest = clean.slice(parent.length + 1);
      const next = rest.split("/")[0];
      if (next) childPath = `${parent}/${next}`;
    } else {
      return;
    }
    if (childPath && !out.has(childPath)) {
      out.set(childPath, {
        kind: "folder",
        key: `${source.key}:folder:${childPath}`,
        sourceKey: source.key,
        source,
        folder: childPath,
        name: getLibraryFolderName(childPath),
        accent: source.accent
      });
    }
  });
  return Array.from(out.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function libraryCleanItemsInFolder(source, folder) {
  const current = normaliseLibraryFolderPath(folder);
  return libraryCleanRecords({ source }).filter((record) => normaliseLibraryFolderPath(record.folder) === current);
}

function libraryCleanSearchTokens(query) {
  return String(query || "").toLowerCase().split(/\s+/).map((token) => token.trim()).filter(Boolean);
}

function libraryCleanSearchText(parts) {
  return parts.filter(Boolean).join(" ").toLowerCase();
}

function libraryCleanMatchesSearch(parts, query) {
  const tokens = libraryCleanSearchTokens(query);
  if (!tokens.length) return true;
  const haystack = libraryCleanSearchText(parts);
  return tokens.every((token) => haystack.includes(token));
}

function libraryCleanItemActivityValue(record) {
  return Math.max(libraryTimestampMs(record.updatedAt), libraryTimestampMs(record.createdAt));
}

function libraryCleanFolderActivityValue(folderRecord) {
  const folderPath = normaliseLibraryFolderPath(folderRecord.folder);
  return libraryCleanRecords({ source: folderRecord.source }).reduce((latest, record) => {
    const recordFolder = normaliseLibraryFolderPath(record.folder);
    if (recordFolder !== folderPath && !recordFolder.startsWith(folderPath + "/")) return latest;
    return Math.max(latest, libraryCleanItemActivityValue(record));
  }, 0);
}

function libraryCleanSortMode() {
  return libraryCleanState().sortMode || "recent";
}

function libraryCleanSetSortMode(value) {
  const allowed = new Set(["recent", "oldest", "updated", "az", "za", "library", "type", "folder"]);
  libraryCleanState().sortMode = allowed.has(value) ? value : "recent";
  renderModuleLibrary();
}

function libraryCleanViewMode() {
  return libraryCleanState().viewMode || "details";
}

function libraryCleanSetViewMode(value) {
  libraryCleanState().viewMode = value === "cards" ? "cards" : "details";
  renderModuleLibrary();
}

function libraryCleanSortButton(label, key, activeModes) {
  const active = activeModes.includes(libraryCleanSortMode());
  return `<button class="library-v10-column-btn ${active ? "active" : ""}" type="button" onclick="libraryCleanToggleSort(${jsString(key)})">${escapeHtml(label)}</button>`;
}

function libraryCleanToggleSort(key) {
  const current = libraryCleanSortMode();
  if (key === "name") {
    libraryCleanSetSortMode(current === "az" ? "za" : "az");
    return;
  }
  if (key === "date") {
    libraryCleanSetSortMode(current === "recent" ? "oldest" : "recent");
    return;
  }
  if (key === "library") {
    libraryCleanSetSortMode("library");
    return;
  }
  if (key === "type") {
    libraryCleanSetSortMode("type");
    return;
  }
  if (key === "folder") {
    libraryCleanSetSortMode("folder");
  }
}

function libraryCleanSortItems(items) {
  const mode = libraryCleanSortMode();
  const copy = items.slice();
  copy.sort((a, b) => {
    if (mode === "az") return a.name.localeCompare(b.name) || a.source.code.localeCompare(b.source.code);
    if (mode === "za") return b.name.localeCompare(a.name) || a.source.code.localeCompare(b.source.code);
    if (mode === "library") return (a.source.code || "").localeCompare(b.source.code || "") || a.name.localeCompare(b.name);
    if (mode === "type") return (a.typeLabel || "").localeCompare(b.typeLabel || "") || a.name.localeCompare(b.name);
    if (mode === "folder") return (a.folder || "").localeCompare(b.folder || "") || a.name.localeCompare(b.name);
    if (mode === "updated") {
      return libraryCleanItemActivityValue(b) - libraryCleanItemActivityValue(a)
        || libraryTimestampMs(b.createdAt) - libraryTimestampMs(a.createdAt)
        || a.name.localeCompare(b.name);
    }
    if (mode === "oldest") {
      return libraryTimestampMs(a.createdAt) - libraryTimestampMs(b.createdAt)
        || a.name.localeCompare(b.name);
    }
    return libraryTimestampMs(b.createdAt) - libraryTimestampMs(a.createdAt)
      || libraryCleanItemActivityValue(b) - libraryCleanItemActivityValue(a)
      || a.name.localeCompare(b.name);
  });
  return copy;
}

function libraryCleanSortFolders(folders) {
  const mode = libraryCleanSortMode();
  const copy = folders.slice();
  copy.sort((a, b) => {
    if (mode === "az") return a.name.localeCompare(b.name);
    if (mode === "za") return b.name.localeCompare(a.name);
    if (mode === "library") return (a.source.code || "").localeCompare(b.source.code || "") || a.name.localeCompare(b.name);
    if (mode === "type") return -1;
    if (mode === "folder") return (a.folder || "").localeCompare(b.folder || "") || a.name.localeCompare(b.name);
    if (mode === "oldest") return libraryCleanFolderActivityValue(a) - libraryCleanFolderActivityValue(b) || a.name.localeCompare(b.name);
    return libraryCleanFolderActivityValue(b) - libraryCleanFolderActivityValue(a) || a.name.localeCompare(b.name);
  });
  return copy;
}

function libraryCleanFormatActivityLabel(record) {
  const updated = libraryTimestampMs(record.updatedAt);
  const created = libraryTimestampMs(record.createdAt);
  const value = updated || created;
  if (!value) return "No date";
  const formatter = new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short", year: "numeric" });
  if (updated && created && updated > created + 60000) return `Updated ${formatter.format(new Date(updated))}`;
  return `Added ${formatter.format(new Date(created || updated))}`;
}

function libraryCleanSortMenuHtml() {
  const value = libraryCleanSortMode();
  return `<label class="library-v10-sort-label" for="module-library-sort">
    <span>Sort</span>
    <select class="nav-select library-v10-sort-select" id="module-library-sort" onchange="libraryCleanSetSortMode(this.value)">
      <option value="recent" ${value === "recent" ? "selected" : ""}>Recently added</option>
      <option value="oldest" ${value === "oldest" ? "selected" : ""}>Oldest first</option>
      <option value="updated" ${value === "updated" ? "selected" : ""}>Recently updated</option>
      <option value="az" ${value === "az" ? "selected" : ""}>Name A-Z</option>
      <option value="za" ${value === "za" ? "selected" : ""}>Name Z-A</option>
      <option value="library" ${value === "library" ? "selected" : ""}>Library</option>
      <option value="type" ${value === "type" ? "selected" : ""}>Type</option>
    </select>
  </label>`;
}

function libraryCleanCustomColourControlHtml(source) {
  if (source.kind !== "custom" || !isColourCustomisableTheme()) return "";
  const colour = getCustomLibraryColourHex(source.customId);
  return `<label class="library-v10-colour-control" title="Choose library colour">
    <span class="library-v10-colour-label">Colour</span>
    <input class="module-colour-input library-v10-colour-input" type="color" value="${escapeHtml(colour)}" onchange="setCustomLibraryColour(${jsString(source.customId)}, this.value, event)">
    <span class="module-colour-preview library-v10-colour-preview" style="background:${escapeHtml(getCustomLibraryColourSet(source.customId).fill)}"></span>
  </label>`;
}

function libraryCleanToolbarHtml() {
  const viewMode = libraryCleanViewMode();
  const source = libraryCleanSelectedSource();
  return `<div class="library-v10-toolbar-shell">
    <div class="library-v10-search-wrap">
      <input class="input" id="module-library-search" placeholder="Search libraries, folders, materials, notes, tags, or URLs" value="${escapeHtml(moduleLibrarySearch || "")}" oninput="updateModuleLibrarySearch(this.value)">
      ${moduleLibrarySearch ? `<button class="mini-btn library-v10-search-clear" type="button" aria-label="Clear search" title="Clear search" onclick="clearModuleLibrarySearch()">&times;</button>` : ""}
    </div>
    <div class="library-v10-view-toggle" role="group" aria-label="Library view">
      <button class="mini-btn library-v10-view-btn ${viewMode === "details" ? "active" : ""}" type="button" onclick="libraryCleanSetViewMode('details')">List</button>
      <button class="mini-btn library-v10-view-btn ${viewMode === "cards" ? "active" : ""}" type="button" onclick="libraryCleanSetViewMode('cards')">Cards</button>
    </div>
    ${libraryCleanCustomColourControlHtml(source)}
    ${libraryCleanSortMenuHtml()}
  </div>`;
}

function libraryCleanSearchResults() {
  const query = String(moduleLibrarySearch || "").trim();
  if (!query) return { folders: [], items: [] };
  const selected = libraryCleanSelectedSource();
  const folderPool = selected.kind === "all"
    ? libraryCleanAllFolderRecords()
    : libraryCleanAllFolderPathsForSource(selected).map((folder) => ({
        kind: "folder",
        key: `${selected.key}:folder:${folder}`,
        sourceKey: selected.key,
        source: selected,
        folder,
        name: getLibraryFolderName(folder),
        accent: selected.accent
      }));
  const itemPool = selected.kind === "all" ? libraryCleanRecords() : libraryCleanRecords({ source: selected });
  const folders = libraryCleanSortFolders(folderPool.filter((folder) => libraryCleanMatchesSearch([
    folder.name,
    folder.folder,
    folder.source.code,
    folder.source.label,
    folder.source.name,
    folder.source.description
  ], query)));
  const items = libraryCleanSortItems(itemPool.filter((record) => libraryCleanMatchesSearch([
    record.name,
    record.url,
    record.tag,
    record.notes,
    record.folder,
    record.source.code,
    record.source.label,
    record.source.name,
    record.source.description,
    libraryCleanFormatActivityLabel(record)
  ], query)));
  return { folders, items };
}

function libraryCleanShortPathLegacy(path) {
  const clean = normaliseLibraryFolderPath(path);
  if (!clean) return "Root";
  const parts = clean.split("/");
  if (parts.length <= 3) return parts.join(" / ");
  return `… / ${parts.slice(-3).join(" / ")}`;
}

function libraryCleanCountsForSource(source) {
  if (source.kind === "all") {
    const items = libraryCleanRecords().length;
    const folders = libraryCleanAllFolderRecords().length;
    return { items, folders };
  }
  return {
    items: libraryCleanRecords({ source }).length,
    folders: libraryCleanAllFolderPathsForSource(source).length
  };
}

function libraryCleanSelect(kind, key, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  libraryCleanState().selected = { kind, key };
  libraryCleanApplySelection();
}

function libraryCleanApplySelection() {
  document.querySelectorAll(".library-v10-selected").forEach((node) => node.classList.remove("library-v10-selected"));
  const selected = libraryCleanState().selected;
  if (!selected?.key) return;
  const key = selected.key;
  const safeKey = (window.CSS && CSS.escape) ? CSS.escape(key) : String(key).replace(/"/g, '\\"');
  const node = document.querySelector(`[data-library-key="${safeKey}"]`);
  if (node) node.classList.add("library-v10-selected");
}

function libraryCleanSelectionFromNode(node) {
  if (!node) return null;
  if (node.dataset.folderKey) return { kind: "folder", key: node.dataset.folderKey };
  if (node.dataset.recordKey) return { kind: "item", key: node.dataset.recordKey };
  return null;
}

function libraryCleanSourceRailHtmlLegacy() {
  const selected = libraryCleanSelectedSource();
  return `<div class="library-v10-source-rail" id="library-v10-source-rail">
    ${libraryCleanAllSources().map((source) => {
      const counts = libraryCleanCountsForSource(source);
      const active = source.key === libraryCleanSourceKey(selected);
      const deletable = source.kind === "custom";
      return `<button class="library-v10-source-card ${active ? "active" : ""}" type="button" data-source-key="${escapeHtml(source.key)}" style="--source-accent:${escapeHtml(source.accent)}">
        <span class="library-v10-source-accent"></span>
        <span class="library-v10-source-main">
          <span class="library-v10-source-code">${escapeHtml(source.code || source.label)}</span>
          <span class="library-v10-source-name">${escapeHtml(source.name || source.label)}</span>
          <span class="library-v10-source-meta">${counts.folders} folder${counts.folders === 1 ? "" : "s"} · ${counts.items} material${counts.items === 1 ? "" : "s"}${deletable ? " · Custom" : ""}</span>
        </span>
      </button>`;
    }).join("")}
  </div>`;
}

function libraryCleanBreadcrumbHtml() {
  const source = libraryCleanSelectedSource();
  const folder = normaliseLibraryFolderPath(libraryCleanCurrentFolder(source));
  if (source.kind === "all") return `<span class="library-v10-crumb active">Library Home</span>`;

  const parts = folder ? folder.split("/").filter(Boolean) : [];
  const crumbs = [
    `<button class="library-v10-crumb ${!folder ? "active" : ""}" type="button" data-library-clean-folder=""
      ondragover="libraryCleanAllowBreadcrumbDrop('', event)"
      ondragleave="libraryCleanClearBreadcrumbDrop(event)"
      ondrop="libraryCleanDropOnBreadcrumb('', event)">Root</button>`
  ];

  parts.forEach((part, index) => {
    const path = parts.slice(0, index + 1).join("/");
    crumbs.push(`
      <span class="library-v10-sep">/</span>
      <button
        class="library-v10-crumb ${path === folder ? "active" : ""}"
        type="button"
        title="${escapeHtml(path)}"
        data-library-clean-folder="${escapeHtml(path)}"
        ondragover="libraryCleanAllowBreadcrumbDrop(${jsString(path)}, event)"
        ondragleave="libraryCleanClearBreadcrumbDrop(event)"
        ondrop="libraryCleanDropOnBreadcrumb(${jsString(path)}, event)"
      >${escapeHtml(part)}</button>
    `);
  });

  return crumbs.join("");
}

function libraryCleanFolderCardHtmlLegacy(folderRecord) {
  const selected = libraryCleanState().selected?.key === folderRecord.key;
  return `<div class="module-library-folder-tile library-v10-folder ${selected ? "library-v10-selected" : ""}"
    tabindex="0"
    data-library-key="${escapeHtml(folderRecord.key)}"
    data-folder-key="${escapeHtml(folderRecord.key)}"
    style="--source-accent:${escapeHtml(folderRecord.accent)}"
    onmousedown="if(event.detail > 1) event.preventDefault()"
    onclick="libraryCleanSelect('folder', ${jsString(folderRecord.key)}, event)"
    ondblclick="libraryCleanOpenFolderKey(${jsString(folderRecord.key)}, event)"
    ondragover="libraryCleanAllowFolderDrop(event)"
    ondrop="libraryCleanDropOnFolder(${jsString(folderRecord.key)}, event)">
    <span class="module-library-folder-icon" aria-hidden="true"></span>
    <span class="module-library-folder-tile-main">
      <span class="module-library-folder-tile-name">${escapeHtml(folderRecord.name)}</span>
      <span class="module-library-folder-tile-meta">${escapeHtml(folderRecord.source.code || "Library")} · ${escapeHtml(libraryCleanShortPath(folderRecord.folder))}</span>
    </span>
  </div>`;
}

function libraryCleanShortPath(path) {
  const clean = normaliseLibraryFolderPath(path);
  if (!clean) return "Root";
  const parts = clean.split("/");
  if (parts.length <= 3) return parts.join(" / ");
  return `... / ${parts.slice(-3).join(" / ")}`;
}

function libraryCleanSourceRailHtml() {
  const selected = libraryCleanSelectedSource();
  const sourceKey = libraryCleanSourceKey(selected);
  const allSources = libraryCleanAllSources();
  const pinnedKeys = libraryCleanPinnedSourceKeys();
  const pinnedSet = new Set(pinnedKeys);
  const quickAccess = [];
  const allLibrary = allSources.find((source) => source.key === "all");
  if (allLibrary) quickAccess.push(allLibrary);
  allSources.forEach((source) => {
    if (source.key === "all") return;
    if (pinnedSet.has(source.key)) {
      if (!quickAccess.some((item) => item.key === source.key)) quickAccess.push(source);
    }
  });
  const remaining = allSources.filter((source) => source.key !== "all" && !quickAccess.some((item) => item.key === source.key));
  const showAll = libraryCleanState().showAllSources;

  function sourceCardHtml(source, options = {}) {
    const counts = libraryCleanCountsForSource(source);
    const active = source.key === sourceKey;
    const deletable = source.kind === "custom";
    const pinned = source.key !== "all" && pinnedSet.has(source.key);
    const pinLabel = pinned ? "Remove from Quick Access" : "Pin to Quick Access";
    const menuOpen = libraryCleanState().sourceMenuKey === source.key;
    return `<div class="library-v10-source-shell ${options.compact ? "library-v10-source-shell-compact" : ""}" style="--source-accent:${escapeHtml(source.accent)}">
      <div class="library-v10-source-card ${active ? "active" : ""} ${options.compact ? "library-v10-source-card-compact" : ""}" tabindex="0" role="button" data-source-key="${escapeHtml(source.key)}">
        <span class="library-v10-source-accent"></span>
        <span class="library-v10-source-main">
          <span class="library-v10-source-code">${escapeHtml(source.code || source.label)}</span>
          <span class="library-v10-source-name">${escapeHtml(source.name || source.label)}</span>
          <span class="library-v10-source-meta">${counts.folders} folder${counts.folders === 1 ? "" : "s"} | ${counts.items} resource${counts.items === 1 ? "" : "s"}${deletable ? " | Custom" : ""}${pinned ? " | Quick Access" : ""}</span>
        </span>
        ${source.key !== "all" ? `
          <button class="mini-btn library-v10-source-pin ${menuOpen ? "active" : ""}" type="button" aria-label="Library options" title="Library options" onclick="libraryCleanToggleSourceMenu(${jsString(source.key)}, event)"><span aria-hidden="true">&#8942;</span></button>
          <div class="library-v10-source-menu ${menuOpen ? "open" : ""}" role="menu">
            <button class="library-v10-source-menu-item" type="button" role="menuitem" onclick="togglePinnedLibrarySource(${jsString(source.key)}, event)">${escapeHtml(pinLabel)}</button>
          </div>` : ""}
      </div>
    </div>`;
  }

  return `<div class="library-v10-source-browser">
    <div class="library-v10-source-browser-head">
      <div class="library-v10-source-browser-title">Quick Access</div>
      ${remaining.length ? `<button class="mini-btn library-v10-source-toggle" type="button" onclick="libraryCleanToggleAllSources(event)">${showAll ? "Hide Libraries" : `Browse Libraries (${remaining.length})`}</button>` : ""}
    </div>
    <div class="library-v10-source-rail library-v10-source-rail-quick">
      ${quickAccess.map((source) => sourceCardHtml(source, { compact: true })).join("")}
    </div>
    ${remaining.length ? `<div class="library-v10-source-browser-panel ${showAll ? "open" : ""}">
      <div class="library-v10-source-browser-title">More Libraries</div>
      <div class="library-v10-source-rail library-v10-source-rail-all">
        ${remaining.map((source) => sourceCardHtml(source)).join("")}
      </div>
    </div>` : ""}
  </div>`;
}

function libraryCleanFolderCardHtml(folderRecord) {
  const selected = libraryCleanState().selected?.key === folderRecord.key;
  const count = libraryCleanRecords({ source: folderRecord.source }).filter((record) => (
    record.folder === folderRecord.folder || record.folder.startsWith(folderRecord.folder + "/")
  )).length;
  const activity = libraryCleanFolderActivityValue(folderRecord);
  return `<div class="module-library-folder-tile library-v10-folder ${selected ? "library-v10-selected" : ""}"
    tabindex="0"
    data-library-key="${escapeHtml(folderRecord.key)}"
    data-folder-key="${escapeHtml(folderRecord.key)}"
    style="--source-accent:${escapeHtml(folderRecord.accent)}"
    onmousedown="if(event.detail > 1) event.preventDefault()"
    onclick="libraryCleanSelect('folder', ${jsString(folderRecord.key)}, event)"
    ondblclick="libraryCleanOpenFolderKey(${jsString(folderRecord.key)}, event)"
    ondragover="libraryCleanAllowFolderDrop(event)"
    ondrop="libraryCleanDropOnFolder(${jsString(folderRecord.key)}, event)">
    <span class="module-library-folder-icon" aria-hidden="true"></span>
    <span class="module-library-folder-tile-main">
      <span class="module-library-folder-tile-name">${escapeHtml(folderRecord.name)}</span>
      <span class="module-library-folder-tile-meta">${escapeHtml(folderRecord.source.code || "Library")} | ${escapeHtml(libraryCleanShortPath(folderRecord.folder))} | ${count} resource${count === 1 ? "" : "s"}${activity ? ` | ${escapeHtml(new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short" }).format(new Date(activity)))}` : ""}</span>
    </span>
  </div>`;
}

function libraryCleanItemActionsHtml(record) {
  return `<span class="library-v10-item-actions">
    <button class="mini-btn library-v10-item-action" type="button" title="Edit resource" onclick="libraryCleanEditItemKey(${jsString(record.key)}, event)">Edit</button>
    <button class="mini-btn library-v10-item-action" type="button" title="Open resource" onclick="libraryCleanOpenItemKey(${jsString(record.key)}, event)">Open</button>
  </span>`;
}

function libraryCleanItemCardHtml(record) {
  const selected = libraryCleanState().selected?.key === record.key;
  return `<div class="module-library-card library-v10-item ${selected ? "library-v10-selected" : ""}"
    tabindex="0"
    draggable="true"
    data-library-key="${escapeHtml(record.key)}"
    data-record-key="${escapeHtml(record.key)}"
    style="--source-accent:${escapeHtml(record.accent)}"
    onmousedown="if(event.detail > 1) event.preventDefault()"
    onclick="libraryCleanSelect('item', ${jsString(record.key)}, event)"
    ondblclick="libraryCleanOpenItemKey(${jsString(record.key)}, event)"
    ondragstart="libraryCleanStartItemDrag(${jsString(record.key)}, event)"
    ondragend="libraryCleanEndItemDrag(event)">
    <span class="module-library-module-accent"></span>
    <span class="module-library-card-head">
      <span>
        <span class="module-library-card-title">${escapeHtml(record.name)}</span>
        <span class="module-library-card-meta">
          <span class="module-library-pill">${escapeHtml(record.source.code || "Library")}</span>
          <span class="module-library-pill">${escapeHtml(record.typeLabel)}</span>
          <span class="module-library-pill">${escapeHtml(libraryCleanFormatActivityLabel(record))}</span>
          ${record.folder ? `<span class="module-library-pill">${escapeHtml(libraryCleanShortPath(record.folder))}</span>` : ""}
          ${record.tag ? `<span class="module-library-pill">${escapeHtml(record.tag)}</span>` : ""}
        </span>
      </span>
      ${libraryCleanItemActionsHtml(record)}
    </span>
    ${record.notes ? `<span class="module-library-card-notes">${escapeHtml(record.notes)}</span>` : ""}
  </div>`;
}

function libraryCleanDateText(value) {
  const time = libraryTimestampMs(value);
  if (!time) return "-";
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(time));
}

function libraryCleanFolderRowHtml(folderRecord) {
  const selected = libraryCleanState().selected?.key === folderRecord.key;
  const activity = libraryCleanFolderActivityValue(folderRecord);
  const count = libraryCleanRecords({ source: folderRecord.source }).filter((record) => (
    record.folder === folderRecord.folder || record.folder.startsWith(folderRecord.folder + "/")
  )).length;
  return `<div class="library-v10-row library-v10-row-folder ${selected ? "library-v10-selected" : ""}"
    tabindex="0"
    data-library-key="${escapeHtml(folderRecord.key)}"
    data-folder-key="${escapeHtml(folderRecord.key)}"
    style="--source-accent:${escapeHtml(folderRecord.accent)}"
    onclick="libraryCleanSelect('folder', ${jsString(folderRecord.key)}, event)"
    ondblclick="libraryCleanOpenFolderKey(${jsString(folderRecord.key)}, event)"
    ondragover="libraryCleanAllowFolderDrop(event)"
    ondrop="libraryCleanDropOnFolder(${jsString(folderRecord.key)}, event)">
    <span class="library-v10-col library-v10-col-name"><span class="module-library-folder-icon" aria-hidden="true"></span><span class="library-v10-row-name">${escapeHtml(folderRecord.name)}</span></span>
    <span class="library-v10-col">${escapeHtml(folderRecord.source.code || "Library")}</span>
    <span class="library-v10-col">Folder</span>
    <span class="library-v10-col">${escapeHtml(libraryCleanShortPath(folderRecord.folder))}</span>
    <span class="library-v10-col library-v10-col-date">${escapeHtml(libraryCleanDateText(activity))}</span>
    <span class="library-v10-col library-v10-col-count">${count} item${count === 1 ? "" : "s"}</span>
    <span class="library-v10-col library-v10-col-actions"></span>
  </div>`;
}

function libraryCleanItemRowHtml(record) {
  const selected = libraryCleanState().selected?.key === record.key;
  return `<div class="library-v10-row library-v10-row-item ${selected ? "library-v10-selected" : ""}"
    tabindex="0"
    draggable="true"
    data-library-key="${escapeHtml(record.key)}"
    data-record-key="${escapeHtml(record.key)}"
    style="--source-accent:${escapeHtml(record.accent)}"
    onclick="libraryCleanSelect('item', ${jsString(record.key)}, event)"
    ondblclick="libraryCleanOpenItemKey(${jsString(record.key)}, event)"
    ondragstart="libraryCleanStartItemDrag(${jsString(record.key)}, event)"
    ondragend="libraryCleanEndItemDrag(event)">
    <span class="library-v10-col library-v10-col-name"><span class="library-v10-row-file-accent" aria-hidden="true"></span><span class="library-v10-row-name">${escapeHtml(record.name)}</span></span>
    <span class="library-v10-col">${escapeHtml(record.source.code || "Library")}</span>
    <span class="library-v10-col">${escapeHtml(record.typeLabel)}</span>
    <span class="library-v10-col">${escapeHtml(record.folder ? libraryCleanShortPath(record.folder) : "Root")}</span>
    <span class="library-v10-col library-v10-col-date">${escapeHtml(libraryCleanDateText(record.createdAt || record.updatedAt))}</span>
    <span class="library-v10-col library-v10-col-count">${escapeHtml(record.tag || "")}</span>
    ${libraryCleanItemActionsHtml(record)}
  </div>`;
}

function libraryCleanDetailsHeaderHtml() {
  return `<div class="library-v10-details-header">
    <span class="library-v10-col library-v10-col-name">${libraryCleanSortButton("Name", "name", ["az", "za"])}</span>
    <span class="library-v10-col">${libraryCleanSortButton("Library", "library", ["library"])}</span>
    <span class="library-v10-col">${libraryCleanSortButton("Type", "type", ["type"])}</span>
    <span class="library-v10-col">${libraryCleanSortButton("Location", "folder", ["folder"])}</span>
    <span class="library-v10-col library-v10-col-date">${libraryCleanSortButton("Date Added", "date", ["recent", "oldest"])}</span>
    <span class="library-v10-col library-v10-col-count">Tag</span>
    <span class="library-v10-col library-v10-col-actions">Actions</span>
  </div>`;
}

function libraryCleanDetailsHtml(folders, items) {
  if (!folders.length && !items.length) return `<div class="module-library-empty">This folder is empty.</div>`;
  return `<div class="library-v10-details">
    ${libraryCleanDetailsHeaderHtml()}
    <div class="library-v10-details-body">
      ${folders.map(libraryCleanFolderRowHtml).join("")}
      ${items.map(libraryCleanItemRowHtml).join("")}
    </div>
  </div>`;
}

function libraryCleanFindFolder(folderKey) {
  const parts = String(folderKey || "").split(":folder:");
  if (parts.length !== 2) return null;
  const source = libraryCleanParseSourceKey(parts[0]);
  const folder = normaliseLibraryFolderPath(parts[1]);
  if (source.kind === "all" || !folder) return null;
  return { source, folder, key: `${source.key}:folder:${folder}` };
}

function libraryCleanFindItem(recordKey) {
  const match = String(recordKey || "").match(/^(.*):(formula|relevant):item:(\d+)$/);
  if (!match) return null;
  const source = libraryCleanParseSourceKey(match[1]);
  const type = match[2];
  const index = Number(match[3]);
  if (source.kind === "all" || !Number.isInteger(index)) return null;
  const items = libraryCleanSourceItems(source, type);
  if (!items[index]) return null;
  return {
    source,
    type,
    index,
    item: items[index],
    key: `${source.key}:${type}:item:${index}`
  };
}

function libraryCleanOpenFolderKey(folderKey, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const found = libraryCleanFindFolder(folderKey);
  if (!found) return;
  libraryCleanSetSource(found.source.key, { silent: true });
  libraryCleanSetFolder(found.folder, found.source);
}

function libraryCleanOpenItemKey(recordKey, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const found = libraryCleanFindItem(recordKey);
  if (found?.item?.url) window.open(found.item.url, "_blank", "noopener");
}

async function libraryCleanRenameFolderKey(folderKey, event) {
  if (event) event.stopPropagation();
  const found = libraryCleanFindFolder(folderKey);
  if (!found) return;
  const oldPath = found.folder;
  const parent = getLibraryFolderParent(oldPath);
  const oldName = getLibraryFolderName(oldPath);
  const result = await appPrompt({
    label: "Folder",
    title: "Rename Folder",
    message: "Items and subfolders inside this folder will stay inside it.",
    inputLabel: "Folder Name",
    defaultValue: oldName,
    placeholder: oldName,
    confirmText: "Rename Folder"
  });
  const newName = normaliseLibraryFolderPath(result?.value || "");
  if (!newName) return;
  const newPath = joinLibraryFolderPath(parent, newName);
  LIBRARY_CLEAN_ITEM_TYPES.forEach((type) => {
    libraryCleanSourceItems(found.source, type).forEach((item) => {
      const folder = normaliseLibraryFolderPath(item.folder);
      if (folder === oldPath) item.folder = newPath;
      else if (folder.startsWith(oldPath + "/")) item.folder = newPath + folder.slice(oldPath.length);
    });
  });
  const target = libraryCleanTargetForSource(found.source);
  LIBRARY_CLEAN_ITEM_TYPES.forEach((type) => renameLibraryFolderInRegistry(type, oldPath, newPath, target));
  const sourceKey = libraryCleanSourceKey(found.source);
  const stateV10 = libraryCleanState();
  const active = normaliseLibraryFolderPath(stateV10.folderBySource[sourceKey] || "");
  if (active === oldPath || active.startsWith(oldPath + "/")) stateV10.folderBySource[sourceKey] = newPath + active.slice(oldPath.length);
  save();
  renderModuleLibrary();
}

async function libraryCleanDeleteFolderKey(folderKey, event) {
  if (event) event.stopPropagation();
  const found = libraryCleanFindFolder(folderKey);
  if (!found) return;
  const oldPath = found.folder;
  const affected = libraryCleanRecords({ source: found.source }).filter((item) => {
    const folder = normaliseLibraryFolderPath(item.folder);
    return folder === oldPath || folder.startsWith(oldPath + "/");
  }).length;
  const confirmed = await appConfirm({
    label: "Folder",
    title: `Delete ${getLibraryFolderName(oldPath)}?`,
    message: affected ? `${affected} resource${affected === 1 ? "" : "s"} will move to the parent folder. Nothing is deleted.` : "This folder and its subfolders will be removed.",
    confirmText: "Delete Folder",
    danger: true
  });
  if (!confirmed) return;
  const parent = getLibraryFolderParent(oldPath);
  LIBRARY_CLEAN_ITEM_TYPES.forEach((type) => {
    libraryCleanSourceItems(found.source, type).forEach((item) => {
      const folder = normaliseLibraryFolderPath(item.folder);
      if (folder === oldPath) item.folder = parent;
      else if (folder.startsWith(oldPath + "/")) {
        const rest = folder.slice(oldPath.length + 1);
        item.folder = joinLibraryFolderPath(parent, rest);
      }
    });
  });
  const target = libraryCleanTargetForSource(found.source);
  LIBRARY_CLEAN_ITEM_TYPES.forEach((type) => {
    removeLibraryFolderFromRegistry(type, (folder) => {
      const clean = normaliseLibraryFolderPath(folder);
      return clean === oldPath || clean.startsWith(oldPath + "/");
    }, target);
  });
  const sourceKey = libraryCleanSourceKey(found.source);
  const stateV10 = libraryCleanState();
  const active = normaliseLibraryFolderPath(stateV10.folderBySource[sourceKey] || "");
  if (active === oldPath || active.startsWith(oldPath + "/")) stateV10.folderBySource[sourceKey] = parent;
  stateV10.selected = null;
  save();
  renderModuleLibrary();
}

async function libraryCleanDeleteItemKey(recordKey, event) {
  if (event) event.stopPropagation();
  const found = libraryCleanFindItem(recordKey);
  if (!found) return;
  const label = libraryCleanItemTypeLabel(found.type);
  const confirmed = await appConfirm({
    label,
    title: `Delete ${found.item.name || label.toLowerCase()}?`,
    message: `This removes the saved ${label.toLowerCase()} from this library.`,
    confirmText: `Delete ${label}`,
    danger: true
  });
  if (!confirmed) return;
  const items = libraryCleanSourceItems(found.source, found.type);
  items.splice(found.index, 1);
  libraryCleanState().selected = null;
  save();
  if (found.source.kind === "module") updateFormulaButton(found.source.mi);
  if (found.source.kind === "module" && found.type === "relevant") renderRelevantLinks(found.source.mi);
  renderModuleLibrary();
}

async function libraryCleanEditItemKey(recordKey, event) {
  if (event) event.stopPropagation();
  const found = libraryCleanFindItem(recordKey);
  if (!found) return;
  openLinkForm({
    type: found.type,
    mi: found.source.kind === "module" ? found.source.mi : null,
    customId: found.source.kind === "custom" ? found.source.customId : null,
    index: found.index,
    mode: "edit",
    folder: normaliseLibraryFolderPath(found.item.folder || ""),
    fromLibrary: true
  });
}

function libraryCleanStartItemDrag(recordKey, event) {
  libraryCleanState().dragRecordKey = recordKey;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", recordKey);
  event.currentTarget.classList.add("library-v10-dragging");
  document.body.classList.add("library-v10-drag-active");
}

function libraryCleanEndItemDrag(event) {
  libraryCleanState().dragRecordKey = "";
  event.currentTarget?.classList.remove("library-v10-dragging");
  document.body.classList.remove("library-v10-drag-active");
  document.querySelectorAll(".library-v10-drop-target, .library-v10-crumb-drop-target").forEach((node) => {
    node.classList.remove("library-v10-drop-target", "library-v10-crumb-drop-target");
  });
}

function libraryCleanAllowFolderDrop(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  event.currentTarget.classList.add("library-v10-drop-target");
}

function libraryCleanAllowBreadcrumbDrop(folderPath, event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  event.currentTarget.classList.add("library-v10-crumb-drop-target");
}

function libraryCleanClearBreadcrumbDrop(event) {
  event.currentTarget.classList.remove("library-v10-crumb-drop-target");
}

function libraryCleanDropOnFolder(folderKey, event) {
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.classList.remove("library-v10-drop-target");
  const recordKey = event.dataTransfer.getData("text/plain") || libraryCleanState().dragRecordKey;
  libraryCleanMoveItemToFolder(recordKey, folderKey);
}

function libraryCleanDropOnBreadcrumb(folderPath, event) {
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.classList.remove("library-v10-crumb-drop-target");
  const recordKey = event.dataTransfer.getData("text/plain") || libraryCleanState().dragRecordKey;
  libraryCleanMoveItemToPath(recordKey, folderPath);
}

async function libraryCleanMoveItemToFolder(recordKey, folderKey) {
  const item = libraryCleanFindItem(recordKey);
  const folder = libraryCleanFindFolder(folderKey);
  if (!item || !folder) return;
  if (libraryCleanSourceKey(item.source) !== libraryCleanSourceKey(folder.source)) {
    await showAppNotice("Same library only", "Move resources into folders inside the same module or custom library.");
    return;
  }
  item.item.folder = folder.folder;
  item.item.updatedAt = libraryNowIso();
  addLibraryFolderToRegistry(item.type, folder.folder, libraryCleanTargetForSource(folder.source));
  save();
  renderModuleLibrary();
}

async function libraryCleanMoveItemToPath(recordKey, folderPath) {
  const item = libraryCleanFindItem(recordKey);
  if (!item) return;
  const targetPath = normaliseLibraryFolderPath(folderPath);
  item.item.folder = targetPath;
  item.item.updatedAt = libraryNowIso();
  if (targetPath) addLibraryFolderToRegistry(item.type, targetPath, libraryCleanTargetForSource(item.source));
  save();
  renderModuleLibrary();
}

async function libraryCleanCreateFolder(event) {
  if (event) event.stopPropagation();
  const source = libraryCleanSelectedSource();
  if (source.kind === "all") {
    await showAppNotice("Choose a library first", "Select a module or custom library, then create folders inside it.");
    return;
  }
  const current = libraryCleanCurrentFolder(source);
  const result = await appPrompt({
    label: "Folder",
    title: current ? "Create Subfolder" : "Create Folder",
    message: current ? `Create a folder inside ${libraryCleanShortPath(current)}.` : `Create a folder inside ${source.code}.`,
    inputLabel: "Folder Name",
    placeholder: current ? "Week 1" : "Lectures",
    confirmText: "Create Folder"
  });
  const name = normaliseLibraryFolderPath(result?.value || "");
  if (!name) return;
  const path = joinLibraryFolderPath(current, name);
  const target = libraryCleanTargetForSource(source);
  LIBRARY_CLEAN_ITEM_TYPES.forEach((type) => addLibraryFolderToRegistry(type, path, target));
  libraryCleanSetFolder(path, source, { silent: true });
  save();
  renderModuleLibrary();
}

async function libraryCleanOpenAddItem(type = "formula", event) {
  if (event) event.stopPropagation();
  const source = libraryCleanSelectedSource();
  if (source.kind === "all") {
    await showAppNotice("Choose a library first", `Select a module or custom library before adding a ${libraryCleanItemTypeLabel(type).toLowerCase()}.`);
    return;
  }
  openLinkForm({
    type,
    mi: source.kind === "module" ? source.mi : null,
    customId: source.kind === "custom" ? source.customId : null,
    folder: libraryCleanCurrentFolder(source),
    fromLibrary: true
  });
  document.getElementById("link-form-modal")?.classList.add("library-v10-link-modal");
  const title = document.getElementById("link-form-title");
  const subtitle = document.getElementById("link-form-subtitle");
  if (title) title.textContent = `Add ${libraryCleanItemTypeLabel(type)}`;
  if (subtitle) subtitle.textContent = source.code || "Library";
}

function libraryCleanRenderBody() {
  const source = libraryCleanSelectedSource();
  const folder = libraryCleanCurrentFolder(source);
  const search = String(moduleLibrarySearch || "").trim();
  const viewMode = libraryCleanViewMode();
  let body = "";
  if (search) {
    const results = libraryCleanSearchResults();
    body = results.folders.length || results.items.length
      ? `<div class="library-v10-results-label">Search Results</div>${viewMode === "details"
        ? libraryCleanDetailsHtml(results.folders, results.items)
        : `<div class="library-v10-grid">${results.folders.map(libraryCleanFolderCardHtml).join("")}${results.items.map(libraryCleanItemCardHtml).join("")}</div>`}`
      : `<div class="module-library-empty">No matching folders or resources.</div>`;
  } else if (source.kind === "all") {
    const folders = libraryCleanSortFolders(libraryCleanAllFolderRecords());
    const items = libraryCleanSortItems(libraryCleanRecords().filter((record) => !record.folder));
    body = folders.length || items.length
      ? (viewMode === "details"
        ? libraryCleanDetailsHtml(folders, items)
        : `<div class="library-v10-grid">${folders.map(libraryCleanFolderCardHtml).join("")}${items.map(libraryCleanItemCardHtml).join("")}</div>`)
      : `<div class="module-library-empty">No materials or links saved yet.</div>`;
  } else {
    const folders = libraryCleanSortFolders(libraryCleanImmediateFolders(source, folder));
    const items = libraryCleanSortItems(libraryCleanItemsInFolder(source, folder));
    body = folders.length || items.length
      ? (viewMode === "details"
        ? libraryCleanDetailsHtml(folders, items)
        : `<div class="library-v10-grid">${folders.map(libraryCleanFolderCardHtml).join("")}${items.map(libraryCleanItemCardHtml).join("")}</div>`)
      : `<div class="module-library-empty">This folder is empty.</div>`;
  }
  return body;
}

function renderModuleLibrary() {
  const modal = document.getElementById("module-library-modal");
  const materialsHost = document.getElementById("module-library-materials");
  if (!materialsHost) return;

  const source = libraryCleanSelectedSource();
  const title = document.getElementById("module-library-title");
  if (title) title.textContent = source.kind === "all" ? "Library Home" : `${source.code || source.label} Library`;

  const materialsSection = materialsHost.closest(".module-library-section");
  if (materialsSection) {
    materialsSection.classList.remove("is-collapsed");
    materialsSection.classList.add("library-v10-unified-section");
    const label = materialsSection.querySelector(".module-library-section-label");
    const copy = materialsSection.querySelector(".module-library-section-copy");
    const counts = libraryCleanCountsForSource(source);
    if (label) label.textContent = "Library Resources";
    if (copy) copy.textContent = source.kind === "all"
      ? "Open a library from quick access or browse the full list."
      : `${source.name || source.label || ""} | ${counts.items} resource${counts.items === 1 ? "" : "s"} across ${counts.folders} folder${counts.folders === 1 ? "" : "s"}.`;
  }

  const toolbar = document.querySelector(".module-library-toolbar");
  const activeElement = document.activeElement;
  const searchWasFocused = activeElement?.id === "module-library-search";
  const searchSelectionStart = searchWasFocused ? activeElement.selectionStart : null;
  const searchSelectionEnd = searchWasFocused ? activeElement.selectionEnd : null;
  if (toolbar) toolbar.innerHTML = libraryCleanToolbarHtml();
  if (toolbar && searchWasFocused) {
    const searchInput = toolbar.querySelector("#module-library-search");
    if (searchInput) {
      searchInput.focus();
      if (Number.isInteger(searchSelectionStart) && Number.isInteger(searchSelectionEnd)) {
        searchInput.setSelectionRange(searchSelectionStart, searchSelectionEnd);
      }
    }
  }
  if (toolbar && !document.getElementById("library-v10-source-rail-anchor")) {
    const anchor = document.createElement("div");
    anchor.id = "library-v10-source-rail-anchor";
    toolbar.insertAdjacentElement("afterend", anchor);
  }
  const railAnchor = document.getElementById("library-v10-source-rail-anchor");
  if (railAnchor) {
    railAnchor.innerHTML = libraryCleanSourceRailHtml();
    libraryCleanSetupSourceRailEvents();
  }

  const stateV10 = libraryCleanState();
  const sourceKey = libraryCleanSourceKey(source);
  const history = stateV10.historyBySource[sourceKey] || [""];
  const historyIndex = stateV10.historyIndexBySource[sourceKey] || 0;
  const backDisabled = source.kind === "all" || historyIndex <= 0;
  const forwardDisabled = source.kind === "all" || historyIndex >= history.length - 1;
  const folder = libraryCleanCurrentFolder(source);

  const actionsHtml = `<div class="library-v10-actions">
    <div class="library-v10-nav-strip">
      <div class="library-v10-nav-left">
        <div class="library-v10-nav-buttons">
          <button class="mini-btn library-v10-arrow-btn" type="button" aria-label="Back" title="Back" ${backDisabled ? "disabled" : ""} onclick="libraryCleanStepHistory(-1, event)">&#8592;</button>
          <button class="mini-btn library-v10-arrow-btn" type="button" aria-label="Forward" title="Forward" ${forwardDisabled ? "disabled" : ""} onclick="libraryCleanStepHistory(1, event)">&#8594;</button>
        </div>
        <div class="library-v10-breadcrumbs">${libraryCleanBreadcrumbHtml()}</div>
      </div>
      <div class="library-v10-action-buttons">
        <button class="nav-btn" type="button" ${source.kind === "all" ? "disabled" : ""} onclick="libraryCleanCreateFolder(event)">New Folder</button>
        <button class="nav-btn calendar-btn" type="button" ${source.kind === "all" ? "disabled" : ""} onclick="libraryCleanOpenAddItem('formula', event)">Add Material</button>
        ${source.kind === "custom" ? `<button class="nav-btn" type="button" onclick="renameCustomLibrary()">Rename Library</button>` : ""}
        ${source.kind === "custom" ? `<button class="nav-btn danger-btn" type="button" onclick="deleteCustomLibrary()">Delete Library</button>` : ""}
      </div>
    </div>
  </div>`;

  materialsHost.className = "module-library-list library-v10-list";
  materialsHost.innerHTML = actionsHtml + libraryCleanRenderBody();
  modal?.classList.add("library-v10-active");
}

function libraryCleanSetupSourceRailEvents() {
  const browser = document.querySelector(".library-v10-source-browser");
  if (!browser || browser.dataset.bound === "true") return;
  browser.dataset.bound = "true";
  browser.addEventListener("click", (event) => {
    if (!event.target.closest(".library-v10-source-shell")) {
      libraryCleanCloseSourceMenu();
      return;
    }
    if (event.target.closest(".library-v10-source-menu")) return;
    const card = event.target.closest("[data-source-key]");
    if (!card) return;
    if (event.target.closest(".library-v10-source-pin")) return;
    event.preventDefault();
    event.stopPropagation();
    libraryCleanSetSource(card.dataset.sourceKey || "all");
  });
  browser.addEventListener("keydown", (event) => {
    const card = event.target.closest("[data-source-key]");
    if (!card) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    libraryCleanSetSource(card.dataset.sourceKey || "all");
  });
}

function openModuleLibrary(mi = null, focus = "both", event) {
  if (event) event.stopPropagation();
  materialLibraryModuleIndex = mi;
  moduleLibrarySearch = "";
  if (Number.isInteger(mi)) libraryCleanSetSource(`module:${mi}`, { silent: true });
  else libraryCleanSetSource("all", { silent: true });
  document.getElementById("module-library-modal")?.classList.remove("hidden");
  renderModuleLibrary();
}

function closeModuleLibrary() {
  document.getElementById("module-library-modal")?.classList.add("hidden");
  materialLibraryModuleIndex = null;
  moduleLibraryScopeMi = null;
  moduleLibraryScopeCustomId = null;
}

function updateModuleLibrarySearch(value) {
  moduleLibrarySearch = String(value || "");
  renderModuleLibrary();
}

function clearModuleLibrarySearch() {
  moduleLibrarySearch = "";
  renderModuleLibrary();
}

function updateModuleLibraryFilter(value) {
  const raw = String(value || "all");
  libraryCleanSetSource(raw === "all" ? "all" : raw.startsWith("custom:") ? raw : `module:${raw}`);
}

function setModuleLibraryView() {
  renderModuleLibrary();
}

function openFormulaLink(mi, event) {
  openModuleLibrary(mi, "materials", event);
}

function toggleModuleLibraryLinks() { renderModuleLibrary(); }
function toggleModuleLibraryMaterials() { renderModuleLibrary(); }

function openLibraryFolder(type, folder, event) {
  if (event) event.stopPropagation();
  libraryCleanSetFolder(folder);
}
function stepLibraryFolderHistory(type, direction, event) { libraryCleanStepHistory(direction, event); }
function createLibraryFolder(type, event) { libraryCleanCreateFolder(event); }
function renameLibraryFolder(type, folderPath, event) {
  const source = libraryCleanSelectedSource();
  if (source.kind === "all") return;
  libraryCleanRenameFolderKey(`${source.key}:folder:${normaliseLibraryFolderPath(folderPath)}`, event);
}
function deleteLibraryFolder(type, folderPath, event) {
  const source = libraryCleanSelectedSource();
  if (source.kind === "all") return;
  libraryCleanDeleteFolderKey(`${source.key}:folder:${normaliseLibraryFolderPath(folderPath)}`, event);
}
function getRegisteredLibraryFolders(arg1 = null, arg2 = null) {
  const target = arg2 || arg1 || {};
  const source = target.customId ? libraryCleanParseSourceKey(`custom:${target.customId}`) : Number.isInteger(target.mi) ? libraryCleanParseSourceKey(`module:${target.mi}`) : libraryCleanSelectedSource();
  return source.kind === "all" ? [] : libraryCleanAllFolderPathsForSource(source);
}
function getUnifiedLibraryRecords() { return libraryCleanRecords(); }
function getUnifiedSelectedFolder() { return libraryCleanCurrentFolder(); }
function getSelectedLibraryFolder() { return libraryCleanState().selected?.key || null; }

function openLibraryAdd(type = "formula", event) {
  libraryCleanOpenAddItem(type, event);
}

function openLibraryItem(type, mi, index, customId = null, event) {
  const source = customId ? libraryCleanParseSourceKey(`custom:${customId}`) : libraryCleanParseSourceKey(`module:${mi}`);
  libraryCleanOpenItemKey(`${source.key}:${type}:item:${index}`, event);
}

function editLibraryItem(type, mi, index, customId = null, event) {
  const source = customId ? libraryCleanParseSourceKey(`custom:${customId}`) : libraryCleanParseSourceKey(`module:${mi}`);
  libraryCleanEditItemKey(`${source.key}:${type}:item:${index}`, event);
}

function deleteLibraryItem(type, mi, index, customId = null, event) {
  const source = customId ? libraryCleanParseSourceKey(`custom:${customId}`) : libraryCleanParseSourceKey(`module:${mi}`);
  libraryCleanDeleteItemKey(`${source.key}:${type}:item:${index}`, event);
}

async function createCustomLibrary() {
  const nameResult = await appPrompt({
    label: "Library",
    title: "Create Custom Library",
    message: "Create a standalone library for materials that do not belong to one module.",
    inputLabel: "Library Name",
    placeholder: "Research, Careers, General",
    confirmText: "Create Library"
  });
  const name = String(nameResult?.value || "").trim();
  if (!name) return;
  const id = `lib_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const now = libraryNowIso();
  getCustomLibraries()[id] = { name, description: "", materials: [], relevantLinks: [], createdAt: now, updatedAt: now };
  save();
  libraryCleanSetSource(`custom:${id}`);
}

async function renameCustomLibrary() {
  const source = libraryCleanSelectedSource();
  if (source.kind !== "custom") {
    await showAppNotice("Choose a custom library", "Select a custom library before renaming it.");
    return;
  }
  const library = getCustomLibrary(source.customId);
  if (!library) return;
  const result = await appPrompt({
    label: "Library",
    title: "Rename Custom Library",
    message: "Change the library name everywhere this custom library appears.",
    inputLabel: "Library Name",
    defaultValue: library.name || "Custom Library",
    placeholder: "Research, Careers, General",
    confirmText: "Rename Library"
  });
  const name = String(result?.value || "").trim();
  if (!name || name === library.name) return;
  library.name = name;
  library.updatedAt = libraryNowIso();
  save();
  renderModuleLibrary();
}

async function deleteCustomLibrary() {
  const source = libraryCleanSelectedSource();
  if (source.kind !== "custom") {
    await showAppNotice("Choose a custom library", "Select a custom library before deleting one.");
    return;
  }
  const library = getCustomLibrary(source.customId);
  if (!library) return;
  const count = libraryCleanRecords({ source }).length;
  const confirmed = await appConfirm({
    label: "Library",
    title: `Delete ${library.name || "custom library"}?`,
    message: count ? `This deletes the custom library and ${count} saved resource${count === 1 ? "" : "s"}.` : "This deletes the custom library.",
    confirmText: "Delete Library",
    danger: true
  });
  if (!confirmed) return;
  delete getCustomLibraries()[source.customId];
  const store = getStore();
  if (store.libraryFolders?.custom) delete store.libraryFolders.custom[source.customId];
  save();
  libraryCleanSetSource("all");
}

function handleModuleLibraryKeydown(event) {
  const modal = document.getElementById("module-library-modal");
  if (!modal || modal.classList.contains("hidden")) return;
  const tag = event.target?.tagName;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tag) || event.target?.isContentEditable) return;

  if (event.altKey && event.key === "ArrowLeft") { event.preventDefault(); libraryCleanStepHistory(-1, event); return; }
  if (event.altKey && event.key === "ArrowRight") { event.preventDefault(); libraryCleanStepHistory(1, event); return; }

  const selected = libraryCleanState().selected || libraryCleanSelectionFromNode(document.activeElement?.closest?.("[data-library-key]") || null);
  if (!selected) return;
  libraryCleanState().selected = selected;
  libraryCleanApplySelection();

  if (event.key === "Enter") {
    event.preventDefault();
    if (selected.kind === "folder") libraryCleanOpenFolderKey(selected.key, event);
    if (selected.kind === "item") libraryCleanOpenItemKey(selected.key, event);
    return;
  }

  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    if (selected.kind === "folder") libraryCleanDeleteFolderKey(selected.key, event);
    if (selected.kind === "item") libraryCleanDeleteItemKey(selected.key, event);
    return;
  }

  if (event.key === "F2") {
    event.preventDefault();
    if (selected.kind === "folder") libraryCleanRenameFolderKey(selected.key, event);
    if (selected.kind === "item") libraryCleanEditItemKey(selected.key, event);
  }
}

(function exposeLibraryCleanV10Globals() {
  Object.assign(window, {
    libraryCleanSetSource,
    libraryCleanSetFolder,
    libraryCleanStepHistory,
    libraryCleanParentFolder,
    libraryCleanCreateFolder,
    libraryCleanOpenAddItem,
    libraryCleanOpenAddMaterial: (event) => libraryCleanOpenAddItem("formula", event),
    libraryCleanSelect,
    libraryCleanOpenFolderKey,
    libraryCleanOpenItemKey,
    libraryCleanRenameFolderKey,
    libraryCleanDeleteFolderKey,
    libraryCleanDeleteItemKey,
    libraryCleanEditItemKey,
    libraryCleanStartItemDrag,
    libraryCleanEndItemDrag,
    libraryCleanAllowFolderDrop,
    libraryCleanAllowBreadcrumbDrop,
    libraryCleanClearBreadcrumbDrop,
    libraryCleanDropOnFolder,
    libraryCleanDropOnBreadcrumb,
    libraryCleanMoveItemToFolder,
    libraryCleanMoveItemToPath,
    openModuleLibrary,
    closeModuleLibrary,
    renderModuleLibrary,
    updateModuleLibrarySearch,
    updateModuleLibraryFilter,
    setModuleLibraryView,
    openFormulaLink,
    openLibraryAdd,
    openLibraryFolder,
    stepLibraryFolderHistory,
    createLibraryFolder,
    renameLibraryFolder,
    deleteLibraryFolder,
    handleModuleLibraryKeydown,
    getRegisteredLibraryFolders,
    getUnifiedLibraryRecords,
    getUnifiedSelectedFolder,
    getSelectedLibraryFolder,
    createCustomLibrary,
    renameCustomLibrary,
    deleteCustomLibrary,
    setCustomLibraryColour,
    togglePinnedLibrarySource,
    libraryCleanToggleAllSources,
    libraryCleanToggleSourceMenu,
    libraryCleanCloseSourceMenu,
    libraryCleanSetSortMode,
    libraryCleanSetViewMode,
    libraryCleanToggleSort,
    clearModuleLibrarySearch
  });
})();

// Clickable breadcrumb fallback: avoids inline-handler issues after re-render/build.
document.addEventListener("click", function handleUniTrackLibraryBreadcrumbClick(event) {
  const cleanCrumb = event.target.closest("[data-library-clean-folder]");
  if (cleanCrumb) {
    event.preventDefault();
    event.stopPropagation();
    libraryCleanSetFolder(cleanCrumb.dataset.libraryCleanFolder || "");
    return;
  }

  const moduleCrumb = event.target.closest("[data-module-library-folder]");
  if (moduleCrumb) {
    event.preventDefault();
    event.stopPropagation();
    openLibraryFolder(moduleCrumb.dataset.moduleLibraryType || "formula", moduleCrumb.dataset.moduleLibraryFolder || "", event);
  }
});

document.addEventListener("focusin", function handleUniTrackLibraryFocus(event) {
  const node = event.target?.closest?.("[data-library-key]");
  const selection = libraryCleanSelectionFromNode(node);
  if (!selection) return;
  libraryCleanState().selected = selection;
  libraryCleanApplySelection();
});

document.addEventListener("keydown", handleModuleLibraryKeydown);

/* 04-dashboard-ui.js */
function updateModule(mi) {
  const done = getModuleDone(mi);
  const pct = getModulePct(mi);
  document.getElementById(`mdone-${mi}`).textContent = done;
  document.getElementById(`mpct-${mi}`).textContent = pct.toFixed(1) + "% complete";
  document.getElementById(`mfill-${mi}`).style.width = pct.toFixed(1) + "%";

  const final = getModuleFinal(mi);
  const finalEl = document.getElementById(`mfinal-${mi}`);
  const clsEl = document.getElementById(`mcls-${mi}`);
  const displayGrade = formatModuleGradeDisplay(mi);
  finalEl.textContent = displayGrade.main;
  if (final !== null) {
    const cls = classify(final);
    clsEl.className = "final-cls " + (cls.cls || "");
    clsEl.textContent = [displayGrade.label, displayGrade.secondary].filter(Boolean).join(" · ");
  } else {
    clsEl.className = "final-cls";
    clsEl.textContent = "";
  }

  const cwInput = document.getElementById(`cw-${mi}`);
  const exInput = document.getElementById(`exam-${mi}`);
  const compactCw = document.querySelector(`#topics-${mi} .compact-cw`);
  const compactEx = document.querySelector(`#topics-${mi} .compact-ex`);
  if (getGradingSystem() === "uk" && cwInput) {
    const calculated = calculateCourseworkFromComponents(mi);
    cwInput.disabled = MODULES[mi].cw === 0;
    if (compactCw) compactCw.disabled = MODULES[mi].cw === 0;
    if (MODULES[mi].cw === 0) cwInput.placeholder = "N/A";
    else {
      if (calculated.mark !== null) {
        const calculatedValue = formatGradeInputValue(calculated.mark);
        getStore().coursework[mi] = calculatedValue;
        cwInput.value = calculatedValue;
        if (compactCw) compactCw.value = calculatedValue;
        cwInput.placeholder = `Calc ${formatSelectedGrade(calculated.mark).main}`;
      } else {
        cwInput.placeholder = getGradeScaleConfig().placeholder;
      }
    }
  }
  if (getGradingSystem() === "uk" && exInput) {
    exInput.disabled = MODULES[mi].exam === 0;
    if (compactEx) compactEx.disabled = MODULES[mi].exam === 0;
    exInput.placeholder = MODULES[mi].exam === 0 ? "N/A" : "-";
    if (MODULES[mi].exam === 0) exInput.value = "";
  }
  if (getGradingSystem() === "uk") updateCourseworkSummary(mi);
}

function updateGlobal() {
  let total = 0;
  let done = 0;
  let weightedCredits = 0;
  MODULES.forEach((mod, mi) => {
    if (!isModuleVisibleInActiveTerm(mi)) return;
    total += getModuleTotal(mi);
    done += getModuleDone(mi);
    weightedCredits += mod.credits * (getModulePct(mi) / 100);
  });
  const pct = total ? (done / total) * 100 : 0;
  document.getElementById("global-done").textContent = done;
  document.getElementById("global-total").textContent = total;
  document.getElementById("global-fill").style.width = pct.toFixed(1) + "%";
  document.getElementById("global-pct-text").textContent = pct.toFixed(1) + "% complete";
  const unitLabel = getCreditUnitLabel();
  const activeTerm = getActiveTermFilter();
  const creditTarget = activeTerm === "all"
    ? TOTAL_CREDITS
    : MODULES.reduce((sum, mod, mi) => isModuleVisibleInActiveTerm(mi) ? sum + (Number(mod.credits) || 0) : sum, 0);
  document.getElementById("credits-text").textContent = weightedCredits.toFixed(1) + " / " + creditTarget + " " + unitLabel;
  updatePredictor();
  updateDashboard();
}

function updatePredictor() {
  const avg = getWeightedAvg();
  const heroPredictor = document.getElementById("hero-predictor");
  const heroClass = document.getElementById("hero-class");
  const badgeHost = document.getElementById("classification-badge");
  if (avg === null) {
    heroPredictor.textContent = "-";
    heroClass.textContent = "Awaiting marks";
    badgeHost.innerHTML = "";
    return;
  }
  const cls = classify(avg);
  const grade = formatSelectedGrade(avg);
  heroPredictor.textContent = grade.main;
  heroClass.textContent = grade.label || cls.badge;
  badgeHost.innerHTML = `<span class="classification-badge ${cls.heroCls}">${escapeHtml(grade.label || cls.badge)}</span>`;
}

function updateDashboard() {
  const avg = getWeightedAvg();
  const aggregate = getGradeAggregate();
  let total = 0;
  let done = 0;
  let weightedCredits = 0;
  MODULES.forEach((mod, mi) => {
    if (!isModuleVisibleInActiveTerm(mi)) return;
    total += getModuleTotal(mi);
    done += getModuleDone(mi);
    weightedCredits += mod.credits * (getModulePct(mi) / 100);
  });
  document.getElementById("dash-completion").textContent = (total ? (done / total) * 100 : 0).toFixed(0) + "%";
  const unitLabel = getCreditUnitLabel();
  const activeTerm = getActiveTermFilter();
  const termCreditTarget = activeTerm === "all"
    ? TOTAL_CREDITS
    : MODULES.reduce((sum, mod, mi) => isModuleVisibleInActiveTerm(mi) ? sum + (Number(mod.credits) || 0) : sum, 0);
  document.getElementById("dash-credits").textContent = weightedCredits.toFixed(1) + " / " + termCreditTarget + " " + unitLabel;

  const predictor = document.getElementById("dash-predictor");
  const status = document.getElementById("dash-status");
  const badge = document.getElementById("dash-badge");
  if (avg === null) {
    predictor.textContent = "-";
    status.textContent = "Enter module marks below";
    badge.innerHTML = "";
  } else {
    const cls = classify(avg);
    const grade = formatSelectedGrade(avg);
    predictor.textContent = grade.main;
    const major = getMajorGpa();
    const majorText = major ? ` · Major GPA ${major.value.toFixed(2)} (${major.credits} ${unitLabel})` : "";
    const scopeText = activeTerm === "all" ? "" : `${getTermLabel(activeTerm)} · `;
    status.textContent = `${scopeText}${formatGradeAggregateStatus(aggregate)}${majorText}`;
    badge.innerHTML = `<span class="classification-badge ${cls.heroCls}">${escapeHtml(grade.label || cls.badge)}</span>`;
  }
  renderDashboardTermSummary();
  if (!document.getElementById("dashboard-modal").classList.contains("hidden")) renderDashboardChart();
}

function renderDashboardTermSummary() {
  const host = document.getElementById("dash-term-summary");
  if (!host) return;
  const terms = getTermBreakdown();
  if (!terms.length) {
    host.innerHTML = `<div class="term-summary-empty">Add modules to see semester totals.</div>`;
    return;
  }
  const system = getGradingSystem();
  const metric = getAggregateMetricLabel();
  const activeTerm = getActiveTermFilter();
  host.innerHTML = terms.map((term) => {
    const unitLabel = getCreditUnitLabel({ plural: term.attemptedCredits !== 1 });
    const hasGrade = term.value !== null && term.value !== undefined;
    const grade = hasGrade ? formatSelectedGrade(term.value) : { main: "-", label: "No grades yet", secondary: "" };
    const gradePoints = system !== "uk" && system !== "de5" && hasGrade
      ? `<span>${term.gradePoints.toFixed(2)} grade points</span>`
      : "";
    return `
      <button class="term-summary-card ${activeTerm === term.term ? "active" : ""}" type="button" onclick="setActiveTermFilter('${escapeHtml(term.term)}')">
        <div class="term-summary-label">${escapeHtml(term.label)}</div>
        <div class="term-summary-value">${escapeHtml(grade.main)}</div>
        <div class="term-summary-meta">
          <span>${escapeHtml(metric)}</span>
          <span>${term.credits} / ${term.attemptedCredits} ${escapeHtml(unitLabel)}</span>
          ${gradePoints}
          <span>${escapeHtml(grade.label || "")}</span>
        </div>
      </button>
    `;
  }).join("");
}

function openDashboard() {
  document.getElementById("dashboard-modal").classList.remove("hidden");
  updateDashboard();
  renderDashboardChart();
}

function closeDashboard() {
  document.getElementById("dashboard-modal").classList.add("hidden");
}

document.getElementById("dashboard-modal").addEventListener("click", (event) => {
  if (event.target.id === "dashboard-modal") closeDashboard();
});

document.getElementById("timeline-modal").addEventListener("click", (event) => {
  if (event.target.id === "timeline-modal") closeDeadlineTimeline();
});

document.getElementById("todo-modal").addEventListener("click", (event) => {
  if (event.target.id === "todo-modal") event.stopPropagation();
});

document.querySelector("#todo-modal .timeline-head")?.addEventListener("pointerdown", startTodoPanelDrag);
document.addEventListener("pointermove", moveTodoPanelDrag);
document.addEventListener("pointerup", endTodoPanelDrag);
window.addEventListener("resize", () => {
  if (!document.getElementById("todo-modal")?.classList.contains("hidden")) applyTodoPanelState();
});

document.getElementById("deadline-form-modal").addEventListener("click", (event) => {
  if (event.target.id === "deadline-form-modal") closeDeadlineForm();
});

document.getElementById("calendar-modal").addEventListener("click", (event) => {
  if (event.target.id === "calendar-modal") closeCalendarComposer();
});

document.getElementById("calendar-all-day-input")?.addEventListener("change", updateCalendarComposerMode);
document.getElementById("deadline-all-day-input")?.addEventListener("change", updateDeadlineFormMode);

document.getElementById("module-library-modal").addEventListener("click", (event) => {
  if (event.target.id === "module-library-modal") closeModuleLibrary();
});
document.getElementById("module-library-modal").addEventListener("keydown", handleModuleLibraryKeydown);

document.getElementById("course-setup-modal").addEventListener("click", (event) => {
  if (event.target.id === "course-setup-modal") closeCourseSetupModal();
});

document.getElementById("onboarding-modal").addEventListener("click", (event) => {
  if (event.target.id === "onboarding-modal") return;
});

document.getElementById("auth-modal").addEventListener("click", (event) => {
  if (!currentUser || isRecoveryFlow()) return;
  if (event.target.id === "auth-modal") closeAuthModal();
});

function renderDashboardChart() {
  const canvas = document.getElementById("dashboard-chart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const dark = document.body.classList.contains("theme-dark");
  const quiet = document.body.classList.contains("theme-quiet");
  const rectWidth = canvas.parentElement.clientWidth || 760;
  const width = rectWidth;
  const height = 220;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const padTop = 20;
  const padRight = 14;
  const padBottom = 52;
  const padLeft = 44;
  const chartWidth = width - padLeft - padRight;
  const chartHeight = height - padTop - padBottom;
  const visibleModules = MODULES
    .map((mod, mi) => ({ mod, mi }))
    .filter((item) => isModuleVisibleInActiveTerm(item.mi));
  const step = chartWidth / Math.max(visibleModules.length, 1);
  const barWidth = Math.max(28, Math.min(42, Math.floor(step * 0.42)));
  const crisp = (value) => Math.round(value) + 0.5;
  const chartMonoFont = preferences.font === "sans"
    ? "'Segoe UI', Arial, sans-serif"
    : preferences.font === "mono"
      ? "'DM Mono', Consolas, monospace"
      : "'DM Mono', monospace";
  const chartDisplayFont = preferences.font === "sans"
    ? "'Segoe UI', Arial, sans-serif"
    : preferences.font === "mono"
      ? "'DM Mono', Consolas, monospace"
      : "'Shippori Mincho', serif";

  const colors = visibleModules.map(({ mi }) => {
    const choice = getModuleColourSet(mi);
    return choice.text || "#c0392b";
  });

  ctx.strokeStyle = dark ? "rgba(255,255,255,0.12)" : "rgba(26,22,18,0.09)";
  ctx.lineWidth = 1;
  ctx.font = `11px ${chartMonoFont}`;
  ctx.fillStyle = dark ? "rgba(245,240,232,0.7)" : "rgba(26,22,18,0.54)";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 4; i++) {
    const value = i * 25;
    const y = crisp(padTop + chartHeight - (chartHeight * value / 100));
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(width - padRight, y);
    ctx.stroke();
    ctx.fillText(value + "%", padLeft - 8, y);
  }

  visibleModules.forEach(({ mod, mi }, index) => {
    const pct = getModulePct(mi);
    const x = Math.round(padLeft + (step * index) + (step - barWidth) / 2);
    const barHeight = Math.round((chartHeight * pct) / 100);
    const y = Math.round(padTop + chartHeight - barHeight);
    ctx.fillStyle = colors[index];
    ctx.fillRect(x, y, barWidth, barHeight);

    ctx.fillStyle = dark ? "rgba(255,255,255,0.9)" : "rgba(26,22,18,0.84)";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.font = `bold 13px ${chartDisplayFont}`;
    ctx.fillText(pct.toFixed(0) + "%", x + barWidth / 2, y - 8);

    ctx.fillStyle = dark ? "rgba(245,240,232,0.78)" : "rgba(26,22,18,0.72)";
    ctx.textBaseline = "top";
    ctx.font = `11px ${chartMonoFont}`;
    ctx.fillText(mod.kanji, x + barWidth / 2, height - 30);
  });
}

function formatCountdown(dateString) {
  const target = new Date(dateString);
  const diff = target.getTime() - Date.now();
  const sign = diff < 0 ? "-" : "";
  const totalSeconds = Math.floor(Math.abs(diff) / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${sign}${days}d ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/* 05-years-modules-forms.js */
function handleYearDropdown(value) {
  if (value === "__new__") return createNewYear();
  if (value === "__archive__") return archiveCurrentYear();
  if (value === "__delete__") return deleteCurrentYear();
  const parts = String(value || "").split(":");
  if (parts[0] === "year" && parts[1]) return switchYear(parts[1], "all");
  if (parts[0] === "term" && parts[1] && parts[2]) return switchYear(parts[1], parts[2]);
  switchYear(value, "all");
}

function switchYear(yearId, term = "all") {
  if (!state.years[yearId]) return;
  state.ui.currentYearId = yearId;
  state.ui.currentTermFilter = isKnownTermValue(term, state.years[yearId].store) ? term : "all";
  refreshActiveYear();
  save();
  renderYearSelector();
  buildModules();
  renderStickyExams();
  updateGlobal();
}

function archiveCurrentYear() {
  const year = getCurrentYear();
  if (!year || year.id === "year1" && year.store.archived) return;
  year.store.archived = !year.store.archived;
  save();
  renderYearSelector();
}

function addModuleToCurrentYear() {
  const code = document.getElementById("module-code-input");
  const name = document.getElementById("module-name-input");
  const term = document.getElementById("module-term-input");
  const credits = document.getElementById("module-credits-input");
  const cw = document.getElementById("module-cw-input");
  const exam = document.getElementById("module-exam-input");
  const blackboard = document.getElementById("module-blackboard-input");
  const optionsFields = document.getElementById("module-options-fields");
  const colourField = document.getElementById("module-colour-field");
  editingModuleIndex = null;
  if (code) code.value = "NEW201";
  if (name) name.value = "New Module";
  if (term) term.value = getActiveTermFilter() !== "all" ? getActiveTermFilter() : "sem1";
  if (credits) credits.value = "15";
  if (cw) cw.value = "50";
  if (exam) exam.value = "50";
  if (blackboard) blackboard.value = "";
  if (optionsFields) optionsFields.classList.add("hidden");
  if (colourField) colourField.classList.add("hidden");
  updateModuleFormForGradingSystem();
  populateModuleTermSelect();
  if (getGradingSystem() === "uk") syncModuleWeightInputs("cw");
  const title = document.querySelector("#module-form-modal .dashboard-title");
  const saveBtn = document.querySelector("#module-form-modal .deadline-form-actions .nav-btn:last-child");
  if (title) title.textContent = "Add Module";
  if (saveBtn) saveBtn.textContent = "Add Module";
  document.getElementById("module-form-modal").classList.remove("hidden");
  setTimeout(() => code && code.focus(), 0);
}

function closeModuleForm() {
  document.getElementById("module-form-modal").classList.add("hidden");
  editingModuleIndex = null;
}

function formatWeightInputValue(value) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function syncModuleWeightInputs(source = "cw") {
  const cwInput = document.getElementById("module-cw-input");
  const examInput = document.getElementById("module-exam-input");
  if (!cwInput || !examInput) return;
  if (source === "cw") {
    const cw = parseFloat(cwInput.value || "");
    if (!Number.isFinite(cw)) return;
    const safeCw = Math.min(100, Math.max(0, cw));
    if (safeCw !== cw) cwInput.value = formatWeightInputValue(safeCw);
    examInput.value = formatWeightInputValue(100 - safeCw);
    return;
  }
  const exam = parseFloat(examInput.value || "");
  if (!Number.isFinite(exam)) return;
  const safeExam = Math.min(100, Math.max(0, exam));
  if (safeExam !== exam) examInput.value = formatWeightInputValue(safeExam);
  cwInput.value = formatWeightInputValue(100 - safeExam);
}

function updateModuleFormForGradingSystem() {
  const ukMode = getGradingSystem() === "uk";
  const creditsLabel = document.getElementById("module-credits-label");
  const cwInput = document.getElementById("module-cw-input");
  const examInput = document.getElementById("module-exam-input");
  const cwField = cwInput?.closest(".field");
  const examField = examInput?.closest(".field");
  if (creditsLabel) creditsLabel.textContent = getModuleCreditFieldLabel();
  if (cwField) cwField.classList.toggle("hidden", !ukMode);
  if (examField) examField.classList.toggle("hidden", !ukMode);
  populateModuleTermSelect();
}

function populateModuleTermSelect(selected = null) {
  const termSelect = document.getElementById("module-term-input");
  if (!termSelect) return;
  const currentValue = selected || termSelect.value || getActiveTermFilter();
  const options = getCurrentTermOptions();
  termSelect.innerHTML = options.map((option) => (
    `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`
  )).join("") + `<option value="__new__">+ Add Semester</option>`;
  termSelect.value = options.some((option) => option.value === currentValue) ? currentValue : (getActiveTermFilter() !== "all" ? getActiveTermFilter() : "sem1");
}

async function handleModuleTermChange(select) {
  if (!select || select.value !== "__new__") return;
  const store = getStore();
  const suggestion = createNextTermOption(store);
  const result = await appPrompt({
    label: "Semester",
    title: "Add Teaching Period",
    message: "Add another semester or teaching block for rare courses with more than three periods in one academic year.",
    inputLabel: "Name",
    defaultValue: suggestion.label,
    placeholder: "Semester 4",
    confirmText: "Add Semester"
  });
  const label = String(result?.value || "").trim();
  if (!label) {
    populateModuleTermSelect();
    return;
  }
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || suggestion.value;
  let value = /^semester\s*(\d+)$/i.test(label) ? `sem${label.match(/\d+/)[0]}` : base;
  const existing = getCurrentTermOptions(store);
  let suffix = 2;
  const original = value;
  while (existing.some((option) => option.value === value)) {
    value = `${original}-${suffix}`;
    suffix += 1;
  }
  store.termOptions = uniqueTermOptions([...existing, { value, label }]);
  save();
  populateModuleTermSelect(value);
  renderYearSelector();
}

document.getElementById("module-term-input")?.addEventListener("change", (event) => handleModuleTermChange(event.target));

document.getElementById("module-cw-input")?.addEventListener("input", () => syncModuleWeightInputs("cw"));
document.getElementById("module-exam-input")?.addEventListener("input", () => syncModuleWeightInputs("exam"));
document.getElementById("module-colour-input")?.addEventListener("input", (event) => {
  const preview = document.getElementById("module-colour-preview");
  if (preview) preview.style.background = event.target.value;
});

function parseQuotedList(input) {
  const text = String(input || "").trim();
  if (!text) return [];
  const quoted = [...text.matchAll(/"([^"]+)"/g)].map((match) => match[1].trim()).filter(Boolean);
  return quoted.length ? quoted : text.split(/\s*,\s*|\n+/).map((item) => item.trim()).filter(Boolean);
}

function editModuleWeights(mi, event) {
  if (event) event.stopPropagation();
  const mod = MODULES[mi];
  if (!mod) return;
  editingModuleIndex = mi;
  const code = document.getElementById("module-code-input");
  const name = document.getElementById("module-name-input");
  const term = document.getElementById("module-term-input");
  const credits = document.getElementById("module-credits-input");
  const cw = document.getElementById("module-cw-input");
  const exam = document.getElementById("module-exam-input");
  const blackboard = document.getElementById("module-blackboard-input");
  const colourField = document.getElementById("module-colour-field");
  const colourInput = document.getElementById("module-colour-input");
  const colourPreview = document.getElementById("module-colour-preview");
  const optionsFields = document.getElementById("module-options-fields");
  if (code) code.value = mod.kanji || "";
  if (name) name.value = mod.name || "";
  if (term) term.value = getModuleTerm(mi);
  if (credits) credits.value = mod.credits ?? 15;
  if (cw) cw.value = mod.cw ?? 0;
  if (exam) exam.value = mod.exam ?? 0;
  if (blackboard) blackboard.value = getBlackboardLink(mi) || "";
  updateModuleFormForGradingSystem();
  populateModuleTermSelect(getModuleTerm(mi));
  if (optionsFields) optionsFields.classList.remove("hidden");
  if (colourField) colourField.classList.toggle("hidden", !isColourCustomisableTheme());
  if (colourInput) colourInput.value = getStoredModuleColourHex(mi);
  if (colourPreview) colourPreview.style.background = getModuleColourSet(mi).fill;
  if (getGradingSystem() === "uk") syncModuleWeightInputs("cw");
  const title = document.querySelector("#module-form-modal .dashboard-title");
  const saveBtn = document.querySelector("#module-form-modal .deadline-form-actions .nav-btn:last-child");
  if (title) title.textContent = "Module Options";
  if (saveBtn) saveBtn.textContent = "Save Module";
  document.getElementById("module-form-modal").classList.remove("hidden");
}

function saveModuleForm() {
  const codeInput = document.getElementById("module-code-input");
  const nameInput = document.getElementById("module-name-input");
  const termInput = document.getElementById("module-term-input");
  const creditsInput = document.getElementById("module-credits-input");
  const cwInput = document.getElementById("module-cw-input");
  const examInput = document.getElementById("module-exam-input");
  const blackboardInput = document.getElementById("module-blackboard-input");
  const colourInput = document.getElementById("module-colour-input");
  const code = (codeInput.value || "").trim();
  const name = (nameInput.value || "").trim();
  if (!code || !name) {
    alert("Please enter both module code and module name.");
    return;
  }
  const credits = parseFloat(creditsInput.value || "");
  let courseworkWeight = parseFloat(cwInput.value || "");
  let examWeight = parseFloat(examInput.value || "");
  if (getGradingSystem() !== "uk") {
    courseworkWeight = 0;
    examWeight = 100;
  }
  if (Number.isFinite(courseworkWeight) && courseworkWeight >= 100) examWeight = 0;
  if (Number.isFinite(examWeight) && examWeight >= 100) courseworkWeight = 0;
  const moduleData = {
    name,
    kanji: code.toUpperCase(),
    short: code.toUpperCase(),
    term: normalizeTermValue(termInput?.value || "sem1"),
    credits: Number.isFinite(credits) ? credits : 15,
    cw: Number.isFinite(courseworkWeight) ? courseworkWeight : 50,
    exam: Number.isFinite(examWeight) ? examWeight : 50,
    topics: []
  };
  if (editingModuleIndex !== null && MODULES[editingModuleIndex]) {
    const existing = MODULES[editingModuleIndex];
    MODULES[editingModuleIndex] = Object.assign({}, existing, moduleData, { topics: existing.topics || [] });
  } else {
    MODULES.push(moduleData);
  }
  const targetIndex = editingModuleIndex !== null ? editingModuleIndex : MODULES.length - 1;
  if (editingModuleIndex !== null) {
    const blackboardUrl = (blackboardInput?.value || "").trim();
    const store = getStore();
    if (blackboardUrl) store.blackboard[targetIndex] = safeUrl(blackboardUrl);
    else delete store.blackboard[targetIndex];
    if (isColourCustomisableTheme() && colourInput?.value) {
      if (!store.moduleColors) store.moduleColors = {};
      const family = preferences.theme === "dark" ? "dark" : "light";
      const current = store.moduleColors[targetIndex] || {};
      store.moduleColors[targetIndex] = Object.assign({}, current, { [family]: normaliseHexColour(colourInput.value) });
    }
  }
  save();
  refreshActiveYear();
  buildModules();
  updateGlobal();
  closeModuleForm();
}

function shiftIndexedObjectAfterDelete(object, deletedIndex) {
  if (!object) return {};
  const shifted = {};
  Object.entries(object).forEach(([key, value]) => {
    const index = parseInt(key, 10);
    if (!Number.isFinite(index) || index === deletedIndex) return;
    shifted[index > deletedIndex ? index - 1 : index] = value;
  });
  return shifted;
}

function shiftTopicsAfterModuleDelete(topics, deletedIndex) {
  const shifted = {};
  Object.entries(topics || {}).forEach(([key, value]) => {
    const topicMatch = key.match(/^t_(\d+)_(\d+)$/);
    if (topicMatch) {
      const moduleIndex = parseInt(topicMatch[1], 10);
      const topicIndex = topicMatch[2];
      if (moduleIndex === deletedIndex) return;
      const nextModuleIndex = moduleIndex > deletedIndex ? moduleIndex - 1 : moduleIndex;
      shifted[`t_${nextModuleIndex}_${topicIndex}`] = value;
      return;
    }
    const subtopicMatch = key.match(/^s_(\d+)_(\d+)_(\d+)$/);
    if (!subtopicMatch) return;
    const moduleIndex = parseInt(subtopicMatch[1], 10);
    const topicIndex = subtopicMatch[2];
    const subIndex = subtopicMatch[3];
    if (moduleIndex === deletedIndex) return;
    const nextModuleIndex = moduleIndex > deletedIndex ? moduleIndex - 1 : moduleIndex;
    shifted[`s_${nextModuleIndex}_${topicIndex}_${subIndex}`] = value;
  });
  return shifted;
}

function addCourseworkComponent(mi, event) {
  if (event) event.stopPropagation();
  courseworkFormModuleIndex = mi;
  const nameInput = document.getElementById("cw-component-name-input");
  const markInput = document.getElementById("cw-component-mark-input");
  const weightInput = document.getElementById("cw-component-weight-input");
  const gradeScale = getGradeScaleConfig();
  if (nameInput) nameInput.value = "";
  if (markInput) {
    markInput.value = "";
    markInput.max = String(gradeScale.max);
    markInput.step = gradeScale.step;
    markInput.placeholder = gradeScale.placeholder;
  }
  if (weightInput) weightInput.value = "";
  const markLabel = document.querySelector('label[for="cw-component-mark-input"]');
  if (markLabel) markLabel.textContent = gradeScale.markLabel;
  document.getElementById("coursework-component-modal").classList.remove("hidden");
  setTimeout(() => nameInput && nameInput.focus(), 0);
}

function closeCourseworkComponentForm() {
  document.getElementById("coursework-component-modal").classList.add("hidden");
  courseworkFormModuleIndex = null;
}

function saveCourseworkComponentForm() {
  const mi = courseworkFormModuleIndex;
  if (mi === null || mi === undefined || !MODULES[mi]) return;
  const nameInput = document.getElementById("cw-component-name-input");
  const markInput = document.getElementById("cw-component-mark-input");
  const weightInput = document.getElementById("cw-component-weight-input");
  const input = (nameInput?.value || "").trim();
  if (!input) {
    alert("Please enter a coursework component name.");
    return;
  }

  const quotedComponents = [...input.matchAll(/"([^"]+)"/g)]
    .map(match => match[1].trim())
    .filter(Boolean);

  const namesToAdd = quotedComponents.length ? quotedComponents : [input];
  const mark = markInput?.value || "";
  const weight = weightInput?.value || "";
  const components = getCourseworkComponents(mi);

  namesToAdd.forEach((name) => {
    components.push({ name, mark, weight });
  });

  const calculated = calculateCourseworkFromComponents(mi);
  if (calculated.mark !== null) {
    getStore().coursework[mi] = formatGradeInputValue(calculated.mark);
  }

  save();
  buildModules();
  updateGlobal();
  closeCourseworkComponentForm();
}

function updateCourseworkComponent(mi, ci, field, value) {
  const components = getCourseworkComponents(mi);
  if (!components[ci]) return;
  components[ci][field] = value;
  const calculated = calculateCourseworkFromComponents(mi);
  if (calculated.mark !== null) {
    getStore().coursework[mi] = formatGradeInputValue(calculated.mark);
    const cwInput = document.getElementById(`cw-${mi}`);
    const compactCw = document.querySelector(`#topics-${mi} .compact-cw`);
    if (cwInput) cwInput.value = formatGradeInputValue(calculated.mark);
    if (compactCw) compactCw.value = formatGradeInputValue(calculated.mark);
  }
  save();
  updateModule(mi);
  updateGlobal();
  updateCourseworkSummary(mi);
}

function updateCourseworkSummary(mi) {
  const summary = document.getElementById(`cw-calc-summary-${mi}`);
  if (!summary) return;
  const calculated = calculateCourseworkFromComponents(mi);
  const manual = parseMark(getStore().coursework[mi]);

  if (calculated.mark !== null) {
    summary.textContent = `Calculated coursework: ${formatSelectedGrade(calculated.mark).main} - Components override manual coursework input`;
    return;
  }

  if (manual !== null) {
    summary.textContent = `Manual coursework override: ${formatSelectedGrade(manual).main}`;
    return;
  }

  summary.textContent = `Enter an overall coursework mark above, or let this calculator build it from your assessments.`;
}

function commitCourseworkPlaceholder(mi, event) {
  if (event) event.stopPropagation();
  const host = document.getElementById(`cw-components-${mi}`);
  if (!host) return;
  const name = host.querySelector(".cw-placeholder-name")?.value || "";
  const mark = host.querySelector(".cw-placeholder-mark")?.value || "";
  const weight = host.querySelector(".cw-placeholder-weight")?.value || "";
  if (!name.trim() && !mark && !weight) return;
  const items = getCourseworkComponents(mi);
  items.push({ name, mark, weight });
  getStore().courseworkComponents[mi] = items;
  const calculated = calculateCourseworkFromComponents(mi);
  if (calculated.mark !== null) getStore().coursework[mi] = formatGradeInputValue(calculated.mark);
  save();
  buildModules();
  updateGlobal();
}

function addBlankCourseworkComponent(mi, event) {
  if (event) event.stopPropagation();
  const items = getCourseworkComponents(mi);
  items.push({ name: "", mark: "", weight: "" });
  getStore().courseworkComponents[mi] = items;
  save();
  buildModules();
  updateGlobal();
}


function remapTopicStateForReorder(mi, fromIndex, toIndex) {
  const checked = getModuleTopicStateSnapshot(mi);
  const [moved] = checked.splice(fromIndex, 1);
  checked.splice(toIndex, 0, moved);
  applyModuleTopicStateSnapshot(mi, checked);
}

function moveTopicInModule(mi, fromIndex, toIndex, placement = "before") {
  const topics = MODULES[mi]?.topics;
  if (!topics || fromIndex < 0 || toIndex < 0 || fromIndex >= topics.length || toIndex >= topics.length) return;
  if (fromIndex === toIndex && placement === "before") return;
  const [moved] = topics.splice(fromIndex, 1);
  let insertIndex = toIndex;
  if (fromIndex < toIndex) insertIndex -= 1;
  if (placement === "after") insertIndex += 1;
  insertIndex = Math.max(0, Math.min(topics.length, insertIndex));
  topics.splice(insertIndex, 0, moved);
  remapTopicStateForReorder(mi, fromIndex, insertIndex);
  refreshTopicStructure(mi);
}

async function nestTopicUnderTopic(mi, sourceIndex, parentIndex) {
  const topics = MODULES[mi]?.topics;
  if (!topics || sourceIndex === parentIndex || sourceIndex < 0 || parentIndex < 0 || sourceIndex >= topics.length || parentIndex >= topics.length) return;
  const sourceTopic = getTopicEntry(mi, sourceIndex);
  if (sourceTopic.subtopics.length) {
    await showAppNotice("Drag a simpler topic", "Only plain topics can be nested right now. Move or clear that topic's own subtopics first.");
    return;
  }

  const stateSnapshot = getModuleTopicStateSnapshot(mi);
  const sourceState = stateSnapshot[sourceIndex];
  const [movedTopic] = topics.splice(sourceIndex, 1);
  stateSnapshot.splice(sourceIndex, 1);

  let nextParentIndex = parentIndex;
  if (sourceIndex < parentIndex) nextParentIndex -= 1;

  const parentTopic = getTopicEntry(mi, nextParentIndex);
  topics[nextParentIndex] = Object.assign({}, parentTopic, {
    subtopics: [...parentTopic.subtopics, movedTopic.title],
    collapsed: false
  });

  const parentState = stateSnapshot[nextParentIndex] || { main: false, subs: [] };
  parentState.subs = [...parentState.subs, !!sourceState?.main];
  parentState.main = parentState.main && parentState.subs.every(Boolean);
  stateSnapshot[nextParentIndex] = parentState;

  applyModuleTopicStateSnapshot(mi, stateSnapshot);
  refreshTopicStructure(mi);
}

function startTopicReorder(mi, ti, event, si = null) {
  draggedTopic = { kind: si === null ? "main" : "sub", mi, ti, si, startX: draggedTopicStartX || event.clientX || 0 };
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", `${mi}:${ti}:${si === null ? "main" : si}`);
}

function allowTopicDrop(mi, ti, event) {
  if (!draggedTopic || draggedTopic.mi !== mi) return;
  event.preventDefault();
  const indentDelta = (event.clientX || 0) - (draggedTopic.startX || 0);
  const rect = event.currentTarget.getBoundingClientRect();
  const dropAfter = (event.clientY || rect.top) > rect.top + (rect.height / 2);
  if (draggedTopic.kind === "sub") {
    document.querySelectorAll(".topic-row.drop-before, .topic-row.drop-after, .topic-row.drop-subtopic").forEach((row) => {
      if (row !== event.currentTarget) row.classList.remove("drop-before", "drop-after", "drop-subtopic");
    });
    event.currentTarget.classList.remove("reordering", "drop-before", "drop-after", "drop-subtopic");
    if (indentDelta > 34) event.currentTarget.classList.add("drop-subtopic");
    else event.currentTarget.classList.add(dropAfter ? "drop-after" : "drop-before");
    return;
  }
  const canNestBeforeTarget = indentDelta > 34 && !dropAfter && ti > 0;
  const canNestInPlace = indentDelta > 34 && draggedTopic.ti === ti && ti > 0;
  const canNestAfterParent = indentDelta > 34 && dropAfter && draggedTopic.ti !== ti;
  document.querySelectorAll(".topic-row.drop-before, .topic-row.drop-after, .topic-row.drop-subtopic").forEach((row) => {
    if (row !== event.currentTarget) row.classList.remove("drop-before", "drop-after", "drop-subtopic");
  });
  event.currentTarget.classList.remove("reordering", "drop-before", "drop-after", "drop-subtopic");
  if (canNestBeforeTarget || canNestInPlace || canNestAfterParent) {
    event.currentTarget.classList.add("drop-subtopic");
  } else {
    event.currentTarget.classList.add(dropAfter ? "drop-after" : "drop-before");
  }
}

function clearTopicDropState(event) {
  event.currentTarget.classList.remove("reordering", "drop-before", "drop-after", "drop-subtopic");
}

function dropTopicReorder(mi, ti, event) {
  event.preventDefault();
  topicDropSuppressUntil = Date.now() + 650;
  event.currentTarget.classList.remove("reordering", "drop-before", "drop-after", "drop-subtopic");
  if (!draggedTopic || draggedTopic.mi !== mi) return;
  const indentDelta = (event.clientX || 0) - (draggedTopic.startX || 0);
  const rect = event.currentTarget.getBoundingClientRect();
  const dropAfter = (event.clientY || rect.top) > rect.top + (rect.height / 2);
  if (draggedTopic.kind === "sub") {
    if (indentDelta > 34) moveSubtopicToParent(mi, draggedTopic.ti, draggedTopic.si, ti);
    else promoteSubtopicToMain(mi, draggedTopic.ti, draggedTopic.si, ti, dropAfter ? "after" : "before");
    draggedTopic = null;
    draggedTopicStartX = 0;
    return;
  }
  const canNestBeforeTarget = indentDelta > 34 && !dropAfter && ti > 0;
  const canNestInPlace = indentDelta > 34 && draggedTopic.ti === ti && ti > 0;
  const canNestAfterParent = indentDelta > 34 && dropAfter && draggedTopic.ti !== ti;
  if (canNestBeforeTarget || canNestInPlace || canNestAfterParent) {
    const parentIndex = canNestAfterParent ? ti : ti - 1;
    nestTopicUnderTopic(mi, draggedTopic.ti, parentIndex);
    draggedTopic = null;
    draggedTopicStartX = 0;
    return;
  }
  moveTopicInModule(mi, draggedTopic.ti, ti, dropAfter ? "after" : "before");
  draggedTopic = null;
  draggedTopicStartX = 0;
}

function endTopicReorder() {
  topicDropSuppressUntil = Math.max(topicDropSuppressUntil, Date.now() + 250);
  draggedTopic = null;
  draggedTopicStartX = 0;
  document.querySelectorAll(".topic-row.reordering, .topic-row.drop-before, .topic-row.drop-after, .topic-row.drop-subtopic").forEach((row) => row.classList.remove("reordering", "drop-before", "drop-after", "drop-subtopic"));
}

function allowSubtopicDrop(mi, parentTi, si, event) {
  if (!draggedTopic || draggedTopic.mi !== mi) return;
  if (draggedTopic.kind === "sub" && draggedTopic.ti === parentTi && draggedTopic.si === si) return;
  event.preventDefault();
  const rect = event.currentTarget.getBoundingClientRect();
  const dropAfter = (event.clientY || rect.top) > rect.top + (rect.height / 2);
  document.querySelectorAll(".topic-row.drop-before, .topic-row.drop-after, .topic-row.drop-subtopic").forEach((row) => {
    if (row !== event.currentTarget) row.classList.remove("drop-before", "drop-after", "drop-subtopic");
  });
  event.currentTarget.classList.remove("reordering", "drop-before", "drop-after", "drop-subtopic");
  if (draggedTopic.kind === "sub") {
    event.currentTarget.classList.add(dropAfter ? "drop-after" : "drop-before");
  }
}

function dropSubtopicReorder(mi, parentTi, si, event) {
  event.preventDefault();
  topicDropSuppressUntil = Date.now() + 650;
  event.currentTarget.classList.remove("reordering", "drop-before", "drop-after", "drop-subtopic");
  if (!draggedTopic || draggedTopic.mi !== mi) return;
  const rect = event.currentTarget.getBoundingClientRect();
  const dropAfter = (event.clientY || rect.top) > rect.top + (rect.height / 2);
  if (draggedTopic.kind === "sub") {
    moveSubtopicInModule(mi, draggedTopic.ti, draggedTopic.si, parentTi, si, dropAfter ? "after" : "before");
  }
  draggedTopic = null;
  draggedTopicStartX = 0;
}

/* 06-deadlines.js */
const DEADLINE_PRIORITY_COLOURS = {
  high: "#b84a3f",
  medium: "#b38a2f",
  low: "#4f7a53",
  default: "#8c8173"
};

function deadlinePriorityColour(deadline) {
  return DEADLINE_PRIORITY_COLOURS[deadline?.priority || "default"] || DEADLINE_PRIORITY_COLOURS.default;
}

function deadlinePriorityLabel(deadline) {
  const priority = deadline?.priority || "default";
  return priority === "default" ? "Default" : priority.charAt(0).toUpperCase() + priority.slice(1);
}

function deadlineModuleLabel(deadline) {
  if (Number.isInteger(deadline?.moduleIndex) && MODULES[deadline.moduleIndex]) {
    return MODULES[deadline.moduleIndex].kanji || MODULES[deadline.moduleIndex].short || MODULES[deadline.moduleIndex].name;
  }
  return "General";
}

function renderDeadlineModuleOptions(value = "") {
  const select = document.getElementById("deadline-module-input");
  if (!select) return;
  select.innerHTML = `<option value="">General</option>` + MODULES.map((mod, mi) => `<option value="${mi}">${escapeHtml(mod.kanji || mod.short || mod.name)}</option>`).join("");
  select.value = value === null || value === undefined ? "" : String(value);
}

function setDeadlinePriority(priority = "default") {
  const selected = DEADLINE_PRIORITY_COLOURS[priority] ? priority : "default";
  document.querySelectorAll("#deadline-priority-row .priority-choice").forEach((button) => {
    button.classList.toggle("active", button.dataset.priority === selected);
  });
}

function getSelectedDeadlinePriority() {
  return document.querySelector("#deadline-priority-row .priority-choice.active")?.dataset.priority || "default";
}

function setCalendarComposerPriority(priority = "default") {
  const selected = DEADLINE_PRIORITY_COLOURS[priority] ? priority : "default";
  document.querySelectorAll("#calendar-priority-row .priority-choice").forEach((button) => {
    button.classList.toggle("active", button.dataset.priority === selected);
  });
}

function getSelectedCalendarComposerPriority() {
  return document.querySelector("#calendar-priority-row .priority-choice.active")?.dataset.priority || "default";
}

function setDeadlineFormType(type = "date") {
  activeDeadlineFormType = type === "event" ? "event" : "date";
  const isEvent = activeDeadlineFormType === "event";
  document.getElementById("deadline-form-modal")?.classList.toggle("is-event-mode", isEvent);
  document.getElementById("deadline-calendar-fields")?.classList.toggle("deadline-field-hidden", !isEvent);
  document.getElementById("deadline-calendar-btn")?.classList.toggle("deadline-field-hidden", !isEvent);
  const pill = document.getElementById("deadline-form-type-pill");
  if (pill) pill.textContent = isEvent ? "Calendar Event" : "Tracked Date";
  const title = document.getElementById("deadline-form-title");
  if (title && editingDeadlineIndex === null) title.textContent = isEvent ? "Plan Calendar Event" : "Track a Date";
  const saveBtn = document.getElementById("deadline-save-btn");
  if (saveBtn && editingDeadlineIndex === null) saveBtn.textContent = isEvent ? "Save Event" : "Save Date";
  updateDeadlineFormMode();
}

function renderDeadlineAddChoice() {
  return `<div class="deadline-choice-grid deadline-view-shell">
    <button class="deadline-choice-card" type="button" onclick="openDeadlineForm(null, 'date')">
      <div class="deadline-choice-title">Track a Date</div>
      <div class="deadline-choice-copy">Quick tracked deadline with title, module, date, time, and priority.</div>
    </button>
    <button class="deadline-choice-card" type="button" onclick="openDeadlineForm(null, 'event')">
      <div class="deadline-choice-title">Plan Calendar Event</div>
      <div class="deadline-choice-copy">Calendar-ready entry with end time, location, and availability.</div>
    </button>
  </div>`;
}

function swapDeadlineView(render) {
  const host = document.getElementById("timeline-list");
  if (!host || typeof render !== "function") return;

  window.clearTimeout(host._deadlineSwitchTimer);
  host.getAnimations?.().forEach((animation) => animation.cancel());

  host.style.height = "";
  host.style.width = "";
  host.style.maxWidth = "";
  host.style.overflow = "";
  host.style.opacity = "";
  host.style.transform = "";
  host.classList.remove("is-switching");

  render();
}

function showDeadlineTab(tab = "upcoming") {
  activeDeadlineTab = tab === "add" ? "add" : "upcoming";
  document.getElementById("deadline-tab-upcoming")?.classList.toggle("active", activeDeadlineTab === "upcoming");
  document.getElementById("deadline-tab-add")?.classList.toggle("active", activeDeadlineTab === "add");
  if (activeDeadlineTab === "add") {
    swapDeadlineView(() => {
      const host = document.getElementById("timeline-list");
      if (host) host.innerHTML = renderDeadlineAddChoice();
    });
  } else {
    swapDeadlineView(() => renderDeadlineTimeline(true));
  }
}

function renderStickyExams() {
  const host = document.getElementById("live-exam-bar");
  if (!host) return;
  const store = getStore();
  const now = Date.now();
  const upcoming = (store.customExams || [])
    .map((exam, originalIndex) => ({ ...exam, originalIndex }))
    .filter((exam) => !exam.completed)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  host.innerHTML = "";
  upcoming.forEach((exam) => {
    const target = new Date(exam.date);
    const isUrgent = target.getTime() <= now;
    const card = document.createElement("div");
    card.className = "exam-ticker";
    card.dataset.deadlineIndex = String(exam.originalIndex);
    card.innerHTML = `
      <div class="ticker-mod">${escapeHtml(exam.mod)}</div>
      <div class="ticker-time ${isUrgent ? "urgent" : ""}">${formatCountdown(exam.date)}</div>
      <div class="ticker-date">${target.toLocaleString([], { dateStyle: "medium", timeStyle: exam.allDay ? undefined : "short" })}</div>
    `;
    card.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      removeExam(exam.originalIndex);
    });
    host.appendChild(card);
  });
  const button = document.createElement("button");
  button.className = "add-exam-btn";
  button.textContent = "+ Add Deadline";
  button.onclick = addExam;
  host.appendChild(button);
}

function addExam() {
  openDeadlineForm(null, "date");
}

function openDeadlineForm(index = null, type = "date") {
  editingDeadlineIndex = index;
  const titleInput = document.getElementById("deadline-title-input");
  const dateInput = document.getElementById("deadline-date-input");
  const timeInput = document.getElementById("deadline-time-input");
  const endDateInput = document.getElementById("deadline-end-date-input");
  const endTimeInput = document.getElementById("deadline-end-time-input");
  const allDayInput = document.getElementById("deadline-all-day-input");
  const availabilityInput = document.getElementById("deadline-availability-input");
  const locationInput = document.getElementById("deadline-location-input");
  const noteInput = document.getElementById("deadline-note-input");
  const title = document.getElementById("deadline-form-title");
  const saveBtn = document.getElementById("deadline-save-btn");
  const deadline = index !== null ? getStore().customExams[index] : null;
  const formType = deadline?.type || type || "date";

  renderDeadlineModuleOptions(deadline?.moduleIndex ?? "");

  if (deadline) {
    const date = new Date(deadline.date);
    const endDate = deadline.endDate ? new Date(deadline.endDate) : new Date(date.getTime() + 60 * 60 * 1000);
    titleInput.value = deadline.mod || "";
    dateInput.value = Number.isNaN(date.getTime()) ? "" : toDateInputValue(date);
    timeInput.value = Number.isNaN(date.getTime()) || deadline.allDay ? "" : toTimeInputValue(date);
    endDateInput.value = Number.isNaN(endDate.getTime()) ? "" : toDateInputValue(endDate);
    endTimeInput.value = Number.isNaN(endDate.getTime()) || deadline.allDay ? "" : toTimeInputValue(endDate);
    allDayInput.value = deadline.allDay ? "true" : "false";
    availabilityInput.value = deadline.availability || "BUSY";
    locationInput.value = deadline.location || "";
    noteInput.value = deadline.note || "";
    setDeadlinePriority(deadline.priority || "default");
    if (title) title.textContent = formType === "event" ? "Edit Calendar Event" : "Edit Date";
    if (saveBtn) saveBtn.textContent = "Save Changes";
  } else {
    titleInput.value = "";
    dateInput.value = "";
    timeInput.value = "";
    endDateInput.value = "";
    endTimeInput.value = "";
    allDayInput.value = "false";
    availabilityInput.value = "BUSY";
    locationInput.value = "";
    noteInput.value = "";
    setDeadlinePriority("default");
    if (title) title.textContent = formType === "event" ? "Plan Calendar Event" : "Track a Date";
    if (saveBtn) saveBtn.textContent = formType === "event" ? "Save Event" : "Save Date";
  }

  setDeadlineFormType(formType);
  document.getElementById("deadline-form-modal").classList.remove("hidden");
  lockPageScroll();
  setTimeout(() => titleInput && titleInput.focus(), 0);
}

function editDeadline(index) {
  openDeadlineForm(index);
}

function closeDeadlineForm() {
  document.getElementById("deadline-form-modal").classList.add("hidden");
  editingDeadlineIndex = null;
  unlockPageScroll();
}

function buildDeadlineFromForm() {
  const titleInput = document.getElementById("deadline-title-input");
  const dateInput = document.getElementById("deadline-date-input");
  const timeInput = document.getElementById("deadline-time-input");
  const endDateInput = document.getElementById("deadline-end-date-input");
  const endTimeInput = document.getElementById("deadline-end-time-input");
  const allDayInput = document.getElementById("deadline-all-day-input");
  const availabilityInput = document.getElementById("deadline-availability-input");
  const locationInput = document.getElementById("deadline-location-input");
  const noteInput = document.getElementById("deadline-note-input");
  const moduleInput = document.getElementById("deadline-module-input");
  const mod = titleInput.value.trim();
  const date = dateInput.value;
  const time = timeInput.value || "";
  const moduleValue = String(moduleInput?.value || "");
  const moduleIndex = moduleValue === "" ? null : Number(moduleValue);

  if (!mod) {
    alert("Please enter a deadline title.");
    return null;
  }
  if (!date) {
    alert("Please choose a start date.");
    return null;
  }

  if (activeDeadlineFormType !== "event") {
    const parsed = new Date(`${date}T${time || "09:00"}`);
    if (Number.isNaN(parsed.getTime())) {
      alert("Please enter a valid date and time.");
      return null;
    }
    return {
      type: "date",
      mod,
      date: toDeadlineStorageString(parsed),
      endDate: "",
      moduleIndex: Number.isInteger(moduleIndex) ? moduleIndex : null,
      priority: getSelectedDeadlinePriority(),
      allDay: false,
      availability: "BUSY",
      location: "",
      note: noteInput.value || "",
      completed: false
    };
  }

  const allDay = allDayInput.value === "true";
  const parsed = new Date(`${date}T${allDay ? "00:00" : (time || "09:00")}`);
  if (Number.isNaN(parsed.getTime())) {
    alert("Please enter a valid event start date and time.");
    return null;
  }

  const hasCustomEndDate = !!endDateInput.value;
  const hasCustomEndTime = !!endTimeInput.value;
  const calendarEndDate = endDateInput.value || date;
  const calendarEndTime = endTimeInput.value || "";
  let parsedEnd;
  if (allDay) {
    parsedEnd = new Date(new Date(`${calendarEndDate}T00:00`).getTime() + 24 * 60 * 60 * 1000);
  } else if (hasCustomEndDate || hasCustomEndTime) {
    parsedEnd = new Date(`${calendarEndDate}T${calendarEndTime || time || "09:00"}`);
    if (parsedEnd <= parsed && !hasCustomEndDate) parsedEnd = new Date(parsed.getTime() + 60 * 60 * 1000);
  } else {
    parsedEnd = new Date(parsed.getTime() + 60 * 60 * 1000);
  }

  if (Number.isNaN(parsedEnd.getTime()) || parsedEnd <= parsed) {
    alert("Please enter a valid calendar end time, or leave it blank to use a one-hour slot.");
    return null;
  }

  return {
    type: "event",
    mod,
    date: toDeadlineStorageString(parsed),
    endDate: toDeadlineStorageString(parsedEnd),
    moduleIndex: Number.isInteger(moduleIndex) ? moduleIndex : null,
    priority: getSelectedDeadlinePriority(),
    allDay,
    availability: availabilityInput.value || "BUSY",
    location: locationInput.value.trim(),
    note: noteInput.value || "",
    completed: false
  };
}

function updateDeadlineFormMode() {
  const allDay = document.getElementById("deadline-all-day-input")?.value === "true";
  const startTime = document.getElementById("deadline-time-input");
  const endTime = document.getElementById("deadline-end-time-input");
  if (startTime) startTime.disabled = allDay;
  if (endTime) endTime.disabled = allDay;
}

function getDeadlineCalendarDetails(deadline) {
  const profile = Object.assign({}, defaultProfile, state.profile || {});
  const parts = [];
  if (deadline.priority && deadline.priority !== "default") parts.push(`Priority: ${deadlinePriorityLabel(deadline)}`);
  if (deadline.note) parts.push(deadline.note.trim());
  if (profile.course) parts.push(`Course: ${profile.course}`);
  if (profile.university) parts.push(`University: ${profile.university}`);
  return parts.filter(Boolean).join("\n\n");
}

function formatCalendarStamp(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function formatCalendarDateOnly(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

function buildCalendarWindow(deadline) {
  const start = new Date(deadline.date);
  const storedEnd = deadline.endDate ? new Date(deadline.endDate) : null;
  const end = storedEnd && !Number.isNaN(storedEnd.getTime()) && storedEnd > start
    ? storedEnd
    : new Date(start.getTime() + 60 * 60 * 1000);
  return { start, end };
}

function downloadCalendarIcs(eventData) {
  const details = String(eventData.details || "").replace(/\n/g, "\\n");
  const safeTitle = String(eventData.title || "Calendar Event").replace(/\n/g, " ").replace(/,/g, "\\,").replace(/;/g, "\\;");
  const location = String(eventData.location || "").replace(/\n/g, " ").replace(/,/g, "\\,").replace(/;/g, "\\;");
  const content = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//UniTrack//Deadline Export//EN",
    "BEGIN:VEVENT",
    `UID:${Date.now()}-${Math.random().toString(16).slice(2)}@unitrack`,
    `DTSTAMP:${formatCalendarStamp(new Date())}`,
    eventData.allDay ? `DTSTART;VALUE=DATE:${formatCalendarDateOnly(eventData.start)}` : `DTSTART:${formatCalendarStamp(eventData.start)}`,
    eventData.allDay ? `DTEND;VALUE=DATE:${formatCalendarDateOnly(eventData.end)}` : `DTEND:${formatCalendarStamp(eventData.end)}`,
    `SUMMARY:${safeTitle}`,
    `DESCRIPTION:${details}`,
    ...(location ? [`LOCATION:${location}`] : []),
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${(eventData.title || "calendar-event").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "calendar-event"}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function navigateCalendarWindow(url) {
  const opened = window.open(url, "_blank", "noopener");
  if (!opened) window.location.href = url;
}

function openCalendarEvent(eventData) {
  if (!eventData?.start || !eventData?.end || !eventData?.title) return;
  const providerKey = preferences.calendarProvider || "google";
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  if (providerKey === "apple") {
    downloadCalendarIcs(eventData);
    return;
  }
  if (providerKey === "outlook") {
    const params = new URLSearchParams({
      subject: eventData.title,
      startdt: eventData.start.toISOString(),
      enddt: eventData.end.toISOString(),
      body: eventData.details || "",
      location: eventData.location || "",
      allday: eventData.allDay ? "true" : "false",
      ctz: timezone
    });
    navigateCalendarWindow(`https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`);
    return;
  }
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: eventData.title,
    dates: eventData.allDay
      ? `${formatCalendarDateOnly(eventData.start)}/${formatCalendarDateOnly(eventData.end)}`
      : `${formatCalendarStamp(eventData.start)}/${formatCalendarStamp(eventData.end)}`,
    details: eventData.details || "",
    location: eventData.location || "",
    crm: eventData.availability || "BUSY",
    ctz: timezone
  });
  navigateCalendarWindow(`https://calendar.google.com/calendar/render?${params.toString()}`);
}

function openDeadlineInCalendar(deadline) {
  if (!deadline?.date || !deadline?.mod) return;
  const start = new Date(deadline.date);
  const end = deadline.endDate ? new Date(deadline.endDate) : new Date(start.getTime() + 60 * 60 * 1000);
  openCalendarEvent({
    title: deadline.mod,
    start,
    end,
    allDay: !!deadline.allDay,
    location: deadline.location || "",
    details: getDeadlineCalendarDetails(deadline),
    availability: deadline.availability || "BUSY"
  });
}

function openDeadlineInCalendarByIndex(index, event) {
  if (event) event.stopPropagation();
  const deadline = getStore().customExams[index];
  if (!deadline) return;
  openDeadlineInCalendar(deadline);
}

function saveDeadlineForm(openCalendar = false) {
  const deadlineData = buildDeadlineFromForm();
  if (!deadlineData) return;
  if (openCalendar && deadlineData.type === "event") openDeadlineInCalendar(deadlineData);
  const store = getStore();
  if (editingDeadlineIndex !== null && store.customExams[editingDeadlineIndex]) {
    deadlineData.completed = !!store.customExams[editingDeadlineIndex].completed;
    store.customExams[editingDeadlineIndex] = deadlineData;
  } else {
    store.customExams.push(deadlineData);
  }

  save();
  renderStickyExams();
  closeDeadlineForm();
  showDeadlineTab("upcoming");
}


function setupDeadlineBarScrolling() {
  const bar = document.getElementById("live-exam-bar");
  if (!bar || bar.dataset.scrollReady) return;
  bar.dataset.scrollReady = "true";

  let isDown = false;
  let startX = 0;
  let startScrollLeft = 0;
  let moved = false;
  let pressedDeadlineIndex = null;

  bar.addEventListener("wheel", (event) => {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.preventDefault();
    bar.scrollLeft += event.deltaY;
  }, { passive: false });

  bar.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (event.target.closest("button")) return;
    isDown = true;
    moved = false;
    pressedDeadlineIndex = event.target.closest(".exam-ticker")?.dataset?.deadlineIndex ?? null;
    startX = event.clientX;
    startScrollLeft = bar.scrollLeft;
    bar.classList.add("dragging");
    bar.setPointerCapture(event.pointerId);
  });

  bar.addEventListener("pointermove", (event) => {
    if (!isDown) return;
    const dx = event.clientX - startX;
    if (Math.abs(dx) > 4) moved = true;
    bar.scrollLeft = startScrollLeft - dx;
  });

  function endDrag(event) {
    if (!isDown) return;
    const releasedCard = document.elementFromPoint(event.clientX, event.clientY)?.closest?.(".exam-ticker")
      || event.target.closest(".exam-ticker");
    const releasedDeadlineIndex = releasedCard?.dataset?.deadlineIndex ?? null;
    const shouldOpen = !moved && pressedDeadlineIndex !== null && pressedDeadlineIndex === releasedDeadlineIndex;
    isDown = false;
    bar.classList.remove("dragging");
    if (bar.hasPointerCapture(event.pointerId)) bar.releasePointerCapture(event.pointerId);
    if (shouldOpen) {
      const index = Number(releasedDeadlineIndex);
      if (Number.isFinite(index)) openDeadlineForm(index);
    }
    pressedDeadlineIndex = null;
  }

  bar.addEventListener("pointerup", endDrag);
  bar.addEventListener("pointercancel", endDrag);
  bar.addEventListener("click", (event) => {
    if (!moved) {
      if (event.target.closest(".exam-ticker")) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    moved = false;
  }, true);
}

function renderDeadlineTimeline(force = false) {
  const host = document.getElementById("timeline-list");
  if (!host) return;
  if (activeDeadlineTab === "add" && !force) {
    host.innerHTML = renderDeadlineAddChoice();
    return;
  }
  const store = getStore();
  const now = Date.now();
  const exams = (store.customExams || [])
    .map((exam, originalIndex) => ({ ...exam, originalIndex }))
    .filter((exam) => !exam.completed)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (!exams.length) {
    host.innerHTML = '<div class="timeline-empty deadline-view-shell">No deadlines yet. Use Add new to create one.</div>';
    return;
  }

  host.innerHTML = `<div class="deadline-view-shell">${exams.map((exam) => {
    const target = new Date(exam.date);
    const end = exam.endDate ? new Date(exam.endDate) : null;
    const isUrgent = target.getTime() <= now;
    const isEvent = exam.type === "event";
    const timeText = exam.allDay
      ? target.toLocaleDateString([], { dateStyle: "full" })
      : target.toLocaleString([], { dateStyle: "full", timeStyle: "short" });
    const rangeText = isEvent && end && !Number.isNaN(end.getTime())
      ? (exam.allDay
        ? `${target.toLocaleDateString([], { dateStyle: "medium" })} - ${end.toLocaleDateString([], { dateStyle: "medium" })}`
        : `${target.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} - ${end.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`)
      : timeText;
    const edgeColour = deadlinePriorityColour(exam);
    const statusLabel = isEvent ? "Calendar event" : `${deadlinePriorityLabel(exam)} priority`;
    const noteText = (exam.note || "").trim();
    return `
      <div class="timeline-item">
        <div class="timeline-rail">
          <button class="timeline-dot complete-toggle" type="button" onclick="toggleDeadlineComplete(${exam.originalIndex}, event)" title="Mark deadline complete" aria-label="Mark deadline complete"></button>
        </div>
        <div class="timeline-card deadline-card-clickable" style="--deadline-edge-colour: ${edgeColour};" onclick="editDeadline(${exam.originalIndex})">
          <div class="deadline-card-main">
            <div class="deadline-card-copy">
              <div class="deadline-card-title-line">
                <div class="timeline-title">${escapeHtml(exam.mod)}</div>
                <span class="deadline-status-pill">${escapeHtml(statusLabel)}</span>
              </div>
              <div class="deadline-meta-line">
                <span>${escapeHtml(timeText)}</span>
                <span>${escapeHtml(deadlineModuleLabel(exam))}</span>
                ${isEvent && exam.location ? `<span>${escapeHtml(exam.location)}</span>` : ""}
              </div>
              ${noteText ? `<div class="deadline-note-preview">${escapeHtml(noteText)}</div>` : ""}
            </div>
            <div class="deadline-card-countdown ${isUrgent ? "urgent" : ""}" data-deadline-countdown="${escapeHtml(exam.date)}">Due in ${escapeHtml(formatCountdown(exam.date))}</div>
          </div>
          <div class="deadline-card-lower">
            <details class="deadline-details" onclick="event.stopPropagation()">
              <summary>Details</summary>
              <div class="deadline-detail-grid">
                <div><span>When</span><strong>${escapeHtml(rangeText)}</strong></div>
                ${isEvent && exam.location ? `<div><span>Location</span><strong>${escapeHtml(exam.location)}</strong></div>` : ""}
                ${isEvent ? `<div><span>Show as</span><strong>${escapeHtml(exam.availability || "Busy")}</strong></div>` : ""}
                <div><span>Note</span><strong>${escapeHtml(noteText || "None added")}</strong></div>
              </div>
            </details>
            <div class="deadline-card-actions" onclick="event.stopPropagation()">
              <button class="mini-btn" type="button" onclick="editDeadline(${exam.originalIndex})">Edit</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join("")}</div>`;
}

function updateDeadlineNote(index, value) {
  const store = getStore();
  if (!store.customExams[index]) return;
  store.customExams[index].note = value;
  save();
}

function toggleDeadlineComplete(index, event) {
  if (event) event.stopPropagation();
  const store = getStore();
  if (!store.customExams[index]) return;
  const removeDeadline = () => {
    store.customExams.splice(index, 1);
    save();
    renderStickyExams();
    renderDeadlineTimeline();
  };
  const row = event?.target?.closest(".timeline-item");
  if (row) {
    row.classList.add("completing");
    setTimeout(removeDeadline, 280);
    return;
  }
  removeDeadline();
}

function openDeadlineTimeline() {
  document.getElementById("timeline-modal").classList.remove("hidden");
  activeDeadlineTab = "upcoming";
  document.getElementById("deadline-tab-upcoming")?.classList.add("active");
  document.getElementById("deadline-tab-add")?.classList.remove("active");
  renderDeadlineTimeline(true);
  if (deadlineTimelineInterval) clearInterval(deadlineTimelineInterval);
  deadlineTimelineInterval = setInterval(updateDeadlineCountdowns, 1000);
}

function updateDeadlineCountdowns() {
  document.querySelectorAll("[data-deadline-countdown]").forEach((node) => {
    const date = node.dataset.deadlineCountdown;
    node.textContent = node.classList.contains("deadline-card-countdown") ? `Due in ${formatCountdown(date)}` : formatCountdown(date);
    node.classList.toggle("urgent", new Date(date).getTime() <= Date.now());
  });
}

function closeDeadlineTimeline() {
  document.getElementById("timeline-modal").classList.add("hidden");
  if (deadlineTimelineInterval) {
    clearInterval(deadlineTimelineInterval);
    deadlineTimelineInterval = null;
  }
}

/* 07-todo.js */
function getTodoItems() {
  const store = getStore();
  if (!Array.isArray(store.todos)) store.todos = [];
  return store.todos;
}

function getTodoPanelState() {
  if (!state.ui) state.ui = {};
  if (!state.ui.todoPanel) {
    state.ui.todoPanel = {
      locked: false,
      top: null,
      left: null,
      width: 560,
      height: 520,
      compact: false,
      hasOpenedOnce: false
    };
  }
  return state.ui.todoPanel;
}

function applyTodoPanelState(forceCenter = false) {
  const panel = document.querySelector("#todo-modal .todo-content");
  if (!panel) return;
  const panelState = getTodoPanelState();
  const compact = !!panelState.compact;
  const items = getTodoItems();
  const maxWidth = window.innerWidth - 18;
  const maxHeight = Math.min(window.innerHeight - 18, 720);
  const width = Math.max(420, Math.min(panelState.width || 560, maxWidth));

  const compactHeight = 300 + Math.min(items.length || 1, 6) * 54;
  const expandedHeight = 310 + Math.min(items.length || 1, 4) * 118;
  const preferredHeight = compact ? compactHeight : Math.max(panelState.height || 0, Math.min(expandedHeight, 620));
  const minHeight = compact ? 340 : 430;
  const height = Math.max(minHeight, Math.min(preferredHeight, maxHeight));

  const savedLeft = Number.isFinite(panelState.left) ? panelState.left : null;
  const savedTop = Number.isFinite(panelState.top) ? panelState.top : null;
  const left = forceCenter || savedLeft === null ? Math.max(8, Math.round((window.innerWidth - width) / 2)) : Math.max(8, Math.min(savedLeft, window.innerWidth - width - 8));
  const top = forceCenter || savedTop === null ? Math.max(76, Math.round((window.innerHeight - height) / 2)) : Math.max(70, Math.min(savedTop, window.innerHeight - height - 8));

  panel.classList.toggle("is-locked", !!panelState.locked);
  document.getElementById("todo-modal")?.classList.toggle("todo-compact-mode", compact);
  panel.style.top = `${top}px`;
  panel.style.left = `${left}px`;
  panel.style.right = "auto";
  panel.style.width = `${width}px`;
  panel.style.height = `${height}px`;
  const lockBtn = document.getElementById("todo-lock-btn");
  if (lockBtn) lockBtn.textContent = panelState.locked ? "Unpin" : "Pin";
}

function persistTodoPanelRect() {
  const panel = document.querySelector("#todo-modal .todo-content");
  if (!panel) return;
  const panelState = getTodoPanelState();
  const rect = panel.getBoundingClientRect();
  panelState.top = Math.max(70, Math.round(rect.top));
  panelState.left = Math.max(8, Math.round(rect.left));
  panelState.width = Math.round(rect.width);
  panelState.height = Math.round(rect.height);
  save();
}

function trapTodoPanelWheel(event) {
  const panel = document.querySelector("#todo-modal .todo-content");
  if (!panel || !panel.contains(event.target)) return;
  const scrollable = event.target.closest(".todo-list, .todo-inline-note");
  if (!scrollable) {
    event.preventDefault();
    return;
  }
  const canScroll = scrollable.scrollHeight > scrollable.clientHeight;
  if (!canScroll) {
    event.preventDefault();
    return;
  }
  const goingDown = event.deltaY > 0;
  const atTop = scrollable.scrollTop <= 0;
  const atBottom = Math.ceil(scrollable.scrollTop + scrollable.clientHeight) >= scrollable.scrollHeight;
  if ((goingDown && atBottom) || (!goingDown && atTop)) event.preventDefault();
  event.stopPropagation();
}

function setupTodoPanelResizePersistence() {
  const panel = document.querySelector("#todo-modal .todo-content");
  if (!panel || panel.dataset.resizeReady) return;
  panel.dataset.resizeReady = "true";
  ["top", "right", "bottom", "left", "top-left", "top-right", "bottom-left", "bottom-right"].forEach((edge) => {
    const handle = document.createElement("div");
    handle.className = "todo-resize-handle";
    handle.dataset.edge = edge;
    handle.addEventListener("pointerdown", startTodoPanelResize);
    panel.appendChild(handle);
  });
  panel.addEventListener("mouseup", () => persistTodoPanelRect());
  panel.addEventListener("touchend", () => persistTodoPanelRect(), { passive: true });
  panel.addEventListener("wheel", trapTodoPanelWheel, { passive: false });
}

function toggleTodoPanelLock() {
  const panelState = getTodoPanelState();
  panelState.locked = !panelState.locked;
  applyTodoPanelState();
  save();
}

function startTodoPanelResize(event) {
  const panelState = getTodoPanelState();
  if (panelState.locked) return;
  const panel = document.querySelector("#todo-modal .todo-content");
  if (!panel) return;
  event.preventDefault();
  event.stopPropagation();
  const rect = panel.getBoundingClientRect();
  todoPanelResize = {
    pointerId: event.pointerId,
    edge: event.currentTarget.dataset.edge,
    startX: event.clientX,
    startY: event.clientY,
    startTop: rect.top,
    startLeft: rect.left,
    startWidth: rect.width,
    startHeight: rect.height
  };
  panel.setPointerCapture?.(event.pointerId);
}

function moveTodoPanelResize(event) {
  if (!todoPanelResize) return false;
  const panel = document.querySelector("#todo-modal .todo-content");
  if (!panel) return false;
  const minWidth = 380;
  const minHeight = 220;
  const maxWidth = window.innerWidth - 16;
  const maxHeight = window.innerHeight - 16;
  let left = todoPanelResize.startLeft;
  let top = todoPanelResize.startTop;
  let width = todoPanelResize.startWidth;
  let height = todoPanelResize.startHeight;
  const dx = event.clientX - todoPanelResize.startX;
  const dy = event.clientY - todoPanelResize.startY;
  const edge = todoPanelResize.edge || "";
  if (edge.includes("right")) width = todoPanelResize.startWidth + dx;
  if (edge.includes("bottom")) height = todoPanelResize.startHeight + dy;
  if (edge.includes("left")) {
    width = todoPanelResize.startWidth - dx;
    left = todoPanelResize.startLeft + dx;
  }
  if (edge.includes("top")) {
    height = todoPanelResize.startHeight - dy;
    top = todoPanelResize.startTop + dy;
  }
  width = Math.max(minWidth, Math.min(width, maxWidth));
  height = Math.max(minHeight, Math.min(height, maxHeight));
  left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
  top = Math.max(70, Math.min(top, window.innerHeight - height - 8));
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
  panel.style.width = `${width}px`;
  panel.style.height = `${height}px`;
  return true;
}

function endTodoPanelResize(event) {
  if (!todoPanelResize) return false;
  const panel = document.querySelector("#todo-modal .todo-content");
  if (panel && event?.pointerId !== undefined && panel.hasPointerCapture?.(event.pointerId)) {
    panel.releasePointerCapture(event.pointerId);
  }
  persistTodoPanelRect();
  todoPanelResize = null;
  return true;
}

function startTodoPanelDrag(event) {
  const panelState = getTodoPanelState();
  if (panelState.locked) return;
  if (event.target.closest("button, input, textarea, select, option, label")) return;
  if (!event.target.closest(".timeline-head")) return;
  const panel = document.querySelector("#todo-modal .todo-content");
  if (!panel) return;
  const rect = panel.getBoundingClientRect();
  todoPanelDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startTop: rect.top,
    startLeft: rect.left,
    width: rect.width
  };
  panel.style.left = `${rect.left}px`;
  panel.style.top = `${rect.top}px`;
  panel.style.right = "auto";
  panel.setPointerCapture?.(event.pointerId);
}

function moveTodoPanelDrag(event) {
  if (moveTodoPanelResize(event)) return;
  if (!todoPanelDrag) return;
  const panel = document.querySelector("#todo-modal .todo-content");
  if (!panel) return;
  const nextLeft = Math.max(8, Math.min(window.innerWidth - todoPanelDrag.width - 8, todoPanelDrag.startLeft + (event.clientX - todoPanelDrag.startX)));
  const nextTop = Math.max(70, todoPanelDrag.startTop + (event.clientY - todoPanelDrag.startY));
  panel.style.left = `${nextLeft}px`;
  panel.style.top = `${nextTop}px`;
}

function endTodoPanelDrag(event) {
  if (endTodoPanelResize(event)) return;
  if (!todoPanelDrag) return;
  const panel = document.querySelector("#todo-modal .todo-content");
  if (panel && event?.pointerId !== undefined && panel.hasPointerCapture?.(event.pointerId)) {
    panel.releasePointerCapture(event.pointerId);
  }
  const panelState = getTodoPanelState();
  const rect = panel.getBoundingClientRect();
  panelState.top = Math.max(70, Math.round(rect.top));
  panelState.left = Math.max(8, Math.round(rect.left));
  panelState.width = Math.round(rect.width);
  panelState.height = Math.round(rect.height);
  save();
  todoPanelDrag = null;
}

function toggleTodoCompactView() {
  const panelState = getTodoPanelState();
  panelState.compact = !panelState.compact;
  const items = getTodoItems();
  panelState.height = panelState.compact
    ? Math.min(window.innerHeight - 18, 300 + Math.min(items.length || 1, 6) * 54)
    : Math.min(window.innerHeight - 18, 310 + Math.min(items.length || 1, 4) * 118);
  save();
  renderTodoPlanner();
  applyTodoPanelState();
}

function renderTodoModuleOptions() {
  const select = document.getElementById("todo-module-input");
  if (!select) return;
  const currentValue = select.value;
  const options = [`<option value="">General Task</option>`]
    .concat(MODULES.map((mod, mi) => `<option value="${mi}">${escapeHtml(mod.kanji || mod.short || mod.name)}</option>`));
  select.innerHTML = options.join("");
  if (options.some((_, index) => String(index - 1) === currentValue) || currentValue === "") {
    select.value = currentValue;
  }
}

function getTodoSummaryText() {
  const todos = getTodoItems();
  const openCount = todos.filter((item) => !item.completed).length;
  const doneCount = todos.length - openCount;
  if (!todos.length) return "No tasks yet";
  return `${openCount} open - ${doneCount} done`;
}

function renderTodoPlanner() {
  const host = document.getElementById("todo-list");
  const summary = document.getElementById("todo-summary");
  const toggle = document.getElementById("todo-view-toggle");
  if (!host || !summary) return;
  const todos = getTodoItems();
  const compact = !!getTodoPanelState().compact;
  document.getElementById("todo-modal")?.classList.toggle("todo-compact-mode", compact);
  summary.textContent = getTodoSummaryText();
  if (toggle) toggle.textContent = compact ? "Expand" : "Simplify";
  if (!todos.length) {
    host.innerHTML = '<div class="timeline-empty todo-empty">No tasks yet. Add one from the top of this planner.</div>';
    applyTodoPanelState();
    return;
  }
  host.innerHTML = todos.map((item, index) => {
    const moduleLabel = escapeHtml(Number.isInteger(item.moduleIndex) && MODULES[item.moduleIndex] ? (MODULES[item.moduleIndex].kanji || MODULES[item.moduleIndex].short || MODULES[item.moduleIndex].name) : "General");
    const title = escapeHtml(item.title || "Untitled task");
    const doneClass = item.completed ? "is-done" : "";
    if (compact) {
      return `
        <div class="todo-task-row ${doneClass}" onclick="handleTodoCardClick(${index}, event)">
          <button class="todo-check-btn complete-toggle" type="button" onclick="toggleTodoComplete(${index}, event)" title="Mark task complete" aria-label="Mark task complete"></button>
          <div class="todo-row-main">
            <div class="todo-row-title" title="${title}">${title}</div>
            <div class="todo-row-meta">${moduleLabel}</div>
          </div>
          <button class="todo-delete-btn" type="button" onclick="deleteTodoItem(${index}, event)" title="Delete task" aria-label="Delete task">Delete</button>
        </div>
      `;
    }
    return `
      <div class="todo-expanded-card ${doneClass}" onclick="handleTodoCardClick(${index}, event)">
        <button class="todo-check-btn complete-toggle" type="button" onclick="toggleTodoComplete(${index}, event)" title="Mark task complete" aria-label="Mark task complete"></button>
        <div class="todo-expanded-main">
          <div class="todo-expanded-head">
            <div>
              <div class="todo-expanded-title">${title}</div>
              <div class="todo-badge">${moduleLabel}</div>
            </div>
            <button class="todo-delete-btn" type="button" onclick="deleteTodoItem(${index}, event)" title="Delete task" aria-label="Delete task">Delete</button>
          </div>
          <details class="todo-note-details">
            <summary>${item.note ? "View note" : "Add note"}</summary>
            <textarea class="timeline-notes todo-inline-note" data-todo-note-index="${index}" placeholder="Add context, next steps, or anything you need to remember...">${escapeHtml(item.note || "")}</textarea>
          </details>
        </div>
      </div>
    `;
  }).join("");
  host.querySelectorAll("[data-todo-note-index]").forEach((textarea) => {
    textarea.addEventListener("input", (event) => updateTodoNote(Number(event.target.dataset.todoNoteIndex), event.target.value));
  });
  applyTodoPanelState();
}

function saveTodoDraft() {
  const titleInput = document.getElementById("todo-title-input");
  const moduleInput = document.getElementById("todo-module-input");
  const title = String(titleInput?.value || "").trim();
  const note = "";
  if (!title) return;
  const moduleValue = String(moduleInput?.value || "").trim();
  const moduleIndex = moduleValue === "" ? null : Number(moduleValue);
  getTodoItems().unshift({ title, note, moduleIndex: Number.isInteger(moduleIndex) ? moduleIndex : null, completed: false, createdAt: new Date().toISOString() });
  if (titleInput) titleInput.value = "";
  if (moduleInput) moduleInput.value = "";
  save();
  renderTodoPlanner();
}

function handleTodoInputKeydown(event) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  saveTodoDraft();
}

function handleTodoCardClick(index, event) {
  const ignored = event?.target?.closest?.("button, textarea, input, select, option, summary, details, a, label");
  if (ignored) return;
  toggleTodoComplete(index, event);
}

function toggleTodoComplete(index, event) {
  if (event) event.stopPropagation();
  const todos = getTodoItems();
  if (!todos[index]) return;
  todos[index].completed = !todos[index].completed;
  save();
  renderTodoPlanner();
}

function updateTodoNote(index, value) {
  const todos = getTodoItems();
  if (!todos[index]) return;
  todos[index].note = value;
  save();
}

function deleteTodoItem(index, event) {
  if (event) event.stopPropagation();
  const todos = getTodoItems();
  if (!todos[index]) return;
  todos.splice(index, 1);
  save();
  renderTodoPlanner();
}

function openTodoPlanner() {
  const modal = document.getElementById("todo-modal");
  if (!modal) return;
  const panelState = getTodoPanelState();
  modal.classList.remove("hidden");
  renderTodoModuleOptions();
  setupTodoPanelResizePersistence();
  applyTodoPanelState(!panelState.hasOpenedOnce);
  panelState.hasOpenedOnce = true;
  save();
  renderTodoPlanner();
}

function closeTodoPlanner() {
  document.getElementById("todo-modal")?.classList.add("hidden");
  todoPanelDrag = null;
  todoPanelResize = null;
}

function toggleTodoPlanner() {
  const modal = document.getElementById("todo-modal");
  if (!modal) return;
  if (modal.classList.contains("hidden")) openTodoPlanner();
  else closeTodoPlanner();
}

/* 08-module-rendering.js */
function buildModules() {
  const container = document.getElementById("modules");
  container.innerHTML = "";
  const store = getStore();
  let renderedModules = 0;
  MODULES.forEach((mod, mi) => {
    if (!isModuleVisibleInActiveTerm(mi)) return;
    renderedModules += 1;
    const moduleColours = getModuleColourSet(mi);
    const gradeScale = getGradeScaleConfig();
    const gradingSystem = getGradingSystem();
    const gradeOptions = getGradeOptions(gradingSystem);
    const usesFinalGradeOnly = gradingSystem !== "uk";
    const usesUsGrades = ["us4", "us43"].includes(gradingSystem);
    const termLabel = getTermLabel(getModuleTerm(mi));
    const moduleMeta = gradingSystem === "uk"
      ? `${escapeHtml(mod.kanji)} · CW ${mod.cw === 0 ? "N/A" : escapeHtml(String(mod.cw ?? 0)) + "%"} · EXAMS ${mod.exam === 0 ? "N/A" : escapeHtml(String(mod.exam ?? 0)) + "%"}`
      : `${escapeHtml(mod.kanji)} · ${escapeHtml(String(mod.credits ?? 0))} ${escapeHtml(getCreditUnitLabel({ plural: Number(mod.credits) !== 1 }))}`;
    const moduleMetaWithTerm = gradingSystem === "uk"
      ? `${escapeHtml(mod.kanji)} &middot; ${escapeHtml(termLabel)} &middot; CW ${mod.cw === 0 ? "N/A" : escapeHtml(String(mod.cw ?? 0)) + "%"} &middot; EXAMS ${mod.exam === 0 ? "N/A" : escapeHtml(String(mod.exam ?? 0)) + "%"}`
      : `${escapeHtml(mod.kanji)} &middot; ${escapeHtml(termLabel)} &middot; ${escapeHtml(String(mod.credits ?? 0))} ${escapeHtml(getCreditUnitLabel({ plural: Number(mod.credits) !== 1 }))}`;
    const finalGradeControl = (id, className = "") => {
      if (gradeOptions && gradeScale.freeformGradeInput) {
        const listId = `${id}-options`;
        return `<input class="input ${className}" type="text" id="${id}" list="${listId}" placeholder="${gradeScale.placeholder}" value="${store.finalGrades?.[mi] ?? ""}">
          <datalist id="${listId}">
            ${gradeOptions.map((option) => `<option value="${escapeHtml(option.code)}">${escapeHtml(formatGradeOptionLabel(option, gradingSystem))}</option>`).join("")}
          </datalist>`;
      }
      if (gradeOptions) {
        return `<select class="nav-select ${className}" id="${id}">
          <option value="">Not graded yet</option>
          ${gradeOptions.map((option) => `<option value="${escapeHtml(option.code)}">${escapeHtml(formatGradeOptionLabel(option, gradingSystem))}</option>`).join("")}
        </select>`;
      }
      return `<input class="input ${className}" type="number" min="${gradeScale.min ?? 0}" max="${gradeScale.max}" step="${gradeScale.step}" id="${id}" placeholder="${gradeScale.placeholder}" value="${store.finalGrades?.[mi] ?? ""}">`;
    };
    const customisableTheme = isColourCustomisableTheme();
    const themeFamilyLabel = preferences.theme === "dark" ? "Dark theme colour" : "Light theme colour";
    const wrap = document.createElement("div");
    wrap.className = `module b${mi}`;
    wrap.style.setProperty("--module-accent", moduleColours.stripe);

    const moduleDeleteButton = document.createElement("button");
    moduleDeleteButton.className = "mini-btn module-delete-btn module-delete-corner";
    moduleDeleteButton.type = "button";
    moduleDeleteButton.textContent = "x";
    moduleDeleteButton.title = "Delete module";
    moduleDeleteButton.setAttribute("aria-label", "Delete module");
    moduleDeleteButton.addEventListener("click", (event) => deleteModuleFromCurrentYear(mi, event));

    const header = document.createElement("div");
    header.className = "module-header";
    header.innerHTML = `
      <div class="mod-stripe c${mi}"></div>
      <div class="module-summary">
        <div class="mod-name">${escapeHtml(mod.name)}</div>
        <div class="mod-kanji">${moduleMetaWithTerm}</div>
        <div class="module-links">
          <button class="bb-link" id="bb-link-${mi}" type="button" onclick="openBlackboardLink(${mi}, event)">Set Blackboard</button>
          <button class="formula-btn" id="formula-btn-${mi}" type="button" onclick="openFormulaLink(${mi}, event)">${escapeHtml(mod.kanji || mod.short || "Module")} Library</button>
        </div>
      </div>
      <div class="progress-section">
        <div class="prog-header">
          <span class="prog-done fc${mi}" id="mdone-${mi}">0</span>
          <span class="prog-pct" id="mpct-${mi}">0.0% complete</span>
        </div>
        <div class="prog-track"><div class="prog-fill f${mi}" id="mfill-${mi}"></div></div>
        <div class="prog-of">of ${getModuleTotal(mi)} topics</div>
      </div>
      <div class="inputs-grid ${usesFinalGradeOnly ? "single-grade-input" : ""}">
        ${usesFinalGradeOnly ? `
        <div class="field">
          <label>${gradeScale.finalLabel}</label>
          ${finalGradeControl(`final-grade-${mi}`)}
        </div>
        ` : `
        <div class="field">
          <label>${gradeScale.courseworkLabel}</label>
          <input class="input" type="number" min="0" max="${gradeScale.max}" step="${gradeScale.step}" id="cw-${mi}" placeholder="${gradeScale.placeholder}" value="${store.coursework[mi] ?? ""}">
        </div>
        <div class="field">
          <label>${gradeScale.examLabel}</label>
          <input class="input" type="number" min="0" max="${gradeScale.max}" step="${gradeScale.step}" id="exam-${mi}" placeholder="${gradeScale.placeholder}" value="${store.exams[mi] ?? ""}">
        </div>
        `}
      </div>
      <div class="final-col">
        <div class="final-mark" id="mfinal-${mi}">-</div>
        <div id="mcls-${mi}" class="final-cls"></div>
      </div>
      <div class="module-actions"></div>
      <div class="chevron" id="chev-${mi}" aria-hidden="true"></div>
    `;

    const stripeEl = header.querySelector(".mod-stripe");
    const progDoneEl = header.querySelector(".prog-done");
    const progFillEl = header.querySelector(".prog-fill");
    if (stripeEl) stripeEl.style.background = moduleColours.stripe;
    if (progDoneEl) progDoneEl.style.color = moduleColours.text;
    if (progFillEl) progFillEl.style.background = moduleColours.fill;

    const list = document.createElement("div");
    list.className = "topic-list";
    list.id = `topics-${mi}`;

    const moduleEditTools = document.createElement("div");
    moduleEditTools.className = "module-edit-tools";
    moduleEditTools.innerHTML = `
      <div class="module-edit-primary">
        <button class="bb-edit-btn weight-edit-btn" type="button" onclick="editModuleWeights(${mi}, event)">Module Options</button>
      </div>
      <div class="module-edit-secondary">
        ${usesUsGrades ? `<label class="module-major-toggle"><input type="checkbox" id="major-module-${mi}" ${store.majorModules?.[mi] ? "checked" : ""}> Major / Program GPA</label>` : ""}
        <button class="bb-edit-btn" type="button" onclick="clearModuleMarks(${mi}, event)">Clear Marks</button>
      </div>
    `;
    list.appendChild(moduleEditTools);

    if (!usesFinalGradeOnly && mod.cw > 0) {
      const courseworkSection = createModuleSection(mi, "coursework", "Assessments", "");
      const courseworkWrap = courseworkSection.body;
      const components = getCourseworkComponents(mi);
      courseworkWrap.innerHTML = `
        <div class="coursework-calc-wrap">
          <div class="coursework-calc-head">
            <div class="coursework-calc-title">Assessment Breakdown</div>
            <button class="mini-btn" type="button" onclick="addBlankCourseworkComponent(${mi}, event)">Add Row</button>
          </div>
          <div class="coursework-calc-summary" id="cw-calc-summary-${mi}"></div>
          <div id="cw-components-${mi}"></div>
        </div>
      `;
      const componentsHost = courseworkWrap.querySelector(`#cw-components-${mi}`);
      if (!components.length) {
        componentsHost.innerHTML = `
          <div class="coursework-empty">Add each assessment below, or type your overall coursework mark in the main coursework box above.</div>
        `;
      } else {
        components.forEach((component, ci) => {
          const componentRow = document.createElement("div");
          componentRow.className = "coursework-component-row";
          componentRow.innerHTML = `
            <div class="field">
              <label>Component</label>
              <input class="input cw-comp-name" value="${escapeHtml(component.name || "")}" placeholder="Coursework name">
            </div>
            <div class="field">
              <label>${gradeScale.markLabel}</label>
              <input class="input cw-comp-mark" type="number" min="0" max="${gradeScale.max}" step="${gradeScale.step}" value="${component.mark ?? ""}" placeholder="${gradeScale.placeholder}">
            </div>
            <div class="field">
              <label>Weight %</label>
              <input class="input cw-comp-weight" type="number" min="0" max="100" step="0.1" value="${component.weight ?? ""}" placeholder="Auto">
            </div>
            <button class="mini-btn coursework-component-delete" type="button">Delete</button>
          `;
          componentRow.querySelector(".cw-comp-name").addEventListener("input", (event) => updateCourseworkComponent(mi, ci, "name", event.target.value));
          componentRow.querySelector(".cw-comp-mark").addEventListener("input", (event) => updateCourseworkComponent(mi, ci, "mark", event.target.value));
          componentRow.querySelector(".cw-comp-weight").addEventListener("input", (event) => updateCourseworkComponent(mi, ci, "weight", event.target.value));
          componentRow.querySelector(".coursework-component-delete").addEventListener("click", (event) => deleteCourseworkComponent(mi, ci, event));
          componentsHost.appendChild(componentRow);
        });
      }
      list.appendChild(courseworkSection.wrap);
    }

    const compactMarksWrap = document.createElement("div");
    compactMarksWrap.className = "notes-area-wrap compact-marks-wrap";
    compactMarksWrap.innerHTML = `
      <div class="topic-tools">
        <div class="topic-tools-title">Marks</div>
      </div>
      <div class="inputs-grid">
        ${usesFinalGradeOnly ? `
        <div class="field">
          <label>${gradeScale.finalLabel}</label>
          ${finalGradeControl(`compact-final-grade-${mi}`, "compact-final-grade")}
        </div>
        ` : `
        <div class="field">
          <label>${gradeScale.courseworkLabel}</label>
          <input class="input compact-cw" type="number" min="0" max="${gradeScale.max}" step="${gradeScale.step}" placeholder="${gradeScale.placeholder}" value="${store.coursework[mi] ?? ""}">
        </div>
        <div class="field">
          <label>${gradeScale.examLabel}</label>
          <input class="input compact-ex" type="number" min="0" max="${gradeScale.max}" step="${gradeScale.step}" placeholder="${gradeScale.placeholder}" value="${store.exams[mi] ?? ""}">
        </div>
        `}
      </div>
    `;
    list.appendChild(compactMarksWrap);

    const notesSection = createModuleSection(mi, "notes", "Notes", "");
    const notesWrap = notesSection.body;
    const notes = document.createElement("textarea");
    notes.className = "notes-area";
    notes.rows = 2;
    notes.placeholder = `Notes, mnemonics, thoughts on ${mod.short}...`;
    notes.value = store.notes[mi] || "";
    notes.addEventListener("input", () => {
      store.notes[mi] = notes.value;
      save();
    });
    notes.addEventListener("click", (event) => event.stopPropagation());
    notesWrap.appendChild(notes);
    list.appendChild(notesSection.wrap);


    const topicsSection = createModuleSection(mi, "topics", "Topics", "");
    const topicTools = document.createElement("div");
    topicTools.className = "notes-area-wrap";
    topicTools.innerHTML = `
      <div class="topic-entry-row">
        <input class="input" id="topic-add-${mi}" placeholder='Add one topic, or "Topic 1" "Topic 2"'>
        <button class="mini-btn" type="button" onclick="addTopicToModule(${mi}, event)">Add Topic</button>
      </div>
      <div class="topic-entry-help">Use quotes for several topics. Click a row to select it, shift-click to select a range, double-click to rename, and drag the row into the gap under a topic then move right to nest it.</div>
    `;
    topicsSection.body.appendChild(topicTools);
    list.appendChild(topicsSection.wrap);
    const topicAddInput = topicTools.querySelector(`#topic-add-${mi}`);
    if (topicAddInput) {
      topicAddInput.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        addTopicToModule(mi, event);
      });
    }

    mod.topics.forEach((topicValue, ti) => {
      const topic = getTopicEntry(mi, ti);
      const row = document.createElement("div");
      row.className = "topic-row" + (isTopicSelected(mi, ti) ? " selected" : "");
      row.draggable = true;
      row.dataset.topicKey = topicSelectionKey(mi, ti);
      const prefix = document.createElement("span");
      prefix.className = "topic-prefix";
      const main = document.createElement("div");
      main.className = "topic-main";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = !!store.topics[topicKey(mi, ti)];
      const label = document.createElement("span");
      label.className = "topic-label" + (checkbox.checked ? " done" : "");
      label.textContent = topic.title;
      checkbox.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();

        isDraggingTopics = true;
        dragTopicValue = !checkbox.checked;

        setTopicCheckbox(checkbox, mi, ti, dragTopicValue);
      });

      checkbox.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });

      main.addEventListener("mouseenter", () => {
        if (!isDraggingTopics) return;
        setTopicCheckbox(checkbox, mi, ti, dragTopicValue);
      });
      row.addEventListener("pointerdown", (event) => {
        if (event.target.closest("button") || event.target.closest("input") || event.target.closest("details") || event.target.closest("summary")) return;
        draggedTopicStartX = event.clientX || 0;
      });
      row.addEventListener("click", (event) => {
        if (Date.now() < topicDropSuppressUntil) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation?.();
          return;
        }
        if (event.target.closest("button") || event.target.closest("input") || event.target.closest("details") || event.target.closest("summary")) return;
        event.preventDefault();
        event.stopPropagation();
        selectTopicRow(mi, ti, null, event);
      });
      row.addEventListener("dblclick", (event) => {
        if (Date.now() < topicDropSuppressUntil) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation?.();
          return;
        }
        if (event.target.closest("button") || event.target.closest("input") || event.target.closest("details") || event.target.closest("summary")) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        topicDropSuppressUntil = Date.now() + 450;
        editTopicInModule(mi, ti, event);
      });
      row.addEventListener("dragover", (event) => allowTopicDrop(mi, ti, event));
      row.addEventListener("dragleave", clearTopicDropState);
      row.addEventListener("drop", (event) => dropTopicReorder(mi, ti, event));
      row.addEventListener("dragstart", (event) => {
        if (event.target.closest("button") || event.target.closest("input") || event.target.closest("textarea") || event.target.closest("summary")) {
          event.preventDefault();
          return;
        }
        const currentKey = topicSelectionKey(mi, ti);
        if (selectedTopicKeys.size > 1 || !selectedTopicKeys.has(currentKey)) {
          selectOnlyTopicKey(currentKey);
        }
        row.classList.add("reordering");
        startTopicReorder(mi, ti, event);
      });
      row.addEventListener("dragend", () => {
        row.classList.remove("reordering");
        endTopicReorder();
      });
      const toggleSubtopicsButton = document.createElement("button");
      row.title = "Drag to reorder. Move right in the gap below a topic to nest under it.";
      if (topic.subtopics.length) {
        toggleSubtopicsButton.type = "button";
        toggleSubtopicsButton.className = "subtopic-toggle topic-disclosure";
        toggleSubtopicsButton.classList.toggle("collapsed", !!topic.collapsed);
        toggleSubtopicsButton.setAttribute("aria-label", topic.collapsed ? "Expand subtopics" : "Collapse subtopics");
        toggleSubtopicsButton.title = topic.collapsed ? "Expand subtopics" : "Collapse subtopics";
        toggleSubtopicsButton.addEventListener("click", (event) => toggleTopicSubtopics(mi, ti, event));
        prefix.appendChild(toggleSubtopicsButton);
      }
      row.appendChild(prefix);
      main.appendChild(checkbox);
      main.appendChild(label);
      row.appendChild(main);
      topicsSection.body.appendChild(row);

      if (topic.subtopics.length) {
        const subtopicList = document.createElement("div");
        subtopicList.className = "subtopic-list" + (topic.collapsed ? " hidden" : "");
        topic.subtopics.forEach((subtopic, si) => {
          const subRow = document.createElement("div");
          subRow.className = "topic-row subtopic-row" + (isTopicSelected(mi, ti, si) ? " selected" : "");
          subRow.dataset.topicKey = topicSelectionKey(mi, ti, si);
          subRow.draggable = true;
          const subMain = document.createElement("div");
          subMain.className = "topic-main";
          const subCheckbox = document.createElement("input");
          subCheckbox.type = "checkbox";
          subCheckbox.checked = !!store.topics[subtopicKey(mi, ti, si)];
          const subLabel = document.createElement("span");
          subLabel.className = "topic-label" + (subCheckbox.checked ? " done" : "");
          subLabel.textContent = subtopic;
          subCheckbox.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
          });
          subRow.addEventListener("click", (event) => {
            if (Date.now() < topicDropSuppressUntil) {
              event.preventDefault();
              event.stopPropagation();
              event.stopImmediatePropagation?.();
              return;
            }
            if (event.target.closest("button") || event.target.closest("input")) return;
            event.preventDefault();
            event.stopPropagation();
            selectTopicRow(mi, ti, si, event);
          });
          subRow.addEventListener("dblclick", (event) => {
            if (Date.now() < topicDropSuppressUntil) {
              event.preventDefault();
              event.stopPropagation();
              event.stopImmediatePropagation?.();
              return;
            }
            if (event.target.closest("button") || event.target.closest("input")) return;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();
            topicDropSuppressUntil = Date.now() + 450;
            editSubtopicInModule(mi, ti, si, event);
          });
          subRow.addEventListener("pointerdown", (event) => {
            if (event.target.closest("button") || event.target.closest("input")) return;
            draggedTopicStartX = event.clientX || 0;
          });
          subRow.addEventListener("dragover", (event) => allowSubtopicDrop(mi, ti, si, event));
          subRow.addEventListener("dragleave", clearTopicDropState);
          subRow.addEventListener("drop", (event) => dropSubtopicReorder(mi, ti, si, event));
          subRow.addEventListener("dragstart", (event) => {
            if (event.target.closest("button") || event.target.closest("input") || event.target.closest("textarea")) {
              event.preventDefault();
              return;
            }
            const currentKey = topicSelectionKey(mi, ti, si);
            if (selectedTopicKeys.size > 1 || !selectedTopicKeys.has(currentKey)) {
              selectOnlyTopicKey(currentKey);
            }
            subRow.classList.add("reordering");
            startTopicReorder(mi, ti, event, si);
          });
          subRow.addEventListener("dragend", () => {
            subRow.classList.remove("reordering");
            endTopicReorder();
          });
          subCheckbox.addEventListener("mousedown", (event) => {
            event.preventDefault();
            event.stopPropagation();
            setSubtopicCheckbox(mi, ti, si, !subCheckbox.checked);
          });
          subMain.appendChild(subCheckbox);
          subMain.appendChild(subLabel);
          subRow.appendChild(subMain);
          subtopicList.appendChild(subRow);
        });
        topicsSection.body.appendChild(subtopicList);
      }
    });

    if (openModules.has(mi)) {
      list.classList.add("open");
      header.querySelector(`#chev-${mi}`)?.classList?.add("open");
    }

    header.addEventListener("click", (event) => {
      if (event.target.closest("button") || event.target.closest("input") || event.target.closest("select") || event.target.closest("textarea") || event.target.closest("a")) return;
      const open = list.classList.toggle("open");
      document.getElementById(`chev-${mi}`).classList.toggle("open", open);
      if (open) openModules.add(mi);
      else openModules.delete(mi);
    });

    wrap.appendChild(moduleDeleteButton);
    wrap.appendChild(header);
    wrap.appendChild(list);
    container.appendChild(wrap);

    const cwInput = document.getElementById(`cw-${mi}`);
    const exInput = document.getElementById(`exam-${mi}`);
    const finalGradeInput = document.getElementById(`final-grade-${mi}`);
    const compactCw = compactMarksWrap.querySelector(".compact-cw");
    const compactEx = compactMarksWrap.querySelector(".compact-ex");
    const compactFinalGrade = compactMarksWrap.querySelector(".compact-final-grade");
    if (finalGradeInput && gradeOptions) finalGradeInput.value = store.finalGrades?.[mi] ?? "";
    if (compactFinalGrade && gradeOptions) compactFinalGrade.value = store.finalGrades?.[mi] ?? "";
    const majorToggle = document.getElementById(`major-module-${mi}`);
    majorToggle?.addEventListener("click", (event) => event.stopPropagation());
    majorToggle?.addEventListener("change", (event) => {
      if (!store.majorModules) store.majorModules = {};
      store.majorModules[mi] = !!event.target.checked;
      save();
      updateDashboard();
    });
    cwInput?.addEventListener("click", (event) => event.stopPropagation());
    exInput?.addEventListener("click", (event) => event.stopPropagation());
    finalGradeInput?.addEventListener("click", (event) => event.stopPropagation());
    compactCw?.addEventListener("click", (event) => event.stopPropagation());
    compactEx?.addEventListener("click", (event) => event.stopPropagation());
    compactFinalGrade?.addEventListener("click", (event) => event.stopPropagation());

    const syncMarks = () => {
      if (cwInput) cwInput.value = store.coursework[mi] ?? "";
      if (exInput) exInput.value = store.exams[mi] ?? "";
      if (compactCw) compactCw.value = store.coursework[mi] ?? "";
      if (compactEx) compactEx.value = store.exams[mi] ?? "";
      if (finalGradeInput) finalGradeInput.value = store.finalGrades?.[mi] ?? "";
      if (compactFinalGrade) compactFinalGrade.value = store.finalGrades?.[mi] ?? "";
    };

    const handleCwChange = (value) => {
      store.coursework[mi] = value;
      save();
      updateModule(mi);
      updateGlobal();
    };
    const handleExChange = (value) => {
      store.exams[mi] = value;
      save();
      updateModule(mi);
      updateGlobal();
    };
    const handleFinalGradeChange = (value) => {
      if (!store.finalGrades) store.finalGrades = {};
      store.finalGrades[mi] = value;
      save();
      updateModule(mi);
      updateGlobal();
    };
    const clampAndSyncMark = (key, input) => {
      if (!input) return;
      if (key === "cw") store.coursework[mi] = clampGradeInputValue(input.value);
      if (key === "exam") store.exams[mi] = clampGradeInputValue(input.value);
      if (key === "final") {
        if (!store.finalGrades) store.finalGrades = {};
        store.finalGrades[mi] = clampGradeInputValue(input.value);
      }
      save();
      syncMarks();
      updateModule(mi);
      updateGlobal();
    };

    cwInput?.addEventListener("input", (event) => {
      handleCwChange(event.target.value);
    });
    exInput?.addEventListener("input", (event) => {
      handleExChange(event.target.value);
    });
    const finalGradeEvent = gradeOptions && !gradeScale.freeformGradeInput ? "change" : "input";
    finalGradeInput?.addEventListener(finalGradeEvent, (event) => {
      handleFinalGradeChange(event.target.value);
    });
    compactCw?.addEventListener("input", (event) => {
      handleCwChange(event.target.value);
    });
    compactEx?.addEventListener("input", (event) => {
      handleExChange(event.target.value);
    });
    compactFinalGrade?.addEventListener(finalGradeEvent, (event) => {
      handleFinalGradeChange(event.target.value);
    });
    cwInput?.addEventListener("blur", () => clampAndSyncMark("cw", cwInput));
    compactCw?.addEventListener("blur", () => clampAndSyncMark("cw", compactCw));
    exInput?.addEventListener("blur", () => clampAndSyncMark("exam", exInput));
    compactEx?.addEventListener("blur", () => clampAndSyncMark("exam", compactEx));
    finalGradeInput?.addEventListener("blur", () => clampAndSyncMark("final", finalGradeInput));
    compactFinalGrade?.addEventListener("blur", () => clampAndSyncMark("final", compactFinalGrade));

    syncMarks();
    updateModule(mi);
    updateBlackboardButton(mi);
    updateFormulaButton(mi);
    renderRelevantLinks(mi);
    updateCourseworkSummary(mi);
  });
  if (!renderedModules) {
    const term = getActiveTermFilter();
    container.innerHTML = `<div class="module-empty-state">${term === "all" ? "No modules yet." : `No modules in ${escapeHtml(getTermLabel(term))} yet.`}</div>`;
  }
}

window.addEventListener("resize", () => {
  if (!document.getElementById("dashboard-modal").classList.contains("hidden")) renderDashboardChart();
});

document.addEventListener("click", (event) => {
  const panel = document.getElementById("prefs-panel");
  if (!panel || panel.classList.contains("hidden")) return;
  if (event.target.closest("#prefs-panel") || event.target.closest('button[onclick="togglePreferences()"]')) return;
  panel.classList.add("hidden");
});

document.addEventListener("mouseup", stopTopicDrag);

/* 09-auth-cloud.js */
function isRecoveryFlow() {
  return recoveryModeActive || window.location.hash.includes("type=recovery") || window.location.search.includes("type=recovery");
}

function clearRecoveryUrl() {
  if (!isRecoveryFlow()) return;
  const cleanUrl = window.location.pathname + window.location.search.replace(/([?&])type=recovery(&)?/, (match, prefix, suffix) => {
    if (prefix === "?" && suffix) return "?";
    if (prefix === "?" && !suffix) return "";
    return suffix ? prefix : "";
  });
  history.replaceState({}, document.title, cleanUrl);
}

function getAuthInputValue(name) {
  const gateInput = document.getElementById(`auth-gate-${name}`);
  if (gateInput) return name.includes("password") ? gateInput.value : gateInput.value.trim();
  const modalInput = document.getElementById(`auth-${name}`);
  if (modalInput) return name.includes("password") ? modalInput.value : modalInput.value.trim();
  return "";
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function validateAuthEmail(email) {
  if (!email) return "Enter your email first.";
  if (email.length > 254) return "Email address is too long.";
  if (!isValidEmail(email)) return "Enter a valid email address.";
  return "";
}

function validateAuthPassword(password, label = "Password") {
  if (!password) return `Enter your ${label.toLowerCase()}.`;
  if (password.length < 6) return `${label} must be at least 6 characters.`;
  if (password.length > 128) return `${label} must be 128 characters or fewer.`;
  return "";
}

function setAuthMessage(message = "", tone = "error") {
  authStatusMessage = message || "";
  authStatusTone = tone;
  const gateFeedback = document.getElementById("auth-gate-feedback");
  if (gateFeedback) {
    gateFeedback.className = tone === "success" ? "auth-success" : "auth-error";
    gateFeedback.textContent = authStatusMessage;
  }
  const modalError = document.getElementById("auth-error");
  if (modalError) modalError.textContent = tone === "error" ? authStatusMessage : "";
}

function clearAuthMessage() {
  authStatusMessage = "";
  authStatusTone = "error";
  setAuthMessage("");
}

async function waitForInitialAuth() {
  if (!supabaseClient) {
    markAuthStateKnown();
    return;
  }

  try {
    const { data } = await supabaseClient.auth.getSession();
    currentSession = data?.session || null;
    currentUser = data?.session?.user || null;
  } catch (error) {
    currentSession = null;
    currentUser = null;
    console.warn("Initial auth check failed:", error?.message || error);
  }

  markAuthStateKnown();
}

function getOnboardingSeenKey() {
  return currentUser ? `unitrack_onboarding_seen_${currentUser.id}` : null;
}

function hasSeenOnboarding() {
  const key = getOnboardingSeenKey();
  return key ? localStorage.getItem(key) === "1" : false;
}

function markOnboardingSeen() {
  const key = getOnboardingSeenKey();
  if (key) localStorage.setItem(key, "1");
}

function shouldShowOnboarding() {
  return !!currentUser && pendingFirstRunSetup && !hasSeenOnboarding();
}

function renderOnboardingStep() {
  const step = ONBOARDING_STEPS[onboardingStepIndex] || ONBOARDING_STEPS[0];
  const stepsHost = document.getElementById("onboarding-steps");
  const kicker = document.getElementById("onboarding-kicker");
  const title = document.getElementById("onboarding-step-title");
  const copy = document.getElementById("onboarding-step-copy");
  const preview = document.getElementById("onboarding-preview");
  const progress = document.getElementById("onboarding-progress");
  const backBtn = document.getElementById("onboarding-back-btn");
  const nextBtn = document.getElementById("onboarding-next-btn");

  if (stepsHost) {
    stepsHost.innerHTML = ONBOARDING_STEPS.map((item, index) => `
      <button class="onboarding-step-tab ${index === onboardingStepIndex ? "active" : ""}" type="button" onclick="setOnboardingStep(${index})">
        <span>${index + 1}</span>
        ${escapeHtml(item.label)}
      </button>
    `).join("");
  }
  if (kicker) kicker.textContent = `Step ${onboardingStepIndex + 1}`;
  if (title) title.textContent = step.title;
  if (copy) copy.textContent = step.copy;
  if (preview) {
    preview.innerHTML = step.preview.map((item) => `
      <div class="onboarding-preview-row">
        <span class="onboarding-dot"></span>
        <span>${escapeHtml(item)}</span>
      </div>
    `).join("");
  }
  if (progress) progress.textContent = `${onboardingStepIndex + 1} / ${ONBOARDING_STEPS.length}`;
  if (backBtn) backBtn.disabled = onboardingStepIndex === 0;
  if (nextBtn) nextBtn.textContent = onboardingStepIndex === ONBOARDING_STEPS.length - 1 ? "Let's Start" : "Next";
}

function setOnboardingStep(index) {
  onboardingStepIndex = Math.max(0, Math.min(ONBOARDING_STEPS.length - 1, index));
  renderOnboardingStep();
}

function nextOnboardingStep() {
  if (onboardingStepIndex >= ONBOARDING_STEPS.length - 1) {
    closeOnboardingModal();
    return;
  }
  setOnboardingStep(onboardingStepIndex + 1);
}

function previousOnboardingStep() {
  if (onboardingStepIndex > 0) setOnboardingStep(onboardingStepIndex - 1);
}

function openOnboardingModal() {
  const profileName = (state.profile?.name || "").trim();
  const isNewUser = pendingFirstRunSetup;
  const isReturningUser = cloudHadSave && !isPendingNewAccount(currentUser?.email);
  
  const title = document.getElementById("onboarding-title");
  if (title) {
    if (isReturningUser && profileName) {
      title.textContent = `Welcome back, ${escapeHtml(profileName)}`;
    } else if (isNewUser && profileName) {
      title.textContent = `Welcome, ${escapeHtml(profileName)}`;
    } else {
      title.textContent = "Welcome to UniTrack.";
    }
  }
  onboardingStepIndex = 0;
  document.getElementById("onboarding-modal").classList.remove("hidden");
  renderOnboardingStep();
}

function closeOnboardingModal() {
  markOnboardingSeen();
  pendingOnboarding = false;
  pendingFirstRunSetup = false;
  document.getElementById("onboarding-modal").classList.add("hidden");
}

function maybeShowOnboarding() {
  if (!shouldShowOnboarding()) return;
  const setupModal = document.getElementById("course-setup-modal");
  if (setupModal && !setupModal.classList.contains("hidden")) {
    pendingOnboarding = true;
    return;
  }
  pendingOnboarding = false;
  openOnboardingModal();
}

function maybeShowWelcomeBackSplash() {
  // Deadline popup wins. If a deadline exists, do not show welcome back.
  if (getNearestUpcomingDeadline()) return;
  if (!currentUser) return;

  const profileName = (state.profile?.name || "").trim();
  const isReturningUser = cloudHadSave && !isPendingNewAccount(currentUser?.email);
  const isOnboardingUser = pendingFirstRunSetup;

  if (isReturningUser && profileName && !isOnboardingUser) {
    if (welcomeSplashShownThisLoad) return;
    welcomeSplashShownThisLoad = true;

    const splash = document.getElementById("deadline-splash");
    if (!splash) return;

    clearInterval(deadlineSplashInterval);
    deadlineSplashInterval = null;

    splash.innerHTML = `
      <div class="deadline-splash-card">
        <button class="deadline-splash-close" type="button" onclick="closeDeadlineSplash()">&times;</button>
        <div class="deadline-splash-label">Welcome</div>
        <div class="deadline-splash-title">Welcome back, ${escapeHtml(profileName)}</div>
        <div class="template-splash-copy" style="margin-top: 16px; color: rgba(255,255,255,0.68);">Great to see you again! Your progress has been saved.</div>
      </div>
    `;

    splash.classList.remove("hidden");

    setTimeout(() => {
      if (!getNearestUpcomingDeadline()) splash.classList.add("hidden");
    }, 4000);
  }
}

function renderAuthGate(mode = authViewMode) {
  authViewMode = mode;
  const host = document.getElementById("auth-gate-body");
  const asideCopy = document.querySelector(".auth-gate-copy");
  if (!host) return;
  const isSignup = mode === "signup";
  const isRecovery = mode === "recovery" || isRecoveryFlow();
  const feedbackClass = authStatusTone === "success" ? "auth-success" : "auth-error";
  const profileName = escapeHtml((state.profile?.name || "").trim());
  const loginTitle = profileName ? `Welcome back, ${profileName}` : "Welcome back!";
  if (asideCopy) asideCopy.textContent = authScreenLoading ? "Opening your saved tracker." : "Sign in to UniTrack.";

  if (authScreenLoading && !isRecovery) {
    host.innerHTML = `
      <div class="auth-gate-card">
        <div class="deadline-splash-title" style="color: var(--ink);">${escapeHtml(authLoadingTitle)}</div>
        <div class="auth-gate-message">${escapeHtml(authLoadingMessage)}</div>
        <div id="auth-gate-feedback" class="auth-success"></div>
      </div>
    `;
    return;
  }

  host.innerHTML = isRecovery ? `
    <div class="auth-gate-card">
      <div class="auth-gate-label">Password Recovery</div>
      <div class="deadline-splash-title" style="color: var(--ink);">Set a new password</div>
      <div class="auth-gate-message">Finish the reset here before going back into the app.</div>
      <div class="deadline-form-grid">
        <div class="field">
          <label for="auth-gate-new-password">New Password</label>
          <input class="input" id="auth-gate-new-password" type="password" autocomplete="new-password" placeholder="Minimum 6 characters" onkeydown="handleAuthKeydown(event, 'recovery')">
        </div>
        <div id="auth-gate-feedback" class="${feedbackClass}">${escapeHtml(authStatusMessage || "")}</div>
        <div class="deadline-form-actions">
          <button class="nav-btn calendar-btn" type="button" onclick="updatePasswordFromModal()">Update Password</button>
        </div>
      </div>
    </div>
  ` : `
    <div class="auth-gate-card">
      <div class="auth-gate-tabs">
        <button class="auth-gate-tab ${!isSignup ? "active" : ""}" type="button" onclick="setAuthScreen('login')">Sign In</button>
        <button class="auth-gate-tab ${isSignup ? "active" : ""}" type="button" onclick="setAuthScreen('signup')">Create Account</button>
      </div>
      <div class="deadline-splash-title" style="color: var(--ink);">${isSignup ? "Create your account" : loginTitle}</div>
      <div class="auth-gate-message">${isSignup ? "Create a new cloud account to keep your tracker, deadlines, and preferences synced." : "Sign in with your existing account to view your tracker."}</div>
      <div class="deadline-form-grid">
        <div class="field">
          <label for="auth-gate-email">Email</label>
          <input class="input" id="auth-gate-email" type="email" autocomplete="email" placeholder="you@example.com" onkeydown="handleAuthKeydown(event, '${isSignup ? "signup" : "login"}')">
        </div>
        <div class="field">
          <label for="auth-gate-password">Password</label>
          <input class="input" id="auth-gate-password" type="password" autocomplete="${isSignup ? "new-password" : "current-password"}" placeholder="Minimum 6 characters" onkeydown="handleAuthKeydown(event, '${isSignup ? "signup" : "login"}')">
        </div>
        ${isSignup ? `
          <div class="field">
            <label for="auth-gate-confirm-password">Confirm Password</label>
            <input class="input" id="auth-gate-confirm-password" type="password" autocomplete="new-password" placeholder="Repeat your password" onkeydown="handleAuthKeydown(event, 'signup')">
          </div>
        ` : ""}
        <div id="auth-gate-feedback" class="${feedbackClass}">${escapeHtml(authStatusMessage || "")}</div>
        <div class="deadline-form-actions">
          ${isSignup ? `
            <button class="nav-btn" type="button" data-password-toggle onclick="togglePasswordVisibility('auth-gate-password', 'auth-gate-confirm-password')">Show Password</button>
            <button class="nav-btn calendar-btn" id="auth-signup-btn" type="button" onclick="signUpFromModal()">Create Account</button>
          ` : `
            <button class="nav-btn" type="button" onclick="setAuthScreen('reset')">Forgot Password</button>
            <button class="nav-btn" type="button" data-password-toggle onclick="togglePasswordVisibility('auth-gate-password')">Show Password</button>
            <button class="nav-btn calendar-btn" type="button" onclick="loginFromModal()">Sign In</button>
          `}
        </div>
      </div>
    </div>
  `;

  if (mode === "reset") {
    host.innerHTML = `
      <div class="auth-gate-card">
        <div class="auth-gate-tabs">
          <button class="auth-gate-tab" type="button" onclick="setAuthScreen('login')">Sign In</button>
          <button class="auth-gate-tab" type="button" onclick="setAuthScreen('signup')">Create Account</button>
        </div>
        <div class="deadline-splash-title" style="color: var(--ink);">Reset your password</div>
        <div class="auth-gate-message">Enter the email tied to your account and I'll send you a reset link.</div>
        <div class="deadline-form-grid">
          <div class="field">
            <label for="auth-gate-email">Email</label>
            <input class="input" id="auth-gate-email" type="email" autocomplete="email" placeholder="you@example.com" onkeydown="handleAuthKeydown(event, 'reset')">
          </div>
          <div id="auth-gate-feedback" class="${feedbackClass}">${escapeHtml(authStatusMessage || "")}</div>
          <div class="deadline-form-actions">
            <button class="nav-btn" type="button" onclick="setAuthScreen('login')">Back</button>
            <button class="nav-btn calendar-btn" type="button" onclick="resetPasswordFromModal()">Send Reset Email</button>
          </div>
        </div>
      </div>
    `;
  }

  const focusId = isRecovery ? "auth-gate-new-password" : "auth-gate-email";
  setTimeout(() => document.getElementById(focusId)?.focus(), 0);
}

function setAuthScreen(mode) {
  authViewMode = mode;
  clearAuthMessage();
  renderAuthGate(mode);
}

function refreshAppAfterAuth() {
  ensureYearsState();
  refreshActiveYear();
  applyPreferences();
  renderYearSelector();
  buildModules();
  renderStickyExams();
  setupDeadlineBarScrolling();
  updateGlobal();
  if (currentUser && pendingFirstRunSetup) {
    closeAuthModal(true);
    setupCourseIfNeeded();
  }
  maybeShowOnboarding();
  // Important: loginFromModal() reaches this path, so the nearest deadline must be checked here,
  // not only inside the initial page boot code.
  setTimeout(() => {
    if (!currentUser) return;

    const templateSplash = document.getElementById("template-splash");
    if (templateSplash && !templateSplash.classList.contains("hidden")) return;

    const deadlineShown = showDeadlineSplash();
    if (!deadlineShown) maybeShowWelcomeBackSplash();
  }, 250);
}

function resetLocalAppState() {
  state = createInitialState();
  Object.keys(preferences).forEach((key) => delete preferences[key]);
  Object.assign(preferences, DEFAULT_PREFERENCES);
  ensureYearsState();
  refreshActiveYear();
  syncUndoBaseline();
  applyPreferences();
  renderYearSelector();
  buildModules();
  renderStickyExams();
  updateGlobal();
}

function openAuthModal(mode = "login") {
  if (!currentUser) {
    setAuthScreen(isRecoveryFlow() ? "recovery" : mode);
    updateAuthLock();
    return;
  }
  const modal = document.getElementById("auth-modal");
  if (!modal) return;
  if (mode === "recovery") recoveryModeActive = true;
  modal.classList.remove("hidden");
  renderAuthModal(mode);
  const closeBtn = document.querySelector("#auth-modal .deadline-splash-close");
  if (closeBtn) closeBtn.style.display = (currentUser && !isRecoveryFlow()) ? "block" : "none";
}

function closeAuthModal(force = false) {
  if (!force && (!currentUser || isRecoveryFlow())) return;
  const modal = document.getElementById("auth-modal");
  if (!modal) return;
  modal.classList.add("hidden");
}

function updateAuthButton() {
  const btn = document.getElementById("auth-btn");
  if (!btn) return;
  btn.textContent = currentUser ? "Account \u2713" : "Account";
}

function renderAuthModal(mode = "login") {
  if (!currentUser) {
    setAuthScreen(isRecoveryFlow() ? "recovery" : mode);
    updateAuthLock();
    return;
  }
  const body = document.getElementById("auth-modal-body");
  if (!body) return;

  if (currentUser) {
    const syncStatus = cloudLoadSucceeded ? "Synced to cloud" : (cloudReady ? "Signed in, sync catching up" : "Signed in locally");
    body.innerHTML = `
      <div class="account-card">
        <div class="account-title">Account</div>
        <div class="account-copy">Check account settings, sync status, and saved data controls here.</div>
        <div class="account-meta">
          <div class="account-meta-row">
            <div class="account-meta-label">Signed In As</div>
            <div class="account-meta-value auth-email">${escapeHtml(currentUser.email || "Cloud account")}</div>
          </div>
          <div class="account-meta-row">
            <div class="account-meta-label">Status</div>
            <div class="account-meta-value">${escapeHtml(syncStatus)}</div>
          </div>
        </div>
        <div class="account-section">
          <div class="account-section-title">Tracker</div>
          <div class="account-actions">
            <button class="nav-btn" type="button" onclick="editCourseProfile()">Edit Course Setup</button>
            <button class="nav-btn danger-btn" type="button" onclick="clearTrackerStorage()">Clear Saved Data</button>
          </div>
        </div>
        <div class="account-section">
          <div class="account-section-title">Session</div>
          <div class="account-actions">
            <button class="nav-btn" type="button" onclick="logoutCloud()">Logout</button>
          </div>
        </div>
      </div>
    `;
    return;
  }
}

function shiftModuleColourMapAfterDelete(map, deletedIndex) {
  return shiftIndexedObjectAfterDelete(map, deletedIndex);
}

function setAuthError(message) {
  setAuthMessage(message, "error");
}

function setAuthButtonBusy(selector, busy, busyText = "Working...") {
  const button = document.querySelector(selector);
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = busyText;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
  }
}

function ensureCloudAuthReady() {
  if (supabaseClient) return true;
  setAuthError(cloudConfigMissing
    ? "Cloud sign-in is not configured. Add /config.js with Supabase settings and refresh."
    : "Cloud sign-in did not load. Refresh the page and check your internet connection.");
  return false;
}

function withCloudTimeout(promise, label = "Cloud request", timeoutMs = 12000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} took too long. Check your connection and try again.`)), timeoutMs);
    })
  ]);
}

function getCachedAccessToken(session = currentSession) {
  const expiresAt = Number(session?.expires_at || 0);
  const stillFresh = !expiresAt || expiresAt * 1000 > Date.now() + 30000;
  return session?.access_token && stillFresh ? session.access_token : "";
}

async function getCloudAccessToken(session = currentSession) {
  const cachedToken = getCachedAccessToken(session);
  if (cachedToken) return cachedToken;
  if (!supabaseClient) throw new Error("Cloud sign-in is not available.");
  const { data, error } = await withCloudTimeout(supabaseClient.auth.getSession(), "Session check");
  if (error) throw error;
  currentSession = data?.session || null;
  currentUser = currentSession?.user || currentUser;
  const token = data?.session?.access_token;
  if (!token) throw new Error("Your session expired. Please sign in again.");
  return token;
}

async function trackerApiRequest(method, body = null, session = currentSession) {
  const token = await getCloudAccessToken(session);
  const response = await withCloudTimeout(fetch("/api/tracker", {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`
    },
    body: body ? JSON.stringify(body) : null
  }), `Tracker ${method}`);

  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.error || `Tracker request failed with status ${response.status}.`);
  }

  return payload;
}

function loadTrackerProfileFromApi(session = currentSession) {
  return trackerApiRequest("GET", null, session);
}

function saveTrackerProfileToApi(nextState = state, nextPreferences = preferences, session = currentSession) {
  return trackerApiRequest("PUT", {
    data: nextState,
    prefs: nextPreferences
  }, session);
}

function togglePasswordVisibility(...ids) {
  const inputs = ids.map((id) => document.getElementById(id)).filter(Boolean);
  if (!inputs.length) return;
  const show = inputs[0].type === "password";
  inputs.forEach((input) => {
    input.type = show ? "text" : "password";
  });
  document.querySelectorAll("[data-password-toggle]").forEach((button) => {
    button.textContent = show ? "Hide Password" : "Show Password";
  });
}

function handleAuthKeydown(event, mode) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  if (mode === "signup") signUpFromModal();
  else if (mode === "recovery") updatePasswordFromModal();
  else if (mode === "reset") resetPasswordFromModal();
  else loginFromModal();
}

async function resetPasswordFromModal() {
  if (!ensureCloudAuthReady()) return;
  const email = getAuthInputValue("email");

  if (!email) {
    setAuthError("Enter your email first.");
    return;
  }
  const emailError = validateAuthEmail(email);
  if (emailError) {
    setAuthError(emailError);
    return;
  }

  let error;
  try {
    ({ error } = await withCloudTimeout(supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname
    }), "Password reset"));
  } catch (cloudError) {
    setAuthError(cloudError?.message || "Password reset failed. Please try again.");
    return;
  }

  if (error) {
    setAuthError(error.message);
    return;
  }

  setAuthMessage("Check your email for the reset link.", "success");
}

async function updatePasswordFromModal() {
  if (!ensureCloudAuthReady()) return;
  const password = getAuthInputValue("new-password");
  const passwordError = validateAuthPassword(password, "New password");
  if (passwordError) {
    setAuthError(passwordError);
    return;
  }

  let error;
  try {
    ({ error } = await withCloudTimeout(supabaseClient.auth.updateUser({ password }), "Password update"));
  } catch (cloudError) {
    setAuthError(cloudError?.message || "Password update failed. Please try again.");
    return;
  }

  if (error) {
    setAuthError(error.message);
    return;
  }

  recoveryModeActive = false;
  clearRecoveryUrl();
  await logoutCloud();
  authViewMode = "login";
  setAuthMessage("Password updated. Please sign in with your new password.", "success");
  renderAuthGate("login");
}

async function signUpFromModal() {
  if (!ensureCloudAuthReady()) return;
  const email = getAuthInputValue("email");
  const password = getAuthInputValue("password");
  const confirmPassword = getAuthInputValue("confirm-password");

  const emailError = validateAuthEmail(email);
  if (emailError) {
    setAuthError(emailError);
    return;
  }
  const passwordError = validateAuthPassword(password);
  if (passwordError) {
    setAuthError(passwordError);
    return;
  }
  if (!confirmPassword) {
    setAuthError("Confirm your password.");
    return;
  }
  if (password !== confirmPassword) {
    setAuthError("Passwords do not match.");
    return;
  }

  let data;
  let error;
  accountCreationInProgress = true;
  setAuthButtonBusy("#auth-signup-btn", true, "Creating...");
  setAuthMessage("Creating your account...", "success");
  try {
    ({ data, error } = await withCloudTimeout(supabaseClient.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin + window.location.pathname
      }
    }), "Account creation"));
  } catch (cloudError) {
    accountCreationInProgress = false;
    setAuthButtonBusy("#auth-signup-btn", false);
    setAuthError(cloudError?.message || "Account creation failed. Please try again.");
    return;
  }

  if (error) {
    accountCreationInProgress = false;
    setAuthButtonBusy("#auth-signup-btn", false);
    setAuthError(error.message);
    return;
  }

  markPendingNewAccount(email);
  if (data?.session) {
    try {
      await supabaseClient.auth.signOut();
    } catch (signOutError) {
      console.warn("Post-signup sign out error:", signOutError?.message || signOutError);
    }
    currentUser = null;
    currentSession = null;
    cloudReady = false;
  }
  accountCreationInProgress = false;
  authViewMode = "login";
  setAuthLoading(false);
  updateAuthLock();
  setAuthMessage(data?.session
    ? "Account created. Please sign in now to set up your tracker."
    : "Account created. Check your email to confirm it, then sign in.", "success");
  renderAuthGate("login");
}

async function loginFromModal() {
  if (!ensureCloudAuthReady()) return;
  const email = getAuthInputValue("email");
  const password = getAuthInputValue("password");

  const emailError = validateAuthEmail(email);
  if (emailError) {
    setAuthError(emailError);
    return;
  }
  const passwordError = validateAuthPassword(password);
  if (passwordError) {
    setAuthError(passwordError);
    return;
  }

  setAuthMessage("Signing in...", "success");
  setAuthLoading(true, "Signing you in...", "Pulling your tracker and preferences now.");

  try {
    const { data, error } = await withCloudTimeout(supabaseClient.auth.signInWithPassword({
      email,
      password
    }), "Sign in");

    if (error) {
      setAuthLoading(false);
      setAuthError(error.message);
      return;
    }

    currentSession = data.session || null;
    currentUser = currentSession?.user || data.user || null;
    clearLogoutFlagForSignedInUser();
  } catch (error) {
    setAuthLoading(false);
    setAuthError(error?.message || "Sign in failed. Please check your connection and try again.");
  }
}

async function logoutCloud() {
  if (!ensureCloudAuthReady()) return;
  sessionStorage.setItem("justLoggedOut", "true");
  closeAuthModal(true);

  try {
    const { error } = await withCloudTimeout(supabaseClient.auth.signOut(), "Sign out");
    if (error) throw error;
  } catch (error) {
    setAuthError(error?.message || "Sign out failed. Please check your connection and try again.");
    return;
  }

  currentUser = null;
  currentSession = null;
  cloudReady = false;
  cloudHadSave = false;
  cloudLoadSucceeded = false;
  recoveryModeActive = false;
  pendingFirstRunSetup = false;
  authViewMode = "login";
  deadlineSplashShownThisLoad = false;
  welcomeSplashShownThisLoad = false;

  localStorage.removeItem(KEY);
  localStorage.removeItem(PREFS_KEY);

  setAuthLoading(false);
  updateAuthButton();
  updateAuthLock();
  resetLocalAppState();
  renderAuthGate("login");
}

let cloudLoadPromise = null;

async function loadCloudSave(options = {}) {
  if (cloudLoadPromise) return cloudLoadPromise;
  cloudLoadPromise = loadCloudSaveInner(options).finally(() => {
    cloudLoadPromise = null;
  });
  return cloudLoadPromise;
}

async function loadCloudSaveInner(options = {}) {
  cloudLoadSucceeded = false;
  if (!supabaseClient) {
    cloudReady = false;
    setAuthError("Cloud sign-in did not load. Refresh the page and check your internet connection.");
    return;
  }

  if (options.session) {
    currentSession = options.session;
    currentUser = options.session.user || currentUser;
  }

  if (!currentUser) {
    let sessionData;
    let sessionError;
    try {
      ({ data: sessionData, error: sessionError } = await withCloudTimeout(supabaseClient.auth.getSession(), "Session check"));
    } catch (error) {
      console.warn("Cloud session error:", error?.message || error);
      cloudReady = false;
      return;
    }

    if (sessionError) {
      console.warn("Cloud session error:", sessionError.message);
      return;
    }

    currentSession = sessionData.session || null;
    currentUser = currentSession?.user || null;
  }

  console.log("Cloud user:", currentUser?.email || "not logged in");
  updateAuthButton();

  if (!currentUser) {
    cloudReady = false;
    pendingFirstRunSetup = false;
    return;
  }

  let profile;
  try {
    ({ profile } = await withCloudTimeout(loadTrackerProfileFromApi(currentSession), "Cloud data load"));
  } catch (cloudError) {
    console.warn("Cloud load error:", cloudError?.message || cloudError);
    cloudReady = true;
    return;
  }

  cloudLoadSucceeded = true;

  if (profile?.data) {
    cloudHadSave = true;
    state = profile.data;
    localStorage.setItem(KEY, JSON.stringify(state));
  } else {
    cloudHadSave = false;
  }

  if (profile?.prefs) {
    Object.assign(preferences, profile.prefs);
    localStorage.setItem(PREFS_KEY, JSON.stringify(preferences));
  }

  cloudReady = true;
  syncUndoBaseline();

}

async function saveCloudNow() {
  if (!supabaseClient || !currentUser || !cloudReady) return;

  try {
    await withCloudTimeout(saveTrackerProfileToApi(), "Cloud save");
    console.log("Cloud save complete");
  } catch (error) {
    console.warn("Cloud save error:", error?.message || error);
    setAuthMessage(error?.message || "Cloud save failed. Your latest changes remain saved in this browser.", "error");
  }
}

let cloudSaveTimer = null;
function saveCloudDebounced() {
  if (!currentUser || !cloudReady) return;
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(saveCloudNow, 700);
}

async function saveCloud() {
  await saveCloudNow();
}

if (supabaseClient) {
supabaseClient.auth.onAuthStateChange(async (event, session) => {
  if (event === "INITIAL_SESSION") {
    markAuthStateKnown();
    return;
  }

  currentSession = session || null;
  currentUser = currentSession?.user || null;
  markAuthStateKnown();
  clearLogoutFlagForSignedInUser();
  if (!currentUser) cloudReady = false;
  if (accountCreationInProgress) return;
  updateAuthButton();
  const btn = document.getElementById("auth-btn");
  if (btn) btn.textContent = currentUser ? "Account \u2713" : "Account";
  if (event === "PASSWORD_RECOVERY" || isRecoveryFlow()) {
    recoveryModeActive = true;
    authViewMode = "recovery";
    setAuthLoading(false);
    updateAuthLock();
    openAuthModal("recovery");
    return;
  }
  if (currentUser) {
    const shouldBlockUi = authScreenLoading;
    if (shouldBlockUi) {
      cloudReady = false;
      pendingFirstRunSetup = false;
    }
    await loadCloudSave({ session: currentSession });
    pendingFirstRunSetup = cloudLoadSucceeded && !cloudHadSave;
    if (pendingFirstRunSetup && shouldBlockUi) {
      resetLocalAppState();
      cloudReady = true;
    }
    if (shouldBlockUi) setAuthLoading(false);
    updateAuthLock();
    refreshAppAfterAuth();
    return;
  }
  pendingFirstRunSetup = false;
  cloudHadSave = false;
  setAuthLoading(false);
  updateAuthLock();
  renderAuthGate("login");
});
} else {
  markAuthStateKnown();
  setTimeout(() => {
    setAuthLoading(false);
    updateAuthLock();
    if (cloudConfigMissing) {
      renderCloudUnavailableGate();
    } else {
      setAuthError("Cloud sign-in did not load. Refresh the page and check your internet connection.");
    }
  }, 0);
}

/* 10-dialog-actions.js */
/* ===== Professional in-app dialog helpers + prompt/confirm replacements ===== */
let appDialogResolver = null;
let appDialogMode = "confirm";
let appDialogRequireYes = false;

function openAppDialog(options = {}) {
  const modal = document.getElementById("app-dialog-modal");
  if (!modal) return Promise.resolve(null);

  const label = document.getElementById("app-dialog-label");
  const title = document.getElementById("app-dialog-title");
  const message = document.getElementById("app-dialog-message");
  const field = document.getElementById("app-dialog-field");
  const input = document.getElementById("app-dialog-input");
  const inputLabel = document.getElementById("app-dialog-input-label");
  const checkWrap = document.getElementById("app-dialog-check-wrap");
  const check = document.getElementById("app-dialog-check");
  const checkLabel = document.getElementById("app-dialog-check-label");
  const confirmBtn = document.getElementById("app-dialog-confirm");
  const cancelBtn = document.getElementById("app-dialog-cancel");

  appDialogMode = options.mode || "confirm";
  appDialogRequireYes = !!options.requireYes;

  if (label) label.textContent = options.label || (options.danger ? "Delete" : "Confirm");
  if (title) title.textContent = options.title || "Are you sure?";
  if (message) message.textContent = options.message || "";

  const needsInput = appDialogMode === "prompt";
  if (field) field.classList.toggle("hidden", !needsInput);
  if (inputLabel) inputLabel.textContent = options.inputLabel || "Value";
  if (input) {
    input.value = options.defaultValue || "";
    input.placeholder = options.placeholder || "";
  }

  if (checkWrap) checkWrap.classList.toggle("hidden", !options.checkboxLabel);
  if (checkLabel) checkLabel.textContent = options.checkboxLabel || "";
  if (check) check.checked = !!options.checkboxDefault;

  if (confirmBtn) {
    confirmBtn.textContent = options.confirmText || (options.danger ? "Delete" : "Continue");
    confirmBtn.classList.toggle("danger-action", !!options.danger);
  }
  if (cancelBtn) cancelBtn.textContent = options.cancelText || "Cancel";

  modal.classList.remove("hidden");
  setTimeout(() => {
    if (needsInput && input) {
      input.focus();
      input.select();
    } else if (confirmBtn) {
      confirmBtn.focus();
    }
  }, 0);

  return new Promise(resolve => {
    appDialogResolver = resolve;
  });
}

function resolveAppDialog(confirmed) {
  const modal = document.getElementById("app-dialog-modal");
  const input = document.getElementById("app-dialog-input");
  const check = document.getElementById("app-dialog-check");
  if (modal) modal.classList.add("hidden");

  if (!appDialogResolver) return;
  const resolver = appDialogResolver;
  appDialogResolver = null;

  if (!confirmed) {
    resolver(null);
    return;
  }

  if (appDialogMode === "prompt") {
    resolver({ value: input?.value || "", checked: !!check?.checked });
    return;
  }

  resolver(true);
}

document.addEventListener("keydown", (event) => {
  const modal = document.getElementById("app-dialog-modal");
  if (!modal || modal.classList.contains("hidden")) return;
  if (event.key === "Escape") resolveAppDialog(false);
  if (event.key === "Enter" && !event.shiftKey) resolveAppDialog(true);
});

async function appConfirm({ title, message, label = "Confirm", confirmText = "Continue", danger = false, requireYes = false } = {}) {
  const result = await openAppDialog({ mode: "confirm", title, message, label, confirmText, danger, requireYes });
  return result === true;
}

async function appPrompt({ title, message, label = "Input", inputLabel = "Value", defaultValue = "", placeholder = "", confirmText = "Save", checkboxLabel = "", checkboxDefault = false } = {}) {
  const result = await openAppDialog({ mode: "prompt", title, message, label, inputLabel, defaultValue, placeholder, confirmText, checkboxLabel, checkboxDefault });
  if (!result) return null;
  return result;
}

function showAppNotice(title, message = "") {
  return openAppDialog({ mode: "confirm", label: "Notice", title, message, confirmText: "Okay", cancelText: "Close" });
}

async function deleteCustomBackground(key) {
  if (!preferences.customBackgrounds || !preferences.customBackgrounds[key]) return;
  const confirmed = await appConfirm({
    label: "Background",
    title: "Delete custom background?",
    message: "This removes the saved background from this tracker.",
    confirmText: "Delete",
    danger: true
  });
  if (!confirmed) return;
  delete preferences.customBackgrounds[key];
  if (preferences.hero === key) preferences.hero = "bg1";
  savePreferences();
  applyPreferences();
}

async function loadAeroTemplate() {
  const currentYear = getCurrentYear();
  if (!currentYear) return;
  if (currentYear.store.modules.length) {
    const replace = await appConfirm({
      label: "Template",
      title: "Replace current modules?",
      message: "This will replace the current year's modules with the Year 1 Aerospace Engineering template.",
      confirmText: "Replace",
      danger: true
    });
    if (!replace) return;
  }
  currentYear.store = createYearStore(BASE_MODULES);
  if (!state.profile.course || state.profile.course === "Course" || state.profile.course === "Your Course") state.profile.course = "Aerospace Engineering";
  if (!state.profile.university || state.profile.university === "University") state.profile.university = "University of Sheffield";
  if (!state.setup) state.setup = {};
  state.setup.templateChoiceMade = true;
  state.ui.currentTermFilter = "all";
  refreshActiveYear();
  save();
  document.getElementById("template-splash").classList.add("hidden");
  renderYearSelector();
  buildModules();
  renderStickyExams();
  updateGlobal();
}

async function clearModuleMarks(mi, event) {
  if (event) event.stopPropagation();
  const store = getStore();
  const mod = MODULES[mi];
  if (!mod) return;
  const confirmed = await appConfirm({
    label: "Marks",
    title: "Clear grade?",
    message: getGradingSystem() === "uk"
      ? `Clear coursework and exam marks for ${mod.kanji || mod.name}?`
      : `Clear the course grade for ${mod.kanji || mod.name}?`,
    confirmText: "Clear",
    danger: true
  });
  if (!confirmed) return;
  delete store.coursework[mi];
  delete store.exams[mi];
  if (store.finalGrades) delete store.finalGrades[mi];
  if (store.majorModules) delete store.majorModules[mi];
  if (store.courseworkComponents) delete store.courseworkComponents[mi];
  save();
  buildModules();
  updateGlobal();
}

async function clearTrackerStorage() {
  const confirmClear = await appConfirm({
    label: "Reset Tracker",
    title: "Reset everything?",
    message: "This will reset progress, marks, notes, links, and cloud saves for this account.",
    confirmText: "Reset",
    danger: true
  });
  if (!confirmClear) return;
  clearTimeout(cloudSaveTimer);
  cloudReady = false;
  cloudHadSave = false;
  cloudLoadSucceeded = false;
  const blankState = createInitialState();
  const blankPrefs = { ...DEFAULT_PREFERENCES };
  if (currentUser) {
    try {
      await withCloudTimeout(saveTrackerProfileToApi(blankState, blankPrefs), "Cloud reset");
    } catch (error) {
      await showAppNotice("Could not clear cloud storage", error?.message || "Cloud reset failed.");
      cloudReady = true;
      return;
    }
  }
  clearLocalTrackerStorage();
  state = blankState;
  Object.keys(preferences).forEach((key) => delete preferences[key]);
  Object.assign(preferences, blankPrefs);
  localStorage.setItem(KEY, JSON.stringify(state));
  localStorage.setItem(PREFS_KEY, JSON.stringify(preferences));
  ensureYearsState();
  refreshActiveYear();
  syncUndoBaseline();
  applyPreferences();
  renderYearSelector();
  buildModules();
  renderStickyExams();
  updateGlobal();
  await showAppNotice("Tracker reset", "Local and cloud tracker data were cleared successfully.");
  if (currentUser) setupCourseIfNeeded();
}

function renderYearSelector() {
  const select = document.getElementById("year-select");
  if (!select) return;
  const currentYear = getCurrentYear();
  const yearOptions = Object.values(state.years)
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
    .map((year) => {
      ensureStoreTermOptions(year.store);
      const archived = year.store.archived ? " (Archived)" : "";
      const activeTermForYear = year.id === state.ui.currentYearId ? getActiveTermFilter() : "all";
      const terms = getCurrentTermOptions(year.store)
        .filter((term) => term.value === activeTermForYear || year.store.modules?.some((mod) => normalizeTermValue(mod.term) === term.value))
        .map((term) => `<option value="term:${escapeHtml(year.id)}:${escapeHtml(term.value)}">- ${escapeHtml(term.label)}</option>`)
        .join("");
      return `<optgroup label="${escapeHtml(year.label + archived)}">
        <option value="year:${escapeHtml(year.id)}">${escapeHtml(year.label)} Overall</option>
        ${terms}
      </optgroup>`;
    });
  const actionOptions = [
    '<option value="__new__">+ New Year</option>',
    `<option value="__archive__">${currentYear.store.archived ? "Unarchive Current Year" : "Archive Current Year"}</option>`,
    '<option value="__delete__">Delete Current Year</option>'
  ];
  select.innerHTML = yearOptions.join("") + actionOptions.join("");
  const activeTerm = getActiveTermFilter();
  select.value = activeTerm === "all" ? `year:${state.ui.currentYearId}` : `term:${state.ui.currentYearId}:${activeTerm}`;
  const profile = Object.assign({}, defaultProfile, state.profile || {});
  const yearNumber = parseInt(currentYear.label.match(/\d+/)?.[0] || "1", 10);
  const profileStartYear = parseInt(profile.startYear, 10);
  const startYear = (Number.isFinite(profileStartYear) ? profileStartYear : new Date().getFullYear()) + (yearNumber - 1);
  const endYear = startYear + 1;
  const userName = (profile.name || "").trim();
  const university = profile.university || "University";
  const course = profile.course || "Course";
  const eyebrow = document.getElementById("hero-eyebrow");
  const termSuffix = activeTerm === "all" ? "" : ` - ${getTermLabel(activeTerm)}`;
  if (eyebrow) eyebrow.textContent = userName
    ? `${userName} - ${university} - ${currentYear.label}${termSuffix} - ${startYear}-${String(endYear).slice(2)}`
    : `${university} - ${currentYear.label}${termSuffix} - ${startYear}-${String(endYear).slice(2)}`;
  const title = document.getElementById("hero-title");
  if (title) title.textContent = activeTerm === "all" ? `Year ${yearNumber} ${course}` : `${getTermLabel(activeTerm)} ${course}`;
  const footer = document.getElementById("footer-label");
  if (footer) footer.textContent = `${university} ${currentYear.label}${termSuffix} - Progress Tracker`;
  document.title = `${course} ${currentYear.label}${termSuffix} Tracker`;
}

function setActiveTermFilter(term = "all") {
  if (!state.ui) state.ui = {};
  state.ui.currentTermFilter = isKnownTermValue(term) ? term : "all";
  save();
  renderYearSelector();
  buildModules();
  renderStickyExams();
  updateGlobal();
}

async function deleteCurrentYear() {
  const year = getCurrentYear();
  if (!year) return;
  if (Object.keys(state.years).length === 1) {
    await showAppNotice("Cannot delete year", "You need at least one year in the tracker.");
    return;
  }
  const confirmed = await appConfirm({
    label: "Delete Year",
    title: `Delete ${year.label}?`,
    message: "This removes the year, its modules, marks, topics, and deadlines from this tracker.",
    confirmText: "Delete Year",
    danger: true
  });
  if (!confirmed) return;
  delete state.years[year.id];
  state.ui.currentYearId = Object.keys(state.years)[0];
  state.ui.currentTermFilter = "all";
  refreshActiveYear();
  save();
  renderYearSelector();
  buildModules();
  renderStickyExams();
  updateGlobal();
}

async function createNewYear() {
  const nextNumber = Object.keys(state.years).length + 1;
  const result = await appPrompt({
    label: "New Year",
    title: "Add a new academic year",
    message: "Name the year. You can start blank or copy the current year's modules.",
    inputLabel: "Year name",
    defaultValue: `Year ${nextNumber}`,
    placeholder: "Year 2",
    confirmText: "Create Year",
    checkboxLabel: "Use current year's modules as a starting template",
    checkboxDefault: false
  });
  if (!result || !result.value.trim()) return;
  const label = result.value.trim().replace(/^Y(\d+)\b/i, "Year $1");
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `year-${Date.now()}`;
  if (state.years[id]) {
    await showAppNotice("Year already exists", "Choose a different year name.");
    return;
  }
  state.years[id] = { id, label, store: createYearStore(result.checked ? MODULES : []) };
  state.ui.currentYearId = id;
  state.ui.currentTermFilter = "all";
  refreshActiveYear();
  save();
  renderYearSelector();
  buildModules();
  renderStickyExams();
  updateGlobal();
}

async function deleteModuleFromCurrentYear(mi, event) {
  if (event) event.stopPropagation();
  const mod = MODULES[mi];
  if (!mod) return;
  const confirmed = await appConfirm({ label: "Delete Module", title: `Delete ${mod.kanji || mod.short || mod.name}?`, message: "This removes the module, its topics, marks, notes, and links.", confirmText: "Delete Module", danger: true });
  if (!confirmed) return;
  const store = getStore();
  MODULES.splice(mi, 1);
  store.topics = shiftTopicsAfterModuleDelete(store.topics, mi);
  store.coursework = shiftIndexedObjectAfterDelete(store.coursework, mi);
  store.courseworkComponents = shiftIndexedObjectAfterDelete(store.courseworkComponents, mi);
  store.exams = shiftIndexedObjectAfterDelete(store.exams, mi);
  store.notes = shiftIndexedObjectAfterDelete(store.notes, mi);
  store.blackboard = shiftIndexedObjectAfterDelete(store.blackboard, mi);
  store.formulas = shiftIndexedObjectAfterDelete(store.formulas, mi);
  store.relevantLinks = shiftIndexedObjectAfterDelete(store.relevantLinks, mi);
  store.moduleColors = shiftModuleColourMapAfterDelete(store.moduleColors, mi);
  save();
  refreshActiveYear();
  buildModules();
  renderStickyExams();
  updateGlobal();
}

async function editModuleTitle(mi, event) {
  if (event) event.stopPropagation();
  const mod = MODULES[mi];
  if (!mod) return;
  const result = await appPrompt({ label: "Module", title: "Edit module title", inputLabel: "Module title", defaultValue: mod.name || "", confirmText: "Save" });
  const title = result?.value;
  if (title === undefined || title === null || !title.trim()) return;
  mod.name = title.trim();
  if (!mod.short || mod.short === mod.kanji) mod.short = title.trim();
  save();
  buildModules();
  updateGlobal();
}

async function editModuleCode(mi, event) {
  if (event) event.stopPropagation();
  const mod = MODULES[mi];
  if (!mod) return;
  const previousCode = mod.kanji || "";
  const result = await appPrompt({ label: "Module", title: "Edit module code", inputLabel: "Module code", defaultValue: previousCode, confirmText: "Save" });
  const code = result?.value;
  if (code === undefined || code === null || !code.trim()) return;
  mod.kanji = code.trim().toUpperCase();
  if (!mod.short || mod.short === previousCode) mod.short = mod.kanji;
  save();
  buildModules();
  updateGlobal();
}

async function addTopicToModule(mi, event) {
  if (event) {
    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
  }
  const draftInput = document.getElementById(`topic-add-${mi}`);
  let input = draftInput ? draftInput.value : "";
  if (!input) {
    const result = await appPrompt({ label: "Topic", title: "Add topic", message: 'For multiple topics, wrap each one in quotes: "Topic 1" "Topic 2"', inputLabel: "Topic name", defaultValue: "", confirmText: "Add Topic" });
    input = result?.value || "";
  }
  if (!input || !input.trim()) return;
  const quotedTopics = [...input.matchAll(/"([^"]+)"/g)].map(match => match[1].trim()).filter(Boolean);
  const topicsToAdd = quotedTopics.length ? quotedTopics : [input.trim()];
  MODULES[mi].topics.push(...topicsToAdd.map((title) => ({ title, subtopics: [], collapsed: false })));
  if (draftInput) draftInput.value = "";
  openModules.add(mi);
  openModuleSections[getModuleSectionStateKey(mi, "topics")] = true;
  refreshTopicStructure(mi);
}

async function addSubtopicToTopic(mi, ti, event) {
  if (event) {
    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
  }
  const topic = getTopicEntry(mi, ti);
  const result = await appPrompt({
    label: "Subtopics",
    title: `Add subtopics under ${topic.title}`,
    message: 'Add one subtopic, or wrap several in quotes: "Definition" "Worked Example" "Past Paper"',
    inputLabel: "Subtopics",
    placeholder: '"Definition" "Worked Example"',
    confirmText: "Add Subtopics"
  });
  const values = parseQuotedList(result?.value || "");
  if (!values.length) return;
  MODULES[mi].topics[ti] = Object.assign({}, topic, { subtopics: [...topic.subtopics, ...values], collapsed: false });
  openModules.add(mi);
  openModuleSections[getModuleSectionStateKey(mi, "topics")] = true;
  refreshTopicStructure(mi);
}

function removeSubtopicFromModule(mi, ti, si) {
  const store = getStore();
  const topic = getTopicEntry(mi, ti);
  if (!topic.subtopics[si]) return;
  MODULES[mi].topics[ti] = Object.assign({}, topic, {
    subtopics: topic.subtopics.filter((_, index) => index !== si)
  });

  const nextTopics = {};
  Object.keys(store.topics).forEach((key) => {
    const match = /^s_(\d+)_(\d+)_(\d+)$/.exec(key);
    if (!match) {
      nextTopics[key] = store.topics[key];
      return;
    }
    const moduleIndex = Number(match[1]);
    const topicIndex = Number(match[2]);
    const subIndex = Number(match[3]);
    if (moduleIndex !== mi || topicIndex !== ti) {
      nextTopics[key] = store.topics[key];
      return;
    }
    if (subIndex < si) nextTopics[key] = store.topics[key];
    if (subIndex > si) nextTopics[`s_${mi}_${ti}_${subIndex - 1}`] = store.topics[key];
  });
  const nextTopic = getTopicEntry(mi, ti);
  const allDone = nextTopic.subtopics.length > 0 && nextTopic.subtopics.every((_, index) => !!nextTopics[subtopicKey(mi, ti, index)]);
  if (allDone) nextTopics[topicKey(mi, ti)] = true;
  else delete nextTopics[topicKey(mi, ti)];
  store.topics = nextTopics;
}

function moveSubtopicInModule(mi, fromParentTi, fromSi, toParentTi, toSi, placement = "before") {
  const topics = MODULES[mi]?.topics;
  if (!topics) return;
  if (fromParentTi === toParentTi && fromSi === toSi) return;
  const sourceTopic = getTopicEntry(mi, fromParentTi);
  const targetTopic = getTopicEntry(mi, toParentTi);
  if (!sourceTopic?.subtopics?.[fromSi] || !targetTopic) return;

  const stateSnapshot = getModuleTopicStateSnapshot(mi);
  const movedTitle = sourceTopic.subtopics[fromSi];
  const movedDone = !!stateSnapshot[fromParentTi]?.subs?.[fromSi];

  const sourceSubtopics = [...sourceTopic.subtopics];
  sourceSubtopics.splice(fromSi, 1);
  MODULES[mi].topics[fromParentTi] = Object.assign({}, sourceTopic, { subtopics: sourceSubtopics });
  stateSnapshot[fromParentTi].subs.splice(fromSi, 1);

  let insertIndex = toSi;
  if (fromParentTi === toParentTi && fromSi < toSi) insertIndex -= 1;
  if (placement === "after") insertIndex += 1;
  insertIndex = Math.max(0, Math.min(getTopicEntry(mi, toParentTi).subtopics.length, insertIndex));

  const nextTargetTopic = getTopicEntry(mi, toParentTi);
  const targetSubtopics = [...nextTargetTopic.subtopics];
  targetSubtopics.splice(insertIndex, 0, movedTitle);
  MODULES[mi].topics[toParentTi] = Object.assign({}, nextTargetTopic, { subtopics: targetSubtopics, collapsed: false });
  stateSnapshot[toParentTi].subs.splice(insertIndex, 0, movedDone);

  [fromParentTi, toParentTi].forEach((topicIndex) => {
    const entry = stateSnapshot[topicIndex];
    if (!entry) return;
    entry.main = entry.subs.length > 0 && entry.subs.every(Boolean);
  });

  applyModuleTopicStateSnapshot(mi, stateSnapshot);
  refreshTopicStructure(mi);
}

function moveSubtopicToParent(mi, fromParentTi, fromSi, toParentTi) {
  const topics = MODULES[mi]?.topics;
  if (!topics) return;
  const sourceTopic = getTopicEntry(mi, fromParentTi);
  const targetTopic = getTopicEntry(mi, toParentTi);
  if (!sourceTopic?.subtopics?.[fromSi] || !targetTopic) return;

  const stateSnapshot = getModuleTopicStateSnapshot(mi);
  const movedTitle = sourceTopic.subtopics[fromSi];
  const movedDone = !!stateSnapshot[fromParentTi]?.subs?.[fromSi];

  MODULES[mi].topics[fromParentTi] = Object.assign({}, sourceTopic, {
    subtopics: sourceTopic.subtopics.filter((_, index) => index !== fromSi)
  });
  stateSnapshot[fromParentTi].subs.splice(fromSi, 1);

  const refreshedTarget = getTopicEntry(mi, toParentTi);
  MODULES[mi].topics[toParentTi] = Object.assign({}, refreshedTarget, {
    subtopics: [...refreshedTarget.subtopics, movedTitle],
    collapsed: false
  });
  stateSnapshot[toParentTi].subs.push(movedDone);

  [fromParentTi, toParentTi].forEach((topicIndex) => {
    const entry = stateSnapshot[topicIndex];
    if (!entry) return;
    entry.main = entry.subs.length > 0 && entry.subs.every(Boolean);
  });

  applyModuleTopicStateSnapshot(mi, stateSnapshot);
  refreshTopicStructure(mi);
}

function promoteSubtopicToMain(mi, fromParentTi, fromSi, toTopicIndex, placement = "before") {
  const topics = MODULES[mi]?.topics;
  if (!topics) return;
  const sourceTopic = getTopicEntry(mi, fromParentTi);
  if (!sourceTopic?.subtopics?.[fromSi]) return;

  const stateSnapshot = getModuleTopicStateSnapshot(mi);
  const movedTitle = sourceTopic.subtopics[fromSi];
  const movedDone = !!stateSnapshot[fromParentTi]?.subs?.[fromSi];

  MODULES[mi].topics[fromParentTi] = Object.assign({}, sourceTopic, {
    subtopics: sourceTopic.subtopics.filter((_, index) => index !== fromSi)
  });
  stateSnapshot[fromParentTi].subs.splice(fromSi, 1);

  let insertIndex = toTopicIndex;
  if (placement === "after") insertIndex += 1;
  insertIndex = Math.max(0, Math.min(MODULES[mi].topics.length, insertIndex));

  MODULES[mi].topics.splice(insertIndex, 0, { title: movedTitle, subtopics: [], collapsed: false });
  stateSnapshot.splice(insertIndex, 0, { main: movedDone, subs: [] });

  const entry = stateSnapshot[fromParentTi];
  if (entry) entry.main = entry.subs.length > 0 && entry.subs.every(Boolean);

  applyModuleTopicStateSnapshot(mi, stateSnapshot);
  refreshTopicStructure(mi);
}

function toggleTopicSubtopics(mi, ti, event) {
  if (event) event.stopPropagation();
  const topic = getTopicEntry(mi, ti);
  MODULES[mi].topics[ti] = Object.assign({}, topic, { collapsed: !topic.collapsed });
  const row = event?.target?.closest?.(".topic-row");
  const subtopicList = row?.nextElementSibling;
  const toggle = row?.querySelector?.(".subtopic-toggle");
  if (subtopicList?.classList?.contains("subtopic-list")) {
    subtopicList.classList.toggle("hidden", MODULES[mi].topics[ti].collapsed);
  }
  if (toggle) {
    toggle.classList.toggle("collapsed", MODULES[mi].topics[ti].collapsed);
    toggle.setAttribute("aria-label", MODULES[mi].topics[ti].collapsed ? "Expand subtopics" : "Collapse subtopics");
    toggle.title = MODULES[mi].topics[ti].collapsed ? "Expand subtopics" : "Collapse subtopics";
  }
  save();
}

async function editTopicInModule(mi, ti, event) {
  if (event) {
    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
  }
  topicDropSuppressUntil = Date.now() + 450;

  const topic = getTopicEntry(mi, ti);
  if (!topic) return;
  const result = await appPrompt({ label: "Topic", title: "Edit topic", inputLabel: "Topic name", defaultValue: topic.title, confirmText: "Save" });
  const updated = result?.value;
  if (updated === undefined || updated === null || !updated.trim()) {
    topicDropSuppressUntil = Date.now() + 250;
    return;
  }

  const nextTitle = updated.trim();
  MODULES[mi].topics[ti] = Object.assign({}, topic, { title: nextTitle });

  const row = document.querySelector(`[data-topic-key="${topicSelectionKey(mi, ti)}"]`);
  const label = row?.querySelector(".topic-label");
  if (label) label.textContent = nextTitle;

  save();
  updateModule(mi);
  updateGlobal();
  topicDropSuppressUntil = Date.now() + 250;
}

async function editSubtopicInModule(mi, ti, si, event) {
  if (event) {
    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
  }
  topicDropSuppressUntil = Date.now() + 450;

  const topic = getTopicEntry(mi, ti);
  const current = topic.subtopics?.[si];
  if (!current) return;
  const result = await appPrompt({ label: "Subtopic", title: "Edit subtopic", inputLabel: "Subtopic name", defaultValue: current, confirmText: "Save" });
  const updated = result?.value;
  if (updated === undefined || updated === null || !updated.trim()) {
    topicDropSuppressUntil = Date.now() + 250;
    return;
  }

  const nextTitle = updated.trim();
  const subtopics = [...topic.subtopics];
  subtopics[si] = nextTitle;
  MODULES[mi].topics[ti] = Object.assign({}, topic, { subtopics });

  const row = document.querySelector(`[data-topic-key="${topicSelectionKey(mi, ti, si)}"]`);
  const label = row?.querySelector(".topic-label");
  if (label) label.textContent = nextTitle;

  save();
  updateModule(mi);
  updateGlobal();
  topicDropSuppressUntil = Date.now() + 250;
}

async function deleteSelectedTopicsInModule(mi, event) {
  if (event) event.stopPropagation();
  const selected = [...selectedTopicKeys]
    .map(parseTopicSelectionKey)
    .filter((entry) => entry?.mi === mi)
    .sort((a, b) => {
      if (a.ti !== b.ti) return b.ti - a.ti;
      const aDepth = a.kind === "sub" ? 1 : 0;
      const bDepth = b.kind === "sub" ? 1 : 0;
      if (aDepth !== bDepth) return bDepth - aDepth;
      return (b.si || 0) - (a.si || 0);
    });
  if (!selected.length) return;

  const confirmed = await appConfirm({
    label: "Delete Topics",
    title: selected.length === 1 ? "Delete selected topic?" : `Delete ${selected.length} selected topics?`,
    message: selected.length === 1 ? "This selection will be removed." : "These selected topics will be removed together.",
    confirmText: selected.length === 1 ? "Delete Topic" : "Delete Topics",
    danger: true
  });
  if (!confirmed) return;

  selected.forEach((entry) => {
    if (entry.kind === "sub") {
      removeSubtopicFromModule(mi, entry.ti, entry.si);
    } else {
      MODULES[mi].topics.splice(entry.ti, 1);
      const store = getStore();
      const nextTopics = {};
      Object.keys(store.topics).forEach((key) => {
        const mainMatch = /^t_(\d+)_(\d+)$/.exec(key);
        if (mainMatch) {
          const moduleIndex = Number(mainMatch[1]);
          const topicIndex = Number(mainMatch[2]);
          if (moduleIndex !== mi) { nextTopics[key] = store.topics[key]; return; }
          if (topicIndex < entry.ti) nextTopics[key] = store.topics[key];
          if (topicIndex > entry.ti) nextTopics[`t_${mi}_${topicIndex - 1}`] = store.topics[key];
          return;
        }
        const subMatch = /^s_(\d+)_(\d+)_(\d+)$/.exec(key);
        if (!subMatch) { nextTopics[key] = store.topics[key]; return; }
        const moduleIndex = Number(subMatch[1]);
        const topicIndex = Number(subMatch[2]);
        const subIndex = Number(subMatch[3]);
        if (moduleIndex !== mi) { nextTopics[key] = store.topics[key]; return; }
        if (topicIndex < entry.ti) nextTopics[key] = store.topics[key];
        if (topicIndex > entry.ti) nextTopics[`s_${mi}_${topicIndex - 1}_${subIndex}`] = store.topics[key];
      });
      store.topics = nextTopics;
    }
  });

  clearTopicSelection(mi);
  openModules.add(mi);
  openModuleSections[getModuleSectionStateKey(mi, "topics")] = true;
  refreshTopicStructure(mi);
}

async function deleteCourseworkComponent(mi, ci, event) {
  if (event) event.stopPropagation();
  const components = getCourseworkComponents(mi);
  if (!components[ci]) return;
  const confirmed = await appConfirm({ label: "Coursework", title: "Delete coursework component?", message: components[ci].name || "This component will be removed.", confirmText: "Delete", danger: true });
  if (!confirmed) return;
  components.splice(ci, 1);
  save();
  buildModules();
  updateGlobal();
}

async function removeExam(index) {
  const store = getStore();
  if (!store.customExams[index]) return;
  const confirmed = await appConfirm({ label: "Deadline", title: "Remove deadline?", message: store.customExams[index].mod || "This deadline will be removed.", confirmText: "Remove", danger: true });
  if (!confirmed) return;
  store.customExams.splice(index, 1);
  save();
  renderStickyExams();
  renderDeadlineTimeline();
}

document.addEventListener("keydown", (event) => {
  const activeTag = document.activeElement?.tagName;
  const canUseHistoryKeys = activeTag !== "INPUT" && activeTag !== "TEXTAREA" && !document.activeElement?.isContentEditable;
  if ((event.ctrlKey || event.metaKey) && canUseHistoryKeys) {
    const key = event.key.toLowerCase();
    if (event.shiftKey && key === "z") {
      event.preventDefault();
      redoLastAction();
      return;
    }
    if (!event.shiftKey && key === "z") {
      event.preventDefault();
      undoLastAction();
      return;
    }
  }
  handleSelectedTopicDeleteFromKeyboard(event);
});

/* 11-boot.js */
// Wait for Supabase to check/restore the session before showing login or the dashboard.
(async function bootApp() {
  setAuthLoading(true, "Restoring your session...", "Checking whether you are already signed in before showing anything.");
  await waitForInitialAuth();

  if (!supabaseClient) {
    setAuthLoading(false);
    updateAuthLock();
    renderCloudUnavailableGate();
    setInterval(renderStickyExams, 1000);
    return;
  }

  if (!currentUser) {
    setAuthLoading(false);
    updateAuthLock();
    renderAuthGate("login");
    setInterval(renderStickyExams, 1000);
    return;
  }

  clearLogoutFlagForSignedInUser();

  setAuthLoading(true, "Loading your tracker...", isPendingNewAccount(currentUser?.email)
    ? "Preparing your setup so the first screen feels like yours."
    : "Pulling your saved modules, marks, deadlines, and preferences.");
  cloudReady = false;
  pendingFirstRunSetup = false;
  await loadCloudSave();
  pendingFirstRunSetup = cloudLoadSucceeded && !cloudHadSave;
  if (pendingFirstRunSetup) {
    resetLocalAppState();
    cloudReady = true;
  }

  setAuthLoading(false);
  updateAuthLock();
  refreshAppAfterAuth();

  setTimeout(() => {
    if (currentUser && document.getElementById("template-splash")?.classList.contains("hidden")) {
      showDeadlineSplash();
    }
  }, 500);

  setInterval(renderStickyExams, 1000);
})();