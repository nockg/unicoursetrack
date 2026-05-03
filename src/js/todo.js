import { store } from './store.js';
import { getStore, save, isMobileViewport } from './state.js';
import { escapeHtml } from './utils.js';

// ── Module-local drag/resize/detail state ─────────────────────────────────
let todoPanelDrag = null;
let todoPanelResize = null;
let todoOpenDetailIndex = null;

// ── State accessors ────────────────────────────────────────────────────────

function getTodoItems() {
  const ys = getStore();
  if (!Array.isArray(ys.todos)) ys.todos = [];
  return ys.todos;
}

function getTodoPanelState() {
  const s = store.state;
  if (!s.ui) s.ui = {};
  if (!s.ui.todoPanel) {
    s.ui.todoPanel = { locked: false, top: null, left: null, width: 520, height: 480, hasOpenedOnce: false };
  }
  return s.ui.todoPanel;
}

// ── Panel positioning ──────────────────────────────────────────────────────

export function applyTodoPanelState(forceCenter = false) {
  const panel = document.querySelector('#todo-modal .todo-content');
  if (!panel) return;
  const panelState = getTodoPanelState();
  if (isMobileViewport()) {
    document.getElementById('todo-modal')?.classList.add('todo-mobile');
    panel.style.top = panel.style.left = panel.style.right = panel.style.width = panel.style.height = '';
    return;
  }
  document.getElementById('todo-modal')?.classList.remove('todo-mobile');
  const items = getTodoItems();
  const maxWidth = window.innerWidth - 18;
  const maxHeight = Math.min(window.innerHeight - 18, 720);
  const width = Math.max(380, Math.min(panelState.width || 520, maxWidth));
  const baseHeight = 120 + Math.min(items.length || 1, 8) * 58 + 60;
  const preferredHeight = Math.max(panelState.height || 0, Math.min(baseHeight, 580));
  const height = Math.max(300, Math.min(preferredHeight, maxHeight));
  const savedLeft = Number.isFinite(panelState.left) ? panelState.left : null;
  const savedTop = Number.isFinite(panelState.top) ? panelState.top : null;
  const left = forceCenter || savedLeft === null
    ? Math.max(8, Math.round((window.innerWidth - width) / 2))
    : Math.max(8, Math.min(savedLeft, window.innerWidth - width - 8));
  const top = forceCenter || savedTop === null
    ? Math.max(76, Math.round((window.innerHeight - height) / 2))
    : Math.max(70, Math.min(savedTop, window.innerHeight - height - 8));
  panel.classList.toggle('is-locked', !!panelState.locked);
  panel.style.top = `${top}px`;
  panel.style.left = `${left}px`;
  panel.style.right = 'auto';
  panel.style.width = `${width}px`;
  panel.style.height = `${height}px`;
  const lockBtn = document.getElementById('todo-lock-btn');
  if (lockBtn) lockBtn.textContent = panelState.locked ? 'Unpin' : 'Pin';
}

function persistTodoPanelRect() {
  const panel = document.querySelector('#todo-modal .todo-content');
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
  const panel = document.querySelector('#todo-modal .todo-content');
  if (!panel || !panel.contains(event.target)) return;
  const scrollable = event.target.closest('.todo-list, .todo-detail-note');
  if (!scrollable) { event.preventDefault(); return; }
  const canScroll = scrollable.scrollHeight > scrollable.clientHeight;
  if (!canScroll) { event.preventDefault(); return; }
  const goingDown = event.deltaY > 0;
  const atTop = scrollable.scrollTop <= 0;
  const atBottom = Math.ceil(scrollable.scrollTop + scrollable.clientHeight) >= scrollable.scrollHeight;
  if ((goingDown && atBottom) || (!goingDown && atTop)) event.preventDefault();
  event.stopPropagation();
}

