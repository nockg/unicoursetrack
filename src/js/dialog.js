/**
 * In-app dialog helpers, topic/module CRUD actions, and year management.
 */

import { store } from './store.js';
import { escapeHtml, shiftIndexedObjectAfterDelete } from './utils.js';
import { KEY, PREFS_KEY, DEFAULT_PREFERENCES, BASE_MODULES } from './config.js';
import {
  getStore, save, syncModalScrollLock, getCurrentYear, refreshActiveYear, getTopicEntry,
  getModuleTopicStateSnapshot, applyModuleTopicStateSnapshot, ensureYearsState, syncUndoBaseline,
  createInitialState, parseTopicSelectionKey, clearTopicSelection, getSelectedTopicKeys,
  clearLocalTrackerStorage, undoLastAction, redoLastAction, handleSelectedTopicDeleteFromKeyboard,
  getModuleSectionStateKey, setModuleSectionOpen, createYearStore, topicSelectionKey,
  getEffectiveUniversity, getEffectiveCourse, getEffectiveAcademicYearLabel,
} from './state.js';
import { getGradingSystem, getActiveTermFilter, getCurrentTermOptions, normalizeTermValue, getTermLabel, isKnownTermValue, ensureStoreTermOptions } from './grading.js';
import { getCourseworkComponents } from './marks.js';
import { updateModule, updateGlobal } from './dashboard.js';
import { openModules, setTopicDropSuppressUntil, refreshTopicStructure } from './topics.js';
import { renderStickyExams, renderDeadlineTimeline } from './deadlines.js';
import { parseQuotedList, shiftTopicsAfterModuleDelete } from './years.js';
import { buildModules } from './rendering.js';
import { clearCloudProfile, shiftModuleColourMapAfterDelete } from './auth.js';

// ── Module-local dialog state ─────────────────────────────────────────────────

let appDialogResolver = null;
let appDialogMode = 'confirm';
let appDialogRequireYes = false;
let appDialogCheckboxRequired = false;
let appDialogCheckboxChecked = false;

// ── App dialog ────────────────────────────────────────────────────────────────

function closeVisibleEscapeModal() {
  const modalSelectors = [
    '#prefs-panel',
    '#dashboard-modal',
    '#timeline-modal',
    '#todo-modal',
    '#calendar-modal',
    '#deadline-form-modal',
    '#module-library-modal',
    '#year-settings-modal',
  ];

  for (const selector of modalSelectors) {
    const node = document.querySelector(selector);
    if (!node || node.classList.contains('hidden')) continue;

    if (selector === '#prefs-panel') {
      node.classList.add('hidden');
      return true;
    }

    const closeButton = node.querySelector(".deadline-splash-close, [data-close], button[aria-label='Close']");
    if (closeButton) {
      closeButton.click();
      return true;
    }
  }

  return false;
}

function openAppDialog(options = {}) {
  const modal = document.getElementById('app-dialog-modal');
  if (!modal) return Promise.resolve(null);

  const label = document.getElementById('app-dialog-label');
  const title = document.getElementById('app-dialog-title');
  const message = document.getElementById('app-dialog-message');
  const field = document.getElementById('app-dialog-field');
  const input = document.getElementById('app-dialog-input');
  const inputLabel = document.getElementById('app-dialog-input-label');
  const checkWrap = document.getElementById('app-dialog-check-wrap');
  const check = document.getElementById('app-dialog-check');
  const checkLabel = document.getElementById('app-dialog-check-label');
  const confirmBtn = document.getElementById('app-dialog-confirm');
  const cancelBtn = document.getElementById('app-dialog-cancel');

  appDialogMode = options.mode || 'confirm';
  appDialogRequireYes = !!options.requireYes;
  appDialogCheckboxRequired = !!options.checkboxRequired;
  appDialogCheckboxChecked = !!options.checkboxDefault;

  if (label) label.textContent = options.label || (options.danger ? 'Delete' : 'Confirm');
  if (title) title.textContent = options.title || 'Are you sure?';
  if (message) message.textContent = options.message || '';

  const needsInput = appDialogMode === 'prompt';
  if (field) field.classList.toggle('hidden', !needsInput);
  if (inputLabel) inputLabel.textContent = options.inputLabel || 'Value';
  if (input) {
    input.value = options.defaultValue || '';
    input.placeholder = options.placeholder || '';
  }

  if (checkWrap) checkWrap.classList.toggle('hidden', !options.checkboxLabel);
  if (checkLabel) checkLabel.textContent = options.checkboxLabel || '';
  if (check) {
    check.checked = !!options.checkboxDefault;
    appDialogCheckboxChecked = !!check.checked;
  }

  if (confirmBtn) {
    confirmBtn.textContent = options.confirmText || (options.danger ? 'Delete' : 'Continue');
    confirmBtn.classList.toggle('danger-action', !!options.danger);
  }
  if (cancelBtn) cancelBtn.textContent = options.cancelText || 'Cancel';
  if (check && confirmBtn) {
    const syncConfirmState = () => {
      appDialogCheckboxChecked = !!check.checked;
      confirmBtn.disabled = appDialogCheckboxRequired && !appDialogCheckboxChecked;
    };
    check.onchange = syncConfirmState;
    syncConfirmState();
  } else if (confirmBtn) {
    confirmBtn.disabled = false;
  }

  modal.classList.remove('hidden');
  syncModalScrollLock();
  setTimeout(() => {
    if (needsInput && input) {
      input.focus();
      input.select();
    } else if (confirmBtn) {
      confirmBtn.focus();
    }
  }, 0);

  return new Promise((resolve) => {
    appDialogResolver = resolve;
  });
}

