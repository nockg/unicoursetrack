/**
 * Degree Overview page — rendering and view-switching.
 *
 * Owns the #degree-view DOM section. degree-policy.js owns all calculation.
 */
import { store } from './store.js';
import { escapeHtml } from './utils.js';
import { getGradingSystem, classify, formatSelectedGrade, getCreditUnitLabel } from './grading.js';
import { save, getEffectiveUniversity, getEffectiveCourse, getEffectiveAcademicYearLabel } from './state.js';
import {
  getDegreePolicy, saveDegreePolicy, getYearRule, applyPreset,
  getDegreeOutputYear, getDegreeOutputSystem,
  computeYearAggregate, getYearDegreeValue,
  validateDegreePolicy, calculateDegreePrediction,
  GRADING_SYSTEM_LABELS, DEGREE_MODES, EXCLUDED_REASONS,
  CONFIDENCE_LABELS, CONFIDENCE_DETAILS,
  DEGREE_PRESETS, getDefaultYearRule,
} from './degree-policy.js';

// ── View switching ─────────────────────────────────────────────────────────

export function showDegreeView() {
  const isAlreadyActive = !document.getElementById('degree-view').classList.contains('hidden');
  if (isAlreadyActive) { showTrackerView(); return; }
  document.getElementById('app-main').classList.add('hidden');
  document.getElementById('degree-view').classList.remove('hidden');
  document.querySelector('.nav-btn.degree-overview-btn')?.classList.add('active');
  renderDegreeDashboard();
}

export function showTrackerView() {
  document.getElementById('degree-view').classList.add('hidden');
  document.getElementById('app-main').classList.remove('hidden');
  document.querySelector('.nav-btn.degree-overview-btn')?.classList.remove('active');
}

// ── Main render ────────────────────────────────────────────────────────────

export function renderDegreeDashboard() {
  const root = document.getElementById('degree-dashboard-root');
  if (!root) return;

  const policy       = getDegreePolicy();
  const years        = store.state.years || {};
  const yearIds      = Object.keys(years);
  const outputSystem = getDegreeOutputSystem();
  const validation   = validateDegreePolicy();
  const prediction   = calculateDegreePrediction();

  let html;

  if (!yearIds.length) {
    html = renderHeader()
      + '<div class="degree-onboarding">'
      + '<div class="degree-onboarding-icon">📚</div>'
      + '<div class="degree-onboarding-title">No academic years yet</div>'
      + '<p class="degree-onboarding-body">Add years and modules in the tracker, then come back here to set up your degree prediction.</p>'
      + '</div>';
  } else {
    const attentionItems = collectAttentionItems(years, yearIds, validation, outputSystem);
    const mainHtml = renderHeroSection(prediction, validation, outputSystem, years, yearIds, policy)
      + renderChartSection(years, yearIds, outputSystem)
      + renderYearCardsSection(years, yearIds, policy, outputSystem);
    const sidebarHtml = (attentionItems.length ? renderNeedsAttentionCard(attentionItems) : '')
      + renderPolicySidebarCard(policy, outputSystem);

    html = renderHeader()
      + renderSectionTabs()
      + '<div class="degree-body"><div class="degree-main">'
      + mainHtml
      + '</div><aside class="degree-sidebar">'
      + sidebarHtml
      + '</aside></div>'
      + renderPolicyEditor(years, yearIds, policy, outputSystem)
      + '<p class="degree-disclaimer">Degree calculation presets are starting points only. Your university, faculty, or programme may use different rules. Always check your official academic regulations.</p>';
  }

  root.innerHTML = html;

  if (yearIds.length) {
    renderYearPredictionChart(years, yearIds, outputSystem);
    renderCreditCompletionChart(years, yearIds);
  }
}

// ── Header ─────────────────────────────────────────────────────────────────

function renderHeader() {
  const profile   = store.state.profile || {};
  const uni       = profile.university  || '';
  const course    = profile.course      || '';
  const yearCount = Object.keys(store.state.years || {}).length;
  return '<div class="degree-page-header">'
    + '<button class="degree-back-btn" onclick="showTrackerView()" type="button">← Back to Tracker</button>'
    + '<div class="degree-page-eyebrow">Degree Overview</div>'
    + '<h1 class="degree-page-title">' + escapeHtml(course || 'My Degree') + '</h1>'
    + (uni ? '<div class="degree-page-sub">' + escapeHtml(uni) + '</div>' : '')
    + '<div class="degree-page-meta">' + yearCount + ' academic year' + (yearCount !== 1 ? 's' : '') + ' tracked</div>'
    + '</div>';
}

