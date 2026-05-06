import { store } from './store.js';
import {
  save,
  syncModalScrollLock,
  getEffectiveAcademicYearLabel,
  getEffectiveCourse,
  getEffectiveUniversity,
} from './state.js';
import { deepClone, escapeHtml } from './utils.js';
import {
  classifyWithSystem,
  formatSelectedGradeForSystem,
  getAggregateMetricLabel,
  getComponentMarkSystem,
  getCreditUnitLabel,
  getGradingSystem,
  getGradingSystemTitle,
  parseGradeValue,
  percentToNativeGrade,
} from './grading.js';

const POLICY_TEMPLATES = [
  { value: 'manual', label: 'Manual custom weights' },
  { value: 'equal-all', label: 'All counted years equally' },
  { value: 'final-two', label: 'Final two counted years' },
  { value: 'final-year', label: 'Final year only' },
];

let degreePolicyDraft = null;
let activeYearDetailsId = '';
let showStatusDetails = false;

function getYearNumber(label) {
  const match = String(label || '').match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function getSortedYears() {
  return Object.values(store.state?.years || {}).sort((a, b) => {
    const diff = getYearNumber(a.label) - getYearNumber(b.label);
    return diff || String(a.label || '').localeCompare(String(b.label || ''), undefined, { numeric: true });
  });
}

function distributeWeights(yearIds) {
  if (!yearIds.length) return {};
  const base = Math.floor(100 / yearIds.length);
  let remainder = 100 - (base * yearIds.length);
  return yearIds.reduce((weights, yearId, index) => {
    weights[yearId] = base + (index === yearIds.length - 1 ? remainder : 0);
    return weights;
  }, {});
}

function buildDefaultDegreePolicy(configured = false) {
  const years = getSortedYears();
  const includedYears = years.filter((year) => !year.store?.archived).map((year) => year.id);
  const weights = distributeWeights(includedYears);
  const outputYear = years[years.length - 1];
  return {
    configured,
    weightingMode: 'year-weighted',
    template: 'manual',
    outputYearId: outputYear?.id || '',
    rules: years.reduce((rules, year) => {
      rules[year.id] = {
        included: includedYears.includes(year.id),
        weight: weights[year.id] || 0,
        reason: year.store?.archived ? 'Archived year' : '',
        convertedValue: '',
        conversionNote: '',
      };
      return rules;
    }, {}),
  };
}

function ensureDegreePolicyState() {
  if (!store.state) store.state = {};
  if (!store.state.degreePolicy || typeof store.state.degreePolicy !== 'object') {
    store.state.degreePolicy = buildDefaultDegreePolicy(false);
  }

  const policy = store.state.degreePolicy;
  const years = getSortedYears();
  const existingYears = new Set(years.map((year) => year.id));
  const hasRules = policy.rules && typeof policy.rules === 'object';
  if (!hasRules) policy.rules = {};

  years.forEach((year) => {
    if (!policy.rules[year.id]) {
      policy.rules[year.id] = {
        included: policy.configured ? false : !year.store?.archived,
        weight: 0,
        reason: year.store?.archived ? 'Archived year' : '',
        convertedValue: '',
        conversionNote: '',
      };
    }
  });

  Object.keys(policy.rules).forEach((yearId) => {
    if (!existingYears.has(yearId)) delete policy.rules[yearId];
  });

  if (!policy.outputYearId || !existingYears.has(policy.outputYearId)) {
    policy.outputYearId = years[years.length - 1]?.id || '';
  }

  if (!policy.template) policy.template = 'manual';
  if (!policy.weightingMode) policy.weightingMode = 'year-weighted';
  if (typeof policy.configured !== 'boolean') policy.configured = false;

  return policy;
}

function clonePolicyForDraft() {
  degreePolicyDraft = deepClone(ensureDegreePolicyState());
}

function getPolicyRule(policy, yearId) {
  if (!policy.rules[yearId]) {
    policy.rules[yearId] = {
      included: false,
      weight: 0,
      reason: '',
      convertedValue: '',
      conversionNote: '',
    };
  }
  return policy.rules[yearId];
}

function isPredictionMode(mod, system) {
  return system !== 'uk' && mod?.usesCwExamPrediction === true;
}

function getYearCourseworkComponents(year, moduleIndex) {
  return Array.isArray(year.store?.courseworkComponents?.[moduleIndex])
    ? year.store.courseworkComponents[moduleIndex]
    : [];
}

function calculateYearCourseworkFromComponents(year, moduleIndex, system) {
  const componentSystem = getComponentMarkSystem(system);
  const components = getYearCourseworkComponents(year, moduleIndex);
  const valid = components
    .map((component, index) => ({
      index,
      mark: parseGradeValue(component?.mark, componentSystem),
      weight: parseGradeValue(component?.weight, 'uk'),
    }))
    .filter((component) => component.mark !== null);

  if (!valid.length) return null;

  const explicit = valid.filter((component) => component.weight !== null);
  const implicit = valid.filter((component) => component.weight === null);
  const explicitTotal = explicit.reduce((sum, component) => sum + component.weight, 0);
  const autoWeight = implicit.length ? Math.max(0, 100 - explicitTotal) / implicit.length : 0;

  let weightedSum = 0;
  let totalWeight = 0;
  valid.forEach((component) => {
    const weight = component.weight !== null ? component.weight : autoWeight;
    weightedSum += component.mark * weight;
    totalWeight += weight;
  });

  return totalWeight > 0 ? weightedSum / totalWeight : null;
}

function getYearEffectiveCourseworkMark(year, moduleIndex, system) {
  const calculated = calculateYearCourseworkFromComponents(year, moduleIndex, system);
  if ((system === 'uk' || isPredictionMode(year.store.modules[moduleIndex], system)) && calculated !== null) {
    return calculated;
  }
  return parseGradeValue(year.store?.coursework?.[moduleIndex], getComponentMarkSystem(system));
}

function getYearModuleFinal(year, moduleIndex, system = getGradingSystem(year.id)) {
  const mod = year.store?.modules?.[moduleIndex];
  if (!mod) return null;

  const courseworkWeight = Number(mod.cw) || 0;
  const examWeight = Number(mod.exam) || 0;
  const totalWeight = courseworkWeight + examWeight;

  if (system !== 'uk') {
    if (!isPredictionMode(mod, system)) {
      if (system === 'de5') {
        const courseworkGrade = calculateYearCourseworkFromComponents(year, moduleIndex, system);
        if (courseworkGrade !== null) return courseworkGrade;
      }
      return parseGradeValue(year.store?.finalGrades?.[moduleIndex], system);
    }

    if (totalWeight <= 0) return parseGradeValue(year.store?.finalGrades?.[moduleIndex], system);

    const coursework = getYearEffectiveCourseworkMark(year, moduleIndex, system);
    const exam = parseGradeValue(year.store?.exams?.[moduleIndex], getComponentMarkSystem(system));

    if (courseworkWeight > 0 && coursework === null) return null;
    if (examWeight > 0 && exam === null) return null;

    const weightedMark = (
      (courseworkWeight > 0 ? coursework * courseworkWeight : 0) +
      (examWeight > 0 ? exam * examWeight : 0)
    ) / totalWeight;

    return system === 'de5' ? weightedMark : percentToNativeGrade(weightedMark, system);
  }

  if (totalWeight <= 0) return null;

  const coursework = getYearEffectiveCourseworkMark(year, moduleIndex, 'uk');
  const exam = parseGradeValue(year.store?.exams?.[moduleIndex], 'uk');

  if (courseworkWeight > 0 && examWeight === 0) return coursework;
  if (examWeight > 0 && courseworkWeight === 0) return exam;
  if (coursework === null || exam === null) return null;

  return ((coursework * courseworkWeight) + (exam * examWeight)) / totalWeight;
}

function getYearAggregate(year) {
  const modules = year.store?.modules || [];
  const system = getGradingSystem(year.id);
  let weightedValue = 0;
  let gradedCredits = 0;
  let attemptedCredits = 0;
  let gradedModules = 0;

  modules.forEach((mod, moduleIndex) => {
    const credits = Number(mod.credits) || 0;
    attemptedCredits += credits;
    const final = getYearModuleFinal(year, moduleIndex, system);
    if (final === null) return;
    weightedValue += final * credits;
    gradedCredits += credits;
    gradedModules += 1;
  });

  return {
    value: gradedCredits > 0 ? weightedValue / gradedCredits : null,
    gradedCredits,
    attemptedCredits,
    gradedModules,
    moduleCount: modules.length,
    missingCredits: Math.max(0, attemptedCredits - gradedCredits),
  };
}

function buildTagLine(value, system) {
  if (value === null || value === undefined) return 'No result yet';
  const cls = classifyWithSystem(value, system);
  if (system === 'uk' && cls.badge && cls.label && cls.badge !== cls.label) {
    return `${cls.badge} / ${cls.label}`;
  }
  return cls.badge || cls.label || 'No tag yet';
}

function describeDisplay(value, system) {
  return formatSelectedGradeForSystem(value, system);
}

function getYearSummary(year) {
  const system = getGradingSystem(year.id);
  const aggregate = getYearAggregate(year);
  const display = describeDisplay(aggregate.value, system);
  return {
    id: year.id,
    label: year.label,
    system,
    systemTitle: getGradingSystemTitle(system),
    university: getEffectiveUniversity(year.id) || 'University',
    course: getEffectiveCourse(year.id) || 'Course',
    academicYearLabel: getEffectiveAcademicYearLabel(year.id) || '',
    aggregate,
    display,
    tagLine: buildTagLine(aggregate.value, system),
    creditLabel: getCreditUnitLabel({ system, plural: true }),
  };
}

function formatPolicyTemplateLabel(template) {
  return POLICY_TEMPLATES.find((item) => item.value === template)?.label || 'Manual custom weights';
}

function collectPolicyEvaluation(sourcePolicy = ensureDegreePolicyState()) {
  const policy = sourcePolicy;
  const yearSummaries = getSortedYears().map(getYearSummary);
  const yearMap = Object.fromEntries(yearSummaries.map((year) => [year.id, year]));
  const outputYear = yearMap[policy.outputYearId] || yearSummaries[yearSummaries.length - 1] || null;
  const outputSystem = outputYear?.system || 'uk';
  const countedYears = [];
  const excludedYears = [];
  const blockers = [];
  const warnings = [];
  const compatibilityNotes = [];
  let totalWeight = 0;
  let totalGradedCredits = 0;
  let totalAttemptedCredits = 0;

  yearSummaries.forEach((summary) => {
    const rule = getPolicyRule(policy, summary.id);
    const included = !!rule.included;
    const weight = Math.max(0, Number(rule.weight) || 0);
    if (!included) {
      excludedYears.push({
        summary,
        rule,
        weight: 0,
        status: 'excluded',
      });
      return;
    }

    const sameSystem = summary.system === outputSystem;
    const convertedValue = sameSystem ? summary.aggregate.value : parseGradeValue(rule.convertedValue, outputSystem);
    const hasData = summary.aggregate.value !== null;
    const missingCredits = summary.aggregate.missingCredits;
    const converted = !sameSystem && convertedValue !== null;

    totalWeight += weight;
    totalGradedCredits += summary.aggregate.gradedCredits;
    totalAttemptedCredits += summary.aggregate.attemptedCredits;

    if (!hasData) {
      blockers.push(`${summary.label} does not have any graded modules yet.`);
    }
    if (!sameSystem && !converted) {
      blockers.push(`${summary.label} needs manual conversion before it can count toward ${outputYear?.label || 'the output year'}.`);
    }
    if (sameSystem && missingCredits > 0) {
      warnings.push(`${summary.label} still has ${missingCredits} missing ${summary.creditLabel}.`);
    }
    if (converted && missingCredits > 0) {
      warnings.push(`${summary.label} still has missing ${summary.creditLabel}; the converted value may change.`);
    }
    if (!sameSystem && converted) {
      compatibilityNotes.push(`${summary.label} uses ${summary.systemTitle} and is counting as ${describeDisplay(convertedValue, outputSystem).main}.`);
    }

    countedYears.push({
      summary,
      rule,
      weight,
      sameSystem,
      converted,
      convertedValue,
      degreeValue: sameSystem ? summary.aggregate.value : convertedValue,
      status: !hasData ? 'blocked' : (!sameSystem && !converted ? 'blocked' : (converted ? 'converted' : 'compatible')),
    });
  });

  if (!policy.configured) blockers.unshift('Policy setup needed.');
  if (!outputYear) blockers.unshift('Choose which year the final degree result should be expressed in.');
  if (!countedYears.length) blockers.unshift('Choose at least one year to count toward the degree result.');
  if (countedYears.length && Math.abs(totalWeight - 100) > 0.01) blockers.unshift('Counted year weights must add up to 100%.');

  let forecast = null;
  if (!blockers.length && countedYears.length) {
    forecast = countedYears.reduce((sum, item) => sum + ((item.degreeValue ?? 0) * item.weight), 0) / 100;
  }

  const missingCredits = Math.max(0, totalAttemptedCredits - totalGradedCredits);
  const allCountedCompatible = countedYears.every((item) => item.status === 'compatible');
  if (!compatibilityNotes.length) {
    compatibilityNotes.push(allCountedCompatible
      ? `All counted years compatible${excludedYears.length ? ` · ${excludedYears.map((item) => item.summary.label).join(', ')} excluded` : ''}`
      : 'Some counted years need manual conversion before they can be combined.');
  }

  const strongestYear = countedYears
    .filter((item) => item.degreeValue !== null)
    .sort((a, b) => {
      if (outputSystem === 'de5') return a.degreeValue - b.degreeValue;
      return b.degreeValue - a.degreeValue;
    })[0] || null;

  const lowestYear = countedYears
    .filter((item) => item.degreeValue !== null)
    .sort((a, b) => {
      if (outputSystem === 'de5') return b.degreeValue - a.degreeValue;
      return a.degreeValue - b.degreeValue;
    })[0] || null;

  const biggestImpact = countedYears.slice().sort((a, b) => b.weight - a.weight)[0] || null;
  const contributionRows = countedYears
    .filter((item) => item.degreeValue !== null)
    .map((item) => ({
      label: item.summary.label,
      weight: item.weight,
      contribution: (item.degreeValue * item.weight) / 100,
      display: describeDisplay(item.degreeValue, outputSystem).main,
    }));

  return {
    policy,
    outputYear,
    outputSystem,
    forecast,
    forecastDisplay: describeDisplay(forecast, outputSystem),
    forecastTagLine: buildTagLine(forecast, outputSystem),
    yearSummaries,
    countedYears,
    excludedYears,
    blockers,
    warnings,
    compatibilityNotes,
    totalWeight,
    totalGradedCredits,
    totalAttemptedCredits,
    missingCredits,
    strongestYear,
    lowestYear,
    biggestImpact,
    contributionRows,
    coverageText: `Data coverage: ${totalGradedCredits} counted ${getCreditUnitLabel({ system: outputSystem, plural: totalGradedCredits !== 1 })} graded · ${missingCredits} missing`,
    calculationText: countedYears.length
      ? countedYears.map((item) => `${item.summary.label} ${item.weight}%`).join(' · ')
      : 'No counted years selected yet.',
  };
}

function getPolicyActionLabel(evaluation) {
  if (!evaluation.policy.configured) return 'Set up policy';
  if (evaluation.blockers.length) return 'Fix policy issue';
  return 'Edit policy';
}

function getStatusTone(evaluation) {
  if (evaluation.blockers.length) return 'blocking';
  if (evaluation.warnings.length) return 'warning';
  return 'quiet';
}

function getStatusText(evaluation) {
  if (evaluation.blockers.length) {
    if (!evaluation.policy.configured) return 'Degree-wide prediction unavailable';
    return evaluation.blockers[0];
  }
  if (evaluation.warnings.length) return `${evaluation.warnings.length} issue${evaluation.warnings.length === 1 ? '' : 's'} need attention`;
  return `All counted years compatible · ${evaluation.missingCredits} missing ${getCreditUnitLabel({ system: evaluation.outputSystem, plural: evaluation.missingCredits !== 1 })}`;
}

function getHeroSummary(evaluation) {
  if (!evaluation.forecast && evaluation.forecast !== 0) {
    if (!evaluation.policy.configured) {
      return {
        title: 'Degree Forecast unavailable',
        subtitle: 'Policy setup needed',
        body: 'Choose which years count and how they are weighted.',
      };
    }
    return {
      title: 'Degree Forecast unavailable',
      subtitle: 'Action needed',
      body: evaluation.blockers[0] || 'Resolve the policy issue to calculate the projected result.',
    };
  }
  return {
    title: evaluation.forecastDisplay.main,
    subtitle: evaluation.forecastTagLine,
    body: evaluation.outputYear?.systemTitle || getGradingSystemTitle(evaluation.outputSystem),
  };
}

function renderCountedYearPills(evaluation) {
  if (!evaluation.countedYears.length) {
    return '<div class="degree-pill-row"><span class="degree-pill muted">No counted years yet</span></div>';
  }
  return `<div class="degree-pill-row">${evaluation.countedYears.map((item) => (
    `<span class="degree-pill ${item.status}">${escapeHtml(item.summary.label)} · ${item.weight}%</span>`
  )).join('')}</div>`;
}

function renderStatusDetails(evaluation) {
  if (!showStatusDetails || (!evaluation.blockers.length && !evaluation.warnings.length)) return '';
  return `<div class="degree-status-details">
    ${evaluation.blockers.length ? `<div class="degree-status-detail-block">
      <div class="degree-detail-label">Blocking</div>
      <ul>${evaluation.blockers.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
    </div>` : ''}
    ${evaluation.warnings.length ? `<div class="degree-status-detail-block">
      <div class="degree-detail-label">Watchouts</div>
      <ul>${evaluation.warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
    </div>` : ''}
  </div>`;
}

function renderHeroCard(evaluation) {
  const hero = getHeroSummary(evaluation);
  const statusTone = getStatusTone(evaluation);
  const actionLabel = getPolicyActionLabel(evaluation);
  return `<section class="degree-hero-card degree-surface">
    <div class="degree-brand-layer degree-brand-layer-hero" aria-hidden="true"></div>
    <div class="degree-card-kicker">Degree Forecast</div>
    <div class="degree-hero-main ${evaluation.forecast === null ? 'is-unavailable' : ''}">
      <div class="degree-hero-result">${escapeHtml(hero.title)}</div>
      <div class="degree-hero-tag">${escapeHtml(hero.subtitle)}</div>
      <div class="degree-hero-system">${escapeHtml(hero.body)}</div>
    </div>
    <div class="degree-hero-support">
      ${evaluation.forecast !== null ? `<div class="degree-coverage-line">${escapeHtml(evaluation.coverageText)}</div>` : ''}
      ${evaluation.forecast === null ? `<button class="degree-action-btn degree-action-btn-primary" type="button" onclick="openDegreePolicySetup()">${escapeHtml(actionLabel)}</button>` : ''}
    </div>
    <button class="degree-status-strip ${statusTone}" type="button" onclick="toggleDegreeStatusDetails()">
      <span>${escapeHtml(getStatusText(evaluation))}</span>
      ${(evaluation.blockers.length || evaluation.warnings.length) ? `<span>${showStatusDetails ? 'Hide details' : 'View details'}</span>` : ''}
    </button>
    ${renderStatusDetails(evaluation)}
    <div class="degree-hero-footer">
      <div class="degree-footer-label">Counted years</div>
      ${renderCountedYearPills(evaluation)}
      <details class="degree-calc-details">
        <summary>How this is being calculated</summary>
        <div class="degree-calc-copy">${escapeHtml(evaluation.calculationText)}</div>
        ${evaluation.outputYear ? `<div class="degree-calc-copy">Output year: ${escapeHtml(evaluation.outputYear.label)} · ${escapeHtml(evaluation.outputYear.systemTitle)}</div>` : ''}
      </details>
    </div>
  </section>`;
}

function renderPolicyCard(evaluation) {
  const actionLabel = getPolicyActionLabel(evaluation);
  const setupStrong = actionLabel !== 'Edit policy';
  const outputLabel = evaluation.outputYear?.label || 'Not set';
  const countedText = evaluation.countedYears.length
    ? evaluation.countedYears.map((item) => item.summary.label).join(', ')
    : 'None selected';
  return `<aside class="degree-policy-card degree-surface">
    <div class="degree-card-kicker">Degree Policy</div>
    <div class="degree-policy-rows">
      <div class="degree-policy-row"><span>Template</span><strong>${escapeHtml(formatPolicyTemplateLabel(evaluation.policy.template))}</strong></div>
      <div class="degree-policy-row"><span>Model</span><strong>Year-weighted</strong></div>
      <div class="degree-policy-row"><span>Output</span><strong>${escapeHtml(outputLabel)}</strong></div>
      <div class="degree-policy-row"><span>Counted years</span><strong>${escapeHtml(countedText)}</strong></div>
    </div>
    <button class="degree-policy-edit ${setupStrong ? 'is-strong' : ''}" type="button" onclick="openDegreePolicySetup()">${escapeHtml(actionLabel)}</button>
  </aside>`;
}

function renderMetricBarRows(rows, maxValue, formatter) {
  if (!rows.length) {
    return '<div class="degree-empty-card">Not enough data yet.</div>';
  }
  return rows.map((row) => {
    const width = maxValue > 0 ? Math.max(8, (row.value / maxValue) * 100) : 0;
    return `<div class="degree-bar-row">
      <div class="degree-bar-meta">
        <span>${escapeHtml(row.label)}</span>
        <strong>${escapeHtml(formatter(row))}</strong>
      </div>
      <div class="degree-bar-track"><div class="degree-bar-fill" style="width:${width.toFixed(1)}%"></div></div>
    </div>`;
  }).join('');
}

function renderInsights(evaluation) {
  const comparisonRows = evaluation.yearSummaries.map((summary) => ({
    label: summary.label,
    value: summary.aggregate.value === null ? 0 : (
      summary.system === 'de5'
        ? Math.max(0, 5 - summary.aggregate.value)
        : summary.aggregate.value
    ),
    display: summary.aggregate.value === null ? 'No result yet' : summary.display.main,
  }));
  const comparisonMax = comparisonRows.reduce((max, row) => Math.max(max, row.value), 0);
  const cards = [];

  cards.push(`<article class="degree-insight-card degree-surface">
    <div class="degree-card-kicker">Year prediction comparison</div>
    ${renderMetricBarRows(comparisonRows, comparisonMax, (row) => row.display)}
  </article>`);

  if (evaluation.policy.configured && evaluation.contributionRows.length) {
    const maxContribution = evaluation.contributionRows.reduce((max, row) => Math.max(max, Math.abs(row.contribution)), 0);
    cards.push(`<article class="degree-insight-card degree-surface">
      <div class="degree-card-kicker">Degree contribution by year</div>
      ${renderMetricBarRows(
        evaluation.contributionRows.map((row) => ({
          label: row.label,
          value: Math.abs(row.contribution),
          display: `${row.weight}% · ${row.display}`,
        })),
        maxContribution,
        (row) => row.display,
      )}
    </article>`);
  }

  if (evaluation.missingCredits > 0) {
    cards.push(`<article class="degree-insight-card degree-surface">
      <div class="degree-card-kicker">Missing data</div>
      <div class="degree-insight-stat">${escapeHtml(String(evaluation.missingCredits))}</div>
      <div class="degree-insight-copy">Missing counted ${escapeHtml(getCreditUnitLabel({ system: evaluation.outputSystem, plural: evaluation.missingCredits !== 1 }))} could still move the forecast.</div>
    </article>`);
  }

  const validCountedYears = evaluation.countedYears.filter((item) => item.degreeValue !== null);
  if (validCountedYears.length >= 2 && evaluation.strongestYear) {
    cards.push(`<article class="degree-insight-card degree-surface">
      <div class="degree-card-kicker">Strongest counted year</div>
      <div class="degree-insight-stat">${escapeHtml(evaluation.strongestYear.summary.label)}</div>
      <div class="degree-insight-copy">${escapeHtml(describeDisplay(evaluation.strongestYear.degreeValue, evaluation.outputSystem).main)} · ${escapeHtml(buildTagLine(evaluation.strongestYear.degreeValue, evaluation.outputSystem))}</div>
    </article>`);
  }

  if (validCountedYears.length >= 2 && evaluation.lowestYear) {
    cards.push(`<article class="degree-insight-card degree-surface">
      <div class="degree-card-kicker">Lowest counted year</div>
      <div class="degree-insight-stat">${escapeHtml(evaluation.lowestYear.summary.label)}</div>
      <div class="degree-insight-copy">${escapeHtml(describeDisplay(evaluation.lowestYear.degreeValue, evaluation.outputSystem).main)} · ${escapeHtml(buildTagLine(evaluation.lowestYear.degreeValue, evaluation.outputSystem))}</div>
    </article>`);
  }

  if (evaluation.policy.weightingMode === 'year-weighted' && evaluation.biggestImpact) {
    cards.push(`<article class="degree-insight-card degree-surface">
      <div class="degree-card-kicker">Biggest impact</div>
      <div class="degree-insight-stat">${escapeHtml(evaluation.biggestImpact.summary.label)}</div>
      <div class="degree-insight-copy">${escapeHtml(`${evaluation.biggestImpact.summary.label} carries ${evaluation.biggestImpact.weight}% of your degree result.`)}</div>
      <div class="degree-insight-copy">Improvement here moves the overall forecast most.</div>
    </article>`);
  }

  return `<section class="degree-section">
    <div class="degree-section-head">
      <h2>Degree Insights</h2>
      <p>Highlights the years that are strongest, weakest, or most influential.</p>
    </div>
    <div class="degree-insights-grid">${cards.join('')}</div>
  </section>`;
}

function getJourneyMeta(item, evaluation) {
  if (item.status === 'excluded') {
    return {
      result: 'Does not count',
      support: item.rule.reason || 'Excluded from the degree calculation',
      status: 'Excluded',
    };
  }
  if (item.status === 'blocked') {
    return {
      result: item.summary.aggregate.value === null ? 'No result yet' : item.summary.display.main,
      support: item.sameSystem ? 'Needs more graded data' : 'Manual conversion needed',
      status: 'Needs attention',
    };
  }
  if (item.status === 'converted') {
    return {
      result: item.summary.display.main,
      support: `Used as ${describeDisplay(item.convertedValue, evaluation.outputSystem).main} ${getGradingSystemTitle(evaluation.outputSystem)} equivalent`,
      status: 'Converted',
    };
  }
  return {
    result: item.summary.display.main,
    support: buildTagLine(item.degreeValue, evaluation.outputSystem),
    status: 'Compatible',
  };
}

function renderYearJourney(evaluation) {
  const allJourneyItems = [
    ...evaluation.countedYears,
    ...evaluation.excludedYears,
  ].sort((a, b) => getYearNumber(a.summary.label) - getYearNumber(b.summary.label));

  return `<section class="degree-section degree-journey-section">
    <div class="degree-brand-layer degree-brand-layer-journey" aria-hidden="true"></div>
    <div class="degree-section-head">
      <h2>Year Journey</h2>
      <p>Each year is a step in the degree path. Select a year to inspect details.</p>
    </div>
    <div class="degree-journey-grid">
      ${allJourneyItems.map((item, index) => {
        const meta = getJourneyMeta(item, evaluation);
        const weightText = item.status === 'excluded'
          ? `Weight 0%`
          : `Counts · Weight ${item.weight}%`;
        return `<button class="degree-year-card ${item.status}" type="button" onclick="openDegreeYearDetails('${escapeHtml(item.summary.id)}')">
          <span class="degree-year-step">${index + 1}</span>
          <span class="degree-year-name">${escapeHtml(item.summary.label)}</span>
          <span class="degree-year-result">${escapeHtml(meta.result)}</span>
          <span class="degree-year-tag">${escapeHtml(meta.support)}</span>
          <span class="degree-year-meta">${escapeHtml(weightText)}</span>
          <span class="degree-year-status">${escapeHtml(meta.status)}</span>
        </button>`;
      }).join('')}
    </div>
  </section>`;
}

function renderCompatibilityNotes(evaluation) {
  return `<section class="degree-section">
    <div class="degree-section-head">
      <h2>Compatibility Notes</h2>
      <p>Quiet when everything lines up, more explicit only when something needs attention.</p>
    </div>
    <div class="degree-notes-list degree-surface">
      ${evaluation.compatibilityNotes.map((item) => `<div class="degree-note-row">${escapeHtml(item)}</div>`).join('')}
    </div>
  </section>`;
}

function ensureDegreeModalBindings() {
  [
    ['degree-policy-modal', closeDegreePolicySetup],
    ['degree-year-modal', closeDegreeYearDetails],
  ].forEach(([id, handler]) => {
    const modal = document.getElementById(id);
    if (!modal || modal.dataset.bound === 'true') return;
    modal.dataset.bound = 'true';
    modal.addEventListener('click', (event) => {
      if (event.target === modal) handler();
    });
  });
}

export function renderDegreeOverview() {
  ensureDegreeModalBindings();
  const host = document.getElementById('degree-overview-root');
  if (!host) return;
  const evaluation = collectPolicyEvaluation();
  host.innerHTML = `
    <div class="degree-overview-page">
      <div class="degree-page-head">
        <div>
          <div class="degree-page-kicker">Student-facing dashboard</div>
          <h1>Degree Overview</h1>
          <p>Result first, context compact, details available when you need them.</p>
        </div>
      </div>
      <div class="degree-top-grid">
        ${renderHeroCard(evaluation)}
        ${renderPolicyCard(evaluation)}
      </div>
      ${renderInsights(evaluation)}
      ${renderYearJourney(evaluation)}
      ${renderCompatibilityNotes(evaluation)}
    </div>
  `;
  renderDegreePolicySetup();
  renderDegreeYearDetails();
}

function readDraftValue(id, fallback = '') {
  const input = document.getElementById(id);
  return input ? input.value : fallback;
}

function readDraftChecked(id, fallback = false) {
  const input = document.getElementById(id);
  return input ? input.checked : fallback;
}

function syncDraftFromForm() {
  if (!degreePolicyDraft) return;
  degreePolicyDraft.outputYearId = readDraftValue('degree-policy-output-year', degreePolicyDraft.outputYearId);
  degreePolicyDraft.template = readDraftValue('degree-policy-template', degreePolicyDraft.template);

  getSortedYears().forEach((year) => {
    const rule = getPolicyRule(degreePolicyDraft, year.id);
    rule.included = readDraftChecked(`degree-policy-include-${year.id}`, rule.included);
    rule.weight = Number(readDraftValue(`degree-policy-weight-${year.id}`, String(rule.weight)).trim()) || 0;
    rule.reason = readDraftValue(`degree-policy-reason-${year.id}`, rule.reason).trim();
    rule.convertedValue = readDraftValue(`degree-policy-conversion-${year.id}`, rule.convertedValue).trim();
    rule.conversionNote = readDraftValue(`degree-policy-note-${year.id}`, rule.conversionNote).trim();
  });
}

function getDraftEvaluation() {
  if (!degreePolicyDraft) clonePolicyForDraft();
  return collectPolicyEvaluation(degreePolicyDraft);
}

export function openDegreePolicySetup() {
  clonePolicyForDraft();
  const modal = document.getElementById('degree-policy-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  syncModalScrollLock();
  renderDegreePolicySetup();
}

export function closeDegreePolicySetup() {
  degreePolicyDraft = null;
  const modal = document.getElementById('degree-policy-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  syncModalScrollLock();
}

export function refreshDegreePolicyDraft() {
  syncDraftFromForm();
  renderDegreePolicySetup();
}

function applyTemplateToDraft(template) {
  if (!degreePolicyDraft) clonePolicyForDraft();
  const years = getSortedYears().filter((year) => !year.store?.archived);
  const outputYearId = degreePolicyDraft.outputYearId || years[years.length - 1]?.id || '';
  const indexByYear = Object.fromEntries(years.map((year, index) => [year.id, index]));
  let includedYearIds = years.map((year) => year.id);

  if (template === 'final-year') {
    includedYearIds = outputYearId ? [outputYearId] : [];
  } else if (template === 'final-two') {
    const outputIndex = indexByYear[outputYearId];
    if (Number.isInteger(outputIndex)) {
      includedYearIds = years.slice(Math.max(0, outputIndex - 1), outputIndex + 1).map((year) => year.id);
    } else {
      includedYearIds = years.slice(-2).map((year) => year.id);
    }
  }

  const weights = distributeWeights(includedYearIds);
  getSortedYears().forEach((year) => {
    const rule = getPolicyRule(degreePolicyDraft, year.id);
    rule.included = includedYearIds.includes(year.id);
    rule.weight = weights[year.id] || 0;
    if (!rule.included && !rule.reason) rule.reason = year.store?.archived ? 'Archived year' : '';
  });
  degreePolicyDraft.template = template;
}

export function applyDegreePolicyTemplate(template) {
  syncDraftFromForm();
  applyTemplateToDraft(template);
  renderDegreePolicySetup();
}

export function saveDegreePolicySetup() {
  syncDraftFromForm();
  if (!degreePolicyDraft) return;
  degreePolicyDraft.configured = true;
  store.state.degreePolicy = deepClone(degreePolicyDraft);
  save();
  closeDegreePolicySetup();
  renderDegreeOverview();
}

export function renderDegreePolicySetup() {
  const modal = document.getElementById('degree-policy-modal');
  const host = document.getElementById('degree-policy-root');
  if (!modal || !host || modal.classList.contains('hidden')) return;
  const evaluation = getDraftEvaluation();
  const years = getSortedYears();

  host.innerHTML = `
    <div class="degree-policy-page">
      <button class="degree-back-link" type="button" onclick="closeDegreePolicySetup()">← Back to Degree Overview</button>
      <div class="degree-policy-head">
        <div class="degree-page-kicker">Degree Policy Setup</div>
        <h2>Tell UniTrack how your degree result should be calculated.</h2>
      </div>
      <div class="degree-policy-steps">
        <section class="degree-policy-step degree-surface">
          <div class="degree-step-number">Step 1</div>
          <div class="degree-step-copy">
            <h3>Choose a common template</h3>
            <p>Start with a pattern, then fine-tune the years and weights below.</p>
          </div>
          <div class="degree-template-row">
            ${POLICY_TEMPLATES.map((template) => (
              `<button class="degree-template-btn ${degreePolicyDraft.template === template.value ? 'active' : ''}" type="button" onclick="applyDegreePolicyTemplate('${escapeHtml(template.value)}')">${escapeHtml(template.label)}</button>`
            )).join('')}
          </div>
        </section>
        <section class="degree-policy-step degree-surface">
          <div class="degree-step-number">Step 2</div>
          <div class="degree-step-copy">
            <h3>Choose graduating / output year</h3>
            <p>The final forecast will be shown in this year’s grading system.</p>
          </div>
          <select class="nav-select degree-policy-select" id="degree-policy-output-year" onchange="refreshDegreePolicyDraft()">
            ${years.map((year) => `<option value="${escapeHtml(year.id)}" ${degreePolicyDraft.outputYearId === year.id ? 'selected' : ''}>${escapeHtml(year.label)} · ${escapeHtml(getGradingSystemTitle(getGradingSystem(year.id)))}</option>`).join('')}
          </select>
        </section>
        <section class="degree-policy-step degree-surface">
          <div class="degree-step-number">Step 3</div>
          <div class="degree-step-copy">
            <h3>Choose which years count</h3>
            <p>Placement or foundation years can be excluded without cluttering the main dashboard.</p>
          </div>
          <div class="degree-policy-year-list">
            ${years.map((year) => {
              const rule = getPolicyRule(degreePolicyDraft, year.id);
              return `<label class="degree-policy-year-row ${rule.included ? 'included' : 'excluded'}">
                <div>
                  <strong>${escapeHtml(year.label)}</strong>
                  <span>${escapeHtml(getGradingSystemTitle(getGradingSystem(year.id)))}</span>
                </div>
                <input type="checkbox" id="degree-policy-include-${escapeHtml(year.id)}" ${rule.included ? 'checked' : ''} onchange="refreshDegreePolicyDraft()">
              </label>
              <div class="degree-policy-reason ${rule.included ? 'hidden' : ''}">
                <label for="degree-policy-reason-${escapeHtml(year.id)}">Reason for exclusion</label>
                <input class="input" id="degree-policy-reason-${escapeHtml(year.id)}" value="${escapeHtml(rule.reason || '')}" placeholder="Placement year" onchange="refreshDegreePolicyDraft()">
              </div>`;
            }).join('')}
          </div>
        </section>
        <section class="degree-policy-step degree-surface">
          <div class="degree-step-number">Step 4</div>
          <div class="degree-step-copy">
            <h3>Set weights</h3>
            <p>Only counted years need a weight. The total should add up to 100%.</p>
          </div>
          <div class="degree-weight-list">
            ${years.map((year) => {
              const rule = getPolicyRule(degreePolicyDraft, year.id);
              return `<label class="degree-weight-row ${rule.included ? '' : 'muted'}">
                <span>${escapeHtml(year.label)}</span>
                <div class="degree-weight-input-wrap">
                  <input class="input" id="degree-policy-weight-${escapeHtml(year.id)}" type="number" min="0" max="100" step="1" value="${escapeHtml(String(rule.weight || 0))}" ${rule.included ? '' : 'disabled'} onchange="refreshDegreePolicyDraft()">
                  <span>%</span>
                </div>
              </label>`;
            }).join('')}
            <div class="degree-weight-total ${Math.abs(evaluation.totalWeight - 100) > 0.01 ? 'invalid' : ''}">Total ${escapeHtml(String(Math.round(evaluation.totalWeight)))}%</div>
          </div>
        </section>
        ${evaluation.countedYears.some((item) => !item.sameSystem) ? `<section class="degree-policy-step degree-surface">
          <div class="degree-step-number">Step 5</div>
          <div class="degree-step-copy">
            <h3>Manual conversions if needed</h3>
            <p>Only years that use a different grading system from the output year need a converted value.</p>
          </div>
          <div class="degree-conversion-list">
            ${evaluation.countedYears.filter((item) => !item.sameSystem).map((item) => (
              `<div class="degree-conversion-card">
                <div class="degree-conversion-head">
                  <strong>${escapeHtml(item.summary.label)}</strong>
                  <span>${escapeHtml(item.summary.systemTitle)} → ${escapeHtml(getGradingSystemTitle(evaluation.outputSystem))}</span>
                </div>
                <div class="degree-conversion-copy">Original result: ${escapeHtml(item.summary.display.main)}</div>
                <label for="degree-policy-conversion-${escapeHtml(item.summary.id)}">Converted value used</label>
                <input class="input" id="degree-policy-conversion-${escapeHtml(item.summary.id)}" value="${escapeHtml(item.rule.convertedValue || '')}" placeholder="Enter equivalent result" onchange="refreshDegreePolicyDraft()">
                <label for="degree-policy-note-${escapeHtml(item.summary.id)}">Note</label>
                <input class="input" id="degree-policy-note-${escapeHtml(item.summary.id)}" value="${escapeHtml(item.rule.conversionNote || '')}" placeholder="Converted using receiving university guidance" onchange="refreshDegreePolicyDraft()">
              </div>`
            )).join('')}
          </div>
        </section>` : ''}
      </div>
      <div class="degree-policy-footer">
        <button class="nav-btn" type="button" onclick="closeDegreePolicySetup()">Cancel</button>
        <button class="nav-btn calendar-btn" type="button" onclick="saveDegreePolicySetup()">Save policy</button>
      </div>
    </div>
  `;
}

export function openDegreeYearDetails(yearId) {
  activeYearDetailsId = yearId;
  const modal = document.getElementById('degree-year-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  syncModalScrollLock();
  renderDegreeYearDetails();
}

export function closeDegreeYearDetails() {
  activeYearDetailsId = '';
  const modal = document.getElementById('degree-year-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  syncModalScrollLock();
}

export function openDegreeYearInTracker() {
  if (!activeYearDetailsId) return;
  const yearId = activeYearDetailsId;
  closeDegreeYearDetails();
  closeDegreeOverviewPanels();
  window.handleYearDropdown?.(`year:${yearId}`);
}

export function renderDegreeYearDetails() {
  const modal = document.getElementById('degree-year-modal');
  const host = document.getElementById('degree-year-root');
  if (!modal || !host || modal.classList.contains('hidden') || !activeYearDetailsId) return;
  const evaluation = collectPolicyEvaluation();
  const yearItem = [...evaluation.countedYears, ...evaluation.excludedYears].find((item) => item.summary.id === activeYearDetailsId);
  if (!yearItem) {
    host.innerHTML = '';
    return;
  }

  const summary = yearItem.summary;
  const aggregateMetric = getAggregateMetricLabel(summary.system);
  const statusText = yearItem.status === 'excluded'
    ? 'Does not count toward degree'
    : yearItem.status === 'converted'
      ? 'Counts toward degree as a converted result'
      : yearItem.status === 'blocked'
        ? 'Needs attention before it can count'
        : 'Counts toward degree';

  host.innerHTML = `
    <div class="degree-year-detail-page">
      <button class="dashboard-close degree-overlay-close" type="button" aria-label="Close year details" onclick="closeDegreeYearDetails()">&times;</button>
      <div class="degree-page-kicker">Year details</div>
      <h2>${escapeHtml(summary.label)}</h2>
      <div class="degree-year-detail-grid">
        <section class="degree-surface">
          <h3>Institution</h3>
          <div class="degree-detail-pair"><span>Institution</span><strong>${escapeHtml(summary.university)}</strong></div>
          <div class="degree-detail-pair"><span>Course/programme</span><strong>${escapeHtml(summary.course)}</strong></div>
          <div class="degree-detail-pair"><span>Academic year</span><strong>${escapeHtml(summary.academicYearLabel)}</strong></div>
          <div class="degree-detail-pair"><span>Grading system</span><strong>${escapeHtml(summary.systemTitle)}</strong></div>
        </section>
        <section class="degree-surface">
          <h3>Degree status</h3>
          <div class="degree-detail-pair"><span>Status</span><strong>${escapeHtml(statusText)}</strong></div>
          <div class="degree-detail-pair"><span>Degree weight</span><strong>${escapeHtml(yearItem.status === 'excluded' ? '0%' : `${yearItem.weight}%`)}</strong></div>
          <div class="degree-detail-pair"><span>Compatibility</span><strong>${escapeHtml(getJourneyMeta(yearItem, evaluation).status)}</strong></div>
          ${yearItem.status === 'excluded' && yearItem.rule.reason ? `<div class="degree-detail-note">${escapeHtml(yearItem.rule.reason)}</div>` : ''}
        </section>
        <section class="degree-surface">
          <h3>Academic result</h3>
          <div class="degree-detail-pair"><span>Year prediction</span><strong>${escapeHtml(summary.display.main)}</strong></div>
          <div class="degree-detail-pair"><span>Classification/tag</span><strong>${escapeHtml(summary.tagLine)}</strong></div>
          <div class="degree-detail-pair"><span>${escapeHtml(aggregateMetric)}</span><strong>${escapeHtml(summary.aggregate.value === null ? 'Unavailable' : summary.display.main)}</strong></div>
          <div class="degree-detail-pair"><span>Credits graded</span><strong>${escapeHtml(String(summary.aggregate.gradedCredits))}</strong></div>
          <div class="degree-detail-pair"><span>Missing credits</span><strong>${escapeHtml(String(summary.aggregate.missingCredits))}</strong></div>
          <div class="degree-detail-pair"><span>Modules graded</span><strong>${escapeHtml(`${summary.aggregate.gradedModules} / ${summary.aggregate.moduleCount}`)}</strong></div>
        </section>
        ${yearItem.status === 'converted' ? `<section class="degree-surface">
          <h3>Manual conversion</h3>
          <div class="degree-detail-pair"><span>Original result</span><strong>${escapeHtml(summary.display.main)}</strong></div>
          <div class="degree-detail-pair"><span>Converted value used</span><strong>${escapeHtml(describeDisplay(yearItem.convertedValue, evaluation.outputSystem).main)}</strong></div>
          <div class="degree-detail-note">${escapeHtml(yearItem.rule.conversionNote || 'No conversion note saved.')}</div>
        </section>` : ''}
      </div>
      <div class="degree-year-detail-actions">
        <button class="nav-btn" type="button" onclick="openDegreeYearInTracker()">Open in Tracker</button>
        <button class="nav-btn" type="button" onclick="closeDegreeYearDetails()">Close</button>
      </div>
    </div>
  `;
}

export function toggleDegreeStatusDetails() {
  showStatusDetails = !showStatusDetails;
  renderDegreeOverview();
}

export function closeDegreeOverviewPanels() {
  document.getElementById('dashboard-modal')?.classList.add('hidden');
  document.getElementById('degree-policy-modal')?.classList.add('hidden');
  document.getElementById('degree-year-modal')?.classList.add('hidden');
  degreePolicyDraft = null;
  activeYearDetailsId = '';
  syncModalScrollLock();
}
