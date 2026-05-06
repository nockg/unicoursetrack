import { store } from './store.js';
import {
  getStore, save, createModuleSection, getTopicEntry, topicKey, subtopicKey,
  topicSelectionKey, selectTopicRow, selectOnlyTopicKey, isTopicSelected,
  isColourCustomisableTheme, getModuleColourSet,
} from './state.js';
import { escapeHtml } from './utils.js';
import {
  getGradingSystem, getGradeScaleConfig, getGradeOptions, getComponentScaleConfig,
  getCreditUnitLabel, clampGradeInputValue, getComponentMarkSystem,
  isModuleVisibleInActiveTerm, parseGradeValue, formatGradeOptionLabel,
  getTermLabel, getModuleTerm, getActiveTermFilter,
} from './grading.js';
import { getModuleTotal, getModulePct, getModuleFinal, isModulePredictionMode, getCourseworkComponents } from './marks.js';
import { updateModule, updateGlobal, updateDashboard, renderDashboardChart } from './dashboard.js';
import {
  openModules, setTopicCheckbox, setSubtopicCheckbox, stopTopicDrag,
  setDraggedTopicStartX, getTopicDropSuppressUntil,
  beginTopicMouseDownDrag, isTopicDragging, getTopicDragValue,
} from './topics.js';
import {
  allowTopicDrop, clearTopicDropState, dropTopicReorder, startTopicReorder, endTopicReorder,
  allowSubtopicDrop, dropSubtopicReorder, updateCourseworkSummary,
} from './years.js';
import { updateBlackboardButton, updateFormulaButton, renderRelevantLinks } from './library.js';

const SORT_OPTIONS = [
  ['custom', 'Custom order'],
  ['name', 'Module name'],
  ['code', 'Module code'],
  ['term', 'Term'],
  ['credits', 'Credits'],
  ['progress', 'Progress'],
  ['predicted', 'Predicted mark'],
  ['missing', 'Missing marks first'],
];

export function setModuleSort(sortBy, sortDir) {
  const ys = getStore();
  if (!ys.moduleSort) ys.moduleSort = {};
  ys.moduleSort.sortBy = SORT_OPTIONS.some(([v]) => v === sortBy) ? sortBy : 'custom';
  if (sortDir !== undefined) ys.moduleSort.sortDir = sortDir === 'desc' ? 'desc' : 'asc';
  save();
  buildModules();
}

