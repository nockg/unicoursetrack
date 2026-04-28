/* ===== Professional in-app dialog helpers + prompt/confirm replacements ===== */
let appDialogResolver = null;
let appDialogMode = "confirm";
let appDialogRequireYes = false;

function openAppDialog(options = {}) {
  const modal = document.getElementById("app-dialog-modal");
  if (!modal) return Promise.resolve(null);

  const label = document.getElementById("app-dialog-label");
  const title = document.getElementById("app-dialog-title");
  const message = document.getElementById("app-dialog-message");
  const field = document.getElementById("app-dialog-field");
  const input = document.getElementById("app-dialog-input");
  const inputLabel = document.getElementById("app-dialog-input-label");
  const checkWrap = document.getElementById("app-dialog-check-wrap");
  const check = document.getElementById("app-dialog-check");
  const checkLabel = document.getElementById("app-dialog-check-label");
  const confirmBtn = document.getElementById("app-dialog-confirm");
  const cancelBtn = document.getElementById("app-dialog-cancel");

  appDialogMode = options.mode || "confirm";
  appDialogRequireYes = !!options.requireYes;

  if (label) label.textContent = options.label || (options.danger ? "Delete" : "Confirm");
  if (title) title.textContent = options.title || "Are you sure?";
  if (message) message.textContent = options.message || "";

  const needsInput = appDialogMode === "prompt";
  if (field) field.classList.toggle("hidden", !needsInput);
  if (inputLabel) inputLabel.textContent = options.inputLabel || "Value";
  if (input) {
    input.value = options.defaultValue || "";
    input.placeholder = options.placeholder || "";
  }

  if (checkWrap) checkWrap.classList.toggle("hidden", !options.checkboxLabel);
  if (checkLabel) checkLabel.textContent = options.checkboxLabel || "";
  if (check) check.checked = !!options.checkboxDefault;

  if (confirmBtn) {
    confirmBtn.textContent = options.confirmText || (options.danger ? "Delete" : "Continue");
    confirmBtn.classList.toggle("danger-action", !!options.danger);
  }
  if (cancelBtn) cancelBtn.textContent = options.cancelText || "Cancel";

  modal.classList.remove("hidden");
  setTimeout(() => {
    if (needsInput && input) {
      input.focus();
      input.select();
    } else if (confirmBtn) {
      confirmBtn.focus();
    }
  }, 0);

  return new Promise(resolve => {
    appDialogResolver = resolve;
  });
}

function resolveAppDialog(confirmed) {
  const modal = document.getElementById("app-dialog-modal");
  const input = document.getElementById("app-dialog-input");
  const check = document.getElementById("app-dialog-check");
  if (modal) modal.classList.add("hidden");

  if (!appDialogResolver) return;
  const resolver = appDialogResolver;
  appDialogResolver = null;

  if (!confirmed) {
    resolver(null);
    return;
  }

  if (appDialogMode === "prompt") {
    resolver({ value: input?.value || "", checked: !!check?.checked });
    return;
  }

  resolver(true);
}

document.addEventListener("keydown", (event) => {
  const modal = document.getElementById("app-dialog-modal");
  if (!modal || modal.classList.contains("hidden")) return;
  if (event.key === "Escape") resolveAppDialog(false);
  if (event.key === "Enter" && !event.shiftKey) resolveAppDialog(true);
});

async function appConfirm({ title, message, label = "Confirm", confirmText = "Continue", danger = false, requireYes = false } = {}) {
  const result = await openAppDialog({ mode: "confirm", title, message, label, confirmText, danger, requireYes });
  return result === true;
}

async function appPrompt({ title, message, label = "Input", inputLabel = "Value", defaultValue = "", placeholder = "", confirmText = "Save", checkboxLabel = "", checkboxDefault = false } = {}) {
  const result = await openAppDialog({ mode: "prompt", title, message, label, inputLabel, defaultValue, placeholder, confirmText, checkboxLabel, checkboxDefault });
  if (!result) return null;
  return result;
}

function showAppNotice(title, message = "") {
  return openAppDialog({ mode: "confirm", label: "Notice", title, message, confirmText: "Okay", cancelText: "Close" });
}

