import { store } from './store.js';
import { escapeHtml } from './utils.js';
import { KEY, PREFS_KEY } from './config.js';

const BACKUP_VERSION = 2;
const MAX_IMPORT_BYTES = 750000;
const SNAPSHOT_KEY = 'unitrack_recovery_backups_v1';

function hasCurrentUser() {
  return !!store.currentUser;
}

function getCurrentUserEmail() {
  return String(store.currentUser?.email || store.currentUser?.user_metadata?.email || '').trim();
}

function getCloudStatus() {
  if (window.cloudLoadSucceeded) return 'Synced';
  if (window.cloudReady) return 'Sync pending';
  return 'Local';
}

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function getStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function getTrackerLabel() {
  const profile = store.state?.profile || {};
  const course = String(profile.course || 'UniTrack').trim();
  const university = String(profile.university || '').trim();
  return university ? `${course} — ${university}` : course;
}

function getProfileName() {
  return String(store.state?.profile?.name || '').trim() || 'UniTrack user';
}

function filename(prefix) {
  const safe = getTrackerLabel()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'unitrack';
  return `${prefix}-${safe}-${getStamp()}.json`;
}

function backupPayload(kind = 'manual-backup') {
  return {
    app: 'UniTrack',
    version: BACKUP_VERSION,
    kind,
    exportedAt: new Date().toISOString(),
    profileLabel: getTrackerLabel(),
    data: clone(store.state),
    prefs: clone(store.preferences),
  };
}

function downloadJson(payload, name) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}

function getRecoveryBackups() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRecoveryBackup(reason = 'Recovery backup') {
  const backups = getRecoveryBackups();
  backups.unshift({
    id: `recovery_${Date.now()}`,
    reason,
    createdAt: new Date().toISOString(),
    payload: backupPayload('recovery-backup'),
  });
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(backups.slice(0, 10)));
}

function exportBackup() {
  downloadJson(backupPayload('manual-backup'), filename('unitrack-backup'));
}

function exportRecoveryBackup() {
  if (!getRecoveryBackups().length) saveRecoveryBackup('Manual recovery backup export');
  downloadJson(
    getRecoveryBackups()[0]?.payload || backupPayload('recovery-backup'),
    filename('unitrack-recovery-backup'),
  );
}

export function isSafeUserUrl(value) {
  const text = String(value || '').trim();
  if (!text) return true;
  try {
    const url = new URL(text);
    return ['https:', 'http:', 'mailto:'].includes(url.protocol);
  } catch {
    return false;
  }
}

