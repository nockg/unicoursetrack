/**
 * Degree-level policy: data model, calculation, and validation.
 *
 * All knowledge about degree-wide prediction lives here.
 * degree-dashboard.js handles rendering; this module is pure logic.
 */
import { store } from './store.js';
import { save } from './state.js';
import { getGradingSystem, classify, formatSelectedGrade } from './grading.js';

// ── Labels and constants ───────────────────────────────────────────────────

export const GRADING_SYSTEM_LABELS = {
  uk:     'UK Honours / Percentage',
  us4:    'US 4.00 GPA',
  us43:   'US 4.30 GPA / A+ Scale',
  au7:    'Australia 7.00 GPA',
  au4:    'Australia 4.00 GPA',
  my4:    'Malaysia 4.00 GPA',
  cn4:    'China Mainland 100-point + GPA Estimate',
  nz9:    'New Zealand 9.00 GPA',
  de5:    'Germany 1.0–5.0 Grade',
  custom: 'Custom Grade Mapping',
};

export const EXCLUDED_REASONS = [
  { value: 'foundation', label: 'Foundation year'              },
  { value: 'transfer',   label: 'Transfer year'                },
  { value: 'placement',  label: 'Placement year'               },
  { value: 'abroad',     label: 'Study abroad / exchange year' },
  { value: 'retake',     label: 'Retake / repeat year'         },
  { value: 'other',      label: 'Other'                        },
];

export const CONFIDENCE_LABELS = {
  high:   'High confidence',
  medium: 'Medium confidence',
  low:    'Low confidence',
};

export const CONFIDENCE_DETAILS = {
  high:   'Most counted credits have actual marks.',
  medium: 'Some predicted marks or manual conversion used.',
  low:    'Large amount of missing data or manual conversion.',
};

export const DEGREE_PRESETS = [
  { id: 'manual',              label: 'Manual — custom weights',                             group: 'Generic'    },
  { id: 'equal',               label: 'Equal year weighting',                                group: 'Generic'    },
  { id: 'foundation_excluded', label: 'Foundation year (Year 1) excluded, equal rest',       group: 'Generic'    },
  { id: 'placement_excluded',  label: 'Placement / study-abroad year excluded',              group: 'Generic'    },
  { id: 'uk_0_40_60',          label: 'Year 1: 0%, Year 2: 40%, Year 3: 60%',               group: 'UK'         },
  { id: 'uk_0_33_67',          label: 'Year 1: 0%, Year 2: 33.3%, Year 3: 66.7%',           group: 'UK'         },
  { id: 'uk_honours_only',     label: 'Honours years only (final 2 years, equal weight)',   group: 'UK'         },
  { id: 'us_cumulative_gpa',   label: 'Cumulative GPA by credits (all years equal)',         group: 'US'         },
  { id: 'au_wam',              label: 'WAM / credit-weighted average (all years equal)',     group: 'Australia'  },
  { id: 'au_gpa',              label: 'GPA credit-weighted average (all years equal)',       group: 'Australia'  },
  { id: 'my_cgpa',             label: 'GPA / CGPA credit-weighted average (all years)',      group: 'Malaysia'   },
  { id: 'cn_100pt',            label: '100-point credit-weighted average (all years)',       group: 'China'      },
  { id: 'nz_gpa',              label: 'GPA credit/points-weighted average (all years)',      group: 'New Zealand'},
  { id: 'de_weighted',         label: 'Weighted final grade — lower is better (all years)', group: 'Germany'    },
];

// ── Default data model ─────────────────────────────────────────────────────

export function getDefaultDegreePolicy() {
  return {
    enabled: false,
    presetId: 'manual',
    outputSystemMode: 'graduatingYear',
    outputYearId: null,
    outputGradingSystem: null,
    yearRules: {},
  };
}

export function getDefaultYearRule() {
  return {
    status: 'included',
    weight: 0,
    reason: '',
    convertedValue: null,
    conversionNote: '',
  };
}

// ── Accessors ──────────────────────────────────────────────────────────────

export function getDegreePolicy() {
  if (!store.state.degreePolicy) {
    store.state.degreePolicy = getDefaultDegreePolicy();
  }
  return store.state.degreePolicy;
}

export function saveDegreePolicy(patch = {}) {
  const policy = getDegreePolicy();
  Object.assign(policy, patch);
  save();
}

export function getYearRule(yearId) {
  const policy = getDegreePolicy();
  if (!policy.yearRules[yearId]) {
    policy.yearRules[yearId] = getDefaultYearRule();
  }
  return policy.yearRules[yearId];
}

export function getDegreeOutputYear() {
  const policy = getDegreePolicy();
  const years = store.state.years || {};
  if (policy.outputYearId && years[policy.outputYearId]) {
    return years[policy.outputYearId];
  }
  const ids = Object.keys(years);
  return ids.length ? years[ids[ids.length - 1]] : null;
}

