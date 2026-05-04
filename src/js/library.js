import { store } from './store.js';
import { getStore, save, syncModalScrollLock } from './state.js';
import { escapeHtml, safeUrl, openTrustedUrl } from './utils.js';

// ── Module-local UI state ──────────────────────────────────────────────────
let linkFormContext = null;
let materialLibraryModuleIndex = null;
let moduleLibraryScopeMi = null;
let moduleLibraryScopeCustomId = null;
let moduleLibrarySearch = '';
let moduleLibraryFilter = 'all';

// ── Folder path utilities ──────────────────────────────────────────────────

function getLibraryFolderRuntime() {
  if (!window.__unitrackLibraryFolders) {
    window.__unitrackLibraryFolders = {
      active: { formula: '', relevant: '' },
      history: { formula: [''], relevant: [''] },
      historyIndex: { formula: 0, relevant: 0 },
    };
  }
  return window.__unitrackLibraryFolders;
}

function getLibraryTypeKey(type) {
  return type === 'formula' ? 'formula' : 'relevant';
}

export function normaliseLibraryFolderPath(path) {
  return String(path || '')
    .replace(/\\+/g, '/')
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean)
    .join('/');
}

export function getLibraryFolderName(path) {
  const parts = normaliseLibraryFolderPath(path).split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : 'All';
}

export function getLibraryFolderParent(path) {
  const parts = normaliseLibraryFolderPath(path).split('/').filter(Boolean);
  parts.pop();
  return parts.join('/');
}

export function joinLibraryFolderPath(parent, child) {
  return [normaliseLibraryFolderPath(parent), normaliseLibraryFolderPath(child)]
    .filter(Boolean)
    .join('/');
}

