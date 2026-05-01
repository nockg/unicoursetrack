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
let authScreenLoading = false;
let authLoadingTitle = "Restoring your session...";
let authLoadingMessage = "Checking whether you are already signed in before showing anything.";
let deadlineSplashShownThisLoad = false;
let welcomeSplashShownThisLoad = false;
let calendarComposerPrefill = null;
let todoPanelDrag = null;
let todoPanelResizeObserver = null;
let todoPanelResize = null;