export function getDegreeOutputSystem() {
  const policy = getDegreePolicy();
  if (policy.outputSystemMode === 'graduatingYear') {
    const outYear = getDegreeOutputYear();
    if (outYear) return getGradingSystem(outYear.id);
  }
  return policy.outputGradingSystem || getGradingSystem();
}

// ── Per-year aggregate computation ─────────────────────────────────────────

function getYearModuleFinal(mod, mi, ys, system) {
  const cwPct  = Number(mod.cw)   || 0;
  const exPct  = Number(mod.exam) || 0;
  const total  = cwPct + exPct;

  const parseFg = (raw) => (raw !== undefined && raw !== '' && raw !== null) ? Number(raw) || null : null;

  // Non-UK, non-prediction-mode: direct final grade takes priority
  if (system !== 'uk' && total <= 0) {
    return parseFg(ys.finalGrades?.[mi]);
  }

  // Non-UK prediction mode or UK: derive from CW + exam inputs
  if (total <= 0) return parseFg(ys.finalGrades?.[mi]);

  const cwVal = parseFg(ys.coursework?.[mi]);
  const exVal = parseFg(ys.exams?.[mi]);

  if (cwPct > 0 && exPct === 0) return cwVal;
  if (exPct > 0 && cwPct === 0) return exVal;
  if (cwVal === null || exVal === null) return null;
  return (cwVal * cwPct + exVal * exPct) / total;
}

export function computeYearAggregate(yearId) {
  const year = store.state.years?.[yearId];
  if (!year) return null;
  const ys      = year.store;
  const modules = ys.modules || [];
  const system  = getGradingSystem(yearId);

  let weighted = 0, gradedCredits = 0, attempted = 0, missing = 0, gradedCount = 0;

  modules.forEach((mod, mi) => {
    const c     = Number(mod.credits) || 0;
    attempted  += c;
    const final = getYearModuleFinal(mod, mi, ys, system);
    if (final !== null && !isNaN(final)) {
      weighted      += final * c;
      gradedCredits += c;
      gradedCount   += 1;
    } else {
      missing += c;
    }
  });

  return {
    system,
    value:         gradedCredits > 0 ? weighted / gradedCredits : null,
    gradedCredits,
    attempted,
    missing,
    moduleCount:   modules.length,
    gradedCount,
  };
}

export function getYearDegreeValue(yearId) {
  const rule = getYearRule(yearId);
  if (rule.status === 'manualConversion') {
    const v = rule.convertedValue;
    return (v !== null && v !== undefined && v !== '') ? Number(v) : null;
  }
  return computeYearAggregate(yearId)?.value ?? null;
}

// ── Validation ─────────────────────────────────────────────────────────────

export function validateDegreePolicy() {
  const policy      = getDegreePolicy();
  const years       = store.state.years || {};
  const yearIds     = Object.keys(years);
  const outputSystem = getDegreeOutputSystem();
  const warnings    = [];
  const blockers    = [];

  if (!policy.enabled) {
    return { canCompute: false, warnings: [], blockers: ['Degree policy not enabled.'], totalWeight: 0 };
  }
  if (!getDegreeOutputYear()) blockers.push('No graduating / output year selected.');

  const includedIds = yearIds.filter((id) => {
    const r = getYearRule(id);
    return r.status === 'included' || r.status === 'manualConversion';
  });

  if (!includedIds.length) blockers.push('No years are included in the degree prediction.');

  let totalWeight = 0;
  includedIds.forEach((id) => {
    const rule       = getYearRule(id);
    const yearSystem = getGradingSystem(id);
    const year       = years[id];
    totalWeight     += Number(rule.weight) || 0;

    if (rule.status === 'included' && yearSystem !== outputSystem) {
      blockers.push(
        `${year.label} uses ${GRADING_SYSTEM_LABELS[yearSystem] || yearSystem} and needs a manual converted equivalent for ${GRADING_SYSTEM_LABELS[outputSystem] || outputSystem}.`,
      );
    }
    if (rule.status === 'manualConversion') {
      const v = rule.convertedValue;
      if (v === null || v === undefined || v === '') {
        blockers.push(`${year.label} is set to "converted value" but no value has been entered.`);
      }
    }
    if (getYearDegreeValue(id) === null) {
      warnings.push(`${year.label} has no grades yet — it will be skipped in the prediction.`);
    }
  });

  if (includedIds.length > 0 && totalWeight === 0) {
    blockers.push('Year weights total 0%. Set weights for included years.');
  }

  if (totalWeight > 0 && Math.abs(totalWeight - 100) > 0.5) {
    warnings.push(
      `Year weights total ${totalWeight.toFixed(1)}% (not 100%). UniTrack will normalise them for this estimate.`,
    );
  }

  return { canCompute: blockers.length === 0, warnings, blockers, totalWeight };
}

