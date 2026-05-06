/**
 * Degree Overview page rendering and view-switching.
 *
 * The dashboard is intentionally student-facing: show the result first, keep
 * context compact, and move policy/detail work into focused overlays.
 */
import { store } from './store.js';
import { escapeHtml } from './utils.js';
import { getGradingSystem, classify, getCreditUnitLabel } from './grading.js';
import {
  save, getEffectiveUniversity, getEffectiveCourse,
  getEffectiveAcademicYearLabel, refreshActiveYear,
} from './state.js';
import {
  getDegreePolicy, saveDegreePolicy, getYearRule, applyPreset,
  getDegreeOutputYear, getDegreeOutputSystem,
  computeYearAggregate, getYearDegreeValue,
  validateDegreePolicy, calculateDegreePrediction,
  GRADING_SYSTEM_LABELS, DEGREE_MODES, EXCLUDED_REASONS,
  DEGREE_PRESETS, getDefaultYearRule,
} from './degree-policy.js';

let activeYearDetailsId = null;
let policyDraft = null;
let statusDetailsOpen = false;

// View switching -----------------------------------------------------------

export function showDegreeView() {
  const degreeView = document.getElementById('degree-view');
  const appMain = document.getElementById('app-main');
  if (!degreeView || !appMain) return;

  const isAlreadyActive = !degreeView.classList.contains('hidden');
  if (isAlreadyActive) { showTrackerView(); return; }

  appMain.classList.add('hidden');
  degreeView.classList.remove('hidden');
  document.querySelector('.nav-btn.degree-overview-btn')?.classList.add('active');
  renderDegreeDashboard();
}

export function showTrackerView() {
  document.getElementById('degree-view')?.classList.add('hidden');
  document.getElementById('app-main')?.classList.remove('hidden');
  document.querySelector('.nav-btn.degree-overview-btn')?.classList.remove('active');
}

// Main render --------------------------------------------------------------

export function renderDegreeDashboard() {
  const root = document.getElementById('degree-dashboard-root');
  if (!root) return;

  const model = buildDashboardModel();

  if (!model.yearIds.length) {
    root.innerHTML = renderHeader(model)
      + '<section class="degree-empty-state">'
      + '<div class="degree-empty-mark" aria-hidden="true">UT</div>'
      + '<h2>No academic years yet</h2>'
      + '<p>Add years and modules in the tracker, then come back here to set up your degree forecast.</p>'
      + '<button class="degree-primary-btn" type="button" onclick="showTrackerView()">Open Tracker</button>'
      + '</section>';
    return;
  }

  root.innerHTML = renderHeader(model)
    + '<main class="degree-command-centre" aria-label="Degree Overview">'
    + '<section class="degree-forecast-section">'
    + '<div class="degree-forecast-grid">'
    + renderForecastHero(model)
    + renderPolicySummaryCard(model)
    + '</div>'
    + renderStatusStrip(model)
    + '</section>'
    + renderInsightsSection(model)
    + renderYearJourneySection(model)
    + renderCompatibilityNotes(model)
    + '<p class="degree-disclaimer">Degree forecasts are planning aids only. Your university, faculty, or programme may use different rules, so always check your official academic regulations.</p>'
    + '</main>'
    + renderYearDetailsPanel(model)
    + renderPolicySetupOverlay(model);
}

function buildDashboardModel() {
  const years = store.state.years || {};
  const yearIds = getSortedYearIds(years);
  const policy = getDegreePolicy();
  const outputYear = getDegreeOutputYear();
  const outputSystem = getDegreeOutputSystem();
  const validation = validateDegreePolicy();
  const prediction = calculateDegreePrediction();
  const summaries = yearIds.map((yearId) => buildYearSummary(yearId, years[yearId], policy, outputSystem));
  const counted = summaries.filter((year) => year.counts);
  const blockers = validation.blockers || [];
  const warnings = validation.warnings || [];
  const missingCredits = prediction
    ? prediction.missingCredits
    : counted.reduce((sum, year) => sum + (year.aggregate?.missing || 0), 0);
  const gradedCredits = prediction
    ? prediction.actualCredits
    : counted.reduce((sum, year) => sum + (year.aggregate?.gradedCredits || 0), 0);
  const configured = isPolicyConfigured(policy, summaries, outputYear);

  return {
    years,
    yearIds,
    summaries,
    counted,
    policy,
    outputYear,
    outputSystem,
    validation,
    prediction,
    blockers,
    warnings,
    missingCredits,
    gradedCredits,
    configured,
  };
}

function buildYearSummary(yearId, year, policy, outputSystem) {
  const rule = getYearRule(yearId);
  const aggregate = computeYearAggregate(yearId);
  const nativeSystem = getGradingSystem(yearId);
  const degreeValue = getYearDegreeValue(yearId);
  const counts = rule.status !== 'excluded';
  const needsConversion = counts && nativeSystem !== outputSystem;
  const hasConversion = rule.status === 'manualConversion' && Number.isFinite(Number(rule.convertedValue));
  const blocked = needsConversion && !hasConversion;
  const incomplete = counts && !blocked && (aggregate.missing || 0) > 0;
  const excludedReason = EXCLUDED_REASONS.find((item) => item.value === rule.reason)?.label || rule.reason || 'Excluded';

  let status = 'compatible';
  if (!counts) status = 'excluded';
  else if (blocked) status = 'blocked';
  else if (hasConversion) status = 'converted';
  else if (incomplete) status = 'incomplete';

  return {
    id: yearId,
    year,
    rule,
    aggregate,
    nativeSystem,
    outputSystem,
    degreeValue,
    counts,
    needsConversion,
    hasConversion,
    blocked,
    incomplete,
    excludedReason,
    status,
  };
}

// Sections -----------------------------------------------------------------

function renderHeader(model = null) {
  // The degree title MUST come from the global profile — never from a year-specific
  // course override (which could be "Industrial Placement Year", etc.).
  const course = (store.state.profile?.course || '').trim() || 'My Degree';

  // University: global profile first; fall back through years if not set globally
  let university = (store.state.profile?.university || '').trim();
  if (!university) {
    const tryIds = [model?.outputYear?.id, ...(model?.yearIds || [])].filter(Boolean);
    for (const id of tryIds) {
      const u = getEffectiveUniversity(id);
      if (u) { university = u; break; }
    }
  }
  const yearCount = model?.summaries?.length || 0;
  const metaParts = [
    university,
    yearCount ? `${yearCount} academic year${yearCount !== 1 ? 's' : ''} tracked` : '',
  ].filter(Boolean);

  return '<header class="degree-page-header">'
    + '<button class="degree-back-btn" type="button" onclick="showTrackerView()">← Back to Tracker</button>'
    + '<div class="degree-header-titles">'
    + '<p class="degree-eyebrow">Degree Overview</p>'
    + `<h1 class="degree-page-title">${escapeHtml(course)}</h1>`
    + (metaParts.length ? `<p class="degree-page-meta">${escapeHtml(metaParts.join(' · '))}</p>` : '')
    + '</div>'
    + '</header>';
}

