/* Todo planner state, panel dragging/resizing and task rendering */

  if (!Array.isArray(store.todos)) store.todos = [];
  return store.todos;
}

function getTodoPanelState() {
  if (!state.ui) state.ui = {};
  if (!state.ui.todoPanel) {
    state.ui.todoPanel = {
      locked: false,
      top: null,
      left: null,
      width: 460,
      height: 430,
      compact: false,
      hasOpenedOnce: false
    };
  }
  return state.ui.todoPanel;
}

function applyTodoPanelState(forceCenter = false) {
  const panel = document.querySelector("#todo-modal .todo-content");
  if (!panel) return;
  const panelState = getTodoPanelState();
  const compact = !!panelState.compact;
  const items = getTodoItems();
  const maxWidth = window.innerWidth - 18;
  const maxHeight = Math.min(window.innerHeight - 18, 720);
  const width = Math.max(330, Math.min(panelState.width || 460, maxWidth));

  const compactHeight = 184 + Math.min(items.length || 1, 8) * 40;
  const expandedHeight = 238 + Math.min(items.length || 1, 4) * 112;
  const preferredHeight = compact ? compactHeight : Math.max(panelState.height || 0, Math.min(expandedHeight, 620));
  const minHeight = compact ? 236 : 340;
  const height = Math.max(minHeight, Math.min(preferredHeight, maxHeight));

  const savedLeft = Number.isFinite(panelState.left) ? panelState.left : null;
  const savedTop = Number.isFinite(panelState.top) ? panelState.top : null;
  const left = forceCenter || savedLeft === null ? Math.max(8, Math.round((window.innerWidth - width) / 2)) : Math.max(8, Math.min(savedLeft, window.innerWidth - width - 8));
  const top = forceCenter || savedTop === null ? Math.max(76, Math.round((window.innerHeight - height) / 2)) : Math.max(70, Math.min(savedTop, window.innerHeight - height - 8));

  panel.classList.toggle("is-locked", !!panelState.locked);
  document.getElementById("todo-modal")?.classList.toggle("todo-compact-mode", compact);
  panel.style.top = `${top}px`;
  panel.style.left = `${left}px`;
  panel.style.right = "auto";
  panel.style.width = `${width}px`;
  panel.style.height = `${height}px`;
  const lockBtn = document.getElementById("todo-lock-btn");
  if (lockBtn) lockBtn.textContent = panelState.locked ? "Unpin" : "Pin";
}

function persistTodoPanelRect() {
  const panel = document.querySelector("#todo-modal .todo-content");
  if (!panel) return;
  const panelState = getTodoPanelState();
  const rect = panel.getBoundingClientRect();
  panelState.top = Math.max(70, Math.round(rect.top));
  panelState.left = Math.max(8, Math.round(rect.left));
  panelState.width = Math.round(rect.width);
  panelState.height = Math.round(rect.height);
  save();
}

function trapTodoPanelWheel(event) {
  const panel = document.querySelector("#todo-modal .todo-content");
  if (!panel || !panel.contains(event.target)) return;
  const scrollable = event.target.closest(".todo-list, .todo-inline-note");
  if (!scrollable) {
    event.preventDefault();
    return;
  }
  const canScroll = scrollable.scrollHeight > scrollable.clientHeight;
  if (!canScroll) {
    event.preventDefault();
    return;
  }
  const goingDown = event.deltaY > 0;
  const atTop = scrollable.scrollTop <= 0;
  const atBottom = Math.ceil(scrollable.scrollTop + scrollable.clientHeight) >= scrollable.scrollHeight;
  if ((goingDown && atBottom) || (!goingDown && atTop)) event.preventDefault();
  event.stopPropagation();
}

