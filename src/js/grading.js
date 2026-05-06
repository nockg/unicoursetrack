/**
 * Grading system tables, parsing, classification, and term option helpers.
 * Pure functions where possible; getGradingSystem reads from store.state.
 */

import { store } from './store.js';
import { deepClone } from './utils.js';
import { SUPPORTED_GRADING_SYSTEMS, MODULE_TERM_OPTIONS } from './config.js';

// ── Grade tables ───────────────────────────────────────────────────────────

export const AU_GRADE_OPTIONS = [
  { code: 'HD', value: 7, label: 'High Distinction', short: 'HD' },
  { code: 'D', value: 6, label: 'Distinction', short: 'D' },
  { code: 'CR', value: 5, label: 'Credit', short: 'Credit' },
  { code: 'P', value: 4, label: 'Pass', short: 'Pass' },
  { code: 'F', value: 0, label: 'Fail', short: 'Fail' },
];

export const AU4_GRADE_OPTIONS = [
  { code: 'HD', value: 4.0, label: 'High Distinction', short: 'HD' },
  { code: 'D', value: 3.0, label: 'Distinction', short: 'D' },
  { code: 'CR', value: 2.0, label: 'Credit', short: 'Credit' },
  { code: 'P', value: 1.0, label: 'Pass', short: 'Pass' },
  { code: 'F', value: 0, label: 'Fail', short: 'Fail' },
];

export const US_GRADE_OPTIONS = [
  { code: 'A+', value: 4.0, label: 'A+' },
  { code: 'A', value: 4.0, label: 'A' },
  { code: 'A-', value: 3.7, label: 'A-' },
  { code: 'B+', value: 3.3, label: 'B+' },
  { code: 'B', value: 3.0, label: 'B' },
  { code: 'B-', value: 2.7, label: 'B-' },
  { code: 'C+', value: 2.3, label: 'C+' },
  { code: 'C', value: 2.0, label: 'C' },
  { code: 'C-', value: 1.7, label: 'C-' },
  { code: 'D+', value: 1.3, label: 'D+' },
  { code: 'D', value: 1.0, label: 'D' },
  { code: 'D-', value: 0.7, label: 'D-' },
  { code: 'F', value: 0, label: 'F' },
];

export const US43_GRADE_OPTIONS = [
  { code: 'A+', value: 4.3, label: 'A+' },
  { code: 'A', value: 4.0, label: 'A' },
  { code: 'A-', value: 3.7, label: 'A-' },
  { code: 'B+', value: 3.3, label: 'B+' },
  { code: 'B', value: 3.0, label: 'B' },
  { code: 'B-', value: 2.7, label: 'B-' },
  { code: 'C+', value: 2.3, label: 'C+' },
  { code: 'C', value: 2.0, label: 'C' },
  { code: 'C-', value: 1.7, label: 'C-' },
  { code: 'D+', value: 1.3, label: 'D+' },
  { code: 'D', value: 1.0, label: 'D' },
  { code: 'D-', value: 0.7, label: 'D-' },
  { code: 'F', value: 0, label: 'F' },
];

export const MY_GRADE_OPTIONS = [
  { code: 'A+', value: 4.0, label: 'A+' },
  { code: 'A', value: 4.0, label: 'A' },
  { code: 'A-', value: 3.67, label: 'A-' },
  { code: 'B+', value: 3.33, label: 'B+' },
  { code: 'B', value: 3.0, label: 'B' },
  { code: 'B-', value: 2.67, label: 'B-' },
  { code: 'C+', value: 2.33, label: 'C+' },
  { code: 'C', value: 2.0, label: 'C' },
  { code: 'C-', value: 1.67, label: 'C-' },
  { code: 'D+', value: 1.33, label: 'D+' },
  { code: 'D', value: 1.0, label: 'D' },
  { code: 'D-', value: 0.67, label: 'D-' },
  { code: 'E', value: 0, label: 'E' },
  { code: 'F', value: 0, label: 'F' },
];