function setupTodoPanelResizePersistence() {
  const panel = document.querySelector('#todo-modal .todo-content');
  if (!panel || panel.dataset.resizeReady) return;
  panel.dataset.resizeReady = 'true';
  ['top','right','bottom','left','top-left','top-right','bottom-left','bottom-right'].forEach((edge) => {
    const handle = document.createElement('div');
    handle.className = 'todo-resize-handle';
    handle.dataset.edge = edge;
    handle.addEventListener('pointerdown', startTodoPanelResize);
    panel.appendChild(handle);
  });
  panel.addEventListener('mouseup', () => persistTodoPanelRect());
  panel.addEventListener('touchend', () => persistTodoPanelRect(), { passive: true });
  panel.addEventListener('wheel', trapTodoPanelWheel, { passive: false });
}

export function toggleTodoPanelLock() {
  const panelState = getTodoPanelState();
  panelState.locked = !panelState.locked;
  applyTodoPanelState();
  save();
}

// ── Resize ─────────────────────────────────────────────────────────────────

function startTodoPanelResize(event) {
  if (getTodoPanelState().locked) return;
  const panel = document.querySelector('#todo-modal .todo-content');
  if (!panel) return;
  event.preventDefault();
  event.stopPropagation();
  const rect = panel.getBoundingClientRect();
  todoPanelResize = { pointerId: event.pointerId, edge: event.currentTarget.dataset.edge, startX: event.clientX, startY: event.clientY, startTop: rect.top, startLeft: rect.left, startWidth: rect.width, startHeight: rect.height };
  panel.setPointerCapture?.(event.pointerId);
}

function moveTodoPanelResize(event) {
  if (!todoPanelResize) return false;
  const panel = document.querySelector('#todo-modal .todo-content');
  if (!panel) return false;
  const minW = 340, minH = 220, maxW = window.innerWidth - 16, maxH = window.innerHeight - 16;
  let left = todoPanelResize.startLeft, top = todoPanelResize.startTop;
  let width = todoPanelResize.startWidth, height = todoPanelResize.startHeight;
  const dx = event.clientX - todoPanelResize.startX;
  const dy = event.clientY - todoPanelResize.startY;
  const edge = todoPanelResize.edge || '';
  if (edge.includes('right')) width = todoPanelResize.startWidth + dx;
  if (edge.includes('bottom')) height = todoPanelResize.startHeight + dy;
  if (edge.includes('left')) { width = todoPanelResize.startWidth - dx; left = todoPanelResize.startLeft + dx; }
  if (edge.includes('top')) { height = todoPanelResize.startHeight - dy; top = todoPanelResize.startTop + dy; }
  width = Math.max(minW, Math.min(width, maxW));
  height = Math.max(minH, Math.min(height, maxH));
  left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
  top = Math.max(70, Math.min(top, window.innerHeight - height - 8));
  panel.style.left = `${left}px`; panel.style.top = `${top}px`;
  panel.style.width = `${width}px`; panel.style.height = `${height}px`;
  return true;
}

function endTodoPanelResize(event) {
  if (!todoPanelResize) return false;
  const panel = document.querySelector('#todo-modal .todo-content');
  if (panel && event?.pointerId !== undefined && panel.hasPointerCapture?.(event.pointerId)) panel.releasePointerCapture(event.pointerId);
  persistTodoPanelRect();
  todoPanelResize = null;
  return true;
}

// ── Drag ───────────────────────────────────────────────────────────────────

export function startTodoPanelDrag(event) {
  if (getTodoPanelState().locked) return;
  if (event.target.closest('button,input,textarea,select,option,label')) return;
  if (!event.target.closest('.timeline-head')) return;
  const panel = document.querySelector('#todo-modal .todo-content');
  if (!panel) return;
  const rect = panel.getBoundingClientRect();
  todoPanelDrag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startTop: rect.top, startLeft: rect.left, width: rect.width };
  panel.style.left = `${rect.left}px`; panel.style.top = `${rect.top}px`; panel.style.right = 'auto';
  panel.setPointerCapture?.(event.pointerId);
}

