function handleYearDropdown(value) {
  if (value === "__new__") return createNewYear();
  if (value === "__archive__") return archiveCurrentYear();
  if (value === "__delete__") return deleteCurrentYear();
  const parts = String(value || "").split(":");
  if (parts[0] === "year" && parts[1]) return switchYear(parts[1], "all");
  if (parts[0] === "term" && parts[1] && parts[2]) return switchYear(parts[1], parts[2]);
  switchYear(value, "all");
}

function switchYear(yearId, term = "all") {
  if (!state.years[yearId]) return;
  state.ui.currentYearId = yearId;
  state.ui.currentTermFilter = isKnownTermValue(term, state.years[yearId].store) ? term : "all";
  refreshActiveYear();
  save();
  renderYearSelector();
  buildModules();
  renderStickyExams();
  updateGlobal();
}

function archiveCurrentYear() {
  const year = getCurrentYear();
  if (!year || year.id === "year1" && year.store.archived) return;
  year.store.archived = !year.store.archived;
  save();
  renderYearSelector();
}

function addModuleToCurrentYear() {
  const code = document.getElementById("module-code-input");
  const name = document.getElementById("module-name-input");
  const term = document.getElementById("module-term-input");
  const credits = document.getElementById("module-credits-input");
  const cw = document.getElementById("module-cw-input");
  const exam = document.getElementById("module-exam-input");
  const blackboard = document.getElementById("module-blackboard-input");
  const optionsFields = document.getElementById("module-options-fields");
  const colourField = document.getElementById("module-colour-field");
  editingModuleIndex = null;
  if (code) code.value = "NEW201";
  if (name) name.value = "New Module";
  if (term) term.value = getActiveTermFilter() !== "all" ? getActiveTermFilter() : "sem1";
  if (credits) credits.value = "15";
  if (cw) cw.value = "50";
  if (exam) exam.value = "50";
  if (blackboard) blackboard.value = "";
  if (optionsFields) optionsFields.classList.add("hidden");
  if (colourField) colourField.classList.add("hidden");
  updateModuleFormForGradingSystem();
  populateModuleTermSelect();
  if (getGradingSystem() === "uk") syncModuleWeightInputs("cw");
  const title = document.querySelector("#module-form-modal .dashboard-title");
  const saveBtn = document.querySelector("#module-form-modal .deadline-form-actions .nav-btn:last-child");
  if (title) title.textContent = "Add Module";
  if (saveBtn) saveBtn.textContent = "Add Module";
  document.getElementById("module-form-modal").classList.remove("hidden");
  setTimeout(() => code && code.focus(), 0);
}

function closeModuleForm() {
  document.getElementById("module-form-modal").classList.add("hidden");
  editingModuleIndex = null;
}

function formatWeightInputValue(value) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function syncModuleWeightInputs(source = "cw") {
  const cwInput = document.getElementById("module-cw-input");
  const examInput = document.getElementById("module-exam-input");
  if (!cwInput || !examInput) return;
  if (source === "cw") {
    const cw = parseFloat(cwInput.value || "");
    if (!Number.isFinite(cw)) return;
    const safeCw = Math.min(100, Math.max(0, cw));
    if (safeCw !== cw) cwInput.value = formatWeightInputValue(safeCw);
    examInput.value = formatWeightInputValue(100 - safeCw);
    return;
  }
  const exam = parseFloat(examInput.value || "");
  if (!Number.isFinite(exam)) return;
  const safeExam = Math.min(100, Math.max(0, exam));
  if (safeExam !== exam) examInput.value = formatWeightInputValue(safeExam);
  cwInput.value = formatWeightInputValue(100 - safeExam);
}

function updateModuleFormForGradingSystem() {
  const ukMode = getGradingSystem() === "uk";
  const creditsLabel = document.getElementById("module-credits-label");
  const cwInput = document.getElementById("module-cw-input");
  const examInput = document.getElementById("module-exam-input");
  const cwField = cwInput?.closest(".field");
  const examField = examInput?.closest(".field");
  if (creditsLabel) creditsLabel.textContent = getModuleCreditFieldLabel();
  if (cwField) cwField.classList.toggle("hidden", !ukMode);
  if (examField) examField.classList.toggle("hidden", !ukMode);
  populateModuleTermSelect();
}