export const NZ_GRADE_OPTIONS = [
  { code: 'A+', value: 9, label: 'A+' },
  { code: 'A', value: 8, label: 'A' },
  { code: 'A-', value: 7, label: 'A-' },
  { code: 'B+', value: 6, label: 'B+' },
  { code: 'B', value: 5, label: 'B' },
  { code: 'B-', value: 4, label: 'B-' },
  { code: 'C+', value: 3, label: 'C+' },
  { code: 'C', value: 2, label: 'C' },
  { code: 'C-', value: 1, label: 'C-' },
  { code: 'D', value: 0, label: 'D' },
  { code: 'E', value: 0, label: 'E' },
];

// Mainland China GPA conversion is institution-specific. Letter grades A–F are
// accepted as shortcuts and map to representative mid-range scores.
export const CN_GRADE_OPTIONS = [
  { code: 'A', value: 95, label: 'A (Excellent / 优秀)' },
  { code: 'B', value: 82, label: 'B (Good / 良好)' },
  { code: 'C', value: 72, label: 'C (Average / 中等)' },
  { code: 'D', value: 62, label: 'D (Pass / 及格)' },
  { code: 'F', value: 0, label: 'F (Fail / 不及格)' },
];

export const DE_GRADE_OPTIONS = [
  { code: '1.0', value: 1.0, label: '1.0 Very Good' },
  { code: '1.3', value: 1.3, label: '1.3 Very Good' },
  { code: '1.7', value: 1.7, label: '1.7 Good' },
  { code: '2.0', value: 2.0, label: '2.0 Good' },
  { code: '2.3', value: 2.3, label: '2.3 Good' },
  { code: '2.7', value: 2.7, label: '2.7 Satisfactory' },
  { code: '3.0', value: 3.0, label: '3.0 Satisfactory' },
  { code: '3.3', value: 3.3, label: '3.3 Satisfactory' },
  { code: '3.7', value: 3.7, label: '3.7 Sufficient' },
  { code: '4.0', value: 4.0, label: '4.0 Sufficient' },
  { code: '5.0', value: 5.0, label: '5.0 Fail' },
];

export const GRADE_POINT_OPTIONS = {
  au7: AU_GRADE_OPTIONS,
  au4: AU4_GRADE_OPTIONS,
  us4: US_GRADE_OPTIONS,
  us43: US43_GRADE_OPTIONS,
  my4: MY_GRADE_OPTIONS,
  nz9: NZ_GRADE_OPTIONS,
  cn4: CN_GRADE_OPTIONS,
  de5: DE_GRADE_OPTIONS,
};

// ── Grade system accessor ──────────────────────────────────────────────────

/**
 * Effective grading system resolver.
 * Resolution chain:
 *   1. If yearId provided → look up that year object.
 *   2. If no yearId → use current active year (store.state.ui.currentYearId).
 *   3. If year.gradingSystem is set and valid → use it.
 *   4. Otherwise fall back to store.state.profile.gradingSystem.
 *   5. If that is missing/invalid → fall back to 'uk'.
 */
export function getGradingSystem(yearId) {
  const resolvedYearId = yearId !== undefined ? yearId : store.state?.ui?.currentYearId;
  if (resolvedYearId && store.state?.years?.[resolvedYearId]) {
    const year = store.state.years[resolvedYearId];
    if (year.gradingSystem && SUPPORTED_GRADING_SYSTEMS.includes(year.gradingSystem)) {
      return year.gradingSystem;
    }
  }
  const system = store.state?.profile?.gradingSystem || 'uk';
  return SUPPORTED_GRADING_SYSTEMS.includes(system) ? system : 'uk';
}

/**
 * Effective custom grade options resolver.
 * - If effective system is not 'custom' → returns [] (callers use built-in tables).
 * - If 'custom': year.customGradeMapping → profile.customGradeMapping → [].
 */