async function deleteCustomBackground(key) {
  if (!preferences.customBackgrounds || !preferences.customBackgrounds[key]) return;
  const confirmed = await appConfirm({
    label: "Background",
    title: "Delete custom background?",
    message: "This removes the saved background from this tracker.",
    confirmText: "Delete",
    danger: true
  });
  if (!confirmed) return;
  delete preferences.customBackgrounds[key];
  if (preferences.hero === key) preferences.hero = "bg1";
  savePreferences();
  applyPreferences();
}

async function loadAeroTemplate() {
  const currentYear = getCurrentYear();
  if (!currentYear) return;
  if (currentYear.store.modules.length) {
    const replace = await appConfirm({
      label: "Template",
      title: "Replace current modules?",
      message: "This will replace the current year's modules with the Year 1 Aerospace Engineering template.",
      confirmText: "Replace",
      danger: true
    });
    if (!replace) return;
  }
  currentYear.store = createYearStore(BASE_MODULES);
  if (!state.profile.course || state.profile.course === "Course" || state.profile.course === "Your Course") state.profile.course = "Aerospace Engineering";
  if (!state.profile.university || state.profile.university === "University") state.profile.university = "University of Sheffield";
  if (!state.setup) state.setup = {};
  state.setup.templateChoiceMade = true;
  refreshActiveYear();
  save();
  document.getElementById("template-splash").classList.add("hidden");
  renderYearSelector();
  buildModules();
  renderStickyExams();
  updateGlobal();
}

async function clearModuleMarks(mi, event) {
  if (event) event.stopPropagation();
  const store = getStore();
  const mod = MODULES[mi];
  if (!mod) return;
  const confirmed = await appConfirm({
    label: "Marks",
    title: "Clear marks?",
    message: `Clear coursework and exam marks for ${mod.kanji || mod.name}?`,
    confirmText: "Clear",
    danger: true
  });
  if (!confirmed) return;
  delete store.coursework[mi];
  delete store.exams[mi];
  if (store.courseworkComponents) delete store.courseworkComponents[mi];
  save();
  buildModules();
  updateGlobal();
}

async function clearTrackerStorage() {
  const confirmClear = await appConfirm({
    label: "Reset Tracker",
    title: "Reset everything?",
    message: "This will reset progress, marks, notes, links, and cloud saves for this account.",
    confirmText: "Reset",
    danger: true
  });
  if (!confirmClear) return;
  clearTimeout(cloudSaveTimer);
  cloudReady = false;
  cloudHadSave = false;
  cloudLoadSucceeded = false;
  const blankState = createInitialState();
  const blankPrefs = { ...DEFAULT_PREFERENCES };
  if (currentUser) {
    try {
      await withCloudTimeout(saveTrackerProfileToApi(blankState, blankPrefs), "Cloud reset");
    } catch (error) {
      await showAppNotice("Could not clear cloud storage", error?.message || "Cloud reset failed.");
      cloudReady = true;
      return;
    }
  }
  clearLocalTrackerStorage();
  state = blankState;
  Object.keys(preferences).forEach((key) => delete preferences[key]);
  Object.assign(preferences, blankPrefs);
  localStorage.setItem(KEY, JSON.stringify(state));
  localStorage.setItem(PREFS_KEY, JSON.stringify(preferences));
  ensureYearsState();
  refreshActiveYear();
  syncUndoBaseline();
  applyPreferences();
  renderYearSelector();
  buildModules();
  renderStickyExams();
  updateGlobal();
  await showAppNotice("Tracker reset", "Local and cloud tracker data were cleared successfully.");
  if (currentUser) setupCourseIfNeeded();
}

