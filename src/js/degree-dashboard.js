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
  GRADING_SYSTEM_LABELS, EXCLUDED_REASONS, CONFIDENCE_LABELS, CONFIDENCE_DETAILS,
  DEGREE_PRESETS, getDefaultYearRule,
} from './degree-policy.js';

// ── View switching ─────────────────────────────────────────────────────────

export function showDegreeView() {
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

  const bodyHtml = policy.enabled
    ? [
        renderTopCards(prediction, validation, outputSystem),
        renderNeedsAttention(years, yearIds, validation, outputSystem),
        renderChartSection(years, yearIds, outputSystem),
        renderYearCardsSection(years, yearIds, policy, outputSystem),
        renderPolicySection(years, yearIds, policy, outputSystem),
      ].join('')
    : '<div class="degree-disabled-notice"><p>Enable degree policy above to start tracking your degree-wide prediction.</p>'
      + '<p class="degree-disabled-sub">UniTrack will not calculate a degree result until you have configured which years count and how they are weighted.</p></div>';

  const html = renderHeader(years)
    + renderEnableToggle(policy)
    + bodyHtml
    + '<p class="degree-disclaimer">Degree calculation presets are starting points only. Your university, faculty, or programme may use different rules. Always check your official academic regulations.</p>';
  root.innerHTML = html;

  if (policy.enabled) {
    renderYearPredictionChart(years, yearIds, outputSystem);
    renderCreditCompletionChart(years, yearIds);
  }
}

// ── Header ─────────────────────────────────────────────────────────────────

function renderHeader(years) {
  const profile  = store.state.profile || {};
  const uni      = profile.university  || '';
  const course   = profile.course      || '';
  const yearCount = Object.keys(years).length;
  return `
    <div class="degree-page-header">
      <div class="degree-page-eyebrow">Degree Overview</div>
      <h1 class="degree-page-title">${escapeHtml(course || 'My Degree')}</h1>
      ${uni ? `<div class="degree-page-sub">${escapeHtml(uni)}</div>` : ''}
      <div class="degree-page-meta">${yearCount} academic year${yearCount !== 1 ? 's' : ''} tracked</div>
    </div>
  `;
}

// ── Enable / disable toggle ────────────────────────────────────────────────

function renderEnableToggle(policy) {
  return `
    <div class="degree-section degree-enable-section">
      <label class="degree-enable-row">
        <input type="checkbox" class="degree-enable-check" ${policy.enabled ? 'checked' : ''}
          onchange="toggleDegreePolicy(this.checked)">
        <span class="degree-enable-label">Enable degree prediction</span>
        <span class="degree-enable-hint">Activates degree-wide calculation and per-year breakdown</span>
      </label>
    </div>
  `;
}

// ── Top summary cards ──────────────────────────────────────────────────────

