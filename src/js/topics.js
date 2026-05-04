/**
 * Topic checkboxes, drag-paint, deadline splash, and background picker.
 */

import { store } from './store.js';
import { safeImageUrl } from './utils.js';
import { HERO_BACKGROUNDS } from './config.js';
import {
  getStore, getTopicEntry, topicKey, subtopicKey, topicSelectionKey, save,
} from './state.js';

// ── Module-local state ─────────────────────────────────────────────────────

export const openModules = new Set();

let isDraggingTopics = false;
let dragTopicValue = null;

let deadlineSplashInterval = null;

// Shared drag/drop state accessed by both years.js and rendering.js
let draggedTopicStartX = 0;
let topicDropSuppressUntil = 0;

export function getDraggedTopicStartX() { return draggedTopicStartX; }
export function setDraggedTopicStartX(v) { draggedTopicStartX = v; }
export function getTopicDropSuppressUntil() { return topicDropSuppressUntil; }
export function setTopicDropSuppressUntil(v) { topicDropSuppressUntil = v; }
export function beginTopicMouseDownDrag(toggleValue) { isDraggingTopics = true; dragTopicValue = toggleValue; }
export function isTopicDragging() { return isDraggingTopics; }
export function getTopicDragValue() { return dragTopicValue; }

// ── Topic checkboxes ───────────────────────────────────────────────────────

export function setTopicCheckbox(checkbox, mi, ti, value) {
  const ys = getStore();
  const topic = getTopicEntry(mi, ti);

  checkbox.checked = value;

  if (value) ys.topics[topicKey(mi, ti)] = true;
  else delete ys.topics[topicKey(mi, ti)];

  topic.subtopics.forEach((_, si) => {
    if (value) ys.topics[subtopicKey(mi, ti, si)] = true;
    else delete ys.topics[subtopicKey(mi, ti, si)];
  });

  const label = checkbox.parentElement.querySelector('.topic-label');
  if (label) label.className = 'topic-label' + (value ? ' done' : '');
  const subtopicList = checkbox.closest('.topic-row')?.nextElementSibling;
  if (subtopicList?.classList?.contains('subtopic-list')) {
    subtopicList.querySelectorAll('input[type="checkbox"]').forEach((node) => { node.checked = value; });
    subtopicList.querySelectorAll('.topic-label').forEach((node) => {
      node.className = 'topic-label' + (value ? ' done' : '');
    });
  }

  save();
  window.updateModule?.(mi);
  window.updateGlobal?.();
}

export function setSubtopicCheckbox(mi, ti, si, value) {
  const ys = getStore();
  const subKey = subtopicKey(mi, ti, si);
  const parentKey = topicKey(mi, ti);
  const topic = getTopicEntry(mi, ti);
  if (!topic?.subtopics?.[si]) return;

  if (value) ys.topics[subKey] = true;
  else delete ys.topics[subKey];

  const allDone = topic.subtopics.length > 0
    && topic.subtopics.every((_, index) => !!ys.topics[subtopicKey(mi, ti, index)]);
  if (allDone) ys.topics[parentKey] = true;
  else delete ys.topics[parentKey];

  const subRow = document.querySelector(`[data-topic-key="${topicSelectionKey(mi, ti, si)}"]`);
  const subCheckbox = subRow?.querySelector('input[type="checkbox"]');
  const subLabel = subRow?.querySelector('.topic-label');
  if (subCheckbox) subCheckbox.checked = value;
  if (subLabel) subLabel.className = 'topic-label' + (value ? ' done' : '');

  const parentRow = document.querySelector(`[data-topic-key="${topicSelectionKey(mi, ti)}"]`);
  const parentCheckbox = parentRow?.querySelector('input[type="checkbox"]');
  const parentLabel = parentRow?.querySelector('.topic-label');
  if (parentCheckbox) parentCheckbox.checked = allDone;
  if (parentLabel) parentLabel.className = 'topic-label' + (allDone ? ' done' : '');

  save();
  window.updateModule?.(mi);
  window.updateGlobal?.();
}