export function getCustomGradeOptions(yearId) {
  const resolvedYearId = yearId !== undefined ? yearId : store.state?.ui?.currentYearId;
  if (resolvedYearId && store.state?.years?.[resolvedYearId]) {
    const year = store.state.years[resolvedYearId];
    if (Array.isArray(year.customGradeMapping) && year.customGradeMapping.length) {
      return year.customGradeMapping;
    }
  }
  const mapping = store.state?.profile?.customGradeMapping;
  return Array.isArray(mapping) ? mapping : [];
}

// ── Grade parsing ──────────────────────────────────────────────────────────

export function normaliseGradeCode(value) {
  return String(value ?? '').trim().toUpperCase();
}

export function getGradePointMap(system = getGradingSystem()) {
  if (system === 'custom') {
    const mapping = getCustomGradeOptions();
    if (!mapping.length) return null;
    return mapping.reduce((map, option) => {
      map[normaliseGradeCode(option.code)] = option;
      return map;
    }, {});
  }
  const options = GRADE_POINT_OPTIONS[system];
  if (!options) return null;
  return options.reduce((map, option) => {
    map[normaliseGradeCode(option.code)] = option;
    return map;
  }, {});
}

export function getGradeOptions(system = getGradingSystem()) {
  if (system === 'custom') return getCustomGradeOptions();
  return GRADE_POINT_OPTIONS[system] || null;
}

export function getGradeOption(system, value) {
  const map = getGradePointMap(system);
  return map ? map[normaliseGradeCode(value)] || null : null;
}

export function getGradeScaleConfig(system = getGradingSystem()) {
  if (system === 'us4' || system === 'us43') {
    return {
      min: 0, max: system === 'us43' ? 4.3 : 4, step: '0.01',
      suffix: 'GPA', finalLabel: 'Course Grade', markLabel: 'Grade', placeholder: 'Select grade',
    };
  }
  if (system === 'my4') {
    return {
      min: 0, max: 4, step: '0.01',
      suffix: 'GPA', finalLabel: 'Course Grade', markLabel: 'Grade', placeholder: 'Select grade',
    };
  }
  if (system === 'cn4') {
    return {
      min: 0, max: 100, step: '0.1', suffix: '%',
      finalLabel: 'Final Score', courseworkLabel: 'Coursework %', examLabel: 'Exam %',
      markLabel: 'Score', placeholder: '0–100', allowNumericGradeInput: true,
    };
  }
  if (system === 'au7') {
    return {
      min: 0, max: 7, step: '0.01',
      suffix: 'GPA', finalLabel: 'Course Grade', markLabel: 'Grade', placeholder: 'Select grade',
    };
  }
  if (system === 'au4') {
    return {
      min: 0, max: 4, step: '0.01',
      suffix: 'GPA', finalLabel: 'Course Grade', markLabel: 'Grade', placeholder: 'Select grade',
    };
  }
  if (system === 'nz9') {
    return {
      min: 0, max: 9, step: '0.01',
      suffix: 'GPA', finalLabel: 'Paper Grade', markLabel: 'Grade', placeholder: 'Select grade',
    };
  }
  if (system === 'de5') {
    return {
      min: 1, max: 5, step: '0.1', suffix: 'grade',
      finalLabel: 'Module Grade', markLabel: 'Grade', placeholder: '1.0-5.0', allowNumericGradeInput: true,
    };
  }
  // uk / custom
  return {
    min: 0, max: 100, step: '0.1', suffix: '%',
    finalLabel: 'Final %', courseworkLabel: 'Coursework %', examLabel: 'Exam %',
    markLabel: 'Mark %', placeholder: '-',
  };
}

export function getComponentMarkSystem(system = getGradingSystem()) {
  return system === 'de5' ? 'de5' : 'uk';
}

export function getComponentScaleConfig(system = getGradingSystem()) {
  if (system === 'de5') return { min: 1, max: 5, step: '0.1', placeholder: '1.0–5.0', label: 'Grade (1.0–5.0)' };
  return { min: 0, max: 100, step: '0.1', placeholder: '-', label: 'Mark %' };
}