function renderForecastHero(model) {
  const outputLabel = getSystemLabel(model.outputSystem);

  if (model.prediction) {
    const grade = formatDegreeResult(model.prediction.value, model.outputSystem);
    const tag = getClassificationTag(model.prediction.value, model.outputSystem);
    const outputYearLabel = model.outputYear?.label || 'graduating year';

    const creditLabel = getCreditUnitLabel({ system: model.outputSystem }).toLowerCase();
    // Determine whether the forecast covers all counted years or only those with marks
    const skippedYears = model.warnings.filter((w) => w.includes('no grades yet'));
    const heroLabel = skippedYears.length > 0
      ? 'Projected degree result (based on years with marks)'
      : 'Projected degree result';
    return '<article class="degree-result-hero degree-surface">'
      + '<div class="degree-hero-bg" aria-hidden="true"></div>'
      + '<div class="degree-result-copy">'
      + `<p class="degree-hero-label">${escapeHtml(heroLabel)}</p>`
      + `<div class="degree-result-mark">${escapeHtml(grade)}</div>`
      + `<div class="degree-result-tag">${escapeHtml(tag)}</div>`
      + `<p class="degree-result-system">${escapeHtml(outputLabel)}</p>`
      + '</div>'
      + '<div class="degree-hero-context">'
      + `<span>Output: ${escapeHtml(outputYearLabel)}</span>`
      + `<span>${escapeHtml(String(model.gradedCredits))} ${escapeHtml(creditLabel)} graded</span>`
      + (model.missingCredits > 0 ? `<span class="degree-hero-context--warn">${escapeHtml(String(model.missingCredits))} missing</span>` : '')
      + '</div>'
      + '</article>';
  }

  const unavailable = getUnavailableState(model);
  return '<article class="degree-result-hero degree-result-hero--unavailable degree-surface">'
    + '<div class="degree-hero-bg" aria-hidden="true"></div>'
    + '<div class="degree-result-copy">'
    + '<p class="degree-hero-label">Degree Forecast unavailable</p>'
    + `<div class="degree-result-mark">${escapeHtml(unavailable.title)}</div>`
    + `<div class="degree-result-tag degree-result-tag--setup">${escapeHtml(unavailable.subtitle)}</div>`
    + `<p class="degree-result-system">${escapeHtml(unavailable.body)}</p>`
    + '</div>'
    + `<button class="${unavailable.actionClass}" type="button" onclick="openDegreePolicySetup()">${escapeHtml(unavailable.action)}</button>`
    + '</article>';
}

function renderPolicySummaryCard(model) {
  const preset = DEGREE_PRESETS.find((item) => item.id === model.policy.presetId);
  const policyLabel = preset?.label || 'Custom weights';
  const outputYearLabel = model.outputYear?.label || '—';
  const hasBlocker = model.blockers.length > 0;
  const actionLabel = hasBlocker ? 'Fix issue' : (model.configured ? 'Edit' : 'Set up');
  const actionClass = hasBlocker
    ? 'degree-policy-fix-btn'
    : 'degree-policy-edit-btn';

  return '<aside class="degree-policy-card" aria-label="Degree Policy">'
    + '<div class="degree-policy-card-head">'
    + '<p class="degree-policy-card-title">Degree Policy</p>'
    + `<button class="${actionClass}" type="button" onclick="openDegreePolicySetup()">${escapeHtml(actionLabel)}</button>`
    + '</div>'
    + '<dl class="degree-policy-list">'
    + `<div><dt>Template</dt><dd>${escapeHtml(policyLabel)}</dd></div>`
    + `<div><dt>Mode</dt><dd>${escapeHtml(DEGREE_MODES[model.policy.mode] || 'Year-weighted')}</dd></div>`
    + `<div><dt>Output year</dt><dd>${escapeHtml(outputYearLabel)}</dd></div>`
    + `<div><dt>System</dt><dd>${escapeHtml(getSystemLabel(model.outputSystem))}</dd></div>`
    + '</dl>'
    + renderCalculationSummary(model)
    + '</aside>';
}

function renderCalculationSummary(model) {
  if (!model.counted.length) {
    return '<p class="degree-policy-note">Choose which years count to unlock the degree-wide forecast.</p>';
  }

  const countedYears = model.counted.map((year) => year.year?.label || year.id).join(', ');
  const mode = model.policy.mode === 'creditWeightedAllIncluded'
    ? 'credit-weighted modules'
    : 'year weights';

  return '<details class="degree-calculation-details">'
    + '<summary>How this is calculated</summary>'
    + `<p>Using ${escapeHtml(mode)} across ${escapeHtml(countedYears)}. Excluded years stay visible in the journey but do not affect the degree result.</p>`
    + '</details>';
}

function renderStatusStrip(model) {
  const issueCount = model.blockers.length + model.warnings.length + (model.missingCredits > 0 ? 1 : 0);

  if (model.blockers.length) {
    const first = model.blockers[0];
    return '<div class="degree-attention-strip degree-attention-strip--blocker">'
      + '<strong>Degree-wide prediction unavailable</strong>'
      + `<span>${escapeHtml(first)}</span>`
      + `<button type="button" onclick="openDegreePolicySetup()">Fix policy issue</button>`
      + '</div>';
  }

  if (issueCount > 0) {
    return '<div class="degree-attention-strip degree-attention-strip--warning">'
      + `<strong>${escapeHtml(issueCount)} ${issueCount === 1 ? 'issue needs' : 'issues need'} attention</strong>`
      + `<span>${escapeHtml(getCompactIssueText(model))}</span>`
      + `<button type="button" onclick="toggleDegreeStatusDetails()">${statusDetailsOpen ? 'Hide details' : 'View details'}</button>`
      + (statusDetailsOpen ? renderStatusDetails(model) : '')
      + '</div>';
  }

  const excludedCount = model.summaries.filter((year) => !year.counts).length;
  const excludedText = excludedCount ? ` · ${excludedCount} year${excludedCount !== 1 ? 's' : ''} excluded` : '';
  return '<div class="degree-attention-strip degree-attention-strip--quiet">'
    + `<span>All counted years compatible${escapeHtml(excludedText)}</span>`
    + '</div>';
}