function renderTopCards(prediction, validation, outputSystem) {
  const unitLabel = getCreditUnitLabel();
  const years     = store.state.years || {};

  let totalActual = 0, totalMissing = 0, totalModules = 0, totalGraded = 0;
  Object.keys(years).forEach((id) => {
    const rule = getYearRule(id);
    if (rule.status === 'excluded') return;
    const agg = computeYearAggregate(id);
    if (!agg) return;
    totalActual   += agg.gradedCredits;
    totalMissing  += agg.missing;
    totalModules  += agg.moduleCount;
    totalGraded   += agg.gradedCount;
  });

  const predictedCard = prediction
    ? (() => {
        const grade = formatSelectedGrade(prediction.value, { courseDisplay: true });
        const cls   = classify(prediction.value, outputSystem);
        return `
          <div class="degree-top-card degree-result-card">
            <div class="degree-card-label">Projected Degree Result</div>
            <div class="degree-card-value degree-result-value">${escapeHtml(grade.main)}</div>
            ${grade.label ? `<div class="degree-card-cls">${escapeHtml(grade.label)}</div>` : ''}
            <div class="degree-card-meta">${escapeHtml(CONFIDENCE_LABELS[prediction.confidence] || '')}
              — ${escapeHtml(CONFIDENCE_DETAILS[prediction.confidence] || '')}</div>
            <div class="degree-card-system">${escapeHtml(GRADING_SYSTEM_LABELS[outputSystem] || outputSystem)}</div>
          </div>`;
      })()
    : `
      <div class="degree-top-card degree-result-card degree-result-unavailable">
        <div class="degree-card-label">Projected Degree Result</div>
        <div class="degree-card-value">—</div>
        <div class="degree-unavailable-reason">${validation.blockers.length
          ? escapeHtml(validation.blockers[0])
          : 'Prediction unavailable'}</div>
        ${validation.blockers.length > 1 ? `<div class="degree-card-meta">+${validation.blockers.length - 1} more issue${validation.blockers.length > 2 ? 's' : ''} — see below</div>` : ''}
      </div>`;

  return `
    <div class="degree-top-cards">
      ${predictedCard}
      <div class="degree-top-card">
        <div class="degree-card-label">Credits Counted</div>
        <div class="degree-card-value">${totalActual.toFixed(0)}</div>
        <div class="degree-card-meta">${unitLabel} with actual marks</div>
      </div>
      <div class="degree-top-card">
        <div class="degree-card-label">Missing Marks</div>
        <div class="degree-card-value ${totalMissing > 0 ? 'degree-card-warn' : ''}">${totalMissing.toFixed(0)}</div>
        <div class="degree-card-meta">${unitLabel} without marks yet</div>
      </div>
      <div class="degree-top-card">
        <div class="degree-card-label">Modules</div>
        <div class="degree-card-value">${totalGraded} / ${totalModules}</div>
        <div class="degree-card-meta">with grades entered</div>
      </div>
    </div>
  `;
}

// ── Needs Attention ────────────────────────────────────────────────────────

function renderNeedsAttention(years, yearIds, validation, outputSystem) {
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
      items.push({ tone: 'info', text: `${year.label} has ${agg.missing} ${unitLabel} without marks yet (${agg.moduleCount - agg.gradedCount} module${agg.moduleCount - agg.gradedCount !== 1 ? 's' : ''}).` });
    }

    if (rule.status === 'included') {
      const yearSystem = getGradingSystem(id);
      if (yearSystem !== outputSystem) {
        items.push({ tone: 'error', text: `${year.label} uses ${GRADING_SYSTEM_LABELS[yearSystem] || yearSystem} — needs manual conversion to count toward degree prediction.` });
      }
    }

    if (rule.status !== 'excluded' && agg.value !== null) {
      const grade = formatSelectedGrade(agg.value, { courseDisplay: true });
      const cls   = classify(agg.value, getGradingSystem(id));
      if (cls.cls === 'third' || cls.cls === 'fail') {
        items.push({ tone: 'warning', text: `${year.label} prediction is ${grade.main}${grade.label ? ` (${grade.label})` : ''} — may need attention.` });
      }
    }
  });

  if (!items.length) return '';

  return `
    <div class="degree-section">
      <div class="degree-section-title">Needs Attention</div>
      <div class="degree-attention-list">
        ${items.map((it) => `
          <div class="degree-attention-item degree-attention-${escapeHtml(it.tone)}">
            <span class="degree-attention-dot"></span>
            <span>${escapeHtml(it.text)}</span>
          </div>`).join('')}
      </div>
    </div>
  `;
}

// ── Charts ─────────────────────────────────────────────────────────────────

function renderChartSection(years, yearIds, outputSystem) {
  if (!yearIds.length) return '';
  return `
    <div class="degree-section">
      <div class="degree-section-title">Overview Charts</div>
      <div class="degree-charts-grid">
        <div class="degree-chart-card">
          <div class="degree-chart-label">Year Prediction Comparison</div>
          <canvas id="degree-chart-prediction" class="degree-canvas"></canvas>
        </div>
        <div class="degree-chart-card">
          <div class="degree-chart-label">Credit Completion by Year</div>
          <canvas id="degree-chart-credits" class="degree-canvas"></canvas>
        </div>
      </div>
      ${renderCompatibilityRow(years, yearIds, outputSystem)}
    </div>
  `;
}