export function parseGradeValue(value, system = getGradingSystem()) {
  if (value === '' || value === null || value === undefined) return null;
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

export function parseMark(value, system = getGradingSystem()) {
  return parseGradeValue(value, system);
}

export function clampGradeInputValue(value, system = getGradingSystem()) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const gradeMap = getGradePointMap(system);
  if (gradeMap && gradeMap[normaliseGradeCode(raw)]) return normaliseGradeCode(raw);
  if (gradeMap && !getGradeScaleConfig(system).allowNumericGradeInput) return '';
  const num = parseFloat(raw);
  if (Number.isNaN(num)) return raw;
  const config = getGradeScaleConfig(system);
  const min = config.min ?? 0;
  if (num > config.max) return system === 'uk' ? String(config.max) : config.max.toFixed(system === 'de5' ? 1 : 2);
  if (num < min) return system === 'uk' ? String(min) : min.toFixed(system === 'de5' ? 1 : 2);
  return raw;
}

// ── Grade classification ───────────────────────────────────────────────────

export function classifyFourPointGpa(mark) {
  if (mark >= 3.7) return { label: 'A', badge: 'A', cls: 'cls-s-first', heroCls: 'cls-first' };
  if (mark >= 3.3) return { label: 'B+', badge: 'B+', cls: 'cls-s-21', heroCls: 'cls-21' };
  if (mark >= 3.0) return { label: 'B', badge: 'B', cls: 'cls-s-21', heroCls: 'cls-21' };
  if (mark >= 2.7) return { label: 'B-', badge: 'B-', cls: 'cls-s-22', heroCls: 'cls-22' };
  if (mark >= 2.3) return { label: 'C+', badge: 'C+', cls: 'cls-s-22', heroCls: 'cls-22' };
  if (mark >= 2.0) return { label: 'C', badge: 'C', cls: 'cls-s-third', heroCls: 'cls-third' };
  if (mark >= 1.0) return { label: 'D', badge: 'D', cls: 'cls-s-third', heroCls: 'cls-third' };
  return { label: 'F', badge: 'F', cls: '', heroCls: '' };
}

export function classifyAuGpa(mark) {
  if (mark >= 6.5) return { label: 'HD', badge: 'High Distinction', cls: 'cls-s-first', heroCls: 'cls-first' };
  if (mark >= 5.5) return { label: 'D', badge: 'Distinction', cls: 'cls-s-21', heroCls: 'cls-21' };
  if (mark >= 4.5) return { label: 'Credit', badge: 'Credit', cls: 'cls-s-22', heroCls: 'cls-22' };
  if (mark >= 4.0) return { label: 'Pass', badge: 'Pass', cls: 'cls-s-third', heroCls: 'cls-third' };
  return { label: 'Fail', badge: 'Fail', cls: '', heroCls: '' };
}

export function classifyAu4Gpa(mark) {
  if (mark >= 3.5) return { label: 'HD', badge: 'High Distinction', cls: 'cls-s-first', heroCls: 'cls-first' };
  if (mark >= 2.5) return { label: 'D', badge: 'Distinction', cls: 'cls-s-21', heroCls: 'cls-21' };
  if (mark >= 1.5) return { label: 'Credit', badge: 'Credit', cls: 'cls-s-22', heroCls: 'cls-22' };
  if (mark >= 1.0) return { label: 'Pass', badge: 'Pass', cls: 'cls-s-third', heroCls: 'cls-third' };
  return { label: 'Fail', badge: 'Fail', cls: '', heroCls: '' };
}

export function classifyNzGpa(mark) {
  if (mark >= 8) return { label: 'A', badge: 'A range', cls: 'cls-s-first', heroCls: 'cls-first' };
  if (mark >= 6) return { label: 'B+', badge: 'B range', cls: 'cls-s-21', heroCls: 'cls-21' };
  if (mark >= 4) return { label: 'B-', badge: 'B range', cls: 'cls-s-22', heroCls: 'cls-22' };
  if (mark >= 1) return { label: 'C', badge: 'Pass', cls: 'cls-s-third', heroCls: 'cls-third' };
  return { label: 'Fail', badge: 'Fail', cls: '', heroCls: '' };
}