export function moveTodoPanelDrag(event) {
  if (moveTodoPanelResize(event)) return;
  if (!todoPanelDrag) return;
  const panel = document.querySelector('#todo-modal .todo-content');
  if (!panel) return;
  const nextLeft = Math.max(8, Math.min(window.innerWidth - todoPanelDrag.width - 8, todoPanelDrag.startLeft + (event.clientX - todoPanelDrag.startX)));
  const nextTop = Math.max(70, todoPanelDrag.startTop + (event.clientY - todoPanelDrag.startY));
  panel.style.left = `${nextLeft}px`; panel.style.top = `${nextTop}px`;
}

export function endTodoPanelDrag(event) {
  if (endTodoPanelResize(event)) return;
  if (!todoPanelDrag) return;
  const panel = document.querySelector('#todo-modal .todo-content');
  if (panel && event?.pointerId !== undefined && panel.hasPointerCapture?.(event.pointerId)) panel.releasePointerCapture(event.pointerId);
  const panelState = getTodoPanelState();
  const rect = panel.getBoundingClientRect();
  panelState.top = Math.max(70, Math.round(rect.top));
  panelState.left = Math.max(8, Math.round(rect.left));
  panelState.width = Math.round(rect.width);
  panelState.height = Math.round(rect.height);
  save();
  todoPanelDrag = null;
}

// ── Rendering ──────────────────────────────────────────────────────────────

export function renderTodoPlanner() {
  const host = document.getElementById('todo-list');
  if (!host) return;
  const todos = getTodoItems();
  if (!todos.length) {
    host.innerHTML = '<div class="timeline-empty todo-empty">No tasks yet. Type one below.</div>';
    applyTodoPanelState();
    return;
  }
  host.innerHTML = todos.map((item, index) => {
    const escapedTitle = escapeHtml(item.title || 'Untitled task');
    const doneClass = item.completed ? 'is-done' : '';
    const hasDetails = !!(item.note || Number.isInteger(item.moduleIndex));
    const detailOpen = todoOpenDetailIndex === index;
    const moduleOptions = [`<option value="">General</option>`]
      .concat(store.MODULES.map((mod, mi) => `<option value="${mi}"${item.moduleIndex === mi ? ' selected' : ''}>${escapeHtml(mod.kanji || mod.short || mod.name)}</option>`))
      .join('');
    const detailPanel = detailOpen ? `
      <div class="todo-detail-panel">
        <div class="todo-detail-module-row">
          <label class="todo-detail-label" for="todo-module-${index}">Module</label>
          <select class="todo-detail-module-select" id="todo-module-${index}" onchange="updateTodoModule(${index},this.value)">${moduleOptions}</select>
        </div>
        <textarea class="todo-detail-note" data-todo-note-index="${index}" placeholder="Add a note…">${escapeHtml(item.note || '')}</textarea>
        <button class="todo-delete-btn" type="button" onclick="deleteTodoItem(${index},event)">Delete task</button>
      </div>` : '';
    return `<div class="todo-item-wrapper ${doneClass}">
      <div class="todo-task-row">
        <button class="todo-check-btn" type="button" onclick="toggleTodoComplete(${index},event)" aria-label="Mark complete"></button>
        <input class="todo-title-input" type="text" value="${escapedTitle}" data-todo-title-index="${index}" onkeydown="handleTodoTitleKeydown(${index},event)" onblur="handleTodoTitleBlur(${index},event)" onclick="event.stopPropagation()" aria-label="Task title">
        <div class="todo-task-actions">
          <button class="todo-quick-delete-btn" type="button" onclick="deleteTodoItem(${index},event)" aria-label="Delete task">✕</button>
          <button class="todo-info-btn${hasDetails ? ' is-filled' : ''}" type="button" onclick="toggleTodoDetail(${index},event)" aria-label="Task details">&#x24D8;</button>
        </div>
      </div>${detailPanel}
    </div>`;
  }).join('');
  host.querySelectorAll('[data-todo-note-index]').forEach((textarea) => {
    textarea.addEventListener('input', (e) => updateTodoNote(Number(e.target.dataset.todoNoteIndex), e.target.value));
  });
  applyTodoPanelState();
}

