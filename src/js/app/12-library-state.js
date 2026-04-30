/* Library state hardening helpers.
   Loaded after the main app so it can normalise old saved data without replacing core functions. */
(function unitrackLibraryStateHardening() {
  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function normalisePath(path) {
    return String(path || '')
      .replace(/\\+/g, '/')
      .split('/')
      .map((part) => part.trim())
      .filter(Boolean)
      .join('/');
  }

  function uniqueSortedPaths(paths) {
    const out = new Set();
    (paths || []).forEach((path) => {
      const clean = normalisePath(path);
      if (!clean) return;
      const parts = clean.split('/');
      parts.forEach((_, index) => out.add(parts.slice(0, index + 1).join('/')));
    });
    return Array.from(out).sort((a, b) => a.localeCompare(b));
  }

  function getSafeStore() {
    try {
      if (typeof getStore === 'function') return getStore();
    } catch (error) {
      return null;
    }
    return null;
  }

  function getCustomLibraries(store) {
    if (!store.customLibraries || !isPlainObject(store.customLibraries)) store.customLibraries = {};
    return store.customLibraries;
  }

  function collectFoldersFromModuleStore(store, type, mi) {
    const source = type === 'formula' ? store.formulas?.[mi] : store.relevantLinks?.[mi];
    return uniqueSortedPaths((Array.isArray(source) ? source : []).map((item) => item?.folder));
  }

  function collectFoldersFromCustomLibrary(library, type) {
    const key = type === 'formula' ? 'materials' : 'relevantLinks';
    return uniqueSortedPaths((Array.isArray(library?.[key]) ? library[key] : []).map((item) => item?.folder));
  }

  function ensureRegistryArray(container, key) {
    if (!Array.isArray(container[key])) container[key] = [];
    container[key] = uniqueSortedPaths(container[key]);
    return container[key];
  }

  window.unitrackEnsureLibraryState = function unitrackEnsureLibraryState() {
    const store = getSafeStore();
    if (!store) return null;

    if (!store.libraryFolders || !isPlainObject(store.libraryFolders)) {
      store.libraryFolders = { formula: {}, relevant: {}, custom: {} };
    }
    if (!isPlainObject(store.libraryFolders.formula)) store.libraryFolders.formula = {};
    if (!isPlainObject(store.libraryFolders.relevant)) store.libraryFolders.relevant = {};
    if (!isPlainObject(store.libraryFolders.custom)) store.libraryFolders.custom = {};

    const moduleCount = Array.isArray(store.modules) ? store.modules.length : (Array.isArray(window.MODULES) ? window.MODULES.length : 0);
    for (let mi = 0; mi < moduleCount; mi += 1) {
      const formulaKey = String(mi);
      const relevantKey = String(mi);
      const formulaRegistry = ensureRegistryArray(store.libraryFolders.formula, formulaKey);
      const relevantRegistry = ensureRegistryArray(store.libraryFolders.relevant, relevantKey);
      collectFoldersFromModuleStore(store, 'formula', mi).forEach((path) => {
        if (!formulaRegistry.includes(path)) formulaRegistry.push(path);
      });
      collectFoldersFromModuleStore(store, 'relevant', mi).forEach((path) => {
        if (!relevantRegistry.includes(path)) relevantRegistry.push(path);
      });
      store.libraryFolders.formula[formulaKey] = uniqueSortedPaths(formulaRegistry);
      store.libraryFolders.relevant[relevantKey] = uniqueSortedPaths(relevantRegistry);
    }

    const customLibraries = getCustomLibraries(store);
    Object.keys(customLibraries).forEach((customId) => {
      if (!store.libraryFolders.custom[customId] || !isPlainObject(store.libraryFolders.custom[customId])) {
        store.libraryFolders.custom[customId] = { formula: [], relevant: [] };
      }
      const customFolderStore = store.libraryFolders.custom[customId];
      const formulaRegistry = ensureRegistryArray(customFolderStore, 'formula');
      const relevantRegistry = ensureRegistryArray(customFolderStore, 'relevant');
      collectFoldersFromCustomLibrary(customLibraries[customId], 'formula').forEach((path) => {
        if (!formulaRegistry.includes(path)) formulaRegistry.push(path);
      });
      collectFoldersFromCustomLibrary(customLibraries[customId], 'relevant').forEach((path) => {
        if (!relevantRegistry.includes(path)) relevantRegistry.push(path);
      });
      customFolderStore.formula = uniqueSortedPaths(formulaRegistry);
      customFolderStore.relevant = uniqueSortedPaths(relevantRegistry);
    });

    return store.libraryFolders;
  };

  window.unitrackGetActiveLibraryTarget = function unitrackGetActiveLibraryTarget() {
    if (typeof getLibraryTarget === 'function') {
      try { return getLibraryTarget(); } catch (error) { /* fall through */ }
    }
    return { mi: null, customId: null };
  };

  window.unitrackSetItemFolder = function unitrackSetItemFolder(type, itemIndex, folderPath) {
    const clean = normalisePath(folderPath);
    if (typeof getLibrarySourceArray !== 'function') return false;
    const items = getLibrarySourceArray(type);
    if (!Array.isArray(items) || !items[itemIndex]) return false;
    items[itemIndex].folder = clean;
    if (typeof addLibraryFolderToRegistry === 'function' && clean) addLibraryFolderToRegistry(type, clean);
    window.unitrackEnsureLibraryState?.();
    if (typeof save === 'function') save();
    if (typeof renderModuleLibrary === 'function') renderModuleLibrary();
    return true;
  };

  function patchFunction(name, wrapper) {
    const original = window[name];
    if (typeof original !== 'function' || original.__unitrackPatched) return;
    const patched = wrapper(original);
    patched.__unitrackPatched = true;
    window[name] = patched;
  }

  patchFunction('openModuleLibrary', (original) => function patchedOpenModuleLibrary(...args) {
    window.unitrackEnsureLibraryState?.();
    return original.apply(this, args);
  });

  patchFunction('renderModuleLibrary', (original) => function patchedRenderModuleLibrary(...args) {
    window.unitrackEnsureLibraryState?.();
    const result = original.apply(this, args);
    window.unitrackEnhanceLibraryDom?.();
    return result;
  });

  patchFunction('saveLinkForm', (original) => function patchedSaveLinkForm(...args) {
    const result = original.apply(this, args);
    window.unitrackEnsureLibraryState?.();
    return result;
  });

  patchFunction('save', (original) => function patchedSave(...args) {
    window.unitrackEnsureLibraryState?.();
    return original.apply(this, args);
  });

  document.addEventListener('DOMContentLoaded', () => window.unitrackEnsureLibraryState?.());
})();