function renderStatusDetails(model) {
  const items = [
    ...model.warnings,
    ...(model.missingCredits > 0 ? [`${model.missingCredits} counted credits are still missing marks.`] : []),
  ];
  if (!items.length) return '';
  return '<ul class="degree-status-details">'
    + items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')
    + '</ul>';
}

function renderInsightsSection(model) {
  const insightCards = renderAdaptiveInsightCards(model);

  return '<section class="degree-panel degree-insights-section" aria-labelledby="degree-insights-title">'
    + '<div class="degree-section-heading">'
    + '<p class="degree-section-kicker">Degree Insights</p>'
    + '<h2 id="degree-insights-title">Breakdown of Your Degree Classification</h2>'
    + '</div>'
    + '<div class="degree-insights-grid">'
    + renderYearComparison(model)
    + (model.configured && model.counted.length ? renderContributionChart(model) : '')
    + insightCards
    + '</div>'
    + '</section>';
}

function renderYearComparison(model) {
  const rows = model.summaries.map((summary) => {
    const isExcluded = !summary.counts;
    const value = summary.degreeValue ?? summary.aggregate?.value;
    const hasValue = value !== null && value !== undefined && Number.isFinite(Number(value));
    const percentage = (hasValue && !isExcluded) ? getBarPercent(value, summary.nativeSystem) : 0;

    let resultText;
    if (isExcluded) resultText = summary.excludedReason || 'Excluded';
    else if (summary.blocked) resultText = 'Needs conversion';
    else if (!hasValue) resultText = 'No marks yet';
    else resultText = `${formatDegreeResult(value, summary.hasConversion ? model.outputSystem : summary.nativeSystem)} · ${getClassificationTag(value, summary.hasConversion ? model.outputSystem : summary.nativeSystem)}`;

    return `<div class="degree-bar-row${isExcluded ? ' degree-bar-row--excluded' : ''}">`
      + `<div><strong>${escapeHtml(summary.year?.label || summary.id)}</strong><span>${escapeHtml(resultText)}</span></div>`
      + '<div class="degree-bar-track" aria-hidden="true">'
      + (percentage > 0 ? `<i style="width:${escapeHtml(String(percentage))}%"></i>` : '')
      + '</div>'
      + '</div>';
  }).join('');

  return '<article class="degree-insight-card degree-insight-card--wide">'
    + '<h3>Year prediction comparison</h3>'
    + '<div class="degree-bar-list">'
    + rows
    + '</div>'
    + '</article>';
}

function renderContributionChart(model) {
  const rows = model.counted.map((summary) => {
    const contribution = getContributionShare(summary, model);
    return '<div class="degree-bar-row degree-bar-row--contribution">'
      + `<div><strong>${escapeHtml(summary.year?.label || summary.id)}</strong><span>${escapeHtml(contribution.label)}</span></div>`
      + '<div class="degree-bar-track" aria-hidden="true">'
      + `<i style="width:${escapeHtml(contribution.percent)}%"></i>`
      + '</div>'
      + '</div>';
  }).join('');

  return '<article class="degree-insight-card">'
    + '<h3>Degree contribution by year</h3>'
    + '<div class="degree-bar-list">'
    + rows
    + '</div>'
    + '</article>';
}

function renderAdaptiveInsightCards(model) {
  const cards = [];
  const valuedCountedYears = model.counted.filter((summary) => Number.isFinite(Number(summary.degreeValue)));

  if (valuedCountedYears.length >= 2) {
    const sorted = [...valuedCountedYears].sort((a, b) => compareDegreeValues(a.degreeValue, b.degreeValue, model.outputSystem));
    const strongest = sorted[0];
    const lowest = sorted[sorted.length - 1];
    cards.push(renderMiniInsight('Strongest year', strongest, model.outputSystem));
    cards.push(renderMiniInsight('Lowest year', lowest, model.outputSystem));
  }

  if (model.policy.mode === 'weightedYears' && model.counted.length) {
    // Prefer the current active year if it counts; otherwise use the highest-weight counted year
    const currentYearId = store.state.ui?.currentYearId;
    const currentSummary = model.counted.find((s) => s.id === currentYearId && Number(s.rule.weight || 0) > 0);
    const impactYear = currentSummary
      || [...model.counted].sort((a, b) => Number(b.rule.weight || 0) - Number(a.rule.weight || 0))[0];

    if (impactYear && Number(impactYear.rule.weight || 0) > 0) {
      const weight = Number(impactYear.rule.weight || 0);
      const totalWeight = model.counted.reduce((sum, s) => sum + Number(s.rule.weight || 0), 0);
      const effectiveShare = totalWeight > 0 ? weight / totalWeight : weight / 100;
      const per1 = effectiveShare.toFixed(2);
      const per5 = (effectiveShare * 5).toFixed(1);
      const isCurrentYear = impactYear.id === currentYearId;

      // Module-level suggestions — only if this is the active year and has modules with credits
      let modulesHtml = '';
      if (isCurrentYear) {
        const yearModules = Object.values(store.state.years?.[impactYear.id]?.store?.modules || {});
        const creditedModules = yearModules.filter((m) => Number(m.credits || 0) > 0);
        const yearTotalCredits = creditedModules.reduce((sum, m) => sum + Number(m.credits || 0), 0);
        if (creditedModules.length >= 2 && yearTotalCredits > 0) {
          const topModules = [...creditedModules]
            .sort((a, b) => Number(b.credits || 0) - Number(a.credits || 0))
            .slice(0, 3);
          const rows = topModules.map((m) => {
            const modShare = Number(m.credits || 0) / yearTotalCredits;
            const modPer1 = (modShare * effectiveShare).toFixed(2);
            return `<li><span class="degree-insight-module-name">${escapeHtml(m.name || m.code || 'Unnamed module')}</span>`
              + ` <span class="degree-insight-module-impact">+1 pt → +${escapeHtml(modPer1)}</span></li>`;
          }).join('');
          modulesHtml = `<ul class="degree-insight-modules">${rows}</ul>`;
        }
      }

      cards.push('<article class="degree-insight-card degree-insight-card--accent">'
        + '<p class="degree-insight-label">Where Improvement Matters Most</p>'
        + `<h3>${escapeHtml(impactYear.year?.label || impactYear.id)} carries ${escapeHtml(formatWeight(weight))}% of your degree result.</h3>`
        + `<p>Every +1 pt improvement${isCurrentYear ? ' this year' : ' here'} moves your projected result by +${escapeHtml(per1)}`
        + ` · a +5 pt gain adds about +${escapeHtml(per5)}.</p>`
        + modulesHtml
        + '</article>');
    }
  } else if (model.policy.mode === 'creditWeightedAllIncluded' && model.counted.length) {
    const currentYearId = store.state.ui?.currentYearId;
    const currentSummary = model.counted.find((s) => s.id === currentYearId);
    if (currentSummary) {
      const currentCredits = currentSummary.aggregate?.attempted || 0;
      const totalCredits = model.counted.reduce((sum, s) => sum + (s.aggregate?.attempted || 0), 0);
      if (totalCredits > 0 && currentCredits > 0) {
        const effectiveShare = currentCredits / totalCredits;
        const per1 = effectiveShare.toFixed(2);
        const per5 = (effectiveShare * 5).toFixed(1);
        const sharePct = (effectiveShare * 100).toFixed(0);
        cards.push('<article class="degree-insight-card degree-insight-card--accent">'
          + '<p class="degree-insight-label">Where Improvement Matters Most</p>'
          + `<h3>${escapeHtml(currentSummary.year?.label || currentYearId)} contributes ${escapeHtml(sharePct)}% of counted credits.</h3>`
          + `<p>Every +1 pt improvement this year moves your projected result by +${escapeHtml(per1)}`
          + ` · a +5 pt gain adds about +${escapeHtml(per5)}.</p>`
          + '</article>');
      }
    }
  }

  if (model.missingCredits > 0) {
    cards.push('<article class="degree-insight-card degree-insight-card--warning">'
      + '<p class="degree-insight-label">Missing data</p>'
      + `<h3>${escapeHtml(String(model.missingCredits))} counted credits still need marks.</h3>`
      + '<p>Those credits could shift the forecast once results are entered.</p>'
      + '</article>');
  }

  return cards.join('');
}

