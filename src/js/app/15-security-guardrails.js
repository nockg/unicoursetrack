/* UniTrack Account Panel - Consolidated Account/Privacy/Backup Controls
   No Preferences backup injection. No extra patch file. */

(function () {
  "use strict";

  const BACKUP_VERSION = 2;
  const MAX_IMPORT_BYTES = 750000;
  const SNAPSHOT_KEY = "unitrack_recovery_backups_v1";

  function hasCurrentUser() {
    try { return typeof currentUser !== "undefined" && !!currentUser; } catch { return false; }
  }

  function getCurrentUserEmail() {
    try {
      return String(currentUser?.email || currentUser?.user_metadata?.email || "").trim();
    } catch {
      return "";
    }
  }

  function getCloudStatus() {
    try {
      if (typeof cloudLoadSucceeded !== "undefined" && cloudLoadSucceeded) return "Synced";
      if (typeof cloudReady !== "undefined" && cloudReady) return "Sync pending";
      return "Local";
    } catch {
      return "Signed in";
    }
  }

  function getStateRef() {
    try { return typeof state !== "undefined" ? state : {}; } catch { return {}; }
  }

  function getPrefsRef() {
    try { return typeof preferences !== "undefined" ? preferences : {}; } catch { return {}; }
  }

  function setStateRef(nextState) {
    try { if (typeof state !== "undefined") state = nextState; } catch {}
  }

  function escapeSafe(value) {
    if (typeof escapeHtml === "function") return escapeHtml(value);
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function isObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value ?? null));
  }

  function getStamp() {
    return new Date().toISOString().replace(/[:.]/g, "-");
  }

  function getTrackerLabel() {
    const profile = getStateRef()?.profile || {};
    const course = String(profile.course || "UniTrack").trim();
    const university = String(profile.university || "").trim();
    return university ? `${course} — ${university}` : course;
  }

  function getProfileName() {
    return String(getStateRef()?.profile?.name || "").trim() || "UniTrack user";
  }

  function filename(prefix) {
    const safe = getTrackerLabel()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "unitrack";
    return `${prefix}-${safe}-${getStamp()}.json`;
  }

  function backupPayload(kind = "manual-backup") {
    return {
      app: "UniTrack",
      version: BACKUP_VERSION,
      kind,
      exportedAt: new Date().toISOString(),
      profileLabel: getTrackerLabel(),
      data: clone(getStateRef()),
      prefs: clone(getPrefsRef())
    };
  }

  function downloadJson(payload, name) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
  }

  function getRecoveryBackups() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveRecoveryBackup(reason = "Recovery backup") {
    const backups = getRecoveryBackups();
    backups.unshift({
      id: `recovery_${Date.now()}`,
      reason,
      createdAt: new Date().toISOString(),
      payload: backupPayload("recovery-backup")
    });
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(backups.slice(0, 10)));
  }

  function exportBackup() {
    downloadJson(backupPayload("manual-backup"), filename("unitrack-backup"));
  }

  function exportRecoveryBackup() {
    if (!getRecoveryBackups().length) saveRecoveryBackup("Manual recovery backup export");
    downloadJson(getRecoveryBackups()[0]?.payload || backupPayload("recovery-backup"), filename("unitrack-recovery-backup"));
  }

  function isSafeUserUrl(value) {
    const text = String(value || "").trim();
    if (!text) return true;
    try {
      const url = new URL(text);
      return ["https:", "http:", "mailto:"].includes(url.protocol);
    } catch {
      return false;
    }
  }

  function cleanText(value) {
    return String(value ?? "")
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/\son[a-z]+\s*=\s*["'][^"']*["']/gi, "")
      .slice(0, 20000);
  }

  function cleanDeep(value, key = "") {
    if (Array.isArray(value)) return value.slice(0, 1200).map((item) => cleanDeep(item, key));
    if (isObject(value)) {
      const out = {};
      Object.entries(value).slice(0, 600).forEach(([entryKey, entryValue]) => {
        out[entryKey] = cleanDeep(entryValue, entryKey);
      });
      return out;
    }
    if (typeof value === "string") {
      if (/url|link|href|blackboard/i.test(key)) return isSafeUserUrl(value) ? value.trim() : "";
      if (/folder/i.test(key)) {
        return value.replace(/\\+/g, "/").split("/").map((part) => part.trim()).filter(Boolean).join("/").slice(0, 300);
      }
      return cleanText(value);
    }
    return value;
  }

  function validateBackup(payload) {
    if (!isObject(payload)) return "Backup file must contain a JSON object.";
    if (payload.app !== "UniTrack") return "This does not look like a UniTrack backup.";
    if (!isObject(payload.data)) return "Backup is missing tracker data.";
    if (!isObject(payload.prefs)) return "Backup is missing preferences.";
    if (new Blob([JSON.stringify(payload)]).size > MAX_IMPORT_BYTES) return "Backup file is too large.";
    return "";
  }

  async function notify(title, message = "") {
    if (typeof showAppNotice === "function") return showAppNotice(title, message);
    alert(message ? `${title}\n\n${message}` : title);
  }

  async function ask(options = {}) {
    if (typeof appConfirm === "function") return appConfirm(options);
    return confirm(`${options.title || "Continue?"}\n\n${options.message || ""}`);
  }

  async function importBackup() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.style.display = "none";
    document.body.appendChild(input);

    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;

      if (file.size > MAX_IMPORT_BYTES) {
        await notify("Backup too large", "This backup is larger than UniTrack allows for import.");
        return;
      }

      let payload;
      try { payload = JSON.parse(await file.text()); }
      catch {
        await notify("Invalid backup", "The selected file is not valid JSON.");
        return;
      }

      const error = validateBackup(payload);
      if (error) {
        await notify("Invalid backup", error);
        return;
      }

      const modulesCount = Object.values(payload.data?.years || {})
        .reduce((sum, year) => sum + (year?.store?.modules?.length || 0), 0);

      const confirmed = await ask({
        label: "Import Backup",
        title: "Import this UniTrack backup?",
        message: `This will replace the current tracker with the selected backup. It contains ${modulesCount} module(s). A recovery backup will be made first.`,
        confirmText: "Import Backup"
      });
      if (!confirmed) return;

      saveRecoveryBackup("Before backup import");

      setStateRef(cleanDeep(payload.data));
      const prefs = getPrefsRef();
      Object.keys(prefs || {}).forEach((key) => delete prefs[key]);
      Object.assign(prefs, cleanDeep(payload.prefs));

      try { if (typeof ensureYearsState === "function") ensureYearsState(); } catch {}
      try { if (typeof refreshActiveYear === "function") refreshActiveYear(); } catch {}
      try { if (typeof syncUndoBaseline === "function") syncUndoBaseline(); } catch {}
      try { if (typeof applyPreferences === "function") applyPreferences(); } catch {}
      try { if (typeof renderYearSelector === "function") renderYearSelector(); } catch {}
      try { if (typeof buildModules === "function") buildModules(); } catch {}
      try { if (typeof renderStickyExams === "function") renderStickyExams(); } catch {}
      try { if (typeof updateGlobal === "function") updateGlobal(); } catch {}

      try {
        const key = typeof KEY !== "undefined" ? KEY : "course_progress_tracker_v1";
        const prefsKey = typeof PREFS_KEY !== "undefined" ? PREFS_KEY : "course_progress_prefs_v1";
        localStorage.setItem(key, JSON.stringify(getStateRef()));
        localStorage.setItem(prefsKey, JSON.stringify(getPrefsRef()));
      } catch {}

      try {
        if (typeof saveCloudNow === "function") saveCloudNow();
        else if (typeof saveCloudDebounced === "function") saveCloudDebounced();
      } catch {}

      await notify("Backup imported", "Your backup has been restored successfully.");
      renderAccountPanel();
    });

    input.click();
  }

  async function clearLocalDeviceData() {
    const confirmed = await ask({
      label: "Local Device",
      title: "Clear local device data?",
      message: "This clears UniTrack data saved in this browser only. Your cloud sync data stays in your account.",
      confirmText: "Clear Local Data",
      danger: true
    });
    if (!confirmed) return;

    saveRecoveryBackup("Before clearing local device data");

    try {
      const key = typeof KEY !== "undefined" ? KEY : "course_progress_tracker_v1";
      const prefsKey = typeof PREFS_KEY !== "undefined" ? PREFS_KEY : "course_progress_prefs_v1";
      localStorage.removeItem(key);
      localStorage.removeItem(prefsKey);
    } catch {}

    try { if (typeof resetLocalAppState === "function") resetLocalAppState(); } catch {}

    await notify("Local data cleared", "This browser's local UniTrack data was cleared. Cloud data was not deleted.");
    renderAccountPanel();
  }

  async function deleteCloudSyncData() {
    const confirmed = await ask({
      label: "Danger Zone",
      title: "Delete cloud sync data?",
      message: "This deletes the saved tracker profile from your cloud account. A recovery backup will be made first.",
      confirmText: "Delete Cloud Sync Data",
      danger: true
    });
    if (!confirmed) return;

    saveRecoveryBackup("Before deleting cloud sync data");

    try {
      if (typeof trackerApiRequest !== "function") throw new Error("Cloud API helper is unavailable.");
      await trackerApiRequest("DELETE");
      await notify("Cloud sync data deleted", "Your cloud tracker data has been deleted. Local data on this browser was not cleared.");
    } catch (error) {
      await notify("Cloud delete failed", error?.message || "Could not delete cloud sync data.");
    }

    renderAccountPanel();
  }

  function toggleDangerZone() {
    const zone = document.getElementById("unitrack-danger-zone-body");
    const btn = document.getElementById("unitrack-danger-zone-toggle");
    if (!zone || !btn) return;
    const open = zone.classList.toggle("open");
    btn.setAttribute("aria-expanded", String(open));
    btn.textContent = open ? "Hide permanent delete" : "Show permanent delete";
  }

  function togglePrivacyDetails() {
    const body = document.getElementById("unitrack-privacy-body");
    const btn = document.getElementById("unitrack-privacy-toggle");
    if (!body || !btn) return;
    const open = body.classList.toggle("open");
    btn.setAttribute("aria-expanded", String(open));
    const label = btn.querySelector(".account-clean-toggle-label");
    const chevron = btn.querySelector(".account-clean-chevron");
    if (label) label.textContent = open ? "Hide details" : "Read details";
    if (chevron) chevron.classList.toggle("open", open);
  }

  function renderAccountPanel() {
    const body = document.getElementById("auth-modal-body");
    if (!body || !hasCurrentUser()) return;

    const email = escapeSafe(getCurrentUserEmail());
    const status = escapeSafe(getCloudStatus());
    const trackerLabel = escapeSafe(getTrackerLabel());
    const profileName = escapeSafe(getProfileName());
    const statusMeta = email
      ? `<small>${email}</small>`
      : `<small>Signed in to your UniTrack account</small>`;

    body.innerHTML = `
      <div class="account-clean-panel">
        <header class="account-clean-header">
          <div class="account-clean-header-copy">
            <div class="account-clean-kicker">Account Overview</div>
            <h2>Account</h2>
            <p>Signed in as <strong>${profileName}</strong>. Your everyday settings are grouped below so the important actions are easier to read, manage, and revisit.</p>
          </div>
          <div class="account-clean-status" aria-label="Account status">
            <div class="account-clean-status-label">Sync Status</div>
            <span>${status}</span>
            ${statusMeta}
          </div>
        </header>

        <section class="account-clean-section">
          <div class="account-clean-section-head">
            <div>
              <div class="account-clean-kicker">Main Settings</div>
              <h3>${trackerLabel}</h3>
              <p>Update the core details tied to this tracker before changing anything more advanced.</p>
            </div>
          </div>
          <div class="account-clean-rows">
            <button class="account-clean-row" type="button" onclick="editCourseProfile()">
              <span>
                <strong>Edit Course Setup</strong>
                <small>Name, course, university, credits, grading system.</small>
              </span>
              <em>Primary</em>
            </button>
          </div>
        </section>

        <section class="account-clean-section account-clean-privacy">
          <button id="unitrack-privacy-toggle" class="account-clean-privacy-toggle" type="button" aria-expanded="false" onclick="unitrackTogglePrivacyDetails()">
            <span>
              <span class="account-clean-kicker">Legal & Privacy</span>
              <strong>Privacy notice and data use</strong>
            </span>
            <span class="account-clean-toggle-label">Read details</span>
            <span class="account-clean-chevron" aria-hidden="true"></span>
          </button>
          <div id="unitrack-privacy-body" class="account-clean-privacy-body">
            <p>Read how UniTrack handles account access, cloud sync, backups, and deletion before making major account changes.</p>
            <p>Backups are downloadable files you control. They do not include your password, Supabase service keys, or active login session.</p>
            <p>If you want to remove synced tracker information completely, use the permanent delete control at the bottom of this page.</p>
          </div>
        </section>

        <section class="account-clean-section">
          <div class="account-clean-section-head">
            <div>
              <div class="account-clean-kicker">Backup Tools</div>
              <h3>Export or restore a backup</h3>
              <p>Download a copy, restore one, or grab the latest recovery backup.</p>
            </div>
          </div>
          <div class="account-clean-actions">
            <button type="button" onclick="unitrackExportBackup()">Export Backup</button>
            <button type="button" onclick="unitrackImportBackup()">Import Backup</button>
            <button type="button" onclick="unitrackExportRecoveryBackup()">Last Recovery Backup</button>
          </div>
        </section>

        <section class="account-clean-section account-clean-session">
          <div class="account-clean-session-copy">
            <div class="account-clean-kicker">Session</div>
            <h3>Sign out of this browser</h3>
            <p>Use this when you are done on a shared or temporary device.</p>
          </div>
          <button type="button" onclick="logoutCloud()">Logout</button>
        </section>

        <section class="account-clean-section account-clean-danger">
          <div id="unitrack-danger-zone-body" class="account-clean-danger-body">
            <div>
              <div class="account-clean-kicker">Danger Zone</div>
              <h3>Remove tracker data completely</h3>
              <p>This permanently deletes the saved tracker profile from your cloud account. It removes your synced tracker data completely, not just data stored in this browser.</p>
            </div>
            <button type="button" onclick="unitrackDeleteCloudSyncData()">Delete Cloud Sync Data</button>
          </div>
          <button id="unitrack-danger-zone-toggle" class="account-clean-danger-toggle" type="button" aria-expanded="false" onclick="unitrackToggleDangerZone()">Show permanent delete</button>
        </section>
      </div>
    `;
  }

  function patchAccountFunctions() {
    if (window.__unitrackAccountConsolidatedPatched) return;
    window.__unitrackAccountConsolidatedPatched = true;

    const originalOpen = window.openAuthModal;
    if (typeof originalOpen === "function") {
      window.openAuthModal = function patchedOpenAuthModal(...args) {
        const result = originalOpen.apply(this, args);
        renderAccountPanel();
        return result;
      };
    }

    const originalRender = window.renderAuthModal;
    if (typeof originalRender === "function") {
      window.renderAuthModal = function patchedRenderAuthModal(...args) {
        const result = originalRender.apply(this, args);
        renderAccountPanel();
        return result;
      };
    }
  }

  window.unitrackExportBackup = exportBackup;
  window.unitrackImportBackup = importBackup;
  window.unitrackExportRecoveryBackup = exportRecoveryBackup;
  window.unitrackClearLocalDeviceData = clearLocalDeviceData;
  window.unitrackDeleteCloudSyncData = deleteCloudSyncData;
  window.unitrackToggleDangerZone = toggleDangerZone;
  window.unitrackTogglePrivacyDetails = togglePrivacyDetails;
  window.unitrackRenderProfessionalAccountPanel = renderAccountPanel;
  window.unitrackIsSafeUserUrl = isSafeUserUrl;

  window.exportUniTrackBackup = exportBackup;
  window.importUniTrackBackup = importBackup;
  window.exportSafetySnapshot = exportRecoveryBackup;
  window.deleteCloudTrackerData = deleteCloudSyncData;

  patchAccountFunctions();
  document.addEventListener("DOMContentLoaded", patchAccountFunctions);
})();
