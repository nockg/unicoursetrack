/**
 * Authentication, cloud sync, and onboarding.
 */

import { store } from './store.js';
import { escapeHtml, shiftIndexedObjectAfterDelete } from './utils.js';
import { KEY, PREFS_KEY, ONBOARDING_STEPS, cloudConfigMissing, DEFAULT_PREFERENCES } from './config.js';
import {
  syncModalScrollLock, updateAuthLock, setAuthLoading, renderCloudUnavailableGate,
  isPendingNewAccount, markPendingNewAccount, refreshActiveYear, ensureYearsState,
  syncUndoBaseline, createInitialState,
} from './state.js';
import { updateGlobal } from './dashboard.js';
import { closeDeadlineSplash, getNearestUpcomingDeadline, showDeadlineSplash } from './topics.js';
import { setupDeadlineBarScrolling } from './deadlines.js';

// ── Fix #10: named auth timing constants ──────────────────────────────────────
const AUTH_LOADING_DELAY_MS = 350;
const AUTH_UNLOCK_DELAY_MS = 650;

// ── Module-local state ────────────────────────────────────────────────────────

let authStateKnown = false;
let authStateResolver = null;
const authStateInitialized = new Promise((resolve) => { authStateResolver = resolve; }); // eslint-disable-line no-unused-vars
let onboardingStepIndex = 0;

// ── Auth state helpers ────────────────────────────────────────────────────────

export function markAuthStateKnown() {
  if (!authStateKnown) {
    authStateKnown = true;
    authStateResolver?.();
  }
}

export function clearLogoutFlagForSignedInUser() {
  if (store.currentUser) sessionStorage.removeItem('justLoggedOut');
}

export function isRecoveryFlow() {
  return store.recoveryModeActive
    || window.location.hash.includes('type=recovery')
    || window.location.search.includes('type=recovery');
}

function clearRecoveryUrl() {
  if (!isRecoveryFlow()) return;
  const cleanUrl = window.location.pathname + window.location.search.replace(/([?&])type=recovery(&)?/, (match, prefix, suffix) => {
    if (prefix === '?' && suffix) return '?';
    if (prefix === '?' && !suffix) return '';
    return suffix ? prefix : '';
  });
  history.replaceState({}, document.title, cleanUrl);
}