export function resolveAppDialog(confirmed) {
  const modal = document.getElementById('app-dialog-modal');
  const input = document.getElementById('app-dialog-input');
  const check = document.getElementById('app-dialog-check');
  if (modal) modal.classList.add('hidden');
  syncModalScrollLock();

  if (!appDialogResolver) return;
  const resolver = appDialogResolver;
  appDialogResolver = null;

  if (!confirmed) {
    resolver(null);
    return;
  }

  if (appDialogMode === 'prompt') {
    resolver({ value: input?.value || '', checked: !!check?.checked });
    return;
  }

  resolver({ confirmed: true, checked: !!check?.checked });
}

document.addEventListener('keydown', (event) => {
  const modal = document.getElementById('app-dialog-modal');
  if (!modal || modal.classList.contains('hidden')) {
    if (event.key === 'Escape') closeVisibleEscapeModal();
    return;
  }
  if (event.key === 'Escape') resolveAppDialog(false);
  if (event.key === 'Enter' && !event.shiftKey) resolveAppDialog(true);
});

export async function appConfirm({
  title, message, label = 'Confirm', confirmText = 'Continue', danger = false,
  requireYes = false, checkboxLabel = '', checkboxRequired = false,
} = {}) {
  const result = await openAppDialog({ mode: 'confirm', title, message, label, confirmText, danger, requireYes, checkboxLabel, checkboxRequired });
  return !!result?.confirmed && (!checkboxRequired || !!result.checked);
}

export async function appPrompt({
  title, message, label = 'Input', inputLabel = 'Value', defaultValue = '',
  placeholder = '', confirmText = 'Save', checkboxLabel = '', checkboxDefault = false,
} = {}) {
  const result = await openAppDialog({ mode: 'prompt', title, message, label, inputLabel, defaultValue, placeholder, confirmText, checkboxLabel, checkboxDefault });
  if (!result) return null;
  return result;
}

export function showAppNotice(title, message = '') {
  return openAppDialog({ mode: 'confirm', label: 'Notice', title, message, confirmText: 'Okay', cancelText: 'Close' });
}

// ── Background / template actions ─────────────────────────────────────────────

export async function deleteCustomBackground(key) {
  if (!store.preferences.customBackgrounds || !store.preferences.customBackgrounds[key]) return;
  const confirmed = await appConfirm({
    label: 'Background',
    title: 'Delete custom background?',
    message: 'This removes the saved background from this tracker.',
    confirmText: 'Delete',
    danger: true,
  });
  if (!confirmed) return;
  delete store.preferences.customBackgrounds[key];
  if (store.preferences.hero === key) store.preferences.hero = 'bg1';
  window.savePreferences?.();
  window.applyPreferences?.();
}

export async function loadAeroTemplate() {
  const currentYear = getCurrentYear();
  if (!currentYear) return;
  if (currentYear.store.modules.length) {
    const replace = await appConfirm({
      label: 'Template',
      title: 'Replace current modules?',
      message: "This will replace the current year's modules with the Year 1 Aerospace Engineering template.",
      confirmText: 'Replace',
      danger: true,
    });
    if (!replace) return;
  }
  currentYear.store = createYearStore(BASE_MODULES);
  if (!store.state.profile.course || store.state.profile.course === 'Course' || store.state.profile.course === 'Your Course') store.state.profile.course = 'Aerospace Engineering';
  if (!store.state.profile.university || store.state.profile.university === 'University') store.state.profile.university = 'University of Sheffield';
  if (!store.state.setup) store.state.setup = {};
  store.state.setup.templateChoiceMade = true;
  store.state.ui.currentTermFilter = 'all';
  refreshActiveYear();
  save();
  document.getElementById('template-splash').classList.add('hidden');
  renderYearSelector();
  buildModules();
  renderStickyExams();
  updateGlobal();
}