export function classifyMalaysianGpa(mark) {
  if (mark >= 3.67) return { label: 'A', badge: 'A range', cls: 'cls-s-first', heroCls: 'cls-first' };
  if (mark >= 3.33) return { label: 'B+', badge: 'B+', cls: 'cls-s-21', heroCls: 'cls-21' };
  if (mark >= 3.0) return { label: 'B', badge: 'B', cls: 'cls-s-21', heroCls: 'cls-21' };
  if (mark >= 2.67) return { label: 'B-', badge: 'B-', cls: 'cls-s-22', heroCls: 'cls-22' };
  if (mark >= 2.33) return { label: 'C+', badge: 'C+', cls: 'cls-s-22', heroCls: 'cls-22' };
  if (mark >= 2.0) return { label: 'C', badge: 'C', cls: 'cls-s-third', heroCls: 'cls-third' };
  if (mark >= 1.0) return { label: 'D', badge: 'D', cls: 'cls-s-third', heroCls: 'cls-third' };
  return { label: 'E', badge: 'E/F', cls: '', heroCls: '' };
}

export function chinaScoreToApproxGpa(score) {
  // Generic side estimate only — Chinese universities use institution-specific conversion rules.
  if (score >= 85) return 4.0;
  if (score >= 60) return Math.min(3.9, 1.5 + ((Math.floor(score) - 60) * 0.1));
  return 0;
}

export function classifyChinaScore(mark) {
  const gpa = chinaScoreToApproxGpa(mark);
  if (mark >= 90) return { label: `Excellent / 优秀 · GPA est. ${gpa.toFixed(2)}`, badge: 'Excellent', cls: 'cls-s-first', heroCls: 'cls-first' };
  if (mark >= 80) return { label: `Good / 良好 · GPA est. ${gpa.toFixed(2)}`, badge: 'Good', cls: 'cls-s-21', heroCls: 'cls-21' };
  if (mark >= 70) return { label: `Average / 中等 · GPA est. ${gpa.toFixed(2)}`, badge: 'Average', cls: 'cls-s-22', heroCls: 'cls-22' };
  if (mark >= 60) return { label: `Pass / 及格 · GPA est. ${gpa.toFixed(2)}`, badge: 'Pass', cls: 'cls-s-third', heroCls: 'cls-third' };
  return { label: 'Fail / 不及格 · GPA est. 0.00', badge: 'Fail', cls: '', heroCls: '' };
}

export function classifyGermanGrade(mark) {
  if (mark <= 1.4) return { label: 'Very Good', badge: 'Very Good', cls: 'cls-s-first', heroCls: 'cls-first' };
  if (mark <= 2.4) return { label: 'Good', badge: 'Good', cls: 'cls-s-21', heroCls: 'cls-21' };
  if (mark <= 3.4) return { label: 'Satisfactory', badge: 'Satisfactory', cls: 'cls-s-22', heroCls: 'cls-22' };
  if (mark <= 4.0) return { label: 'Sufficient', badge: 'Sufficient', cls: 'cls-s-third', heroCls: 'cls-third' };
  return { label: 'Fail', badge: 'Fail', cls: '', heroCls: '' };
}

export function classifyWithSystem(mark, system = getGradingSystem()) {
  if (system === 'de5') return classifyGermanGrade(mark);
  if (system === 'cn4') return classifyChinaScore(mark);
  if (system === 'au7') return classifyAuGpa(mark);
  if (system === 'au4') return classifyAu4Gpa(mark);
  if (system === 'nz9') return classifyNzGpa(mark);
  if (system === 'my4') return classifyMalaysianGpa(mark);
  if (system === 'us4' || system === 'us43') return classifyFourPointGpa(mark);
  if (mark >= 70) return { label: 'First', badge: 'First', cls: 'cls-s-first', heroCls: 'cls-first' };
  if (mark >= 60) return { label: '2:1', badge: 'Upper Second', cls: 'cls-s-21', heroCls: 'cls-21' };
  if (mark >= 50) return { label: '2:2', badge: 'Lower Second', cls: 'cls-s-22', heroCls: 'cls-22' };
  if (mark >= 40) return { label: 'Third', badge: 'Third', cls: 'cls-s-third', heroCls: 'cls-third' };
  return { label: 'Fail', badge: 'Fail', cls: '', heroCls: '' };
}