function populateModuleTermSelect(selected = null) {
  const termSelect = document.getElementById("module-term-input");
  if (!termSelect) return;
  const currentValue = selected || termSelect.value || getActiveTermFilter();
  const options = getCurrentTermOptions();
  termSelect.innerHTML = options.map((option) => (
    `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`
  )).join("") + `<option value="__new__">+ Add Semester</option>`;
  termSelect.value = options.some((option) => option.value === currentValue) ? currentValue : (getActiveTermFilter() !== "all" ? getActiveTermFilter() : "sem1");
}

async function handleModuleTermChange(select) {
  if (!select || select.value !== "__new__") return;
  const store = getStore();
  const suggestion = createNextTermOption(store);
  const result = await appPrompt({
    label: "Semester",
    title: "Add Teaching Period",
    message: "Add another semester or teaching block for rare courses with more than three periods in one academic year.",
    inputLabel: "Name",
    defaultValue: suggestion.label,
    placeholder: "Semester 4",
    confirmText: "Add Semester"
  });
  const label = String(result?.value || "").trim();
  if (!label) {
    populateModuleTermSelect();
    return;
  }
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || suggestion.value;
  let value = /^semester\s*(\d+)$/i.test(label) ? `sem${label.match(/\d+/)[0]}` : base;
  const existing = getCurrentTermOptions(store);
  let suffix = 2;
  const original = value;
  while (existing.some((option) => option.value === value)) {
    value = `${original}-${suffix}`;
    suffix += 1;
  }
  store.termOptions = uniqueTermOptions([...existing, { value, label }]);
  save();
  populateModuleTermSelect(value);
  renderYearSelector();
}

document.getElementById("module-term-input")?.addEventListener("change", (event) => handleModuleTermChange(event.target));

document.getElementById("module-cw-input")?.addEventListener("input", () => syncModuleWeightInputs("cw"));
document.getElementById("module-exam-input")?.addEventListener("input", () => syncModuleWeightInputs("exam"));
document.getElementById("module-colour-input")?.addEventListener("input", (event) => {
  const preview = document.getElementById("module-colour-preview");
  if (preview) preview.style.background = event.target.value;
});

function parseQuotedList(input) {
  const text = String(input || "").trim();
  if (!text) return [];
  const quoted = [...text.matchAll(/"([^"]+)"/g)].map((match) => match[1].trim()).filter(Boolean);
  return quoted.length ? quoted : text.split(/\s*,\s*|\n+/).map((item) => item.trim()).filter(Boolean);
}

function editModuleWeights(mi, event) {
  if (event) event.stopPropagation();
  const mod = MODULES[mi];
  if (!mod) return;
  editingModuleIndex = mi;
  const code = document.getElementById("module-code-input");
  const name = document.getElementById("module-name-input");
  const term = document.getElementById("module-term-input");
  const credits = document.getElementById("module-credits-input");
  const cw = document.getElementById("module-cw-input");
  const exam = document.getElementById("module-exam-input");
  const blackboard = document.getElementById("module-blackboard-input");
  const colourField = document.getElementById("module-colour-field");
  const colourInput = document.getElementById("module-colour-input");
  const colourPreview = document.getElementById("module-colour-preview");
  const optionsFields = document.getElementById("module-options-fields");
  if (code) code.value = mod.kanji || "";
  if (name) name.value = mod.name || "";
  if (term) term.value = getModuleTerm(mi);
  if (credits) credits.value = mod.credits ?? 15;
  if (cw) cw.value = mod.cw ?? 0;
  if (exam) exam.value = mod.exam ?? 0;
  if (blackboard) blackboard.value = getBlackboardLink(mi) || "";
  updateModuleFormForGradingSystem();
  populateModuleTermSelect(getModuleTerm(mi));
  if (optionsFields) optionsFields.classList.remove("hidden");
  if (colourField) colourField.classList.toggle("hidden", !isColourCustomisableTheme());
  if (colourInput) colourInput.value = getStoredModuleColourHex(mi);
  if (colourPreview) colourPreview.style.background = getModuleColourSet(mi).fill;
  if (getGradingSystem() === "uk") syncModuleWeightInputs("cw");
  const title = document.querySelector("#module-form-modal .dashboard-title");
  const saveBtn = document.querySelector("#module-form-modal .deadline-form-actions .nav-btn:last-child");
  if (title) title.textContent = "Module Options";
  if (saveBtn) saveBtn.textContent = "Save Module";
  document.getElementById("module-form-modal").classList.remove("hidden");
}