// ── Module actions ────────────────────────────────────────────────────────────

export async function clearModuleMarks(mi, event) {
  if (event) event.stopPropagation();
  const ys = getStore();
  const mod = store.MODULES[mi];
  if (!mod) return;
  const confirmed = await appConfirm({
    label: 'Marks',
    title: 'Clear grade?',
    message: getGradingSystem() === 'uk'
      ? `Clear coursework and exam marks for ${mod.kanji || mod.name}?`
      : `Clear the course grade for ${mod.kanji || mod.name}?`,
    confirmText: 'Clear',
    danger: true,
  });
  if (!confirmed) return;
  delete ys.coursework[mi];
  delete ys.exams[mi];
  if (ys.finalGrades) delete ys.finalGrades[mi];
  if (ys.majorModules) delete ys.majorModules[mi];
  if (ys.courseworkComponents) delete ys.courseworkComponents[mi];
  save();
  buildModules();
  updateGlobal();
}

export async function clearTrackerStorage() {
  const confirmClear = await appConfirm({
    label: 'Reset Tracker',
    title: 'Reset everything?',
    message: 'This will reset progress, marks, notes, links, and cloud saves for this account.',
    confirmText: 'Reset',
    danger: true,
    checkboxLabel: 'I understand this clears both local and cloud tracker data.',
    checkboxRequired: true,
  });
  if (!confirmClear) return;
  clearTimeout(store.cloudSaveTimer);
  store.cloudReady = false;
  store.cloudHadSave = false;
  store.cloudLoadSucceeded = false;
  const blankState = createInitialState();
  const blankPrefs = { ...DEFAULT_PREFERENCES };
  if (store.currentUser) {
    try {
      await clearCloudProfile(blankState, blankPrefs);
    } catch (error) {
      await showAppNotice('Could not clear cloud storage', error?.message || 'Cloud reset failed.');
      store.cloudReady = true;
      return;
    }
  }
  clearLocalTrackerStorage();
  store.state = blankState;
  Object.keys(store.preferences).forEach((key) => delete store.preferences[key]);
  Object.assign(store.preferences, blankPrefs);
  localStorage.setItem(KEY, JSON.stringify(store.state));
  localStorage.setItem(PREFS_KEY, JSON.stringify(store.preferences));
  ensureYearsState();
  refreshActiveYear();
  syncUndoBaseline();
  window.applyPreferences?.();
  renderYearSelector();
  buildModules();
  renderStickyExams();
  updateGlobal();
  await showAppNotice('Tracker reset', 'Local and cloud tracker data were cleared successfully.');
  if (store.currentUser) window.setupCourseIfNeeded?.();
}

// ── Year selector ─────────────────────────────────────────────────────────────

export function renderYearSelector() {
  const select = document.getElementById('year-select');
  if (!select) return;
  const currentYear = getCurrentYear();
  const yearOptions = Object.values(store.state.years)
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
    .map((year) => {
      ensureStoreTermOptions(year.store);
      const archived = year.store.archived ? ' (Archived)' : '';
      const activeTermForYear = year.id === store.state.ui.currentYearId ? getActiveTermFilter() : 'all';
      const terms = getCurrentTermOptions(year.store)
        .filter((term) => term.value === activeTermForYear || year.store.modules?.some((mod) => normalizeTermValue(mod.term) === term.value))
        .map((term) => `<option value="term:${escapeHtml(year.id)}:${escapeHtml(term.value)}">- ${escapeHtml(term.label)}</option>`)
        .join('');
      return `<optgroup label="${escapeHtml(year.label + archived)}">
        <option value="year:${escapeHtml(year.id)}">${escapeHtml(year.label)} Overall</option>
        ${terms}
      </optgroup>`;
    });
  const actionOptions = `<optgroup label="Actions">
    <option value="__new__">+ New Year</option>
    <option value="__archive__">${currentYear.store.archived ? 'Unarchive Current Year' : 'Archive Current Year'}</option>
    <option value="__delete__">Delete Current Year</option>
  </optgroup>
  <optgroup label="Settings">
    <option value="__settings__">⚙ Year Settings</option>
  </optgroup>`;
  select.innerHTML = yearOptions.join('') + actionOptions;
  const activeTerm = getActiveTermFilter();
  select.value = activeTerm === 'all' ? `year:${store.state.ui.currentYearId}` : `term:${store.state.ui.currentYearId}:${activeTerm}`;
  const profile = store.state?.profile || {};
  const yearNumber = parseInt(currentYear.label.match(/\d+/)?.[0] || '1', 10);
  const userName = (profile.name || '').trim();
  const university = getEffectiveUniversity() || 'University';
  const course = getEffectiveCourse() || 'Course';
  const academicYearLabel = getEffectiveAcademicYearLabel();
  const eyebrow = document.getElementById('hero-eyebrow');
  const termSuffix = activeTerm === 'all' ? '' : ` - ${getTermLabel(activeTerm)}`;
  if (eyebrow) eyebrow.textContent = userName
    ? `${userName} - ${university} - ${currentYear.label}${termSuffix} - ${academicYearLabel}`
    : `${university} - ${currentYear.label}${termSuffix} - ${academicYearLabel}`;
  const title = document.getElementById('hero-title');
  if (title) {
    const titleText = activeTerm === 'all' ? `Year ${yearNumber} ${course}` : `${getTermLabel(activeTerm)} ${course}`;
    title.textContent = titleText;

    title.classList.remove('hero-title-long', 'hero-title-very-long', 'hero-title-extreme');

    if (titleText.length > 80) title.classList.add('hero-title-extreme');
    else if (titleText.length > 55) title.classList.add('hero-title-very-long');
    else if (titleText.length > 34) title.classList.add('hero-title-long');
  }

  const footer = document.getElementById('footer-label');
  if (footer && !footer.classList.contains('mobile-app-footnote')) {
    footer.textContent = `${university} ${currentYear.label}${termSuffix} - Progress Tracker`;
  }

  document.title = `${course} ${currentYear.label}${termSuffix} Tracker`;
}

