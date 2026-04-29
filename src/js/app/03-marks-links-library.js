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

const AU4_GRADE_OPTIONS = [
  { code: "HD", value: 4, label: "High Distinction", short: "HD" },
  { code: "D", value: 3, label: "Distinction", short: "D" },
  { code: "CR", value: 2, label: "Credit", short: "Credit" },
  { code: "P", value: 1, label: "Pass", short: "Pass" },
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

const US43_GRADE_OPTIONS = [
  { code: "A+", value: 4.3, label: "A+" },
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
  { code: "D+", value: 0, label: "D+" },
  { code: "D", value: 0, label: "D" },
  { code: "D-", value: 0, label: "D-" },
  { code: "E", value: 0, label: "E" }
];

// Grade thresholds and letter-to-point mappings vary by institution.
// UK honours bands here are the common undergraduate convention, not a strict national degree algorithm.
// AU HD cutoffs are commonly 85%, but some universities, such as Monash, use 80%.
// US 4.00 is the mainstream transcript model; us43 covers outliers that give A+ = 4.3.
// Malaysia values below represent one common 4.0 style; universities differ on details such as A-=3.67 vs 3.70.
// China GPA conversion is especially institution-specific, so cn4 is a common 4.0 conversion with direct 0-4 input.
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
  au4: AU4_GRADE_OPTIONS,
  us4: US_GRADE_OPTIONS,
  us43: US43_GRADE_OPTIONS,
  my4: MY_GRADE_OPTIONS,
  cn4: CN_GRADE_OPTIONS,
  nz9: NZ_GRADE_OPTIONS,
  de5: DE_GRADE_OPTIONS
};

function normaliseGradeCode(value) {
  return String(value ?? "").trim().toUpperCase();
}

function parseCustomGradeMapping(text) {
  return String(text || "")
    .split(/[,;\n]+/)
    .map((entry) => {
      const match = entry.trim().match(/^(.+?)(?:=|:)\s*(-?\d+(?:\.\d+)?)$/);
      if (!match) return null;
      const code = normaliseGradeCode(match[1]);
      const value = parseFloat(match[2]);
      if (!code || !Number.isFinite(value)) return null;
      return { code, value, label: code };
    })
    .filter(Boolean);
}

function serializeGradeMapping(options) {
  return (options || [])
    .map((option) => `${option.code}=${Number(option.value).toFixed(2)}`)
    .join(", ");
}

function getCustomGradeOptions() {
  const mapping = state.profile?.customGradeMapping;
  if (Array.isArray(mapping) && mapping.length) {
    return mapping
      .map((option) => ({
        code: normaliseGradeCode(option.code),
        value: parseFloat(option.value),
        label: normaliseGradeCode(option.label || option.code)
      }))
      .filter((option) => option.code && Number.isFinite(option.value));
  }
  return deepClone(US_GRADE_OPTIONS);
}

function getMaxGradePoint(system = getGradingSystem()) {
  const options = getGradeOptions(system);
  const max = Math.max(...(options || []).map((option) => Number(option.value)).filter(Number.isFinite));
  return Number.isFinite(max) ? max : getGradeScaleConfig(system).max;
}

function getGradePointMap(system = getGradingSystem()) {
  const options = getGradeOptions(system);
  if (!options) return null;
  return options.reduce((map, option) => {
    map[normaliseGradeCode(option.code)] = option;
    return map;
  }, {});
}

function getGradeOptions(system = getGradingSystem()) {
  if (system === "custom") return getCustomGradeOptions();
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
  if (system === "au7" || system === "au4") return plural ? "units" : "unit";
  if (system === "us4" || system === "us43") return plural ? "GPA hours" : "GPA hour";
  if (system === "my4") return plural ? "credit hours" : "credit hour";
  if (system === "nz9") return plural ? "points" : "point";
  if (system === "de5") return "ECTS";
  return plural ? "credits" : "credit";
}