// ── Prediction ─────────────────────────────────────────────────────────────

export function calculateDegreePrediction() {
  if (!validateDegreePolicy().canCompute) return null;

  const years        = store.state.years || {};
  const yearIds      = Object.keys(years);
  const outputSystem = getDegreeOutputSystem();

  let weightedSum = 0, totalWeight = 0;
  let actualCredits = 0, missingCredits = 0;
  let hasManualConversion = false, hasMissing = false;

  yearIds.forEach((id) => {
    const rule = getYearRule(id);
    if (rule.status !== 'included' && rule.status !== 'manualConversion') return;
    const val = getYearDegreeValue(id);
    if (val === null) return;

    const w = Number(rule.weight) || 0;
    weightedSum   += val * w;
    totalWeight   += w;
    if (rule.status === 'manualConversion') hasManualConversion = true;

    const agg = computeYearAggregate(id);
    if (agg) {
      actualCredits  += agg.gradedCredits;
      missingCredits += agg.missing;
      if (agg.missing > 0) hasMissing = true;
    }
  });

  if (totalWeight === 0) return null;

  const value      = weightedSum / totalWeight;
  const confidence = hasManualConversion          ? 'medium'
    : hasMissing && missingCredits > actualCredits ? 'low'
    : hasMissing                                   ? 'medium'
    :                                                'high';

  return { value, outputSystem, confidence, totalWeight, actualCredits, missingCredits, hasManualConversion };
}

// ── Preset application ──────────────────────────────────────────────────────

export function applyPreset(presetId) {
  const policy  = getDegreePolicy();
  const years   = store.state.years || {};
  const yearIds = Object.keys(years);
  const n       = yearIds.length;
  if (!n) return;

  policy.presetId  = presetId;
  policy.yearRules = {};

  const setRule = (id, status, weight, reason = '') => {
    policy.yearRules[id] = { ...getDefaultYearRule(), status, weight, reason };
  };

  const eqW = (count) => parseFloat((100 / count).toFixed(2));

  switch (presetId) {
    case 'manual':
      yearIds.forEach((id) => setRule(id, 'included', 0));
      break;

    case 'equal':
      yearIds.forEach((id) => setRule(id, 'included', eqW(n)));
      break;

    case 'foundation_excluded':
      setRule(yearIds[0], 'excluded', 0, 'foundation');
      if (n > 1) yearIds.slice(1).forEach((id) => setRule(id, 'included', eqW(n - 1)));
      break;

    case 'placement_excluded': {
      if (n < 3) { yearIds.forEach((id) => setRule(id, 'included', eqW(n))); break; }
      const pIdx = n - 2;
      const rest = yearIds.filter((_, i) => i !== pIdx);
      yearIds.forEach((id, i) => {
        if (i === pIdx) setRule(id, 'excluded', 0, 'placement');
        else setRule(id, 'included', eqW(rest.length));
      });
      break;
    }

    case 'uk_0_40_60':
      if (n === 1) { setRule(yearIds[0], 'included', 100); break; }
      if (n === 2) { setRule(yearIds[0], 'excluded', 0); setRule(yearIds[1], 'included', 100); break; }
      setRule(yearIds[0], 'excluded', 0);
      yearIds.slice(1, n - 2).forEach((id) => setRule(id, 'excluded', 0));
      setRule(yearIds[n - 2], 'included', 40);
      setRule(yearIds[n - 1], 'included', 60);
      break;

    case 'uk_0_33_67':
      if (n === 1) { setRule(yearIds[0], 'included', 100); break; }
      if (n === 2) { setRule(yearIds[0], 'excluded', 0); setRule(yearIds[1], 'included', 100); break; }
      setRule(yearIds[0], 'excluded', 0);
      yearIds.slice(1, n - 2).forEach((id) => setRule(id, 'excluded', 0));
      setRule(yearIds[n - 2], 'included', 33.3);
      setRule(yearIds[n - 1], 'included', 66.7);
      break;

    case 'uk_honours_only': {
      if (n === 1) { setRule(yearIds[0], 'included', 100); break; }
      const honours = yearIds.slice(-2);
      yearIds.forEach((id) => {
        if (honours.includes(id)) setRule(id, 'included', eqW(honours.length));
        else setRule(id, 'excluded', 0);
      });
      break;
    }

    case 'us_cumulative_gpa':
    case 'au_wam':
    case 'au_gpa':
    case 'my_cgpa':
    case 'cn_100pt':
    case 'nz_gpa':
    case 'de_weighted':
      yearIds.forEach((id) => setRule(id, 'included', eqW(n)));
      break;

    default:
      yearIds.forEach((id) => setRule(id, 'included', 0));
  }

  save();
}