export function classify(mark) {
  return classifyWithSystem(mark, getGradingSystem());
}

// ── Percent-to-native conversion ───────────────────────────────────────────

export function percentToNativeGrade(pct, system) {
  if (system === 'us43') {
    if (pct >= 97) return 4.3; if (pct >= 93) return 4.0; if (pct >= 90) return 3.7;
    if (pct >= 87) return 3.3; if (pct >= 83) return 3.0; if (pct >= 80) return 2.7;
    if (pct >= 77) return 2.3; if (pct >= 73) return 2.0; if (pct >= 70) return 1.7;
    if (pct >= 67) return 1.3; if (pct >= 63) return 1.0; if (pct >= 60) return 0.7;
    return 0;
  }
  if (system === 'us4') {
    if (pct >= 93) return 4.0; if (pct >= 90) return 3.7; if (pct >= 87) return 3.3;
    if (pct >= 83) return 3.0; if (pct >= 80) return 2.7; if (pct >= 77) return 2.3;
    if (pct >= 73) return 2.0; if (pct >= 70) return 1.7; if (pct >= 67) return 1.3;
    if (pct >= 63) return 1.0; if (pct >= 60) return 0.7;
    return 0;
  }
  if (system === 'au7') {
    if (pct >= 85) return 7; if (pct >= 75) return 6; if (pct >= 65) return 5;
    if (pct >= 50) return 4;
    return 0;
  }
  if (system === 'au4') {
    if (pct >= 85) return 4.0; if (pct >= 75) return 3.0; if (pct >= 65) return 2.0;
    if (pct >= 50) return 1.0;
    return 0;
  }
  if (system === 'my4') {
    if (pct >= 90) return 4.0; if (pct >= 80) return 4.0; if (pct >= 75) return 3.67;
    if (pct >= 70) return 3.33; if (pct >= 65) return 3.0; if (pct >= 60) return 2.67;
    if (pct >= 55) return 2.33; if (pct >= 50) return 2.0; if (pct >= 45) return 1.67;
    if (pct >= 40) return 1.33; if (pct >= 35) return 1.0; if (pct >= 30) return 0.67;
    return 0;
  }
  if (system === 'nz9') {
    if (pct >= 90) return 9; if (pct >= 85) return 8; if (pct >= 80) return 7;
    if (pct >= 75) return 6; if (pct >= 70) return 5; if (pct >= 65) return 4;
    if (pct >= 60) return 3; if (pct >= 55) return 2; if (pct >= 50) return 1;
    return 0;
  }
  return pct;
}

// ── Grade formatting ───────────────────────────────────────────────────────

export function formatGradePointValue(value, system = getGradingSystem()) {
  if (system === 'au7' || system === 'nz9') return value.toFixed(0);
  if (system === 'de5') return value.toFixed(1);
  return value.toFixed(2);
}

export function formatGradeOptionLabel(option, system = getGradingSystem()) {
  if (system === 'de5') return option.label || option.code;
  return `${option.label || option.code} (${formatGradePointValue(option.value, system)})`;
}

export function formatGradeInputValue(value) {
  if (value === null || value === undefined) return '';
  return getGradingSystem() === 'uk' ? value.toFixed(1) : value.toFixed(2);
}