// ── Section tabs ───────────────────────────────────────────────────────────

function renderSectionTabs() {
  return '<nav class="degree-tabs" aria-label="Degree sections">'
    + '<a href="#section-overview" class="degree-tab">Overview</a>'
    + '<a href="#section-charts"   class="degree-tab">Charts</a>'
    + '<a href="#section-years"    class="degree-tab">Years</a>'
    + '<a href="#section-policy"   class="degree-tab" onclick="toggleDegreePolicyEditor(true)">Policy</a>'
    + '</nav>';
}

// ── Hero section ───────────────────────────────────────────────────────────

function renderHeroSection(prediction, validation, outputSystem, years, yearIds, policy) {
  let heroCard;
  if (prediction) {
    const grade = formatSelectedGrade(prediction.value, { courseDisplay: true }, outputSystem);
    const cls   = classify(prediction.value, outputSystem);
    const clsCss = cls.cls ? ' degree-hero-cls-' + cls.cls : '';
    heroCard = '<div class="degree-hero-card">'
      + '<div class="degree-hero-eyebrow">Projected Degree Result</div>'
      + '<div class="degree-hero-result' + clsCss + '">' + escapeHtml(grade.main) + '</div>'
      + (grade.label ? '<div class="degree-hero-label">' + escapeHtml(grade.label) + '</div>' : '')
      + '<div class="degree-hero-meta">'
      + '<span class="degree-hero-system">' + escapeHtml(GRADING_SYSTEM_LABELS[outputSystem] || outputSystem) + '</span>'
      + '<span class="degree-hero-sep">·</span>'
      + '<span class="degree-hero-confidence">' + escapeHtml(CONFIDENCE_LABELS[prediction.confidence] || '') + '</span>'
      + '</div>'
      + '<div class="degree-hero-explanation">' + escapeHtml(buildCalculationExplanation(policy, years, yearIds)) + '</div>'
      + '</div>';
  } else {
    const blockerText = validation.blockers.length ? validation.blockers[0] : 'Prediction unavailable';
    const extraCount  = validation.blockers.length - 1;
    heroCard = '<div class="degree-hero-card degree-hero-unavailable">'
      + '<div class="degree-hero-eyebrow">Projected Degree Result</div>'
      + '<div class="degree-hero-result">—</div>'
      + '<div class="degree-hero-reason">' + escapeHtml(blockerText) + '</div>'
      + (extraCount > 0
          ? '<div class="degree-hero-extra-blockers">+' + extraCount + ' more issue' + (extraCount > 1 ? 's' : '') + ' — see sidebar</div>'
          : '')
      + '<button class="degree-setup-policy-btn" onclick="toggleDegreePolicyEditor(true)" type="button">Set up degree policy</button>'
      + '</div>';
  }

  const metaRow = buildCompactMetaRow(years, yearIds);

  return '<div id="section-overview" class="degree-section">'
    + heroCard
    + metaRow
    + '</div>';
}

function buildCalculationExplanation(policy, years, yearIds) {
  if (policy.mode === 'creditWeightedAllIncluded') {
    return 'Credit-weighted average across all graded modules in included years.';
  }
  const parts = yearIds.map((id) => {
    const year = years[id];
    const rule = getYearRule(id);
    if (rule.status === 'excluded') return year.label + ' excluded';
    const w = Number(rule.weight) || 0;
    return year.label + ' × ' + w + '%';
  });
  return 'Based on: ' + parts.join(', ') + '.';
}

function buildCompactMetaRow(years, yearIds) {
  const unitLabel = getCreditUnitLabel();
  let totalCounted = 0, totalMissing = 0, totalModules = 0, totalGraded = 0;
  yearIds.forEach((id) => {
    const rule = getYearRule(id);
    if (rule.status === 'excluded') return;
    const agg = computeYearAggregate(id);
    if (!agg) return;
    totalCounted += agg.gradedCredits;
    totalMissing += agg.missing;
    totalModules += agg.moduleCount;
    totalGraded  += agg.gradedCount;
  });

  let html = '<div class="degree-meta-row">'
    + '<span class="degree-meta-item">' + totalGraded + ' / ' + totalModules + ' modules graded</span>'
    + '<span class="degree-meta-sep">·</span>'
    + '<span class="degree-meta-item">' + totalCounted + ' ' + escapeHtml(unitLabel) + ' counted</span>';
  if (totalMissing > 0) {
    html += '<span class="degree-meta-sep">·</span>'
      + '<span class="degree-meta-item degree-meta-warn">' + totalMissing + ' ' + escapeHtml(unitLabel) + ' missing marks</span>';
  }
  html += '</div>';
  return html;
}