export function setActiveTermFilter(term = 'all') {
  if (!store.state.ui) store.state.ui = {};
  store.state.ui.currentTermFilter = isKnownTermValue(term) ? term : 'all';
  save();
  renderYearSelector();
  buildModules();
  renderStickyExams();
  updateGlobal();
}

// ── Year CRUD ─────────────────────────────────────────────────────────────────

export async function deleteCurrentYear() {
  const year = getCurrentYear();
  if (!year) return;
  if (Object.keys(store.state.years).length === 1) {
    await showAppNotice('Cannot delete year', 'You need at least one year in the tracker.');
    return;
  }
  const confirmed = await appConfirm({
    label: 'Delete Year',
    title: `Delete ${year.label}?`,
    message: 'This removes the year, its modules, marks, topics, and deadlines from this tracker.',
    confirmText: 'Delete Year',
    danger: true,
  });
  if (!confirmed) return;
  delete store.state.years[year.id];
  store.state.ui.currentYearId = Object.keys(store.state.years)[0];
  store.state.ui.currentTermFilter = 'all';
  refreshActiveYear();
  save();
  renderYearSelector();
  buildModules();
  renderStickyExams();
  updateGlobal();
}

export async function createNewYear() {
  const nextNumber = Object.keys(store.state.years).length + 1;
  const result = await appPrompt({
    label: 'New Year',
    title: 'Add a new academic year',
    message: "Name the year. You can start blank or copy the current year's modules.",
    inputLabel: 'Year name',
    defaultValue: `Year ${nextNumber}`,
    placeholder: 'Year 2',
    confirmText: 'Create Year',
    checkboxLabel: "Use current year's modules as a starting template",
    checkboxDefault: false,
  });
  if (!result || !result.value.trim()) return;
  const label = result.value.trim().replace(/^Y(\d+)\b/i, 'Year $1');
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `year-${Date.now()}`;
  if (store.state.years[id]) {
    await showAppNotice('Year already exists', 'Choose a different year name.');
    return;
  }
  store.state.years[id] = { id, label, store: createYearStore(result.checked ? store.MODULES : []) };
  store.state.ui.currentYearId = id;
  store.state.ui.currentTermFilter = 'all';
  refreshActiveYear();
  save();
  renderYearSelector();
  buildModules();
  renderStickyExams();
  updateGlobal();
}

// ── Module delete / edit ──────────────────────────────────────────────────────