function renderYearSelector() {
  const select = document.getElementById("year-select");
  if (!select) return;
  const currentYear = getCurrentYear();
  const yearOptions = Object.values(state.years)
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
    .map((year) => `<option value="${escapeHtml(year.id)}">${escapeHtml(year.label)}${year.store.archived ? " (Archived)" : ""}</option>`);
  const actionOptions = [
    '<option value="__new__">+ New Year</option>',
    `<option value="__archive__">${currentYear.store.archived ? "Unarchive Current Year" : "Archive Current Year"}</option>`,
    '<option value="__delete__">Delete Current Year</option>'
  ];
  select.innerHTML = yearOptions.join("") + actionOptions.join("");
  select.value = state.ui.currentYearId;
  const profile = Object.assign({}, defaultProfile, state.profile || {});
  const yearNumber = parseInt(currentYear.label.match(/\d+/)?.[0] || "1", 10);
  const profileStartYear = parseInt(profile.startYear, 10);
  const startYear = (Number.isFinite(profileStartYear) ? profileStartYear : new Date().getFullYear()) + (yearNumber - 1);
  const endYear = startYear + 1;
  const userName = (profile.name || "").trim();
  const university = profile.university || "University";
  const course = profile.course || "Course";
  const eyebrow = document.getElementById("hero-eyebrow");
  if (eyebrow) eyebrow.textContent = userName
    ? `${userName} - ${university} - ${currentYear.label} - ${startYear}-${String(endYear).slice(2)}`
    : `${university} - ${currentYear.label} - ${startYear}-${String(endYear).slice(2)}`;
  const title = document.getElementById("hero-title");
  if (title) title.textContent = `Year ${yearNumber} ${course}`;
  const footer = document.getElementById("footer-label");
  if (footer) footer.textContent = `${university} ${currentYear.label} - Progress Tracker`;
  document.title = `${course} ${currentYear.label} Tracker`;
}

async function deleteCurrentYear() {
  const year = getCurrentYear();
  if (!year) return;
  if (Object.keys(state.years).length === 1) {
    await showAppNotice("Cannot delete year", "You need at least one year in the tracker.");
    return;
  }
  const confirmed = await appConfirm({
    label: "Delete Year",
    title: `Delete ${year.label}?`,
    message: "This removes the year, its modules, marks, topics, and deadlines from this tracker.",
    confirmText: "Delete Year",
    danger: true
  });
  if (!confirmed) return;
  delete state.years[year.id];
  state.ui.currentYearId = Object.keys(state.years)[0];
  refreshActiveYear();
  save();
  renderYearSelector();
  buildModules();
  renderStickyExams();
  updateGlobal();
}

async function createNewYear() {
  const nextNumber = Object.keys(state.years).length + 1;
  const result = await appPrompt({
    label: "New Year",
    title: "Add a new academic year",
    message: "Name the year. You can start blank or copy the current year's modules.",
    inputLabel: "Year name",
    defaultValue: `Year ${nextNumber}`,
    placeholder: "Year 2",
    confirmText: "Create Year",
    checkboxLabel: "Use current year's modules as a starting template",
    checkboxDefault: false
  });
  if (!result || !result.value.trim()) return;
  const label = result.value.trim().replace(/^Y(\d+)\b/i, "Year $1");
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `year-${Date.now()}`;
  if (state.years[id]) {
    await showAppNotice("Year already exists", "Choose a different year name.");
    return;
  }
  state.years[id] = { id, label, store: createYearStore(result.checked ? MODULES : []) };
  state.ui.currentYearId = id;
  refreshActiveYear();
  save();
  renderYearSelector();
  buildModules();
  renderStickyExams();
  updateGlobal();
}

async function deleteModuleFromCurrentYear(mi, event) {
  if (event) event.stopPropagation();
  const mod = MODULES[mi];
  if (!mod) return;
  const confirmed = await appConfirm({ label: "Delete Module", title: `Delete ${mod.kanji || mod.short || mod.name}?`, message: "This removes the module, its topics, marks, notes, and links.", confirmText: "Delete Module", danger: true });
  if (!confirmed) return;
  const store = getStore();
  MODULES.splice(mi, 1);
  store.topics = shiftTopicsAfterModuleDelete(store.topics, mi);
  store.coursework = shiftIndexedObjectAfterDelete(store.coursework, mi);
  store.courseworkComponents = shiftIndexedObjectAfterDelete(store.courseworkComponents, mi);
  store.exams = shiftIndexedObjectAfterDelete(store.exams, mi);
  store.notes = shiftIndexedObjectAfterDelete(store.notes, mi);
  store.blackboard = shiftIndexedObjectAfterDelete(store.blackboard, mi);
  store.formulas = shiftIndexedObjectAfterDelete(store.formulas, mi);
  store.relevantLinks = shiftIndexedObjectAfterDelete(store.relevantLinks, mi);
  store.moduleColors = shiftModuleColourMapAfterDelete(store.moduleColors, mi);
  save();
  refreshActiveYear();
  buildModules();
  renderStickyExams();
  updateGlobal();
}