function saveModuleForm() {
  const codeInput = document.getElementById("module-code-input");
  const nameInput = document.getElementById("module-name-input");
  const termInput = document.getElementById("module-term-input");
  const creditsInput = document.getElementById("module-credits-input");
  const cwInput = document.getElementById("module-cw-input");
  const examInput = document.getElementById("module-exam-input");
  const blackboardInput = document.getElementById("module-blackboard-input");
  const colourInput = document.getElementById("module-colour-input");
  const code = (codeInput.value || "").trim();
  const name = (nameInput.value || "").trim();
  if (!code || !name) {
    alert("Please enter both module code and module name.");
    return;
  }
  const credits = parseFloat(creditsInput.value || "");
  let courseworkWeight = parseFloat(cwInput.value || "");
  let examWeight = parseFloat(examInput.value || "");
  if (getGradingSystem() !== "uk") {
    courseworkWeight = 0;
    examWeight = 100;
  }
  if (Number.isFinite(courseworkWeight) && courseworkWeight >= 100) examWeight = 0;
  if (Number.isFinite(examWeight) && examWeight >= 100) courseworkWeight = 0;
  const moduleData = {
    name,
    kanji: code.toUpperCase(),
    short: code.toUpperCase(),
    term: normalizeTermValue(termInput?.value || "sem1"),
    credits: Number.isFinite(credits) ? credits : 15,
    cw: Number.isFinite(courseworkWeight) ? courseworkWeight : 50,
    exam: Number.isFinite(examWeight) ? examWeight : 50,
    topics: []
  };
  if (editingModuleIndex !== null && MODULES[editingModuleIndex]) {
    const existing = MODULES[editingModuleIndex];
    MODULES[editingModuleIndex] = Object.assign({}, existing, moduleData, { topics: existing.topics || [] });
  } else {
    MODULES.push(moduleData);
  }
  const targetIndex = editingModuleIndex !== null ? editingModuleIndex : MODULES.length - 1;
  if (editingModuleIndex !== null) {
    const blackboardUrl = (blackboardInput?.value || "").trim();
    const store = getStore();
    if (blackboardUrl) store.blackboard[targetIndex] = safeUrl(blackboardUrl);
    else delete store.blackboard[targetIndex];
    if (isColourCustomisableTheme() && colourInput?.value) {
      if (!store.moduleColors) store.moduleColors = {};
      const family = preferences.theme === "dark" ? "dark" : "light";
      const current = store.moduleColors[targetIndex] || {};
      store.moduleColors[targetIndex] = Object.assign({}, current, { [family]: normaliseHexColour(colourInput.value) });
    }
  }
  save();
  refreshActiveYear();
  buildModules();
  updateGlobal();
  closeModuleForm();
}

function shiftIndexedObjectAfterDelete(object, deletedIndex) {
  if (!object) return {};
  const shifted = {};
  Object.entries(object).forEach(([key, value]) => {
    const index = parseInt(key, 10);
    if (!Number.isFinite(index) || index === deletedIndex) return;
    shifted[index > deletedIndex ? index - 1 : index] = value;
  });
  return shifted;
}

function shiftTopicsAfterModuleDelete(topics, deletedIndex) {
  const shifted = {};
  Object.entries(topics || {}).forEach(([key, value]) => {
    const topicMatch = key.match(/^t_(\d+)_(\d+)$/);
    if (topicMatch) {
      const moduleIndex = parseInt(topicMatch[1], 10);
      const topicIndex = topicMatch[2];
      if (moduleIndex === deletedIndex) return;
      const nextModuleIndex = moduleIndex > deletedIndex ? moduleIndex - 1 : moduleIndex;
      shifted[`t_${nextModuleIndex}_${topicIndex}`] = value;
      return;
    }
    const subtopicMatch = key.match(/^s_(\d+)_(\d+)_(\d+)$/);
    if (!subtopicMatch) return;
    const moduleIndex = parseInt(subtopicMatch[1], 10);
    const topicIndex = subtopicMatch[2];
    const subIndex = subtopicMatch[3];
    if (moduleIndex === deletedIndex) return;
    const nextModuleIndex = moduleIndex > deletedIndex ? moduleIndex - 1 : moduleIndex;
    shifted[`s_${nextModuleIndex}_${topicIndex}_${subIndex}`] = value;
  });
  return shifted;
}