// ── Needs Attention (sidebar card) ─────────────────────────────────────────

function collectAttentionItems(years, yearIds, validation, outputSystem) {
  const items = [];
  validation.blockers.forEach((b) => items.push({ tone: 'error',   text: b }));
  validation.warnings.forEach((w) => items.push({ tone: 'warning', text: w }));

  yearIds.forEach((id) => {
    const year = years[id];
    const rule = getYearRule(id);
    const agg  = computeYearAggregate(id);
    if (!agg) return;

    if (rule.status !== 'excluded' && agg.missing > 0) {
      const unitLabel = getCreditUnitLabel();
      const m = agg.moduleCount - agg.gradedCount;
      items.push({ tone: 'info', text: year.label + ' has ' + agg.missing + ' ' + unitLabel + ' without marks (' + m + ' module' + (m !== 1 ? 's' : '') + ').' });
    }
    if (rule.status === 'included') {
      const yearSystem = getGradingSystem(id);
      if (yearSystem !== outputSystem) {
        items.push({ tone: 'error', text: year.label + ' uses ' + (GRADING_SYSTEM_LABELS[yearSystem] || yearSystem) + ' — needs manual conversion.' });
      }
    }
    if (rule.status !== 'excluded' && agg.value !== null) {
      const yearSystem = getGradingSystem(id);
      const grade = formatSelectedGrade(agg.value, { courseDisplay: true }, yearSystem);
      const cls   = classify(agg.value, yearSystem);
      if (cls.cls === 'third' || cls.cls === 'fail') {
        items.push({ tone: 'warning', text: year.label + ' prediction is ' + grade.main + (grade.label ? ' (' + grade.label + ')' : '') + ' — may need attention.' });
      }
    }
  });
  return items;
}

function renderNeedsAttentionCard(items) {
  const listHtml = '<div class="degree-attention-list">'
    + items.map((it) => '<div class="degree-attention-item degree-attention-' + escapeHtml(it.tone) + '">'
      + '<span class="degree-attention-dot"></span>'
      + '<span>' + escapeHtml(it.text) + '</span>'
      + '</div>').join('')
    + '</div>';
  return '<div class="degree-sidebar-card degree-attention-card">'
    + '<div class="degree-sidebar-card-title">Needs Attention</div>'
    + listHtml
    + '</div>';
}

// ── Policy sidebar card ────────────────────────────────────────────────────

function renderPolicySidebarCard(policy, outputSystem) {
  const preset    = DEGREE_PRESETS.find((p) => p.id === policy.presetId);
  const outYear   = getDegreeOutputYear();
  const modeLabel = DEGREE_MODES[policy.mode] || policy.mode;

  const hasWeights     = Object.values(policy.yearRules || {}).some((r) => r.weight > 0);
  const isCreditMode   = policy.mode === 'creditWeightedAllIncluded';
  const isConfigured   = outYear && (isCreditMode || hasWeights);
  const btnLabel       = isConfigured ? 'Edit degree policy' : 'Set up degree policy';

  return '<div class="degree-sidebar-card degree-policy-summary-card">'
    + '<div class="degree-sidebar-card-title">Degree Policy</div>'
    + '<div class="degree-policy-summary-rows">'
    + '<div class="degree-policy-summary-row"><span class="degree-policy-summary-key">Template</span><span class="degree-policy-summary-val">' + escapeHtml(preset ? preset.label : 'Manual') + '</span></div>'
    + '<div class="degree-policy-summary-row"><span class="degree-policy-summary-key">Mode</span><span class="degree-policy-summary-val">' + escapeHtml(modeLabel) + '</span></div>'
    + '<div class="degree-policy-summary-row"><span class="degree-policy-summary-key">Output system</span><span class="degree-policy-summary-val">' + escapeHtml(GRADING_SYSTEM_LABELS[outputSystem] || outputSystem) + '</span></div>'
    + (outYear ? '<div class="degree-policy-summary-row"><span class="degree-policy-summary-key">Graduating year</span><span class="degree-policy-summary-val">' + escapeHtml(outYear.label) + '</span></div>' : '')
    + '</div>'
    + '<button class="degree-edit-policy-btn" onclick="toggleDegreePolicyEditor(true)" type="button">' + escapeHtml(btnLabel) + '</button>'
    + '</div>';
}

// ── Charts ─────────────────────────────────────────────────────────────────