export function refreshTopicStructure(mi) {
  const modulesContainer = document.getElementById('modules');
  const scrollYBeforeRefresh = window.scrollY;
  const stableHeight = modulesContainer?.offsetHeight || 0;

  if (Number.isInteger(mi)) openModules.add(mi);
  document.body.classList.add('suppress-topic-refresh');
  if (modulesContainer && stableHeight) modulesContainer.style.minHeight = `${stableHeight}px`;

  save();
  window.buildModules?.();
  window.updateGlobal?.();
  window.scrollTo(0, scrollYBeforeRefresh);

  requestAnimationFrame(() => {
    window.scrollTo(0, scrollYBeforeRefresh);
    requestAnimationFrame(() => {
      if (modulesContainer) modulesContainer.style.minHeight = '';
      document.body.classList.remove('suppress-topic-refresh');
    });
  });
}

// ── Drag-paint topics ──────────────────────────────────────────────────────

export function startTopicDrag(checkbox) {
  isDraggingTopics = true;
  dragTopicValue = checkbox.checked;
}

export function dragOverTopic(checkbox, mi, ti) {
  if (!isDraggingTopics) return;
  setTopicCheckbox(checkbox, mi, ti, dragTopicValue);
}

export function stopTopicDrag() {
  isDraggingTopics = false;
  dragTopicValue = null;
}

// ── Deadline splash ────────────────────────────────────────────────────────

export function getNearestUpcomingDeadline() {
  const ys = getStore();
  const exams = (ys.customExams || []).filter((exam) => !exam.completed);
  const now = Date.now();
  return exams
    .filter((exam) => new Date(exam.date).getTime() > now)
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0] || null;
}

function restoreDeadlineSplashCard() {
  const splash = document.getElementById('deadline-splash');
  if (!splash) return null;
  splash.innerHTML = `
    <div class="deadline-splash-card">
      <button class="deadline-splash-close" type="button" onclick="closeDeadlineSplash()">X</button>
      <div class="deadline-splash-label">Nearest Deadline</div>
      <div id="deadline-splash-title" class="deadline-splash-title"></div>
      <div id="deadline-splash-time" class="deadline-splash-time"></div>
    </div>
  `;
  return splash;
}

export function showDeadlineSplash(options = {}) {
  const upcoming = getNearestUpcomingDeadline();
  if (!upcoming) return false;
  if (!options.force && store.deadlineSplashShownThisLoad) return false;
  const splash = restoreDeadlineSplashCard();
  if (!splash) return false;
  const titleEl = document.getElementById('deadline-splash-title');
  const timeEl = document.getElementById('deadline-splash-time');
  if (!titleEl || !timeEl) return false;
  titleEl.textContent = upcoming.mod || 'Upcoming deadline';
  function updateSplashTimer() {
    timeEl.textContent = window.formatCountdown?.(upcoming.date) || '';
  }
  updateSplashTimer();
  clearInterval(deadlineSplashInterval);
  deadlineSplashInterval = setInterval(updateSplashTimer, 1000);
  store.deadlineSplashShownThisLoad = true;
  splash.classList.remove('hidden');
  return true;
}

export function closeDeadlineSplash() {
  document.getElementById('deadline-splash').classList.add('hidden');
  if (deadlineSplashInterval) {
    clearInterval(deadlineSplashInterval);
    deadlineSplashInterval = null;
  }
}

// ── Background picker ──────────────────────────────────────────────────────

export function renderBackgroundPicker() {
  const picker = document.getElementById('bg-picker');
  if (!picker) return;
  const prefs = store.preferences;
  const allBackgrounds = { ...HERO_BACKGROUNDS, ...(prefs.customBackgrounds || {}) };
  const escHtml = window.escapeHtml || ((s) => s);
  picker.innerHTML = Object.entries(allBackgrounds).map(([key, url]) => `
    <div class="bg-thumb-wrap">
      <button
        class="bg-thumb ${prefs.hero === key ? 'active' : ''}"
        style="background-image: url('${safeImageUrl(url)}')"
        onclick="setPreference('hero', '${key}'); renderBackgroundPicker();"
        title="${escHtml(key)}"
      ></button>
      ${key.startsWith('custom_') ? `<button class="bg-delete-btn" onclick="deleteCustomBackground('${key}')">X</button>` : ''}
    </div>
  `).join('');
}

export function deleteCustomBackground(key) {
  const prefs = store.preferences;
  if (prefs.customBackgrounds) delete prefs.customBackgrounds[key];
  if (prefs.hero === key) prefs.hero = '';
  window.savePreferences?.();
  window.applyPreferences?.();
}