function renderMiniInsight(title, summary, outputSystem) {
  const value = summary.degreeValue;
  return '<article class="degree-insight-card">'
    + `<p class="degree-insight-label">${escapeHtml(title)}</p>`
    + `<h3>${escapeHtml(summary.year?.label || summary.id)}</h3>`
    + `<p>${escapeHtml(formatDegreeResult(value, outputSystem))} · ${escapeHtml(getClassificationTag(value, outputSystem))}</p>`
    + '</article>';
}

function renderYearJourneySection(model) {
  const cards = model.summaries.map((summary, index) => renderYearJourneyCard(summary, model, index)).join('');
  return '<section class="degree-panel degree-journey-section" aria-labelledby="degree-journey-title">'
    + '<div class="degree-journey-bg" aria-hidden="true"></div>'
    + '<div class="degree-section-heading">'
    + '<p class="degree-section-kicker">Year Journey</p>'
    + '<h2 id="degree-journey-title">Your degree progression</h2>'
    + '</div>'
    + '<div class="degree-year-timeline">'
    + cards
    + '</div>'
    + '</section>';
}

function renderYearJourneyCard(summary, model, index) {
  const value = summary.degreeValue ?? summary.aggregate?.value;
  const displaySystem = summary.hasConversion ? model.outputSystem : summary.nativeSystem;
  const connector = index === 0 ? '' : '<span class="degree-timeline-connector" aria-hidden="true"></span>';

  // Result line — only show for counted, non-blocked years with data
  let resultLine = '';
  if (!summary.counts) {
    // excluded — no result line
  } else if (summary.blocked) {
    resultLine = 'Needs conversion';
  } else if (value === null || value === undefined) {
    resultLine = 'No marks yet';
  } else if (summary.hasConversion) {
    resultLine = `${formatDegreeResult(summary.aggregate.value, summary.nativeSystem)} → ${formatDegreeResult(summary.rule.convertedValue, model.outputSystem)}`;
  } else {
    resultLine = `${formatDegreeResult(value, displaySystem)} · ${getClassificationTag(value, displaySystem)}`;
  }

  // State tag (single, non-redundant)
  let tagClass = 'degree-year-node-tag';
  let tagText = '';
  if (!summary.counts) {
    tagClass += ' degree-year-node-tag--excluded';
    tagText = summary.excludedReason || 'Excluded';
  } else if (summary.blocked) {
    tagClass += ' degree-year-node-tag--issue';
    tagText = 'Issue';
  } else if (summary.hasConversion) {
    tagClass += ' degree-year-node-tag--converted';
    tagText = 'Converted';
  } else if (summary.incomplete) {
    tagClass += ' degree-year-node-tag--incomplete';
    tagText = 'Incomplete';
  } else {
    tagClass += ' degree-year-node-tag--counted';
    tagText = 'Counted';
  }

  const weightLine = summary.counts
    ? `${formatWeight(summary.rule.weight)}% weight`
    : '0% weight';

  return connector + `<button class="degree-year-node degree-year-node--${escapeHtml(summary.status)}" type="button" onclick="openDegreeYearDetails('${escapeHtml(summary.id)}')" aria-label="Open details for ${escapeHtml(summary.year?.label || summary.id)}">`
    + '<span class="degree-year-node-dot" aria-hidden="true"></span>'
    + `<strong class="degree-year-node-label">${escapeHtml(summary.year?.label || summary.id)}</strong>`
    + (resultLine ? `<span class="degree-year-result">${escapeHtml(resultLine)}</span>` : '')
    + '<div class="degree-year-node-footer">'
    + `<em class="${escapeHtml(tagClass)}">${escapeHtml(tagText)}</em>`
    + `<span class="degree-year-node-weight">${escapeHtml(weightLine)}</span>`
    + '</div>'
    + '</button>';
}