function renderChartSection(years, yearIds, outputSystem) {
  if (!yearIds.length) return '';
  return '<div id="section-charts" class="degree-section">'
    + '<div class="degree-section-title">Overview Charts</div>'
    + '<div class="degree-charts-grid">'
    + '<div class="degree-chart-card"><div class="degree-chart-label">Year Prediction Comparison</div><canvas id="degree-chart-prediction" class="degree-canvas"></canvas></div>'
    + '<div class="degree-chart-card"><div class="degree-chart-label">Credit Completion by Year</div><canvas id="degree-chart-credits" class="degree-canvas"></canvas></div>'
    + '</div>'
    + renderCompatibilityRow(years, yearIds, outputSystem)
    + '</div>';
}

function renderCompatibilityRow(years, yearIds, outputSystem) {
  const pills = yearIds.map((id) => {
    const year   = years[id];
    const rule   = getYearRule(id);
    const system = getGradingSystem(id);
    let   tone, hint;

    if (rule.status === 'excluded') {
      tone = 'grey';  hint = 'Excluded from degree';
    } else if (rule.status === 'manualConversion') {
      const v = rule.convertedValue;
      tone = (v !== null && v !== undefined && v !== '') ? 'amber' : 'red';
      hint = tone === 'red' ? 'Converted value missing' : 'Using manual conversion';
    } else if (system !== outputSystem) {
      tone = 'red';   hint = 'System mismatch — needs conversion';
    } else {
      tone = 'green'; hint = 'Compatible';
    }

    return '<div class="degree-compat-pill degree-compat-' + escapeHtml(tone) + '" title="' + escapeHtml(hint) + '">'
      + '<span class="degree-compat-dot"></span>'
      + '<span class="degree-compat-name">' + escapeHtml(year.label) + '</span>'
      + '<span class="degree-compat-hint">' + escapeHtml(hint) + '</span>'
      + '</div>';
  }).join('');

  return '<div class="degree-compat-row">'
    + '<div class="degree-chart-label">Compatibility Status</div>'
    + '<div class="degree-compat-pills">' + pills + '</div>'
    + '</div>';
}

function renderYearPredictionChart(years, yearIds, outputSystem) {
  const canvas = document.getElementById('degree-chart-prediction');
  if (!canvas) return;
  const ctx    = canvas.getContext('2d');
  const dark   = document.body.classList.contains('theme-dark');
  const dpr    = window.devicePixelRatio || 1;
  const w      = canvas.parentElement.clientWidth - 2;
  const h      = Math.max(80 + yearIds.length * 44, 280);
  canvas.width  = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width  = w + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const ink        = dark ? '#ececec' : '#1a1a1a';
  const muted      = dark ? '#a3a3a3' : '#888888';
  const barBg      = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
  const barFill    = dark ? '#d4a017' : '#b8860b';
  const manualFill = dark ? '#4d93cf' : '#2980b9';
  const padL = 100, padR = 48, padT = 12, barH = 24, rowH = 44;

  yearIds.forEach((id, i) => {
    const year     = years[id];
    const rule     = getYearRule(id);
    const agg      = computeYearAggregate(id);
    const system   = getGradingSystem(id);
    const isManual = rule.status === 'manualConversion';
    const val      = isManual ? (rule.convertedValue !== null ? Number(rule.convertedValue) : null) : agg?.value ?? null;

    const y = padT + i * rowH + (rowH - barH) / 2;

    const scales   = { us4: 4, us43: 4.3, au7: 7, au4: 4, my4: 4, cn4: 100, nz9: 9, de5: 5, uk: 100 };
    const maxVal   = scales[system] || 100;
    const inverted = system === 'de5';
    const chartW   = w - padL - padR;

    ctx.font         = '12px system-ui, sans-serif';
    ctx.fillStyle    = ink;
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(year.label, padL - 8, y + barH / 2);

    ctx.fillStyle = barBg;
    ctx.beginPath();
    ctx.roundRect(padL, y, chartW, barH, 4);
    ctx.fill();

    if (rule.status === 'excluded') {
      ctx.font      = '11px system-ui, sans-serif';
      ctx.fillStyle = muted;
      ctx.textAlign = 'left';
      ctx.fillText('Excluded', padL + 8, y + barH / 2);
    } else if (val !== null) {
      const ratio = inverted ? 1 - (val - 1) / (maxVal - 1) : val / maxVal;
      const fillW = Math.max(0, Math.min(chartW, chartW * ratio));
      ctx.fillStyle = isManual ? manualFill : barFill;
      ctx.beginPath();
      ctx.roundRect(padL, y, fillW, barH, 4);
      ctx.fill();

      const grade = formatSelectedGrade(val, {}, system);
      ctx.font      = '11px system-ui, sans-serif';
      ctx.fillStyle = fillW > 40 ? '#fff' : ink;
      ctx.textAlign = fillW > 40 ? 'right' : 'left';
      ctx.fillText(grade.main, fillW > 40 ? padL + fillW - 6 : padL + fillW + 6, y + barH / 2);
    } else {
      ctx.font      = '11px system-ui, sans-serif';
      ctx.fillStyle = muted;
      ctx.textAlign = 'left';
      ctx.fillText('No marks yet', padL + 8, y + barH / 2);
    }
  });
}