function getModuleCreditFieldLabel(system = getGradingSystem()) {
  if (system === "au7" || system === "au4") return "Units / Credit Points";
  if (system === "us4" || system === "us43") return "Credit Hours / GPA Hours";
  if (system === "my4") return "Credit Hours";
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
  if (system === "us43") {
    return {
      min: 0,
      max: 4.3,
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
  if (system === "au4") {
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
  if (system === "custom") {
    return {
      min: 0,
      max: Math.max(...getCustomGradeOptions().map((option) => option.value), 4),
      step: "0.01",
      suffix: "points",
      finalLabel: "Course Grade",
      markLabel: "Grade",
      placeholder: "Select grade"
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

function classifyAu4Gpa(mark) {
  if (mark >= 3.5) return { label: "HD", badge: "High Distinction", cls: "cls-s-first", heroCls: "cls-first" };
  if (mark >= 2.5) return { label: "D", badge: "Distinction", cls: "cls-s-21", heroCls: "cls-21" };
  if (mark >= 1.5) return { label: "Credit", badge: "Credit", cls: "cls-s-22", heroCls: "cls-22" };
  if (mark >= 1.0) return { label: "Pass", badge: "Pass", cls: "cls-s-third", heroCls: "cls-third" };
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
  if (mark <= 1.5) return { label: "Very Good", badge: "Very Good", cls: "cls-s-first", heroCls: "cls-first" };
  if (mark <= 2.5) return { label: "Good", badge: "Good", cls: "cls-s-21", heroCls: "cls-21" };
  if (mark <= 3.5) return { label: "Satisfactory", badge: "Satisfactory", cls: "cls-s-22", heroCls: "cls-22" };
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
  if (["us4", "us43", "my4"].includes(system)) {
    const exact = options.courseDisplay ? getGradeOption(system, options.rawValue) : null;
    const grade = exact || classifyFourPointGpa(mark);
    const pointLabel = system === "us4" || system === "us43" ? "quality points" : "grade points";
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
  if (system === "au4") {
    const exact = options.courseDisplay ? getGradeOption(system, options.rawValue) : null;
    const grade = exact || classifyAu4Gpa(mark);
    if (options.courseDisplay) {
      return {
        main: grade.short || grade.label || exact?.code || "-",
        label: `${mark.toFixed(2)} grade points`,
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
      secondary: ""
    };
  }
  if (system === "custom") {
    const exact = options.courseDisplay ? getGradeOption(system, options.rawValue) : null;
    const grade = exact || { label: "Custom", badge: "Custom", cls: "", heroCls: "" };
    if (options.courseDisplay) {
      return {
        main: grade.label || exact?.code || "-",
        label: `${mark.toFixed(2)} grade points`,
        secondary: ""
      };
    }
    return {
      main: `${mark.toFixed(2)} points`,
      label: grade.label,
      secondary: "Custom mapping"
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

function normalizeLibraryItem(item, fallbackName = "Saved item") {
  if (typeof item === "string") {
    return { name: fallbackName, url: item, tag: "", notes: "", folder: "" };
  }
  if (!item || typeof item !== "object") {
    return { name: fallbackName, url: "", tag: "", notes: "", folder: "" };
  }
  return {
    name: String(item.name || item.title || fallbackName).trim() || fallbackName,
    url: String(item.url || item.href || "").trim(),
    tag: String(item.tag || item.category || "").trim(),
    notes: String(item.notes || item.note || "").trim(),
    folder: String(item.folder || item.subfolder || "").trim()
  };
}

function normalizeLibraryFolderName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function getLibraryFolderLabel(value) {
  return normalizeLibraryFolderName(value) || "Unfiled";
}

function getLibraryFolderValue(item) {
  return normalizeLibraryFolderName(item?.folder || "");
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

function getLibraryFolderStore() {
  const store = getStore();
  if (!store.libraryFolders || typeof store.libraryFolders !== "object" || Array.isArray(store.libraryFolders)) {
    store.libraryFolders = {};
  }
  return store.libraryFolders;
}

function getLibraryTargetKey(target) {
  if (target?.customId) return `custom:${target.customId}`;
  if (Number.isInteger(target?.mi)) return `module:${target.mi}`;
  return "all";
}

function getActiveLibraryTarget() {
  if (moduleLibraryScopeCustomId) return { customId: moduleLibraryScopeCustomId, mi: null };
  if (moduleLibraryScopeMi !== null) return { customId: null, mi: moduleLibraryScopeMi };
  return parseLibraryFilterValue(moduleLibraryFilter);
}

function getRegisteredLibraryFolders(target, type = null) {
  const folders = getLibraryFolderStore()[getLibraryTargetKey(target)];
  if (Array.isArray(folders)) return folders.map(normalizeLibraryFolderName).filter(Boolean);
  if (!folders || typeof folders !== "object") return [];
  const collect = type ? folders[type] : [...(folders.formula || []), ...(folders.relevant || [])];
  return Array.isArray(collect) ? collect.map(normalizeLibraryFolderName).filter(Boolean) : [];
}

function setRegisteredLibraryFolders(target, type, folderNames) {
  const folders = getLibraryFolderStore();
  const key = getLibraryTargetKey(target);
  const current = folders[key];
  const legacy = Array.isArray(current) ? current.map(normalizeLibraryFolderName).filter(Boolean) : [];
  const next = !current || Array.isArray(current) ? { formula: legacy.slice(), relevant: legacy.slice() } : current;
  const unique = [];
  (folderNames || []).map(normalizeLibraryFolderName).filter(Boolean).forEach((folder) => {
    if (!unique.some((item) => item.toLowerCase() === folder.toLowerCase())) unique.push(folder);
  });
  next[type] = unique;
  folders[key] = next;
}

function addRegisteredLibraryFolder(target, folderName, type = "formula") {
  const name = normalizeLibraryFolderName(folderName);
  if (!name) return;
  const current = getRegisteredLibraryFolders(target, type);
  if (!current.some((folder) => folder.toLowerCase() === name.toLowerCase())) current.push(name);
  setRegisteredLibraryFolders(target, type, current);
}

function removeRegisteredLibraryFolder(target, folderName, type = "formula") {
  const name = normalizeLibraryFolderName(folderName);
  if (!name) return;
  const current = getRegisteredLibraryFolders(target, type)
    .filter((folder) => folder.toLowerCase() !== name.toLowerCase());
  setRegisteredLibraryFolders(target, type, current);
}

function getCurrentLibraryFolderNames(type = null) {
  const target = getActiveLibraryTarget();
  const folderMap = new Map();
  const addFolder = (folder) => {
    const name = normalizeLibraryFolderName(folder);
    if (name) folderMap.set(name.toLowerCase(), name);
  };
  const types = type ? [type] : ["formula", "relevant"];
  types.forEach((folderType) => {
    getRegisteredLibraryFolders(target, folderType).forEach(addFolder);
    getModuleLibraryItems(folderType, moduleLibraryScopeMi, { applyFolder: false, applySearch: false }).forEach((item) => addFolder(item.folder));
  });
  return Array.from(folderMap.values()).sort((a, b) => a.localeCompare(b));
}

function getModuleLibraryFolderFilter(type) {
  if (!moduleLibraryFolderFilters || typeof moduleLibraryFolderFilters !== "object") {
    moduleLibraryFolderFilters = { formula: "all", relevant: "all" };
  }
  return moduleLibraryFolderFilters[type] || "all";
}

function setModuleLibraryFolderFilter(type, folder) {
  if (!moduleLibraryFolderFilters || typeof moduleLibraryFolderFilters !== "object") {
    moduleLibraryFolderFilters = { formula: "all", relevant: "all" };
  }
  moduleLibraryFolderFilters[type] = String(folder || "all");
  moduleLibraryFolderFilter = moduleLibraryFolderFilters[type];
}

function resetModuleLibraryFolderNavigation() {
  moduleLibraryFolderFilter = "all";
  moduleLibraryFolderFilters = { formula: "all", relevant: "all" };
  moduleLibraryFolderHistory = { formula: ["all"], relevant: ["all"] };
  moduleLibraryFolderHistoryIndex = { formula: 0, relevant: 0 };
  moduleLibrarySelectedFolders = { formula: null, relevant: null };
  moduleLibraryActiveFolderType = "formula";
}

function ensureModuleLibraryFolderHistory(type) {
  if (!moduleLibraryFolderHistory || typeof moduleLibraryFolderHistory !== "object") {
    moduleLibraryFolderHistory = { formula: ["all"], relevant: ["all"] };
  }
  if (!moduleLibraryFolderHistoryIndex || typeof moduleLibraryFolderHistoryIndex !== "object") {
    moduleLibraryFolderHistoryIndex = { formula: 0, relevant: 0 };
  }
  if (!Array.isArray(moduleLibraryFolderHistory[type])) moduleLibraryFolderHistory[type] = ["all"];
  if (!Number.isInteger(moduleLibraryFolderHistoryIndex[type])) moduleLibraryFolderHistoryIndex[type] = moduleLibraryFolderHistory[type].length - 1;
}

function navigateLibraryFolder(type, folder, options = {}) {
  const next = String(folder || "all");
  ensureModuleLibraryFolderHistory(type);
  setModuleLibraryFolderFilter(type, next);
  moduleLibraryActiveFolderType = type;
  moduleLibrarySelectedFolders[type] = null;
  if (options.record !== false) {
    const history = moduleLibraryFolderHistory[type];
    let index = moduleLibraryFolderHistoryIndex[type];
    if (history[index] !== next) {
      history.splice(index + 1);
      history.push(next);
      moduleLibraryFolderHistoryIndex[type] = history.length - 1;
    }
  }
}

function canNavigateLibraryFolder(type, direction) {
  ensureModuleLibraryFolderHistory(type);
  const index = moduleLibraryFolderHistoryIndex[type];
  return direction < 0 ? index > 0 : index < moduleLibraryFolderHistory[type].length - 1;
}

function goLibraryFolderHistory(type, direction) {
  ensureModuleLibraryFolderHistory(type);
  if (!canNavigateLibraryFolder(type, direction)) return;
  moduleLibraryFolderHistoryIndex[type] += direction;
  navigateLibraryFolder(type, moduleLibraryFolderHistory[type][moduleLibraryFolderHistoryIndex[type]], { record: false });
  if (type === "formula") moduleLibraryMaterialsOpen = true;
  if (type === "relevant") moduleLibraryLinksOpen = true;
  renderModuleLibrary();
}

function getLibraryItemsForTarget(target, type) {
  if (target?.customId) return getCustomLibraryItems(target.customId, type);
  if (Number.isInteger(target?.mi)) return type === "formula" ? getFormulaLinks(target.mi) : getRelevantLinks(target.mi);
  return [];
}

function setLibraryItemsForTarget(target, type, items) {
  const normalisedItems = (items || []).map((item) => normalizeLibraryItem(item, type === "formula" ? "Saved material" : "Useful resource")).filter((item) => item.url);
  if (target?.customId) {
    const library = getCustomLibrary(target.customId);
    if (!library) return;
    const key = type === "formula" ? "materials" : "relevantLinks";
    library[key] = normalisedItems;
    return;
  }
  if (!Number.isInteger(target?.mi)) return;
  const store = getStore();
  if (type === "formula") {
    if (normalisedItems.length) store.formulas[target.mi] = normalisedItems;
    else delete store.formulas[target.mi];
  } else {
    if (!store.relevantLinks) store.relevantLinks = {};
    if (normalisedItems.length) store.relevantLinks[target.mi] = normalisedItems;
    else delete store.relevantLinks[target.mi];
  }
}

function isConcreteLibraryTarget(target = getActiveLibraryTarget()) {
  return !!target?.customId || Number.isInteger(target?.mi);
}

function getSelectedLibraryFolder(type = moduleLibraryActiveFolderType) {
  if (!moduleLibrarySelectedFolders || typeof moduleLibrarySelectedFolders !== "object") {
    moduleLibrarySelectedFolders = { formula: null, relevant: null };
  }
  return moduleLibrarySelectedFolders[type] || null;
}

function selectLibraryFolder(type, encodedFolder, event) {
  if (event) event.stopPropagation();
  const folder = decodeURIComponent(String(encodedFolder || ""));
  if (!folder) return;
  if (!moduleLibrarySelectedFolders || typeof moduleLibrarySelectedFolders !== "object") {
    moduleLibrarySelectedFolders = { formula: null, relevant: null };
  }
  moduleLibraryActiveFolderType = type;
  moduleLibrarySelectedFolders[type] = folder;
  document.querySelectorAll(`.module-library-folder-tile[data-folder-type="${type}"]`).forEach((tile) => {
    tile.classList.toggle("selected", tile.dataset.folderKey === folder);
  });
  event?.currentTarget?.focus?.();
}

function handleModuleLibraryKeydown(event) {
  const modal = document.getElementById("module-library-modal");
  if (!modal || modal.classList.contains("hidden")) return;
  const tag = event.target?.tagName;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tag) || event.target?.isContentEditable) return;
  const type = moduleLibraryActiveFolderType || "formula";
  const selected = getSelectedLibraryFolder(type);
  const encoded = selected ? encodeURIComponent(selected) : "";
  if (event.altKey && event.key === "ArrowLeft") {
    event.preventDefault();
    goLibraryFolderHistory(type, -1);
    return;
  }
  if (event.altKey && event.key === "ArrowRight") {
    event.preventDefault();
    goLibraryFolderHistory(type, 1);
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
    event.preventDefault();
    pasteLibraryFolder(type, event);
    return;
  }
  if (!selected) return;
  if (event.key === "Enter") {
    event.preventDefault();
    openLibraryFolder(type, encoded);
  } else if (event.key === "F2") {
    event.preventDefault();
    renameLibraryFolder(type, encoded, event);
  } else if (event.key === "Delete") {
    event.preventDefault();
    deleteLibraryFolder(type, encoded, event);
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
    event.preventDefault();
    copyLibraryFolder(type, encoded, event);
  }
}

function getLibraryContextLabel(context) {
  if (context?.customId) return getCustomLibrary(context.customId)?.name || "Custom Library";
  const mod = MODULES[context?.mi];
  return mod?.short || mod?.kanji || "Module";
}

function parseLibraryFilterValue(value) {
  const raw = String(value || "all");
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
  if (system === "us4" || system === "us43" || system === "my4" || system === "cn4") return classifyFourPointGpa(mark);
  if (system === "au7") return classifyAuGpa(mark);
  if (system === "au4") return classifyAu4Gpa(mark);
  if (system === "nz9") return classifyNzGpa(mark);
  if (system === "de5") return classifyGermanGrade(mark);
  if (system === "custom") return { label: "Custom", badge: "Custom", cls: "", heroCls: "" };
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
  if (!["us4", "us43"].includes(getGradingSystem())) return null;
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
  if (system === "custom") return "Weighted points";
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
      : system === "custom"
        ? "Cumulative weighted points"
        : "Cumulative GPA";
  let text = `${metric} based on ${aggregate.credits} / ${totalCredits} ${unitLabel}`;
  if (system !== "uk" && system !== "de5") text += ` · Total grade points ${aggregate.gradePoints.toFixed(2)}`;
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
  const folderInput = document.getElementById("link-folder-input");
  const tagInput = document.getElementById("link-tag-input");
  const notesInput = document.getElementById("link-notes-input");

  nameInput.value = "";
  urlInput.value = "";
  folderInput.value = normalizeLibraryFolderName(context.folder || "");
  tagInput.value = "";
  notesInput.value = "";
  nameField.style.display = "block";

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
  } else if (context.type === "formula") {
    subtitle.textContent = "Module Material";
    title.textContent = context.mode === "edit" ? "Edit Module Material" : "Add Module Material";
    nameInput.value = editingItem?.name || (getLibraryContextLabel(context) + " Material");
    tagInput.closest(".deadline-form-row").style.display = "grid";
  } else {
    subtitle.textContent = "Relevant Links";
    title.textContent = context.mode === "edit" ? "Edit Relevant Link" : "Add Relevant Link";
    nameInput.value = editingItem?.name || "Useful resource";
    tagInput.closest(".deadline-form-row").style.display = "grid";
  }

  if (editingItem) {
    urlInput.value = editingItem.url || "";
    folderInput.value = editingItem.folder || "";
    tagInput.value = editingItem.tag || "";
    notesInput.value = editingItem.notes || "";
  }

  modal.classList.remove("hidden");
  setTimeout(() => (nameField.style.display === "none" ? urlInput : nameInput).focus(), 0);
}

function closeLinkForm() {
  document.getElementById("link-form-modal").classList.add("hidden");
  linkFormContext = null;
}

function saveLinkForm() {
  if (!linkFormContext) return;
  const nameInput = document.getElementById("link-name-input");
  const urlInput = document.getElementById("link-url-input");
  const folderInput = document.getElementById("link-folder-input");
  const tagInput = document.getElementById("link-tag-input");
  const notesInput = document.getElementById("link-notes-input");
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
  const folder = normalizeLibraryFolderName(folderInput.value);
  const tag = (tagInput.value || "").trim();
  const notes = (notesInput.value || "").trim();
  if (!name || !url) {
    alert("Please enter both a name and a URL.");
    return;
  }
  const payload = { name, url: safeUrl(url), folder, tag, notes };
  const activeTarget = linkFormContext.customId
    ? { customId: linkFormContext.customId, mi: null }
    : { customId: null, mi: linkFormContext.mi };
  if (folder) addRegisteredLibraryFolder(activeTarget, folder, linkFormContext.type);

  if (linkFormContext.customId) {
    const libraries = getCustomLibraries();
    const library = libraries[linkFormContext.customId];
    if (!library) return;
    const key = linkFormContext.type === "formula" ? "materials" : "relevantLinks";
    const items = getCustomLibraryItems(linkFormContext.customId, linkFormContext.type).slice();
    if (linkFormContext.mode === "edit" && items[linkFormContext.index]) items[linkFormContext.index] = payload;
    else items.push(payload);
    library[key] = items;
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
  const applyFolder = options.applyFolder !== false;
  const applySearch = options.applySearch !== false;
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
        folder: item.folder || "",
        tag: item.tag || "",
        notes: item.notes || ""
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
        folder: item.folder || "",
        tag: item.tag || "",
        notes: item.notes || ""
      });
    });
  });
  const search = applySearch ? moduleLibrarySearch.trim().toLowerCase() : "";
  const filter = moduleLibraryScopeMi === null && !moduleLibraryScopeCustomId ? moduleLibraryFilter : (moduleLibraryScopeCustomId ? `custom:${moduleLibraryScopeCustomId}` : String(moduleLibraryScopeMi));
  return items.filter((item) => {
    if (filter !== "all") {
      if (filter.startsWith("custom:")) {
        if (item.customId !== filter.slice(7)) return false;
      } else if (String(item.mi) !== filter) return false;
    }
    const activeFolder = getModuleLibraryFolderFilter(type);
    if (applyFolder && activeFolder !== "all") {
      const itemFolder = getLibraryFolderValue(item) || "__unfiled";
      if (itemFolder.toLowerCase() !== activeFolder.toLowerCase()) return false;
    }
    if (!search) return true;
    return [item.name, item.url, item.folder, item.tag, item.notes, item.moduleCode, item.moduleName]
      .join(" ")
      .toLowerCase()
      .includes(search);
  });
}

function toggleModuleLibraryLinks() {
  moduleLibraryLinksOpen = !moduleLibraryLinksOpen;
  renderModuleLibrary();
}

function toggleModuleLibraryMaterials() {
  moduleLibraryMaterialsOpen = !moduleLibraryMaterialsOpen;
  renderModuleLibrary();
}

function buildModuleLibraryCard(item) {
  const notes = item.notes ? `<div class="module-library-card-notes">${escapeHtml(item.notes)}</div>` : "";
  const folder = `<span class="module-library-pill module-library-folder-pill">${escapeHtml(getLibraryFolderLabel(item.folder))}</span>`;
  const tag = item.tag ? `<span class="module-library-pill">${escapeHtml(item.tag)}</span>` : "";
  const accent = item.customId ? { stripe: "var(--gold2)" } : getModuleColourSet(item.mi);
  const contextArg = item.customId ? `'custom:${escapeHtml(item.customId)}'` : item.mi;
  return `
    <article class="module-library-card" onclick="openLibraryItem(${contextArg}, '${item.type}', ${item.index}, event)">
      <div class="module-library-module-accent" style="background:${accent.stripe};"></div>
      <div class="module-library-card-head">
        <div>
          <div class="module-library-card-title">${escapeHtml(item.name)}</div>
          <div class="module-library-card-meta">
            <span class="module-library-pill">${escapeHtml(item.moduleCode)}</span>
            ${folder}
            ${tag}
          </div>
        </div>
      </div>
      ${notes}
      <div class="module-library-card-actions">
        <button class="mini-btn" type="button" onclick="editLibraryItem(${contextArg}, '${item.type}', ${item.index}, event)">Edit</button>
        <button class="mini-btn module-delete-btn" type="button" onclick="deleteLibraryItem(${contextArg}, '${item.type}', ${item.index}, event)">Delete</button>
      </div>
    </article>
  `;
}

function buildModuleLibraryFolderGroups(items) {
  if (!items.length) return "";
  const groups = [];
  items.forEach((item) => {
    const folder = getLibraryFolderValue(item);
    const key = folder || "__unfiled";
    let group = groups.find((entry) => entry.key.toLowerCase() === key.toLowerCase());
    if (!group) {
      group = { key, label: getLibraryFolderLabel(folder), items: [] };
      groups.push(group);
    }
    group.items.push(item);
  });
  groups.sort((a, b) => {
    if (a.key === "__unfiled") return 1;
    if (b.key === "__unfiled") return -1;
    return a.label.localeCompare(b.label);
  });
  return groups.map((group) => `
    <div class="module-library-folder-group">
      <div class="module-library-folder-head">
        <span class="module-library-folder-icon" aria-hidden="true"></span>
        <span>${escapeHtml(group.label)}</span>
        <span class="module-library-folder-count">${group.items.length}</span>
      </div>
      <div class="module-library-folder-items ${moduleLibraryViewMode === "cards" ? "cards" : ""}">
        ${group.items.map(buildModuleLibraryCard).join("")}
      </div>
    </div>
  `).join("");
}

function getLibraryFolderGroups(items, type) {
  const groups = [];
  getCurrentLibraryFolderNames(type).forEach((folder) => {
    const key = normalizeLibraryFolderName(folder);
    if (!groups.some((entry) => entry.key.toLowerCase() === key.toLowerCase())) {
      groups.push({ key, label: getLibraryFolderLabel(key), items: [] });
    }
  });
  items.forEach((item) => {
    const folder = getLibraryFolderValue(item);
    const key = folder || "__unfiled";
    let group = groups.find((entry) => entry.key === key);
    if (!group) {
      group = { key, label: getLibraryFolderLabel(folder), items: [] };
      groups.push(group);
    }
    group.items.push(item);
  });
  return groups.sort((a, b) => {
    if (a.key === "__unfiled") return 1;
    if (b.key === "__unfiled") return -1;
    return a.label.localeCompare(b.label);
  });
}

function buildModuleLibraryFolderNav(type, labelOverride = "") {
  const activeFolder = getModuleLibraryFolderFilter(type);
  const label = labelOverride || (activeFolder === "all" ? "Folders" : getLibraryFolderLabel(activeFolder === "__unfiled" ? "" : activeFolder));
  const backDisabled = canNavigateLibraryFolder(type, -1) ? "" : " disabled";
  const forwardDisabled = canNavigateLibraryFolder(type, 1) ? "" : " disabled";
  return `
    <div class="module-library-folder-nav">
      <div class="module-library-folder-nav-left">
        <button class="mini-btn" type="button" onclick="goLibraryFolderHistory('${type}', -1)"${backDisabled}>Back</button>
        <button class="mini-btn" type="button" onclick="goLibraryFolderHistory('${type}', 1)"${forwardDisabled}>Forward</button>
        <button class="mini-btn" type="button" onclick="openLibraryFolder('${type}', 'all')">Folders</button>
        <span class="module-library-folder-path">${escapeHtml(label)}</span>
      </div>
    </div>
  `;
}

function buildModuleLibraryFolderTiles(items, type) {
  const groups = getLibraryFolderGroups(items, type);
  if (!groups.length) return "";
  const canManage = isConcreteLibraryTarget();
  return `
    <div class="module-library-folder-browser">
      ${groups.map((group) => {
        const encoded = encodeURIComponent(group.key);
        const selected = getSelectedLibraryFolder(type) === group.key ? " selected" : "";
        const disabledClass = canManage ? "" : " readonly";
        return `
          <button class="module-library-folder-tile${selected}${disabledClass}" type="button" data-folder-type="${type}" data-folder-key="${escapeHtml(group.key)}" onclick="selectLibraryFolder('${type}', '${encoded}', event)" ondblclick="openLibraryFolder('${type}', '${encoded}')">
            <span class="module-library-folder-icon" aria-hidden="true"></span>
            <span class="module-library-folder-tile-main">
              <span class="module-library-folder-tile-name">${escapeHtml(group.label)}</span>
              <span class="module-library-folder-tile-meta">${group.items.length} ${group.items.length === 1 ? "item" : "items"}</span>
            </span>
          </button>
        `;
      }).join("")}
    </div>
  `;
}

function buildModuleLibraryFolderView(items, type, emptyText) {
  const searchActive = !!moduleLibrarySearch.trim();
  const activeFolder = getModuleLibraryFolderFilter(type);
  const groups = getLibraryFolderGroups(items, type);
  if (!items.length && !groups.length && !searchActive && activeFolder === "all") return buildModuleLibraryFolderNav(type) + `<div class="module-library-empty">${emptyText}</div>`;
  if (!searchActive && activeFolder === "all") return buildModuleLibraryFolderNav(type) + buildModuleLibraryFolderTiles(items, type);
  const folderLabel = activeFolder === "all" ? "Search results" : getLibraryFolderLabel(activeFolder === "__unfiled" ? "" : activeFolder);
  const activeHead = buildModuleLibraryFolderNav(type, folderLabel);
  if (!items.length) return activeHead + `<div class="module-library-empty">${emptyText}</div>`;
  return activeHead + items.map(buildModuleLibraryCard).join("");
}

function refreshModuleLibraryFilterOptions() {
  const filter = document.getElementById("module-library-filter");
  if (!filter) return;
  if (moduleLibraryScopeCustomId) {
    const library = getCustomLibrary(moduleLibraryScopeCustomId);
    filter.innerHTML = `<option value="custom:${escapeHtml(moduleLibraryScopeCustomId)}">${escapeHtml(library?.name || "Custom Library")}</option>`;
    filter.value = `custom:${moduleLibraryScopeCustomId}`;
    filter.disabled = true;
    return;
  }
  if (moduleLibraryScopeMi !== null) {
    const mod = MODULES[moduleLibraryScopeMi];
    filter.innerHTML = `<option value="${moduleLibraryScopeMi}">${escapeHtml(mod?.kanji || mod?.name || "Current Module")}</option>`;
    filter.value = String(moduleLibraryScopeMi);
    filter.disabled = true;
    return;
  }
  filter.disabled = false;
  const customOptions = Object.entries(getCustomLibraries()).map(([id, library]) => (
    `<option value="custom:${escapeHtml(id)}">${escapeHtml(library.name || "Custom Library")}</option>`
  )).join("");
  filter.innerHTML = `<option value="all">All Libraries</option>` + MODULES.map((mod, mi) => (
    `<option value="${mi}">${escapeHtml(mod.kanji || mod.name || `Module ${mi + 1}`)}</option>`
  )).join("") + customOptions;
  filter.value = moduleLibraryFilter;
}

function renderModuleLibrary() {
  const materialsHost = document.getElementById("module-library-materials");
  const linksHost = document.getElementById("module-library-links");
  if (!materialsHost || !linksHost) return;
  const title = document.getElementById("module-library-title");
  const currentModule = moduleLibraryScopeMi !== null ? MODULES[moduleLibraryScopeMi] : null;
  const currentCustomLibrary = moduleLibraryScopeCustomId ? getCustomLibrary(moduleLibraryScopeCustomId) : null;
  if (title) title.textContent = currentCustomLibrary
    ? currentCustomLibrary.name || "Custom Library"
    : currentModule
    ? `${currentModule.kanji || currentModule.name || "Module"} Library`
    : "All Libraries";
  document.getElementById("module-library-open-all-btn")?.classList.toggle("hidden", moduleLibraryScopeMi === null && !moduleLibraryScopeCustomId);
  document.getElementById("module-library-delete-custom-btn")?.classList.toggle("hidden", !getActiveCustomLibraryId());
  refreshModuleLibraryFilterOptions();
  ["formula", "relevant"].forEach((type) => {
    const knownFolders = new Set(["all", "__unfiled", ...getCurrentLibraryFolderNames(type)]);
    if (!knownFolders.has(getModuleLibraryFolderFilter(type))) setModuleLibraryFolderFilter(type, "all");
    const selectedFolder = getSelectedLibraryFolder(type);
    if (selectedFolder && !knownFolders.has(selectedFolder)) moduleLibrarySelectedFolders[type] = null;
  });
  const searchInput = document.getElementById("module-library-search");
  if (searchInput && searchInput.value !== moduleLibrarySearch) searchInput.value = moduleLibrarySearch;
  document.getElementById("module-library-view-list")?.classList.toggle("calendar-btn", moduleLibraryViewMode === "list");
  document.getElementById("module-library-view-cards")?.classList.toggle("calendar-btn", moduleLibraryViewMode === "cards");

  const materials = getModuleLibraryItems("formula", moduleLibraryScopeMi);
  const links = getModuleLibraryItems("relevant", moduleLibraryScopeMi);
  const materialWord = materials.length === 1 ? "item" : "items";
  const linkWord = links.length === 1 ? "link" : "links";
  const materialsSection = document.querySelector(".module-library-materials-section");
  const linksSection = linksHost.closest(".module-library-section");
  const materialsCopy = materialsSection?.querySelector(".module-library-section-copy");
  const linksCopy = linksSection?.querySelector(".module-library-section-copy");

  if (materialsSection) materialsSection.classList.toggle("is-collapsed", !moduleLibraryMaterialsOpen);
  if (linksSection) linksSection.classList.toggle("is-collapsed", !moduleLibraryLinksOpen);
  if (materialsCopy) {
    materialsCopy.textContent = moduleLibraryMaterialsOpen
      ? `Formula sheets, worked examples, reference pages, and quick-access study material. ${materials.length} saved ${materialWord}.`
      : `${materials.length} saved material ${materialWord}. Tap to expand.`;
  }
  if (linksCopy) {
    linksCopy.textContent = moduleLibraryLinksOpen
      ? `Useful URLs, portals, videos, docs, and external resources. ${links.length} saved ${linkWord}.`
      : `${links.length} saved relevant ${linkWord}. Tap to expand.`;
  }

  materialsHost.className = "module-library-list" + (moduleLibraryViewMode === "cards" ? " cards" : "") + (moduleLibraryMaterialsOpen ? "" : " hidden");
  linksHost.className = "module-library-list" + (moduleLibraryViewMode === "cards" ? " cards" : "") + (moduleLibraryLinksOpen ? "" : " hidden");
  document.getElementById("module-library-links-chevron")?.classList.toggle("open", moduleLibraryLinksOpen);
  document.getElementById("module-library-materials-chevron")?.classList.toggle("open", moduleLibraryMaterialsOpen);
  materialsHost.innerHTML = buildModuleLibraryFolderView(materials, "formula", "No module material saved yet.");
  linksHost.innerHTML = buildModuleLibraryFolderView(links, "relevant", "No relevant links saved yet.");
}

function openModuleLibrary(mi = null, focus = "both", event) {
  if (event) event.stopPropagation();
  materialLibraryModuleIndex = mi;
  moduleLibraryScopeMi = Number.isInteger(mi) ? mi : null;
  moduleLibraryScopeCustomId = null;
  if (moduleLibraryScopeMi === null) moduleLibraryFilter = "all";
  else moduleLibraryFilter = String(moduleLibraryScopeMi);
  resetModuleLibraryFolderNavigation();
  moduleLibraryMaterialsOpen = false;
  moduleLibraryLinksOpen = false;

  document.getElementById("module-library-modal").classList.remove("hidden");
  renderModuleLibrary();
}

function closeModuleLibrary() {
  document.getElementById("module-library-modal").classList.add("hidden");
  materialLibraryModuleIndex = null;
  moduleLibraryScopeMi = null;
  moduleLibraryScopeCustomId = null;
}

function updateModuleLibrarySearch(value) {
  moduleLibrarySearch = String(value || "");
  renderModuleLibrary();
}

function updateModuleLibraryFilter(value) {
  moduleLibraryFilter = value;
  resetModuleLibraryFolderNavigation();
  renderModuleLibrary();
}

function updateModuleLibraryFolderFilter(value) {
  moduleLibraryFolderFilter = String(value || "all");
  moduleLibraryFolderFilters = { formula: moduleLibraryFolderFilter, relevant: moduleLibraryFolderFilter };
  renderModuleLibrary();
}

function openLibraryFolder(type, folder) {
  navigateLibraryFolder(type, decodeURIComponent(String(folder || "all")));
  if (type === "formula") moduleLibraryMaterialsOpen = true;
  if (type === "relevant") moduleLibraryLinksOpen = true;
  renderModuleLibrary();
}

function setModuleLibraryView(view) {
  moduleLibraryViewMode = view === "cards" ? "cards" : "list";
  renderModuleLibrary();
}

function openLibraryAdd(type) {
  if (moduleLibraryScopeMi === null && !moduleLibraryScopeCustomId && moduleLibraryFilter === "all") {
    showAppNotice("Pick a library first", "Choose a module or custom library from the filter, or create a new custom library first.");
    return;
  }
  const parsed = moduleLibraryScopeCustomId
    ? { customId: moduleLibraryScopeCustomId, mi: null }
    : (moduleLibraryScopeMi !== null ? { mi: moduleLibraryScopeMi, customId: null } : parseLibraryFilterValue(moduleLibraryFilter));
  const activeFolder = getModuleLibraryFolderFilter(type);
  const folder = activeFolder === "all"
    ? ""
    : (activeFolder === "__unfiled" ? "" : activeFolder);
  closeModuleLibrary();
  openLinkForm({ type, mi: parsed.mi, customId: parsed.customId, folder });
}

async function createLibraryFolder(type = "formula") {
  const target = getActiveLibraryTarget();
  if (!target.customId && target.mi === null) {
    showAppNotice("Pick a library first", "Choose a module or custom library before adding a folder.");
    return;
  }
  const result = await appPrompt({
    label: "Folder",
    title: "Create Folder",
    message: "Folders keep materials and links tidy inside the selected library. Tags can still be used for finer labels.",
    inputLabel: "Folder Name",
    placeholder: "Documents",
    confirmText: "Create Folder"
  });
  const name = normalizeLibraryFolderName(result?.value);
  if (!name) return;
  addRegisteredLibraryFolder(target, name, type);
  navigateLibraryFolder(type, name);
  if (type === "relevant") moduleLibraryLinksOpen = true;
  else moduleLibraryMaterialsOpen = true;
  save();
  renderModuleLibrary();
}

function getLibraryFolderItems(target, type, folder) {
  const key = String(folder || "all");
  return getLibraryItemsForTarget(target, type)
    .filter((item) => (getLibraryFolderValue(item) || "__unfiled").toLowerCase() === key.toLowerCase());
}

function getUniqueLibraryFolderName(target, type, baseName) {
  const base = normalizeLibraryFolderName(baseName) || "Copied Folder";
  const existing = getCurrentLibraryFolderNames(type).map((folder) => folder.toLowerCase());
  if (!existing.includes(base.toLowerCase())) return base;
  let index = 2;
  let candidate = `${base} Copy`;
  while (existing.includes(candidate.toLowerCase())) {
    candidate = `${base} Copy ${index}`;
    index += 1;
  }
  return candidate;
}

function refreshLibraryTargetUi(target, type) {
  if (Number.isInteger(target?.mi)) {
    if (type === "formula") updateFormulaButton(target.mi);
    else renderRelevantLinks(target.mi);
  }
}

function copyLibraryFolder(type, encodedFolder, event) {
  if (event) event.stopPropagation();
  const target = getActiveLibraryTarget();
  if (!isConcreteLibraryTarget(target)) {
    showAppNotice("Pick a library first", "Choose a module or custom library before copying folders.");
    return;
  }
  const folder = decodeURIComponent(String(encodedFolder || "all"));
  const name = getLibraryFolderLabel(folder === "__unfiled" ? "" : folder);
  const items = getLibraryFolderItems(target, type, folder).map((item) => Object.assign({}, item));
  moduleLibraryClipboard = { type, folder, name, items };
  showAppNotice("Folder copied", `"${name}" is ready to paste into this or another library.`);
  renderModuleLibrary();
}

async function renameLibraryFolder(type, encodedFolder, event) {
  if (event) event.stopPropagation();
  const target = getActiveLibraryTarget();
  if (!isConcreteLibraryTarget(target)) {
    showAppNotice("Pick a library first", "Choose a module or custom library before renaming folders.");
    return;
  }
  const oldName = normalizeLibraryFolderName(decodeURIComponent(String(encodedFolder || "")));
  if (!oldName || oldName === "__unfiled") return;
  const result = await appPrompt({
    label: "Folder",
    title: "Rename Folder",
    message: "Renaming updates every item currently stored in this folder.",
    inputLabel: "Folder Name",
    defaultValue: oldName,
    confirmText: "Rename"
  });
  const newName = normalizeLibraryFolderName(result?.value);
  if (!newName || newName.toLowerCase() === oldName.toLowerCase()) return;
  const duplicate = getCurrentLibraryFolderNames(type).some((folder) => folder.toLowerCase() === newName.toLowerCase());
  if (duplicate) {
    showAppNotice("Folder already exists", "Choose a different folder name before renaming.");
    return;
  }
  const items = getLibraryItemsForTarget(target, type).map((item) => (
    getLibraryFolderValue(item).toLowerCase() === oldName.toLowerCase()
      ? Object.assign({}, item, { folder: newName })
      : item
  ));
  setLibraryItemsForTarget(target, type, items);
  removeRegisteredLibraryFolder(target, oldName, type);
  addRegisteredLibraryFolder(target, newName, type);
  if (getModuleLibraryFolderFilter(type).toLowerCase() === oldName.toLowerCase()) navigateLibraryFolder(type, newName);
  save();
  refreshLibraryTargetUi(target, type);
  renderModuleLibrary();
}

function pasteLibraryFolder(type, event) {
  if (event) event.stopPropagation();
  const target = getActiveLibraryTarget();
  if (!isConcreteLibraryTarget(target)) {
    showAppNotice("Pick a library first", "Choose a module or custom library before pasting folders.");
    return;
  }
  if (!moduleLibraryClipboard) {
    showAppNotice("Nothing to paste", "Copy a folder first, then paste it into a library.");
    return;
  }
  const baseName = moduleLibraryClipboard.folder === "__unfiled" ? "Copied Folder" : moduleLibraryClipboard.name;
  const folderName = getUniqueLibraryFolderName(target, type, baseName);
  const current = getLibraryItemsForTarget(target, type).slice();
  const pasted = (moduleLibraryClipboard.items || []).map((item) => ({
    name: item.name || "Saved item",
    url: item.url || "",
    folder: folderName,
    tag: item.tag || "",
    notes: item.notes || ""
  })).filter((item) => item.url);
  addRegisteredLibraryFolder(target, folderName, type);
  setLibraryItemsForTarget(target, type, current.concat(pasted));
  navigateLibraryFolder(type, folderName);
  if (type === "relevant") moduleLibraryLinksOpen = true;
  else moduleLibraryMaterialsOpen = true;
  save();
  refreshLibraryTargetUi(target, type);
  renderModuleLibrary();
}

async function deleteLibraryFolder(type, encodedFolder, event) {
  if (event) event.stopPropagation();
  const target = getActiveLibraryTarget();
  if (!isConcreteLibraryTarget(target)) {
    showAppNotice("Pick a library first", "Choose a module or custom library before deleting folders.");
    return;
  }
  const folder = normalizeLibraryFolderName(decodeURIComponent(String(encodedFolder || "")));
  if (!folder || folder === "__unfiled") return;
  const count = getLibraryFolderItems(target, type, folder).length;
  const confirmed = await appConfirm({
    label: "Folder",
    title: `Delete "${folder}"?`,
    message: count ? `This deletes the folder and ${count} saved ${count === 1 ? "item" : "items"} inside it.` : "This deletes the empty folder.",
    confirmText: "Delete Folder",
    danger: true
  });
  if (!confirmed) return;
  const remaining = getLibraryItemsForTarget(target, type)
    .filter((item) => getLibraryFolderValue(item).toLowerCase() !== folder.toLowerCase());
  setLibraryItemsForTarget(target, type, remaining);
  removeRegisteredLibraryFolder(target, folder, type);
  if (getModuleLibraryFolderFilter(type).toLowerCase() === folder.toLowerCase()) navigateLibraryFolder(type, "all");
  save();
  refreshLibraryTargetUi(target, type);
  renderModuleLibrary();
}

function openLibraryItem(target, type, index, event) {
  if (event) event.stopPropagation();
  const parsed = parseLibraryFilterValue(target);
  const item = parsed.customId
    ? getCustomLibraryItems(parsed.customId, type)[index]
    : (type === "formula" ? getFormulaLinks(parsed.mi) : getRelevantLinks(parsed.mi))[index];
  if (!item?.url) return;
  window.open(item.url, "_blank", "noopener");
}

function editLibraryItem(target, type, index, event) {
  if (event) event.stopPropagation();
  const parsed = parseLibraryFilterValue(target);
  closeModuleLibrary();
  openLinkForm({ type, mi: parsed.mi, customId: parsed.customId, index, mode: "edit" });
}

function deleteLibraryItem(target, type, index, event) {
  const parsed = parseLibraryFilterValue(target);
  if (parsed.customId) deleteCustomLibraryItem(parsed.customId, type, index, event);
  else if (type === "formula") deleteFormulaLink(parsed.mi, index, event);
  else deleteRelevantLink(parsed.mi, index, event);
  renderModuleLibrary();
}

function deleteCustomLibraryItem(id, type, index, event) {
  if (event) event.stopPropagation();
  const library = getCustomLibrary(id);
  if (!library) return;
  const key = type === "formula" ? "materials" : "relevantLinks";
  const items = getCustomLibraryItems(id, type).slice();
  if (!items[index]) return;
  items.splice(index, 1);
  library[key] = items;
  save();
}

async function createCustomLibrary() {
  const result = await appPrompt({
    label: "Library",
    title: "Create Custom Library",
    message: "Use custom libraries for extracurricular work, personal projects, applications, or anything that does not belong to a module.",
    inputLabel: "Library Name",
    placeholder: "Personal Projects",
    confirmText: "Create Library"
  });
  const name = String(result?.value || "").trim();
  if (!name) return;
  const id = `custom_${Date.now().toString(36)}`;
  getCustomLibraries()[id] = { name, materials: [], relevantLinks: [] };
  moduleLibraryScopeMi = null;
  moduleLibraryScopeCustomId = id;
  moduleLibraryFilter = `custom:${id}`;
  resetModuleLibraryFolderNavigation();
  moduleLibraryMaterialsOpen = true;
  moduleLibraryLinksOpen = true;
  save();
  document.getElementById("module-library-modal").classList.remove("hidden");
  renderModuleLibrary();
}

async function deleteCustomLibrary() {
  const id = getActiveCustomLibraryId();
  const library = id ? getCustomLibrary(id) : null;
  if (!id || !library) return;
  const confirmed = await appConfirm({
    label: "Library",
    title: "Delete custom library?",
    message: `This will delete "${library.name || "Custom Library"}" and all saved materials and links inside it.`,
    confirmText: "Delete Library",
    danger: true
  });
  if (!confirmed) return;
  delete getCustomLibraries()[id];
  delete getLibraryFolderStore()[`custom:${id}`];
  moduleLibraryScopeCustomId = null;
  moduleLibraryScopeMi = null;
  moduleLibraryFilter = "all";
  resetModuleLibraryFolderNavigation();
  save();
  renderModuleLibrary();
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