function renderCompatibilityRow(years, yearIds, outputSystem) {
  const pills = yearIds.map((id) => {
    const year   = years[id];
    const rule   = getYearRule(id);
    const system = getGradingSystem(id);
    let   tone, hint;

    if (rule.status === 'excluded') {
      tone = 'grey';   hint = 'Excluded from degree';
    } else if (rule.status === 'manualConversion') {
      const v = rule.convertedValue;
      tone = (v !== null && v !== undefined && v !== '') ? 'amber' : 'red';
      hint = tone === 'red' ? 'Converted value missing' : 'Using manual conversion';
    } else if (system !== outputSystem) {
      tone = 'red';   hint = 'System mismatch — needs conversion';
    } else {
      tone = 'green'; hint = 'Compatible';
    }

    return `<div class="degree-compat-pill degree-compat-${escapeHtml(tone)}" title="${escapeHtml(hint)}">
      <span class="degree-compat-dot"></span>
      <span class="degree-compat-name">${escapeHtml(year.label)}</span>
      <span class="degree-compat-hint">${escapeHtml(hint)}</span>
    </div>`;
  }).join('');

  return `
    <div class="degree-compat-row">
      <div class="degree-chart-label">Compatibility Status</div>
      <div class="degree-compat-pills">${pills}</div>
    </div>
  `;
}