// ── Todo item actions ──────────────────────────────────────────────────────

export function handleTodoTitleKeydown(index, event) {
  if (event.key === 'Enter') { event.preventDefault(); event.target.blur(); }
  else if (event.key === 'Escape') { const todos = getTodoItems(); if (todos[index]) event.target.value = todos[index].title || 'Untitled task'; event.target.blur(); }
}

export function handleTodoTitleBlur(index, event) {
  const todos = getTodoItems();
  if (!todos[index]) return;
  const newTitle = event.target.value.trim();
  if (!newTitle) { event.target.value = todos[index].title || 'Untitled task'; return; }
  if (newTitle !== todos[index].title) { todos[index].title = newTitle; save(); }
}

export function toggleTodoDetail(index, event) {
  if (event) event.stopPropagation();
  todoOpenDetailIndex = todoOpenDetailIndex === index ? null : index;
  renderTodoPlanner();
}

export function updateTodoModule(index, value) {
  const todos = getTodoItems();
  if (!todos[index]) return;
  const moduleIndex = value === '' ? null : Number(value);
  todos[index].moduleIndex = Number.isInteger(moduleIndex) ? moduleIndex : null;
  save();
  renderTodoPlanner();
}

export function handleNewTodoKeydown(event) {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  const input = event.target;
  const title = input.value.trim();
  if (!title) return;
  getTodoItems().push({ title, note: '', moduleIndex: null, completed: false, createdAt: new Date().toISOString() });
  save();
  input.value = '';
  renderTodoPlanner();
  setTimeout(() => document.getElementById('todo-new-input')?.focus(), 0);
}

export function handleNewTodoBlur(event) {
  const title = event.target.value.trim();
  if (!title) return;
  getTodoItems().push({ title, note: '', moduleIndex: null, completed: false, createdAt: new Date().toISOString() });
  save();
  event.target.value = '';
  renderTodoPlanner();
}

export function toggleTodoComplete(index, event) {
  if (event) event.stopPropagation();
  const todos = getTodoItems();
  if (!todos[index]) return;
  todos[index].completed = !todos[index].completed;
  save();
  renderTodoPlanner();
}

export function updateTodoNote(index, value) {
  const todos = getTodoItems();
  if (!todos[index]) return;
  todos[index].note = value;
  save();
}

export function deleteTodoItem(index, event) {
  if (event) event.stopPropagation();
  const todos = getTodoItems();
  if (!todos[index]) return;
  todos.splice(index, 1);
  if (todoOpenDetailIndex !== null) {
    if (todoOpenDetailIndex === index) todoOpenDetailIndex = null;
    else if (todoOpenDetailIndex > index) todoOpenDetailIndex--;
  }
  save();
  renderTodoPlanner();
}

// ── Open / close ───────────────────────────────────────────────────────────

export function openTodoPlanner() {
  const modal = document.getElementById('todo-modal');
  if (!modal) return;
  const panelState = getTodoPanelState();
  modal.classList.remove('hidden');
  setupTodoPanelResizePersistence();
  applyTodoPanelState(!panelState.hasOpenedOnce);
  panelState.hasOpenedOnce = true;
  save();
  renderTodoPlanner();
}

export function closeTodoPlanner() {
  document.getElementById('todo-modal')?.classList.add('hidden');
  todoPanelDrag = null;
  todoPanelResize = null;
}

export function toggleTodoPlanner() {
  const modal = document.getElementById('todo-modal');
  if (!modal) return;
  if (modal.classList.contains('hidden')) openTodoPlanner();
  else closeTodoPlanner();
}