function renderCompatibilityNotes(model) {
  const excluded = model.summaries.filter((summary) => !summary.counts);
  const converted = model.summaries.filter((summary) => summary.hasConversion);
  const hasIssues = model.blockers.length > 0 || model.warnings.length > 0;

  // If nothing noteworthy, omit the section entirely
  if (!hasIssues && !excluded.length && !converted.length) return '';

  const notes = [];
  if (!hasIssues) notes.push('All counted years compatible.');
  if (excluded.length) {
    notes.push(`${excluded.map((s) => s.year?.label || s.id).join(', ')} excluded.`);
  }
  if (converted.length) {
    notes.push(`${converted.map((s) => s.year?.label || s.id).join(', ')} uses manual conversion.`);
  }
  if (model.blockers.length) notes.push(...model.blockers);
  if (model.warnings.length) notes.push(...model.warnings);

  return '<section class="degree-compatibility-section" aria-label="Compatibility Notes">'
    + '<p class="degree-compatibility-heading">Compatibility Notes</p>'
    + '<div class="degree-compatibility-note">'
    + notes.map((note) => `<span>${escapeHtml(note)}</span>`).join('')
    + '</div>'
    + '</section>';
}

// Year details -------------------------------------------------------------

function renderYearDetailsPanel(model) {
  if (!activeYearDetailsId) return '';

  const summary = model.summaries.find((item) => item.id === activeYearDetailsId);
  if (!summary) return '';

  const value = summary.degreeValue ?? summary.aggregate?.value;
  const displaySystem = summary.hasConversion ? model.outputSystem : summary.nativeSystem;
  const identityDetails = [
    ['Institution', getEffectiveUniversity(summary.id)],
    ['Course / programme', getEffectiveCourse(summary.id)],
    ['Academic year', getEffectiveAcademicYearLabel(summary.id)],
    ['Grading system', getSystemLabel(summary.nativeSystem)],
  ].filter(([, val]) => val);
  const degreeDetails = [
    ['Degree status', getYearStatusText(summary)],
    ['Degree weight', summary.counts ? `${formatWeight(summary.rule.weight)}%` : '0%'],
    ['Compatibility', summary.blocked ? 'Needs manual conversion' : 'Compatible'],
  ];
  const academicDetails = [
    ['Year prediction', value === null || value === undefined ? 'Not enough marks' : formatDegreeResult(value, displaySystem)],
    ['Classification / tag', value === null || value === undefined ? 'Pending' : getClassificationTag(value, displaySystem)],
    ['Credits graded', `${summary.aggregate.gradedCredits || 0}`],
    ['Missing credits', `${summary.aggregate.missing || 0}`],
    ['Modules graded', `${summary.aggregate.gradedCount || 0} of ${summary.aggregate.moduleCount || 0}`],
  ];

  if (summary.hasConversion || summary.needsConversion) {
    degreeDetails.push(['Original result', summary.aggregate.value === null || summary.aggregate.value === undefined ? 'Not enough marks' : formatDegreeResult(summary.aggregate.value, summary.nativeSystem)]);
    degreeDetails.push(['Converted value used', Number.isFinite(Number(summary.rule.convertedValue)) ? formatDegreeResult(Number(summary.rule.convertedValue), model.outputSystem) : 'Not set']);
    degreeDetails.push(['Conversion note', summary.rule.conversionNote || 'No conversion note yet']);
  }

  if (!summary.counts) {
    degreeDetails.push(['Reason for exclusion', summary.excludedReason]);
  }

  return '<div class="degree-modal-backdrop" role="presentation" onclick="closeDegreeYearDetails()">'
    + '<section class="degree-year-panel" role="dialog" aria-modal="true" aria-labelledby="degree-year-panel-title" onclick="event.stopPropagation()">'
    + '<div class="degree-panel-topline">'
    + `<p>${escapeHtml(getYearStatusText(summary))}</p>`
    + '<button type="button" class="degree-icon-btn" onclick="closeDegreeYearDetails()" aria-label="Close year details">&times;</button>'
    + '</div>'
    + '<div class="degree-year-panel-hero">'
    + '<div>'
    + `<h2 id="degree-year-panel-title">${escapeHtml(summary.year?.label || summary.id)}</h2>`
    + `<p>${escapeHtml(getEffectiveCourse(summary.id) || 'Course')} · ${escapeHtml(getEffectiveUniversity(summary.id) || 'Institution')}</p>`
    + '</div>'
    + '<div class="degree-year-panel-result">'
    + `<strong>${escapeHtml(value === null || value === undefined ? 'Pending' : formatDegreeResult(value, displaySystem))}</strong>`
    + `<span>${escapeHtml(value === null || value === undefined ? getYearStatusText(summary) : getClassificationTag(value, displaySystem))}</span>`
    + '</div>'
    + '</div>'
    + '<div class="degree-detail-groups">'
    + renderDetailGroup('Year identity', identityDetails)
    + renderDetailGroup('Degree calculation', degreeDetails)
    + renderDetailGroup('Academic result', academicDetails)
    + '</div>'
    + '<div class="degree-panel-actions">'
    + `<button class="degree-primary-btn" type="button" onclick="openDegreeYearInTracker('${escapeHtml(summary.id)}')">Open in Tracker</button>`
    + '<button class="degree-quiet-btn" type="button" onclick="closeDegreeYearDetails()">Close</button>'
    + '</div>'
    + '</section>'
    + '</div>';
}