export async function deleteModuleFromCurrentYear(mi, event) {
  if (event) event.stopPropagation();
  const mod = store.MODULES[mi];
  if (!mod) return;
  const confirmed = await appConfirm({ label: 'Delete Module', title: `Delete ${mod.kanji || mod.short || mod.name}?`, message: 'This removes the module, its topics, marks, notes, and links.', confirmText: 'Delete Module', danger: true });
  if (!confirmed) return;
  const ys = getStore();
  store.MODULES.splice(mi, 1);
  ys.topics = shiftTopicsAfterModuleDelete(ys.topics, mi);
  ys.coursework = shiftIndexedObjectAfterDelete(ys.coursework, mi);
  ys.courseworkComponents = shiftIndexedObjectAfterDelete(ys.courseworkComponents, mi);
  ys.exams = shiftIndexedObjectAfterDelete(ys.exams, mi);
  ys.notes = shiftIndexedObjectAfterDelete(ys.notes, mi);
  ys.blackboard = shiftIndexedObjectAfterDelete(ys.blackboard, mi);
  ys.formulas = shiftIndexedObjectAfterDelete(ys.formulas, mi);
  ys.relevantLinks = shiftIndexedObjectAfterDelete(ys.relevantLinks, mi);
  ys.moduleColors = shiftModuleColourMapAfterDelete(ys.moduleColors, mi);
  save();
  refreshActiveYear();
  buildModules();
  renderStickyExams();
  updateGlobal();
}

export async function editModuleTitle(mi, event) {
  if (event) event.stopPropagation();
  const mod = store.MODULES[mi];
  if (!mod) return;
  const result = await appPrompt({ label: 'Module', title: 'Edit module title', inputLabel: 'Module title', defaultValue: mod.name || '', confirmText: 'Save' });
  const title = result?.value;
  if (title === undefined || title === null || !title.trim()) return;
  mod.name = title.trim();
  if (!mod.short || mod.short === mod.kanji) mod.short = title.trim();
  save();
  buildModules();
  updateGlobal();
}

export async function editModuleCode(mi, event) {
  if (event) event.stopPropagation();
  const mod = store.MODULES[mi];
  if (!mod) return;
  const previousCode = mod.kanji || '';
  const result = await appPrompt({ label: 'Module', title: 'Edit module code', inputLabel: 'Module code', defaultValue: previousCode, confirmText: 'Save' });
  const code = result?.value;
  if (code === undefined || code === null || !code.trim()) return;
  mod.kanji = code.trim().toUpperCase();
  if (!mod.short || mod.short === previousCode) mod.short = mod.kanji;
  save();
  buildModules();
  updateGlobal();
}

// ── Topic CRUD ────────────────────────────────────────────────────────────────

export async function addTopicToModule(mi, event) {
  if (event) {
    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
  }
  const draftInput = document.getElementById(`topic-add-${mi}`);
  let input = draftInput ? draftInput.value : '';
  if (!input) {
    const result = await appPrompt({ label: 'Topic', title: 'Add topic', message: 'For multiple topics, wrap each one in quotes: "Topic 1" "Topic 2"', inputLabel: 'Topic name', defaultValue: '', confirmText: 'Add Topic' });
    input = result?.value || '';
  }
  if (!input || !input.trim()) return;
  const quotedTopics = [...input.matchAll(/"([^"]+)"/g)].map((match) => match[1].trim()).filter(Boolean);
  const topicsToAdd = quotedTopics.length ? quotedTopics : [input.trim()];
  store.MODULES[mi].topics.push(...topicsToAdd.map((title) => ({ title, subtopics: [], collapsed: false })));
  if (draftInput) draftInput.value = '';
  openModules.add(mi);
  setModuleSectionOpen(mi, 'topics', true);
  refreshTopicStructure(mi);
}

export async function addSubtopicToTopic(mi, ti, event) {
  if (event) {
    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
  }
  const topic = getTopicEntry(mi, ti);
  const result = await appPrompt({
    label: 'Subtopics',
    title: `Add subtopics under ${topic.title}`,
    message: 'Add one subtopic, or wrap several in quotes: "Definition" "Worked Example" "Past Paper"',
    inputLabel: 'Subtopics',
    placeholder: '"Definition" "Worked Example"',
    confirmText: 'Add Subtopics',
  });
  const values = parseQuotedList(result?.value || '');
  if (!values.length) return;
  store.MODULES[mi].topics[ti] = Object.assign({}, topic, { subtopics: [...topic.subtopics, ...values], collapsed: false });
  openModules.add(mi);
  setModuleSectionOpen(mi, 'topics', true);
  refreshTopicStructure(mi);
}