export function formatSelectedGradeForSystem(mark, system = getGradingSystem(), options = {}) {
  if (mark === null || mark === undefined) return { main: '-', label: '', secondary: '' };
  if (['us4', 'us43', 'my4'].includes(system)) {
    const exact = options.courseDisplay ? getGradeOption(system, options.rawValue) : null;
    const grade = exact || (system === 'my4' ? classifyMalaysianGpa(mark) : classifyFourPointGpa(mark));
    const pointLabel = system === 'us4' || system === 'us43' ? 'quality points' : 'grade points';
    if (options.courseDisplay) {
      return { main: grade.short || grade.label || exact?.code || '-', label: `${mark.toFixed(2)} ${pointLabel}`, secondary: '' };
    }
    return { main: `${mark.toFixed(2)} GPA`, label: grade.label, secondary: '' };
  }
  if (system === 'cn4') {
    const grade = classifyChinaScore(mark);
    return { main: `${mark.toFixed(1)}%`, label: grade.label, secondary: 'varies by uni' };
  }
  if (system === 'au7') {
    const exact = options.courseDisplay ? getGradeOption(system, options.rawValue) : null;
    const grade = exact || classifyAuGpa(mark);
    if (options.courseDisplay) return { main: grade.short || grade.label || exact?.code || '-', label: `${mark.toFixed(0)} grade points`, secondary: '' };
    return { main: `${mark.toFixed(2)} GPA`, label: grade.label, secondary: '' };
  }
  if (system === 'au4') {
    const exact = options.courseDisplay ? getGradeOption(system, options.rawValue) : null;
    const grade = exact || classifyAu4Gpa(mark);
    if (options.courseDisplay) return { main: grade.short || grade.label || exact?.code || '-', label: `${mark.toFixed(2)} grade points`, secondary: '' };
    return { main: `${mark.toFixed(2)} GPA`, label: grade.label, secondary: '' };
  }
  if (system === 'nz9') {
    const exact = options.courseDisplay ? getGradeOption(system, options.rawValue) : null;
    const grade = exact || classifyNzGpa(mark);
    if (options.courseDisplay) return { main: grade.short || grade.label || exact?.code || '-', label: `${mark.toFixed(0)} grade points`, secondary: '' };
    return { main: `${mark.toFixed(2)} GPA`, label: grade.label, secondary: '' };
  }
  if (system === 'de5') {
    const grade = classifyGermanGrade(mark);
    return { main: `${mark.toFixed(2)} grade`, label: grade.label, secondary: 'Lower is better' };
  }
  const percent = `${mark.toFixed(1)}%`;
  const cls = classifyWithSystem(mark, system);
  return { main: percent, label: cls?.label || '', secondary: '' };
}

export function formatSelectedGrade(mark, options = {}) {
  return formatSelectedGradeForSystem(mark, getGradingSystem(), options);
}

// ── Credit label helpers ───────────────────────────────────────────────────

export function getCreditUnitLabel(options = {}) {
  const plural = options.plural !== false;
  const system = options.system || getGradingSystem();
  if (system === 'au7') return plural ? 'units' : 'unit';
  if (system === 'us4' || system === 'us43') return plural ? 'GPA hours' : 'GPA hour';
  if (system === 'nz9') return plural ? 'points' : 'point';
  if (system === 'de5') return 'ECTS';
  return plural ? 'credits' : 'credit';
}

export function getModuleCreditFieldLabel(system = getGradingSystem()) {
  if (system === 'au7') return 'Units / Credit Points';
  if (system === 'us4' || system === 'us43') return 'Credit Hours / GPA Hours';
  if (system === 'nz9') return 'Course Points';
  if (system === 'de5') return 'ECTS Credits';
  return 'Credits';
}

export function getAggregateMetricLabel(system = getGradingSystem()) {
  if (system === 'uk') return 'Weighted average';
  if (system === 'de5') return 'Weighted grade';
  return 'GPA';
}

export function getGradingSystemTitle(system = getGradingSystem()) {
  if (system === 'uk') return 'UK Honours / Percentage';
  if (system === 'us4') return 'US 4.00 GPA';
  if (system === 'us43') return 'US 4.30 GPA / A+ Scale';
  if (system === 'au7') return 'Australia 7.00 GPA';
  if (system === 'au4') return 'Australia 4.00 GPA';
  if (system === 'my4') return 'Malaysia 4.00 GPA';
  if (system === 'cn4') return 'China Mainland 100-point + GPA Estimate';
  if (system === 'nz9') return 'New Zealand 9.00 GPA';
  if (system === 'de5') return 'Germany 1.0-5.0';
  if (system === 'custom') return 'Custom Grade Mapping';
  return 'UK Honours / Percentage';
}