function renderCreditCompletionChart(years, yearIds) {
  const canvas = document.getElementById('degree-chart-credits');
  if (!canvas) return;
  const ctx    = canvas.getContext('2d');
  const dark   = document.body.classList.contains('theme-dark');
  const dpr    = window.devicePixelRatio || 1;
  const w      = canvas.parentElement.clientWidth - 2;
  const h      = Math.max(80 + yearIds.length * 44, 280);
  canvas.width  = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width  = w + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const ink      = dark ? '#ececec' : '#1a1a1a';
  const muted    = dark ? '#a3a3a3' : '#888888';
  const fillOk   = dark ? '#4a8c42' : '#2d5a27';
  const fillMiss = '#c0392b';
  const fillBg   = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
  const padL = 100, padR = 48, padT = 12, barH = 24, rowH = 44;

  const maxCredits = Math.max(...yearIds.map((id) => computeYearAggregate(id)?.attempted || 0), 1);

  yearIds.forEach((id, i) => {
    const year   = years[id];
    const agg    = computeYearAggregate(id);
    const y      = padT + i * rowH + (rowH - barH) / 2;
    const chartW = w - padL - padR;

    ctx.font         = '12px system-ui, sans-serif';
    ctx.fillStyle    = ink;
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(year.label, padL - 8, y + barH / 2);

    ctx.fillStyle = fillBg;
    ctx.beginPath();
    ctx.roundRect(padL, y, chartW, barH, 4);
    ctx.fill();

    if (!agg || agg.attempted === 0) {
      ctx.font      = '11px system-ui, sans-serif';
      ctx.fillStyle = muted;
      ctx.textAlign = 'left';
      ctx.fillText('No modules', padL + 8, y + barH / 2);
      return;
    }

    const total    = agg.attempted;
    const graded   = agg.gradedCredits;
    const missing  = agg.missing;
    const scaleW   = chartW * (total / maxCredits);
    const gradedW  = scaleW * (graded / total);
    const missingW = scaleW * (missing / total);

    if (gradedW > 0) {
      ctx.fillStyle = fillOk;
      ctx.beginPath();
      ctx.roundRect(padL, y, gradedW, barH, 4);
      ctx.fill();
    }
    if (missingW > 0) {
      ctx.fillStyle = fillMiss;
      ctx.beginPath();
      ctx.roundRect(padL + gradedW, y, missingW, barH, [0, 4, 4, 0]);
      ctx.fill();
    }

    const unitLabel = getCreditUnitLabel();
    const label     = missing > 0
      ? graded + ' graded · ' + missing + ' missing'
      : graded + ' ' + unitLabel + ' graded';
    ctx.font      = '11px system-ui, sans-serif';
    ctx.fillStyle = gradedW > 60 ? '#fff' : ink;
    ctx.textAlign = gradedW > 60 ? 'right' : 'left';
    ctx.fillText(label, gradedW > 60 ? padL + gradedW - 6 : padL + gradedW + 6, y + barH / 2);
  });
}

// ── Per-year cards (collapsible) ───────────────────────────────────────────

function renderYearCardsSection(years, yearIds, policy, outputSystem) {
  if (!yearIds.length) return '';
  return '<div id="section-years" class="degree-section">'
    + '<div class="degree-section-title">Year Breakdown</div>'
    + '<div class="degree-year-cards">'
    + yearIds.map((id) => renderYearCard(id, years[id], policy, outputSystem)).join('')
    + '</div>'
    + '</div>';
}