function cleanText(value) {
  return String(value ?? '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*["'][^"']*["']/gi, '')
    .slice(0, 20000);
}

function cleanDeep(value, key = '') {
  if (Array.isArray(value)) return value.slice(0, 1200).map((item) => cleanDeep(item, key));
  if (isObject(value)) {
    const out = {};
    Object.entries(value).slice(0, 600).forEach(([k, v]) => { out[k] = cleanDeep(v, k); });
    return out;
  }
  if (typeof value === 'string') {
    if (/url|link|href|blackboard/i.test(key)) return isSafeUserUrl(value) ? value.trim() : '';
    if (/folder/i.test(key)) {
      return value.replace(/\\+/g, '/').split('/').map((p) => p.trim()).filter(Boolean).join('/').slice(0, 300);
    }
    return cleanText(value);
  }
  return value;
}

function validateBackup(payload) {
  if (!isObject(payload)) return 'Backup file must contain a JSON object.';
  if (payload.app !== 'UniTrack') return 'This does not look like a UniTrack backup.';
  if (!isObject(payload.data)) return 'Backup is missing tracker data.';
  if (!isObject(payload.prefs)) return 'Backup is missing preferences.';
  if (new Blob([JSON.stringify(payload)]).size > MAX_IMPORT_BYTES) return 'Backup file is too large.';
  return '';
}

async function notify(title, message = '') {
  if (typeof window.showAppNotice === 'function') return window.showAppNotice(title, message);
  alert(message ? `${title}\n\n${message}` : title);
}

async function ask(options = {}) {
  if (typeof window.appConfirm === 'function') return window.appConfirm(options);
  return confirm(`${options.title || 'Continue?'}\n\n${options.message || ''}`);
}

async function importBackup() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.style.display = 'none';
  document.body.appendChild(input);

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;

    if (file.size > MAX_IMPORT_BYTES) {
      await notify('Backup too large', 'This backup is larger than UniTrack allows for import.');
      return;
    }

    let payload;
    try { payload = JSON.parse(await file.text()); }
    catch { await notify('Invalid backup', 'The selected file is not valid JSON.'); return; }

    const error = validateBackup(payload);
    if (error) { await notify('Invalid backup', error); return; }

    const modulesCount = Object.values(payload.data?.years || {})
      .reduce((sum, year) => sum + (year?.store?.modules?.length || 0), 0);

    const confirmed = await ask({
      label: 'Import Backup',
      title: 'Import this UniTrack backup?',
      message: `This will replace the current tracker with the selected backup. It contains ${modulesCount} module(s). A recovery backup will be made first.`,
      confirmText: 'Import Backup',
    });
    if (!confirmed) return;

    saveRecoveryBackup('Before backup import');

    store.state = cleanDeep(payload.data);
    const prefs = store.preferences;
    Object.keys(prefs || {}).forEach((k) => delete prefs[k]);
    Object.assign(prefs, cleanDeep(payload.prefs));

    window.ensureYearsState?.();
    window.refreshActiveYear?.();
    window.syncUndoBaseline?.();
    window.applyPreferences?.();
    window.renderYearSelector?.();
    window.buildModules?.();
    window.renderStickyExams?.();
    window.updateGlobal?.();

    try {
      localStorage.setItem(KEY, JSON.stringify(store.state));
      localStorage.setItem(PREFS_KEY, JSON.stringify(store.preferences));
    } catch {}

    try {
      if (typeof window.saveCloudNow === 'function') window.saveCloudNow();
      else window.saveCloudDebounced?.();
    } catch {}

    await notify('Backup imported', 'Your backup has been restored successfully.');
    renderAccountPanel();
  });

  input.click();
}

async function clearLocalDeviceData() {
  const confirmed = await ask({
    label: 'Local Device',
    title: 'Clear local device data?',
    message: 'This clears UniTrack data saved in this browser only. Your cloud sync data stays in your account.',
    confirmText: 'Clear Local Data',
    danger: true,
    checkboxLabel: 'I understand this removes data from this browser only.',
    checkboxRequired: true,
  });
  if (!confirmed) return;

  saveRecoveryBackup('Before clearing local device data');

  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(PREFS_KEY);
  } catch {}

  window.resetLocalAppState?.();

  await notify('Local data cleared', "This browser's local UniTrack data was cleared. Cloud data was not deleted.");
  renderAccountPanel();
}

async function deleteCloudSyncData() {
  const confirmed = await ask({
    label: 'Danger Zone',
    title: 'Delete cloud sync data?',
    message: 'This deletes the saved tracker profile from your cloud account. A recovery backup will be made first.',
    confirmText: 'Delete Cloud Sync Data',
    danger: true,
    checkboxLabel: 'I understand this permanently deletes synced tracker data from my account.',
    checkboxRequired: true,
  });
  if (!confirmed) return;

  saveRecoveryBackup('Before deleting cloud sync data');

  try {
    if (typeof window.trackerApiRequest !== 'function') throw new Error('Cloud API helper is unavailable.');
    await window.trackerApiRequest('DELETE');
    await notify('Cloud sync data deleted', 'Your cloud tracker data has been deleted. Local data on this browser was not cleared.');
  } catch (error) {
    await notify('Cloud delete failed', error?.message || 'Could not delete cloud sync data.');
  }

  renderAccountPanel();
}

function toggleDangerZone() {
  const zone = document.getElementById('unitrack-danger-zone-body');
  const btn = document.getElementById('unitrack-danger-zone-toggle');
  const section = btn?.closest('.account-clean-danger');
  if (!zone || !btn) return;
  const open = zone.classList.toggle('open');
  if (section) section.classList.toggle('open', open);
  btn.setAttribute('aria-expanded', String(open));
  btn.textContent = open ? 'Hide deletion options' : 'Show deletion options';
}

function isUniTrackStandalone() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  } catch {
    return false;
  }
}