function getAuthInputValue(name) {
  const gateInput = document.getElementById(`auth-gate-${name}`);
  if (gateInput) return name.includes('password') ? gateInput.value : gateInput.value.trim();
  const modalInput = document.getElementById(`auth-${name}`);
  if (modalInput) return name.includes('password') ? modalInput.value : modalInput.value.trim();
  return '';
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function validateAuthEmail(email) {
  if (!email) return 'Enter your email first.';
  if (email.length > 254) return 'Email address is too long.';
  if (!isValidEmail(email)) return 'Enter a valid email address.';
  return '';
}

function validateAuthPassword(password, label = 'Password') {
  if (!password) return `Enter your ${label.toLowerCase()}.`;
  if (password.length < 6) return `${label} must be at least 6 characters.`;
  if (password.length > 128) return `${label} must be 128 characters or fewer.`;
  return '';
}

export function setAuthMessage(message = '', tone = 'error') {
  store.authStatusMessage = message || '';
  store.authStatusTone = tone;
  const gateFeedback = document.getElementById('auth-gate-feedback');
  if (gateFeedback) {
    gateFeedback.className = tone === 'success' ? 'auth-success' : 'auth-error';
    gateFeedback.textContent = store.authStatusMessage;
  }
  const modalError = document.getElementById('auth-error');
  if (modalError) modalError.textContent = tone === 'error' ? store.authStatusMessage : '';
}

function clearAuthMessage() {
  store.authStatusMessage = '';
  store.authStatusTone = 'error';
  setAuthMessage('');
}

export async function waitForInitialAuth() {
  if (!store.supabaseClient) {
    markAuthStateKnown();
    return;
  }

  const readSession = async () => {
    const { data } = await store.supabaseClient.auth.getSession();
    store.currentSession = data?.session || null;
    store.currentUser = data?.session?.user || null;
    return store.currentSession;
  };

  try {
    const hasAuthParams = window.location.hash.includes('access_token=')
      || window.location.search.includes('access_token=')
      || window.location.hash.includes('code=')
      || window.location.search.includes('code=');

    let session = await readSession();

    if (!session && hasAuthParams) {
      await new Promise((resolve) => setTimeout(resolve, AUTH_LOADING_DELAY_MS));
      session = await readSession();
    }

    if (!session && hasAuthParams) {
      await new Promise((resolve) => setTimeout(resolve, AUTH_UNLOCK_DELAY_MS));
      await readSession();
    }
  } catch (error) {
    store.currentSession = null;
    store.currentUser = null;
    console.warn('Initial auth check failed:', error?.message || error);
  }

  markAuthStateKnown();
}

// ── Onboarding ────────────────────────────────────────────────────────────────

function getOnboardingSeenKey() {
  return store.currentUser ? `unitrack_onboarding_seen_${store.currentUser.id}` : null;
}

function hasSeenOnboarding() {
  const key = getOnboardingSeenKey();
  return key ? localStorage.getItem(key) === '1' : false;
}

function markOnboardingSeen() {
  const key = getOnboardingSeenKey();
  if (key) localStorage.setItem(key, '1');
}

function shouldShowOnboarding() {
  return !!store.currentUser && store.pendingFirstRunSetup && !hasSeenOnboarding();
}

function renderOnboardingStep() {
  const step = ONBOARDING_STEPS[onboardingStepIndex] || ONBOARDING_STEPS[0];
  const stepsHost = document.getElementById('onboarding-steps');
  const kicker = document.getElementById('onboarding-kicker');
  const title = document.getElementById('onboarding-step-title');
  const copy = document.getElementById('onboarding-step-copy');
  const preview = document.getElementById('onboarding-preview');
  const progress = document.getElementById('onboarding-progress');
  const backBtn = document.getElementById('onboarding-back-btn');
  const nextBtn = document.getElementById('onboarding-next-btn');

  if (stepsHost) {
    stepsHost.innerHTML = ONBOARDING_STEPS.map((item, index) => `
      <button class="onboarding-step-tab ${index === onboardingStepIndex ? 'active' : ''}" type="button" onclick="setOnboardingStep(${index})">
        <span>${index + 1}</span>
        ${escapeHtml(item.label)}
      </button>
    `).join('');
  }
  if (kicker) kicker.textContent = `Step ${onboardingStepIndex + 1}`;
  if (title) title.textContent = step.title;
  if (copy) copy.textContent = step.copy;
  if (preview) {
    preview.innerHTML = step.preview.map((item) => `
      <div class="onboarding-preview-row">
        <span class="onboarding-dot"></span>
        <span>${escapeHtml(item)}</span>
      </div>
    `).join('');
  }
  if (progress) progress.textContent = `${onboardingStepIndex + 1} / ${ONBOARDING_STEPS.length}`;
  if (backBtn) backBtn.disabled = onboardingStepIndex === 0;
  if (nextBtn) nextBtn.textContent = onboardingStepIndex === ONBOARDING_STEPS.length - 1 ? "Let's Start" : 'Next';
}

export function setOnboardingStep(index) {
  onboardingStepIndex = Math.max(0, Math.min(ONBOARDING_STEPS.length - 1, index));
  renderOnboardingStep();
}

export function nextOnboardingStep() {
  if (onboardingStepIndex >= ONBOARDING_STEPS.length - 1) {
    closeOnboardingModal();
    return;
  }
  setOnboardingStep(onboardingStepIndex + 1);
}

export function previousOnboardingStep() {
  if (onboardingStepIndex > 0) setOnboardingStep(onboardingStepIndex - 1);
}

export function openOnboardingModal() {
  const profileName = (store.state?.profile?.name || '').trim();
  const isNewUser = store.pendingFirstRunSetup;
  const isReturningUser = store.cloudHadSave && !isPendingNewAccount(store.currentUser?.email);

  const title = document.getElementById('onboarding-title');
  if (title) {
    if (isReturningUser && profileName) {
      title.textContent = `Welcome back, ${escapeHtml(profileName)}`;
    } else if (isNewUser && profileName) {
      title.textContent = `Welcome, ${escapeHtml(profileName)}`;
    } else {
      title.textContent = 'Welcome to UniTrack.';
    }
  }
  onboardingStepIndex = 0;
  document.getElementById('onboarding-modal').classList.remove('hidden');
  syncModalScrollLock();
  renderOnboardingStep();
}

export function closeOnboardingModal() {
  markOnboardingSeen();
  store.pendingOnboarding = false;
  store.pendingFirstRunSetup = false;
  document.getElementById('onboarding-modal').classList.add('hidden');
  syncModalScrollLock();
}

function maybeShowOnboarding() {
  if (!shouldShowOnboarding()) return;
  const setupModal = document.getElementById('course-setup-modal');
  if (setupModal && !setupModal.classList.contains('hidden')) {
    store.pendingOnboarding = true;
    return;
  }
  store.pendingOnboarding = false;
  openOnboardingModal();
}

export function maybeShowWelcomeBackSplash() {
  if (getNearestUpcomingDeadline()) return;
  if (!store.currentUser) return;

  const profileName = (store.state?.profile?.name || '').trim();
  const isReturningUser = store.cloudHadSave && !isPendingNewAccount(store.currentUser?.email);
  const isOnboardingUser = store.pendingFirstRunSetup;

  if (isReturningUser && profileName && !isOnboardingUser) {
    if (store.welcomeSplashShownThisLoad) return;
    store.welcomeSplashShownThisLoad = true;

    const splash = document.getElementById('deadline-splash');
    if (!splash) return;

    closeDeadlineSplash();

    splash.innerHTML = `
      <div class="deadline-splash-card">
        <button class="deadline-splash-close" type="button" onclick="closeDeadlineSplash()">&times;</button>
        <div class="deadline-splash-label">Welcome</div>
        <div class="deadline-splash-title">Welcome back, ${escapeHtml(profileName)}</div>
        <div class="template-splash-copy" style="margin-top: 16px; color: rgba(255,255,255,0.68);">Great to see you again! Your progress has been saved.</div>
      </div>
    `;

    splash.classList.remove('hidden');

    setTimeout(() => {
      if (!getNearestUpcomingDeadline()) splash.classList.add('hidden');
    }, 4000);
  }
}

// ── Auth UI ───────────────────────────────────────────────────────────────────

export function renderAuthGate(mode = store.authViewMode) {
  store.authViewMode = mode;
  const host = document.getElementById('auth-gate-body');
  const asideCopy = document.querySelector('.auth-gate-copy');
  if (!host) return;
  const isSignup = mode === 'signup';
  const isRecovery = mode === 'recovery' || isRecoveryFlow();
  const feedbackClass = store.authStatusTone === 'success' ? 'auth-success' : 'auth-error';
  const profileName = escapeHtml((store.state?.profile?.name || '').trim());
  const loginTitle = profileName ? `Welcome back, ${profileName}` : 'Welcome back!';
  if (asideCopy) {
    const bootLocked = !store.bootComplete;
    asideCopy.textContent = bootLocked || store.authScreenLoading
      ? 'Opening your tracker.'
      : 'Sign in to UniTrack.';
  }

  const bootLocked = !store.bootComplete;

  if ((bootLocked || store.authScreenLoading) && !isRecovery) {
    host.innerHTML = `
    <div class="auth-gate-card">
      <div class="deadline-splash-title auth-gate-heading">${escapeHtml(store.authLoadingTitle || 'Restoring your session...')}</div>
      <div class="auth-gate-message">${escapeHtml(store.authLoadingMessage || 'Checking whether you are already signed in before showing anything.')}</div>
      <div id="auth-gate-feedback" class="auth-success"></div>
    </div>
  `;
    return;
  }

  host.innerHTML = isRecovery ? `
    <div class="auth-gate-card">
      <div class="auth-gate-label">Password Recovery</div>
      <div class="deadline-splash-title auth-gate-heading">Set a new password</div>
      <div class="auth-gate-message">Finish the reset here before going back into the app.</div>
      <div class="deadline-form-grid">
        <div class="field">
          <label for="auth-gate-new-password">New Password</label>
          <input class="input" id="auth-gate-new-password" type="password" autocomplete="new-password" placeholder="Minimum 6 characters" onkeydown="handleAuthKeydown(event, 'recovery')">
        </div>
        <div id="auth-gate-feedback" class="${feedbackClass}">${escapeHtml(store.authStatusMessage || '')}</div>
        <div class="deadline-form-actions">
          <button class="nav-btn calendar-btn" type="button" onclick="updatePasswordFromModal()">Update Password</button>
        </div>
      </div>
    </div>
  ` : `
    <div class="auth-gate-card">
      <div class="auth-gate-tabs">
        <button class="auth-gate-tab ${!isSignup ? 'active' : ''}" type="button" onclick="setAuthScreen('login')">Sign In</button>
        <button class="auth-gate-tab ${isSignup ? 'active' : ''}" type="button" onclick="setAuthScreen('signup')">Create Account</button>
      </div>
      <div class="deadline-splash-title auth-gate-heading">${isSignup ? 'Create your account' : loginTitle}</div>
      <div class="auth-gate-message">${isSignup ? 'Create a new cloud account to keep your tracker, deadlines, and preferences synced.' : 'Sign in with your existing account to view your tracker.'}</div>
      <div class="deadline-form-grid">
        <div class="field">
          <label for="auth-gate-email">Email</label>
          <input class="input" id="auth-gate-email" type="email" autocomplete="email" placeholder="you@example.com" onkeydown="handleAuthKeydown(event, '${isSignup ? 'signup' : 'login'}')">
        </div>
        <div class="field">
          <label for="auth-gate-password">Password</label>
          <input class="input" id="auth-gate-password" type="password" autocomplete="${isSignup ? 'new-password' : 'current-password'}" placeholder="Minimum 6 characters" onkeydown="handleAuthKeydown(event, '${isSignup ? 'signup' : 'login'}')">
        </div>
        ${isSignup ? `
          <div class="field">
            <label for="auth-gate-confirm-password">Confirm Password</label>
            <input class="input" id="auth-gate-confirm-password" type="password" autocomplete="new-password" placeholder="Repeat your password" onkeydown="handleAuthKeydown(event, 'signup')">
          </div>
        ` : ''}
        <div id="auth-gate-feedback" class="${feedbackClass}">${escapeHtml(store.authStatusMessage || '')}</div>
        <div class="deadline-form-actions">
          ${isSignup ? `
            <button class="nav-btn" type="button" data-password-toggle onclick="togglePasswordVisibility('auth-gate-password', 'auth-gate-confirm-password')">Show Password</button>
            <button class="nav-btn calendar-btn" id="auth-signup-btn" type="button" onclick="signUpFromModal()">Create Account</button>
          ` : `
            <button class="nav-btn" type="button" onclick="setAuthScreen('reset')">Forgot Password</button>
            <button class="nav-btn" type="button" data-password-toggle onclick="togglePasswordVisibility('auth-gate-password')">Show Password</button>
            <button class="nav-btn calendar-btn" type="button" onclick="loginFromModal()">Sign In</button>
          `}
        </div>
      </div>
    </div>
  `;

  if (mode === 'reset') {
    host.innerHTML = `
      <div class="auth-gate-card">
        <div class="auth-gate-tabs">
          <button class="auth-gate-tab" type="button" onclick="setAuthScreen('login')">Sign In</button>
          <button class="auth-gate-tab" type="button" onclick="setAuthScreen('signup')">Create Account</button>
        </div>
        <div class="deadline-splash-title auth-gate-heading">Reset your password</div>
        <div class="auth-gate-message">Enter the email tied to your account and I'll send you a reset link.</div>
        <div class="deadline-form-grid">
          <div class="field">
            <label for="auth-gate-email">Email</label>
            <input class="input" id="auth-gate-email" type="email" autocomplete="email" placeholder="you@example.com" onkeydown="handleAuthKeydown(event, 'reset')">
          </div>
          <div id="auth-gate-feedback" class="${feedbackClass}">${escapeHtml(store.authStatusMessage || '')}</div>
          <div class="deadline-form-actions">
            <button class="nav-btn" type="button" onclick="setAuthScreen('login')">Back</button>
            <button class="nav-btn calendar-btn" type="button" onclick="resetPasswordFromModal()">Send Reset Email</button>
          </div>
        </div>
      </div>
    `;
  }

  const focusId = isRecovery ? 'auth-gate-new-password' : 'auth-gate-email';
  setTimeout(() => document.getElementById(focusId)?.focus(), 0);
}

export function setAuthScreen(mode) {
  store.authViewMode = mode;
  clearAuthMessage();
  renderAuthGate(mode);
}

export function refreshAppAfterAuth() {
  ensureYearsState();
  refreshActiveYear();
  window.applyPreferences?.();
  window.renderYearSelector?.();
  window.buildModules?.();
  window.renderStickyExams?.();
  setupDeadlineBarScrolling();
  updateGlobal();
  if (store.currentUser && store.pendingFirstRunSetup) {
    closeAuthModal(true);
    window.setupCourseIfNeeded?.();
  }
  maybeShowOnboarding();
  setTimeout(() => {
    if (!store.currentUser) return;
    const templateSplash = document.getElementById('template-splash');
    if (templateSplash && !templateSplash.classList.contains('hidden')) return;
    const deadlineShown = showDeadlineSplash();
    if (!deadlineShown) maybeShowWelcomeBackSplash();
  }, 250);
}

export function resetLocalAppState() {
  store.state = createInitialState();
  Object.keys(store.preferences).forEach((key) => delete store.preferences[key]);
  Object.assign(store.preferences, DEFAULT_PREFERENCES);
  ensureYearsState();
  refreshActiveYear();
  syncUndoBaseline();
  window.applyPreferences?.();
  window.renderYearSelector?.();
  window.buildModules?.();
  window.renderStickyExams?.();
  updateGlobal();
}

export function openAuthModal(mode = 'login') {
  if (!store.currentUser) {
    setAuthScreen(isRecoveryFlow() ? 'recovery' : mode);
    updateAuthLock();
    return;
  }
  const modal = document.getElementById('auth-modal');
  if (!modal) return;
  if (mode === 'recovery') store.recoveryModeActive = true;
  modal.classList.remove('hidden');
  syncModalScrollLock();
  renderAuthModal(mode);
  const closeBtn = document.querySelector('#auth-modal .deadline-splash-close');
  if (closeBtn) closeBtn.style.display = (store.currentUser && !isRecoveryFlow()) ? 'block' : 'none';
}

export function closeAuthModal(force = false) {
  if (!force && (!store.currentUser || isRecoveryFlow())) return;
  const modal = document.getElementById('auth-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  syncModalScrollLock();
}

function updateAuthButton() {
  const btn = document.getElementById('auth-btn');
  if (!btn) return;
  btn.textContent = store.currentUser ? 'Account ✓' : 'Account';
}

export function renderAuthModal(mode = 'login') {
  if (!store.currentUser) {
    setAuthScreen(isRecoveryFlow() ? 'recovery' : mode);
    updateAuthLock();
    return;
  }
  if (typeof window.unitrackRenderProfessionalAccountPanel === 'function') {
    window.unitrackRenderProfessionalAccountPanel();
    return;
  }
  const body = document.getElementById('auth-modal-body');
  if (!body) return;

  const syncStatus = store.cloudLoadSucceeded ? 'Synced to cloud' : (store.cloudReady ? 'Signed in, sync catching up' : 'Signed in locally');
  body.innerHTML = `
    <div class="account-card">
      <div class="account-title">Account</div>
      <div class="account-copy">Check account settings, sync status, and saved data controls here.</div>
      <div class="account-meta">
        <div class="account-meta-row">
          <div class="account-meta-label">Signed In As</div>
          <div class="account-meta-value auth-email">${escapeHtml(store.currentUser.email || 'Cloud account')}</div>
        </div>
        <div class="account-meta-row">
          <div class="account-meta-label">Status</div>
          <div class="account-meta-value">${escapeHtml(syncStatus)}</div>
        </div>
      </div>
      <div class="account-section">
        <div class="account-section-title">Tracker</div>
        <div class="account-actions">
          <button class="nav-btn" type="button" onclick="editCourseProfile()">Edit Course Setup</button>
          <button class="nav-btn danger-btn" type="button" onclick="clearTrackerStorage()">Clear Saved Data</button>
        </div>
      </div>
      <div class="account-section">
        <div class="account-section-title">Session</div>
        <div class="account-actions">
          <button class="nav-btn" type="button" onclick="logoutCloud()">Logout</button>
        </div>
      </div>
    </div>
  `;
}

export function shiftModuleColourMapAfterDelete(map, deletedIndex) {
  return shiftIndexedObjectAfterDelete(map, deletedIndex);
}

function setAuthError(message) {
  setAuthMessage(message, 'error');
}

function setAuthButtonBusy(selector, busy, busyText = 'Working...') {
  const button = document.querySelector(selector);
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = busyText;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
  }
}

function ensureCloudAuthReady() {
  if (store.supabaseClient) return true;
  setAuthError(cloudConfigMissing
    ? 'Cloud sign-in is not configured. Add /config.js with Supabase settings and refresh.'
    : 'Cloud sign-in did not load. Refresh the page and check your internet connection.');
  return false;
}

function withCloudTimeout(promise, label = 'Cloud request', timeoutMs = 12000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} took too long. Check your connection and try again.`)), timeoutMs);
    }),
  ]);
}

function getCachedAccessToken(session = store.currentSession) {
  const expiresAt = Number(session?.expires_at || 0);
  const stillFresh = !expiresAt || expiresAt * 1000 > Date.now() + 30000;
  return session?.access_token && stillFresh ? session.access_token : '';
}

async function getCloudAccessToken(session = store.currentSession) {
  const cachedToken = getCachedAccessToken(session);
  if (cachedToken) return cachedToken;
  if (!store.supabaseClient) throw new Error('Cloud sign-in is not available.');
  const { data, error } = await withCloudTimeout(store.supabaseClient.auth.getSession(), 'Session check');
  if (error) throw error;
  store.currentSession = data?.session || null;
  store.currentUser = store.currentSession?.user || store.currentUser;
  const token = data?.session?.access_token;
  if (!token) throw new Error('Your session expired. Please sign in again.');
  return token;
}

async function trackerApiRequest(method, body = null, session = store.currentSession) {
  const token = await getCloudAccessToken(session);
  const response = await withCloudTimeout(fetch('/api/tracker', {
    method,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : null,
  }), `Tracker ${method}`);

  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.error || `Tracker request failed with status ${response.status}.`);
  }

  return payload;
}

function loadTrackerProfileFromApi(session = store.currentSession) {
  return trackerApiRequest('GET', null, session);
}

function saveTrackerProfileToApi(
  nextState = store.state,
  nextPreferences = store.preferences,
  session = store.currentSession,
) {
  return trackerApiRequest('PUT', { data: nextState, prefs: nextPreferences }, session);
}

export function togglePasswordVisibility(...ids) {
  const inputs = ids.map((id) => document.getElementById(id)).filter(Boolean);
  if (!inputs.length) return;
  const show = inputs[0].type === 'password';
  inputs.forEach((input) => { input.type = show ? 'text' : 'password'; });
  document.querySelectorAll('[data-password-toggle]').forEach((button) => {
    button.textContent = show ? 'Hide Password' : 'Show Password';
  });
}

export function handleAuthKeydown(event, mode) {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  if (mode === 'signup') signUpFromModal();
  else if (mode === 'recovery') updatePasswordFromModal();
  else if (mode === 'reset') resetPasswordFromModal();
  else loginFromModal();
}

function getAuthRedirectOrigin() {
  const productionOrigin = 'https://unitrack.uk';
  const host = window.location.hostname;
  const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1';
  const isVercelPreview = host.endsWith('.vercel.app') && host !== 'unitrack.uk';
  if (isLocalHost || isVercelPreview) return productionOrigin;
  return window.location.origin || productionOrigin;
}

export async function resetPasswordFromModal() {
  if (!ensureCloudAuthReady()) return;
  const email = getAuthInputValue('email');
  if (!email) { setAuthError('Enter your email first.'); return; }
  const emailError = validateAuthEmail(email);
  if (emailError) { setAuthError(emailError); return; }

  let error;
  try {
    ({ error } = await withCloudTimeout(store.supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: getAuthRedirectOrigin(),
    }), 'Password reset'));
  } catch (cloudError) {
    setAuthError(cloudError?.message || 'Password reset failed. Please try again.');
    return;
  }

  if (error) { setAuthError(error.message); return; }
  setAuthMessage('Check your email for the reset link.', 'success');
}

export async function updatePasswordFromModal() {
  if (!ensureCloudAuthReady()) return;
  const password = getAuthInputValue('new-password');
  const passwordError = validateAuthPassword(password, 'New password');
  if (passwordError) { setAuthError(passwordError); return; }

  let error;
  try {
    ({ error } = await withCloudTimeout(store.supabaseClient.auth.updateUser({ password }), 'Password update'));
  } catch (cloudError) {
    setAuthError(cloudError?.message || 'Password update failed. Please try again.');
    return;
  }

  if (error) { setAuthError(error.message); return; }

  store.recoveryModeActive = false;
  clearRecoveryUrl();
  await logoutCloud();
  store.authViewMode = 'login';
  setAuthMessage('Password updated. Please sign in with your new password.', 'success');
  renderAuthGate('login');
}

export async function signUpFromModal() {
  if (!ensureCloudAuthReady()) return;
  const email = getAuthInputValue('email');
  const password = getAuthInputValue('password');
  const confirmPassword = getAuthInputValue('confirm-password');

  const emailError = validateAuthEmail(email);
  if (emailError) { setAuthError(emailError); return; }
  const passwordError = validateAuthPassword(password);
  if (passwordError) { setAuthError(passwordError); return; }
  if (!confirmPassword) { setAuthError('Confirm your password.'); return; }
  if (password !== confirmPassword) { setAuthError('Passwords do not match.'); return; }

  let data;
  let error;
  store.accountCreationInProgress = true;
  setAuthButtonBusy('#auth-signup-btn', true, 'Creating...');
  setAuthMessage('Creating your account...', 'success');
  try {
    ({ data, error } = await withCloudTimeout(store.supabaseClient.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: getAuthRedirectOrigin() },
    }), 'Account creation'));
  } catch (cloudError) {
    store.accountCreationInProgress = false;
    setAuthButtonBusy('#auth-signup-btn', false);
    setAuthError(cloudError?.message || 'Account creation failed. Please try again.');
    return;
  }

  if (error) {
    store.accountCreationInProgress = false;
    setAuthButtonBusy('#auth-signup-btn', false);
    setAuthError(error.message);
    return;
  }

  markPendingNewAccount(email);
  if (data?.session) {
    try {
      await store.supabaseClient.auth.signOut();
    } catch (signOutError) {
      console.warn('Post-signup sign out error:', signOutError?.message || signOutError);
    }
    store.currentUser = null;
    store.currentSession = null;
    store.cloudReady = false;
  }
  store.accountCreationInProgress = false;
  store.authViewMode = 'login';
  setAuthLoading(false);
  updateAuthLock();
  setAuthMessage(data?.session
    ? 'Account created. Please sign in now to set up your tracker.'
    : 'Account created. Check your email to confirm it, then sign in.', 'success');
  renderAuthGate('login');
}

export async function loginFromModal() {
  if (!ensureCloudAuthReady()) return;
  const email = getAuthInputValue('email');
  const password = getAuthInputValue('password');

  const emailError = validateAuthEmail(email);
  if (emailError) { setAuthError(emailError); return; }
  const passwordError = validateAuthPassword(password);
  if (passwordError) { setAuthError(passwordError); return; }

  setAuthMessage('Signing in...', 'success');
  setAuthLoading(true, 'Signing you in...', 'Pulling your tracker and preferences now.');

  try {
    const { data, error } = await withCloudTimeout(
      store.supabaseClient.auth.signInWithPassword({ email, password }),
      'Sign in',
    );

    if (error) {
      setAuthLoading(false);
      setAuthError(error.message);
      return;
    }

    store.currentSession = data.session || null;
    store.currentUser = store.currentSession?.user || data.user || null;
    clearLogoutFlagForSignedInUser();
  } catch (error) {
    setAuthLoading(false);
    setAuthError(error?.message || 'Sign in failed. Please check your connection and try again.');
  }
}

export async function logoutCloud() {
  if (!ensureCloudAuthReady()) return;
  sessionStorage.setItem('justLoggedOut', 'true');
  closeAuthModal(true);

  try {
    const { error } = await withCloudTimeout(store.supabaseClient.auth.signOut(), 'Sign out');
    if (error) throw error;
  } catch (error) {
    setAuthError(error?.message || 'Sign out failed. Please check your connection and try again.');
    return;
  }

  store.currentUser = null;
  store.currentSession = null;
  store.cloudReady = false;
  store.cloudHadSave = false;
  store.cloudLoadSucceeded = false;
  store.recoveryModeActive = false;
  store.pendingFirstRunSetup = false;
  store.authViewMode = 'login';
  store.deadlineSplashShownThisLoad = false;
  store.welcomeSplashShownThisLoad = false;

  localStorage.removeItem(KEY);
  localStorage.removeItem(PREFS_KEY);

  setAuthLoading(false);
  updateAuthButton();
  updateAuthLock();
  resetLocalAppState();
  renderAuthGate('login');
}

export async function loadCloudSave(options = {}) {
  if (store.cloudLoadPromise) return store.cloudLoadPromise;
  store.cloudLoadPromise = loadCloudSaveInner(options).finally(() => {
    store.cloudLoadPromise = null;
  });
  return store.cloudLoadPromise;
}

async function loadCloudSaveInner(options = {}) {
  store.cloudLoadSucceeded = false;
  if (!store.supabaseClient) {
    store.cloudReady = false;
    setAuthError('Cloud sign-in did not load. Refresh the page and check your internet connection.');
    return;
  }

  if (options.session) {
    store.currentSession = options.session;
    store.currentUser = options.session.user || store.currentUser;
  }

  if (!store.currentUser) {
    let sessionData;
    let sessionError;
    try {
      ({ data: sessionData, error: sessionError } = await withCloudTimeout(
        store.supabaseClient.auth.getSession(),
        'Session check',
      ));
    } catch (error) {
      console.warn('Cloud session error:', error?.message || error);
      store.cloudReady = false;
      return;
    }

    if (sessionError) {
      console.warn('Cloud session error:', sessionError.message);
      return;
    }

    store.currentSession = sessionData.session || null;
    store.currentUser = store.currentSession?.user || null;
  }

  updateAuthButton();

  if (!store.currentUser) {
    store.cloudReady = false;
    store.pendingFirstRunSetup = false;
    return;
  }

  let profile;
  try {
    ({ profile } = await withCloudTimeout(loadTrackerProfileFromApi(store.currentSession), 'Cloud data load'));
  } catch (cloudError) {
    console.warn('Cloud load error:', cloudError?.message || cloudError);
    store.cloudReady = true;
    return;
  }

  store.cloudLoadSucceeded = true;

  if (profile?.data) {
    store.cloudHadSave = true;
    store.state = profile.data;
    localStorage.setItem(KEY, JSON.stringify(store.state));
  } else {
    store.cloudHadSave = false;
  }

  if (profile?.prefs) {
    Object.assign(store.preferences, profile.prefs);
    localStorage.setItem(PREFS_KEY, JSON.stringify(store.preferences));
  }

  store.cloudReady = true;
  syncUndoBaseline();
}

export async function clearCloudProfile(nextState, nextPrefs) {
  return withCloudTimeout(saveTrackerProfileToApi(nextState, nextPrefs), 'Cloud reset');
}

export async function saveCloudNow() {
  if (!store.supabaseClient || !store.currentUser || !store.cloudReady || !store.state) return;
  try {
    await withCloudTimeout(saveTrackerProfileToApi(), 'Cloud save');
    console.log('Cloud save complete');
  } catch (error) {
    console.warn('Cloud save error:', error?.message || error);
    setAuthMessage(error?.message || 'Cloud save failed. Your latest changes remain saved in this browser.', 'error');
  }
}

export function saveCloudDebounced() {
  if (!store.currentUser || !store.cloudReady || !store.state) return;
  clearTimeout(store.cloudSaveTimer);
  store.cloudSaveTimer = setTimeout(saveCloudNow, 700);
}

export async function saveCloud() {
  await saveCloudNow();
}

// ── Supabase auth state change listener ───────────────────────────────────────

if (store.supabaseClient) {
  store.supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (event === 'INITIAL_SESSION') {
      markAuthStateKnown();
      return;
    }

    store.currentSession = session || null;
    store.currentUser = store.currentSession?.user || null;
    markAuthStateKnown();
    clearLogoutFlagForSignedInUser();
    if (!store.currentUser) store.cloudReady = false;
    if (store.accountCreationInProgress) return;
    updateAuthButton();
    const btn = document.getElementById('auth-btn');
    if (btn) btn.textContent = store.currentUser ? 'Account ✓' : 'Account';
    if (event === 'PASSWORD_RECOVERY' || isRecoveryFlow()) {
      store.recoveryModeActive = true;
      store.authViewMode = 'recovery';
      setAuthLoading(false);
      updateAuthLock();
      openAuthModal('recovery');
      return;
    }
    if (store.currentUser) {
      const shouldBlockUi = store.authScreenLoading;
      if (shouldBlockUi) {
        store.cloudReady = false;
        store.pendingFirstRunSetup = false;
      }
      await loadCloudSave({ session: store.currentSession });
      store.pendingFirstRunSetup = store.cloudLoadSucceeded && !store.cloudHadSave;
      if (store.pendingFirstRunSetup && shouldBlockUi) {
        resetLocalAppState();
        store.cloudReady = true;
      }
      if (shouldBlockUi) setAuthLoading(false);
      updateAuthLock();
      refreshAppAfterAuth();
      return;
    }
    store.pendingFirstRunSetup = false;
    store.cloudHadSave = false;
    setAuthLoading(false);
    updateAuthLock();
    renderAuthGate('login');
  });
} else {
  markAuthStateKnown();
  setTimeout(() => {
    setAuthLoading(false);
    updateAuthLock();
    if (cloudConfigMissing) {
      renderCloudUnavailableGate();
    } else {
      setAuthError('Cloud sign-in did not load. Refresh the page and check your internet connection.');
    }
  }, 0);
}
