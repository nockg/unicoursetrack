/**
 * Store-dependent mark and grade calculation functions.
 */

import { store } from './store.js';
import { getStore, getTopicEntry, topicKey, subtopicKey } from './state.js';
import {
  getGradingSystem,
  getComponentMarkSystem,
  parseGradeValue,
  parseMark,
  percentToNativeGrade,
  classify,
  formatSelectedGrade,
  getCreditUnitLabel,
  getAggregateMetricLabel,
  getModuleTerm,
  getActiveTermFilter,
  getCurrentTermOptions,
} from './grading.js';

// ── Assessment mode helpers ────────────────────────────────────────────────

export function isModulePredictionMode(mod, system = getGradingSystem()) {
  return system !== 'uk' && mod?.usesCwExamPrediction === true;
}

export function shouldAssessmentRollUpToCoursework(mi, system = getGradingSystem()) {
  const mod = store.MODULES[mi];
  return system === 'uk' || isModulePredictionMode(mod, system);
}

export function shouldAssessmentDriveModuleGrade(mi, system = getGradingSystem()) {
  const mod = store.MODULES[mi];
  return system === 'de5' && !isModulePredictionMode(mod, system);
}

// ── Topic progress ─────────────────────────────────────────────────────────

export function getModuleDone(mi) {
  const ys = getStore();
  return store.MODULES[mi].topics.reduce((sum, _, ti) => {
    const topic = getTopicEntry(mi, ti);
    let done = ys.topics[topicKey(mi, ti)] ? 1 : 0;
    done += topic.subtopics.filter((_, si) => !!ys.topics[subtopicKey(mi, ti, si)]).length;
    return sum + done;
  }, 0);
}

export function getModuleTotal(mi) {
  return store.MODULES[mi].topics.reduce(
    (sum, _, ti) => sum + 1 + getTopicEntry(mi, ti).subtopics.length,
    0,
  );
}

export function getModulePct(mi) {
  return getModuleTotal(mi) ? (getModuleDone(mi) / getModuleTotal(mi)) * 100 : 0;
}

// ── Blackboard link ────────────────────────────────────────────────────────

export function getBlackboardLink(mi) {
  return getStore().blackboard[mi] || '';
}

// ── Coursework components ──────────────────────────────────────────────────

export function getCourseworkComponents(mi) {
  const ys = getStore();
  if (!ys.courseworkComponents) ys.courseworkComponents = {};
  if (!Array.isArray(ys.courseworkComponents[mi])) ys.courseworkComponents[mi] = [];
  return ys.courseworkComponents[mi];
}

export function calculateCourseworkFromComponents(mi) {
  const componentSystem = getComponentMarkSystem();
  const components = getCourseworkComponents(mi);
  const valid = components
    .map((component, index) => ({
      index,
      name: component.name || `Component ${index + 1}`,
      mark: parseGradeValue(component.mark, componentSystem),
      weight: parseGradeValue(component.weight, 'uk'),
    }))
    .filter((component) => component.mark !== null);

  if (!valid.length) return { mark: null, weightTotal: 0, count: components.length };

  const explicit = valid.filter((c) => c.weight !== null);
  const unweighted = valid.filter((c) => c.weight === null);
  const explicitTotal = explicit.reduce((sum, c) => sum + c.weight, 0);
  const remaining = Math.max(0, 100 - explicitTotal);
  const autoWeight = unweighted.length ? remaining / unweighted.length : 0;

  let weightedSum = 0;
  let assignedTotal = 0;
  valid.forEach((c) => {
    const weight = c.weight !== null ? c.weight : autoWeight;
    weightedSum += c.mark * weight;
    assignedTotal += weight;
  });

  if (assignedTotal <= 0) return { mark: null, weightTotal: 0, count: components.length };
  return { mark: weightedSum / assignedTotal, weightTotal: assignedTotal, count: components.length };
}

export function getEffectiveCourseworkMark(mi, system = getGradingSystem()) {
  const calculated = calculateCourseworkFromComponents(mi);
  if (shouldAssessmentRollUpToCoursework(mi, system) && calculated.mark !== null) {
    return calculated.mark;
  }
  return parseGradeValue(getStore().coursework?.[mi], getComponentMarkSystem(system));
}

// ── Final grade calculation ────────────────────────────────────────────────

