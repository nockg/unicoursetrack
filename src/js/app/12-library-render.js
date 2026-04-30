/* Library DOM enhancement layer.
   Adds predictable keyboard/select/double-click behaviour without rewriting the original renderer. */
(function unitrackLibraryRenderHardening() {
  const SELECTED_CLASS = 'unitrack-library-selected';
  let selectedMaterial = null;

  function closestLibraryItem(target) {
    return target?.closest?.('[data-library-item-index], [data-item-index], .library-item, .module-library-item, .material-item, .formula-item, .link-item');
  }

  function closestFolder(target) {
    return target?.closest?.('[data-folder-path], [data-folder], .library-folder, .folder-card, .folder-row, .folder-item');
  }

  function getItemIndex(element) {
    const raw = element?.dataset?.libraryItemIndex ?? element?.dataset?.itemIndex ?? element?.dataset?.index;
    const parsed = Number(raw);
    if (Number.isInteger(parsed)) return parsed;
    const siblings = Array.from(element?.parentElement?.children || []).filter((node) => closestLibraryItem(node) === node);
    const index = siblings.indexOf(element);
    return index >= 0 ? index : null;
  }

  function getItemType(element) {
    const raw = element?.dataset?.libraryType || element?.dataset?.type || '';
    if (raw === 'formula' || raw === 'relevant') return raw;
    if (element?.closest?.('[data-library-type="formula"], .formula-library, .materials-library')) return 'formula';
    return 'relevant';
  }

  function markSelected(element) {
    document.querySelectorAll(`.${SELECTED_CLASS}`).forEach((node) => node.classList.remove(SELECTED_CLASS));
    if (!element) {
      selectedMaterial = null;
      return;
    }
    element.classList.add(SELECTED_CLASS);
    selectedMaterial = { type: getItemType(element), index: getItemIndex(element), element };
  }

  function enterSelectedMaterial() {
    if (!selectedMaterial?.element) return false;
    const link = selectedMaterial.element.querySelector?.('a[href], button[data-open], .open-link, .library-open-btn');
    if (link) {
      link.click();
      return true;
    }
    const href = selectedMaterial.element.dataset?.url || selectedMaterial.element.getAttribute?.('href');
    if (href) {
      openTrustedUrl(href);
      return true;
    }
    selectedMaterial.element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    return true;
  }

  function deleteSelectedMaterial() {
    if (!selectedMaterial || selectedMaterial.index === null) return false;
    const { type, index } = selectedMaterial;
    if (typeof getLibrarySourceArray !== 'function') return false;
    const items = getLibrarySourceArray(type);
    if (!Array.isArray(items) || !items[index]) return false;
    const name = items[index].name || items[index].title || items[index].url || 'this material';
    const ok = window.confirm(`Delete ${name}?`);
    if (!ok) return true;
    items.splice(index, 1);
    selectedMaterial = null;
    window.unitrackEnsureLibraryState?.();
    if (typeof save === 'function') save();
    if (typeof renderModuleLibrary === 'function') renderModuleLibrary();
    return true;
  }

  function setFolderPathFromElement(folderElement) {
    const folder = folderElement?.dataset?.folderPath || folderElement?.dataset?.folder || folderElement?.getAttribute?.('data-path') || '';
    if (!folder) return false;
    const type = folderElement.dataset?.libraryType || folderElement.closest?.('[data-library-type]')?.dataset?.libraryType || (window.moduleLibraryActiveFolderType || 'formula');
    if (typeof setActiveLibraryFolder === 'function') setActiveLibraryFolder(type, folder);
    if (typeof renderModuleLibrary === 'function') renderModuleLibrary();
    return true;
  }

  window.unitrackEnhanceLibraryDom = function unitrackEnhanceLibraryDom() {
    const libraryRoots = document.querySelectorAll('#module-library-modal, #library-modal, .module-library-modal, .library-modal, .library-panel');
    libraryRoots.forEach((root) => {
      root.querySelectorAll('[data-library-item-index], [data-item-index], .library-item, .module-library-item, .material-item, .formula-item, .link-item').forEach((item, index) => {
        if (item.dataset.unitrackEnhanced === '1') return;
        item.dataset.unitrackEnhanced = '1';
        if (!item.dataset.libraryItemIndex && !item.dataset.itemIndex) item.dataset.libraryItemIndex = String(index);
        item.setAttribute('tabindex', item.getAttribute('tabindex') || '0');
        item.setAttribute('role', item.getAttribute('role') || 'option');
        item.setAttribute('aria-selected', item.classList.contains(SELECTED_CLASS) ? 'true' : 'false');
      });
      root.querySelectorAll('[data-folder-path], [data-folder], .library-folder, .folder-card, .folder-row, .folder-item').forEach((folder) => {
        if (folder.dataset.unitrackFolderEnhanced === '1') return;
        folder.dataset.unitrackFolderEnhanced = '1';
        folder.setAttribute('tabindex', folder.getAttribute('tabindex') || '0');
        folder.setAttribute('role', folder.getAttribute('role') || 'button');
      });
    });
  };

  document.addEventListener('click', (event) => {
    const item = closestLibraryItem(event.target);
    if (!item) return;
    if (event.target.closest('button, a, input, textarea, select')) return;
    markSelected(item);
  }, true);

  document.addEventListener('dblclick', (event) => {
    const item = closestLibraryItem(event.target);
    if (item && !event.target.closest('button, a, input, textarea, select')) {
      event.preventDefault();
      event.stopPropagation();
      markSelected(item);
      enterSelectedMaterial();
      return;
    }
    const folder = closestFolder(event.target);
    if (folder && !event.target.closest('button, a, input, textarea, select')) {
      event.preventDefault();
      event.stopPropagation();
      setFolderPathFromElement(folder);
    }
  }, true);

  document.addEventListener('keydown', (event) => {
    const item = closestLibraryItem(event.target);
    const folder = closestFolder(event.target);
    if (item && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      markSelected(item);
      if (event.key === 'Enter') enterSelectedMaterial();
      return;
    }
    if (folder && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      setFolderPathFromElement(folder);
      return;
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedMaterial && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) {
      event.preventDefault();
      deleteSelectedMaterial();
    }
  }, true);

  document.addEventListener('dragstart', (event) => {
    const item = closestLibraryItem(event.target);
    if (!item) return;
    markSelected(item);
    const payload = JSON.stringify({ type: getItemType(item), index: getItemIndex(item) });
    event.dataTransfer?.setData('application/x-unitrack-library-item', payload);
    event.dataTransfer?.setData('text/plain', payload);
  }, true);

  document.addEventListener('dragover', (event) => {
    const folder = closestFolder(event.target);
    if (!folder) return;
    event.preventDefault();
    folder.classList.add('unitrack-library-drag-over');
  }, true);

  document.addEventListener('dragleave', (event) => {
    const folder = closestFolder(event.target);
    if (folder) folder.classList.remove('unitrack-library-drag-over');
  }, true);

  document.addEventListener('drop', (event) => {
    const folder = closestFolder(event.target);
    if (!folder) return;
    folder.classList.remove('unitrack-library-drag-over');
    const raw = event.dataTransfer?.getData('application/x-unitrack-library-item') || event.dataTransfer?.getData('text/plain');
    if (!raw) return;
    try {
      const payload = JSON.parse(raw);
      const targetFolder = folder.dataset.folderPath || folder.dataset.folder || folder.getAttribute('data-path') || '';
      if (payload && Number.isInteger(payload.index)) {
        event.preventDefault();
        window.unitrackSetItemFolder?.(payload.type || 'relevant', payload.index, targetFolder);
      }
    } catch (error) {
      // Ignore unrelated drops.
    }
  }, true);

  const observer = new MutationObserver(() => window.unitrackEnhanceLibraryDom?.());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', () => window.unitrackEnhanceLibraryDom?.());
})();