function renderYearCard(yearId, year, policy, outputSystem) {
  const rule       = getYearRule(yearId);
  const agg        = computeYearAggregate(yearId);
  const yearSystem = getGradingSystem(yearId);
  const uni        = getEffectiveUniversity(yearId);
  const course     = getEffectiveCourse(yearId);
  const acLabel    = getEffectiveAcademicYearLabel(yearId);
  const unitLabel  = getCreditUnitLabel();

  const statusLabel = {
    included:         'Counts toward degree',
    excluded:         'Does not count',
    manualConversion: 'Counts (converted)',
  }[rule.status] || rule.status;

  const statusTone = {
    included:         'green',
    excluded:         'grey',
    manualConversion: 'amber',
  }[rule.status] || 'grey';

  // Score for collapsed summary
  let scoreHtml = '';
  if (rule.status === 'manualConversion') {
    const convVal = (rule.convertedValue !== null && rule.convertedValue !== '')
      ? Number(rule.convertedValue) : null;
    if (convVal !== null) {
      const convGrade = formatSelectedGrade(convVal, { courseDisplay: true }, outputSystem);
      scoreHtml = '<span class="degree-year-card-score degree-year-card-score-converted">' + escapeHtml(convGrade.main) + '</span>';
    } else {
      scoreHtml = '<span class="degree-year-card-score degree-year-card-score-missing">—</span>';
    }
  } else if (agg && agg.value !== null) {
    const grade = formatSelectedGrade(agg.value, { courseDisplay: true }, yearSystem);
    const cls   = classify(agg.value, yearSystem);
    const scoreCls = cls.cls ? ' degree-year-card-score-' + cls.cls : '';
    scoreHtml = '<span class="degree-year-card-score' + scoreCls + '">' + escapeHtml(grade.main) + '</span>';
  } else {
    scoreHtml = '<span class="degree-year-card-score degree-year-card-score-missing">No marks</span>';
  }

  // Collapsed summary row
  const summaryHtml = '<div class="degree-year-card-summary" onclick="toggleYearCard(\'' + escapeHtml(yearId) + '\')">'
    + '<div class="degree-year-card-summary-left">'
    + '<span class="degree-year-card-name">' + escapeHtml(year.label) + '</span>'
    + '<span class="degree-year-status degree-year-status-' + escapeHtml(statusTone) + '">' + escapeHtml(statusLabel) + '</span>'
    + '</div>'
    + '<div class="degree-year-card-summary-right">'
    + scoreHtml
    + '<svg class="degree-year-chevron" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 6 8 10 12 6"/></svg>'
    + '</div>'
    + '</div>';

  // Expanded details
  let predictionBlock = '';
  if (rule.status === 'manualConversion') {
    const origAgg = (agg?.value !== null && agg?.value !== undefined)
      ? formatSelectedGrade(agg.value, {}, yearSystem)
      : null;
    const convVal = (rule.convertedValue !== null && rule.convertedValue !== '')
      ? Number(rule.convertedValue) : null;
    predictionBlock = '<div class="degree-year-pred">'
      + (origAgg
          ? '<div class="degree-year-pred-row"><span class="degree-year-pred-label">Original result</span><span class="degree-year-pred-value">'
            + escapeHtml(origAgg.main)
            + (origAgg.label ? ' <span class="degree-year-pred-cls">(' + escapeHtml(origAgg.label) + ')</span>' : '')
            + '</span></div>'
          : '')
      + (convVal !== null
          ? '<div class="degree-year-pred-row"><span class="degree-year-pred-label">Used as</span><span class="degree-year-pred-value">'
            + escapeHtml(formatSelectedGrade(convVal, { courseDisplay: true }, outputSystem).main)
            + ' ' + escapeHtml(GRADING_SYSTEM_LABELS[outputSystem] || outputSystem)
            + '</span></div>'
          : '<div class="degree-year-pred-row degree-year-pred-missing"><span class="degree-year-pred-label">Converted value</span><span class="degree-year-pred-value">Not entered</span></div>')
      + (rule.conversionNote ? '<div class="degree-year-pred-note">' + escapeHtml(rule.conversionNote) + '</div>' : '')
      + '</div>';
  } else if (agg && agg.value !== null) {
    const grade = formatSelectedGrade(agg.value, {}, yearSystem);
    predictionBlock = '<div class="degree-year-pred">'
      + '<div class="degree-year-pred-row"><span class="degree-year-pred-label">Prediction</span><span class="degree-year-pred-value">'
      + escapeHtml(grade.main)
      + (grade.label ? ' <span class="degree-year-pred-cls">' + escapeHtml(grade.label) + '</span>' : '')
      + '</span></div>'
      + '</div>';
  } else if (agg && agg.moduleCount > 0) {
    predictionBlock = '<div class="degree-year-pred degree-year-pred-none">No marks entered yet</div>';
  } else {
    predictionBlock = '<div class="degree-year-pred degree-year-pred-none">No modules added</div>';
  }

  const compat = rule.status === 'excluded'
    ? ''
    : rule.status === 'manualConversion'
      ? '<span class="degree-year-compat degree-year-compat-amber">Converted value</span>'
      : yearSystem === outputSystem
        ? '<span class="degree-year-compat degree-year-compat-green">Compatible</span>'
        : '<span class="degree-year-compat degree-year-compat-red">System mismatch</span>';

  const detailsHtml = '<div class="degree-year-card-details">'
    + '<div class="degree-year-card-meta">'
    + (uni    ? '<div>' + escapeHtml(uni)    + '</div>' : '')
    + (course ? '<div>' + escapeHtml(course) + '</div>' : '')
    + (acLabel ? '<div class="degree-year-card-academic">' + escapeHtml(acLabel) + '</div>' : '')
    + '<div class="degree-year-card-system">' + escapeHtml(GRADING_SYSTEM_LABELS[yearSystem] || yearSystem) + '</div>'
    + '</div>'
    + predictionBlock
    + (agg
        ? '<div class="degree-year-card-credits"><span>' + agg.gradedCredits + ' / ' + agg.attempted + ' ' + escapeHtml(unitLabel) + '</span><span>' + agg.gradedCount + ' / ' + agg.moduleCount + ' modules graded</span></div>'
        : '')
    + '<div class="degree-year-card-foot">'
    + '<span class="degree-year-weight">'
    + (rule.status !== 'excluded' ? 'Degree weight: ' + (Number(rule.weight) || 0) + '%' : 'Weight: 0% (excluded)')
    + '</span>'
    + compat
    + '</div>'
    + '</div>';

  return '<div class="degree-year-card" data-year-id="' + escapeHtml(yearId) + '">'
    + summaryHtml
    + detailsHtml
    + '</div>';
}