function addCourseworkComponent(mi, event) {
  if (event) event.stopPropagation();
  courseworkFormModuleIndex = mi;
  const nameInput = document.getElementById("cw-component-name-input");
  const markInput = document.getElementById("cw-component-mark-input");
  const weightInput = document.getElementById("cw-component-weight-input");
  const gradeScale = getGradeScaleConfig();
  if (nameInput) nameInput.value = "";
  if (markInput) {
    markInput.value = "";
    markInput.max = String(gradeScale.max);
    markInput.step = gradeScale.step;
    markInput.placeholder = gradeScale.placeholder;
  }
  if (weightInput) weightInput.value = "";
  const markLabel = document.querySelector('label[for="cw-component-mark-input"]');
  if (markLabel) markLabel.textContent = gradeScale.markLabel;
  document.getElementById("coursework-component-modal").classList.remove("hidden");
  setTimeout(() => nameInput && nameInput.focus(), 0);
}

function closeCourseworkComponentForm() {
  document.getElementById("coursework-component-modal").classList.add("hidden");
  courseworkFormModuleIndex = null;
}

function saveCourseworkComponentForm() {
  const mi = courseworkFormModuleIndex;
  if (mi === null || mi === undefined || !MODULES[mi]) return;
  const nameInput = document.getElementById("cw-component-name-input");
  const markInput = document.getElementById("cw-component-mark-input");
  const weightInput = document.getElementById("cw-component-weight-input");
  const input = (nameInput?.value || "").trim();
  if (!input) {
    alert("Please enter a coursework component name.");
    return;
  }

  const quotedComponents = [...input.matchAll(/"([^"]+)"/g)]
    .map(match => match[1].trim())
    .filter(Boolean);

  const namesToAdd = quotedComponents.length ? quotedComponents : [input];
  const mark = markInput?.value || "";
  const weight = weightInput?.value || "";
  const components = getCourseworkComponents(mi);

  namesToAdd.forEach((name) => {
    components.push({ name, mark, weight });
  });

  const calculated = calculateCourseworkFromComponents(mi);
  if (calculated.mark !== null) {
    getStore().coursework[mi] = formatGradeInputValue(calculated.mark);
  }

  save();
  buildModules();
  updateGlobal();
  closeCourseworkComponentForm();
}

function updateCourseworkComponent(mi, ci, field, value) {
  const components = getCourseworkComponents(mi);
  if (!components[ci]) return;
  components[ci][field] = value;
  const calculated = calculateCourseworkFromComponents(mi);
  if (calculated.mark !== null) {
    getStore().coursework[mi] = formatGradeInputValue(calculated.mark);
    const cwInput = document.getElementById(`cw-${mi}`);
    const compactCw = document.querySelector(`#topics-${mi} .compact-cw`);
    if (cwInput) cwInput.value = formatGradeInputValue(calculated.mark);
    if (compactCw) compactCw.value = formatGradeInputValue(calculated.mark);
  }
  save();
  updateModule(mi);
  updateGlobal();
  updateCourseworkSummary(mi);
}

function updateCourseworkSummary(mi) {
  const summary = document.getElementById(`cw-calc-summary-${mi}`);
  if (!summary) return;
  const calculated = calculateCourseworkFromComponents(mi);
  const manual = parseMark(getStore().coursework[mi]);

  if (calculated.mark !== null) {
    summary.textContent = `Calculated coursework: ${formatSelectedGrade(calculated.mark).main} - Components override manual coursework input`;
    return;
  }

  if (manual !== null) {
    summary.textContent = `Manual coursework override: ${formatSelectedGrade(manual).main}`;
    return;
  }

  summary.textContent = `Enter an overall coursework mark above, or let this calculator build it from your assessments.`;
}

function commitCourseworkPlaceholder(mi, event) {
  if (event) event.stopPropagation();
  const host = document.getElementById(`cw-components-${mi}`);
  if (!host) return;
  const name = host.querySelector(".cw-placeholder-name")?.value || "";
  const mark = host.querySelector(".cw-placeholder-mark")?.value || "";
  const weight = host.querySelector(".cw-placeholder-weight")?.value || "";
  if (!name.trim() && !mark && !weight) return;
  const items = getCourseworkComponents(mi);
  items.push({ name, mark, weight });
  getStore().courseworkComponents[mi] = items;
  const calculated = calculateCourseworkFromComponents(mi);
  if (calculated.mark !== null) getStore().coursework[mi] = formatGradeInputValue(calculated.mark);
  save();
  buildModules();
  updateGlobal();
}

function addBlankCourseworkComponent(mi, event) {
  if (event) event.stopPropagation();
  const items = getCourseworkComponents(mi);
  items.push({ name: "", mark: "", weight: "" });
  getStore().courseworkComponents[mi] = items;
  save();
  buildModules();
  updateGlobal();
}