function removeSubtopicFromModule(mi, ti, si) {
  const ys = getStore();
  const topic = getTopicEntry(mi, ti);
  if (!topic.subtopics[si]) return;
  store.MODULES[mi].topics[ti] = Object.assign({}, topic, {
    subtopics: topic.subtopics.filter((_, index) => index !== si),
  });

  const nextTopics = {};
  Object.keys(ys.topics).forEach((key) => {
    const match = /^s_(\d+)_(\d+)_(\d+)$/.exec(key);
    if (!match) {
      nextTopics[key] = ys.topics[key];
      return;
    }
    const moduleIndex = Number(match[1]);
    const topicIndex = Number(match[2]);
    const subIndex = Number(match[3]);
    if (moduleIndex !== mi || topicIndex !== ti) {
      nextTopics[key] = ys.topics[key];
      return;
    }
    if (subIndex < si) nextTopics[key] = ys.topics[key];
    if (subIndex > si) nextTopics[`s_${mi}_${ti}_${subIndex - 1}`] = ys.topics[key];
  });
  const nextTopic = getTopicEntry(mi, ti);
  const allDone = nextTopic.subtopics.length > 0 && nextTopic.subtopics.every((_, index) => !!nextTopics[`s_${mi}_${ti}_${index}`]);
  if (allDone) nextTopics[`t_${mi}_${ti}`] = true;
  else delete nextTopics[`t_${mi}_${ti}`];
  ys.topics = nextTopics;
}

export function moveSubtopicInModule(mi, fromParentTi, fromSi, toParentTi, toSi, placement = 'before') {
  const topics = store.MODULES[mi]?.topics;
  if (!topics) return;
  if (fromParentTi === toParentTi && fromSi === toSi) return;
  const sourceTopic = getTopicEntry(mi, fromParentTi);
  const targetTopic = getTopicEntry(mi, toParentTi);
  if (!sourceTopic?.subtopics?.[fromSi] || !targetTopic) return;

  const stateSnapshot = getModuleTopicStateSnapshot(mi);
  const movedTitle = sourceTopic.subtopics[fromSi];
  const movedDone = !!stateSnapshot[fromParentTi]?.subs?.[fromSi];

  const sourceSubtopics = [...sourceTopic.subtopics];
  sourceSubtopics.splice(fromSi, 1);
  store.MODULES[mi].topics[fromParentTi] = Object.assign({}, sourceTopic, { subtopics: sourceSubtopics });
  stateSnapshot[fromParentTi].subs.splice(fromSi, 1);

  let insertIndex = toSi;
  if (fromParentTi === toParentTi && fromSi < toSi) insertIndex -= 1;
  if (placement === 'after') insertIndex += 1;
  insertIndex = Math.max(0, Math.min(getTopicEntry(mi, toParentTi).subtopics.length, insertIndex));

  const nextTargetTopic = getTopicEntry(mi, toParentTi);
  const targetSubtopics = [...nextTargetTopic.subtopics];
  targetSubtopics.splice(insertIndex, 0, movedTitle);
  store.MODULES[mi].topics[toParentTi] = Object.assign({}, nextTargetTopic, { subtopics: targetSubtopics, collapsed: false });
  stateSnapshot[toParentTi].subs.splice(insertIndex, 0, movedDone);

  [fromParentTi, toParentTi].forEach((topicIndex) => {
    const entry = stateSnapshot[topicIndex];
    if (!entry) return;
    entry.main = entry.subs.length > 0 && entry.subs.every(Boolean);
  });

  applyModuleTopicStateSnapshot(mi, stateSnapshot);
  refreshTopicStructure(mi);
}

export function moveSubtopicToParent(mi, fromParentTi, fromSi, toParentTi) {
  const topics = store.MODULES[mi]?.topics;
  if (!topics) return;
  const sourceTopic = getTopicEntry(mi, fromParentTi);
  const targetTopic = getTopicEntry(mi, toParentTi);
  if (!sourceTopic?.subtopics?.[fromSi] || !targetTopic) return;

  const stateSnapshot = getModuleTopicStateSnapshot(mi);
  const movedTitle = sourceTopic.subtopics[fromSi];
  const movedDone = !!stateSnapshot[fromParentTi]?.subs?.[fromSi];

  store.MODULES[mi].topics[fromParentTi] = Object.assign({}, sourceTopic, {
    subtopics: sourceTopic.subtopics.filter((_, index) => index !== fromSi),
  });
  stateSnapshot[fromParentTi].subs.splice(fromSi, 1);

  const refreshedTarget = getTopicEntry(mi, toParentTi);
  store.MODULES[mi].topics[toParentTi] = Object.assign({}, refreshedTarget, {
    subtopics: [...refreshedTarget.subtopics, movedTitle],
    collapsed: false,
  });
  stateSnapshot[toParentTi].subs.push(movedDone);

  [fromParentTi, toParentTi].forEach((topicIndex) => {
    const entry = stateSnapshot[topicIndex];
    if (!entry) return;
    entry.main = entry.subs.length > 0 && entry.subs.every(Boolean);
  });

  applyModuleTopicStateSnapshot(mi, stateSnapshot);
  refreshTopicStructure(mi);
}