// ── Custom grade mapping ───────────────────────────────────────────────────

export function parseCustomGradeMapping(raw) {
  const text = String(raw || '').trim();
  const entries = text.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);
  const result = [];
  entries.forEach((entry) => {
    const idx = entry.indexOf('=');
    if (idx === -1) return;
    const code = entry.slice(0, idx).trim();
    const val = parseFloat(entry.slice(idx + 1).trim());
    if (code && !Number.isNaN(val)) result.push({ code: code.toUpperCase(), value: val, label: code.toUpperCase() });
  });
  return result;
}

export function serializeGradeMapping(mapping) {
  if (!Array.isArray(mapping)) return '';
  return mapping.map((item) => `${item.code}=${item.value}`).join(', ');
}

// ── Term option helpers ────────────────────────────────────────────────────

export function normalizeTermValue(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'full';
  if (getCurrentTermOptions().some((option) => option.value === raw)) return raw;
  if (/^sem\d+$/i.test(raw)) return raw.toLowerCase();
  if (raw === 'all') return 'all';
  return 'full';
}

export function getTermLabel(value) {
  const normalised = normalizeTermValue(value);
  if (normalised === 'all') return 'Full Year';
  return getCurrentTermOptions().find((option) => option.value === normalised)?.label || 'Full Year';
}

export function uniqueTermOptions(options) {
  const seen = new Set();
  return (options || []).filter((option) => {
    const value = String(option?.value || '').trim();
    const label = String(option?.label || '').trim();
    if (!value || !label || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

export function ensureStoreTermOptions(ys = null) {
  const yearStore = ys || (typeof window.getStore === 'function' ? window.getStore() : null);
  if (!yearStore) return deepClone(MODULE_TERM_OPTIONS);
  const existing = Array.isArray(yearStore.termOptions) ? yearStore.termOptions : [];
  const fromModules = (yearStore.modules || [])
    .map((mod) => String(mod?.term || '').trim())
    .filter((term) => term && !MODULE_TERM_OPTIONS.some((option) => option.value === term))
    .map((term) => ({
      value: term,
      label: /^sem(\d+)$/i.test(term) ? `Semester ${term.match(/\d+/)?.[0]}` : term,
    }));
  yearStore.termOptions = uniqueTermOptions([...MODULE_TERM_OPTIONS, ...existing, ...fromModules]);
  return yearStore.termOptions;
}

export function getCurrentTermOptions(ys = null) {
  try {
    return ensureStoreTermOptions(ys || (typeof window.getStore === 'function' ? window.getStore() : null));
  } catch {
    return deepClone(MODULE_TERM_OPTIONS);
  }
}

export function isKnownTermValue(value, ys = null) {
  const raw = String(value || '').trim();
  if (raw === 'all') return true;
  return getCurrentTermOptions(ys).some((option) => option.value === raw);
}

export function getActiveTermFilter() {
  const term = store.state?.ui?.currentTermFilter || 'all';
  return isKnownTermValue(term) ? term : 'all';
}

export function isModuleVisibleInActiveTerm(mi) {
  const active = getActiveTermFilter();
  return active === 'all' || normalizeTermValue(store.MODULES[mi]?.term) === active;
}

export function getModuleTerm(mi) {
  return normalizeTermValue(store.MODULES[mi]?.term);
}

export function createNextTermOption(ys = null) {
  const options = getCurrentTermOptions(ys);
  let number = 1;
  while (options.some((option) => option.value === `sem${number}`)) number += 1;
  return { value: `sem${number}`, label: `Semester ${number}` };
}

// ── Deadline parsing helpers (used by deadlines.js and marks.js) ───────────

export function parseDeadlineInput(input) {
  const raw = String(input || '').trim();
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

export function toDeadlineStorageString(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}
