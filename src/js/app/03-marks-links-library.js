function parseMark(value) {
  if (value === "" || value === null || value === undefined) return null;
  const num = parseFloat(value);
  if (Number.isNaN(num)) return null;
  return Math.max(0, Math.min(100, num));
}

function topicKey(mi, ti) { return `t_${mi}_${ti}`; }
function getModuleDone(mi) {
  const store = getStore();
  return MODULES[mi].topics.reduce((sum, _, ti) => {
    const topic = getTopicEntry(mi, ti);
    let done = store.topics[topicKey(mi, ti)] ? 1 : 0;
    done += topic.subtopics.filter((_, si) => !!store.topics[subtopicKey(mi, ti, si)]).length;
    return sum + done;
  }, 0);
}
function getModuleTotal(mi) {
  return MODULES[mi].topics.reduce((sum, _, ti) => sum + 1 + getTopicEntry(mi, ti).subtopics.length, 0);
}
function getModulePct(mi) { return getModuleTotal(mi) ? (getModuleDone(mi) / getModuleTotal(mi)) * 100 : 0; }
function getBlackboardLink(mi) {
  const store = getStore();
  return store.blackboard[mi] || "";
}

function normalizeLibraryItem(item, fallbackName = "Saved item") {
  if (typeof item === "string") {
    return { name: fallbackName, url: item, tag: "", notes: "" };
  }
  if (!item || typeof item !== "object") {
    return { name: fallbackName, url: "", tag: "", notes: "" };
  }
  return {
    name: String(item.name || item.title || fallbackName).trim() || fallbackName,
    url: String(item.url || item.href || "").trim(),
    tag: String(item.tag || item.category || "").trim(),
    notes: String(item.notes || item.note || "").trim()
  };
}

function getFormulaLinks(mi) {
  const store = getStore();
  const raw = store.formulas?.[mi];
  if (Array.isArray(raw)) {
    const mod = MODULES[mi];
    return raw
      .map((item) => normalizeLibraryItem(item, `${mod?.short || mod?.kanji || "Module"} Material`))
      .filter((item) => item.url);
  }
  if (typeof raw === "string" && raw.trim()) {
    const mod = MODULES[mi];
    return [normalizeLibraryItem(raw, `${mod?.short || mod?.kanji || "Module"} Material`)];
  }
  return [];
}

function getRelevantLinks(mi) {
  const store = getStore();
  if (!store.relevantLinks) store.relevantLinks = {};
  const raw = store.relevantLinks[mi];
  if (Array.isArray(raw)) {
    return raw
      .map((item) => normalizeLibraryItem(item, "Useful resource"))
      .filter((item) => item.url);
  }
  if (typeof raw === "string" && raw.trim()) {
    return [normalizeLibraryItem(raw, "Useful resource")];
  }
  return [];
}


function getCourseworkComponents(mi) {
  const store = getStore();
  if (!store.courseworkComponents) store.courseworkComponents = {};
  if (!Array.isArray(store.courseworkComponents[mi])) store.courseworkComponents[mi] = [];
  return store.courseworkComponents[mi];
}

function calculateCourseworkFromComponents(mi) {
  const components = getCourseworkComponents(mi);
  const valid = components
    .map((component, index) => ({
      index,
      name: component.name || `Component ${index + 1}`,
      mark: parseMark(component.mark),
      weight: parseMark(component.weight)
    }))
    .filter((component) => component.mark !== null);

  if (!valid.length) {
    return { mark: null, weightTotal: 0, count: components.length };
  }

  const explicit = valid.filter((component) => component.weight !== null);
  const unweighted = valid.filter((component) => component.weight === null);
  const explicitTotal = explicit.reduce((sum, component) => sum + component.weight, 0);
  const remaining = Math.max(0, 100 - explicitTotal);
  const autoWeight = unweighted.length ? remaining / unweighted.length : 0;

  let weightedSum = 0;
  let assignedTotal = 0;

  valid.forEach((component) => {
    const weight = component.weight !== null ? component.weight : autoWeight;
    weightedSum += component.mark * weight;
    assignedTotal += weight;
  });

  if (assignedTotal <= 0) return { mark: null, weightTotal: 0, count: components.length };

  return {
    mark: weightedSum / assignedTotal,
    weightTotal: assignedTotal,
    count: components.length
  };
}