function jsString(value) {
  return JSON.stringify(String(value || ''))
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function getActiveLibraryFolder(type) {
  const runtime = getLibraryFolderRuntime();
  return normaliseLibraryFolderPath(runtime.active[getLibraryTypeKey(type)] || '');
}

export function setActiveLibraryFolder(type, folder, options = {}) {
  const runtime = getLibraryFolderRuntime();
  const key = getLibraryTypeKey(type);
  const next = normaliseLibraryFolderPath(folder);
  const current = normaliseLibraryFolderPath(runtime.active[key] || '');
  runtime.active[key] = next;
  if (!options.skipHistory && next !== current) {
    const history = runtime.history[key] || [''];
    const index = Number.isInteger(runtime.historyIndex[key]) ? runtime.historyIndex[key] : history.length - 1;
    const trimmed = history.slice(0, index + 1);
    trimmed.push(next);
    runtime.history[key] = trimmed.slice(-40);
    runtime.historyIndex[key] = runtime.history[key].length - 1;
  }
}

export function parseLibraryFilterValue(value) {
  const raw = value === undefined || value === null || value === '' ? 'all' : String(value);
  if (raw.startsWith('custom:')) return { customId: raw.slice(7), mi: null };
  if (raw === 'all') return { customId: null, mi: null };
  const mi = Number(raw);
  return { customId: null, mi: Number.isInteger(mi) ? mi : null };
}

export function getLibraryTarget() {
  if (moduleLibraryScopeCustomId) return { customId: moduleLibraryScopeCustomId, mi: null };
  if (moduleLibraryScopeMi !== null && moduleLibraryScopeMi !== undefined) return { customId: null, mi: moduleLibraryScopeMi };
  return parseLibraryFilterValue(moduleLibraryFilter);
}

function libraryStateIsPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function libraryUniqueSortedPaths(paths) {
  const out = new Set();
  (paths || []).forEach((path) => {
    const clean = normaliseLibraryFolderPath(path);
    if (!clean) return;
    const parts = clean.split('/');
    parts.forEach((_, i) => out.add(parts.slice(0, i + 1).join('/')));
  });
  return Array.from(out).sort((a, b) => a.localeCompare(b));
}

// ── Library folder registry ────────────────────────────────────────────────

function ensureLibraryRegistryArray(container, key) {
  if (!Array.isArray(container[key])) container[key] = [];
  container[key] = libraryUniqueSortedPaths(container[key]);
  return container[key];
}

export function ensureLibraryState() {
  const ys = getStore();
  if (!ys) return null;
  if (!ys.libraryFolders || !libraryStateIsPlainObject(ys.libraryFolders)) {
    ys.libraryFolders = { formula: {}, relevant: {}, custom: {} };
  }
  if (!libraryStateIsPlainObject(ys.libraryFolders.formula)) ys.libraryFolders.formula = {};
  if (!libraryStateIsPlainObject(ys.libraryFolders.relevant)) ys.libraryFolders.relevant = {};
  if (!libraryStateIsPlainObject(ys.libraryFolders.custom)) ys.libraryFolders.custom = {};

  const moduleCount = Array.isArray(ys.modules) ? ys.modules.length : store.MODULES.length;
  for (let mi = 0; mi < moduleCount; mi += 1) {
    const formulaRegistry = ensureLibraryRegistryArray(ys.libraryFolders.formula, String(mi));
    const relevantRegistry = ensureLibraryRegistryArray(ys.libraryFolders.relevant, String(mi));
    libraryUniqueSortedPaths(getFormulaLinks(mi).map((item) => item?.folder)).forEach((path) => {
      if (!formulaRegistry.includes(path)) formulaRegistry.push(path);
    });
    libraryUniqueSortedPaths(getRelevantLinks(mi).map((item) => item?.folder)).forEach((path) => {
      if (!relevantRegistry.includes(path)) relevantRegistry.push(path);
    });
    ys.libraryFolders.formula[String(mi)] = libraryUniqueSortedPaths(formulaRegistry);
    ys.libraryFolders.relevant[String(mi)] = libraryUniqueSortedPaths(relevantRegistry);
  }

  const customLibraries = getCustomLibraries();
  Object.keys(customLibraries).forEach((customId) => {
    if (!ys.libraryFolders.custom[customId] || !libraryStateIsPlainObject(ys.libraryFolders.custom[customId])) {
      ys.libraryFolders.custom[customId] = { formula: [], relevant: [] };
    }
    const customFolderStore = ys.libraryFolders.custom[customId];
    const formulaRegistry = ensureLibraryRegistryArray(customFolderStore, 'formula');
    const relevantRegistry = ensureLibraryRegistryArray(customFolderStore, 'relevant');
    libraryUniqueSortedPaths(getCustomLibraryItems(customId, 'formula').map((item) => item?.folder)).forEach((path) => {
      if (!formulaRegistry.includes(path)) formulaRegistry.push(path);
    });
    libraryUniqueSortedPaths(getCustomLibraryItems(customId, 'relevant').map((item) => item?.folder)).forEach((path) => {
      if (!relevantRegistry.includes(path)) relevantRegistry.push(path);
    });
    customFolderStore.formula = libraryUniqueSortedPaths(formulaRegistry);
    customFolderStore.relevant = libraryUniqueSortedPaths(relevantRegistry);
  });
  return ys.libraryFolders;
}

export function getLibraryFolderRegistry(type, target = null) {
  const ys = getStore();
  if (!ys.libraryFolders || typeof ys.libraryFolders !== 'object' || Array.isArray(ys.libraryFolders)) {
    ys.libraryFolders = { formula: {}, relevant: {}, custom: {} };
  }
  if (!ys.libraryFolders.formula) ys.libraryFolders.formula = {};
  if (!ys.libraryFolders.relevant) ys.libraryFolders.relevant = {};
  if (!ys.libraryFolders.custom) ys.libraryFolders.custom = {};
  const typeKey = getLibraryTypeKey(type);
  const parsed = target || getLibraryTarget();
  if (parsed.customId) {
    if (!ys.libraryFolders.custom[parsed.customId]) ys.libraryFolders.custom[parsed.customId] = { formula: [], relevant: [] };
    if (!Array.isArray(ys.libraryFolders.custom[parsed.customId][typeKey])) ys.libraryFolders.custom[parsed.customId][typeKey] = [];
    return ys.libraryFolders.custom[parsed.customId][typeKey];
  }
  if (parsed.mi !== null && parsed.mi !== undefined) {
    const key = String(parsed.mi);
    if (!Array.isArray(ys.libraryFolders[typeKey][key])) ys.libraryFolders[typeKey][key] = [];
    return ys.libraryFolders[typeKey][key];
  }
  return [];
}

export function addLibraryFolderToRegistry(type, path, target = null) {
  const clean = normaliseLibraryFolderPath(path);
  if (!clean) return;
  const registry = getLibraryFolderRegistry(type, target);
  if (!registry.includes(clean)) registry.push(clean);
  registry.sort((a, b) => a.localeCompare(b));
}

function removeLibraryFolderFromRegistry(type, predicate, target = null) {
  const registry = getLibraryFolderRegistry(type, target);
  for (let i = registry.length - 1; i >= 0; i -= 1) if (predicate(registry[i])) registry.splice(i, 1);
}

function renameLibraryFolderInRegistry(type, oldPath, newPath, target = null) {
  const registry = getLibraryFolderRegistry(type, target);
  const oldClean = normaliseLibraryFolderPath(oldPath);
  const newClean = normaliseLibraryFolderPath(newPath);
  const next = new Set();
  registry.forEach((folder) => {
    const clean = normaliseLibraryFolderPath(folder);
    if (clean === oldClean) next.add(newClean);
    else if (clean.startsWith(oldClean + '/')) next.add(newClean + clean.slice(oldClean.length));
    else next.add(clean);
  });
  registry.splice(0, registry.length, ...Array.from(next).filter(Boolean).sort((a, b) => a.localeCompare(b)));
}

// ── Item normalisation ─────────────────────────────────────────────────────

function normaliseLibraryTimestamp(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function libraryTimestampMs(value) {
  const iso = normaliseLibraryTimestamp(value);
  return iso ? Date.parse(iso) : 0;
}

function libraryNowIso() {
  return new Date().toISOString();
}

function normalizeLibraryItem(item, fallbackName = 'Saved item') {
  if (typeof item === 'string') {
    return { name: fallbackName, url: item, tag: '', notes: '', folder: '', createdAt: '', updatedAt: '' };
  }
  if (!item || typeof item !== 'object') {
    return { name: fallbackName, url: '', tag: '', notes: '', folder: '', createdAt: '', updatedAt: '' };
  }
  const createdAt = normaliseLibraryTimestamp(item.createdAt || item.addedAt || item.savedAt || '');
  const updatedAt = normaliseLibraryTimestamp(item.updatedAt || createdAt || item.addedAt || item.savedAt || '');
  return {
    name: String(item.name || item.title || fallbackName).trim() || fallbackName,
    url: String(item.url || item.href || '').trim(),
    tag: String(item.tag || item.category || '').trim(),
    notes: String(item.notes || item.note || '').trim(),
    folder: normaliseLibraryFolderPath(item.folder || item.folderPath || ''),
    createdAt,
    updatedAt,
  };
}

// ── Formula / Relevant link accessors ─────────────────────────────────────

export function getFormulaLinks(mi) {
  const ys = getStore();
  const raw = ys.formulas?.[mi];
  if (Array.isArray(raw)) {
    const mod = store.MODULES[mi];
    return raw
      .map((item) => normalizeLibraryItem(item, `${mod?.short || mod?.kanji || 'Module'} Material`))
      .filter((item) => item.url);
  }
  if (typeof raw === 'string' && raw.trim()) {
    const mod = store.MODULES[mi];
    return [normalizeLibraryItem(raw, `${mod?.short || mod?.kanji || 'Module'} Material`)];
  }
  return [];
}

export function getRelevantLinks(mi) {
  const ys = getStore();
  if (!ys.relevantLinks) ys.relevantLinks = {};
  const raw = ys.relevantLinks[mi];
  if (Array.isArray(raw)) {
    return raw.map((item) => normalizeLibraryItem(item, 'Useful resource')).filter((item) => item.url);
  }
  if (typeof raw === 'string' && raw.trim()) {
    return [normalizeLibraryItem(raw, 'Useful resource')];
  }
  return [];
}

// ── Custom libraries ───────────────────────────────────────────────────────

export function getCustomLibraries() {
  const ys = getStore();
  if (!ys.customLibraries || typeof ys.customLibraries !== 'object' || Array.isArray(ys.customLibraries)) {
    ys.customLibraries = {};
  }
  return ys.customLibraries;
}

export function getCustomLibrary(id) {
  return getCustomLibraries()[id] || null;
}

export function getCustomLibraryItems(id, type) {
  const library = getCustomLibrary(id);
  const key = type === 'formula' ? 'materials' : 'relevantLinks';
  const raw = library?.[key];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => normalizeLibraryItem(item, type === 'formula' ? 'Saved material' : 'Useful resource'))
    .filter((item) => item.url);
}

export function getLibraryContextLabel(context) {
  if (context?.customId) return getCustomLibrary(context.customId)?.name || 'Custom Library';
  const mod = store.MODULES[context?.mi];
  return mod?.short || mod?.kanji || 'Module';
}

export function getLibrarySourceArray(type, target = null) {
  const parsed = target || getLibraryTarget();
  const ys = getStore();
  if (parsed.customId) {
    const library = getCustomLibrary(parsed.customId);
    if (!library) return null;
    const key = type === 'formula' ? 'materials' : 'relevantLinks';
    if (!Array.isArray(library[key])) library[key] = [];
    return library[key];
  }
  if (parsed.mi !== null && parsed.mi !== undefined) {
    if (type === 'formula') {
      if (!ys.formulas) ys.formulas = {};
      if (!Array.isArray(ys.formulas[parsed.mi])) ys.formulas[parsed.mi] = getFormulaLinks(parsed.mi);
      return ys.formulas[parsed.mi];
    }
    if (!ys.relevantLinks) ys.relevantLinks = {};
    if (!Array.isArray(ys.relevantLinks[parsed.mi])) ys.relevantLinks[parsed.mi] = getRelevantLinks(parsed.mi);
    return ys.relevantLinks[parsed.mi];
  }
  return null;
}

export function setLibraryItemFolder(type, itemIndex, folderPath) {
  const clean = normaliseLibraryFolderPath(folderPath);
  const items = getLibrarySourceArray(type);
  if (!Array.isArray(items) || !items[itemIndex]) return false;
  items[itemIndex].folder = clean;
  if (clean) addLibraryFolderToRegistry(type, clean);
  ensureLibraryState();
  save();
  renderModuleLibrary();
  return true;
}

// ── Library type suggestions ───────────────────────────────────────────────

const DEFAULT_LIBRARY_TYPE_SUGGESTIONS = {
  formula: ['Lecture slides','Lecture notes','Revision notes','Tutorial sheet','Worksheet','Past paper','Model answers','Formula sheet','Lab handout','Assignment brief','Reading','Recording'],
  relevant: ['Article','Reference site','Video','Documentation','Research paper','Textbook chapter','Dataset','Guide','Forum thread','Tool'],
};

function getLibraryTypeSuggestions(type = 'formula') {
  const ys = getStore();
  if (!ys.libraryItemTypes || typeof ys.libraryItemTypes !== 'object' || Array.isArray(ys.libraryItemTypes)) ys.libraryItemTypes = {};
  const key = type === 'relevant' ? 'relevant' : 'formula';
  const saved = Array.isArray(ys.libraryItemTypes[key]) ? ys.libraryItemTypes[key] : [];
  const combined = [...DEFAULT_LIBRARY_TYPE_SUGGESTIONS[key], ...saved].map((item) => String(item || '').trim()).filter(Boolean);
  return Array.from(new Set(combined)).sort((a, b) => a.localeCompare(b));
}

function saveLibraryTypeSuggestion(type, value) {
  const text = String(value || '').trim();
  if (!text) return;
  const ys = getStore();
  if (!ys.libraryItemTypes || typeof ys.libraryItemTypes !== 'object' || Array.isArray(ys.libraryItemTypes)) ys.libraryItemTypes = {};
  const key = type === 'relevant' ? 'relevant' : 'formula';
  const current = Array.isArray(ys.libraryItemTypes[key]) ? ys.libraryItemTypes[key] : [];
  if (current.some((item) => String(item || '').trim().toLowerCase() === text.toLowerCase())) return;
  ys.libraryItemTypes[key] = [...current, text].sort((a, b) => a.localeCompare(b));
}

function populateLibraryTypeOptions(type = 'formula') {
  const list = document.getElementById('link-tag-options');
  if (!list) return;
  list.innerHTML = getLibraryTypeSuggestions(type).map((item) => `<option value="${escapeHtml(item)}"></option>`).join('');
}

// ── Link form ──────────────────────────────────────────────────────────────

export function openLinkForm(context) {
  linkFormContext = context;
  const modal = document.getElementById('link-form-modal');
  const subtitle = document.getElementById('link-form-subtitle');
  const title = document.getElementById('link-form-title');
  const nameField = document.getElementById('link-name-field');
  const nameInput = document.getElementById('link-name-input');
  const urlInput = document.getElementById('link-url-input');
  const tagInput = document.getElementById('link-tag-input');
  const tagLabel = document.getElementById('link-tag-label');
  const tagField = document.getElementById('link-tag-field');
  const notesInput = document.getElementById('link-notes-input');
  const folderInput = document.getElementById('link-folder-input');
  const folderField = document.getElementById('link-folder-field');

  nameInput.value = '';
  urlInput.value = '';
  tagInput.value = '';
  notesInput.value = '';
  if (folderInput) folderInput.value = normaliseLibraryFolderPath(context.folder || getActiveLibraryFolder(context.type));
  nameField.style.display = 'block';
  if (folderField) folderField.style.display = 'block';
  if (tagField) tagField.style.display = 'block';

  const editingItem = context.mode === 'edit'
    ? (context.customId
      ? getCustomLibraryItems(context.customId, context.type)[context.index]
      : (context.type === 'formula' ? getFormulaLinks(context.mi)[context.index] : getRelevantLinks(context.mi)[context.index]))
    : null;

  if (context.type === 'blackboard') {
    subtitle.textContent = 'Blackboard';
    title.textContent = 'Set Blackboard Link';
    nameField.style.display = 'none';
    urlInput.value = getBlackboardLink(context.mi) || '';
    tagInput.closest('.deadline-form-row').style.display = 'none';
    if (tagField) tagField.style.display = 'none';
    if (folderField) folderField.style.display = 'none';
  } else if (context.type === 'formula') {
    subtitle.textContent = 'Module Material';
    title.textContent = context.mode === 'edit' ? 'Edit Module Material' : 'Add Module Material';
    nameInput.value = editingItem?.name || (getLibraryContextLabel(context) + ' Material');
    tagInput.closest('.deadline-form-row').style.display = 'grid';
    if (tagLabel) tagLabel.textContent = 'Resource Type';
    tagInput.placeholder = 'Lecture slides';
    populateLibraryTypeOptions('formula');
  } else {
    subtitle.textContent = 'Relevant Links';
    title.textContent = context.mode === 'edit' ? 'Edit Relevant Link' : 'Add Relevant Link';
    nameInput.value = editingItem?.name || 'Useful resource';
    tagInput.closest('.deadline-form-row').style.display = 'grid';
    if (tagLabel) tagLabel.textContent = 'Link Type';
    tagInput.placeholder = 'Reference site';
    populateLibraryTypeOptions('relevant');
  }

  if (editingItem) {
    urlInput.value = editingItem.url || '';
    tagInput.value = editingItem.tag || '';
    notesInput.value = editingItem.notes || '';
    if (folderInput) folderInput.value = normaliseLibraryFolderPath(editingItem.folder || context.folder || getActiveLibraryFolder(context.type));
  }

  if (context?.fromLibrary) modal.classList.add('library-v10-link-modal');
  else modal.classList.remove('library-v10-link-modal');
  modal.classList.remove('hidden');
  syncModalScrollLock();
  setTimeout(() => (nameField.style.display === 'none' ? urlInput : nameInput).focus(), 0);
}

export function closeLinkForm() {
  const shouldReturnToLibrary = !!linkFormContext?.fromLibrary;
  const modal = document.getElementById('link-form-modal');
  modal.classList.add('hidden');
  modal.classList.remove('library-v10-link-modal');
  linkFormContext = null;
  if (shouldReturnToLibrary) {
    document.getElementById('module-library-modal')?.classList.remove('hidden');
    renderModuleLibrary();
    syncModalScrollLock();
    return;
  }
  syncModalScrollLock();
}

export function saveLinkForm() {
  if (!linkFormContext) return;
  ensureLibraryState();
  const nameInput = document.getElementById('link-name-input');
  const urlInput = document.getElementById('link-url-input');
  const tagInput = document.getElementById('link-tag-input');
  const notesInput = document.getElementById('link-notes-input');
  const folderInput = document.getElementById('link-folder-input');
  const url = (urlInput.value || '').trim();
  const ys = getStore();

  if (linkFormContext.type === 'blackboard') {
    if (url) ys.blackboard[linkFormContext.mi] = safeUrl(url);
    else delete ys.blackboard[linkFormContext.mi];
    save();
    updateBlackboardButton(linkFormContext.mi);
    closeLinkForm();
    return;
  }

  const name = (nameInput.value || '').trim();
  const tag = (tagInput.value || '').trim();
  const notes = (notesInput.value || '').trim();
  const folder = normaliseLibraryFolderPath(folderInput?.value || linkFormContext.folder || getActiveLibraryFolder(linkFormContext.type));
  if (!name || !url) { alert('Please enter both a name and a URL.'); return; }

  let existingItem = null;
  if (linkFormContext.mode === 'edit') {
    if (linkFormContext.customId) existingItem = getCustomLibraryItems(linkFormContext.customId, linkFormContext.type)[linkFormContext.index] || null;
    else if (linkFormContext.type === 'formula') existingItem = getFormulaLinks(linkFormContext.mi)[linkFormContext.index] || null;
    else existingItem = getRelevantLinks(linkFormContext.mi)[linkFormContext.index] || null;
  }
  const now = libraryNowIso();
  const payload = { name, url: safeUrl(url), tag, notes, folder, createdAt: normaliseLibraryTimestamp(existingItem?.createdAt) || now, updatedAt: now };
  if (tag) saveLibraryTypeSuggestion(linkFormContext.type, tag);
  if (folder) addLibraryFolderToRegistry(linkFormContext.type, folder, { customId: linkFormContext.customId || null, mi: linkFormContext.mi ?? null });

  if (linkFormContext.customId) {
    const library = getCustomLibraries()[linkFormContext.customId];
    if (!library) return;
    const key = linkFormContext.type === 'formula' ? 'materials' : 'relevantLinks';
    const items = getCustomLibraryItems(linkFormContext.customId, linkFormContext.type).slice();
    if (linkFormContext.mode === 'edit' && items[linkFormContext.index]) items[linkFormContext.index] = payload;
    else items.push(payload);
    library[key] = items;
    library.updatedAt = now;
    save();
  } else if (linkFormContext.type === 'formula') {
    const items = getFormulaLinks(linkFormContext.mi).slice();
    if (linkFormContext.mode === 'edit' && items[linkFormContext.index]) items[linkFormContext.index] = payload;
    else items.push(payload);
    ys.formulas[linkFormContext.mi] = items;
    save();
    updateFormulaButton(linkFormContext.mi);
  } else {
    if (!ys.relevantLinks) ys.relevantLinks = {};
    const items = getRelevantLinks(linkFormContext.mi).slice();
    if (linkFormContext.mode === 'edit' && items[linkFormContext.index]) items[linkFormContext.index] = payload;
    else items.push(payload);
    ys.relevantLinks[linkFormContext.mi] = items;
    save();
    renderRelevantLinks(linkFormContext.mi);
  }
  closeLinkForm();
  renderModuleLibrary();
}

// ── Blackboard helpers ─────────────────────────────────────────────────────

export function getBlackboardLink(mi) {
  return getStore().blackboard?.[mi] || '';
}

export function setBlackboardLink(mi, event) {
  if (event) event.stopPropagation();
  openLinkForm({ type: 'blackboard', mi });
}

export function openBlackboardLink(mi, event) {
  if (event) event.stopPropagation();
  const url = getBlackboardLink(mi);
  if (url) openTrustedUrl(url);
  else setBlackboardLink(mi);
}

export function updateBlackboardButton(mi) {
  const btn = document.getElementById(`bb-link-${mi}`);
  if (!btn) return;
  const hasLink = !!getBlackboardLink(mi);
  const compact = document.body.classList.contains('compact-ui');
  btn.textContent = hasLink ? (compact ? 'Blackboard' : 'Launch Blackboard') : (compact ? 'Set' : 'Set Blackboard');
}

// ── Formula / Relevant link CRUD ───────────────────────────────────────────

export function setFormulaLink(mi, event) {
  if (event) event.stopPropagation();
  openLinkForm({ type: 'formula', mi });
}

export function deleteFormulaLink(mi, index, event) {
  if (event) event.stopPropagation();
  const items = getFormulaLinks(mi).slice();
  if (!items[index]) return;
  items.splice(index, 1);
  const ys = getStore();
  if (items.length) ys.formulas[mi] = items; else delete ys.formulas[mi];
  save();
  updateFormulaButton(mi);
  renderModuleLibrary();
}

export function renderFormulaLinks(mi) {
  const host = document.getElementById(`formula-links-${mi}`);
  if (!host) return;
  const items = getFormulaLinks(mi);
  if (!items.length) { host.innerHTML = '<div class="formula-empty">No module material added yet.</div>'; return; }
  host.innerHTML = items.map((item, index) => `
    <div class="formula-chip">
      <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.name)}</a>
      <button class="formula-remove-btn" type="button" onclick="deleteFormulaLink(${mi},${index},event)" title="Delete">x</button>
    </div>`).join('');
}

export function updateFormulaButton(mi) {
  const btn = document.getElementById(`formula-btn-${mi}`);
  if (btn) {
    const count = getFormulaLinks(mi).length;
    const compact = document.body.classList.contains('compact-ui');
    const mod = store.MODULES[mi] || {};
    const labelBase = mod.kanji || mod.short || 'Module';
    btn.textContent = compact ? 'Library' : `${labelBase} Library`;
    btn.title = `${mod.name || labelBase} Library`;
    btn.style.opacity = count ? '1' : '0.65';
  }
  renderFormulaLinks(mi);
}

export function addRelevantLink(mi, event) {
  if (event) event.stopPropagation();
  openLinkForm({ type: 'relevant', mi });
}

export function deleteRelevantLink(mi, index, event) {
  if (event) event.stopPropagation();
  const items = getRelevantLinks(mi).slice();
  if (!items[index]) return;
  items.splice(index, 1);
  const ys = getStore();
  if (!ys.relevantLinks) ys.relevantLinks = {};
  if (items.length) ys.relevantLinks[mi] = items; else delete ys.relevantLinks[mi];
  save();
  renderRelevantLinks(mi);
  renderModuleLibrary();
}

export function renderRelevantLinks(mi) {
  const host = document.getElementById(`relevant-links-${mi}`);
  if (!host) return;
  const items = getRelevantLinks(mi);
  if (!items.length) { host.innerHTML = '<div class="relevant-links-empty">No relevant links added yet.</div>'; return; }
  host.innerHTML = items.map((item, index) => `
    <div class="relevant-link-chip">
      <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.name)}</a>
      <button class="relevant-link-remove-btn" type="button" onclick="deleteRelevantLink(${mi},${index},event)" title="Delete">x</button>
    </div>`).join('');
}

// ── libraryClean V10 state ─────────────────────────────────────────────────

function libraryCleanState() {
  if (!window.__unitrackLibraryCleanV10) {
    window.__unitrackLibraryCleanV10 = {
      sourceKey: 'all', folderBySource: {}, historyBySource: {}, historyIndexBySource: {},
      selected: null, dragRecordKey: '', sortMode: 'recent', viewMode: 'details',
      showAllSources: false, sourceMenuKey: '',
    };
  }
  return window.__unitrackLibraryCleanV10;
}

function libraryCleanSourceKey(source) {
  if (!source) return 'all';
  if (source.kind === 'module') return `module:${source.mi}`;
  if (source.kind === 'custom') return `custom:${source.customId}`;
  return 'all';
}

function getPinnedLibrarySourceKeys() {
  const ys = getStore();
  if (!Array.isArray(ys.pinnedLibrarySources)) ys.pinnedLibrarySources = [];
  return ys.pinnedLibrarySources.map((k) => String(k || '').trim()).filter((k) => k && k !== 'all');
}

function libraryCleanPinnedSourceKeys() {
  const valid = new Set(libraryCleanAllSources().map((s) => s.key));
  const next = getPinnedLibrarySourceKeys().filter((k) => valid.has(k));
  const ys = getStore();
  if (next.length !== ys.pinnedLibrarySources.length) ys.pinnedLibrarySources = next;
  return next;
}

function libraryCleanIsPinnedSource(key) {
  return libraryCleanPinnedSourceKeys().includes(String(key || ''));
}

export function togglePinnedLibrarySource(key, event) {
  if (event) { event.preventDefault(); event.stopPropagation(); }
  const sourceKey = String(key || '').trim();
  if (!sourceKey || sourceKey === 'all') return;
  const ys = getStore();
  const current = libraryCleanPinnedSourceKeys();
  ys.pinnedLibrarySources = current.includes(sourceKey) ? current.filter((k) => k !== sourceKey) : [...current, sourceKey];
  libraryCleanState().sourceMenuKey = '';
  save();
  renderModuleLibrary();
}

export function libraryCleanToggleAllSources(event) {
  if (event) { event.preventDefault(); event.stopPropagation(); }
  libraryCleanState().showAllSources = !libraryCleanState().showAllSources;
  renderModuleLibrary();
}

export function libraryCleanToggleSourceMenu(key, event) {
  if (event) { event.preventDefault(); event.stopPropagation(); }
  const st = libraryCleanState();
  const sourceKey = String(key || '').trim();
  st.sourceMenuKey = st.sourceMenuKey === sourceKey ? '' : sourceKey;
  renderModuleLibrary();
}

export function libraryCleanCloseSourceMenu() {
  const st = libraryCleanState();
  if (!st.sourceMenuKey) return;
  st.sourceMenuKey = '';
  renderModuleLibrary();
}

// ── Colour helpers (delegate to rendering.js via window) ──────────────────

function getCustomLibraryColourHex(customId) {
  const library = getCustomLibrary(customId);
  const fallback = '#7f6aa7';
  if (!library || !window.isColourCustomisableTheme?.()) return fallback;
  const family = store.preferences.theme === 'dark' ? 'dark' : 'light';
  return window.normaliseHexColour?.(library.colour?.[family] || library.color?.[family] || fallback, fallback) ?? fallback;
}

function getCustomLibraryColourSet(customId) {
  return window.buildModuleColourFromHex?.(getCustomLibraryColourHex(customId)) ?? {};
}

export function setCustomLibraryColour(customId, colourValue, event) {
  if (event) event.stopPropagation();
  if (!window.isColourCustomisableTheme?.()) return;
  const library = getCustomLibrary(customId);
  if (!library) return;
  const family = store.preferences.theme === 'dark' ? 'dark' : 'light';
  library.colour = Object.assign({}, library.colour || library.color || {}, { [family]: window.normaliseHexColour?.(colourValue, '#7f6aa7') ?? colourValue });
  library.updatedAt = libraryNowIso();
  save();
  renderModuleLibrary();
}

// ── Source parsing + all-sources list ─────────────────────────────────────

export function libraryCleanParseSourceKey(key) {
  const raw = String(key || 'all');
  if (raw.startsWith('module:')) {
    const mi = Number(raw.slice(7));
    if (Number.isInteger(mi) && store.MODULES[mi]) return libraryCleanAllSources().find((s) => s.kind === 'module' && s.mi === mi) || { kind: 'module', mi, key: raw };
  }
  if (raw.startsWith('custom:')) {
    const customId = raw.slice(7);
    const library = getCustomLibrary(customId);
    if (library) return libraryCleanAllSources().find((s) => s.kind === 'custom' && s.customId === customId) || { kind: 'custom', customId, key: raw };
  }
  return { kind: 'all', key: 'all', code: 'Library Home', label: 'Library Home', name: 'All Content', accent: 'var(--gold2)' };
}

export function libraryCleanAllSources() {
  const sources = [{ kind: 'all', key: 'all', code: 'Library Home', label: 'Library Home', name: 'All Content', accent: 'var(--gold2)' }];
  store.MODULES.forEach((mod, mi) => {
    const colour = window.getModuleColourSet?.(mi) || {};
    sources.push({ kind: 'module', key: `module:${mi}`, mi, code: mod.kanji || mod.short || `Module ${mi + 1}`, label: mod.kanji || mod.short || `Module ${mi + 1}`, name: mod.name || mod.short || `Module ${mi + 1}`, accent: colour?.stripe || colour?.text || 'var(--gold2)' });
  });
  Object.entries(getCustomLibraries()).forEach(([customId, library]) => {
    const colour = getCustomLibraryColourSet(customId);
    sources.push({ kind: 'custom', key: `custom:${customId}`, customId, code: library.name || 'Custom', label: library.name || 'Custom Library', name: library.name || 'Custom Library', description: library.description || '', accent: colour?.stripe || colour?.text || '#7f6aa7' });
  });
  return sources;
}

function libraryCleanSelectedSource() {
  return libraryCleanParseSourceKey(libraryCleanState().sourceKey || 'all');
}

export function libraryCleanSetSource(key, options = {}) {
  const source = libraryCleanParseSourceKey(key);
  const st = libraryCleanState();
  st.sourceKey = libraryCleanSourceKey(source);
  st.selected = null;
  if (!st.folderBySource[st.sourceKey]) st.folderBySource[st.sourceKey] = '';
  if (!st.historyBySource[st.sourceKey]) st.historyBySource[st.sourceKey] = [st.folderBySource[st.sourceKey] || ''];
  if (!Number.isInteger(st.historyIndexBySource[st.sourceKey])) st.historyIndexBySource[st.sourceKey] = st.historyBySource[st.sourceKey].length - 1;
  moduleLibraryFilter = source.kind === 'all' ? 'all' : source.kind === 'custom' ? `custom:${source.customId}` : String(source.mi);
  moduleLibraryScopeMi = source.kind === 'module' ? source.mi : null;
  moduleLibraryScopeCustomId = source.kind === 'custom' ? source.customId : null;
  if (!options.silent) renderModuleLibrary();
}

function libraryCleanCurrentFolder(source = libraryCleanSelectedSource()) {
  if (!source || source.kind === 'all') return '';
  const key = libraryCleanSourceKey(source);
  return normaliseLibraryFolderPath(libraryCleanState().folderBySource[key] || '');
}

export function libraryCleanSetFolder(folder, source = libraryCleanSelectedSource(), options = {}) {
  if (!source || source.kind === 'all') return;
  const key = libraryCleanSourceKey(source);
  const clean = normaliseLibraryFolderPath(folder);
  const st = libraryCleanState();
  st.folderBySource[key] = clean;
  st.selected = null;
  if (!st.historyBySource[key]) st.historyBySource[key] = [''];
  if (!Number.isInteger(st.historyIndexBySource[key])) st.historyIndexBySource[key] = st.historyBySource[key].length - 1;
  if (!options.replaceHistory) {
    const history = st.historyBySource[key].slice(0, st.historyIndexBySource[key] + 1);
    if (history[history.length - 1] !== clean) history.push(clean);
    st.historyBySource[key] = history;
    st.historyIndexBySource[key] = history.length - 1;
  }
  if (!options.silent) renderModuleLibrary();
}

export function libraryCleanStepHistory(direction, event) {
  if (event) event.stopPropagation();
  const source = libraryCleanSelectedSource();
  if (source.kind === 'all') return;
  const key = libraryCleanSourceKey(source);
  const st = libraryCleanState();
  const history = st.historyBySource[key] || [''];
  const nextIndex = Math.max(0, Math.min(history.length - 1, (st.historyIndexBySource[key] || 0) + direction));
  st.historyIndexBySource[key] = nextIndex;
  st.folderBySource[key] = history[nextIndex] || '';
  st.selected = null;
  renderModuleLibrary();
}

export function libraryCleanParentFolder(event) {
  if (event) event.stopPropagation();
  const folder = libraryCleanCurrentFolder();
  if (!folder) return;
  libraryCleanSetFolder(getLibraryFolderParent(folder));
}

// ── Record building ────────────────────────────────────────────────────────

const LIBRARY_CLEAN_ITEM_TYPES = ['formula', 'relevant'];

function libraryCleanItemTypeLabel(type) { return type === 'relevant' ? 'Link' : 'Material'; }
function libraryCleanCollectionKey(type) { return type === 'relevant' ? 'relevantLinks' : 'materials'; }
function libraryCleanTargetForSource(source) {
  if (!source || source.kind === 'all') return null;
  return source.kind === 'custom' ? { customId: source.customId } : { mi: source.mi };
}

function libraryCleanNormaliseArrayItems(raw, fallbackName = 'Saved material') {
  if (Array.isArray(raw)) return raw.map((item) => normalizeLibraryItem(item, fallbackName)).filter((item) => item.url);
  if (typeof raw === 'string' && raw.trim()) return [normalizeLibraryItem(raw, fallbackName)];
  return [];
}

function libraryCleanSourceItems(source, type = 'formula') {
  const ys = getStore();
  if (!source || source.kind === 'all') return [];
  if (source.kind === 'module') {
    const mod = store.MODULES[source.mi] || {};
    if (type === 'relevant') {
      if (!ys.relevantLinks) ys.relevantLinks = {};
      const items = libraryCleanNormaliseArrayItems(ys.relevantLinks[source.mi], `${mod.short || mod.kanji || 'Module'} Link`);
      ys.relevantLinks[source.mi] = items;
      return items;
    }
    if (!ys.formulas) ys.formulas = {};
    const items = libraryCleanNormaliseArrayItems(ys.formulas[source.mi], `${mod.short || mod.kanji || 'Module'} Material`);
    ys.formulas[source.mi] = items;
    return items;
  }
  if (source.kind === 'custom') {
    const library = getCustomLibrary(source.customId);
    if (!library) return [];
    const key = libraryCleanCollectionKey(type);
    library[key] = libraryCleanNormaliseArrayItems(library[key], type === 'relevant' ? 'Saved link' : 'Saved material');
    return library[key];
  }
  return [];
}

function libraryCleanRecords(options = {}) {
  const sourceFilter = options.source || null;
  const types = options.type && LIBRARY_CLEAN_ITEM_TYPES.includes(options.type) ? [options.type] : LIBRARY_CLEAN_ITEM_TYPES;
  const sources = sourceFilter && sourceFilter.kind !== 'all' ? [sourceFilter] : libraryCleanAllSources().filter((s) => s.kind !== 'all');
  const records = [];
  sources.forEach((source) => {
    types.forEach((type) => {
      libraryCleanSourceItems(source, type).forEach((item, index) => {
        records.push({
          kind: 'item', type, typeLabel: libraryCleanItemTypeLabel(type),
          key: `${source.key}:${type}:item:${index}`, sourceKey: source.key, source, index, item,
          name: item.name || (type === 'relevant' ? 'Saved link' : 'Saved material'),
          url: item.url || '', tag: item.tag || '', notes: item.notes || '',
          folder: normaliseLibraryFolderPath(item.folder || ''),
          createdAt: normaliseLibraryTimestamp(item.createdAt || ''),
          updatedAt: normaliseLibraryTimestamp(item.updatedAt || item.createdAt || ''),
          accent: source.accent,
        });
      });
    });
  });
  return records;
}

function libraryCleanEnsureFolderAncestors(paths) {
  const set = new Set();
  paths.forEach((path) => {
    const clean = normaliseLibraryFolderPath(path);
    if (!clean) return;
    const parts = clean.split('/');
    for (let i = 1; i <= parts.length; i += 1) set.add(parts.slice(0, i).join('/'));
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function libraryCleanRegistry(source, type = null) {
  if (!source || source.kind === 'all') return [];
  const target = libraryCleanTargetForSource(source);
  if (type && LIBRARY_CLEAN_ITEM_TYPES.includes(type)) return getLibraryFolderRegistry(type, target);
  return libraryCleanEnsureFolderAncestors([...getLibraryFolderRegistry('formula', target), ...getLibraryFolderRegistry('relevant', target)]);
}

function libraryCleanAllFolderPathsForSource(source) {
  if (!source || source.kind === 'all') return [];
  const registry = libraryCleanRegistry(source).map(normaliseLibraryFolderPath).filter(Boolean);
  const fromItems = libraryCleanRecords({ source }).map((r) => normaliseLibraryFolderPath(r.folder)).filter(Boolean);
  const all = libraryCleanEnsureFolderAncestors([...registry, ...fromItems]);
  const target = libraryCleanTargetForSource(source);
  LIBRARY_CLEAN_ITEM_TYPES.forEach((type) => {
    const reg = getLibraryFolderRegistry(type, target);
    all.forEach((folder) => { if (folder && !reg.includes(folder)) reg.push(folder); });
    reg.sort((a, b) => a.localeCompare(b));
  });
  return all;
}

function libraryCleanAllFolderRecords() {
  const folders = [];
  libraryCleanAllSources().filter((s) => s.kind !== 'all').forEach((source) => {
    libraryCleanAllFolderPathsForSource(source).forEach((folder) => {
      folders.push({ kind: 'folder', key: `${source.key}:folder:${folder}`, sourceKey: source.key, source, folder, name: getLibraryFolderName(folder), accent: source.accent });
    });
  });
  return folders;
}

function libraryCleanImmediateFolders(source, parentFolder = '') {
  const parent = normaliseLibraryFolderPath(parentFolder);
  const out = new Map();
  libraryCleanAllFolderPathsForSource(source).forEach((folder) => {
    const clean = normaliseLibraryFolderPath(folder);
    if (!clean) return;
    let childPath = '';
    if (!parent) { childPath = clean.split('/')[0]; }
    else if (clean.startsWith(parent + '/')) { const rest = clean.slice(parent.length + 1); const next = rest.split('/')[0]; if (next) childPath = `${parent}/${next}`; }
    else return;
    if (childPath && !out.has(childPath)) {
      out.set(childPath, { kind: 'folder', key: `${source.key}:folder:${childPath}`, sourceKey: source.key, source, folder: childPath, name: getLibraryFolderName(childPath), accent: source.accent });
    }
  });
  return Array.from(out.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function libraryCleanItemsInFolder(source, folder) {
  const current = normaliseLibraryFolderPath(folder);
  return libraryCleanRecords({ source }).filter((r) => normaliseLibraryFolderPath(r.folder) === current);
}

// ── Search + sort ──────────────────────────────────────────────────────────

function libraryCleanSearchTokens(query) {
  return String(query || '').toLowerCase().split(/\s+/).map((t) => t.trim()).filter(Boolean);
}
function libraryCleanMatchesSearch(parts, query) {
  const tokens = libraryCleanSearchTokens(query);
  if (!tokens.length) return true;
  const haystack = parts.filter(Boolean).join(' ').toLowerCase();
  return tokens.every((t) => haystack.includes(t));
}
function libraryCleanItemActivityValue(record) {
  return Math.max(libraryTimestampMs(record.updatedAt), libraryTimestampMs(record.createdAt));
}
function libraryCleanFolderActivityValue(folderRecord) {
  const folderPath = normaliseLibraryFolderPath(folderRecord.folder);
  return libraryCleanRecords({ source: folderRecord.source }).reduce((latest, r) => {
    const rf = normaliseLibraryFolderPath(r.folder);
    if (rf !== folderPath && !rf.startsWith(folderPath + '/')) return latest;
    return Math.max(latest, libraryCleanItemActivityValue(r));
  }, 0);
}

function libraryCleanSortMode() { return libraryCleanState().sortMode || 'recent'; }
export function libraryCleanSetSortMode(value) {
  const allowed = new Set(['recent','oldest','updated','az','za','library','type','folder']);
  libraryCleanState().sortMode = allowed.has(value) ? value : 'recent';
  renderModuleLibrary();
}
function libraryCleanViewMode() { return libraryCleanState().viewMode || 'details'; }
export function libraryCleanSetViewMode(value) {
  libraryCleanState().viewMode = value === 'cards' ? 'cards' : 'details';
  renderModuleLibrary();
}
export function libraryCleanToggleSort(key) {
  const current = libraryCleanSortMode();
  if (key === 'name') { libraryCleanSetSortMode(current === 'az' ? 'za' : 'az'); return; }
  if (key === 'date') { libraryCleanSetSortMode(current === 'recent' ? 'oldest' : 'recent'); return; }
  if (key === 'library') { libraryCleanSetSortMode('library'); return; }
  if (key === 'type') { libraryCleanSetSortMode('type'); return; }
  if (key === 'folder') libraryCleanSetSortMode('folder');
}

function libraryCleanSortItems(items) {
  const mode = libraryCleanSortMode();
  return items.slice().sort((a, b) => {
    if (mode === 'az') return a.name.localeCompare(b.name) || a.source.code.localeCompare(b.source.code);
    if (mode === 'za') return b.name.localeCompare(a.name) || a.source.code.localeCompare(b.source.code);
    if (mode === 'library') return (a.source.code || '').localeCompare(b.source.code || '') || a.name.localeCompare(b.name);
    if (mode === 'type') return (a.typeLabel || '').localeCompare(b.typeLabel || '') || a.name.localeCompare(b.name);
    if (mode === 'folder') return (a.folder || '').localeCompare(b.folder || '') || a.name.localeCompare(b.name);
    if (mode === 'updated') return libraryCleanItemActivityValue(b) - libraryCleanItemActivityValue(a) || libraryTimestampMs(b.createdAt) - libraryTimestampMs(a.createdAt) || a.name.localeCompare(b.name);
    if (mode === 'oldest') return libraryTimestampMs(a.createdAt) - libraryTimestampMs(b.createdAt) || a.name.localeCompare(b.name);
    return libraryTimestampMs(b.createdAt) - libraryTimestampMs(a.createdAt) || libraryCleanItemActivityValue(b) - libraryCleanItemActivityValue(a) || a.name.localeCompare(b.name);
  });
}

function libraryCleanSortFolders(folders) {
  const mode = libraryCleanSortMode();
  return folders.slice().sort((a, b) => {
    if (mode === 'az') return a.name.localeCompare(b.name);
    if (mode === 'za') return b.name.localeCompare(a.name);
    if (mode === 'library') return (a.source.code || '').localeCompare(b.source.code || '') || a.name.localeCompare(b.name);
    if (mode === 'type') return -1;
    if (mode === 'folder') return (a.folder || '').localeCompare(b.folder || '') || a.name.localeCompare(b.name);
    if (mode === 'oldest') return libraryCleanFolderActivityValue(a) - libraryCleanFolderActivityValue(b) || a.name.localeCompare(b.name);
    return libraryCleanFolderActivityValue(b) - libraryCleanFolderActivityValue(a) || a.name.localeCompare(b.name);
  });
}

function libraryCleanCountsForSource(source) {
  if (source.kind === 'all') return { items: libraryCleanRecords().length, folders: libraryCleanAllFolderRecords().length };
  return { items: libraryCleanRecords({ source }).length, folders: libraryCleanAllFolderPathsForSource(source).length };
}

function libraryCleanFormatActivityLabel(record) {
  const updated = libraryTimestampMs(record.updatedAt);
  const created = libraryTimestampMs(record.createdAt);
  const value = updated || created;
  if (!value) return 'No date';
  const fmt = new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  if (updated && created && updated > created + 60000) return `Updated ${fmt.format(new Date(updated))}`;
  return `Added ${fmt.format(new Date(created || updated))}`;
}

function libraryCleanDateText(value) {
  const time = libraryTimestampMs(value);
  if (!time) return '-';
  return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(time));
}

function libraryCleanShortPath(path) {
  const clean = normaliseLibraryFolderPath(path);
  if (!clean) return 'Root';
  const parts = clean.split('/');
  if (parts.length <= 3) return parts.join(' / ');
  return `... / ${parts.slice(-3).join(' / ')}`;
}

function libraryCleanSearchResults() {
  const query = String(moduleLibrarySearch || '').trim();
  if (!query) return { folders: [], items: [] };
  const selected = libraryCleanSelectedSource();
  const folderPool = selected.kind === 'all'
    ? libraryCleanAllFolderRecords()
    : libraryCleanAllFolderPathsForSource(selected).map((folder) => ({ kind: 'folder', key: `${selected.key}:folder:${folder}`, sourceKey: selected.key, source: selected, folder, name: getLibraryFolderName(folder), accent: selected.accent }));
  const itemPool = selected.kind === 'all' ? libraryCleanRecords() : libraryCleanRecords({ source: selected });
  const folders = libraryCleanSortFolders(folderPool.filter((f) => libraryCleanMatchesSearch([f.name, f.folder, f.source.code, f.source.label, f.source.name, f.source.description], query)));
  const items = libraryCleanSortItems(itemPool.filter((r) => libraryCleanMatchesSearch([r.name, r.url, r.tag, r.notes, r.folder, r.source.code, r.source.label, r.source.name, r.source.description, libraryCleanFormatActivityLabel(r)], query)));
  return { folders, items };
}

// ── Selection ──────────────────────────────────────────────────────────────

export function libraryCleanSelect(kind, key, event) {
  if (event) { event.preventDefault(); event.stopPropagation(); }
  libraryCleanState().selected = { kind, key };
  libraryCleanApplySelection();
}

function libraryCleanApplySelection() {
  document.querySelectorAll('.library-v10-selected').forEach((n) => n.classList.remove('library-v10-selected'));
  const selected = libraryCleanState().selected;
  if (!selected?.key) return;
  const safeKey = window.CSS?.escape ? CSS.escape(selected.key) : String(selected.key).replace(/"/g, '\\"');
  document.querySelector(`[data-library-key="${safeKey}"]`)?.classList.add('library-v10-selected');
}

function libraryCleanSelectionFromNode(node) {
  if (!node) return null;
  if (node.dataset.folderKey) return { kind: 'folder', key: node.dataset.folderKey };
  if (node.dataset.recordKey) return { kind: 'item', key: node.dataset.recordKey };
  return null;
}

// ── HTML renderers ─────────────────────────────────────────────────────────

function libraryCleanSortButton(label, key, activeModes) {
  const active = activeModes.includes(libraryCleanSortMode());
  return `<button class="library-v10-column-btn ${active ? 'active' : ''}" type="button" onclick="libraryCleanToggleSort(${jsString(key)})">${escapeHtml(label)}</button>`;
}

function libraryCleanSortMenuHtml() {
  const v = libraryCleanSortMode();
  return `<label class="library-v10-sort-label" for="module-library-sort"><span>Sort</span>
    <select class="nav-select library-v10-sort-select" id="module-library-sort" onchange="libraryCleanSetSortMode(this.value)">
      <option value="recent" ${v==='recent'?'selected':''}>Recently added</option>
      <option value="oldest" ${v==='oldest'?'selected':''}>Oldest first</option>
      <option value="updated" ${v==='updated'?'selected':''}>Recently updated</option>
      <option value="az" ${v==='az'?'selected':''}>Name A-Z</option>
      <option value="za" ${v==='za'?'selected':''}>Name Z-A</option>
      <option value="library" ${v==='library'?'selected':''}>Library</option>
      <option value="type" ${v==='type'?'selected':''}>Type</option>
      <option value="folder" ${v==='folder'?'selected':''}>Folder</option>
    </select></label>`;
}

function libraryCleanCustomColourControlHtml(source) {
  if (source.kind !== 'custom' || !window.isColourCustomisableTheme?.()) return '';
  const colour = getCustomLibraryColourHex(source.customId);
  return `<label class="library-v10-colour-control" title="Choose library colour">
    <span class="library-v10-colour-label">Colour</span>
    <input class="module-colour-input library-v10-colour-input" type="color" value="${escapeHtml(colour)}" onchange="setCustomLibraryColour(${jsString(source.customId)},this.value,event)">
    <span class="module-colour-preview library-v10-colour-preview" style="background:${escapeHtml(getCustomLibraryColourSet(source.customId).fill||'')}"></span>
  </label>`;
}

function libraryCleanToolbarHtml() {
  const viewMode = libraryCleanViewMode();
  const source = libraryCleanSelectedSource();
  return `<div class="library-v10-toolbar-shell">
    <div class="library-v10-search-wrap">
      <input class="input" id="module-library-search" placeholder="Search libraries, folders, materials, notes, tags, or URLs" value="${escapeHtml(moduleLibrarySearch||'')}" oninput="updateModuleLibrarySearch(this.value)">
      ${moduleLibrarySearch?`<button class="mini-btn library-v10-search-clear" type="button" aria-label="Clear search" onclick="clearModuleLibrarySearch()">&times;</button>`:''}
    </div>
    <div class="library-v10-view-toggle" role="group" aria-label="Library view">
      <button class="mini-btn library-v10-view-btn ${viewMode==='details'?'active':''}" type="button" onclick="libraryCleanSetViewMode('details')">List</button>
      <button class="mini-btn library-v10-view-btn ${viewMode==='cards'?'active':''}" type="button" onclick="libraryCleanSetViewMode('cards')">Cards</button>
    </div>
    ${libraryCleanCustomColourControlHtml(source)}
    ${libraryCleanSortMenuHtml()}
  </div>`;
}

function libraryCleanSourceRailHtml() {
  const selected = libraryCleanSelectedSource();
  const sourceKey = libraryCleanSourceKey(selected);
  const allSources = libraryCleanAllSources();
  const pinnedKeys = libraryCleanPinnedSourceKeys();
  const pinnedSet = new Set(pinnedKeys);
  const quickAccess = [];
  const allLib = allSources.find((s) => s.key === 'all');
  if (allLib) quickAccess.push(allLib);
  allSources.forEach((s) => { if (s.key !== 'all' && pinnedSet.has(s.key) && !quickAccess.some((q) => q.key === s.key)) quickAccess.push(s); });
  const remaining = allSources.filter((s) => s.key !== 'all' && !quickAccess.some((q) => q.key === s.key));
  const showAll = libraryCleanState().showAllSources;
  const browseTile = remaining.length ? `<button class="library-v10-source-browse-tile ${showAll?'active':''}" type="button" onclick="libraryCleanToggleAllSources(event)">
    <span class="library-v10-source-browse-kicker">Discover</span><strong>Browse Libraries</strong>
    <span class="library-v10-source-browse-meta">${remaining.length} more librar${remaining.length===1?'y':'ies'} beyond quick access</span>
  </button>` : '';

  function sourceCardHtml(source, options = {}) {
    const counts = libraryCleanCountsForSource(source);
    const active = source.key === sourceKey;
    const deletable = source.kind === 'custom';
    const pinned = source.key !== 'all' && pinnedSet.has(source.key);
    const pinLabel = pinned ? 'Remove from Quick Access' : 'Pin to Quick Access';
    const menuOpen = libraryCleanState().sourceMenuKey === source.key;
    return `<div class="library-v10-source-shell ${options.compact?'library-v10-source-shell-compact':''}" style="--source-accent:${escapeHtml(source.accent)}">
      <div class="library-v10-source-card ${active?'active':''} ${options.compact?'library-v10-source-card-compact':''}" tabindex="0" role="button" data-source-key="${escapeHtml(source.key)}">
        <span class="library-v10-source-accent"></span>
        <span class="library-v10-source-main">
          <span class="library-v10-source-code">${escapeHtml(source.code||source.label)}</span>
          <span class="library-v10-source-name">${escapeHtml(source.name||source.label)}</span>
          <span class="library-v10-source-meta">${counts.folders} folder${counts.folders===1?'':'s'} | ${counts.items} resource${counts.items===1?'':'s'}${deletable?' | Custom':''}${pinned?' | Quick Access':''}</span>
        </span>
        ${source.key!=='all'?`
          <button class="mini-btn library-v10-source-pin ${menuOpen?'active':''}" type="button" aria-label="Library options" onclick="libraryCleanToggleSourceMenu(${jsString(source.key)},event)"><span aria-hidden="true">&#8942;</span></button>
          <div class="library-v10-source-menu ${menuOpen?'open':''}" role="menu">
            <button class="library-v10-source-menu-item" type="button" role="menuitem" onclick="togglePinnedLibrarySource(${jsString(source.key)},event)">${escapeHtml(pinLabel)}</button>
          </div>`:''}
      </div></div>`;
  }

  return `<div class="library-v10-source-browser">
    <div class="library-v10-source-browser-head"><div class="library-v10-source-browser-title">Quick Access</div></div>
    <div class="library-v10-source-rail library-v10-source-rail-quick">
      ${quickAccess.map((s, i) => `${sourceCardHtml(s,{compact:true})}${i===0?browseTile:''}`).join('')}
    </div>
    ${remaining.length?`<div class="library-v10-source-browser-panel ${showAll?'open':''}">
      <div class="library-v10-source-browser-title">More Libraries</div>
      <div class="library-v10-source-rail library-v10-source-rail-all">${remaining.map((s)=>sourceCardHtml(s)).join('')}</div>
    </div>`:''}
  </div>`;
}

function libraryCleanBreadcrumbHtml() {
  const source = libraryCleanSelectedSource();
  const folder = normaliseLibraryFolderPath(libraryCleanCurrentFolder(source));
  if (source.kind === 'all') return `<span class="library-v10-crumb active">Library Home</span>`;
  const parts = folder ? folder.split('/').filter(Boolean) : [];
  const crumbs = [`<button class="library-v10-crumb ${!folder?'active':''}" type="button" data-library-clean-folder=""
    ondragover="libraryCleanAllowBreadcrumbDrop('',event)" ondragleave="libraryCleanClearBreadcrumbDrop(event)" ondrop="libraryCleanDropOnBreadcrumb('',event)">Root</button>`];
  parts.forEach((part, i) => {
    const path = parts.slice(0, i + 1).join('/');
    crumbs.push(`<span class="library-v10-sep">/</span>
      <button class="library-v10-crumb ${path===folder?'active':''}" type="button" title="${escapeHtml(path)}" data-library-clean-folder="${escapeHtml(path)}"
        ondragover="libraryCleanAllowBreadcrumbDrop(${jsString(path)},event)" ondragleave="libraryCleanClearBreadcrumbDrop(event)" ondrop="libraryCleanDropOnBreadcrumb(${jsString(path)},event)">${escapeHtml(part)}</button>`);
  });
  return crumbs.join('');
}

function libraryCleanItemActionsHtml(record) {
  return `<span class="library-v10-item-actions">
    <button class="mini-btn library-v10-item-action" type="button" title="Edit" onclick="libraryCleanEditItemKey(${jsString(record.key)},event)">Edit</button>
    <button class="mini-btn library-v10-item-action" type="button" title="Open" onclick="libraryCleanOpenItemKey(${jsString(record.key)},event)">Open</button>
  </span>`;
}

function libraryCleanFolderCardHtml(folderRecord) {
  const selected = libraryCleanState().selected?.key === folderRecord.key;
  const count = libraryCleanRecords({ source: folderRecord.source }).filter((r) => r.folder === folderRecord.folder || r.folder.startsWith(folderRecord.folder + '/')).length;
  const activity = libraryCleanFolderActivityValue(folderRecord);
  return `<div class="module-library-folder-tile library-v10-folder ${selected?'library-v10-selected':''}" tabindex="0"
    data-library-key="${escapeHtml(folderRecord.key)}" data-folder-key="${escapeHtml(folderRecord.key)}" style="--source-accent:${escapeHtml(folderRecord.accent)}"
    onmousedown="if(event.detail>1)event.preventDefault()"
    onclick="libraryCleanSelect('folder',${jsString(folderRecord.key)},event)"
    ondblclick="libraryCleanOpenFolderKey(${jsString(folderRecord.key)},event)"
    ondragover="libraryCleanAllowFolderDrop(event)" ondrop="libraryCleanDropOnFolder(${jsString(folderRecord.key)},event)">
    <span class="module-library-folder-icon" aria-hidden="true"></span>
    <span class="module-library-folder-tile-main">
      <span class="module-library-folder-tile-name">${escapeHtml(folderRecord.name)}</span>
      <span class="module-library-folder-tile-meta">${escapeHtml(folderRecord.source.code||'Library')} | ${escapeHtml(libraryCleanShortPath(folderRecord.folder))} | ${count} resource${count===1?'':'s'}${activity?` | ${escapeHtml(new Intl.DateTimeFormat(undefined,{day:'2-digit',month:'short'}).format(new Date(activity)))}`:''}</span>
    </span></div>`;
}

function libraryCleanItemCardHtml(record) {
  const selected = libraryCleanState().selected?.key === record.key;
  return `<div class="module-library-card library-v10-item ${selected?'library-v10-selected':''}" tabindex="0" draggable="true"
    data-library-key="${escapeHtml(record.key)}" data-record-key="${escapeHtml(record.key)}" style="--source-accent:${escapeHtml(record.accent)}"
    onmousedown="if(event.detail>1)event.preventDefault()"
    onclick="libraryCleanSelect('item',${jsString(record.key)},event)"
    ondblclick="libraryCleanOpenItemKey(${jsString(record.key)},event)"
    ondragstart="libraryCleanStartItemDrag(${jsString(record.key)},event)" ondragend="libraryCleanEndItemDrag(event)">
    <span class="module-library-module-accent"></span>
    <span class="module-library-card-head">
      <span>
        <span class="module-library-card-title">${escapeHtml(record.name)}</span>
        <span class="module-library-card-meta">
          <span class="module-library-pill">${escapeHtml(record.source.code||'Library')}</span>
          <span class="module-library-pill">${escapeHtml(record.typeLabel)}</span>
          <span class="module-library-pill">${escapeHtml(libraryCleanFormatActivityLabel(record))}</span>
          ${record.folder?`<span class="module-library-pill">${escapeHtml(libraryCleanShortPath(record.folder))}</span>`:''}
          ${record.tag?`<span class="module-library-pill">${escapeHtml(record.tag)}</span>`:''}
        </span>
      </span>
      ${libraryCleanItemActionsHtml(record)}
    </span>
    ${record.notes?`<span class="module-library-card-notes">${escapeHtml(record.notes)}</span>`:''}
  </div>`;
}

function libraryCleanFolderRowHtml(folderRecord) {
  const selected = libraryCleanState().selected?.key === folderRecord.key;
  const activity = libraryCleanFolderActivityValue(folderRecord);
  const count = libraryCleanRecords({ source: folderRecord.source }).filter((r) => r.folder === folderRecord.folder || r.folder.startsWith(folderRecord.folder + '/')).length;
  return `<div class="library-v10-row library-v10-row-folder ${selected?'library-v10-selected':''}" tabindex="0"
    data-library-key="${escapeHtml(folderRecord.key)}" data-folder-key="${escapeHtml(folderRecord.key)}" style="--source-accent:${escapeHtml(folderRecord.accent)}"
    onclick="libraryCleanSelect('folder',${jsString(folderRecord.key)},event)"
    ondblclick="libraryCleanOpenFolderKey(${jsString(folderRecord.key)},event)"
    ondragover="libraryCleanAllowFolderDrop(event)" ondrop="libraryCleanDropOnFolder(${jsString(folderRecord.key)},event)">
    <span class="library-v10-col library-v10-col-name"><span class="module-library-folder-icon" aria-hidden="true"></span><span class="library-v10-row-name">${escapeHtml(folderRecord.name)}</span></span>
    <span class="library-v10-col">${escapeHtml(folderRecord.source.code||'Library')}</span>
    <span class="library-v10-col">Folder</span>
    <span class="library-v10-col">${escapeHtml(libraryCleanShortPath(folderRecord.folder))}</span>
    <span class="library-v10-col library-v10-col-date">${escapeHtml(libraryCleanDateText(activity))}</span>
    <span class="library-v10-col library-v10-col-count">${count} item${count===1?'':'s'}</span>
    <span class="library-v10-col library-v10-col-actions"></span>
  </div>`;
}

function libraryCleanItemRowHtml(record) {
  const selected = libraryCleanState().selected?.key === record.key;
  return `<div class="library-v10-row library-v10-row-item ${selected?'library-v10-selected':''}" tabindex="0" draggable="true"
    data-library-key="${escapeHtml(record.key)}" data-record-key="${escapeHtml(record.key)}" style="--source-accent:${escapeHtml(record.accent)}"
    onclick="libraryCleanSelect('item',${jsString(record.key)},event)"
    ondblclick="libraryCleanOpenItemKey(${jsString(record.key)},event)"
    ondragstart="libraryCleanStartItemDrag(${jsString(record.key)},event)" ondragend="libraryCleanEndItemDrag(event)">
    <span class="library-v10-col library-v10-col-name"><span class="library-v10-row-file-accent" aria-hidden="true"></span><span class="library-v10-row-name">${escapeHtml(record.name)}</span></span>
    <span class="library-v10-col">${escapeHtml(record.source.code||'Library')}</span>
    <span class="library-v10-col">${escapeHtml(record.typeLabel)}</span>
    <span class="library-v10-col">${escapeHtml(record.folder?libraryCleanShortPath(record.folder):'Root')}</span>
    <span class="library-v10-col library-v10-col-date">${escapeHtml(libraryCleanDateText(record.createdAt||record.updatedAt))}</span>
    <span class="library-v10-col library-v10-col-count">${escapeHtml(record.tag||'')}</span>
    ${libraryCleanItemActionsHtml(record)}
  </div>`;
}

function libraryCleanDetailsHeaderHtml() {
  return `<div class="library-v10-details-header">
    <span class="library-v10-col library-v10-col-name">${libraryCleanSortButton('Name','name',['az','za'])}</span>
    <span class="library-v10-col">${libraryCleanSortButton('Library','library',['library'])}</span>
    <span class="library-v10-col">${libraryCleanSortButton('Type','type',['type'])}</span>
    <span class="library-v10-col">${libraryCleanSortButton('Location','folder',['folder'])}</span>
    <span class="library-v10-col library-v10-col-date">${libraryCleanSortButton('Date Added','date',['recent','oldest'])}</span>
    <span class="library-v10-col library-v10-col-count">Tag</span>
    <span class="library-v10-col library-v10-col-actions">Actions</span>
  </div>`;
}

function libraryCleanDetailsHtml(folders, items) {
  if (!folders.length && !items.length) return `<div class="module-library-empty">This folder is empty.</div>`;
  return `<div class="library-v10-details">${libraryCleanDetailsHeaderHtml()}
    <div class="library-v10-details-body">${folders.map(libraryCleanFolderRowHtml).join('')}${items.map(libraryCleanItemRowHtml).join('')}</div>
  </div>`;
}

// ── Item operations ────────────────────────────────────────────────────────

function libraryCleanFindFolder(folderKey) {
  const parts = String(folderKey || '').split(':folder:');
  if (parts.length !== 2) return null;
  const source = libraryCleanParseSourceKey(parts[0]);
  const folder = normaliseLibraryFolderPath(parts[1]);
  if (source.kind === 'all' || !folder) return null;
  return { source, folder, key: `${source.key}:folder:${folder}` };
}

function libraryCleanFindItem(recordKey) {
  const match = String(recordKey || '').match(/^(.*):(formula|relevant):item:(\d+)$/);
  if (!match) return null;
  const source = libraryCleanParseSourceKey(match[1]);
  const type = match[2];
  const index = Number(match[3]);
  if (source.kind === 'all' || !Number.isInteger(index)) return null;
  const items = libraryCleanSourceItems(source, type);
  if (!items[index]) return null;
  return { source, type, index, item: items[index], key: `${source.key}:${type}:item:${index}` };
}

export function libraryCleanOpenFolderKey(folderKey, event) {
  if (event) { event.preventDefault(); event.stopPropagation(); }
  const found = libraryCleanFindFolder(folderKey);
  if (!found) return;
  libraryCleanSetSource(found.source.key, { silent: true });
  libraryCleanSetFolder(found.folder, found.source);
}

export function libraryCleanOpenItemKey(recordKey, event) {
  if (event) { event.preventDefault(); event.stopPropagation(); }
  const found = libraryCleanFindItem(recordKey);
  if (found?.item?.url) openTrustedUrl(found.item.url);
}

export async function libraryCleanRenameFolderKey(folderKey, event) {
  if (event) event.stopPropagation();
  const found = libraryCleanFindFolder(folderKey);
  if (!found) return;
  const oldPath = found.folder;
  const parent = getLibraryFolderParent(oldPath);
  const oldName = getLibraryFolderName(oldPath);
  const result = await window.appPrompt?.({ label: 'Folder', title: 'Rename Folder', message: 'Items and subfolders inside this folder will stay inside it.', inputLabel: 'Folder Name', defaultValue: oldName, placeholder: oldName, confirmText: 'Rename Folder' });
  const newName = normaliseLibraryFolderPath(result?.value || '');
  if (!newName) return;
  const newPath = joinLibraryFolderPath(parent, newName);
  LIBRARY_CLEAN_ITEM_TYPES.forEach((type) => {
    libraryCleanSourceItems(found.source, type).forEach((item) => {
      const folder = normaliseLibraryFolderPath(item.folder);
      if (folder === oldPath) item.folder = newPath;
      else if (folder.startsWith(oldPath + '/')) item.folder = newPath + folder.slice(oldPath.length);
    });
  });
  const target = libraryCleanTargetForSource(found.source);
  LIBRARY_CLEAN_ITEM_TYPES.forEach((type) => renameLibraryFolderInRegistry(type, oldPath, newPath, target));
  const sourceKey = libraryCleanSourceKey(found.source);
  const st = libraryCleanState();
  const active = normaliseLibraryFolderPath(st.folderBySource[sourceKey] || '');
  if (active === oldPath || active.startsWith(oldPath + '/')) st.folderBySource[sourceKey] = newPath + active.slice(oldPath.length);
  save();
  renderModuleLibrary();
}

export async function libraryCleanDeleteFolderKey(folderKey, event) {
  if (event) event.stopPropagation();
  const found = libraryCleanFindFolder(folderKey);
  if (!found) return;
  const oldPath = found.folder;
  const affected = libraryCleanRecords({ source: found.source }).filter((item) => {
    const folder = normaliseLibraryFolderPath(item.folder);
    return folder === oldPath || folder.startsWith(oldPath + '/');
  }).length;
  const confirmed = await window.appConfirm?.({ label: 'Folder', title: `Delete ${getLibraryFolderName(oldPath)}?`, message: affected ? `${affected} resource${affected===1?'':'s'} will move to the parent folder. Nothing is deleted.` : 'This folder and its subfolders will be removed.', confirmText: 'Delete Folder', danger: true });
  if (!confirmed) return;
  const parent = getLibraryFolderParent(oldPath);
  LIBRARY_CLEAN_ITEM_TYPES.forEach((type) => {
    libraryCleanSourceItems(found.source, type).forEach((item) => {
      const folder = normaliseLibraryFolderPath(item.folder);
      if (folder === oldPath) item.folder = parent;
      else if (folder.startsWith(oldPath + '/')) item.folder = joinLibraryFolderPath(parent, folder.slice(oldPath.length + 1));
    });
  });
  const target = libraryCleanTargetForSource(found.source);
  LIBRARY_CLEAN_ITEM_TYPES.forEach((type) => removeLibraryFolderFromRegistry(type, (f) => { const c = normaliseLibraryFolderPath(f); return c === oldPath || c.startsWith(oldPath + '/'); }, target));
  const sourceKey = libraryCleanSourceKey(found.source);
  const st = libraryCleanState();
  const active = normaliseLibraryFolderPath(st.folderBySource[sourceKey] || '');
  if (active === oldPath || active.startsWith(oldPath + '/')) st.folderBySource[sourceKey] = parent;
  st.selected = null;
  save();
  renderModuleLibrary();
}

export async function libraryCleanDeleteItemKey(recordKey, event) {
  if (event) event.stopPropagation();
  const found = libraryCleanFindItem(recordKey);
  if (!found) return;
  const label = libraryCleanItemTypeLabel(found.type);
  const confirmed = await window.appConfirm?.({ label, title: `Delete ${found.item.name || label.toLowerCase()}?`, message: `This removes the saved ${label.toLowerCase()} from this library.`, confirmText: `Delete ${label}`, danger: true });
  if (!confirmed) return;
  libraryCleanSourceItems(found.source, found.type).splice(found.index, 1);
  libraryCleanState().selected = null;
  save();
  if (found.source.kind === 'module') updateFormulaButton(found.source.mi);
  if (found.source.kind === 'module' && found.type === 'relevant') renderRelevantLinks(found.source.mi);
  renderModuleLibrary();
}

export async function libraryCleanEditItemKey(recordKey, event) {
  if (event) event.stopPropagation();
  const found = libraryCleanFindItem(recordKey);
  if (!found) return;
  openLinkForm({ type: found.type, mi: found.source.kind === 'module' ? found.source.mi : null, customId: found.source.kind === 'custom' ? found.source.customId : null, index: found.index, mode: 'edit', folder: normaliseLibraryFolderPath(found.item.folder || ''), fromLibrary: true });
}

// ── Drag and drop ──────────────────────────────────────────────────────────

export function libraryCleanStartItemDrag(recordKey, event) {
  libraryCleanState().dragRecordKey = recordKey;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', recordKey);
  event.currentTarget.classList.add('library-v10-dragging');
  document.body.classList.add('library-v10-drag-active');
}

export function libraryCleanEndItemDrag(event) {
  libraryCleanState().dragRecordKey = '';
  event.currentTarget?.classList.remove('library-v10-dragging');
  document.body.classList.remove('library-v10-drag-active');
  document.querySelectorAll('.library-v10-drop-target, .library-v10-crumb-drop-target').forEach((n) => n.classList.remove('library-v10-drop-target', 'library-v10-crumb-drop-target'));
}

export function libraryCleanAllowFolderDrop(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  event.currentTarget.classList.add('library-v10-drop-target');
}

export function libraryCleanAllowBreadcrumbDrop(folderPath, event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  event.currentTarget.classList.add('library-v10-crumb-drop-target');
}

export function libraryCleanClearBreadcrumbDrop(event) {
  event.currentTarget.classList.remove('library-v10-crumb-drop-target');
}

export function libraryCleanDropOnFolder(folderKey, event) {
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.classList.remove('library-v10-drop-target');
  const recordKey = event.dataTransfer.getData('text/plain') || libraryCleanState().dragRecordKey;
  libraryCleanMoveItemToFolder(recordKey, folderKey);
}

export function libraryCleanDropOnBreadcrumb(folderPath, event) {
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.classList.remove('library-v10-crumb-drop-target');
  const recordKey = event.dataTransfer.getData('text/plain') || libraryCleanState().dragRecordKey;
  libraryCleanMoveItemToPath(recordKey, folderPath);
}

export async function libraryCleanMoveItemToFolder(recordKey, folderKey) {
  const item = libraryCleanFindItem(recordKey);
  const folder = libraryCleanFindFolder(folderKey);
  if (!item || !folder) return;
  if (libraryCleanSourceKey(item.source) !== libraryCleanSourceKey(folder.source)) {
    await window.showAppNotice?.('Same library only', 'Move resources into folders inside the same module or custom library.');
    return;
  }
  item.item.folder = folder.folder;
  item.item.updatedAt = libraryNowIso();
  addLibraryFolderToRegistry(item.type, folder.folder, libraryCleanTargetForSource(folder.source));
  save();
  renderModuleLibrary();
}

export async function libraryCleanMoveItemToPath(recordKey, folderPath) {
  const item = libraryCleanFindItem(recordKey);
  if (!item) return;
  const targetPath = normaliseLibraryFolderPath(folderPath);
  item.item.folder = targetPath;
  item.item.updatedAt = libraryNowIso();
  if (targetPath) addLibraryFolderToRegistry(item.type, targetPath, libraryCleanTargetForSource(item.source));
  save();
  renderModuleLibrary();
}

export async function libraryCleanCreateFolder(event) {
  if (event) event.stopPropagation();
  const source = libraryCleanSelectedSource();
  if (source.kind === 'all') { await window.showAppNotice?.('Choose a library first', 'Select a module or custom library, then create folders inside it.'); return; }
  const current = libraryCleanCurrentFolder(source);
  const result = await window.appPrompt?.({ label: 'Folder', title: current ? 'Create Subfolder' : 'Create Folder', message: current ? `Create a folder inside ${libraryCleanShortPath(current)}.` : `Create a folder inside ${source.code}.`, inputLabel: 'Folder Name', placeholder: current ? 'Week 1' : 'Lectures', confirmText: 'Create Folder' });
  const name = normaliseLibraryFolderPath(result?.value || '');
  if (!name) return;
  const path = joinLibraryFolderPath(current, name);
  const target = libraryCleanTargetForSource(source);
  LIBRARY_CLEAN_ITEM_TYPES.forEach((type) => addLibraryFolderToRegistry(type, path, target));
  libraryCleanSetFolder(path, source, { silent: true });
  save();
  renderModuleLibrary();
}

export async function libraryCleanOpenAddItem(type = 'formula', event) {
  if (event) event.stopPropagation();
  const source = libraryCleanSelectedSource();
  if (source.kind === 'all') { await window.showAppNotice?.('Choose a library first', `Select a module or custom library before adding a ${libraryCleanItemTypeLabel(type).toLowerCase()}.`); return; }
  openLinkForm({ type, mi: source.kind === 'module' ? source.mi : null, customId: source.kind === 'custom' ? source.customId : null, folder: libraryCleanCurrentFolder(source), fromLibrary: true });
  document.getElementById('link-form-modal')?.classList.add('library-v10-link-modal');
  const title = document.getElementById('link-form-title');
  const subtitle = document.getElementById('link-form-subtitle');
  if (title) title.textContent = `Add ${libraryCleanItemTypeLabel(type)}`;
  if (subtitle) subtitle.textContent = source.code || 'Library';
}

// ── renderModuleLibrary ────────────────────────────────────────────────────

function libraryCleanRenderBody() {
  const source = libraryCleanSelectedSource();
  const folder = libraryCleanCurrentFolder(source);
  const search = String(moduleLibrarySearch || '').trim();
  const viewMode = libraryCleanViewMode();
  if (search) {
    const results = libraryCleanSearchResults();
    return results.folders.length || results.items.length
      ? `<div class="library-v10-results-label">Search Results</div>${viewMode === 'details' ? libraryCleanDetailsHtml(results.folders, results.items) : `<div class="library-v10-grid">${results.folders.map(libraryCleanFolderCardHtml).join('')}${results.items.map(libraryCleanItemCardHtml).join('')}</div>`}`
      : `<div class="module-library-empty">No matching folders or resources.</div>`;
  }
  if (source.kind === 'all') {
    const folders = libraryCleanSortFolders(libraryCleanAllFolderRecords().filter((r) => !r.folder.includes('/')));
    const items = libraryCleanSortItems(libraryCleanRecords().filter((r) => !r.folder));
    return folders.length || items.length
      ? (viewMode === 'details' ? libraryCleanDetailsHtml(folders, items) : `<div class="library-v10-grid">${folders.map(libraryCleanFolderCardHtml).join('')}${items.map(libraryCleanItemCardHtml).join('')}</div>`)
      : `<div class="module-library-empty">No materials or links saved yet.</div>`;
  }
  const folders = libraryCleanSortFolders(libraryCleanImmediateFolders(source, folder));
  const items = libraryCleanSortItems(libraryCleanItemsInFolder(source, folder));
  return folders.length || items.length
    ? (viewMode === 'details' ? libraryCleanDetailsHtml(folders, items) : `<div class="library-v10-grid">${folders.map(libraryCleanFolderCardHtml).join('')}${items.map(libraryCleanItemCardHtml).join('')}</div>`)
    : `<div class="module-library-empty">This folder is empty.</div>`;
}

export function renderModuleLibrary() {
  ensureLibraryState();
  const modal = document.getElementById('module-library-modal');
  const materialsHost = document.getElementById('module-library-materials');
  if (!materialsHost) return;

  const source = libraryCleanSelectedSource();
  const title = document.getElementById('module-library-title');
  if (title) title.textContent = source.kind === 'all' ? 'Library Home' : `${source.code || source.label} Library`;

  const materialsSection = materialsHost.closest('.module-library-section');
  if (materialsSection) {
    materialsSection.classList.remove('is-collapsed');
    materialsSection.classList.add('library-v10-unified-section');
    const label = materialsSection.querySelector('.module-library-section-label');
    const copy = materialsSection.querySelector('.module-library-section-copy');
    const counts = libraryCleanCountsForSource(source);
    if (label) label.textContent = 'Library Resources';
    if (copy) copy.textContent = source.kind === 'all' ? 'Open a library from quick access or browse the full list.' : `${source.name || source.label || ''} | ${counts.items} resource${counts.items===1?'':'s'} across ${counts.folders} folder${counts.folders===1?'':'s'}.`;
  }

  const toolbar = document.querySelector('.module-library-toolbar');
  const activeEl = document.activeElement;
  const searchFocused = activeEl?.id === 'module-library-search';
  const selStart = searchFocused ? activeEl.selectionStart : null;
  const selEnd = searchFocused ? activeEl.selectionEnd : null;
  if (toolbar) toolbar.innerHTML = libraryCleanToolbarHtml();
  if (toolbar && searchFocused) {
    const si = toolbar.querySelector('#module-library-search');
    if (si) { si.focus(); if (Number.isInteger(selStart) && Number.isInteger(selEnd)) si.setSelectionRange(selStart, selEnd); }
  }
  if (toolbar && !document.getElementById('library-v10-source-rail-anchor')) {
    const anchor = document.createElement('div');
    anchor.id = 'library-v10-source-rail-anchor';
    toolbar.insertAdjacentElement('afterend', anchor);
  }
  const railAnchor = document.getElementById('library-v10-source-rail-anchor');
  if (railAnchor) { railAnchor.innerHTML = libraryCleanSourceRailHtml(); libraryCleanSetupSourceRailEvents(); }

  const st = libraryCleanState();
  const sourceKey = libraryCleanSourceKey(source);
  const history = st.historyBySource[sourceKey] || [''];
  const historyIndex = st.historyIndexBySource[sourceKey] || 0;
  const backDisabled = source.kind === 'all' || historyIndex <= 0;
  const forwardDisabled = source.kind === 'all' || historyIndex >= history.length - 1;
  const folder = libraryCleanCurrentFolder(source);

  const actionsHtml = `<div class="library-v10-actions"><div class="library-v10-nav-strip">
    <div class="library-v10-nav-left">
      <div class="library-v10-nav-buttons">
        <button class="mini-btn library-v10-arrow-btn" type="button" aria-label="Back" ${backDisabled?'disabled':''} onclick="libraryCleanStepHistory(-1,event)">&#8592;</button>
        <button class="mini-btn library-v10-arrow-btn" type="button" aria-label="Forward" ${forwardDisabled?'disabled':''} onclick="libraryCleanStepHistory(1,event)">&#8594;</button>
      </div>
      <div class="library-v10-breadcrumbs">${libraryCleanBreadcrumbHtml()}</div>
    </div>
    <div class="library-v10-action-buttons">
      ${source.kind === 'all'
        ? `<span class="library-v10-all-hint">Select a library from quick access to add resources</span>`
        : `<button class="nav-btn" type="button" onclick="libraryCleanCreateFolder(event)">New Folder</button>
           <button class="nav-btn calendar-btn" type="button" onclick="libraryCleanOpenAddItem('formula',event)">Add Material</button>`}
      ${source.kind === 'custom' ? `<button class="nav-btn" type="button" onclick="renameCustomLibrary()">Rename Library</button>` : ''}
      ${source.kind === 'custom' ? `<button class="nav-btn danger-btn" type="button" onclick="deleteCustomLibrary()">Delete Library</button>` : ''}
    </div>
  </div></div>`;

  materialsHost.className = 'module-library-list library-v10-list';
  materialsHost.innerHTML = actionsHtml + libraryCleanRenderBody();
  window.unitrackEnhanceLibraryDom?.();
  modal?.classList.add('library-v10-active');
}

function libraryCleanSetupSourceRailEvents() {
  const browser = document.querySelector('.library-v10-source-browser');
  if (!browser || browser.dataset.bound === 'true') return;
  browser.dataset.bound = 'true';
  browser.addEventListener('click', (event) => {
    if (!event.target.closest('.library-v10-source-shell')) { libraryCleanCloseSourceMenu(); return; }
    if (event.target.closest('.library-v10-source-menu')) return;
    const card = event.target.closest('[data-source-key]');
    if (!card || event.target.closest('.library-v10-source-pin')) return;
    event.preventDefault();
    event.stopPropagation();
    libraryCleanSetSource(card.dataset.sourceKey || 'all');
  });
  browser.addEventListener('keydown', (event) => {
    const card = event.target.closest('[data-source-key]');
    if (!card || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    event.stopPropagation();
    libraryCleanSetSource(card.dataset.sourceKey || 'all');
  });
}

// ── Public API ─────────────────────────────────────────────────────────────

export function openModuleLibrary(mi = null, focus = 'both', event) {
  if (event) event.stopPropagation();
  ensureLibraryState();
  materialLibraryModuleIndex = mi;
  moduleLibrarySearch = '';
  if (Number.isInteger(mi)) libraryCleanSetSource(`module:${mi}`, { silent: true });
  else libraryCleanSetSource('all', { silent: true });
  document.getElementById('module-library-modal')?.classList.remove('hidden');
  syncModalScrollLock();
  renderModuleLibrary();
}

export function closeModuleLibrary() {
  document.getElementById('module-library-modal')?.classList.add('hidden');
  materialLibraryModuleIndex = null;
  moduleLibraryScopeMi = null;
  moduleLibraryScopeCustomId = null;
  syncModalScrollLock();
}

export function updateModuleLibrarySearch(value) { moduleLibrarySearch = String(value || ''); renderModuleLibrary(); }
export function clearModuleLibrarySearch() { moduleLibrarySearch = ''; renderModuleLibrary(); }
export function updateModuleLibraryFilter(value) {
  const raw = String(value || 'all');
  libraryCleanSetSource(raw === 'all' ? 'all' : raw.startsWith('custom:') ? raw : `module:${raw}`);
}
export function setModuleLibraryView() { renderModuleLibrary(); }
export function openFormulaLink(mi, event) { openModuleLibrary(mi, 'materials', event); }
export function toggleModuleLibraryLinks() { renderModuleLibrary(); }
export function toggleModuleLibraryMaterials() { renderModuleLibrary(); }
export function openLibraryFolder(type, folder, event) { if (event) event.stopPropagation(); libraryCleanSetFolder(folder); }
export function stepLibraryFolderHistory(type, direction, event) { libraryCleanStepHistory(direction, event); }
export function createLibraryFolder(type, event) { libraryCleanCreateFolder(event); }
export function renameLibraryFolder(type, folderPath, event) {
  const source = libraryCleanSelectedSource();
  if (source.kind === 'all') return;
  libraryCleanRenameFolderKey(`${source.key}:folder:${normaliseLibraryFolderPath(folderPath)}`, event);
}
export function deleteLibraryFolder(type, folderPath, event) {
  const source = libraryCleanSelectedSource();
  if (source.kind === 'all') return;
  libraryCleanDeleteFolderKey(`${source.key}:folder:${normaliseLibraryFolderPath(folderPath)}`, event);
}
export function getRegisteredLibraryFolders(arg1 = null, arg2 = null) {
  const target = arg2 || arg1 || {};
  const source = target.customId ? libraryCleanParseSourceKey(`custom:${target.customId}`) : Number.isInteger(target.mi) ? libraryCleanParseSourceKey(`module:${target.mi}`) : libraryCleanSelectedSource();
  return source.kind === 'all' ? [] : libraryCleanAllFolderPathsForSource(source);
}
export function getUnifiedLibraryRecords() { return libraryCleanRecords(); }
export function getUnifiedSelectedFolder() { return libraryCleanCurrentFolder(); }
export function getSelectedLibraryFolder() { return libraryCleanState().selected?.key || null; }
export function openLibraryAdd(type = 'formula', event) { libraryCleanOpenAddItem(type, event); }
export function openLibraryItem(type, mi, index, customId = null, event) {
  const source = customId ? libraryCleanParseSourceKey(`custom:${customId}`) : libraryCleanParseSourceKey(`module:${mi}`);
  libraryCleanOpenItemKey(`${source.key}:${type}:item:${index}`, event);
}
export function editLibraryItem(type, mi, index, customId = null, event) {
  const source = customId ? libraryCleanParseSourceKey(`custom:${customId}`) : libraryCleanParseSourceKey(`module:${mi}`);
  libraryCleanEditItemKey(`${source.key}:${type}:item:${index}`, event);
}
export function deleteLibraryItem(type, mi, index, customId = null, event) {
  const source = customId ? libraryCleanParseSourceKey(`custom:${customId}`) : libraryCleanParseSourceKey(`module:${mi}`);
  libraryCleanDeleteItemKey(`${source.key}:${type}:item:${index}`, event);
}

// ── Custom library management ──────────────────────────────────────────────

export async function createCustomLibrary() {
  const nameResult = await window.appPrompt?.({ label: 'Library', title: 'Create Custom Library', message: 'Create a standalone library for materials that do not belong to one module.', inputLabel: 'Library Name', placeholder: 'Research, Careers, General', confirmText: 'Create Library' });
  const name = String(nameResult?.value || '').trim();
  if (!name) return;
  const id = `lib_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const now = libraryNowIso();
  getCustomLibraries()[id] = { name, description: '', materials: [], relevantLinks: [], createdAt: now, updatedAt: now };
  save();
  libraryCleanSetSource(`custom:${id}`);
}

export async function renameCustomLibrary() {
  const source = libraryCleanSelectedSource();
  if (source.kind !== 'custom') { await window.showAppNotice?.('Choose a custom library', 'Select a custom library before renaming it.'); return; }
  const library = getCustomLibrary(source.customId);
  if (!library) return;
  const result = await window.appPrompt?.({ label: 'Library', title: 'Rename Custom Library', message: 'Change the library name everywhere this custom library appears.', inputLabel: 'Library Name', defaultValue: library.name || 'Custom Library', placeholder: 'Research, Careers, General', confirmText: 'Rename Library' });
  const name = String(result?.value || '').trim();
  if (!name || name === library.name) return;
  library.name = name;
  library.updatedAt = libraryNowIso();
  save();
  renderModuleLibrary();
}

export async function deleteCustomLibrary() {
  const source = libraryCleanSelectedSource();
  if (source.kind !== 'custom') { await window.showAppNotice?.('Choose a custom library', 'Select a custom library before deleting one.'); return; }
  const library = getCustomLibrary(source.customId);
  if (!library) return;
  const count = libraryCleanRecords({ source }).length;
  const confirmed = await window.appConfirm?.({ label: 'Library', title: `Delete ${library.name || 'custom library'}?`, message: count ? `This deletes the custom library and ${count} saved resource${count===1?'':'s'}.` : 'This deletes the custom library.', confirmText: 'Delete Library', danger: true });
  if (!confirmed) return;
  delete getCustomLibraries()[source.customId];
  const ys = getStore();
  if (ys.libraryFolders?.custom) delete ys.libraryFolders.custom[source.customId];
  save();
  libraryCleanSetSource('all');
}

// ── Keyboard handler ───────────────────────────────────────────────────────

export function handleModuleLibraryKeydown(event) {
  const modal = document.getElementById('module-library-modal');
  if (!modal || modal.classList.contains('hidden')) return;
  const tag = event.target?.tagName;
  if (['INPUT','TEXTAREA','SELECT'].includes(tag) || event.target?.isContentEditable) return;
  if (event.altKey && event.key === 'ArrowLeft') { event.preventDefault(); libraryCleanStepHistory(-1, event); return; }
  if (event.altKey && event.key === 'ArrowRight') { event.preventDefault(); libraryCleanStepHistory(1, event); return; }
  const selected = libraryCleanState().selected || libraryCleanSelectionFromNode(document.activeElement?.closest?.('[data-library-key]') || null);
  if (!selected) return;
  libraryCleanState().selected = selected;
  libraryCleanApplySelection();
  if (event.key === 'Enter') { event.preventDefault(); if (selected.kind === 'folder') libraryCleanOpenFolderKey(selected.key, event); if (selected.kind === 'item') libraryCleanOpenItemKey(selected.key, event); return; }
  if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); if (selected.kind === 'folder') libraryCleanDeleteFolderKey(selected.key, event); if (selected.kind === 'item') libraryCleanDeleteItemKey(selected.key, event); return; }
  if (event.key === 'F2') { event.preventDefault(); if (selected.kind === 'folder') libraryCleanRenameFolderKey(selected.key, event); if (selected.kind === 'item') libraryCleanEditItemKey(selected.key, event); }
}

// ── DOM hardening (from 12-library-render.js) ─────────────────────────────

const SELECTED_CLASS = 'unitrack-library-selected';
let _selectedMaterial = null;

function _closestLibraryItem(target) {
  return target?.closest?.('[data-library-item-index],[data-item-index],.library-item,.module-library-item,.material-item,.formula-item,.link-item');
}
function _closestFolder(target) {
  return target?.closest?.('[data-folder-path],[data-folder],.library-folder,.folder-card,.folder-row,.folder-item');
}
function _getItemIndex(element) {
  const raw = element?.dataset?.libraryItemIndex ?? element?.dataset?.itemIndex ?? element?.dataset?.index;
  const parsed = Number(raw);
  if (Number.isInteger(parsed)) return parsed;
  const siblings = Array.from(element?.parentElement?.children || []).filter((n) => _closestLibraryItem(n) === n);
  const index = siblings.indexOf(element);
  return index >= 0 ? index : null;
}
function _getItemType(element) {
  const raw = element?.dataset?.libraryType || element?.dataset?.type || '';
  if (raw === 'formula' || raw === 'relevant') return raw;
  if (element?.closest?.('[data-library-type="formula"],.formula-library,.materials-library')) return 'formula';
  return 'relevant';
}
function _markSelected(element) {
  document.querySelectorAll(`.${SELECTED_CLASS}`).forEach((n) => n.classList.remove(SELECTED_CLASS));
  if (!element) { _selectedMaterial = null; return; }
  element.classList.add(SELECTED_CLASS);
  _selectedMaterial = { type: _getItemType(element), index: _getItemIndex(element), element };
}
function _enterSelected() {
  if (!_selectedMaterial?.element) return false;
  const link = _selectedMaterial.element.querySelector?.('a[href],button[data-open],.open-link,.library-open-btn');
  if (link) { link.click(); return true; }
  const href = _selectedMaterial.element.dataset?.url || _selectedMaterial.element.getAttribute?.('href');
  if (href) { openTrustedUrl(href); return true; }
  _selectedMaterial.element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
  return true;
}
function _deleteSelected() {
  if (!_selectedMaterial || _selectedMaterial.index === null) return false;
  const { type, index } = _selectedMaterial;
  const items = getLibrarySourceArray(type);
  if (!Array.isArray(items) || !items[index]) return false;
  const name = items[index].name || items[index].url || 'this material';
  if (!window.confirm(`Delete ${name}?`)) return true;
  items.splice(index, 1);
  _selectedMaterial = null;
  ensureLibraryState();
  save();
  renderModuleLibrary();
  return true;
}
function _setFolderFromElement(folderElement) {
  const folder = folderElement?.dataset?.folderPath || folderElement?.dataset?.folder || folderElement?.getAttribute?.('data-path') || '';
  if (!folder) return false;
  const type = folderElement.dataset?.libraryType || folderElement.closest?.('[data-library-type]')?.dataset?.libraryType || 'formula';
  setActiveLibraryFolder(type, folder);
  renderModuleLibrary();
  return true;
}

export function unitrackEnhanceLibraryDom() {
  const roots = document.querySelectorAll('#module-library-modal,#library-modal,.module-library-modal,.library-modal,.library-panel');
  roots.forEach((root) => {
    root.querySelectorAll('[data-library-item-index],[data-item-index],.library-item,.module-library-item,.material-item,.formula-item,.link-item').forEach((item, index) => {
      if (item.dataset.unitrackEnhanced === '1') return;
      item.dataset.unitrackEnhanced = '1';
      if (!item.dataset.libraryItemIndex && !item.dataset.itemIndex) item.dataset.libraryItemIndex = String(index);
      item.setAttribute('tabindex', item.getAttribute('tabindex') || '0');
      item.setAttribute('role', item.getAttribute('role') || 'option');
      item.setAttribute('aria-selected', item.classList.contains(SELECTED_CLASS) ? 'true' : 'false');
    });
    root.querySelectorAll('[data-folder-path],[data-folder],.library-folder,.folder-card,.folder-row,.folder-item').forEach((folder) => {
      if (folder.dataset.unitrackFolderEnhanced === '1') return;
      folder.dataset.unitrackFolderEnhanced = '1';
      folder.setAttribute('tabindex', folder.getAttribute('tabindex') || '0');
      folder.setAttribute('role', folder.getAttribute('role') || 'button');
    });
  });
}

// Event listeners (DOM hardening layer + breadcrumb + keyboard)
document.addEventListener('click', (event) => {
  const item = _closestLibraryItem(event.target);
  if (item && !event.target.closest('button,a,input,textarea,select')) { _markSelected(item); return; }
  const cleanCrumb = event.target.closest('[data-library-clean-folder]');
  if (cleanCrumb) { event.preventDefault(); event.stopPropagation(); libraryCleanSetFolder(cleanCrumb.dataset.libraryCleanFolder || ''); return; }
  const moduleCrumb = event.target.closest('[data-module-library-folder]');
  if (moduleCrumb) { event.preventDefault(); event.stopPropagation(); openLibraryFolder(moduleCrumb.dataset.moduleLibraryType || 'formula', moduleCrumb.dataset.moduleLibraryFolder || '', event); }
}, true);

document.addEventListener('dblclick', (event) => {
  const item = _closestLibraryItem(event.target);
  if (item && !event.target.closest('button,a,input,textarea,select')) { event.preventDefault(); event.stopPropagation(); _markSelected(item); _enterSelected(); return; }
  const folder = _closestFolder(event.target);
  if (folder && !event.target.closest('button,a,input,textarea,select')) { event.preventDefault(); event.stopPropagation(); _setFolderFromElement(folder); }
}, true);

document.addEventListener('keydown', (event) => {
  const item = _closestLibraryItem(event.target);
  const folder = _closestFolder(event.target);
  if (item && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); _markSelected(item); if (event.key === 'Enter') _enterSelected(); return; }
  if (folder && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); _setFolderFromElement(folder); return; }
  if ((event.key === 'Delete' || event.key === 'Backspace') && _selectedMaterial && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) { event.preventDefault(); _deleteSelected(); }
}, true);

document.addEventListener('dragstart', (event) => {
  const item = _closestLibraryItem(event.target);
  if (!item) return;
  _markSelected(item);
  const payload = JSON.stringify({ type: _getItemType(item), index: _getItemIndex(item) });
  event.dataTransfer?.setData('application/x-unitrack-library-item', payload);
  event.dataTransfer?.setData('text/plain', payload);
}, true);

document.addEventListener('dragover', (event) => {
  const folder = _closestFolder(event.target);
  if (!folder) return;
  event.preventDefault();
  folder.classList.add('unitrack-library-drag-over');
}, true);

document.addEventListener('dragleave', (event) => {
  const folder = _closestFolder(event.target);
  if (folder) folder.classList.remove('unitrack-library-drag-over');
}, true);

document.addEventListener('drop', (event) => {
  const folder = _closestFolder(event.target);
  if (!folder) return;
  folder.classList.remove('unitrack-library-drag-over');
  const raw = event.dataTransfer?.getData('application/x-unitrack-library-item') || event.dataTransfer?.getData('text/plain');
  if (!raw) return;
  try {
    const payload = JSON.parse(raw);
    const targetFolder = folder.dataset.folderPath || folder.dataset.folder || folder.getAttribute('data-path') || '';
    if (payload && Number.isInteger(payload.index)) { event.preventDefault(); setLibraryItemFolder(payload.type || 'relevant', payload.index, targetFolder); }
  } catch { /* ignore unrelated drops */ }
}, true);

document.addEventListener('focusin', (event) => {
  const node = event.target?.closest?.('[data-library-key]');
  const selection = libraryCleanSelectionFromNode(node);
  if (!selection) return;
  libraryCleanState().selected = selection;
  libraryCleanApplySelection();
});

document.addEventListener('keydown', handleModuleLibraryKeydown);

const _domObserver = new MutationObserver(() => unitrackEnhanceLibraryDom());
_domObserver.observe(document.documentElement, { childList: true, subtree: true });
document.addEventListener('DOMContentLoaded', () => unitrackEnhanceLibraryDom());