function renderDetailGroup(title, items) {
  return '<article class="degree-detail-group">'
    + `<h3>${escapeHtml(title)}</h3>`
    + '<dl class="degree-details-list">'
    + items.map(([label, valueText]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(valueText || 'Not set')}</dd></div>`).join('')
    + '</dl>'
    + '</article>';
}

export function openDegreeYearDetails(yearId) {
  activeYearDetailsId = yearId;
  renderDegreeDashboard();
}

export function closeDegreeYearDetails() {
  activeYearDetailsId = null;
  renderDegreeDashboard();
}

export function openDegreeYearInTracker(yearId) {
  if (store.state.years?.[yearId]) {
    store.state.ui.currentYearId = yearId;
    store.state.ui.currentTermFilter = 'all';
    save();
    refreshActiveYear();
    window.renderYearSelector?.();
    window.buildModules?.();
    window.updateGlobal?.();
  }
  activeYearDetailsId = null;
  showTrackerView();
}

// Policy setup overlay -----------------------------------------------------

function renderPolicySetupOverlay(model) {
  if (!policyDraft) return '';

  const yearRows = model.yearIds.map((yearId) => renderPolicyYearSetupRow(yearId)).join('');
  const countedRows = model.yearIds
    .filter((yearId) => (policyDraft.yearRules?.[yearId]?.status || 'included') !== 'excluded')
    .map((yearId) => renderWeightSetupRow(yearId))
    .join('');
  const conversionRows = model.yearIds
    .map((yearId) => renderConversionSetupRow(yearId, model))
    .filter(Boolean)
    .join('');
  const presetOptions = DEGREE_PRESETS.map((preset) => (
    `<option value="${escapeHtml(preset.id)}"${preset.id === policyDraft.presetId ? ' selected' : ''}>${escapeHtml(preset.group)} - ${escapeHtml(preset.label)}</option>`
  )).join('');
  const autoOutputSelected = !policyDraft.outputYearId ? ' selected' : '';
  const outputYearOptions = `<option value=""${autoOutputSelected}>Auto (most recent year)</option>`
    + model.yearIds.map((yearId) => (
      `<option value="${escapeHtml(yearId)}"${yearId === policyDraft.outputYearId ? ' selected' : ''}>${escapeHtml(model.years[yearId]?.label || yearId)}</option>`
    )).join('');
  const totalWeight = getDraftTotalWeight();

  return '<div class="degree-policy-overlay" role="dialog" aria-modal="true" aria-labelledby="degree-policy-setup-title">'
    + '<div class="degree-policy-setup">'
    + '<button class="degree-back-link" type="button" onclick="closeDegreePolicySetup()"><span aria-hidden="true">&larr;</span> Back to Degree Overview</button>'
    + '<div class="degree-policy-setup-head">'
    + '<p class="degree-eyebrow">Degree Policy Setup</p>'
    + '<h2 id="degree-policy-setup-title">Tell UniTrack how your degree result should be calculated.</h2>'
    + '</div>'
    + '<div class="degree-setup-grid">'
    + '<section class="degree-setup-step">'
    + '<span>Step 1</span>'
    + '<h3>Choose a common template</h3>'
    + `<select id="degree-policy-preset" onchange="applyDegreePolicyTemplate(this.value)">${presetOptions}</select>`
    + '</section>'
    + '<section class="degree-setup-step">'
    + '<span>Step 2</span>'
    + '<h3>Result grading system</h3>'
    + '<p class="degree-setup-step-hint">Sets which grading format the projected result uses. You don\'t need to have created your final year yet — Auto works fine.</p>'
    + `<select id="degree-policy-output-year" onchange="refreshDegreePolicyDraft()">${outputYearOptions}</select>`
    + '</section>'
    + '<section class="degree-setup-step degree-setup-step--wide">'
    + '<span>Step 3</span>'
    + '<h3>Choose which years count</h3>'
    + '<div class="degree-setup-year-list">'
    + yearRows
    + '</div>'
    + '</section>'
    + '<section class="degree-setup-step degree-setup-step--wide">'
    + '<span>Step 4</span>'
    + '<h3>Set weights</h3>'
    + '<div class="degree-weight-list">'
    + countedRows
    + `<div class="degree-weight-total"><strong>Total</strong><strong>${escapeHtml(formatWeight(totalWeight))}%</strong></div>`
    + '</div>'
    + '</section>'
    + (conversionRows ? '<section class="degree-setup-step degree-setup-step--wide degree-setup-step--conversion">'
      + '<span>Step 5</span>'
      + '<h3>Manual conversions if needed</h3>'
      + '<div class="degree-conversion-list">'
      + conversionRows
      + '</div>'
      + '</section>' : '')
    + '</div>'
    + '<div class="degree-policy-setup-actions">'
    + '<button class="degree-quiet-btn" type="button" onclick="closeDegreePolicySetup()">Cancel</button>'
    + '<button class="degree-primary-btn" type="button" onclick="saveDegreePolicySetup()">Save policy</button>'
    + '</div>'
    + '</div>'
    + '</div>';
}

function renderPolicyYearSetupRow(yearId) {
  const years = store.state.years || {};
  const year = years[yearId] || {};
  const rule = getDraftRule(yearId);
  const reasonOptions = EXCLUDED_REASONS.map((reason) => (
    `<option value="${escapeHtml(reason.value)}"${reason.value === rule.reason ? ' selected' : ''}>${escapeHtml(reason.label)}</option>`
  )).join('');

  return '<article class="degree-setup-year">'
    + `<div><strong>${escapeHtml(year.label || yearId)}</strong><span>${escapeHtml(getSystemLabel(getGradingSystem(yearId)))}</span></div>`
    + `<select id="degree-policy-status-${escapeHtml(yearId)}" onchange="refreshDegreePolicyDraft()">`
    + `<option value="included"${rule.status === 'included' ? ' selected' : ''}>Counts toward degree</option>`
    + `<option value="excluded"${rule.status === 'excluded' ? ' selected' : ''}>Does not count</option>`
    + `<option value="manualConversion"${rule.status === 'manualConversion' ? ' selected' : ''}>Converted manually</option>`
    + '</select>'
    + `<select id="degree-policy-reason-${escapeHtml(yearId)}" onchange="refreshDegreePolicyDraft()">${reasonOptions}</select>`
    + '</article>';
}

function renderWeightSetupRow(yearId) {
  const years = store.state.years || {};
  const rule = getDraftRule(yearId);
  return '<label class="degree-weight-row">'
    + `<span>${escapeHtml(years[yearId]?.label || yearId)}</span>`
    + `<input id="degree-policy-weight-${escapeHtml(yearId)}" type="number" min="0" max="100" step="0.1" value="${escapeHtml(String(Number(rule.weight) || 0))}" oninput="refreshDegreePolicyDraft()" onchange="refreshDegreePolicyDraft()">`
    + '</label>';
}

function renderConversionSetupRow(yearId, model) {
  const years = store.state.years || {};
  const year = years[yearId] || {};
  const rule = getDraftRule(yearId);
  const counts = rule.status !== 'excluded';
  const yearSystem = getGradingSystem(yearId);
  const needsConversion = counts && yearSystem !== model.outputSystem;
  if (!needsConversion && rule.status !== 'manualConversion') return '';
  const aggregate = computeYearAggregate(yearId);

  return '<article class="degree-conversion-card">'
    + `<h4>${escapeHtml(year.label || yearId)} uses ${escapeHtml(getSystemLabel(yearSystem))}.</h4>`
    + `<p>Original result: ${escapeHtml(aggregate.value === null || aggregate.value === undefined ? 'Not enough marks' : formatDegreeResult(aggregate.value, yearSystem))}</p>`
    + '<label>Converted value'
    + `<input id="degree-policy-converted-${escapeHtml(yearId)}" type="number" step="0.1" value="${escapeHtml(rule.convertedValue ?? '')}" onchange="refreshDegreePolicyDraft()" placeholder="e.g. 68">`
    + '</label>'
    + '<label>Note'
    + `<textarea id="degree-policy-note-${escapeHtml(yearId)}" onchange="refreshDegreePolicyDraft()" placeholder="Converted using receiving university guidance">${escapeHtml(rule.conversionNote || '')}</textarea>`
    + '</label>'
    + '</article>';
}

export function openDegreePolicySetup() {
  policyDraft = clonePolicy(getDegreePolicy());
  ensureDraftRules();
  renderDegreeDashboard();
}

export function closeDegreePolicySetup() {
  policyDraft = null;
  renderDegreeDashboard();
}

export function refreshDegreePolicyDraft() {
  if (!policyDraft) return;
  syncPolicyDraftFromDom();
  renderDegreeDashboard();
}

export function applyDegreePolicyTemplate(presetId) {
  if (!policyDraft) return;
  syncPolicyDraftFromDom();
  applyPresetToDraft(presetId);
  renderDegreeDashboard();
}

export function saveDegreePolicySetup() {
  if (!policyDraft) return;
  syncPolicyDraftFromDom();
  store.state.degreePolicy = clonePolicy(policyDraft);
  save();
  policyDraft = null;
  renderDegreeDashboard();
}

function syncPolicyDraftFromDom() {
  const preset = document.getElementById('degree-policy-preset');
  const outputYear = document.getElementById('degree-policy-output-year');
  if (preset) policyDraft.presetId = preset.value;
  if (outputYear) policyDraft.outputYearId = outputYear.value;

  const presetMeta = DEGREE_PRESETS.find((item) => item.id === policyDraft.presetId);
  if (presetMeta) policyDraft.mode = presetMeta.mode;

  ensureDraftRules();
  Object.keys(store.state.years || {}).forEach((yearId) => {
    const status = document.getElementById(`degree-policy-status-${yearId}`);
    const reason = document.getElementById(`degree-policy-reason-${yearId}`);
    const weight = document.getElementById(`degree-policy-weight-${yearId}`);
    const converted = document.getElementById(`degree-policy-converted-${yearId}`);
    const note = document.getElementById(`degree-policy-note-${yearId}`);
    const rule = getDraftRule(yearId);

    if (status) rule.status = status.value;
    if (reason) rule.reason = reason.value;
    if (weight) rule.weight = clampNumber(parseFloat(weight.value) || 0, 0, 100);
    if (converted) rule.convertedValue = converted.value === '' ? null : Number(converted.value);
    if (note) rule.conversionNote = note.value;
  });
}

function applyPresetToDraft(presetId) {
  const years = store.state.years || {};
  const yearIds = getSortedYearIds(years);
  const preset = DEGREE_PRESETS.find((item) => item.id === presetId) || DEGREE_PRESETS[0];
  policyDraft.presetId = preset.id;
  policyDraft.mode = preset.mode;
  policyDraft.yearRules = {};

  yearIds.forEach((yearId, index) => {
    policyDraft.yearRules[yearId] = getDefaultYearRule();
    const rule = policyDraft.yearRules[yearId];
    if (preset.id === 'foundation_excluded' && index === 0) {
      rule.status = 'excluded';
      rule.reason = 'foundation';
    } else if (preset.id === 'placement_excluded' && /placement|abroad|exchange/i.test(years[yearId]?.label || '')) {
      rule.status = 'excluded';
      rule.reason = 'placement';
    }
  });

  const included = yearIds.filter((yearId) => policyDraft.yearRules[yearId]?.status !== 'excluded');
  if (preset.mode === 'creditWeightedAllIncluded') {
    included.forEach((yearId) => { policyDraft.yearRules[yearId].weight = 0; });
    return;
  }

  if (preset.id === 'uk_0_40_60' && included.length >= 3) {
    included.forEach((yearId, index) => { policyDraft.yearRules[yearId].weight = index === included.length - 2 ? 40 : (index === included.length - 1 ? 60 : 0); });
    return;
  }
  if (preset.id === 'uk_0_33_67' && included.length >= 3) {
    included.forEach((yearId, index) => { policyDraft.yearRules[yearId].weight = index === included.length - 2 ? 33.3 : (index === included.length - 1 ? 66.7 : 0); });
    return;
  }
  if (preset.id === 'uk_honours_only' && included.length >= 2) {
    included.forEach((yearId, index) => { policyDraft.yearRules[yearId].weight = index >= included.length - 2 ? 50 : 0; });
    return;
  }

  const equalWeight = included.length ? 100 / included.length : 0;
  included.forEach((yearId) => { policyDraft.yearRules[yearId].weight = Number(equalWeight.toFixed(1)); });
}

// Existing setters kept for compatibility with older inline handlers --------

export function toggleDegreePolicy() {
  const policy = getDegreePolicy();
  saveDegreePolicy({ enabled: !policy.enabled });
  renderDegreeDashboard();
}

export function toggleDegreePolicyEditor() {
  openDegreePolicySetup();
}

export function setDegreePolicyPreset(presetId) {
  applyPreset(presetId);
  renderDegreeDashboard();
}

export function setDegreeOutputYear(yearId) {
  saveDegreePolicy({ outputYearId: yearId });
  renderDegreeDashboard();
}

export function setYearRuleStatus(yearId, status) {
  getYearRule(yearId).status = status;
  save();
  renderDegreeDashboard();
}

export function setYearRuleWeight(yearId, value) {
  getYearRule(yearId).weight = clampNumber(value, 0, 100);
  save();
  renderDegreeDashboard();
}

export function setYearRuleReason(yearId, value) {
  getYearRule(yearId).reason = value;
  save();
  renderDegreeDashboard();
}

export function setYearConvertedValue(yearId, value) {
  getYearRule(yearId).convertedValue = value === '' ? null : Number(value);
  save();
  renderDegreeDashboard();
}

export function setYearConversionNote(yearId, value) {
  getYearRule(yearId).conversionNote = value;
  save();
  renderDegreeDashboard();
}

export function toggleYearCard(yearId) {
  openDegreeYearDetails(yearId);
}

export function toggleDegreeStatusDetails() {
  statusDetailsOpen = !statusDetailsOpen;
  renderDegreeDashboard();
}

// Helpers ------------------------------------------------------------------

function getSortedYearIds(years) {
  return Object.keys(years).sort((a, b) => {
    const aLabel = years[a]?.label || a;
    const bLabel = years[b]?.label || b;
    const aNum = Number((aLabel.match(/\d+/) || [])[0]);
    const bNum = Number((bLabel.match(/\d+/) || [])[0]);
    if (Number.isFinite(aNum) && Number.isFinite(bNum) && aNum !== bNum) return aNum - bNum;
    return aLabel.localeCompare(bLabel);
  });
}

function isPolicyConfigured(policy, summaries, outputYear) {
  if (!outputYear) return false;
  const counted = summaries.filter((summary) => summary.counts);
  if (!counted.length) return false;
  if (policy.mode === 'creditWeightedAllIncluded') return true;
  return counted.some((summary) => Number(summary.rule.weight || 0) > 0);
}

function getUnavailableState(model) {
  if (!model.configured) {
    return {
      title: 'Policy setup needed',
      subtitle: 'Choose which years count and how they are weighted.',
      body: 'Your per-year overview is still available below.',
      action: 'Set up degree policy',
      actionClass: 'degree-primary-btn',
    };
  }

  if (model.blockers.length) {
    return {
      title: 'Policy issue',
      subtitle: model.blockers[0],
      body: 'Fix the policy issue to calculate a degree-wide forecast.',
      action: 'Fix policy issue',
      actionClass: 'degree-primary-btn',
    };
  }

  return {
    title: 'More marks needed',
    subtitle: 'Not enough counted data yet.',
    body: 'Add module marks in counted years to unlock the forecast.',
    action: 'Review policy',
    actionClass: 'degree-subtle-pill',
  };
}

function getCompactIssueText(model) {
  if (model.warnings.length) return model.warnings[0];
  if (model.missingCredits > 0) return `${model.missingCredits} counted credits are missing marks.`;
  return 'Review the degree policy details.';
}

function getSystemLabel(system) {
  return GRADING_SYSTEM_LABELS[system] || system || 'Selected grading system';
}

function formatDegreeResult(value, system) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'Pending';
  const n = Number(value);
  if (system === 'au7') return `${n.toFixed(1)} / 7.0 GPA`;
  if (system === 'au4') return `${n.toFixed(2)} / 4.0 GPA`;
  if (system === 'us4' || system === 'my4') return `${n.toFixed(2)} / 4.0 GPA`;
  if (system === 'us43') return `${n.toFixed(2)} / 4.3 GPA`;
  if (system === 'nz9') return `${n.toFixed(1)} / 9.0 GPA`;
  if (system === 'de5') return `${n.toFixed(1)} grade`;
  if (system === 'cn4') return `${n.toFixed(1)}%`;
  if (system === 'custom') return `${n.toFixed(2)}`;
  return `${n.toFixed(1)}%`;
}

function getClassificationTag(value, system) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'Pending';
  const result = classify(Number(value), system);
  if (system === 'uk' && result.badge && result.label && result.badge !== result.label) {
    return `${result.badge} / ${result.label}`;
  }
  if ((system === 'us4' || system === 'us43') && result.badge === 'A') return 'A range';
  return result.badge || result.label || 'Classified';
}

function getYearCardResult(summary, value, displaySystem, outputSystem) {
  if (!summary.counts) return 'Does not count';
  if (summary.blocked) return 'Needs conversion';
  if (value === null || value === undefined) return 'Not enough marks';
  if (summary.hasConversion) {
    return `${formatDegreeResult(summary.aggregate.value, summary.nativeSystem)} -> used as ${formatDegreeResult(summary.rule.convertedValue, outputSystem)}`;
  }
  return `${formatDegreeResult(value, displaySystem)} / ${getClassificationTag(value, displaySystem)}`;
}

function getYearStatusText(summary) {
  if (!summary.counts) return 'Excluded';
  if (summary.blocked) return 'Attention needed';
  if (summary.hasConversion) return 'Converted';
  if (summary.incomplete) return 'Compatible with missing data';
  return 'Compatible';
}

function getBarPercent(value, system) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 0;
  const n = Number(value);
  if (system === 'au7') return Math.max(0, Math.min(100, (n / 7) * 100));
  if (system === 'au4' || system === 'us4' || system === 'us43' || system === 'my4') return Math.max(0, Math.min(100, (n / 4) * 100));
  if (system === 'nz9') return Math.max(0, Math.min(100, (n / 9) * 100));
  if (system === 'de5') return Math.max(0, Math.min(100, ((5 - n) / 4) * 100));
  return Math.max(0, Math.min(100, n));
}

function getContributionShare(summary, model) {
  if (model.policy.mode === 'creditWeightedAllIncluded') {
    const total = model.counted.reduce((sum, year) => sum + (year.aggregate?.attempted || 0), 0);
    const credits = summary.aggregate?.attempted || 0;
    const percent = total ? (credits / total) * 100 : 0;
    return { percent: percent.toFixed(1), label: `${credits} credits · ${percent.toFixed(1)}%` };
  }
  return { percent: String(Math.min(100, Number(summary.rule.weight || 0))), label: `${formatWeight(summary.rule.weight)}% weight` };
}

function compareDegreeValues(a, b, system) {
  if (system === 'de5') return Number(a) - Number(b);
  return Number(b) - Number(a);
}

function getDraftRule(yearId) {
  ensureDraftRules();
  if (!policyDraft.yearRules[yearId]) policyDraft.yearRules[yearId] = getDefaultYearRule();
  return policyDraft.yearRules[yearId];
}

function ensureDraftRules() {
  if (!policyDraft) return;
  if (!policyDraft.yearRules) policyDraft.yearRules = {};
  Object.keys(store.state.years || {}).forEach((yearId) => {
    if (!policyDraft.yearRules[yearId]) policyDraft.yearRules[yearId] = getDefaultYearRule();
  });
}

function getDraftTotalWeight() {
  if (!policyDraft) return 0;
  return Object.keys(store.state.years || {}).reduce((sum, yearId) => {
    const rule = getDraftRule(yearId);
    return rule.status === 'excluded' ? sum : sum + Number(rule.weight || 0);
  }, 0);
}

function clonePolicy(policy) {
  return JSON.parse(JSON.stringify(policy));
}

function clampNumber(value, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, parsed));
}

function formatWeight(value) {
  const n = Number(value || 0);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
