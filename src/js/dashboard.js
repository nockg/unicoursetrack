import { store } from './store.js';
import { getStore, syncModalScrollLock } from './state.js';
import { escapeHtml } from './utils.js';
import {
  classify,
  formatSelectedGrade,
  getComponentScaleConfig,
  getCreditUnitLabel,
  getGradingSystem,
  getActiveTermFilter,
  isModuleVisibleInActiveTerm,
  formatGradeInputValue,
} from './grading.js';
import {
  calculateCourseworkFromComponents,
  formatModuleGradeDisplay,
  getModuleDone,
  getModuleFinal,
  getModulePct,
  getModuleTotal,
  getWeightedAvg,
  isModulePredictionMode,
  shouldAssessmentRollUpToCoursework,
} from './marks.js';
import { closeModuleLibrary, handleModuleLibraryKeydown } from './library.js';
import { closeDegreeOverviewPanels, renderDegreeOverview } from './degree.js';

export function updateModule(moduleIndex) {
  const done = getModuleDone(moduleIndex);
  const pct = getModulePct(moduleIndex);

  document.getElementById(`mdone-${moduleIndex}`).textContent = done;
  document.getElementById(`mpct-${moduleIndex}`).textContent = `${pct.toFixed(1)}% complete`;
  document.getElementById(`mfill-${moduleIndex}`).style.width = `${pct.toFixed(1)}%`;

  const final = getModuleFinal(moduleIndex);
  const finalEl = document.getElementById(`mfinal-${moduleIndex}`);
  const clsEl = document.getElementById(`mcls-${moduleIndex}`);
  const displayGrade = formatModuleGradeDisplay(moduleIndex);

  finalEl.textContent = displayGrade.main;

  if (final !== null) {
    const cls = classify(final);
    clsEl.className = `final-cls ${cls.cls || ''}`.trim();
    clsEl.textContent = [displayGrade.label, displayGrade.secondary].filter(Boolean).join(' · ');
  } else {
    clsEl.className = 'final-cls';
    clsEl.textContent = '';
  }

  const cwInput = document.getElementById(`cw-${moduleIndex}`);
  const exInput = document.getElementById(`exam-${moduleIndex}`);
  const compactCw = document.querySelector(`#topics-${moduleIndex} .compact-cw`);
  const compactEx = document.querySelector(`#topics-${moduleIndex} .compact-ex`);
  const mod = store.MODULES[moduleIndex];
  const system = getGradingSystem();
  const predictionMode = isModulePredictionMode(mod, system);
  const componentScale = getComponentScaleConfig(system);

  if ((system === 'uk' || predictionMode) && cwInput) {
    const cwDisabled = (Number(mod.cw) || 0) === 0;
    const calculated = calculateCourseworkFromComponents(moduleIndex);
    cwInput.disabled = cwDisabled;
    if (compactCw) compactCw.disabled = cwDisabled;
    if (cwDisabled) {
      cwInput.placeholder = 'N/A';
      cwInput.value = '';
      if (compactCw) compactCw.value = '';
    } else if (shouldAssessmentRollUpToCoursework(moduleIndex, system) && calculated.mark !== null) {
      const calculatedValue = formatGradeInputValue(calculated.mark);
      getStore().coursework[moduleIndex] = calculatedValue;
      cwInput.value = calculatedValue;
      if (compactCw) compactCw.value = calculatedValue;
      cwInput.placeholder = system === 'de5'
        ? `Calc ${calculated.mark.toFixed(1)} grade`
        : `Calc ${calculated.mark.toFixed(1)}%`;
    } else {
      cwInput.placeholder = componentScale.placeholder || '-';
    }
  }

  if ((system === 'uk' || predictionMode) && exInput) {
    const examDisabled = (Number(mod.exam) || 0) === 0;
    exInput.disabled = examDisabled;
    if (compactEx) compactEx.disabled = examDisabled;
    if (examDisabled) {
      exInput.placeholder = 'N/A';
      exInput.value = '';
      if (compactEx) compactEx.value = '';
    } else {
      exInput.placeholder = componentScale.placeholder || '-';
    }
  }

  window.updateCourseworkSummary?.(moduleIndex);
}

