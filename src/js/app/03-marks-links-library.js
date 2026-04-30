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
function libraryStateIsPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function libraryUniqueSortedPaths(paths) {
  const out = new Set();
  (paths || []).forEach((path) => {
    const clean = normaliseLibraryFolderPath(path);
    if (!clean) return;
    const parts = clean.split("/");
    parts.forEach((_, index) => out.add(parts.slice(0, index + 1).join("/")));
  });
  return Array.from(out).sort((a, b) => a.localeCompare(b));
}
function ensureLibraryRegistryArray(container, key) {
  if (!Array.isArray(container[key])) container[key] = [];
  container[key] = libraryUniqueSortedPaths(container[key]);
  return container[key];
}
function ensureLibraryState() {
  const store = getStore();
  if (!store) return null;
  if (!store.libraryFolders || !libraryStateIsPlainObject(store.libraryFolders)) {
    store.libraryFolders = { formula: {}, relevant: {}, custom: {} };
  }
  if (!libraryStateIsPlainObject(store.libraryFolders.formula)) store.libraryFolders.formula = {};
  if (!libraryStateIsPlainObject(store.libraryFolders.relevant)) store.libraryFolders.relevant = {};
  if (!libraryStateIsPlainObject(store.libraryFolders.custom)) store.libraryFolders.custom = {};

  const moduleCount = Array.isArray(store.modules) ? store.modules.length : MODULES.length;
  for (let mi = 0; mi < moduleCount; mi += 1) {
    const formulaRegistry = ensureLibraryRegistryArray(store.libraryFolders.formula, String(mi));
    const relevantRegistry = ensureLibraryRegistryArray(store.libraryFolders.relevant, String(mi));
    libraryUniqueSortedPaths(getFormulaLinks(mi).map((item) => item?.folder)).forEach((path) => {
      if (!formulaRegistry.includes(path)) formulaRegistry.push(path);
    });
    libraryUniqueSortedPaths(getRelevantLinks(mi).map((item) => item?.folder)).forEach((path) => {
      if (!relevantRegistry.includes(path)) relevantRegistry.push(path);
    });
    store.libraryFolders.formula[String(mi)] = libraryUniqueSortedPaths(formulaRegistry);
    store.libraryFolders.relevant[String(mi)] = libraryUniqueSortedPaths(relevantRegistry);
  }

  const customLibraries = getCustomLibraries();
  Object.keys(customLibraries).forEach((customId) => {
    if (!store.libraryFolders.custom[customId] || !libraryStateIsPlainObject(store.libraryFolders.custom[customId])) {
      store.libraryFolders.custom[customId] = { formula: [], relevant: [] };
    }
    const customFolderStore = store.libraryFolders.custom[customId];
    const formulaRegistry = ensureLibraryRegistryArray(customFolderStore, "formula");
    const relevantRegistry = ensureLibraryRegistryArray(customFolderStore, "relevant");
    libraryUniqueSortedPaths(getCustomLibraryItems(customId, "formula").map((item) => item?.folder)).forEach((path) => {
      if (!formulaRegistry.includes(path)) formulaRegistry.push(path);
    });
    libraryUniqueSortedPaths(getCustomLibraryItems(customId, "relevant").map((item) => item?.folder)).forEach((path) => {
      if (!relevantRegistry.includes(path)) relevantRegistry.push(path);
    });
    customFolderStore.formula = libraryUniqueSortedPaths(formulaRegistry);
    customFolderStore.relevant = libraryUniqueSortedPaths(relevantRegistry);
  });
  return store.libraryFolders;
}
function setLibraryItemFolder(type, itemIndex, folderPath) {
  const clean = normaliseLibraryFolderPath(folderPath);
  const items = getLibrarySourceArray(type);
  if (!Array.isArray(items) || !items[itemIndex]) return false;
  items[itemIndex].folder = clean;
  if (clean) addLibraryFolderToRegistry(type, clean);
  ensureLibraryState();
  save();
  renderModuleLibrary();
  return true;
}
window.unitrackEnsureLibraryState = ensureLibraryState;
window.unitrackGetActiveLibraryTarget = getLibraryTarget;
window.unitrackSetItemFolder = setLibraryItemFolder;
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
  syncModalScrollLock();
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
    syncModalScrollLock();
    return;
  }
  syncModalScrollLock();
}

function saveLinkForm() {
  if (!linkFormContext) return;
  ensureLibraryState();
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
  if (url) openTrustedUrl(url);
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
  const browseTile = remaining.length ? `<button class="library-v10-source-browse-tile ${showAll ? "active" : ""}" type="button" onclick="libraryCleanToggleAllSources(event)">
      <span class="library-v10-source-browse-kicker">Discover</span>
      <strong>Browse Libraries</strong>
      <span class="library-v10-source-browse-meta">${remaining.length} more librar${remaining.length === 1 ? "y" : "ies"} beyond quick access</span>
    </button>` : "";

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
    </div>
    <div class="library-v10-source-rail library-v10-source-rail-quick">
      ${quickAccess.map((source, index) => `${sourceCardHtml(source, { compact: true })}${index === 0 ? browseTile : ""}`).join("")}
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
  if (found?.item?.url) openTrustedUrl(found.item.url);
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
  ensureLibraryState();
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
  window.unitrackEnhanceLibraryDom?.();
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
  ensureLibraryState();
  materialLibraryModuleIndex = mi;
  moduleLibrarySearch = "";
  if (Number.isInteger(mi)) libraryCleanSetSource(`module:${mi}`, { silent: true });
  else libraryCleanSetSource("all", { silent: true });
  document.getElementById("module-library-modal")?.classList.remove("hidden");
  syncModalScrollLock();
  renderModuleLibrary();
}

function closeModuleLibrary() {
  document.getElementById("module-library-modal")?.classList.add("hidden");
  materialLibraryModuleIndex = null;
  moduleLibraryScopeMi = null;
  moduleLibraryScopeCustomId = null;
  syncModalScrollLock();
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