export function promoteSubtopicToMain(mi, fromParentTi, fromSi, toTopicIndex, placement = 'before') {
  const topics = store.MODULES[mi]?.topics;
  if (!topics) return;
  const sourceTopic = getTopicEntry(mi, fromParentTi);
  if (!sourceTopic?.subtopics?.[fromSi]) return;

  const stateSnapshot = getModuleTopicStateSnapshot(mi);
  const movedTitle = sourceTopic.subtopics[fromSi];
  const movedDone = !!stateSnapshot[fromParentTi]?.subs?.[fromSi];

  store.MODULES[mi].topics[fromParentTi] = Object.assign({}, sourceTopic, {
    subtopics: sourceTopic.subtopics.filter((_, index) => index !== fromSi),
  });
  stateSnapshot[fromParentTi].subs.splice(fromSi, 1);

  let insertIndex = toTopicIndex;
  if (placement === 'after') insertIndex += 1;
  insertIndex = Math.max(0, Math.min(store.MODULES[mi].topics.length, insertIndex));

  store.MODULES[mi].topics.splice(insertIndex, 0, { title: movedTitle, subtopics: [], collapsed: false });
  stateSnapshot.splice(insertIndex, 0, { main: movedDone, subs: [] });

  const entry = stateSnapshot[fromParentTi];
  if (entry) entry.main = entry.subs.length > 0 && entry.subs.every(Boolean);

  applyModuleTopicStateSnapshot(mi, stateSnapshot);
  refreshTopicStructure(mi);
}

export function toggleTopicSubtopics(mi, ti, event) {
  if (event) event.stopPropagation();
  const topic = getTopicEntry(mi, ti);
  store.MODULES[mi].topics[ti] = Object.assign({}, topic, { collapsed: !topic.collapsed });
  const row = event?.target?.closest?.('.topic-row');
  const subtopicList = row?.nextElementSibling;
  const toggle = row?.querySelector?.('.subtopic-toggle');
  if (subtopicList?.classList?.contains('subtopic-list')) {
    subtopicList.classList.toggle('hidden', store.MODULES[mi].topics[ti].collapsed);
  }
  if (toggle) {
    toggle.classList.toggle('collapsed', store.MODULES[mi].topics[ti].collapsed);
    toggle.setAttribute('aria-label', store.MODULES[mi].topics[ti].collapsed ? 'Expand subtopics' : 'Collapse subtopics');
    toggle.title = store.MODULES[mi].topics[ti].collapsed ? 'Expand subtopics' : 'Collapse subtopics';
  }
  save();
}

export async function editTopicInModule(mi, ti, event) {
  if (event) {
    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
  }
  setTopicDropSuppressUntil(Date.now() + 450);

  const topic = getTopicEntry(mi, ti);
  if (!topic) return;
  const result = await appPrompt({ label: 'Topic', title: 'Edit topic', inputLabel: 'Topic name', defaultValue: topic.title, confirmText: 'Save' });
  const updated = result?.value;
  if (updated === undefined || updated === null || !updated.trim()) {
    setTopicDropSuppressUntil(Date.now() + 250);
    return;
  }

  const nextTitle = updated.trim();
  store.MODULES[mi].topics[ti] = Object.assign({}, topic, { title: nextTitle });

  const row = document.querySelector(`[data-topic-key="${topicSelectionKey(mi, ti)}"]`);
  const label = row?.querySelector('.topic-label');
  if (label) label.textContent = nextTitle;

  save();
  updateModule(mi);
  updateGlobal();
  setTopicDropSuppressUntil(Date.now() + 250);
}

export async function editSubtopicInModule(mi, ti, si, event) {
  if (event) {
    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
  }
  setTopicDropSuppressUntil(Date.now() + 450);

  const topic = getTopicEntry(mi, ti);
  const current = topic.subtopics?.[si];
  if (!current) return;
  const result = await appPrompt({ label: 'Subtopic', title: 'Edit subtopic', inputLabel: 'Subtopic name', defaultValue: current, confirmText: 'Save' });
  const updated = result?.value;
  if (updated === undefined || updated === null || !updated.trim()) {
    setTopicDropSuppressUntil(Date.now() + 250);
    return;
  }

  const nextTitle = updated.trim();
  const subtopics = [...topic.subtopics];
  subtopics[si] = nextTitle;
  store.MODULES[mi].topics[ti] = Object.assign({}, topic, { subtopics });

  const row = document.querySelector(`[data-topic-key="${topicSelectionKey(mi, ti, si)}"]`);
  const label = row?.querySelector('.topic-label');
  if (label) label.textContent = nextTitle;

  save();
  updateModule(mi);
  updateGlobal();
  setTopicDropSuppressUntil(Date.now() + 250);
}