async function editModuleTitle(mi, event) {
  if (event) event.stopPropagation();
  const mod = MODULES[mi];
  if (!mod) return;
  const result = await appPrompt({ label: "Module", title: "Edit module title", inputLabel: "Module title", defaultValue: mod.name || "", confirmText: "Save" });
  const title = result?.value;
  if (title === undefined || title === null || !title.trim()) return;
  mod.name = title.trim();
  if (!mod.short || mod.short === mod.kanji) mod.short = title.trim();
  save();
  buildModules();
  updateGlobal();
}

async function editModuleCode(mi, event) {
  if (event) event.stopPropagation();
  const mod = MODULES[mi];
  if (!mod) return;
  const previousCode = mod.kanji || "";
  const result = await appPrompt({ label: "Module", title: "Edit module code", inputLabel: "Module code", defaultValue: previousCode, confirmText: "Save" });
  const code = result?.value;
  if (code === undefined || code === null || !code.trim()) return;
  mod.kanji = code.trim().toUpperCase();
  if (!mod.short || mod.short === previousCode) mod.short = mod.kanji;
  save();
  buildModules();
  updateGlobal();
}

async function addTopicToModule(mi, event) {
  if (event) {
    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
  }
  const draftInput = document.getElementById(`topic-add-${mi}`);
  let input = draftInput ? draftInput.value : "";
  if (!input) {
    const result = await appPrompt({ label: "Topic", title: "Add topic", message: 'For multiple topics, wrap each one in quotes: "Topic 1" "Topic 2"', inputLabel: "Topic name", defaultValue: "", confirmText: "Add Topic" });
    input = result?.value || "";
  }
  if (!input || !input.trim()) return;
  const quotedTopics = [...input.matchAll(/"([^"]+)"/g)].map(match => match[1].trim()).filter(Boolean);
  const topicsToAdd = quotedTopics.length ? quotedTopics : [input.trim()];
  MODULES[mi].topics.push(...topicsToAdd.map((title) => ({ title, subtopics: [], collapsed: false })));
  if (draftInput) draftInput.value = "";
  openModules.add(mi);
  openModuleSections[getModuleSectionStateKey(mi, "topics")] = true;
  refreshTopicStructure(mi);
}

async function addSubtopicToTopic(mi, ti, event) {
  if (event) {
    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
  }
  const topic = getTopicEntry(mi, ti);
  const result = await appPrompt({
    label: "Subtopics",
    title: `Add subtopics under ${topic.title}`,
    message: 'Add one subtopic, or wrap several in quotes: "Definition" "Worked Example" "Past Paper"',
    inputLabel: "Subtopics",
    placeholder: '"Definition" "Worked Example"',
    confirmText: "Add Subtopics"
  });
  const values = parseQuotedList(result?.value || "");
  if (!values.length) return;
  MODULES[mi].topics[ti] = Object.assign({}, topic, { subtopics: [...topic.subtopics, ...values], collapsed: false });
  openModules.add(mi);
  openModuleSections[getModuleSectionStateKey(mi, "topics")] = true;
  refreshTopicStructure(mi);
}

