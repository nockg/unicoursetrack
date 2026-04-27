/* Main module renderer, topic UI output and global click handlers */

  container.innerHTML = "";
  const store = getStore();
  MODULES.forEach((mod, mi) => {
    const moduleColours = getModuleColourSet(mi);
    const customisableTheme = isColourCustomisableTheme();
    const themeFamilyLabel = preferences.theme === "dark" ? "Dark theme colour" : "Light theme colour";
    const wrap = document.createElement("div");
    wrap.className = `module b${mi}`;
    wrap.style.setProperty("--module-accent", moduleColours.stripe);

    const moduleDeleteButton = document.createElement("button");
    moduleDeleteButton.className = "mini-btn module-delete-btn module-delete-corner";
    moduleDeleteButton.type = "button";
    moduleDeleteButton.textContent = "x";
    moduleDeleteButton.title = "Delete module";
    moduleDeleteButton.setAttribute("aria-label", "Delete module");
    moduleDeleteButton.addEventListener("click", (event) => deleteModuleFromCurrentYear(mi, event));

    const header = document.createElement("div");
    header.className = "module-header";
    header.innerHTML = `
      <div class="mod-stripe c${mi}"></div>
      <div class="module-summary">
        <div class="mod-name">${escapeHtml(mod.name)}</div>
        <div class="mod-kanji">${escapeHtml(mod.kanji)} · CW ${mod.cw === 0 ? "N/A" : escapeHtml(String(mod.cw ?? 0)) + "%"} · EXAMS ${mod.exam === 0 ? "N/A" : escapeHtml(String(mod.exam ?? 0)) + "%"}</div>
        <div class="module-links">
          <button class="bb-link" id="bb-link-${mi}" type="button" onclick="openBlackboardLink(${mi}, event)">Set Blackboard</button>
          <button class="formula-btn" id="formula-btn-${mi}" type="button" onclick="openFormulaLink(${mi}, event)">${escapeHtml(mod.kanji || mod.short || "Module")} Library</button>
        </div>
      </div>
      <div class="progress-section">
        <div class="prog-header">
          <span class="prog-done fc${mi}" id="mdone-${mi}">0</span>
          <span class="prog-pct" id="mpct-${mi}">0.0% complete</span>
        </div>
        <div class="prog-track"><div class="prog-fill f${mi}" id="mfill-${mi}"></div></div>
        <div class="prog-of">of ${getModuleTotal(mi)} topics</div>
      </div>
      <div class="inputs-grid">
        <div class="field">
          <label>Coursework %</label>
          <input class="input" type="number" min="0" max="100" step="0.1" id="cw-${mi}" placeholder="-" value="${store.coursework[mi] ?? ""}">
        </div>
        <div class="field">
          <label>Exam %</label>
          <input class="input" type="number" min="0" max="100" step="0.1" id="exam-${mi}" placeholder="-" value="${store.exams[mi] ?? ""}">
        </div>
      </div>
      <div class="final-col">
        <div class="final-mark" id="mfinal-${mi}">-</div>
        <div id="mcls-${mi}" class="final-cls"></div>
      </div>
      <div class="module-actions"></div>
      <div class="chevron" id="chev-${mi}" aria-hidden="true"></div>
    `;

    const stripeEl = header.querySelector(".mod-stripe");
    const progDoneEl = header.querySelector(".prog-done");
    const progFillEl = header.querySelector(".prog-fill");
    if (stripeEl) stripeEl.style.background = moduleColours.stripe;
    if (progDoneEl) progDoneEl.style.color = moduleColours.text;
    if (progFillEl) progFillEl.style.background = moduleColours.fill;

    const list = document.createElement("div");
    list.className = "topic-list";
    list.id = `topics-${mi}`;

    const moduleEditTools = document.createElement("div");
    moduleEditTools.className = "module-edit-tools";
    moduleEditTools.innerHTML = `
      <div class="module-edit-primary">
        <button class="bb-edit-btn weight-edit-btn" type="button" onclick="editModuleWeights(${mi}, event)">Module Options</button>
      </div>
      <div class="module-edit-secondary">
        <button class="bb-edit-btn" type="button" onclick="clearModuleMarks(${mi}, event)">Clear Marks</button>
      </div>
    `;
    list.appendChild(moduleEditTools);

    if (mod.cw > 0) {
      const courseworkSection = createModuleSection(mi, "coursework", "Assessments", "");
      const courseworkWrap = courseworkSection.body;
      const components = getCourseworkComponents(mi);
      courseworkWrap.innerHTML = `
        <div class="coursework-calc-wrap">
          <div class="coursework-calc-head">
            <div class="coursework-calc-title">Assessment Breakdown</div>
            <button class="mini-btn" type="button" onclick="addBlankCourseworkComponent(${mi}, event)">Add Row</button>
          </div>
          <div class="coursework-calc-summary" id="cw-calc-summary-${mi}"></div>
          <div id="cw-components-${mi}"></div>
        </div>
      `;
      const componentsHost = courseworkWrap.querySelector(`#cw-components-${mi}`);
      if (!components.length) {
        componentsHost.innerHTML = `
          <div class="coursework-empty">Add each assessment below, or type your overall coursework mark in the main coursework box above.</div>
          <div class="coursework-component-row coursework-placeholder-row">
            <div class="field">
              <label>Component</label>
              <input class="input cw-placeholder-name" placeholder="Lab report, quiz, project...">
            </div>
            <div class="field">
              <label>Mark %</label>
              <input class="input cw-placeholder-mark" type="number" min="0" max="100" step="0.1" placeholder="72">
            </div>
            <div class="field">
              <label>Weight %</label>
              <input class="input cw-placeholder-weight" type="number" min="0" max="100" step="0.1" placeholder="25">
            </div>
            <button class="mini-btn coursework-component-delete" type="button" onclick="commitCourseworkPlaceholder(${mi}, event)">Add</button>
          </div>
        `;
      } else {
        components.forEach((component, ci) => {
          const componentRow = document.createElement("div");
          componentRow.className = "coursework-component-row";
          componentRow.innerHTML = `
            <div class="field">
              <label>Component</label>
              <input class="input cw-comp-name" value="${escapeHtml(component.name || "")}" placeholder="Coursework name">
            </div>
            <div class="field">
              <label>Mark %</label>
              <input class="input cw-comp-mark" type="number" min="0" max="100" step="0.1" value="${component.mark ?? ""}" placeholder="-">
            </div>
            <div class="field">
              <label>Weight %</label>
              <input class="input cw-comp-weight" type="number" min="0" max="100" step="0.1" value="${component.weight ?? ""}" placeholder="Auto">
            </div>
            <button class="mini-btn coursework-component-delete" type="button">Delete</button>
          `;
          componentRow.querySelector(".cw-comp-name").addEventListener("input", (event) => updateCourseworkComponent(mi, ci, "name", event.target.value));
          componentRow.querySelector(".cw-comp-mark").addEventListener("input", (event) => updateCourseworkComponent(mi, ci, "mark", event.target.value));
          componentRow.querySelector(".cw-comp-weight").addEventListener("input", (event) => updateCourseworkComponent(mi, ci, "weight", event.target.value));
          componentRow.querySelector(".coursework-component-delete").addEventListener("click", (event) => deleteCourseworkComponent(mi, ci, event));
          componentsHost.appendChild(componentRow);
        });
      }
      list.appendChild(courseworkSection.wrap);
    }

    const compactMarksWrap = document.createElement("div");
    compactMarksWrap.className = "notes-area-wrap compact-marks-wrap";
    compactMarksWrap.innerHTML = `
      <div class="topic-tools">
        <div class="topic-tools-title">Marks</div>
      </div>
      <div class="inputs-grid">
        <div class="field">
          <label>Coursework %</label>
          <input class="input compact-cw" type="number" min="0" max="100" step="0.1" placeholder="-" value="${store.coursework[mi] ?? ""}">
        </div>
        <div class="field">
          <label>Exam %</label>
          <input class="input compact-ex" type="number" min="0" max="100" step="0.1" placeholder="-" value="${store.exams[mi] ?? ""}">
        </div>
      </div>
    `;
    list.appendChild(compactMarksWrap);

    const notesSection = createModuleSection(mi, "notes", "Notes", "");
    const notesWrap = notesSection.body;
    const notes = document.createElement("textarea");
    notes.className = "notes-area";
    notes.rows = 2;
    notes.placeholder = `Notes, mnemonics, thoughts on ${mod.short}...`;
    notes.value = store.notes[mi] || "";
    notes.addEventListener("input", () => {
      store.notes[mi] = notes.value;
      save();
    });
    notes.addEventListener("click", (event) => event.stopPropagation());
    notesWrap.appendChild(notes);
    list.appendChild(notesSection.wrap);


    const topicsSection = createModuleSection(mi, "topics", "Topics", `<button class="mini-btn" type="button" onclick="addTopicToModule(${mi}, event)">Add Topic</button>`);
    const topicTools = document.createElement("div");
    topicTools.className = "notes-area-wrap";
    topicTools.innerHTML = `
      <div class="topic-entry-row">
        <input class="input" id="topic-add-${mi}" placeholder='Add one topic, or "Topic 1" "Topic 2"'>
        <button class="mini-btn" type="button" onclick="addTopicToModule(${mi}, event)">Add Topic</button>
      </div>
      <div class="topic-entry-help">Use quotes for several topics. Click a row to select it, shift-click to select a range, double-click to rename, and drag the row into the gap under a topic then move right to nest it.</div>
    `;
    topicsSection.body.appendChild(topicTools);
    list.appendChild(topicsSection.wrap);
    const topicAddInput = topicTools.querySelector(`#topic-add-${mi}`);
    if (topicAddInput) {
      topicAddInput.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        addTopicToModule(mi, event);
      });
    }

    mod.topics.forEach((topicValue, ti) => {
      const topic = getTopicEntry(mi, ti);
      const row = document.createElement("div");
      row.className = "topic-row" + (isTopicSelected(mi, ti) ? " selected" : "");
      row.draggable = true;
      row.dataset.topicKey = topicSelectionKey(mi, ti);
      const prefix = document.createElement("span");
      prefix.className = "topic-prefix";
      const main = document.createElement("div");
      main.className = "topic-main";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = !!store.topics[topicKey(mi, ti)];
      const label = document.createElement("span");
      label.className = "topic-label" + (checkbox.checked ? " done" : "");
      label.textContent = topic.title;
      checkbox.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();

        isDraggingTopics = true;
        dragTopicValue = !checkbox.checked;

        setTopicCheckbox(checkbox, mi, ti, dragTopicValue);
      });

      checkbox.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });

      main.addEventListener("mouseenter", () => {
        if (!isDraggingTopics) return;
        setTopicCheckbox(checkbox, mi, ti, dragTopicValue);
      });
      row.addEventListener("pointerdown", (event) => {
        if (event.target.closest("button") || event.target.closest("input") || event.target.closest("details") || event.target.closest("summary")) return;
        draggedTopicStartX = event.clientX || 0;
      });
      row.addEventListener("click", (event) => {
        if (Date.now() < topicDropSuppressUntil) { event.preventDefault(); event.stopPropagation(); return; }
        if (event.target.closest("button") || event.target.closest("input") || event.target.closest("details") || event.target.closest("summary")) return;
        event.preventDefault();
        selectTopicRow(mi, ti, null, event);
      });
      row.addEventListener("dblclick", (event) => {
        if (Date.now() < topicDropSuppressUntil) { event.preventDefault(); event.stopPropagation(); return; }
        if (event.target.closest("button") || event.target.closest("input") || event.target.closest("details") || event.target.closest("summary")) return;
        event.preventDefault();
        editTopicInModule(mi, ti, event);
      });
      row.addEventListener("dragover", (event) => allowTopicDrop(mi, ti, event));
      row.addEventListener("dragleave", clearTopicDropState);
      row.addEventListener("drop", (event) => dropTopicReorder(mi, ti, event));
      row.addEventListener("dragstart", (event) => {
        if (event.target.closest("button") || event.target.closest("input") || event.target.closest("textarea") || event.target.closest("summary")) {
          event.preventDefault();
          return;
        }
        const currentKey = topicSelectionKey(mi, ti);
        if (selectedTopicKeys.size > 1 || !selectedTopicKeys.has(currentKey)) {
          selectOnlyTopicKey(currentKey);
        }
        row.classList.add("reordering");
        startTopicReorder(mi, ti, event);
      });
      row.addEventListener("dragend", () => {
        row.classList.remove("reordering");
        endTopicReorder();
      });
      const toggleSubtopicsButton = document.createElement("button");
      row.title = "Drag to reorder. Move right in the gap below a topic to nest under it.";
      if (topic.subtopics.length) {
        toggleSubtopicsButton.type = "button";
        toggleSubtopicsButton.className = "subtopic-toggle topic-disclosure";
        toggleSubtopicsButton.classList.toggle("collapsed", !!topic.collapsed);
        toggleSubtopicsButton.setAttribute("aria-label", topic.collapsed ? "Expand subtopics" : "Collapse subtopics");
        toggleSubtopicsButton.title = topic.collapsed ? "Expand subtopics" : "Collapse subtopics";
        toggleSubtopicsButton.addEventListener("click", (event) => toggleTopicSubtopics(mi, ti, event));
        prefix.appendChild(toggleSubtopicsButton);
      }
      row.appendChild(prefix);
      main.appendChild(checkbox);
      main.appendChild(label);
      row.appendChild(main);
      topicsSection.body.appendChild(row);

      if (topic.subtopics.length) {
        const subtopicList = document.createElement("div");
        subtopicList.className = "subtopic-list" + (topic.collapsed ? " hidden" : "");
        topic.subtopics.forEach((subtopic, si) => {
          const subRow = document.createElement("div");
          subRow.className = "topic-row subtopic-row" + (isTopicSelected(mi, ti, si) ? " selected" : "");
          subRow.dataset.topicKey = topicSelectionKey(mi, ti, si);
          subRow.draggable = true;
          const subMain = document.createElement("div");
          subMain.className = "topic-main";
          const subCheckbox = document.createElement("input");
          subCheckbox.type = "checkbox";
          subCheckbox.checked = !!store.topics[subtopicKey(mi, ti, si)];
          const subLabel = document.createElement("span");
          subLabel.className = "topic-label" + (subCheckbox.checked ? " done" : "");
          subLabel.textContent = subtopic;
          subCheckbox.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
          });
          subRow.addEventListener("click", (event) => {
            if (Date.now() < topicDropSuppressUntil) { event.preventDefault(); event.stopPropagation(); return; }
            if (event.target.closest("button") || event.target.closest("input")) return;
            event.preventDefault();
            selectTopicRow(mi, ti, si, event);
          });
          subRow.addEventListener("dblclick", (event) => {
            if (Date.now() < topicDropSuppressUntil) { event.preventDefault(); event.stopPropagation(); return; }
            if (event.target.closest("button") || event.target.closest("input")) return;
            event.preventDefault();
            editSubtopicInModule(mi, ti, si, event);
          });
          subRow.addEventListener("pointerdown", (event) => {
            if (event.target.closest("button") || event.target.closest("input")) return;
            draggedTopicStartX = event.clientX || 0;
          });
          subRow.addEventListener("dragover", (event) => allowSubtopicDrop(mi, ti, si, event));
          subRow.addEventListener("dragleave", clearTopicDropState);
          subRow.addEventListener("drop", (event) => dropSubtopicReorder(mi, ti, si, event));
          subRow.addEventListener("dragstart", (event) => {
            if (event.target.closest("button") || event.target.closest("input") || event.target.closest("textarea")) {
              event.preventDefault();
              return;
            }
            const currentKey = topicSelectionKey(mi, ti, si);
            if (selectedTopicKeys.size > 1 || !selectedTopicKeys.has(currentKey)) {
              selectOnlyTopicKey(currentKey);
            }
            subRow.classList.add("reordering");
            startTopicReorder(mi, ti, event, si);
          });
          subRow.addEventListener("dragend", () => {
            subRow.classList.remove("reordering");
            endTopicReorder();
          });
          subCheckbox.addEventListener("mousedown", (event) => {
            event.preventDefault();
            event.stopPropagation();
            setSubtopicCheckbox(mi, ti, si, !subCheckbox.checked);
          });
          subMain.appendChild(subCheckbox);
          subMain.appendChild(subLabel);
          subRow.appendChild(subMain);
          subtopicList.appendChild(subRow);
        });
        topicsSection.body.appendChild(subtopicList);
      }
    });

    if (openModules.has(mi)) {
      list.classList.add("open");
      header.querySelector(`#chev-${mi}`)?.classList?.add("open");
    }

    header.addEventListener("click", (event) => {
      if (event.target.closest("button") || event.target.closest("input") || event.target.closest("textarea") || event.target.closest("a")) return;
      const open = list.classList.toggle("open");
      document.getElementById(`chev-${mi}`).classList.toggle("open", open);
      if (open) openModules.add(mi);
      else openModules.delete(mi);
    });

    wrap.appendChild(moduleDeleteButton);
    wrap.appendChild(header);
    wrap.appendChild(list);
    container.appendChild(wrap);

    const cwInput = document.getElementById(`cw-${mi}`);
    const exInput = document.getElementById(`exam-${mi}`);
    const compactCw = compactMarksWrap.querySelector(".compact-cw");
    const compactEx = compactMarksWrap.querySelector(".compact-ex");
    cwInput.addEventListener("click", (event) => event.stopPropagation());
    exInput.addEventListener("click", (event) => event.stopPropagation());
    compactCw.addEventListener("click", (event) => event.stopPropagation());
    compactEx.addEventListener("click", (event) => event.stopPropagation());

    const syncMarks = () => {
      cwInput.value = store.coursework[mi] ?? "";
      exInput.value = store.exams[mi] ?? "";
      compactCw.value = store.coursework[mi] ?? "";
      compactEx.value = store.exams[mi] ?? "";
    };

    const handleCwChange = (value) => {
      store.coursework[mi] = value;
      save();
      syncMarks();
      updateModule(mi);
      updateGlobal();
    };
    const handleExChange = (value) => {
      store.exams[mi] = value;
      save();
      syncMarks();
      updateModule(mi);
      updateGlobal();
    };

    cwInput.addEventListener("input", (event) => {
      handleCwChange(event.target.value);
    });
    exInput.addEventListener("input", (event) => {
      handleExChange(event.target.value);
    });
    compactCw.addEventListener("input", (event) => {
      handleCwChange(event.target.value);
    });
    compactEx.addEventListener("input", (event) => {
      handleExChange(event.target.value);
    });

    syncMarks();
    updateModule(mi);
    updateBlackboardButton(mi);
    updateFormulaButton(mi);
    renderRelevantLinks(mi);
    updateCourseworkSummary(mi);
  });
}

window.addEventListener("resize", () => {
  if (!document.getElementById("dashboard-modal").classList.contains("hidden")) renderDashboardChart();
});

document.addEventListener("click", (event) => {
  const panel = document.getElementById("prefs-panel");
  if (!panel || panel.classList.contains("hidden")) return;
  if (event.target.closest("#prefs-panel") || event.target.closest('button[onclick="togglePreferences()"]')) return;
  panel.classList.add("hidden");
});

document.addEventListener("mouseup", stopTopicDrag);

function isRecoveryFlow() {
  return recoveryModeActive || window.location.hash.includes("type=recovery") || window.location.search.includes("type=recovery");