export function getModuleFinal(mi) {
  const ys = getStore();
  const mod = store.MODULES[mi];
  if (!mod) return null;

  const system = getGradingSystem();
  const cwWeight = Number(mod.cw) || 0;
  const examWeight = Number(mod.exam) || 0;
  const totalWeight = cwWeight + examWeight;

  if (system !== 'uk') {
    if (!isModulePredictionMode(mod, system)) {
      if (system === 'de5') {
        const calculated = calculateCourseworkFromComponents(mi);
        if (calculated.mark !== null) return calculated.mark;
      }
      return parseGradeValue(ys.finalGrades?.[mi], system);
    }

    if (totalWeight <= 0) return parseGradeValue(ys.finalGrades?.[mi], system);

    const coursework = getEffectiveCourseworkMark(mi, system);
    const exam = parseGradeValue(ys.exams?.[mi], getComponentMarkSystem(system));

    if (cwWeight > 0 && coursework === null) return null;
    if (examWeight > 0 && exam === null) return null;

    const weighted = (
      (cwWeight > 0 ? coursework * cwWeight : 0) +
      (examWeight > 0 ? exam * examWeight : 0)
    ) / totalWeight;

    return system === 'de5' ? weighted : percentToNativeGrade(weighted, system);
  }

  if (totalWeight <= 0) return null;

  const coursework = getEffectiveCourseworkMark(mi, 'uk');
  const exam = parseMark(ys.exams?.[mi], 'uk');

  if (cwWeight > 0 && examWeight === 0) return coursework;
  if (examWeight > 0 && cwWeight === 0) return exam;
  if (coursework === null || exam === null) return null;

  return (coursework * cwWeight + exam * examWeight) / totalWeight;
}

// ── Module grade display ───────────────────────────────────────────────────

export function formatModuleGradeDisplay(mi) {
  const final = getModuleFinal(mi);
  const system = getGradingSystem();
  const mod = store.MODULES[mi];
  const usesCalculatedPrediction = system === 'uk' || isModulePredictionMode(mod, system);
  const rawValue = usesCalculatedPrediction ? null : getStore().finalGrades?.[mi];
  return formatSelectedGrade(final, { courseDisplay: true, rawValue });
}

// ── Grade aggregates ───────────────────────────────────────────────────────

export function getGradeAggregate(filterFn = null, options = {}) {
  const respectActiveTerm = options.respectActiveTerm !== false;
  const activeTerm = respectActiveTerm ? getActiveTermFilter() : 'all';
  let weighted = 0;
  let credits = 0;
  let attemptedCredits = 0;
  let count = 0;
  store.MODULES.forEach((mod, mi) => {
    if (activeTerm !== 'all' && getModuleTerm(mi) !== activeTerm) return;
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
  return credits
    ? { value: weighted / credits, credits, attemptedCredits, gradePoints: weighted, count }
    : null;
}

export function getWeightedAvg() {
  const aggregate = getGradeAggregate();
  return aggregate ? aggregate.value : null;
}

export function getMajorGpa() {
  if (getGradingSystem() !== 'us4') return null;
  const ys = getStore();
  const activeTerm = getActiveTermFilter();
  let weighted = 0;
  let credits = 0;
  store.MODULES.forEach((mod, mi) => {
    if (activeTerm !== 'all' && getModuleTerm(mi) !== activeTerm) return;
    if (!ys.majorModules?.[mi]) return;
    const final = getModuleFinal(mi);
    if (final !== null) {
      weighted += final * mod.credits;
      credits += mod.credits;
    }
  });
  return credits ? { value: weighted / credits, credits } : null;
}

export function getTermBreakdown() {
  return getCurrentTermOptions()
    .map((term) => {
      const aggregate = getGradeAggregate(
        (_, mi) => getModuleTerm(mi) === term.value,
        { respectActiveTerm: false },
      );
      const totalCredits = store.MODULES.reduce((sum, mod, mi) => {
        if (getModuleTerm(mi) !== term.value) return sum;
        return sum + (Number(mod.credits) || 0);
      }, 0);
      const moduleCount = store.MODULES.filter((_, mi) => getModuleTerm(mi) === term.value).length;
      return Object.assign(
        { value: null, credits: 0, attemptedCredits: totalCredits, gradePoints: 0, count: 0 },
        aggregate || {},
        { term: term.value, label: term.label, attemptedCredits: totalCredits, moduleCount },
      );
    })
    .filter((term) => term.moduleCount > 0);
}

export function formatGradeAggregateStatus(aggregate) {
  if (!aggregate) return 'Enter module grades below';
  const system = getGradingSystem();
  const unitLabel = getCreditUnitLabel({ plural: aggregate.credits !== 1 });
  const totalCredits = getActiveTermFilter() === 'all'
    ? (store.TOTAL_CREDITS || aggregate.attemptedCredits || aggregate.credits)
    : (aggregate.attemptedCredits || aggregate.credits);
  const metric = system === 'uk'
    ? 'Cumulative year average'
    : system === 'de5'
      ? 'Cumulative weighted grade'
      : 'Cumulative GPA';
  let text = `${metric} based on ${aggregate.credits} / ${totalCredits} ${unitLabel}`;
  if (system !== 'uk' && system !== 'de5') text += ` · Total grade points ${aggregate.gradePoints.toFixed(2)}`;
  if (system === 'de5') text += ' · Lower is better';
  return text;
}