function removeSubtopicFromModule(mi, ti, si) {
  const store = getStore();
  const topic = getTopicEntry(mi, ti);
  if (!topic.subtopics[si]) return;
  MODULES[mi].topics[ti] = Object.assign({}, topic, {
    subtopics: topic.subtopics.filter((_, index) => index !== si)
  });

  const nextTopics = {};
  Object.keys(store.topics).forEach((key) => {
    const match = /^s_(\d+)_(\d+)_(\d+)$/.exec(key);
    if (!match) {
      nextTopics[key] = store.topics[key];
      return;
    }
    const moduleIndex = Number(match[1]);
    const topicIndex = Number(match[2]);
    const subIndex = Number(match[3]);
    if (moduleIndex !== mi || topicIndex !== ti) {
      nextTopics[key] = store.topics[key];
      return;
    }
    if (subIndex < si) nextTopics[key] = store.topics[key];
    if (subIndex > si) nextTopics[`s_${mi}_${ti}_${subIndex - 1}`] = store.topics[key];
  });
  const nextTopic = getTopicEntry(mi, ti);
  const allDone = nextTopic.subtopics.length > 0 && nextTopic.subtopics.every((_, index) => !!nextTopics[subtopicKey(mi, ti, index)]);
  if (allDone) nextTopics[topicKey(mi, ti)] = true;
  else delete nextTopics[topicKey(mi, ti)];
  store.topics = nextTopics;
}

function moveSubtopicInModule(mi, fromParentTi, fromSi, toParentTi, toSi, placement = "before") {
  const topics = MODULES[mi]?.topics;
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
  MODULES[mi].topics[fromParentTi] = Object.assign({}, sourceTopic, { subtopics: sourceSubtopics });
  stateSnapshot[fromParentTi].subs.splice(fromSi, 1);

  let insertIndex = toSi;
  if (fromParentTi === toParentTi && fromSi < toSi) insertIndex -= 1;
  if (placement === "after") insertIndex += 1;
  insertIndex = Math.max(0, Math.min(getTopicEntry(mi, toParentTi).subtopics.length, insertIndex));

  const nextTargetTopic = getTopicEntry(mi, toParentTi);
  const targetSubtopics = [...nextTargetTopic.subtopics];
  targetSubtopics.splice(insertIndex, 0, movedTitle);
  MODULES[mi].topics[toParentTi] = Object.assign({}, nextTargetTopic, { subtopics: targetSubtopics, collapsed: false });
  stateSnapshot[toParentTi].subs.splice(insertIndex, 0, movedDone);

  [fromParentTi, toParentTi].forEach((topicIndex) => {
    const entry = stateSnapshot[topicIndex];
    if (!entry) return;
    entry.main = entry.subs.length > 0 && entry.subs.every(Boolean);
  });

  applyModuleTopicStateSnapshot(mi, stateSnapshot);
  refreshTopicStructure(mi);
}