async function showInstallInstructions() {
  const installed = isUniTrackStandalone();
  if (installed) {
    await notify('UniTrack is installed', 'UniTrack is already running in app mode on this device.');
    return;
  }
  await notify(
    'Install UniTrack on your phone',
    [
      'iPhone / Safari',
      '1. Open unitrack.uk in Safari.',
      '2. Tap the Share button.',
      '3. Tap Add to Home Screen.',
      '4. Tap Add.',
      '',
      'Android / Chrome',
      '1. Open unitrack.uk in Chrome.',
      '2. Tap the three-dot menu.',
      '3. Tap Add to Home screen or Install app.',
      '4. Follow the prompt.',
    ].join('\n'),
  );
}

export function renderAccountPanel() {
  const body = document.getElementById('auth-modal-body');
  if (!body || !hasCurrentUser()) return;

  const modalCard = body.closest('.deadline-form-content');
  const modalLabel = modalCard?.querySelector('.deadline-splash-label');
  const modalLegalCard = modalCard?.querySelector('.auth-legal-card');

  if (modalLabel) modalLabel.textContent = 'Account';
  if (modalLegalCard) modalLegalCard.style.display = 'none';

  const email = escapeHtml(getCurrentUserEmail());
  const status = escapeHtml(getCloudStatus());
  const trackerLabel = escapeHtml(getTrackerLabel());
  const profileName = escapeHtml(getProfileName());

  const isInstalled = isUniTrackStandalone();
  const installTitle = isInstalled ? 'Installed on This Device' : 'Install UniTrack on Your Phone';
  const installCopy = isInstalled
    ? 'UniTrack is already opening in app mode on this device.'
    : 'Add UniTrack to your Home Screen for faster app-like access.';
  const installAction = isInstalled ? 'Installed' : 'How to install';

  const statusMeta = email
    ? `<small>${email}</small>`
    : `<small>Signed in to your UniTrack account</small>`;

  body.innerHTML = `
    <div class="account-clean-panel">
      <header class="account-clean-header">
        <div class="account-clean-header-copy">
          <div class="account-clean-kicker">Account Overview</div>
          <h2>Account</h2>
          <p>Signed in as <strong>${profileName}</strong>.</p>
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
        <button class="account-clean-privacy-link" type="button" onclick="openTrustedUrl('/privacy.html')">
          <span>
            <span class="account-clean-kicker">Privacy</span>
            <strong>Privacy Notice and Data Use</strong>
          </span>
          <span class="account-clean-toggle-label">Open notice</span>
        </button>
      </section>
      <section class="account-clean-section account-clean-install">
        <button class="account-clean-privacy-link account-clean-install-link" type="button" onclick="unitrackShowInstallInstructions()">
          <span>
            <span class="account-clean-kicker">Device</span>
            <strong>${installTitle}</strong>
            <small>${installCopy}</small>
          </span>
          <span class="account-clean-toggle-label">${installAction}</span>
        </button>
      </section>
      <section class="account-clean-section">
        <div class="account-clean-section-head">
          <div>
            <div class="account-clean-kicker">Backup Tools</div>
            <h3>Export or Restore a Backup</h3>
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
          <h3>Sign Out of This Browser</h3>
          <p>Logout from your UniTrack account.</p>
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
        <button id="unitrack-danger-zone-toggle" class="account-clean-danger-toggle" type="button" aria-expanded="false" onclick="unitrackToggleDangerZone()">Show deletion options</button>
      </section>
    </div>
  `;
}

window.unitrackExportBackup = exportBackup;
window.unitrackImportBackup = importBackup;
window.unitrackExportRecoveryBackup = exportRecoveryBackup;
window.unitrackClearLocalDeviceData = clearLocalDeviceData;
window.unitrackDeleteCloudSyncData = deleteCloudSyncData;
window.unitrackToggleDangerZone = toggleDangerZone;
window.unitrackShowInstallInstructions = showInstallInstructions;
window.unitrackRenderProfessionalAccountPanel = renderAccountPanel;
window.unitrackIsSafeUserUrl = isSafeUserUrl;
window.exportUniTrackBackup = exportBackup;
window.importUniTrackBackup = importBackup;
window.exportSafetySnapshot = exportRecoveryBackup;
window.deleteCloudTrackerData = deleteCloudSyncData;