function getEffectiveCourseworkMark(mi) {
  const calculated = calculateCourseworkFromComponents(mi);
  if (calculated.mark !== null) return calculated.mark;
  return parseMark(getStore().coursework[mi]);
}

function getModuleFinal(mi) {
  const mod = MODULES[mi];
  const store = getStore();
  const cw = getEffectiveCourseworkMark(mi);
  const ex = parseMark(store.exams[mi]);
  if (mod.cw === 0) return ex;
  if (cw === null || ex === null) return null;
  return (cw * mod.cw + ex * mod.exam) / 100;
}

function classify(mark) {
  if (mark === null) return null;
  if (mark >= 70) return { label: "1st", badge: "1st Class", cls: "cls-s-first", heroCls: "cls-first" };
  if (mark >= 60) return { label: "2:1", badge: "2:1", cls: "cls-s-21", heroCls: "cls-21" };
  if (mark >= 50) return { label: "2:2", badge: "2:2", cls: "cls-s-22", heroCls: "cls-22" };
  if (mark >= 40) return { label: "3rd", badge: "3rd", cls: "cls-s-third", heroCls: "cls-third" };
  return { label: "Fail", badge: "Fail", cls: "", heroCls: "" };
}

function getWeightedAvg() {
  let weighted = 0;
  let credits = 0;
  MODULES.forEach((mod, mi) => {
    const final = getModuleFinal(mi);
    if (final !== null) {
      weighted += final * mod.credits;
      credits += mod.credits;
    }
  });
  return credits ? weighted / credits : null;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeUrl(url) {
  const trimmed = String(url || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return "https://" + trimmed.replace(/^\/+/, "");
}

function parseDeadlineInput(input) {
  const raw = String(input || "").trim();
  const match = raw.match(/^(\d{1,2})[\/\-. ](\d{1,2})[\/\-. ](\d{4})(?:[ ,]+(\d{1,2}):(\d{2}))?$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const hours = Number(match[4] ?? 0);
  const minutes = Number(match[5] ?? 0);
  const date = new Date(year, month - 1, day, hours, minutes);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    hours > 23 ||
    minutes > 59
  ) return null;
  return date;
}

function toDeadlineStorageString(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function setBlackboardLink(mi, event) {
  if (event) event.stopPropagation();
  openLinkForm({ type: "blackboard", mi });
}

function openLinkForm(context) {
  linkFormContext = context;
  const modal = document.getElementById("link-form-modal");
  const subtitle = document.getElementById("link-form-subtitle");
  const title = document.getElementById("link-form-title");
  const nameField = document.getElementById("link-name-field");
  const nameInput = document.getElementById("link-name-input");
  const urlInput = document.getElementById("link-url-input");
  const tagInput = document.getElementById("link-tag-input");
  const notesInput = document.getElementById("link-notes-input");

  nameInput.value = "";
  urlInput.value = "";
  tagInput.value = "";
  notesInput.value = "";
  nameField.style.display = "block";

  const editingItem = context.mode === "edit"
    ? (context.type === "formula" ? getFormulaLinks(context.mi)[context.index] : getRelevantLinks(context.mi)[context.index])
    : null;

  if (context.type === "blackboard") {
    subtitle.textContent = "Blackboard";
    title.textContent = "Set Blackboard Link";
    nameField.style.display = "none";
    urlInput.value = getBlackboardLink(context.mi) || "";
    tagInput.closest(".deadline-form-row").style.display = "none";
  } else if (context.type === "formula") {
    subtitle.textContent = "Module Material";
    title.textContent = context.mode === "edit" ? "Edit Module Material" : "Add Module Material";
    nameInput.value = editingItem?.name || (MODULES[context.mi].short + " Material");
    tagInput.closest(".deadline-form-row").style.display = "grid";
  } else {
    subtitle.textContent = "Relevant Links";
    title.textContent = context.mode === "edit" ? "Edit Relevant Link" : "Add Relevant Link";
    nameInput.value = editingItem?.name || "Useful resource";
    tagInput.closest(".deadline-form-row").style.display = "grid";
  }

  if (editingItem) {
    urlInput.value = editingItem.url || "";
    tagInput.value = editingItem.tag || "";
    notesInput.value = editingItem.notes || "";
  }

  modal.classList.remove("hidden");
  setTimeout(() => (nameField.style.display === "none" ? urlInput : nameInput).focus(), 0);
}

function closeLinkForm() {
  document.getElementById("link-form-modal").classList.add("hidden");
  linkFormContext = null;
}

function saveLinkForm() {
  if (!linkFormContext) return;
  const nameInput = document.getElementById("link-name-input");
  const urlInput = document.getElementById("link-url-input");
  const tagInput = document.getElementById("link-tag-input");
  const notesInput = document.getElementById("link-notes-input");
  const url = (urlInput.value || "").trim();
  const store = getStore();

  if (linkFormContext.type === "blackboard") {
    if (url) store.blackboard[linkFormContext.mi] = safeUrl(url);
    else delete store.blackboard[linkFormContext.mi];
    save();
    updateBlackboardButton(linkFormContext.mi);
    closeLinkForm();
    return;
  }

  const name = (nameInput.value || "").trim();
  const tag = (tagInput.value || "").trim();
  const notes = (notesInput.value || "").trim();
  if (!name || !url) {
    alert("Please enter both a name and a URL.");
    return;
  }
  const payload = { name, url: safeUrl(url), tag, notes };

  if (linkFormContext.type === "formula") {
    const items = getFormulaLinks(linkFormContext.mi).slice();
    if (linkFormContext.mode === "edit" && items[linkFormContext.index]) items[linkFormContext.index] = payload;
    else items.push(payload);
    store.formulas[linkFormContext.mi] = items;
    save();
    updateFormulaButton(linkFormContext.mi);
  } else if (linkFormContext.type === "relevant") {
    if (!store.relevantLinks) store.relevantLinks = {};
    const items = getRelevantLinks(linkFormContext.mi).slice();
    if (linkFormContext.mode === "edit" && items[linkFormContext.index]) items[linkFormContext.index] = payload;
    else items.push(payload);
    store.relevantLinks[linkFormContext.mi] = items;
    save();
    renderRelevantLinks(linkFormContext.mi);
  }
  closeLinkForm();
  renderModuleLibrary();
}

function openBlackboardLink(mi, event) {
  if (event) event.stopPropagation();
  const url = getBlackboardLink(mi);
  if (url) window.open(url, "_blank", "noopener");
  else setBlackboardLink(mi);
}

function updateBlackboardButton(mi) {
  const btn = document.getElementById(`bb-link-${mi}`);
  if (!btn) return;
  const hasLink = !!getBlackboardLink(mi);
  const compact = document.body.classList.contains("compact-ui");
  if (compact) btn.textContent = hasLink ? "Blackboard" : "Set";
  else btn.textContent = hasLink ? "Launch Blackboard" : "Set Blackboard";
}

function setFormulaLink(mi, event) {
  if (event) event.stopPropagation();
  openLinkForm({ type: "formula", mi });
}

function getModuleLibraryItems(type, moduleIndex = null) {
  const items = [];
  MODULES.forEach((mod, mi) => {
    if (moduleIndex !== null && mi !== moduleIndex) return;
    const source = type === "formula" ? getFormulaLinks(mi) : getRelevantLinks(mi);
    source.forEach((item, index) => {
      items.push({
        type,
        mi,
        index,
        moduleCode: mod.kanji || mod.short || `Module ${mi + 1}`,
        moduleName: mod.name || mod.short || `Module ${mi + 1}`,
        name: item.name || "",
        url: item.url || "",
        tag: item.tag || "",
        notes: item.notes || ""
      });
    });
  });
  const search = moduleLibrarySearch.trim().toLowerCase();
  const filter = moduleLibraryScopeMi === null ? moduleLibraryFilter : String(moduleLibraryScopeMi);
  return items.filter((item) => {
    if (filter !== "all" && String(item.mi) !== filter) return false;
    if (!search) return true;
    return [item.name, item.url, item.tag, item.notes, item.moduleCode, item.moduleName]
      .join(" ")
      .toLowerCase()
      .includes(search);
  });
}

function toggleModuleLibraryLinks() {
  moduleLibraryLinksOpen = !moduleLibraryLinksOpen;
  renderModuleLibrary();
}

function toggleModuleLibraryMaterials() {
  moduleLibraryMaterialsOpen = !moduleLibraryMaterialsOpen;
  renderModuleLibrary();
}

function buildModuleLibraryCard(item) {
  const notes = item.notes ? `<div class="module-library-card-notes">${escapeHtml(item.notes)}</div>` : "";
  const tag = item.tag ? `<span class="module-library-pill">${escapeHtml(item.tag)}</span>` : "";
  const accent = getModuleColourSet(item.mi);
  return `
    <article class="module-library-card" onclick="openLibraryItem(${item.mi}, '${item.type}', ${item.index}, event)">
      <div class="module-library-module-accent" style="background:${accent.stripe};"></div>
      <div class="module-library-card-head">
        <div>
          <div class="module-library-card-title">${escapeHtml(item.name)}</div>
          <div class="module-library-card-meta">
            <span class="module-library-pill">${escapeHtml(item.moduleCode)}</span>
            ${tag}
          </div>
        </div>
      </div>
      ${notes}
      <div class="module-library-card-actions">
        <button class="mini-btn" type="button" onclick="editLibraryItem(${item.mi}, '${item.type}', ${item.index}, event)">Edit</button>
        <button class="mini-btn module-delete-btn" type="button" onclick="deleteLibraryItem(${item.mi}, '${item.type}', ${item.index}, event)">Delete</button>
      </div>
    </article>
  `;
}

function refreshModuleLibraryFilterOptions() {
  const filter = document.getElementById("module-library-filter");
  if (!filter) return;
  if (moduleLibraryScopeMi !== null) {
    const mod = MODULES[moduleLibraryScopeMi];
    filter.innerHTML = `<option value="${moduleLibraryScopeMi}">${escapeHtml(mod?.kanji || mod?.name || "Current Module")}</option>`;
    filter.value = String(moduleLibraryScopeMi);
    filter.disabled = true;
    return;
  }
  filter.disabled = false;
  filter.innerHTML = `<option value="all">All Modules</option>` + MODULES.map((mod, mi) => (
    `<option value="${mi}">${escapeHtml(mod.kanji || mod.name || `Module ${mi + 1}`)}</option>`
  )).join("");
  filter.value = moduleLibraryFilter;
}

function renderModuleLibrary() {
  const materialsHost = document.getElementById("module-library-materials");
  const linksHost = document.getElementById("module-library-links");
  if (!materialsHost || !linksHost) return;
  const title = document.getElementById("module-library-title");
  const currentModule = moduleLibraryScopeMi !== null ? MODULES[moduleLibraryScopeMi] : null;
  if (title) title.textContent = currentModule
    ? `${currentModule.kanji || currentModule.name || "Module"} Library`
    : "All Modules Library";
  document.getElementById("module-library-open-all-btn")?.classList.toggle("hidden", moduleLibraryScopeMi === null);
  refreshModuleLibraryFilterOptions();
  const searchInput = document.getElementById("module-library-search");
  if (searchInput && searchInput.value !== moduleLibrarySearch) searchInput.value = moduleLibrarySearch;
  document.getElementById("module-library-view-list")?.classList.toggle("calendar-btn", moduleLibraryViewMode === "list");
  document.getElementById("module-library-view-cards")?.classList.toggle("calendar-btn", moduleLibraryViewMode === "cards");

  const materials = getModuleLibraryItems("formula", moduleLibraryScopeMi);
  const links = getModuleLibraryItems("relevant", moduleLibraryScopeMi);
  const materialWord = materials.length === 1 ? "item" : "items";
  const linkWord = links.length === 1 ? "link" : "links";
  const materialsSection = document.querySelector(".module-library-materials-section");
  const linksSection = linksHost.closest(".module-library-section");
  const materialsCopy = materialsSection?.querySelector(".module-library-section-copy");
  const linksCopy = linksSection?.querySelector(".module-library-section-copy");

  if (materialsSection) materialsSection.classList.toggle("is-collapsed", !moduleLibraryMaterialsOpen);
  if (linksSection) linksSection.classList.toggle("is-collapsed", !moduleLibraryLinksOpen);
  if (materialsCopy) {
    materialsCopy.textContent = moduleLibraryMaterialsOpen
      ? `Formula sheets, worked examples, reference pages, and quick-access study material. ${materials.length} saved ${materialWord}.`
      : `${materials.length} saved material ${materialWord}. Tap to expand.`;
  }
  if (linksCopy) {
    linksCopy.textContent = moduleLibraryLinksOpen
      ? `Useful URLs, portals, videos, docs, and external resources. ${links.length} saved ${linkWord}.`
      : `${links.length} saved relevant ${linkWord}. Tap to expand.`;
  }

  materialsHost.className = "module-library-list" + (moduleLibraryViewMode === "cards" ? " cards" : "") + (moduleLibraryMaterialsOpen ? "" : " hidden");
  linksHost.className = "module-library-list" + (moduleLibraryViewMode === "cards" ? " cards" : "") + (moduleLibraryLinksOpen ? "" : " hidden");
  document.getElementById("module-library-links-chevron")?.classList.toggle("open", moduleLibraryLinksOpen);
  document.getElementById("module-library-materials-chevron")?.classList.toggle("open", moduleLibraryMaterialsOpen);
  materialsHost.innerHTML = materials.length
    ? materials.map(buildModuleLibraryCard).join("")
    : `<div class="module-library-empty">No module material saved yet.</div>`;
  linksHost.innerHTML = links.length
    ? links.map(buildModuleLibraryCard).join("")
    : `<div class="module-library-empty">No relevant links saved yet.</div>`;
}

function openModuleLibrary(mi = null, focus = "both", event) {
  if (event) event.stopPropagation();
  materialLibraryModuleIndex = mi;
  moduleLibraryScopeMi = Number.isInteger(mi) ? mi : null;
  if (moduleLibraryScopeMi === null) moduleLibraryFilter = "all";
  else moduleLibraryFilter = String(moduleLibraryScopeMi);
  moduleLibraryMaterialsOpen = false;
  moduleLibraryLinksOpen = false;

  document.getElementById("module-library-modal").classList.remove("hidden");
  renderModuleLibrary();
}

function closeModuleLibrary() {
  document.getElementById("module-library-modal").classList.add("hidden");
  materialLibraryModuleIndex = null;
  moduleLibraryScopeMi = null;
}

function updateModuleLibrarySearch(value) {
  moduleLibrarySearch = String(value || "");
  renderModuleLibrary();
}

function updateModuleLibraryFilter(value) {
  moduleLibraryFilter = value;
  renderModuleLibrary();
}

function setModuleLibraryView(view) {
  moduleLibraryViewMode = view === "cards" ? "cards" : "list";
  renderModuleLibrary();
}

function openLibraryAdd(type) {
  if (moduleLibraryScopeMi === null && moduleLibraryFilter === "all") {
    showAppNotice("Pick a module first", "Choose a module from the filter at the top of the library before adding a new material or link from the all-modules view.");
    return;
  }
  const mi = moduleLibraryScopeMi !== null ? moduleLibraryScopeMi : Number(moduleLibraryFilter);
  closeModuleLibrary();
  openLinkForm({ type, mi });
}

function openLibraryItem(mi, type, index, event) {
  if (event) event.stopPropagation();
  const item = (type === "formula" ? getFormulaLinks(mi) : getRelevantLinks(mi))[index];
  if (!item?.url) return;
  window.open(item.url, "_blank", "noopener");
}

function editLibraryItem(mi, type, index, event) {
  if (event) event.stopPropagation();
  closeModuleLibrary();
  openLinkForm({ type, mi, index, mode: "edit" });
}

function deleteLibraryItem(mi, type, index, event) {
  if (type === "formula") deleteFormulaLink(mi, index, event);
  else deleteRelevantLink(mi, index, event);
  renderModuleLibrary();
}

function deleteFormulaLink(mi, index, event) {
  if (event) event.stopPropagation();
  const items = getFormulaLinks(mi).slice();
  if (!items[index]) return;
  items.splice(index, 1);
  const store = getStore();
  if (items.length) store.formulas[mi] = items; else delete store.formulas[mi];
  save();
  updateFormulaButton(mi);
  renderModuleLibrary();
}

function openFormulaLink(mi, event) {
  openModuleLibrary(mi, "materials", event);
}

function renderFormulaLinks(mi) {
  const host = document.getElementById(`formula-links-${mi}`);
  if (!host) return;
  const items = getFormulaLinks(mi);
  if (!items.length) {
    host.innerHTML = '<div class="formula-empty">No module material added yet.</div>';
    return;
  }
  host.innerHTML = items.map((item, index) => `
    <div class="formula-chip">
      <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.name)}</a>
      <button class="formula-remove-btn" type="button" onclick="deleteFormulaLink(${mi}, ${index}, event)" title="Delete module material">x</button>
    </div>
  `).join("");
}

function addRelevantLink(mi, event) {
  if (event) event.stopPropagation();
  openLinkForm({ type: "relevant", mi });
}

function deleteRelevantLink(mi, index, event) {
  if (event) event.stopPropagation();
  const items = getRelevantLinks(mi).slice();
  if (!items[index]) return;
  items.splice(index, 1);
  const store = getStore();
  if (!store.relevantLinks) store.relevantLinks = {};
  if (items.length) store.relevantLinks[mi] = items; else delete store.relevantLinks[mi];
  save();
  renderRelevantLinks(mi);
  renderModuleLibrary();
}

function renderRelevantLinks(mi) {
  const host = document.getElementById(`relevant-links-${mi}`);
  if (!host) return;
  const items = getRelevantLinks(mi);
  if (!items.length) {
    host.innerHTML = '<div class="relevant-links-empty">No relevant links added yet.</div>';
    return;
  }
  host.innerHTML = items.map((item, index) => `
    <div class="relevant-link-chip">
      <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.name)}</a>
      <button class="relevant-link-remove-btn" type="button" onclick="deleteRelevantLink(${mi}, ${index}, event)" title="Delete relevant link">x</button>
    </div>
  `).join("");
}

function updateFormulaButton(mi) {
  const btn = document.getElementById(`formula-btn-${mi}`);
  if (btn) {
    const count = getFormulaLinks(mi).length;
    const compact = document.body.classList.contains("compact-ui");
    const mod = MODULES[mi] || {};
    const labelBase = mod.kanji || mod.short || "Module";
    btn.textContent = compact
      ? "Library"
      : `${labelBase} Library`;
    btn.title = `${mod.name || labelBase} Library`;
    btn.style.opacity = count ? "1" : "0.65";
  }
  renderFormulaLinks(mi);
}