function moveSubtopicToParent(mi, fromParentTi, fromSi, toParentTi) {
  const topics = MODULES[mi]?.topics;
  if (!topics) return;
  const sourceTopic = getTopicEntry(mi, fromParentTi);
  const targetTopic = getTopicEntry(mi, toParentTi);
  if (!sourceTopic?.subtopics?.[fromSi] || !targetTopic) return;

  const stateSnapshot = getModuleTopicStateSnapshot(mi);
  const movedTitle = sourceTopic.subtopics[fromSi];
  const movedDone = !!stateSnapshot[fromParentTi]?.subs?.[fromSi];

  MODULES[mi].topics[fromParentTi] = Object.assign({}, sourceTopic, {
    subtopics: sourceTopic.subtopics.filter((_, index) => index !== fromSi)
  });
  stateSnapshot[fromParentTi].subs.splice(fromSi, 1);

  const refreshedTarget = getTopicEntry(mi, toParentTi);
  MODULES[mi].topics[toParentTi] = Object.assign({}, refreshedTarget, {
    subtopics: [...refreshedTarget.subtopics, movedTitle],
    collapsed: false
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

function promoteSubtopicToMain(mi, fromParentTi, fromSi, toTopicIndex, placement = "before") {
  const topics = MODULES[mi]?.topics;
  if (!topics) return;
  const sourceTopic = getTopicEntry(mi, fromParentTi);
  if (!sourceTopic?.subtopics?.[fromSi]) return;

  const stateSnapshot = getModuleTopicStateSnapshot(mi);
  const movedTitle = sourceTopic.subtopics[fromSi];
  const movedDone = !!stateSnapshot[fromParentTi]?.subs?.[fromSi];

  MODULES[mi].topics[fromParentTi] = Object.assign({}, sourceTopic, {
    subtopics: sourceTopic.subtopics.filter((_, index) => index !== fromSi)
  });
  stateSnapshot[fromParentTi].subs.splice(fromSi, 1);

  let insertIndex = toTopicIndex;
  if (placement === "after") insertIndex += 1;
  insertIndex = Math.max(0, Math.min(MODULES[mi].topics.length, insertIndex));

  MODULES[mi].topics.splice(insertIndex, 0, { title: movedTitle, subtopics: [], collapsed: false });
  stateSnapshot.splice(insertIndex, 0, { main: movedDone, subs: [] });

  const entry = stateSnapshot[fromParentTi];
  if (entry) entry.main = entry.subs.length > 0 && entry.subs.every(Boolean);

  applyModuleTopicStateSnapshot(mi, stateSnapshot);
  refreshTopicStructure(mi);
}

function toggleTopicSubtopics(mi, ti, event) {
  if (event) event.stopPropagation();
  const topic = getTopicEntry(mi, ti);
  MODULES[mi].topics[ti] = Object.assign({}, topic, { collapsed: !topic.collapsed });
  const row = event?.target?.closest?.(".topic-row");
  const subtopicList = row?.nextElementSibling;
  const toggle = row?.querySelector?.(".subtopic-toggle");
  if (subtopicList?.classList?.contains("subtopic-list")) {
    subtopicList.classList.toggle("hidden", MODULES[mi].topics[ti].collapsed);
  }
  if (toggle) {
    toggle.classList.toggle("collapsed", MODULES[mi].topics[ti].collapsed);
    toggle.setAttribute("aria-label", MODULES[mi].topics[ti].collapsed ? "Expand subtopics" : "Collapse subtopics");
    toggle.title = MODULES[mi].topics[ti].collapsed ? "Expand subtopics" : "Collapse subtopics";
  }
  save();
}

async function editTopicInModule(mi, ti, event) {
  if (event) {
    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
  }
  topicDropSuppressUntil = Date.now() + 450;

  const topic = getTopicEntry(mi, ti);
  if (!topic) return;
  const result = await appPrompt({ label: "Topic", title: "Edit topic", inputLabel: "Topic name", defaultValue: topic.title, confirmText: "Save" });
  const updated = result?.value;
  if (updated === undefined || updated === null || !updated.trim()) {
    topicDropSuppressUntil = Date.now() + 250;
    return;
  }

  const nextTitle = updated.trim();
  MODULES[mi].topics[ti] = Object.assign({}, topic, { title: nextTitle });

  const row = document.querySelector(`[data-topic-key="${topicSelectionKey(mi, ti)}"]`);
  const label = row?.querySelector(".topic-label");
  if (label) label.textContent = nextTitle;

  save();
  updateModule(mi);
  updateGlobal();
  topicDropSuppressUntil = Date.now() + 250;
}

async function editSubtopicInModule(mi, ti, si, event) {
  if (event) {
    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
  }
  topicDropSuppressUntil = Date.now() + 450;

  const topic = getTopicEntry(mi, ti);
  const current = topic.subtopics?.[si];
  if (!current) return;
  const result = await appPrompt({ label: "Subtopic", title: "Edit subtopic", inputLabel: "Subtopic name", defaultValue: current, confirmText: "Save" });
  const updated = result?.value;
  if (updated === undefined || updated === null || !updated.trim()) {
    topicDropSuppressUntil = Date.now() + 250;
    return;
  }

  const nextTitle = updated.trim();
  const subtopics = [...topic.subtopics];
  subtopics[si] = nextTitle;
  MODULES[mi].topics[ti] = Object.assign({}, topic, { subtopics });

  const row = document.querySelector(`[data-topic-key="${topicSelectionKey(mi, ti, si)}"]`);
  const label = row?.querySelector(".topic-label");
  if (label) label.textContent = nextTitle;

  save();
  updateModule(mi);
  updateGlobal();
  topicDropSuppressUntil = Date.now() + 250;
}

async function deleteSelectedTopicsInModule(mi, event) {
  if (event) event.stopPropagation();
  const selected = [...selectedTopicKeys]
    .map(parseTopicSelectionKey)
    .filter((entry) => entry?.mi === mi)
    .sort((a, b) => {
      if (a.ti !== b.ti) return b.ti - a.ti;
      const aDepth = a.kind === "sub" ? 1 : 0;
      const bDepth = b.kind === "sub" ? 1 : 0;
      if (aDepth !== bDepth) return bDepth - aDepth;
      return (b.si || 0) - (a.si || 0);
    });
  if (!selected.length) return;

  const confirmed = await appConfirm({
    label: "Delete Topics",
    title: selected.length === 1 ? "Delete selected topic?" : `Delete ${selected.length} selected topics?`,
    message: selected.length === 1 ? "This selection will be removed." : "These selected topics will be removed together.",
    confirmText: selected.length === 1 ? "Delete Topic" : "Delete Topics",
    danger: true
  });
  if (!confirmed) return;

  selected.forEach((entry) => {
    if (entry.kind === "sub") {
      removeSubtopicFromModule(mi, entry.ti, entry.si);
    } else {
      MODULES[mi].topics.splice(entry.ti, 1);
      const store = getStore();
      const nextTopics = {};
      Object.keys(store.topics).forEach((key) => {
        const mainMatch = /^t_(\d+)_(\d+)$/.exec(key);
        if (mainMatch) {
          const moduleIndex = Number(mainMatch[1]);
          const topicIndex = Number(mainMatch[2]);
          if (moduleIndex !== mi) { nextTopics[key] = store.topics[key]; return; }
          if (topicIndex < entry.ti) nextTopics[key] = store.topics[key];
          if (topicIndex > entry.ti) nextTopics[`t_${mi}_${topicIndex - 1}`] = store.topics[key];
          return;
        }
        const subMatch = /^s_(\d+)_(\d+)_(\d+)$/.exec(key);
        if (!subMatch) { nextTopics[key] = store.topics[key]; return; }
        const moduleIndex = Number(subMatch[1]);
        const topicIndex = Number(subMatch[2]);
        const subIndex = Number(subMatch[3]);
        if (moduleIndex !== mi) { nextTopics[key] = store.topics[key]; return; }
        if (topicIndex < entry.ti) nextTopics[key] = store.topics[key];
        if (topicIndex > entry.ti) nextTopics[`s_${mi}_${topicIndex - 1}_${subIndex}`] = store.topics[key];
      });
      store.topics = nextTopics;
    }
  });

  clearTopicSelection(mi);
  openModules.add(mi);
  openModuleSections[getModuleSectionStateKey(mi, "topics")] = true;
  refreshTopicStructure(mi);
}

async function deleteCourseworkComponent(mi, ci, event) {
  if (event) event.stopPropagation();
  const components = getCourseworkComponents(mi);
  if (!components[ci]) return;
  const confirmed = await appConfirm({ label: "Coursework", title: "Delete coursework component?", message: components[ci].name || "This component will be removed.", confirmText: "Delete", danger: true });
  if (!confirmed) return;
  components.splice(ci, 1);
  save();
  buildModules();
  updateGlobal();
}

async function removeExam(index) {
  const store = getStore();
  if (!store.customExams[index]) return;
  const confirmed = await appConfirm({ label: "Deadline", title: "Remove deadline?", message: store.customExams[index].mod || "This deadline will be removed.", confirmText: "Remove", danger: true });
  if (!confirmed) return;
  store.customExams.splice(index, 1);
  save();
  renderStickyExams();
  renderDeadlineTimeline();
}

document.addEventListener("keydown", (event) => {
  const activeTag = document.activeElement?.tagName;
  const canUseHistoryKeys = activeTag !== "INPUT" && activeTag !== "TEXTAREA" && !document.activeElement?.isContentEditable;
  if ((event.ctrlKey || event.metaKey) && canUseHistoryKeys) {
    const key = event.key.toLowerCase();
    if (event.shiftKey && key === "z") {
      event.preventDefault();
      redoLastAction();
      return;
    }
    if (!event.shiftKey && key === "z") {
      event.preventDefault();
      undoLastAction();
      return;
    }
  }
  handleSelectedTopicDeleteFromKeyboard(event);
});