function setupTodoPanelResizePersistence() {
  const panel = document.querySelector("#todo-modal .todo-content");
  if (!panel || panel.dataset.resizeReady) return;
  panel.dataset.resizeReady = "true";
  ["top", "right", "bottom", "left", "top-left", "top-right", "bottom-left", "bottom-right"].forEach((edge) => {
    const handle = document.createElement("div");
    handle.className = "todo-resize-handle";
    handle.dataset.edge = edge;
    handle.addEventListener("pointerdown", startTodoPanelResize);
    panel.appendChild(handle);
  });
  panel.addEventListener("mouseup", () => persistTodoPanelRect());
  panel.addEventListener("touchend", () => persistTodoPanelRect(), { passive: true });
  panel.addEventListener("wheel", trapTodoPanelWheel, { passive: false });
}

function toggleTodoPanelLock() {
  const panelState = getTodoPanelState();
  panelState.locked = !panelState.locked;
  applyTodoPanelState();
  save();
}

function startTodoPanelResize(event) {
  const panelState = getTodoPanelState();
  if (panelState.locked) return;
  const panel = document.querySelector("#todo-modal .todo-content");
  if (!panel) return;
  event.preventDefault();
  event.stopPropagation();
  const rect = panel.getBoundingClientRect();
  todoPanelResize = {
    pointerId: event.pointerId,
    edge: event.currentTarget.dataset.edge,
    startX: event.clientX,
    startY: event.clientY,
    startTop: rect.top,
    startLeft: rect.left,
    startWidth: rect.width,
    startHeight: rect.height
  };
  panel.setPointerCapture?.(event.pointerId);
}

function moveTodoPanelResize(event) {
  if (!todoPanelResize) return false;
  const panel = document.querySelector("#todo-modal .todo-content");
  if (!panel) return false;
  const minWidth = 380;
  const minHeight = 220;
  const maxWidth = window.innerWidth - 16;
  const maxHeight = window.innerHeight - 16;
  let left = todoPanelResize.startLeft;
  let top = todoPanelResize.startTop;
  let width = todoPanelResize.startWidth;
  let height = todoPanelResize.startHeight;
  const dx = event.clientX - todoPanelResize.startX;
  const dy = event.clientY - todoPanelResize.startY;
  const edge = todoPanelResize.edge || "";
  if (edge.includes("right")) width = todoPanelResize.startWidth + dx;
  if (edge.includes("bottom")) height = todoPanelResize.startHeight + dy;
  if (edge.includes("left")) {
    width = todoPanelResize.startWidth - dx;
    left = todoPanelResize.startLeft + dx;
  }
  if (edge.includes("top")) {
    height = todoPanelResize.startHeight - dy;
    top = todoPanelResize.startTop + dy;
  }
  width = Math.max(minWidth, Math.min(width, maxWidth));
  height = Math.max(minHeight, Math.min(height, maxHeight));
  left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
  top = Math.max(70, Math.min(top, window.innerHeight - height - 8));
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
  panel.style.width = `${width}px`;
  panel.style.height = `${height}px`;
  return true;
}

function endTodoPanelResize(event) {
  if (!todoPanelResize) return false;
  const panel = document.querySelector("#todo-modal .todo-content");
  if (panel && event?.pointerId !== undefined && panel.hasPointerCapture?.(event.pointerId)) {
    panel.releasePointerCapture(event.pointerId);
  }
  persistTodoPanelRect();
  todoPanelResize = null;
  return true;
}

function startTodoPanelDrag(event) {
  const panelState = getTodoPanelState();
  if (panelState.locked) return;
  if (event.target.closest("button, input, textarea, select, option, label")) return;
  if (!event.target.closest(".timeline-head")) return;
  const panel = document.querySelector("#todo-modal .todo-content");
  if (!panel) return;
  const rect = panel.getBoundingClientRect();
  todoPanelDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startTop: rect.top,
    startLeft: rect.left,
    width: rect.width
  };
  panel.style.left = `${rect.left}px`;
  panel.style.top = `${rect.top}px`;
  panel.style.right = "auto";
  panel.setPointerCapture?.(event.pointerId);
}

