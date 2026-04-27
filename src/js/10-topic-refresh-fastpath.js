/* Fast topic checkbox refresh helpers and deadline splash helpers */

  const topic = getTopicEntry(mi, ti);

  checkbox.checked = value;

  if (value) store.topics[topicKey(mi, ti)] = true;
  else delete store.topics[topicKey(mi, ti)];

  topic.subtopics.forEach((_, si) => {
    if (value) store.topics[subtopicKey(mi, ti, si)] = true;
    else delete store.topics[subtopicKey(mi, ti, si)];
  });

  const label = checkbox.parentElement.querySelector(".topic-label");
  if (label) label.className = "topic-label" + (value ? " done" : "");
  const subtopicList = checkbox.closest(".topic-row")?.nextElementSibling;
  if (subtopicList?.classList?.contains("subtopic-list")) {
    subtopicList.querySelectorAll('input[type="checkbox"]').forEach((node) => { node.checked = value; });
    subtopicList.querySelectorAll(".topic-label").forEach((node) => {
      node.className = "topic-label" + (value ? " done" : "");
    });
  }

  save();
  updateModule(mi);
  updateGlobal();
}

function setSubtopicCheckbox(mi, ti, si, value) {
  const store = getStore();
  const subKey = subtopicKey(mi, ti, si);
  const parentKey = topicKey(mi, ti);
  const topic = getTopicEntry(mi, ti);
  if (!topic?.subtopics?.[si]) return;

  if (value) store.topics[subKey] = true;
  else delete store.topics[subKey];

  const allDone = topic.subtopics.length > 0 && topic.subtopics.every((_, index) => !!store.topics[subtopicKey(mi, ti, index)]);
  if (allDone) store.topics[parentKey] = true;
  else delete store.topics[parentKey];

  const subRow = document.querySelector(`[data-topic-key="${topicSelectionKey(mi, ti, si)}"]`);
  const subCheckbox = subRow?.querySelector('input[type="checkbox"]');
  const subLabel = subRow?.querySelector(".topic-label");
  if (subCheckbox) subCheckbox.checked = value;
  if (subLabel) subLabel.className = "topic-label" + (value ? " done" : "");

  const parentRow = document.querySelector(`[data-topic-key="${topicSelectionKey(mi, ti)}"]`);
  const parentCheckbox = parentRow?.querySelector('input[type="checkbox"]');
  const parentLabel = parentRow?.querySelector(".topic-label");
  if (parentCheckbox) parentCheckbox.checked = allDone;
  if (parentLabel) parentLabel.className = "topic-label" + (allDone ? " done" : "");

  save();
  updateModule(mi);
  updateGlobal();
}

function refreshTopicStructure(mi) {
  const modulesContainer = document.getElementById("modules");
  const scrollYBeforeRefresh = window.scrollY;
  const stableHeight = modulesContainer?.offsetHeight || 0;

  if (Number.isInteger(mi)) openModules.add(mi);
  document.body.classList.add("suppress-topic-refresh");
  if (modulesContainer && stableHeight) modulesContainer.style.minHeight = `${stableHeight}px`;

  save();
  buildModules();
  updateGlobal();
  window.scrollTo(0, scrollYBeforeRefresh);

  requestAnimationFrame(() => {
    window.scrollTo(0, scrollYBeforeRefresh);
    requestAnimationFrame(() => {
      if (modulesContainer) modulesContainer.style.minHeight = "";
      document.body.classList.remove("suppress-topic-refresh");
    });
  });
}

function startTopicDrag(checkbox) {
  isDraggingTopics = true;
  dragTopicValue = checkbox.checked;
}

function dragOverTopic(checkbox, mi, ti) {
  if (!isDraggingTopics) return;
  setTopicCheckbox(checkbox, mi, ti, dragTopicValue);
}

function stopTopicDrag() {
  isDraggingTopics = false;
  dragTopicValue = null;
}

function getNearestUpcomingDeadline() {
  const store = getStore();
  const exams = (store.customExams || []).filter((exam) => !exam.completed);
  const now = Date.now();

  return exams
    .filter(exam => new Date(exam.date).getTime() > now)
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0] || null;
}

function restoreDeadlineSplashCard() {
  const splash = document.getElementById("deadline-splash");
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

function showDeadlineSplash(options = {}) {
  const upcoming = getNearestUpcomingDeadline();
  if (!upcoming) return false;

  if (!options.force && deadlineSplashShownThisLoad) return false;

  const splash = restoreDeadlineSplashCard();
  if (!splash) return false;

  const titleEl = document.getElementById("deadline-splash-title");
  const timeEl = document.getElementById("deadline-splash-time");
  if (!titleEl || !timeEl) return false;

  titleEl.textContent = upcoming.mod || "Upcoming deadline";

  function updateSplashTimer() {
    timeEl.textContent = formatCountdown(upcoming.date);
  }

  updateSplashTimer();

  clearInterval(deadlineSplashInterval);
  deadlineSplashInterval = setInterval(updateSplashTimer, 1000);

  deadlineSplashShownThisLoad = true;
  splash.classList.remove("hidden");
  return true;
}

function closeDeadlineSplash() {
  document.getElementById("deadline-splash").classList.add("hidden");

  if (deadlineSplashInterval) {
    clearInterval(deadlineSplashInterval);
    deadlineSplashInterval = null;
  }
}

function renderBackgroundPicker() {
  const picker = document.getElementById("bg-picker");
  if (!picker) return;

  const allBackgrounds = { ...HERO_BACKGROUNDS, ...(preferences.customBackgrounds || {}) };

  picker.innerHTML = Object.entries(allBackgrounds).map(([key, url]) => `
    <div class="bg-thumb-wrap">
      <button 
        class="bg-thumb ${preferences.hero === key ? "active" : ""}"
        style="background-image: url('${url}')"
        onclick="setPreference('hero', '${key}'); renderBackgroundPicker();"
        title="${key}">
      </button>

      ${key.startsWith("custom_") ? `
        <button class="bg-delete-btn" onclick="deleteCustomBackground('${key}')">X</button>
      ` : ""}
    </div>
  `).join("");
}

const KEY = "course_progress_tracker_v1";
const PREFS_KEY = "course_progress_prefs_v1";