function remapTopicStateForReorder(mi, fromIndex, toIndex) {
  const checked = getModuleTopicStateSnapshot(mi);
  const [moved] = checked.splice(fromIndex, 1);
  checked.splice(toIndex, 0, moved);
  applyModuleTopicStateSnapshot(mi, checked);
}

function moveTopicInModule(mi, fromIndex, toIndex, placement = "before") {
  const topics = MODULES[mi]?.topics;
  if (!topics || fromIndex < 0 || toIndex < 0 || fromIndex >= topics.length || toIndex >= topics.length) return;
  if (fromIndex === toIndex && placement === "before") return;
  const [moved] = topics.splice(fromIndex, 1);
  let insertIndex = toIndex;
  if (fromIndex < toIndex) insertIndex -= 1;
  if (placement === "after") insertIndex += 1;
  insertIndex = Math.max(0, Math.min(topics.length, insertIndex));
  topics.splice(insertIndex, 0, moved);
  remapTopicStateForReorder(mi, fromIndex, insertIndex);
  refreshTopicStructure(mi);
}

async function nestTopicUnderTopic(mi, sourceIndex, parentIndex) {
  const topics = MODULES[mi]?.topics;
  if (!topics || sourceIndex === parentIndex || sourceIndex < 0 || parentIndex < 0 || sourceIndex >= topics.length || parentIndex >= topics.length) return;
  const sourceTopic = getTopicEntry(mi, sourceIndex);
  if (sourceTopic.subtopics.length) {
    await showAppNotice("Drag a simpler topic", "Only plain topics can be nested right now. Move or clear that topic's own subtopics first.");
    return;
  }

  const stateSnapshot = getModuleTopicStateSnapshot(mi);
  const sourceState = stateSnapshot[sourceIndex];
  const [movedTopic] = topics.splice(sourceIndex, 1);
  stateSnapshot.splice(sourceIndex, 1);

  let nextParentIndex = parentIndex;
  if (sourceIndex < parentIndex) nextParentIndex -= 1;

  const parentTopic = getTopicEntry(mi, nextParentIndex);
  topics[nextParentIndex] = Object.assign({}, parentTopic, {
    subtopics: [...parentTopic.subtopics, movedTopic.title],
    collapsed: false
  });

  const parentState = stateSnapshot[nextParentIndex] || { main: false, subs: [] };
  parentState.subs = [...parentState.subs, !!sourceState?.main];
  parentState.main = parentState.main && parentState.subs.every(Boolean);
  stateSnapshot[nextParentIndex] = parentState;

  applyModuleTopicStateSnapshot(mi, stateSnapshot);
  refreshTopicStructure(mi);
}

function startTopicReorder(mi, ti, event, si = null) {
  draggedTopic = { kind: si === null ? "main" : "sub", mi, ti, si, startX: draggedTopicStartX || event.clientX || 0 };
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", `${mi}:${ti}:${si === null ? "main" : si}`);
}

function allowTopicDrop(mi, ti, event) {
  if (!draggedTopic || draggedTopic.mi !== mi) return;
  event.preventDefault();
  const indentDelta = (event.clientX || 0) - (draggedTopic.startX || 0);
  const rect = event.currentTarget.getBoundingClientRect();
  const dropAfter = (event.clientY || rect.top) > rect.top + (rect.height / 2);
  if (draggedTopic.kind === "sub") {
    document.querySelectorAll(".topic-row.drop-before, .topic-row.drop-after, .topic-row.drop-subtopic").forEach((row) => {
      if (row !== event.currentTarget) row.classList.remove("drop-before", "drop-after", "drop-subtopic");
    });
    event.currentTarget.classList.remove("reordering", "drop-before", "drop-after", "drop-subtopic");
    if (indentDelta > 34) event.currentTarget.classList.add("drop-subtopic");
    else event.currentTarget.classList.add(dropAfter ? "drop-after" : "drop-before");
    return;
  }
  const canNestBeforeTarget = indentDelta > 34 && !dropAfter && ti > 0;
  const canNestInPlace = indentDelta > 34 && draggedTopic.ti === ti && ti > 0;
  const canNestAfterParent = indentDelta > 34 && dropAfter && draggedTopic.ti !== ti;
  document.querySelectorAll(".topic-row.drop-before, .topic-row.drop-after, .topic-row.drop-subtopic").forEach((row) => {
    if (row !== event.currentTarget) row.classList.remove("drop-before", "drop-after", "drop-subtopic");
  });
  event.currentTarget.classList.remove("reordering", "drop-before", "drop-after", "drop-subtopic");
  if (canNestBeforeTarget || canNestInPlace || canNestAfterParent) {
    event.currentTarget.classList.add("drop-subtopic");
  } else {
    event.currentTarget.classList.add(dropAfter ? "drop-after" : "drop-before");
  }
}