function moveTodoPanelDrag(event) {
  if (moveTodoPanelResize(event)) return;
  if (!todoPanelDrag) return;
  const panel = document.querySelector("#todo-modal .todo-content");
  if (!panel) return;
  const nextLeft = Math.max(8, Math.min(window.innerWidth - todoPanelDrag.width - 8, todoPanelDrag.startLeft + (event.clientX - todoPanelDrag.startX)));
  const nextTop = Math.max(70, todoPanelDrag.startTop + (event.clientY - todoPanelDrag.startY));
  panel.style.left = `${nextLeft}px`;
  panel.style.top = `${nextTop}px`;
}

function endTodoPanelDrag(event) {
  if (endTodoPanelResize(event)) return;
  if (!todoPanelDrag) return;
  const panel = document.querySelector("#todo-modal .todo-content");
  if (panel && event?.pointerId !== undefined && panel.hasPointerCapture?.(event.pointerId)) {
    panel.releasePointerCapture(event.pointerId);
  }
  const panelState = getTodoPanelState();
  const rect = panel.getBoundingClientRect();
  panelState.top = Math.max(70, Math.round(rect.top));
  panelState.left = Math.max(8, Math.round(rect.left));
  panelState.width = Math.round(rect.width);
  panelState.height = Math.round(rect.height);
  save();
  todoPanelDrag = null;
}

function toggleTodoCompactView() {
  const panelState = getTodoPanelState();
  panelState.compact = !panelState.compact;
  const items = getTodoItems();
  panelState.height = panelState.compact
    ? Math.min(window.innerHeight - 18, 172 + Math.min(items.length || 1, 8) * 48)
    : Math.min(window.innerHeight - 18, 238 + Math.min(items.length || 1, 4) * 112);
  save();
  renderTodoPlanner();
  applyTodoPanelState();
}

function renderTodoModuleOptions() {
  const select = document.getElementById("todo-module-input");
  if (!select) return;
  const currentValue = select.value;
  const options = [`<option value="">General Task</option>`]
    .concat(MODULES.map((mod, mi) => `<option value="${mi}">${escapeHtml(mod.kanji || mod.short || mod.name)}</option>`));
  select.innerHTML = options.join("");
  if (options.some((_, index) => String(index - 1) === currentValue) || currentValue === "") {
    select.value = currentValue;
  }
}

function getTodoSummaryText() {
  const todos = getTodoItems();
  const openCount = todos.filter((item) => !item.completed).length;
  const doneCount = todos.length - openCount;
  if (!todos.length) return "No tasks yet";
  return `${openCount} open - ${doneCount} done`;
}