export function toggleYearCard(yearId) {
  const card = document.querySelector('.degree-year-card[data-year-id="' + yearId + '"]');
  if (card) card.classList.toggle('is-expanded');
}

// ── Policy editor (collapsible, full-width below two-col body) ─────────────

function renderPolicyEditor(years, yearIds, policy, outputSystem) {
  const groups = [...new Set(DEGREE_PRESETS.map((p) => p.group))];

  const presetOptions = groups.map((g) => {
    return '<optgroup label="' + escapeHtml(g) + '">'
      + DEGREE_PRESETS.filter((p) => p.group === g)
          .map((p) => '<option value="' + escapeHtml(p.id) + '"' + (policy.presetId === p.id ? ' selected' : '') + '>'
            + escapeHtml(p.label) + '</option>').join('')
      + '</optgroup>';
  }).join('');

  const yearOptions = yearIds.map((id) => {
    const year = years[id];
    const sel  = (policy.outputYearId === id) || (!policy.outputYearId && id === yearIds[yearIds.length - 1]);
    return '<option value="' + escapeHtml(id) + '"' + (sel ? ' selected' : '') + '>' + escapeHtml(year.label) + '</option>';
  }).join('');

  const outYear   = getDegreeOutputYear();
  const outSystem = outYear ? getGradingSystem(outYear.id) : null;

  const yearRulesHtml = yearIds.map((id) => renderYearRuleRow(id, years[id], policy, outputSystem)).join('');

  return '<div id="section-policy" class="degree-section degree-policy-editor" style="display:none">'
    + '<div class="degree-section-title degree-policy-editor-title">'
    + 'Degree Policy'
    + '<button class="degree-policy-close-btn" onclick="toggleDegreePolicyEditor(false)" type="button">Close ✕</button>'
    + '</div>'
    + '<p class="degree-policy-notice">These are starting points — always verify against your official programme regulations.</p>'
    + '<div class="degree-policy-grid">'
    + '<div class="degree-policy-field"><label class="degree-policy-label">Common template</label>'
    + '<select class="degree-policy-select" onchange="setDegreePolicyPreset(this.value)">' + presetOptions + '</select></div>'
    + '<div class="degree-policy-field"><label class="degree-policy-label">Graduating / output year</label>'
    + '<select class="degree-policy-select" onchange="setDegreeOutputYear(this.value)">' + yearOptions + '</select>'
    + (outSystem ? '<div class="degree-policy-hint">Output system: ' + escapeHtml(GRADING_SYSTEM_LABELS[outSystem] || outSystem) + '</div>' : '')
    + '</div>'
    + '</div>'
    + '<div class="degree-year-rules">'
    + '<div class="degree-year-rules-title">Year rules and weights</div>'
    + '<div class="degree-year-rules-grid">'
    + '<div class="degree-year-rules-header">'
    + '<span>Year</span><span>Status</span><span>Weight %</span><span>Notes / Conversion</span>'
    + '</div>'
    + yearRulesHtml
    + '</div>'
    + '</div>'
    + '</div>';
}