function renderYearPredictionChart(years, yearIds, outputSystem) {
  const canvas = document.getElementById('degree-chart-prediction');
  if (!canvas) return;
  const ctx   = canvas.getContext('2d');
  const dark  = document.body.classList.contains('theme-dark');
  const dpr   = window.devicePixelRatio || 1;
  const w     = canvas.parentElement.clientWidth - 2;
  const h     = Math.max(40 + yearIds.length * 44, 120);
  canvas.width  = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width  = w + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const ink    = dark ? '#ececec' : '#1a1a1a';
  const muted  = dark ? '#a3a3a3' : '#888888';
  const barBg  = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
  const barFill = dark ? '#d4a017' : '#b8860b';
  const manualFill = dark ? '#4d93cf' : '#2980b9';
  const padL   = 100, padR = 48, padT = 12, barH = 24, rowH = 44;

  yearIds.forEach((id, i) => {
    const year   = years[id];
    const rule   = getYearRule(id);
    const agg    = computeYearAggregate(id);
    const system = getGradingSystem(id);
    const isManual = rule.status === 'manualConversion';
    const val    = isManual ? (rule.convertedValue !== null ? Number(rule.convertedValue) : null) : agg?.value ?? null;

    const y = padT + i * rowH + (rowH - barH) / 2;

    // Scale: for UK/cn4 use 100, for GPA systems use their max
    const scales = { us4: 4, us43: 4.3, au7: 7, au4: 4, my4: 4, cn4: 100, nz9: 9, de5: 5, uk: 100 };
    const maxVal = scales[system] || 100;
    const inverted = system === 'de5'; // lower is better

    const chartW = w - padL - padR;

    // Year label
    ctx.font         = '12px system-ui, sans-serif';
    ctx.fillStyle    = ink;
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(year.label, padL - 8, y + barH / 2);

    // Background track
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
      const ratio  = inverted ? 1 - (val - 1) / (maxVal - 1) : val / maxVal;
      const fillW  = Math.max(0, Math.min(chartW, chartW * ratio));
      ctx.fillStyle = isManual ? manualFill : barFill;
      ctx.beginPath();
      ctx.roundRect(padL, y, fillW, barH, 4);
      ctx.fill();

      const grade  = formatSelectedGrade(val);
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
  const h      = Math.max(40 + yearIds.length * 44, 120);
  canvas.width  = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width  = w + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const ink      = dark ? '#ececec' : '#1a1a1a';
  const muted    = dark ? '#a3a3a3' : '#888888';
  const fillOk   = dark ? '#4a8c42' : '#2d5a27';
  const fillMiss = dark ? '#c0392b' : '#c0392b';
  const fillBg   = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
  const padL = 100, padR = 48, padT = 12, barH = 24, rowH = 44;

  // Find max credits across all years for scale
  const maxCredits = Math.max(...yearIds.map((id) => computeYearAggregate(id)?.attempted || 0), 1);

  yearIds.forEach((id, i) => {
    const year = years[id];
    const agg  = computeYearAggregate(id);
    const y    = padT + i * rowH + (rowH - barH) / 2;
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
      ? `${graded} graded · ${missing} missing`
      : `${graded} ${unitLabel} graded`;
    ctx.font      = '11px system-ui, sans-serif';
    ctx.fillStyle = gradedW > 60 ? '#fff' : ink;
    ctx.textAlign = gradedW > 60 ? 'right' : 'left';
    ctx.fillText(label, gradedW > 60 ? padL + gradedW - 6 : padL + gradedW + 6, y + barH / 2);
  });
}

// ── Per-year cards ─────────────────────────────────────────────────────────

function renderYearCardsSection(years, yearIds, policy, outputSystem) {
  if (!yearIds.length) return '';
  return `
    <div class="degree-section">
      <div class="degree-section-title">Year Breakdown</div>
      <div class="degree-year-cards">
        ${yearIds.map((id) => renderYearCard(id, years[id], policy, outputSystem)).join('')}
      </div>
    </div>
  `;
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
    manualConversion: 'Counts using converted value',
  }[rule.status] || rule.status;

  const statusTone  = {
    included:         'green',
    excluded:         'grey',
    manualConversion: 'amber',
  }[rule.status] || 'grey';

  let predictionBlock = '';
  if (rule.status === 'manualConversion') {
    const origAgg = agg?.value !== null ? formatSelectedGrade(agg.value) : null;
    const convVal = rule.convertedValue !== null && rule.convertedValue !== '' ? Number(rule.convertedValue) : null;
    predictionBlock = `
      <div class="degree-year-pred">
        ${origAgg ? `<div class="degree-year-pred-row"><span class="degree-year-pred-label">Original result</span><span class="degree-year-pred-value">${escapeHtml(origAgg.main)}${origAgg.label ? ` <span class="degree-year-pred-cls">(${escapeHtml(origAgg.label)})</span>` : ''}</span></div>` : ''}
        ${convVal !== null
          ? `<div class="degree-year-pred-row"><span class="degree-year-pred-label">Used as</span><span class="degree-year-pred-value">${escapeHtml(formatSelectedGrade(convVal, { courseDisplay: true }).main)} ${escapeHtml(GRADING_SYSTEM_LABELS[outputSystem] || outputSystem)}</span></div>`
          : `<div class="degree-year-pred-row degree-year-pred-missing"><span class="degree-year-pred-label">Converted value</span><span class="degree-year-pred-value">Not entered</span></div>`}
        ${rule.conversionNote ? `<div class="degree-year-pred-note">${escapeHtml(rule.conversionNote)}</div>` : ''}
      </div>`;
  } else if (agg && agg.value !== null) {
    const grade = formatSelectedGrade(agg.value);
    predictionBlock = `
      <div class="degree-year-pred">
        <div class="degree-year-pred-row"><span class="degree-year-pred-label">Prediction</span><span class="degree-year-pred-value">${escapeHtml(grade.main)}${grade.label ? ` <span class="degree-year-pred-cls">${escapeHtml(grade.label)}</span>` : ''}</span></div>
      </div>`;
  } else if (agg && agg.moduleCount > 0) {
    predictionBlock = `<div class="degree-year-pred degree-year-pred-none">No marks entered yet</div>`;
  } else {
    predictionBlock = `<div class="degree-year-pred degree-year-pred-none">No modules added</div>`;
  }

  const compat = rule.status === 'excluded'
    ? ''
    : rule.status === 'manualConversion'
      ? '<span class="degree-year-compat degree-year-compat-amber">Converted value</span>'
      : yearSystem === outputSystem
        ? '<span class="degree-year-compat degree-year-compat-green">Compatible</span>'
        : '<span class="degree-year-compat degree-year-compat-red">System mismatch</span>';

  return `
    <div class="degree-year-card">
      <div class="degree-year-card-head">
        <div class="degree-year-card-name">${escapeHtml(year.label)}</div>
        <span class="degree-year-status degree-year-status-${escapeHtml(statusTone)}">${escapeHtml(statusLabel)}</span>
      </div>
      <div class="degree-year-card-meta">
        ${uni    ? `<div>${escapeHtml(uni)}</div>`     : ''}
        ${course ? `<div>${escapeHtml(course)}</div>`  : ''}
        ${acLabel ? `<div class="degree-year-card-academic">${escapeHtml(acLabel)}</div>` : ''}
        <div class="degree-year-card-system">${escapeHtml(GRADING_SYSTEM_LABELS[yearSystem] || yearSystem)}</div>
      </div>
      ${predictionBlock}
      ${agg ? `
        <div class="degree-year-card-credits">
          <span>${agg.gradedCredits} / ${agg.attempted} ${unitLabel}</span>
          <span>${agg.gradedCount} / ${agg.moduleCount} modules graded</span>
        </div>` : ''}
      <div class="degree-year-card-foot">
        <span class="degree-year-weight">${rule.status !== 'excluded' ? `Degree weight: ${Number(rule.weight) || 0}%` : `Weight: 0% (excluded)`}</span>
        ${compat}
      </div>
    </div>
  `;
}

// ── Policy setup ───────────────────────────────────────────────────────────

function renderPolicySection(years, yearIds, policy, outputSystem) {
  const groups = [...new Set(DEGREE_PRESETS.map((p) => p.group))];

  const presetOptions = groups.map((g) => `
    <optgroup label="${escapeHtml(g)}">
      ${DEGREE_PRESETS.filter((p) => p.group === g)
        .map((p) => `<option value="${escapeHtml(p.id)}" ${policy.presetId === p.id ? 'selected' : ''}>${escapeHtml(p.label)}</option>`)
        .join('')}
    </optgroup>`).join('');

  const yearOptions = yearIds.map((id) => {
    const year = years[id];
    const sel  = (policy.outputYearId === id) || (!policy.outputYearId && id === yearIds[yearIds.length - 1]);
    return `<option value="${escapeHtml(id)}" ${sel ? 'selected' : ''}>${escapeHtml(year.label)}</option>`;
  }).join('');

  const outputYear   = getDegreeOutputYear();
  const outSystem    = outputYear ? getGradingSystem(outputYear.id) : null;

  const yearRulesHtml = yearIds.map((id) => renderYearRuleRow(id, years[id], policy, outputSystem)).join('');

  return `
    <div class="degree-section">
      <div class="degree-section-title">Degree Policy</div>
      <div class="degree-policy-notice">Degree calculation presets are starting points only. Your university may use different rules.</div>

      <div class="degree-policy-grid">
        <div class="degree-policy-field">
          <label class="degree-policy-label">Common template</label>
          <select class="degree-policy-select" onchange="setDegreePolicyPreset(this.value)">
            ${presetOptions}
          </select>
        </div>

        <div class="degree-policy-field">
          <label class="degree-policy-label">Graduating / output year</label>
          <select class="degree-policy-select" onchange="setDegreeOutputYear(this.value)">
            ${yearOptions}
          </select>
          ${outSystem ? `<div class="degree-policy-hint">Output system: ${escapeHtml(GRADING_SYSTEM_LABELS[outSystem] || outSystem)}</div>` : ''}
        </div>
      </div>

      <div class="degree-year-rules">
        <div class="degree-year-rules-title">Year rules and weights</div>
        ${yearRulesHtml}
      </div>
    </div>
  `;
}

function renderYearRuleRow(yearId, year, policy, outputSystem) {
  const rule       = getYearRule(yearId);
  const yearSystem = getGradingSystem(yearId);
  const compatible = yearSystem === outputSystem;

  const statusSelect = `
    <select class="degree-rule-select" onchange="setYearRuleStatus('${escapeHtml(yearId)}', this.value)">
      <option value="included"         ${rule.status === 'included'         ? 'selected' : ''}>Counts toward degree</option>
      <option value="excluded"         ${rule.status === 'excluded'         ? 'selected' : ''}>Does not count</option>
      <option value="manualConversion" ${rule.status === 'manualConversion' ? 'selected' : ''}>Counts using converted value</option>
    </select>`;

  const reasonRow = rule.status === 'excluded'
    ? `<div class="degree-rule-row">
        <label class="degree-rule-label">Reason</label>
        <select class="degree-rule-select" onchange="setYearRuleReason('${escapeHtml(yearId)}', this.value)">
          ${EXCLUDED_REASONS.map((r) => `<option value="${escapeHtml(r.value)}" ${rule.reason === r.value ? 'selected' : ''}>${escapeHtml(r.label)}</option>`).join('')}
        </select>
      </div>`
    : '';

  const weightRow = rule.status !== 'excluded'
    ? `<div class="degree-rule-row">
        <label class="degree-rule-label">Weight %</label>
        <input type="number" class="degree-rule-input" min="0" max="100" step="0.1"
          value="${Number(rule.weight) || 0}"
          oninput="setYearRuleWeight('${escapeHtml(yearId)}', this.value)">
      </div>`
    : '';

  const conversionRows = rule.status === 'manualConversion'
    ? `<div class="degree-rule-conversion-block">
        <div class="degree-rule-row">
          <label class="degree-rule-label">Original system</label>
          <span class="degree-rule-hint">${escapeHtml(GRADING_SYSTEM_LABELS[yearSystem] || yearSystem)}</span>
        </div>
        <div class="degree-rule-row">
          <label class="degree-rule-label">Output system</label>
          <span class="degree-rule-hint">${escapeHtml(GRADING_SYSTEM_LABELS[outputSystem] || outputSystem)}</span>
        </div>
        <div class="degree-rule-row">
          <label class="degree-rule-label">Converted value</label>
          <input type="number" class="degree-rule-input" step="0.01"
            placeholder="e.g. 68"
            value="${rule.convertedValue !== null && rule.convertedValue !== '' ? escapeHtml(String(rule.convertedValue)) : ''}"
            oninput="setYearConvertedValue('${escapeHtml(yearId)}', this.value)">
        </div>
        <div class="degree-rule-row">
          <label class="degree-rule-label">Conversion note</label>
          <input type="text" class="degree-rule-input" maxlength="200"
            placeholder="e.g. Converted using receiving university guidance"
            value="${escapeHtml(rule.conversionNote || '')}"
            oninput="setYearConversionNote('${escapeHtml(yearId)}', this.value)">
        </div>
      </div>`
    : '';

  const systemMismatch = rule.status === 'included' && !compatible
    ? `<div class="degree-rule-warn">Year system (${escapeHtml(GRADING_SYSTEM_LABELS[yearSystem] || yearSystem)}) differs from output system. Set status to "converted value" or change the year's grading system.</div>`
    : '';

  return `
    <div class="degree-rule-card">
      <div class="degree-rule-head">
        <span class="degree-rule-year-name">${escapeHtml(year.label)}</span>
        ${statusSelect}
      </div>
      ${systemMismatch}
      ${reasonRow}
      ${weightRow}
      ${conversionRows}
    </div>
  `;
}

// ── Public handlers (exposed via window.*) ─────────────────────────────────

export function toggleDegreePolicy(enabled) {
  saveDegreePolicy({ enabled });
  renderDegreeDashboard();
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
  const rule              = getYearRule(yearId);
  rule.conversionNote     = value;
  save();
}