export function buildModules() {
  const container = document.getElementById('modules');
  container.innerHTML = '';
  const ys = getStore();
  const sortBy = ys.moduleSort?.sortBy || 'custom';
  const sortDir = ys.moduleSort?.sortDir || 'asc';
  const dirMult = sortDir === 'desc' ? -1 : 1;
  let renderedModules = 0;

  // Build sorted display list — originalIndex is always preserved for data access
  const displayList = store.MODULES
    .map((module, originalIndex) => ({ module, originalIndex }))
    .filter(({ originalIndex }) => isModuleVisibleInActiveTerm(originalIndex));

  if (sortBy !== 'custom') {
    displayList.sort(({ module: a, originalIndex: ai }, { module: b, originalIndex: bi }) => {
      switch (sortBy) {
        case 'name':     return dirMult * a.name.localeCompare(b.name);
        case 'code':     return dirMult * (a.kanji || '').localeCompare(b.kanji || '');
        case 'term':     return dirMult * (getModuleTerm(ai) || '').localeCompare(getModuleTerm(bi) || '');
        case 'credits':  return dirMult * ((Number(a.credits) || 0) - (Number(b.credits) || 0));
        case 'progress': return dirMult * (getModulePct(ai) - getModulePct(bi));
        case 'predicted': {
          const fa = getModuleFinal(ai), fb = getModuleFinal(bi);
          if (fa === null && fb === null) return 0;
          if (fa === null) return 1;
          if (fb === null) return -1;
          return dirMult * (Number(fa) - Number(fb));
        }
        case 'missing': {
          const fa = getModuleFinal(ai), fb = getModuleFinal(bi);
          return dirMult * ((fa === null ? 0 : 1) - (fb === null ? 0 : 1));
        }
        default: return 0;
      }
    });
  }

  // Sort toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'modules-toolbar';

  const toolbarLabel = document.createElement('span');
  toolbarLabel.className = 'modules-toolbar-label';
  toolbarLabel.textContent = 'Modules';

  const sortControls = document.createElement('div');
  sortControls.className = 'modules-sort-controls';

  const sortSelect = document.createElement('select');
  sortSelect.className = 'nav-select modules-sort-select';
  sortSelect.setAttribute('aria-label', 'Sort modules');
  SORT_OPTIONS.forEach(([value, label]) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    if (value === sortBy) opt.selected = true;
    sortSelect.appendChild(opt);
  });
  sortSelect.addEventListener('change', () => setModuleSort(sortSelect.value, sortDir));

  const dirBtn = document.createElement('button');
  dirBtn.className = 'nav-btn modules-dir-btn';
  dirBtn.type = 'button';
  dirBtn.textContent = sortDir === 'asc' ? '↑' : '↓';
  dirBtn.title = sortDir === 'asc' ? 'Low to high — click for high to low' : 'High to low — click for low to high';
  dirBtn.setAttribute('aria-label', sortDir === 'asc' ? 'Sort ascending' : 'Sort descending');
  dirBtn.hidden = sortBy === 'custom';
  dirBtn.addEventListener('click', () => setModuleSort(sortBy, sortDir === 'asc' ? 'desc' : 'asc'));

  sortControls.appendChild(sortSelect);
  sortControls.appendChild(dirBtn);
  toolbar.appendChild(toolbarLabel);
  toolbar.appendChild(sortControls);
  container.appendChild(toolbar);

  displayList.forEach(({ module: mod, originalIndex: mi }) => {
    renderedModules += 1;
    const moduleColours = getModuleColourSet(mi);
    const gradeScale = getGradeScaleConfig();
    const gradingSystem = getGradingSystem();
    const gradeOptions = getGradeOptions(gradingSystem);
    const compScale = getComponentScaleConfig(gradingSystem);
    const isPredictionMode = isModulePredictionMode(mod, gradingSystem);
    const usesFinalGradeOnly = gradingSystem !== 'uk' && !isPredictionMode;
    const usesUsGrades = ['us4', 'us43'].includes(gradingSystem);
    const termLabel = getTermLabel(getModuleTerm(mi));
    const predictionWeightMeta = isPredictionMode
      ? ` &middot; CW ${mod.cw === 0 ? 'N/A' : escapeHtml(String(mod.cw ?? 0)) + '%'} &middot; Exam ${mod.exam === 0 ? 'N/A' : escapeHtml(String(mod.exam ?? 0)) + '%'}`
      : '';
    const moduleMeta = gradingSystem === 'uk'
      ? `${escapeHtml(mod.kanji)} · CW ${mod.cw === 0 ? 'N/A' : escapeHtml(String(mod.cw ?? 0)) + '%'} · EXAMS ${mod.exam === 0 ? 'N/A' : escapeHtml(String(mod.exam ?? 0)) + '%'}`
      : `${escapeHtml(mod.kanji)} · ${escapeHtml(String(mod.credits ?? 0))} ${escapeHtml(getCreditUnitLabel({ plural: Number(mod.credits) !== 1 }))}${predictionWeightMeta}`;
    const moduleMetaWithTerm = gradingSystem === 'uk'
      ? `${escapeHtml(mod.kanji)} &middot; ${escapeHtml(termLabel)} &middot; CW ${mod.cw === 0 ? 'N/A' : escapeHtml(String(mod.cw ?? 0)) + '%'} &middot; EXAMS ${mod.exam === 0 ? 'N/A' : escapeHtml(String(mod.exam ?? 0)) + '%'}`
      : `${escapeHtml(mod.kanji)} &middot; ${escapeHtml(termLabel)} &middot; ${escapeHtml(String(mod.credits ?? 0))} ${escapeHtml(getCreditUnitLabel({ plural: Number(mod.credits) !== 1 }))}${predictionWeightMeta}`;
    const cwPredLabel = gradingSystem === 'de5' ? 'Coursework Grade (1.0–5.0)' : 'Coursework %';
    const examPredLabel = gradingSystem === 'de5' ? 'Exam Grade (1.0–5.0)' : 'Exam %';

    const getFinalGradeControlValue = () => {
      const raw = ys.finalGrades?.[mi] ?? '';
      if (raw === '' || raw === null || raw === undefined) return '';
      if (gradeOptions || gradeScale.freeformGradeInput) return String(raw);
      const parsed = parseGradeValue(raw, gradingSystem);
      return parsed === null ? '' : String(parsed);
    };

    const finalGradeControl = (id, className = '') => {
      const safeValue = escapeHtml(getFinalGradeControlValue());
      if (gradeOptions && gradeScale.freeformGradeInput) {
        const listId = `${id}-options`;
        return `<input class="input ${className}" type="text" id="${id}" list="${listId}" placeholder="${escapeHtml(gradeScale.placeholder)}" value="${safeValue}">
          <datalist id="${listId}">
            ${gradeOptions.map((option) => `<option value="${escapeHtml(option.code)}">${escapeHtml(formatGradeOptionLabel(option, gradingSystem))}</option>`).join('')}
          </datalist>`;
      }
      if (gradeOptions) {
        return `<select class="nav-select ${className}" id="${id}">
          <option value="">Not graded yet</option>
          ${gradeOptions.map((option) => `<option value="${escapeHtml(option.code)}">${escapeHtml(formatGradeOptionLabel(option, gradingSystem))}</option>`).join('')}
        </select>`;
      }
      return `<input class="input ${className}" type="number" min="${gradeScale.min ?? 0}" max="${gradeScale.max}" step="${gradeScale.step}" id="${id}" placeholder="${escapeHtml(gradeScale.placeholder)}" value="${safeValue}">`;
    };

    const customisableTheme = isColourCustomisableTheme();
    const wrap = document.createElement('div');
    wrap.className = `module b${mi}`;
    wrap.style.setProperty('--module-accent', moduleColours.stripe);

    const moduleDeleteButton = document.createElement('button');
    moduleDeleteButton.className = 'mini-btn module-delete-btn module-delete-corner';
    moduleDeleteButton.type = 'button';
    moduleDeleteButton.textContent = 'x';
    moduleDeleteButton.title = 'Delete module';
    moduleDeleteButton.setAttribute('aria-label', 'Delete module');
    moduleDeleteButton.addEventListener('click', (event) => window.deleteModuleFromCurrentYear?.(mi, event));

    const header = document.createElement('div');
    header.className = 'module-header';
    header.innerHTML = `
      <div class="mod-stripe c${mi}"></div>
      <div class="module-summary">
        <div class="mod-name">${escapeHtml(mod.name)}</div>
        <div class="mod-kanji">${moduleMetaWithTerm}</div>
        <div class="module-links">
          <button class="bb-link" id="bb-link-${mi}" type="button" onclick="openBlackboardLink(${mi}, event)">Set Blackboard</button>
          <button class="formula-btn" id="formula-btn-${mi}" type="button" onclick="openFormulaLink(${mi}, event)">${escapeHtml(mod.kanji || mod.short || 'Module')} Library</button>
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
      <div class="inputs-grid ${usesFinalGradeOnly ? 'single-grade-input' : ''}">
        ${usesFinalGradeOnly ? `
        <div class="field">
          <label>${gradeScale.finalLabel}</label>
          ${finalGradeControl(`final-grade-${mi}`)}
        </div>
        ` : isPredictionMode ? `
        <div class="field">
          <label>${escapeHtml(cwPredLabel)}</label>
          <input class="input" type="number" min="${compScale.min}" max="${compScale.max}" step="${compScale.step}" id="cw-${mi}" placeholder="${escapeHtml(compScale.placeholder)}" value="${ys.coursework[mi] ?? ''}">
        </div>
        <div class="field">
          <label>${escapeHtml(examPredLabel)}</label>
          <input class="input" type="number" min="${compScale.min}" max="${compScale.max}" step="${compScale.step}" id="exam-${mi}" placeholder="${escapeHtml(compScale.placeholder)}" value="${ys.exams[mi] ?? ''}">
        </div>
        ` : `
        <div class="field">
          <label>${gradeScale.courseworkLabel}</label>
          <input class="input" type="number" min="0" max="${gradeScale.max}" step="${gradeScale.step}" id="cw-${mi}" placeholder="${gradeScale.placeholder}" value="${ys.coursework[mi] ?? ''}">
        </div>
        <div class="field">
          <label>${gradeScale.examLabel}</label>
          <input class="input" type="number" min="0" max="${gradeScale.max}" step="${gradeScale.step}" id="exam-${mi}" placeholder="${gradeScale.placeholder}" value="${ys.exams[mi] ?? ''}">
        </div>
        `}
      </div>
      <div class="final-col">
        <div class="final-mark" id="mfinal-${mi}">-</div>
        <div id="mcls-${mi}" class="final-cls"></div>
        ${isPredictionMode ? `<div class="predicted-label">Estimated</div>` : ''}
      </div>
      <div class="module-actions"></div>
      <div class="chevron" id="chev-${mi}" aria-hidden="true"></div>
    `;

    const stripeEl = header.querySelector('.mod-stripe');
    const progDoneEl = header.querySelector('.prog-done');
    const progFillEl = header.querySelector('.prog-fill');
    if (stripeEl) stripeEl.style.background = moduleColours.stripe;
    if (progDoneEl) progDoneEl.style.color = moduleColours.text;
    if (progFillEl) progFillEl.style.background = moduleColours.fill;

    const list = document.createElement('div');
    list.className = 'topic-list';
    list.id = `topics-${mi}`;

    const moduleEditTools = document.createElement('div');
    moduleEditTools.className = 'module-edit-tools';
    moduleEditTools.innerHTML = `
      <div class="module-edit-primary">
        <button class="bb-edit-btn weight-edit-btn" type="button" onclick="editModuleWeights(${mi}, event)">Module Options</button>
      </div>
      <div class="module-edit-secondary">
        ${usesUsGrades ? `<label class="module-major-toggle"><input type="checkbox" id="major-module-${mi}" ${ys.majorModules?.[mi] ? 'checked' : ''}> Major / Program GPA</label>` : ''}
        <button class="bb-edit-btn" type="button" onclick="clearModuleMarks(${mi}, event)">Clear Marks</button>
      </div>
    `;
    list.appendChild(moduleEditTools);

    const showAssessmentSection = gradingSystem === 'uk' ? (Number(mod.cw) || 0) > 0 : gradingSystem === 'de5' || isPredictionMode;
    if (showAssessmentSection) {
      const sectionTitle = gradingSystem === 'uk' ? 'Assessments'
        : gradingSystem === 'de5' ? 'Grade Components'
        : isPredictionMode ? 'Coursework Breakdown' : 'Assessment Breakdown';
      const courseworkSection = createModuleSection(mi, 'coursework', sectionTitle, '');
      const courseworkWrap = courseworkSection.body;
      const components = getCourseworkComponents(mi);
      const innerTitle = gradingSystem === 'uk' ? 'Assessment Breakdown'
        : gradingSystem === 'de5' ? 'Grade Components'
        : isPredictionMode ? 'Coursework Breakdown' : 'Assessment Breakdown (Reference)';
      courseworkWrap.innerHTML = `
        <div class="coursework-calc-wrap">
          <div class="coursework-calc-head">
            <div class="coursework-calc-title">${escapeHtml(innerTitle)}</div>
            <button class="mini-btn" type="button" onclick="addBlankCourseworkComponent(${mi}, event)">Add Row</button>
          </div>
          <div class="coursework-calc-summary" id="cw-calc-summary-${mi}"></div>
          <div id="cw-components-${mi}"></div>
        </div>
      `;
      const componentsHost = courseworkWrap.querySelector(`#cw-components-${mi}`);
      if (!components.length) {
        const emptyText = gradingSystem === 'uk'
          ? 'Add each assessment below, or type your overall coursework mark in the main coursework box above.'
          : gradingSystem === 'de5'
            ? 'Add each graded component (written exam, term paper, oral exam, etc.). The weighted average becomes your module grade, overriding the manual grade above.'
            : isPredictionMode
              ? 'Add assessment marks in %. These calculate your Coursework %, then combine with your predicted Exam %.'
              : 'Optional: add individual assessment marks in %. This is reference only until you enable mark prediction in Module Options.';
        componentsHost.innerHTML = `<div class="coursework-empty">${escapeHtml(emptyText)}</div>`;
      } else {
        components.forEach((component, ci) => {
          const componentRow = document.createElement('div');
          componentRow.className = 'coursework-component-row';
          componentRow.innerHTML = `
            <div class="field">
              <label>Component</label>
              <input class="input cw-comp-name" value="${escapeHtml(component.name || '')}" placeholder="Assessment name">
            </div>
            <div class="field">
              <label>${escapeHtml(compScale.label)}</label>
              <input class="input cw-comp-mark" type="number" min="${compScale.min}" max="${compScale.max}" step="${compScale.step}" value="${component.mark ?? ''}" placeholder="${escapeHtml(compScale.placeholder)}">
            </div>
            <div class="field">
              <label>Weight %</label>
              <input class="input cw-comp-weight" type="number" min="0" max="100" step="0.1" value="${component.weight ?? ''}" placeholder="Auto">
            </div>
            <button class="mini-btn coursework-component-delete" type="button">Delete</button>
          `;
          componentRow.querySelector('.cw-comp-name').addEventListener('input', (event) => updateCourseworkSummary(mi) || window.updateCourseworkComponent?.(mi, ci, 'name', event.target.value));
          componentRow.querySelector('.cw-comp-mark').addEventListener('input', (event) => window.updateCourseworkComponent?.(mi, ci, 'mark', event.target.value));
          componentRow.querySelector('.cw-comp-weight').addEventListener('input', (event) => window.updateCourseworkComponent?.(mi, ci, 'weight', event.target.value));
          componentRow.querySelector('.coursework-component-delete').addEventListener('click', (event) => window.deleteCourseworkComponent?.(mi, ci, event));
          componentsHost.appendChild(componentRow);
        });
      }
      list.appendChild(courseworkSection.wrap);
    }

    const compactMarksWrap = document.createElement('div');
    compactMarksWrap.className = 'notes-area-wrap compact-marks-wrap';
    compactMarksWrap.innerHTML = `
      <div class="topic-tools">
        <div class="topic-tools-title">Marks</div>
      </div>
      <div class="inputs-grid">
        ${usesFinalGradeOnly ? `
        <div class="field">
          <label>${gradeScale.finalLabel}</label>
          ${finalGradeControl(`compact-final-grade-${mi}`, 'compact-final-grade')}
        </div>
        ` : isPredictionMode ? `
        <div class="field">
          <label>${escapeHtml(cwPredLabel)}</label>
          <input class="input compact-cw" type="number" min="${compScale.min}" max="${compScale.max}" step="${compScale.step}" placeholder="${escapeHtml(compScale.placeholder)}" value="${ys.coursework[mi] ?? ''}">
        </div>
        <div class="field">
          <label>${escapeHtml(examPredLabel)}</label>
          <input class="input compact-ex" type="number" min="${compScale.min}" max="${compScale.max}" step="${compScale.step}" placeholder="${escapeHtml(compScale.placeholder)}" value="${ys.exams[mi] ?? ''}">
        </div>
        ` : `
        <div class="field">
          <label>${gradeScale.courseworkLabel}</label>
          <input class="input compact-cw" type="number" min="0" max="${gradeScale.max}" step="${gradeScale.step}" placeholder="${gradeScale.placeholder}" value="${ys.coursework[mi] ?? ''}">
        </div>
        <div class="field">
          <label>${gradeScale.examLabel}</label>
          <input class="input compact-ex" type="number" min="0" max="${gradeScale.max}" step="${gradeScale.step}" placeholder="${gradeScale.placeholder}" value="${ys.exams[mi] ?? ''}">
        </div>
        `}
      </div>
    `;
    list.appendChild(compactMarksWrap);

    const notesSection = createModuleSection(mi, 'notes', 'Notes', '');
    const notesWrap = notesSection.body;
    const notes = document.createElement('textarea');
    notes.className = 'notes-area';
    notes.rows = 2;
    notes.placeholder = `Notes, mnemonics, thoughts on ${mod.short}...`;
    notes.value = ys.notes[mi] || '';
    notes.addEventListener('input', () => { ys.notes[mi] = notes.value; save(); });
    notes.addEventListener('click', (event) => event.stopPropagation());
    notesWrap.appendChild(notes);
    list.appendChild(notesSection.wrap);

    const topicsSection = createModuleSection(mi, 'topics', 'Topics', '');
    const topicTools = document.createElement('div');
    topicTools.className = 'notes-area-wrap';
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
      topicAddInput.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        window.addTopicToModule?.(mi, event);
      });
    }

    mod.topics.forEach((topicValue, ti) => {
      const topic = getTopicEntry(mi, ti);
      const row = document.createElement('div');
      row.className = 'topic-row' + (isTopicSelected(mi, ti) ? ' selected' : '');
      row.draggable = true;
      row.dataset.topicKey = topicSelectionKey(mi, ti);
      const prefix = document.createElement('span');
      prefix.className = 'topic-prefix';
      const main = document.createElement('div');
      main.className = 'topic-main';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = !!ys.topics[topicKey(mi, ti)];
      const label = document.createElement('span');
      label.className = 'topic-label' + (checkbox.checked ? ' done' : '');
      label.textContent = topic.title;

      checkbox.addEventListener('mousedown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        beginTopicMouseDownDrag(!checkbox.checked);
        setTopicCheckbox(checkbox, mi, ti, getTopicDragValue());
      });
      checkbox.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); });
      main.addEventListener('mouseenter', () => {
        if (!isTopicDragging()) return;
        setTopicCheckbox(checkbox, mi, ti, getTopicDragValue());
      });

      row.addEventListener('pointerdown', (event) => {
        if (event.target.closest('button') || event.target.closest('input') || event.target.closest('details') || event.target.closest('summary')) return;
        setDraggedTopicStartX(event.clientX || 0);
      });
      row.addEventListener('click', (event) => {
        if (getTopicDropSuppressUntil() > Date.now()) {
          event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); return;
        }
        if (event.target.closest('button') || event.target.closest('input') || event.target.closest('details') || event.target.closest('summary')) return;
        event.preventDefault(); event.stopPropagation();
        selectTopicRow(mi, ti, null, event);
      });
      row.addEventListener('dblclick', (event) => {
        if (getTopicDropSuppressUntil() > Date.now()) {
          event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); return;
        }
        if (event.target.closest('button') || event.target.closest('input') || event.target.closest('details') || event.target.closest('summary')) return;
        event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
        window.editTopicInModule?.(mi, ti, event);
      });
      row.addEventListener('dragover', (event) => allowTopicDrop(mi, ti, event));
      row.addEventListener('dragleave', clearTopicDropState);
      row.addEventListener('drop', (event) => dropTopicReorder(mi, ti, event));
      row.addEventListener('dragstart', (event) => {
        if (event.target.closest('button') || event.target.closest('input') || event.target.closest('textarea') || event.target.closest('summary')) {
          event.preventDefault(); return;
        }
        const currentKey = topicSelectionKey(mi, ti);
        selectOnlyTopicKey(currentKey);
        row.classList.add('reordering');
        startTopicReorder(mi, ti, event);
      });
      row.addEventListener('dragend', () => { row.classList.remove('reordering'); endTopicReorder(); });

      const toggleSubtopicsButton = document.createElement('button');
      row.title = 'Drag to reorder. Move right in the gap below a topic to nest under it.';
      if (topic.subtopics.length) {
        toggleSubtopicsButton.type = 'button';
        toggleSubtopicsButton.className = 'subtopic-toggle topic-disclosure';
        toggleSubtopicsButton.classList.toggle('collapsed', !!topic.collapsed);
        toggleSubtopicsButton.setAttribute('aria-label', topic.collapsed ? 'Expand subtopics' : 'Collapse subtopics');
        toggleSubtopicsButton.title = topic.collapsed ? 'Expand subtopics' : 'Collapse subtopics';
        toggleSubtopicsButton.addEventListener('click', (event) => window.toggleTopicSubtopics?.(mi, ti, event));
        prefix.appendChild(toggleSubtopicsButton);
      }
      row.appendChild(prefix);
      main.appendChild(checkbox);
      main.appendChild(label);
      row.appendChild(main);
      topicsSection.body.appendChild(row);

      if (topic.subtopics.length) {
        const subtopicList = document.createElement('div');
        subtopicList.className = 'subtopic-list' + (topic.collapsed ? ' hidden' : '');
        topic.subtopics.forEach((subtopic, si) => {
          const subRow = document.createElement('div');
          subRow.className = 'topic-row subtopic-row' + (isTopicSelected(mi, ti, si) ? ' selected' : '');
          subRow.dataset.topicKey = topicSelectionKey(mi, ti, si);
          subRow.draggable = true;
          const subMain = document.createElement('div');
          subMain.className = 'topic-main';
          const subCheckbox = document.createElement('input');
          subCheckbox.type = 'checkbox';
          subCheckbox.checked = !!ys.topics[subtopicKey(mi, ti, si)];
          const subLabel = document.createElement('span');
          subLabel.className = 'topic-label' + (subCheckbox.checked ? ' done' : '');
          subLabel.textContent = subtopic;

          subCheckbox.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); });
          subRow.addEventListener('click', (event) => {
            if (getTopicDropSuppressUntil() > Date.now()) {
              event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); return;
            }
            if (event.target.closest('button') || event.target.closest('input')) return;
            event.preventDefault(); event.stopPropagation();
            selectTopicRow(mi, ti, si, event);
          });
          subRow.addEventListener('dblclick', (event) => {
            if (getTopicDropSuppressUntil() > Date.now()) {
              event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); return;
            }
            if (event.target.closest('button') || event.target.closest('input')) return;
            event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
            window.editSubtopicInModule?.(mi, ti, si, event);
          });
          subRow.addEventListener('pointerdown', (event) => {
            if (event.target.closest('button') || event.target.closest('input')) return;
            setDraggedTopicStartX(event.clientX || 0);
          });
          subRow.addEventListener('dragover', (event) => allowSubtopicDrop(mi, ti, si, event));
          subRow.addEventListener('dragleave', clearTopicDropState);
          subRow.addEventListener('drop', (event) => dropSubtopicReorder(mi, ti, si, event));
          subRow.addEventListener('dragstart', (event) => {
            if (event.target.closest('button') || event.target.closest('input') || event.target.closest('textarea')) {
              event.preventDefault(); return;
            }
            const currentKey = topicSelectionKey(mi, ti, si);
            selectOnlyTopicKey(currentKey);
            subRow.classList.add('reordering');
            startTopicReorder(mi, ti, event, si);
          });
          subRow.addEventListener('dragend', () => { subRow.classList.remove('reordering'); endTopicReorder(); });
          subCheckbox.addEventListener('mousedown', (event) => {
            event.preventDefault(); event.stopPropagation();
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
      list.classList.add('open');
      header.querySelector(`#chev-${mi}`)?.classList?.add('open');
    }

    header.addEventListener('click', (event) => {
      if (event.target.closest('button') || event.target.closest('input') || event.target.closest('select') || event.target.closest('textarea') || event.target.closest('a')) return;
      const open = list.classList.toggle('open');
      document.getElementById(`chev-${mi}`).classList.toggle('open', open);
      if (open) openModules.add(mi);
      else openModules.delete(mi);
    });

    wrap.appendChild(moduleDeleteButton);
    wrap.appendChild(header);
    wrap.appendChild(list);
    container.appendChild(wrap);

    const cwInput = document.getElementById(`cw-${mi}`);
    const exInput = document.getElementById(`exam-${mi}`);
    const finalGradeInput = document.getElementById(`final-grade-${mi}`);
    const compactCw = compactMarksWrap.querySelector('.compact-cw');
    const compactEx = compactMarksWrap.querySelector('.compact-ex');
    const compactFinalGrade = compactMarksWrap.querySelector('.compact-final-grade');
    if (finalGradeInput && gradeOptions) finalGradeInput.value = ys.finalGrades?.[mi] ?? '';
    if (compactFinalGrade && gradeOptions) compactFinalGrade.value = ys.finalGrades?.[mi] ?? '';

    const majorToggle = document.getElementById(`major-module-${mi}`);
    majorToggle?.addEventListener('click', (event) => event.stopPropagation());
    majorToggle?.addEventListener('change', (event) => {
      if (!ys.majorModules) ys.majorModules = {};
      ys.majorModules[mi] = !!event.target.checked;
      save();
      updateDashboard();
    });

    cwInput?.addEventListener('click', (event) => event.stopPropagation());
    exInput?.addEventListener('click', (event) => event.stopPropagation());
    finalGradeInput?.addEventListener('click', (event) => event.stopPropagation());
    compactCw?.addEventListener('click', (event) => event.stopPropagation());
    compactEx?.addEventListener('click', (event) => event.stopPropagation());
    compactFinalGrade?.addEventListener('click', (event) => event.stopPropagation());

    const syncMarks = () => {
      if (cwInput) cwInput.value = ys.coursework[mi] ?? '';
      if (exInput) exInput.value = ys.exams[mi] ?? '';
      if (compactCw) compactCw.value = ys.coursework[mi] ?? '';
      if (compactEx) compactEx.value = ys.exams[mi] ?? '';
      if (finalGradeInput) finalGradeInput.value = ys.finalGrades?.[mi] ?? '';
      if (compactFinalGrade) compactFinalGrade.value = ys.finalGrades?.[mi] ?? '';
    };

    const handleCwChange = (value) => { ys.coursework[mi] = value; save(); updateModule(mi); updateGlobal(); };
    const handleExChange = (value) => { ys.exams[mi] = value; save(); updateModule(mi); updateGlobal(); };
    const handleFinalGradeChange = (value) => {
      if (!ys.finalGrades) ys.finalGrades = {};
      ys.finalGrades[mi] = value; save(); updateModule(mi); updateGlobal();
    };
    const clampAndSyncMark = (key, input) => {
      if (!input) return;
      if (key === 'cw') ys.coursework[mi] = clampGradeInputValue(input.value, getComponentMarkSystem());
      if (key === 'exam') ys.exams[mi] = clampGradeInputValue(input.value, getComponentMarkSystem());
      if (key === 'final') {
        if (!ys.finalGrades) ys.finalGrades = {};
        ys.finalGrades[mi] = clampGradeInputValue(input.value);
      }
      save(); syncMarks(); updateModule(mi); updateGlobal();
    };

    cwInput?.addEventListener('input', (event) => handleCwChange(event.target.value));
    exInput?.addEventListener('input', (event) => handleExChange(event.target.value));
    const finalGradeEvent = gradeOptions && !gradeScale.freeformGradeInput ? 'change' : 'input';
    finalGradeInput?.addEventListener(finalGradeEvent, (event) => handleFinalGradeChange(event.target.value));
    compactCw?.addEventListener('input', (event) => handleCwChange(event.target.value));
    compactEx?.addEventListener('input', (event) => handleExChange(event.target.value));
    compactFinalGrade?.addEventListener(finalGradeEvent, (event) => handleFinalGradeChange(event.target.value));
    cwInput?.addEventListener('blur', () => clampAndSyncMark('cw', cwInput));
    compactCw?.addEventListener('blur', () => clampAndSyncMark('cw', compactCw));
    exInput?.addEventListener('blur', () => clampAndSyncMark('exam', exInput));
    compactEx?.addEventListener('blur', () => clampAndSyncMark('exam', compactEx));
    finalGradeInput?.addEventListener('blur', () => clampAndSyncMark('final', finalGradeInput));
    compactFinalGrade?.addEventListener('blur', () => clampAndSyncMark('final', compactFinalGrade));

    syncMarks();
    updateModule(mi);
    updateBlackboardButton(mi);
    updateFormulaButton(mi);
    renderRelevantLinks(mi);
    updateCourseworkSummary(mi);
  });

  if (!renderedModules) {
    const term = getActiveTermFilter();
    const isAllTerms = term === 'all';
    const termLabel = escapeHtml(getTermLabel(term));
    container.innerHTML = `
    <div class="module-empty-state">
      <div class="module-empty-copy-block">
        <div class="module-empty-title">${isAllTerms ? 'No modules yet.' : `No modules in ${termLabel} yet.`}</div>
        <div class="module-empty-copy">
          ${isAllTerms
      ? 'Add your first module to start tracking marks, topics, deadlines, and materials.'
      : `Add a module to ${termLabel}, or switch back to Overall to view all modules.`}
        </div>
      </div>
      <button class="nav-btn calendar-btn module-empty-action" type="button" onclick="addModuleToCurrentYear()">Add Module</button>
    </div>
  `;
  } else {
    container.insertAdjacentHTML('beforeend', `
      <button
        type="button"
        class="module-add-card"
        onclick="addModuleToCurrentYear()"
        aria-label="Add module"
        title="Add module"
      >
        <span class="module-add-card-plus" aria-hidden="true">+</span>
      </button>
    `);
  }

  setupMobileModuleCarousel();
}

function setupMobileModuleCarousel() {
  const carousel = document.getElementById('modules');
  if (!carousel || carousel.dataset.mobileCarouselReady === 'true') return;
  carousel.dataset.mobileCarouselReady = 'true';
  const markTouching = () => { if (window.innerWidth <= 700) carousel.classList.add('is-touching'); };
  const clearTouching = () => { carousel.classList.remove('is-touching'); };
  carousel.addEventListener('touchstart', markTouching, { passive: true });
  carousel.addEventListener('touchend', clearTouching, { passive: true });
  carousel.addEventListener('touchcancel', clearTouching, { passive: true });
}

window.addEventListener('resize', () => {
  if (!document.getElementById('dashboard-modal').classList.contains('hidden')) renderDashboardChart();
});

document.addEventListener('click', (event) => {
  const panel = document.getElementById('prefs-panel');
  if (!panel || panel.classList.contains('hidden')) return;
  if (event.target.closest('#prefs-panel') || event.target.closest('button[onclick="togglePreferences()"]')) return;
  panel.classList.add('hidden');
});

document.addEventListener('mouseup', stopTopicDrag);