function clearTopicDropState(event) {
  event.currentTarget.classList.remove("reordering", "drop-before", "drop-after", "drop-subtopic");
}

function dropTopicReorder(mi, ti, event) {
  event.preventDefault();
  topicDropSuppressUntil = Date.now() + 650;
  event.currentTarget.classList.remove("reordering", "drop-before", "drop-after", "drop-subtopic");
  if (!draggedTopic || draggedTopic.mi !== mi) return;
  const indentDelta = (event.clientX || 0) - (draggedTopic.startX || 0);
  const rect = event.currentTarget.getBoundingClientRect();
  const dropAfter = (event.clientY || rect.top) > rect.top + (rect.height / 2);
  if (draggedTopic.kind === "sub") {
    if (indentDelta > 34) moveSubtopicToParent(mi, draggedTopic.ti, draggedTopic.si, ti);
    else promoteSubtopicToMain(mi, draggedTopic.ti, draggedTopic.si, ti, dropAfter ? "after" : "before");
    draggedTopic = null;
    draggedTopicStartX = 0;
    return;
  }
  const canNestBeforeTarget = indentDelta > 34 && !dropAfter && ti > 0;
  const canNestInPlace = indentDelta > 34 && draggedTopic.ti === ti && ti > 0;
  const canNestAfterParent = indentDelta > 34 && dropAfter && draggedTopic.ti !== ti;
  if (canNestBeforeTarget || canNestInPlace || canNestAfterParent) {
    const parentIndex = canNestAfterParent ? ti : ti - 1;
    nestTopicUnderTopic(mi, draggedTopic.ti, parentIndex);
    draggedTopic = null;
    draggedTopicStartX = 0;
    return;
  }
  moveTopicInModule(mi, draggedTopic.ti, ti, dropAfter ? "after" : "before");
  draggedTopic = null;
  draggedTopicStartX = 0;
}

function endTopicReorder() {
  topicDropSuppressUntil = Math.max(topicDropSuppressUntil, Date.now() + 250);
  draggedTopic = null;
  draggedTopicStartX = 0;
  document.querySelectorAll(".topic-row.reordering, .topic-row.drop-before, .topic-row.drop-after, .topic-row.drop-subtopic").forEach((row) => row.classList.remove("reordering", "drop-before", "drop-after", "drop-subtopic"));
}

function allowSubtopicDrop(mi, parentTi, si, event) {
  if (!draggedTopic || draggedTopic.mi !== mi) return;
  if (draggedTopic.kind === "sub" && draggedTopic.ti === parentTi && draggedTopic.si === si) return;
  event.preventDefault();
  const rect = event.currentTarget.getBoundingClientRect();
  const dropAfter = (event.clientY || rect.top) > rect.top + (rect.height / 2);
  document.querySelectorAll(".topic-row.drop-before, .topic-row.drop-after, .topic-row.drop-subtopic").forEach((row) => {
    if (row !== event.currentTarget) row.classList.remove("drop-before", "drop-after", "drop-subtopic");
  });
  event.currentTarget.classList.remove("reordering", "drop-before", "drop-after", "drop-subtopic");
  if (draggedTopic.kind === "sub") {
    event.currentTarget.classList.add(dropAfter ? "drop-after" : "drop-before");
  }
}

function dropSubtopicReorder(mi, parentTi, si, event) {
  event.preventDefault();
  topicDropSuppressUntil = Date.now() + 650;
  event.currentTarget.classList.remove("reordering", "drop-before", "drop-after", "drop-subtopic");
  if (!draggedTopic || draggedTopic.mi !== mi) return;
  const rect = event.currentTarget.getBoundingClientRect();
  const dropAfter = (event.clientY || rect.top) > rect.top + (rect.height / 2);
  if (draggedTopic.kind === "sub") {
    moveSubtopicInModule(mi, draggedTopic.ti, draggedTopic.si, parentTi, si, dropAfter ? "after" : "before");
  }
  draggedTopic = null;
  draggedTopicStartX = 0;
}