function renderTodoPlanner() {
  const host = document.getElementById("todo-list");
  const summary = document.getElementById("todo-summary");
  const toggle = document.getElementById("todo-view-toggle");
  if (!host || !summary) return;
  const todos = getTodoItems();
  const compact = !!getTodoPanelState().compact;
  document.getElementById("todo-modal")?.classList.toggle("todo-compact-mode", compact);
  summary.textContent = getTodoSummaryText();
  if (toggle) toggle.textContent = compact ? "Expand" : "Simplify";
  if (!todos.length) {
    host.innerHTML = '<div class="timeline-empty todo-empty">No tasks yet. Add one from the top of this planner.</div>';
    applyTodoPanelState();
    return;
  }
  host.innerHTML = todos.map((item, index) => {
    const moduleLabel = escapeHtml(Number.isInteger(item.moduleIndex) && MODULES[item.moduleIndex] ? (MODULES[item.moduleIndex].kanji || MODULES[item.moduleIndex].short || MODULES[item.moduleIndex].name) : "General");
    const title = escapeHtml(item.title || "Untitled task");
    const doneClass = item.completed ? "is-done" : "";
    if (compact) {
      return `
        <div class="todo-task-row ${doneClass}" onclick="handleTodoCardClick(${index}, event)">
          <button class="timeline-dot complete-toggle" type="button" onclick="toggleTodoComplete(${index}, event)" title="Mark task complete" aria-label="Mark task complete"></button>
          <div class="todo-row-title" title="${title}">${title}</div>
          <button class="mini-btn todo-delete-btn" type="button" onclick="deleteTodoItem(${index}, event)" title="Delete task" aria-label="Delete task">Delete</button>
        </div>
      `;
    }
    return `
      <div class="todo-expanded-card ${doneClass}" onclick="handleTodoCardClick(${index}, event)">
        <button class="timeline-dot complete-toggle" type="button" onclick="toggleTodoComplete(${index}, event)" title="Mark task complete" aria-label="Mark task complete"></button>
        <div>
          <div class="todo-expanded-title">${title}</div>
          <div class="todo-badge">${moduleLabel}</div>
          <details class="todo-note-details">
            <summary>${item.note ? "View note" : "Add note"}</summary>
            <textarea class="timeline-notes todo-inline-note" data-todo-note-index="${index}" placeholder="Add context, next steps, or anything you need to remember...">${escapeHtml(item.note || "")}</textarea>
          </details>
        </div>
        <button class="mini-btn todo-delete-btn" type="button" onclick="deleteTodoItem(${index}, event)" title="Delete task" aria-label="Delete task">Delete</button>
      </div>
    `;
  }).join("");
  host.querySelectorAll("[data-todo-note-index]").forEach((textarea) => {
    textarea.addEventListener("input", (event) => updateTodoNote(Number(event.target.dataset.todoNoteIndex), event.target.value));
  });
  applyTodoPanelState();
}

function saveTodoDraft() {
  const titleInput = document.getElementById("todo-title-input");
  const moduleInput = document.getElementById("todo-module-input");
  const title = String(titleInput?.value || "").trim();
  const note = "";
  if (!title) return;
  const moduleValue = String(moduleInput?.value || "").trim();
  const moduleIndex = moduleValue === "" ? null : Number(moduleValue);
  getTodoItems().unshift({ title, note, moduleIndex: Number.isInteger(moduleIndex) ? moduleIndex : null, completed: false, createdAt: new Date().toISOString() });
  if (titleInput) titleInput.value = "";
  if (moduleInput) moduleInput.value = "";
  save();
  renderTodoPlanner();
}

function handleTodoInputKeydown(event) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  saveTodoDraft();
}

function handleTodoCardClick(index, event) {
  const ignored = event?.target?.closest?.("button, textarea, input, select, option, summary, details, a, label");
  if (ignored) return;
  toggleTodoComplete(index, event);
}

function toggleTodoComplete(index, event) {
  if (event) event.stopPropagation();
  const todos = getTodoItems();
  if (!todos[index]) return;
  todos[index].completed = !todos[index].completed;
  save();
  renderTodoPlanner();
}

function updateTodoNote(index, value) {
  const todos = getTodoItems();
  if (!todos[index]) return;
  todos[index].note = value;
  save();
}

function deleteTodoItem(index, event) {
  if (event) event.stopPropagation();
  const todos = getTodoItems();
  if (!todos[index]) return;
  todos.splice(index, 1);
  save();
  renderTodoPlanner();
}

function openTodoPlanner() {
  const modal = document.getElementById("todo-modal");
  const panelState = getTodoPanelState();
  modal.classList.remove("hidden");
  renderTodoModuleOptions();
  setupTodoPanelResizePersistence();
  applyTodoPanelState(!panelState.hasOpenedOnce);
  panelState.hasOpenedOnce = true;
  save();
  renderTodoPlanner();
}

function closeTodoPlanner() {
  document.getElementById("todo-modal").classList.add("hidden");
}

function buildModules() {
  const container = document.getElementById("modules");