export function updateGlobal() {
  let total = 0;
  let done = 0;
  let weightedCredits = 0;

  store.MODULES.forEach((mod, moduleIndex) => {
    if (!isModuleVisibleInActiveTerm(moduleIndex)) return;
    total += getModuleTotal(moduleIndex);
    done += getModuleDone(moduleIndex);
    weightedCredits += mod.credits * (getModulePct(moduleIndex) / 100);
  });

  const pct = total ? (done / total) * 100 : 0;
  document.getElementById('global-done').textContent = done;
  document.getElementById('global-total').textContent = total;
  document.getElementById('global-fill').style.width = `${pct.toFixed(1)}%`;
  document.getElementById('global-pct-text').textContent = `${pct.toFixed(1)}% complete`;

  const unitLabel = getCreditUnitLabel();
  const activeTerm = getActiveTermFilter();
  const creditTarget = activeTerm === 'all'
    ? store.TOTAL_CREDITS
    : store.MODULES.reduce((sum, mod, moduleIndex) => (
      isModuleVisibleInActiveTerm(moduleIndex) ? sum + (Number(mod.credits) || 0) : sum
    ), 0);
  document.getElementById('credits-text').textContent = `${weightedCredits.toFixed(1)} / ${creditTarget} ${unitLabel}`;

  updatePredictor();
  updateDashboard();
}

export function updatePredictor() {
  const avg = getWeightedAvg();
  const heroPredictor = document.getElementById('hero-predictor');
  const heroClass = document.getElementById('hero-class');
  const badgeHost = document.getElementById('classification-badge');
  if (avg === null) {
    heroPredictor.textContent = '-';
    heroClass.textContent = 'Awaiting marks';
    badgeHost.innerHTML = '';
    return;
  }

  const cls = classify(avg);
  const grade = formatSelectedGrade(avg);
  heroPredictor.textContent = grade.main;
  heroClass.textContent = grade.label || cls.badge;
  badgeHost.innerHTML = `<span class="classification-badge ${cls.heroCls}">${escapeHtml(grade.label || cls.badge)}</span>`;
}

export function updateDashboard() {
  if (!document.getElementById('dashboard-modal')?.classList.contains('hidden')) {
    renderDegreeOverview();
  }
}

export function renderDashboardTermSummary() {
  return;
}

export function openDashboard() {
  document.getElementById('dashboard-modal').classList.remove('hidden');
  syncModalScrollLock();
  renderDegreeOverview();
}

export function closeDashboard() {
  closeDegreeOverviewPanels();
}

export function renderDashboardChart() {
  return;
}

export function formatCountdown(dateString) {
  const target = new Date(dateString);
  const diff = target.getTime() - Date.now();
  const sign = diff < 0 ? '-' : '';
  const totalSeconds = Math.floor(Math.abs(diff) / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${sign}${days}d ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('dashboard-modal')?.addEventListener('click', (event) => {
    if (event.target.id === 'dashboard-modal') closeDashboard();
  });
  document.getElementById('timeline-modal')?.addEventListener('click', (event) => {
    if (event.target.id === 'timeline-modal') window.closeDeadlineTimeline?.();
  });
  document.getElementById('todo-modal')?.addEventListener('click', (event) => {
    if (event.target.id === 'todo-modal') event.stopPropagation();
  });
  document.querySelector('#todo-modal .timeline-head')?.addEventListener('pointerdown', (event) => window.startTodoPanelDrag?.(event));
  document.addEventListener('pointermove', (event) => window.moveTodoPanelDrag?.(event));
  document.addEventListener('pointerup', (event) => window.endTodoPanelDrag?.(event));
  window.addEventListener('resize', () => {
    if (!document.getElementById('todo-modal')?.classList.contains('hidden')) {
      window.applyTodoPanelState?.();
    }
  });
  document.getElementById('deadline-form-modal')?.addEventListener('click', (event) => {
    if (event.target.id === 'deadline-form-modal') window.closeDeadlineForm?.();
  });
  document.getElementById('calendar-modal')?.addEventListener('click', (event) => {
    if (event.target.id === 'calendar-modal') window.closeCalendarComposer?.();
  });
  document.getElementById('calendar-all-day-input')?.addEventListener('change', () => window.updateCalendarComposerMode?.());
  document.getElementById('deadline-all-day-input')?.addEventListener('change', () => window.updateDeadlineFormMode?.());
  document.getElementById('module-library-modal')?.addEventListener('click', (event) => {
    if (event.target.id === 'module-library-modal') closeModuleLibrary();
  });
  document.getElementById('module-library-modal')?.addEventListener('keydown', handleModuleLibraryKeydown);
  document.getElementById('course-setup-modal')?.addEventListener('click', (event) => {
    if (event.target.id === 'course-setup-modal') window.closeCourseSetupModal?.();
  });
  document.getElementById('year-settings-modal')?.addEventListener('click', (event) => {
    if (event.target.id === 'year-settings-modal') window.closeYearSettingsModal?.();
  });
  document.getElementById('onboarding-modal')?.addEventListener('click', () => {});
  document.getElementById('auth-modal')?.addEventListener('click', (event) => {
    if (!store.currentUser || window.isRecoveryFlow?.()) return;
    if (event.target.id === 'auth-modal') window.closeAuthModal?.();
  });
});