// ── Year rule row (compact grid) ───────────────────────────────────────────

function renderYearRuleRow(yearId, year, policy, outputSystem) {
  const rule       = getYearRule(yearId);
  const yearSystem = getGradingSystem(yearId);
  const compatible = yearSystem === outputSystem;

  const statusSelect = '<select class="degree-rule-select" onchange="setYearRuleStatus(\'' + escapeHtml(yearId) + '\', this.value)">'
    + '<option value="included"'         + (rule.status === 'included'         ? ' selected' : '') + '>Counts</option>'
    + '<option value="excluded"'         + (rule.status === 'excluded'         ? ' selected' : '') + '>Excluded</option>'
    + '<option value="manualConversion"' + (rule.status === 'manualConversion' ? ' selected' : '') + '>Converted</option>'
    + '</select>';

  const weightCell = rule.status !== 'excluded'
    ? '<input type="number" class="degree-rule-weight-input" min="0" max="100" step="0.1"'
      + ' value="' + (Number(rule.weight) || 0) + '"'
      + ' oninput="setYearRuleWeight(\'' + escapeHtml(yearId) + '\', this.value)">'
    : '<span class="degree-rule-excluded-w">—</span>';

  let notesCell;
  if (rule.status === 'excluded') {
    notesCell = '<select class="degree-rule-select" onchange="setYearRuleReason(\'' + escapeHtml(yearId) + '\', this.value)">'
      + EXCLUDED_REASONS.map((r) => '<option value="' + escapeHtml(r.value) + '"' + (rule.reason === r.value ? ' selected' : '') + '>' + escapeHtml(r.label) + '</option>').join('')
      + '</select>';
  } else if (rule.status === 'manualConversion') {
    notesCell = '<div class="degree-rule-conv-inline">'
      + '<input type="number" class="degree-rule-input" step="0.01" placeholder="Converted value (e.g. 68)"'
      + ' value="' + (rule.convertedValue !== null && rule.convertedValue !== '' ? escapeHtml(String(rule.convertedValue)) : '') + '"'
      + ' oninput="setYearConvertedValue(\'' + escapeHtml(yearId) + '\', this.value)">'
      + '<input type="text" class="degree-rule-input" maxlength="200" placeholder="Conversion note"'
      + ' value="' + escapeHtml(rule.conversionNote || '') + '"'
      + ' oninput="setYearConversionNote(\'' + escapeHtml(yearId) + '\', this.value)">'
      + '</div>';
  } else if (!compatible) {
    notesCell = '<span class="degree-rule-warn-inline">System mismatch — set to "Converted"</span>';
  } else {
    notesCell = '<span class="degree-rule-ok-inline">Compatible</span>';
  }

  return '<div class="degree-year-rule-row">'
    + '<span class="degree-rule-year-name">' + escapeHtml(year.label)
    + '<br><span class="degree-rule-year-sys">' + escapeHtml(GRADING_SYSTEM_LABELS[yearSystem] || yearSystem) + '</span></span>'
    + '<span>' + statusSelect + '</span>'
    + '<span class="degree-rule-weight-cell">' + weightCell + '</span>'
    + '<span class="degree-rule-notes-cell">' + notesCell + '</span>'
    + '</div>';
}

// ── Public handlers (exposed via window.*) ─────────────────────────────────

export function toggleDegreePolicy(enabled) {
  saveDegreePolicy({ enabled });
  renderDegreeDashboard();
}

export function toggleDegreePolicyEditor(open) {
  const el = document.getElementById('section-policy');
  if (!el) return;
  el.style.display = open ? '' : 'none';
  if (open) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  const rule  = getYearRule(yearId);
  rule.status = status;
  save();
  renderDegreeDashboard();
}

export function setYearRuleWeight(yearId, value) {
  const rule  = getYearRule(yearId);
  rule.weight = value === '' ? 0 : parseFloat(value) || 0;
  save();
}

export function setYearRuleReason(yearId, reason) {
  const rule  = getYearRule(yearId);
  rule.reason = reason;
  save();
}

export function setYearConvertedValue(yearId, value) {
  const rule          = getYearRule(yearId);
  rule.convertedValue = value === '' ? null : value;
  save();
}

export function setYearConversionNote(yearId, value) {
  const rule          = getYearRule(yearId);
  rule.conversionNote = value;
  save();
}