export async function deleteSelectedTopicsInModule(mi, event) {
  if (event) event.stopPropagation();
  const selectedTopicKeys = getSelectedTopicKeys();
  const selected = [...selectedTopicKeys]
    .map(parseTopicSelectionKey)
    .filter((entry) => entry?.mi === mi)
    .sort((a, b) => {
      if (a.ti !== b.ti) return b.ti - a.ti;
      const aDepth = a.kind === 'sub' ? 1 : 0;
      const bDepth = b.kind === 'sub' ? 1 : 0;
      if (aDepth !== bDepth) return bDepth - aDepth;
      return (b.si || 0) - (a.si || 0);
    });
  if (!selected.length) return;

  const confirmed = await appConfirm({
    label: 'Delete Topics',
    title: selected.length === 1 ? 'Delete selected topic?' : `Delete ${selected.length} selected topics?`,
    message: selected.length === 1 ? 'This selection will be removed.' : 'These selected topics will be removed together.',
    confirmText: selected.length === 1 ? 'Delete Topic' : 'Delete Topics',
    danger: true,
  });
  if (!confirmed) return;

  selected.forEach((entry) => {
    if (entry.kind === 'sub') {
      removeSubtopicFromModule(mi, entry.ti, entry.si);
    } else {
      store.MODULES[mi].topics.splice(entry.ti, 1);
      const ys = getStore();
      const nextTopics = {};
      Object.keys(ys.topics).forEach((key) => {
        const mainMatch = /^t_(\d+)_(\d+)$/.exec(key);
        if (mainMatch) {
          const moduleIndex = Number(mainMatch[1]);
          const topicIndex = Number(mainMatch[2]);
          if (moduleIndex !== mi) { nextTopics[key] = ys.topics[key]; return; }
          if (topicIndex < entry.ti) nextTopics[key] = ys.topics[key];
          if (topicIndex > entry.ti) nextTopics[`t_${mi}_${topicIndex - 1}`] = ys.topics[key];
          return;
        }
        const subMatch = /^s_(\d+)_(\d+)_(\d+)$/.exec(key);
        if (!subMatch) { nextTopics[key] = ys.topics[key]; return; }
        const moduleIndex = Number(subMatch[1]);
        const topicIndex = Number(subMatch[2]);
        const subIndex = Number(subMatch[3]);
        if (moduleIndex !== mi) { nextTopics[key] = ys.topics[key]; return; }
        if (topicIndex < entry.ti) nextTopics[key] = ys.topics[key];
        if (topicIndex > entry.ti) nextTopics[`s_${mi}_${topicIndex - 1}_${subIndex}`] = ys.topics[key];
      });
      ys.topics = nextTopics;
    }
  });

  clearTopicSelection(mi);
  openModules.add(mi);
  setModuleSectionOpen(mi, 'topics', true);
  refreshTopicStructure(mi);
}

export async function deleteCourseworkComponent(mi, ci, event) {
  if (event) event.stopPropagation();
  const components = getCourseworkComponents(mi);
  if (!components[ci]) return;
  const confirmed = await appConfirm({ label: 'Coursework', title: 'Delete coursework component?', message: components[ci].name || 'This component will be removed.', confirmText: 'Delete', danger: true });
  if (!confirmed) return;
  components.splice(ci, 1);
  save();
  buildModules();
  updateGlobal();
}

export async function removeExam(index) {
  const ys = getStore();
  if (!ys.customExams[index]) return;
  const confirmed = await appConfirm({ label: 'Deadline', title: 'Remove deadline?', message: ys.customExams[index].mod || 'This deadline will be removed.', confirmText: 'Remove', danger: true });
  if (!confirmed) return;
  ys.customExams.splice(index, 1);
  save();
  renderStickyExams();
  renderDeadlineTimeline();
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────────

document.addEventListener('keydown', (event) => {
  const activeTag = document.activeElement?.tagName;
  const canUseHistoryKeys = activeTag !== 'INPUT' && activeTag !== 'TEXTAREA' && !document.activeElement?.isContentEditable;
  if ((event.ctrlKey || event.metaKey) && canUseHistoryKeys) {
    const key = event.key.toLowerCase();
    if (event.shiftKey && key === 'z') {
      event.preventDefault();
      redoLastAction();
      return;
    }
    if (!event.shiftKey && key === 'z') {
      event.preventDefault();
      undoLastAction();
      return;
    }
  }
  handleSelectedTopicDeleteFromKeyboard(event);
});
