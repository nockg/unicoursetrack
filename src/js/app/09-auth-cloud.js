function isRecoveryFlow() {
  return recoveryModeActive || window.location.hash.includes("type=recovery") || window.location.search.includes("type=recovery");
}

function clearRecoveryUrl() {
  if (!isRecoveryFlow()) return;
  const cleanUrl = window.location.pathname + window.location.search.replace(/([?&])type=recovery(&)?/, (match, prefix, suffix) => {
    if (prefix === "?" && suffix) return "?";
    if (prefix === "?" && !suffix) return "";
    return suffix ? prefix : "";
  });
  history.replaceState({}, document.title, cleanUrl);
}

function getAuthInputValue(name) {
  const gateInput = document.getElementById(`auth-gate-${name}`);
  if (gateInput) return name.includes("password") ? gateInput.value : gateInput.value.trim();
  const modalInput = document.getElementById(`auth-${name}`);
  if (modalInput) return name.includes("password") ? modalInput.value : modalInput.value.trim();
  return "";
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function validateAuthEmail(email) {
  if (!email) return "Enter your email first.";
  if (email.length > 254) return "Email address is too long.";
  if (!isValidEmail(email)) return "Enter a valid email address.";
  return "";
}

function validateAuthPassword(password, label = "Password") {
  if (!password) return `Enter your ${label.toLowerCase()}.`;
  if (password.length < 6) return `${label} must be at least 6 characters.`;
  if (password.length > 128) return `${label} must be 128 characters or fewer.`;
  return "";
}

function setAuthMessage(message = "", tone = "error") {
  authStatusMessage = message || "";
  authStatusTone = tone;
  const gateFeedback = document.getElementById("auth-gate-feedback");
  if (gateFeedback) {
    gateFeedback.className = tone === "success" ? "auth-success" : "auth-error";
    gateFeedback.textContent = authStatusMessage;
  }
  const modalError = document.getElementById("auth-error");
  if (modalError) modalError.textContent = tone === "error" ? authStatusMessage : "";
}

function clearAuthMessage() {
  authStatusMessage = "";
  authStatusTone = "error";
  setAuthMessage("");
}

async function waitForInitialAuth() {
  if (!supabaseClient) {
    markAuthStateKnown();
    return;
  }

  try {
    const { data } = await supabaseClient.auth.getSession();
    currentSession = data?.session || null;
    currentUser = data?.session?.user || null;
  } catch (error) {
    currentSession = null;
    currentUser = null;
    console.warn("Initial auth check failed:", error?.message || error);
  }

  markAuthStateKnown();
}

function getOnboardingSeenKey() {
  return currentUser ? `unitrack_onboarding_seen_${currentUser.id}` : null;
}

function hasSeenOnboarding() {
  const key = getOnboardingSeenKey();
  return key ? localStorage.getItem(key) === "1" : false;
}

function markOnboardingSeen() {
  const key = getOnboardingSeenKey();
  if (key) localStorage.setItem(key, "1");
}

function shouldShowOnboarding() {
  return !!currentUser && pendingFirstRunSetup && !hasSeenOnboarding();
}

function renderOnboardingStep() {
  const step = ONBOARDING_STEPS[onboardingStepIndex] || ONBOARDING_STEPS[0];
  const stepsHost = document.getElementById("onboarding-steps");
  const kicker = document.getElementById("onboarding-kicker");
  const title = document.getElementById("onboarding-step-title");
  const copy = document.getElementById("onboarding-step-copy");
  const preview = document.getElementById("onboarding-preview");
  const progress = document.getElementById("onboarding-progress");
  const backBtn = document.getElementById("onboarding-back-btn");
  const nextBtn = document.getElementById("onboarding-next-btn");

  if (stepsHost) {
    stepsHost.innerHTML = ONBOARDING_STEPS.map((item, index) => `
      <button class="onboarding-step-tab ${index === onboardingStepIndex ? "active" : ""}" type="button" onclick="setOnboardingStep(${index})">
        <span>${index + 1}</span>
        ${escapeHtml(item.label)}
      </button>
    `).join("");
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
    `).join("");
  }
  if (progress) progress.textContent = `${onboardingStepIndex + 1} / ${ONBOARDING_STEPS.length}`;
  if (backBtn) backBtn.disabled = onboardingStepIndex === 0;
  if (nextBtn) nextBtn.textContent = onboardingStepIndex === ONBOARDING_STEPS.length - 1 ? "Let's Start" : "Next";
}

function setOnboardingStep(index) {
  onboardingStepIndex = Math.max(0, Math.min(ONBOARDING_STEPS.length - 1, index));
  renderOnboardingStep();
}

function nextOnboardingStep() {
  if (onboardingStepIndex >= ONBOARDING_STEPS.length - 1) {
    closeOnboardingModal();
    return;
  }
  setOnboardingStep(onboardingStepIndex + 1);
}

function previousOnboardingStep() {
  if (onboardingStepIndex > 0) setOnboardingStep(onboardingStepIndex - 1);
}

function openOnboardingModal() {
  const profileName = (state.profile?.name || "").trim();
  const isNewUser = pendingFirstRunSetup;
  const isReturningUser = cloudHadSave && !isPendingNewAccount(currentUser?.email);
  
  const title = document.getElementById("onboarding-title");
  if (title) {
    if (isReturningUser && profileName) {
      title.textContent = `Welcome back, ${escapeHtml(profileName)}`;
    } else if (isNewUser && profileName) {
      title.textContent = `Welcome, ${escapeHtml(profileName)}`;
    } else {
      title.textContent = "Welcome to UniTrack.";
    }
  }
  onboardingStepIndex = 0;
  document.getElementById("onboarding-modal").classList.remove("hidden");
  syncModalScrollLock();
  renderOnboardingStep();
}

function closeOnboardingModal() {
  markOnboardingSeen();
  pendingOnboarding = false;
  pendingFirstRunSetup = false;
  document.getElementById("onboarding-modal").classList.add("hidden");
  syncModalScrollLock();
}

function maybeShowOnboarding() {
  if (!shouldShowOnboarding()) return;
  const setupModal = document.getElementById("course-setup-modal");
  if (setupModal && !setupModal.classList.contains("hidden")) {
    pendingOnboarding = true;
    return;
  }
  pendingOnboarding = false;
  openOnboardingModal();
}

function maybeShowWelcomeBackSplash() {
  // Deadline popup wins. If a deadline exists, do not show welcome back.
  if (getNearestUpcomingDeadline()) return;
  if (!currentUser) return;

  const profileName = (state.profile?.name || "").trim();
  const isReturningUser = cloudHadSave && !isPendingNewAccount(currentUser?.email);
  const isOnboardingUser = pendingFirstRunSetup;

  if (isReturningUser && profileName && !isOnboardingUser) {
    if (welcomeSplashShownThisLoad) return;
    welcomeSplashShownThisLoad = true;

    const splash = document.getElementById("deadline-splash");
    if (!splash) return;

    clearInterval(deadlineSplashInterval);
    deadlineSplashInterval = null;

    splash.innerHTML = `
      <div class="deadline-splash-card">
        <button class="deadline-splash-close" type="button" onclick="closeDeadlineSplash()">&times;</button>
        <div class="deadline-splash-label">Welcome</div>
        <div class="deadline-splash-title">Welcome back, ${escapeHtml(profileName)}</div>
        <div class="template-splash-copy" style="margin-top: 16px; color: rgba(255,255,255,0.68);">Great to see you again! Your progress has been saved.</div>
      </div>
    `;

    splash.classList.remove("hidden");

    setTimeout(() => {
      if (!getNearestUpcomingDeadline()) splash.classList.add("hidden");
    }, 4000);
  }
}

function renderAuthGate(mode = authViewMode) {
  authViewMode = mode;
  const host = document.getElementById("auth-gate-body");
  const asideCopy = document.querySelector(".auth-gate-copy");
  if (!host) return;
  const isSignup = mode === "signup";
  const isRecovery = mode === "recovery" || isRecoveryFlow();
  const feedbackClass = authStatusTone === "success" ? "auth-success" : "auth-error";
  const profileName = escapeHtml((state.profile?.name || "").trim());
  const loginTitle = profileName ? `Welcome back, ${profileName}` : "Welcome back!";
  if (asideCopy) {
    const bootLocked = !window.unitrackBootComplete;
    asideCopy.textContent = bootLocked || authScreenLoading
      ? "Opening your tracker."
      : "Sign in to UniTrack.";
  }

  if (authScreenLoading && !isRecovery) {
    host.innerHTML = `
      <div class="auth-gate-card">
        <div class="deadline-splash-title" style="color: var(--ink);">${escapeHtml(authLoadingTitle)}</div>
        <div class="auth-gate-message">${escapeHtml(authLoadingMessage)}</div>
        <div id="auth-gate-feedback" class="auth-success"></div>
      </div>
    `;
    return;
  }

  host.innerHTML = isRecovery ? `
    <div class="auth-gate-card">
      <div class="auth-gate-label">Password Recovery</div>
      <div class="deadline-splash-title" style="color: var(--ink);">Set a new password</div>
      <div class="auth-gate-message">Finish the reset here before going back into the app.</div>
      <div class="deadline-form-grid">
        <div class="field">
          <label for="auth-gate-new-password">New Password</label>
          <input class="input" id="auth-gate-new-password" type="password" autocomplete="new-password" placeholder="Minimum 6 characters" onkeydown="handleAuthKeydown(event, 'recovery')">
        </div>
        <div id="auth-gate-feedback" class="${feedbackClass}">${escapeHtml(authStatusMessage || "")}</div>
        <div class="deadline-form-actions">
          <button class="nav-btn calendar-btn" type="button" onclick="updatePasswordFromModal()">Update Password</button>
        </div>
      </div>
    </div>
  ` : `
    <div class="auth-gate-card">
      <div class="auth-gate-tabs">
        <button class="auth-gate-tab ${!isSignup ? "active" : ""}" type="button" onclick="setAuthScreen('login')">Sign In</button>
        <button class="auth-gate-tab ${isSignup ? "active" : ""}" type="button" onclick="setAuthScreen('signup')">Create Account</button>
      </div>
      <div class="deadline-splash-title" style="color: var(--ink);">${isSignup ? "Create your account" : loginTitle}</div>
      <div class="auth-gate-message">${isSignup ? "Create a new cloud account to keep your tracker, deadlines, and preferences synced." : "Sign in with your existing account to view your tracker."}</div>
      <div class="deadline-form-grid">
        <div class="field">
          <label for="auth-gate-email">Email</label>
          <input class="input" id="auth-gate-email" type="email" autocomplete="email" placeholder="you@example.com" onkeydown="handleAuthKeydown(event, '${isSignup ? "signup" : "login"}')">
        </div>
        <div class="field">
          <label for="auth-gate-password">Password</label>
          <input class="input" id="auth-gate-password" type="password" autocomplete="${isSignup ? "new-password" : "current-password"}" placeholder="Minimum 6 characters" onkeydown="handleAuthKeydown(event, '${isSignup ? "signup" : "login"}')">
        </div>
        ${isSignup ? `
          <div class="field">
            <label for="auth-gate-confirm-password">Confirm Password</label>
            <input class="input" id="auth-gate-confirm-password" type="password" autocomplete="new-password" placeholder="Repeat your password" onkeydown="handleAuthKeydown(event, 'signup')">
          </div>
        ` : ""}
        <div id="auth-gate-feedback" class="${feedbackClass}">${escapeHtml(authStatusMessage || "")}</div>
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

  if (mode === "reset") {
    host.innerHTML = `
      <div class="auth-gate-card">
        <div class="auth-gate-tabs">
          <button class="auth-gate-tab" type="button" onclick="setAuthScreen('login')">Sign In</button>
          <button class="auth-gate-tab" type="button" onclick="setAuthScreen('signup')">Create Account</button>
        </div>
        <div class="deadline-splash-title" style="color: var(--ink);">Reset your password</div>
        <div class="auth-gate-message">Enter the email tied to your account and I'll send you a reset link.</div>
        <div class="deadline-form-grid">
          <div class="field">
            <label for="auth-gate-email">Email</label>
            <input class="input" id="auth-gate-email" type="email" autocomplete="email" placeholder="you@example.com" onkeydown="handleAuthKeydown(event, 'reset')">
          </div>
          <div id="auth-gate-feedback" class="${feedbackClass}">${escapeHtml(authStatusMessage || "")}</div>
          <div class="deadline-form-actions">
            <button class="nav-btn" type="button" onclick="setAuthScreen('login')">Back</button>
            <button class="nav-btn calendar-btn" type="button" onclick="resetPasswordFromModal()">Send Reset Email</button>
          </div>
        </div>
      </div>
    `;
  }

  const focusId = isRecovery ? "auth-gate-new-password" : "auth-gate-email";
  setTimeout(() => document.getElementById(focusId)?.focus(), 0);
}

function setAuthScreen(mode) {
  authViewMode = mode;
  clearAuthMessage();
  renderAuthGate(mode);
}

function refreshAppAfterAuth() {
  ensureYearsState();
  refreshActiveYear();
  applyPreferences();
  renderYearSelector();
  buildModules();
  renderStickyExams();
  setupDeadlineBarScrolling();
  updateGlobal();
  if (currentUser && pendingFirstRunSetup) {
    closeAuthModal(true);
    setupCourseIfNeeded();
  }
  maybeShowOnboarding();
  // Important: loginFromModal() reaches this path, so the nearest deadline must be checked here,
  // not only inside the initial page boot code.
  setTimeout(() => {
    if (!currentUser) return;

    const templateSplash = document.getElementById("template-splash");
    if (templateSplash && !templateSplash.classList.contains("hidden")) return;

    const deadlineShown = showDeadlineSplash();
    if (!deadlineShown) maybeShowWelcomeBackSplash();
  }, 250);
}

function resetLocalAppState() {
  state = createInitialState();
  Object.keys(preferences).forEach((key) => delete preferences[key]);
  Object.assign(preferences, DEFAULT_PREFERENCES);
  ensureYearsState();
  refreshActiveYear();
  syncUndoBaseline();
  applyPreferences();
  renderYearSelector();
  buildModules();
  renderStickyExams();
  updateGlobal();
}

function openAuthModal(mode = "login") {
  if (!currentUser) {
    setAuthScreen(isRecoveryFlow() ? "recovery" : mode);
    updateAuthLock();
    return;
  }
  const modal = document.getElementById("auth-modal");
  if (!modal) return;
  if (mode === "recovery") recoveryModeActive = true;
  modal.classList.remove("hidden");
  syncModalScrollLock();
  renderAuthModal(mode);
  const closeBtn = document.querySelector("#auth-modal .deadline-splash-close");
  if (closeBtn) closeBtn.style.display = (currentUser && !isRecoveryFlow()) ? "block" : "none";
}

function closeAuthModal(force = false) {
  if (!force && (!currentUser || isRecoveryFlow())) return;
  const modal = document.getElementById("auth-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  syncModalScrollLock();
}

function updateAuthButton() {
  const btn = document.getElementById("auth-btn");
  if (!btn) return;
  btn.textContent = currentUser ? "Account \u2713" : "Account";
}

function renderAuthModal(mode = "login") {
  if (!currentUser) {
    setAuthScreen(isRecoveryFlow() ? "recovery" : mode);
    updateAuthLock();
    return;
  }
  if (typeof window.unitrackRenderProfessionalAccountPanel === "function") {
    window.unitrackRenderProfessionalAccountPanel();
    return;
  }
  const body = document.getElementById("auth-modal-body");
  if (!body) return;

  if (currentUser) {
    const syncStatus = cloudLoadSucceeded ? "Synced to cloud" : (cloudReady ? "Signed in, sync catching up" : "Signed in locally");
    body.innerHTML = `
      <div class="account-card">
        <div class="account-title">Account</div>
        <div class="account-copy">Check account settings, sync status, and saved data controls here.</div>
        <div class="account-meta">
          <div class="account-meta-row">
            <div class="account-meta-label">Signed In As</div>
            <div class="account-meta-value auth-email">${escapeHtml(currentUser.email || "Cloud account")}</div>
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
    return;
  }
}

function shiftModuleColourMapAfterDelete(map, deletedIndex) {
  return shiftIndexedObjectAfterDelete(map, deletedIndex);
}

function setAuthError(message) {
  setAuthMessage(message, "error");
}

function setAuthButtonBusy(selector, busy, busyText = "Working...") {
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
  if (supabaseClient) return true;
  setAuthError(cloudConfigMissing
    ? "Cloud sign-in is not configured. Add /config.js with Supabase settings and refresh."
    : "Cloud sign-in did not load. Refresh the page and check your internet connection.");
  return false;
}

function withCloudTimeout(promise, label = "Cloud request", timeoutMs = 12000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} took too long. Check your connection and try again.`)), timeoutMs);
    })
  ]);
}

function getCachedAccessToken(session = currentSession) {
  const expiresAt = Number(session?.expires_at || 0);
  const stillFresh = !expiresAt || expiresAt * 1000 > Date.now() + 30000;
  return session?.access_token && stillFresh ? session.access_token : "";
}

async function getCloudAccessToken(session = currentSession) {
  const cachedToken = getCachedAccessToken(session);
  if (cachedToken) return cachedToken;
  if (!supabaseClient) throw new Error("Cloud sign-in is not available.");
  const { data, error } = await withCloudTimeout(supabaseClient.auth.getSession(), "Session check");
  if (error) throw error;
  currentSession = data?.session || null;
  currentUser = currentSession?.user || currentUser;
  const token = data?.session?.access_token;
  if (!token) throw new Error("Your session expired. Please sign in again.");
  return token;
}

async function trackerApiRequest(method, body = null, session = currentSession) {
  const token = await getCloudAccessToken(session);
  const response = await withCloudTimeout(fetch("/api/tracker", {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`
    },
    body: body ? JSON.stringify(body) : null
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

function loadTrackerProfileFromApi(session = currentSession) {
  return trackerApiRequest("GET", null, session);
}

function saveTrackerProfileToApi(nextState = state, nextPreferences = preferences, session = currentSession) {
  return trackerApiRequest("PUT", {
    data: nextState,
    prefs: nextPreferences
  }, session);
}

function togglePasswordVisibility(...ids) {
  const inputs = ids.map((id) => document.getElementById(id)).filter(Boolean);
  if (!inputs.length) return;
  const show = inputs[0].type === "password";
  inputs.forEach((input) => {
    input.type = show ? "text" : "password";
  });
  document.querySelectorAll("[data-password-toggle]").forEach((button) => {
    button.textContent = show ? "Hide Password" : "Show Password";
  });
}

function handleAuthKeydown(event, mode) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  if (mode === "signup") signUpFromModal();
  else if (mode === "recovery") updatePasswordFromModal();
  else if (mode === "reset") resetPasswordFromModal();
  else loginFromModal();
}

async function resetPasswordFromModal() {
  if (!ensureCloudAuthReady()) return;
  const email = getAuthInputValue("email");

  if (!email) {
    setAuthError("Enter your email first.");
    return;
  }
  const emailError = validateAuthEmail(email);
  if (emailError) {
    setAuthError(emailError);
    return;
  }

  let error;
  try {
    ({ error } = await withCloudTimeout(supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: "https://unitrack.uk"
    }), "Password reset"));
  } catch (cloudError) {
    setAuthError(cloudError?.message || "Password reset failed. Please try again.");
    return;
  }

  if (error) {
    setAuthError(error.message);
    return;
  }

  setAuthMessage("Check your email for the reset link.", "success");
}

async function updatePasswordFromModal() {
  if (!ensureCloudAuthReady()) return;
  const password = getAuthInputValue("new-password");
  const passwordError = validateAuthPassword(password, "New password");
  if (passwordError) {
    setAuthError(passwordError);
    return;
  }

  let error;
  try {
    ({ error } = await withCloudTimeout(supabaseClient.auth.updateUser({ password }), "Password update"));
  } catch (cloudError) {
    setAuthError(cloudError?.message || "Password update failed. Please try again.");
    return;
  }

  if (error) {
    setAuthError(error.message);
    return;
  }

  recoveryModeActive = false;
  clearRecoveryUrl();
  await logoutCloud();
  authViewMode = "login";
  setAuthMessage("Password updated. Please sign in with your new password.", "success");
  renderAuthGate("login");
}

async function signUpFromModal() {
  if (!ensureCloudAuthReady()) return;
  const email = getAuthInputValue("email");
  const password = getAuthInputValue("password");
  const confirmPassword = getAuthInputValue("confirm-password");

  const emailError = validateAuthEmail(email);
  if (emailError) {
    setAuthError(emailError);
    return;
  }
  const passwordError = validateAuthPassword(password);
  if (passwordError) {
    setAuthError(passwordError);
    return;
  }
  if (!confirmPassword) {
    setAuthError("Confirm your password.");
    return;
  }
  if (password !== confirmPassword) {
    setAuthError("Passwords do not match.");
    return;
  }

  let data;
  let error;
  accountCreationInProgress = true;
  setAuthButtonBusy("#auth-signup-btn", true, "Creating...");
  setAuthMessage("Creating your account...", "success");
  try {
    ({ data, error } = await withCloudTimeout(supabaseClient.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: "https://unitrack.uk"
      }
    }), "Account creation"));
  } catch (cloudError) {
    accountCreationInProgress = false;
    setAuthButtonBusy("#auth-signup-btn", false);
    setAuthError(cloudError?.message || "Account creation failed. Please try again.");
    return;
  }

  if (error) {
    accountCreationInProgress = false;
    setAuthButtonBusy("#auth-signup-btn", false);
    setAuthError(error.message);
    return;
  }

  markPendingNewAccount(email);
  if (data?.session) {
    try {
      await supabaseClient.auth.signOut();
    } catch (signOutError) {
      console.warn("Post-signup sign out error:", signOutError?.message || signOutError);
    }
    currentUser = null;
    currentSession = null;
    cloudReady = false;
  }
  accountCreationInProgress = false;
  authViewMode = "login";
  setAuthLoading(false);
  updateAuthLock();
  setAuthMessage(data?.session
    ? "Account created. Please sign in now to set up your tracker."
    : "Account created. Check your email to confirm it, then sign in.", "success");
  renderAuthGate("login");
}

async function loginFromModal() {
  if (!ensureCloudAuthReady()) return;
  const email = getAuthInputValue("email");
  const password = getAuthInputValue("password");

  const emailError = validateAuthEmail(email);
  if (emailError) {
    setAuthError(emailError);
    return;
  }
  const passwordError = validateAuthPassword(password);
  if (passwordError) {
    setAuthError(passwordError);
    return;
  }

  setAuthMessage("Signing in...", "success");
  setAuthLoading(true, "Signing you in...", "Pulling your tracker and preferences now.");

  try {
    const { data, error } = await withCloudTimeout(supabaseClient.auth.signInWithPassword({
      email,
      password
    }), "Sign in");

    if (error) {
      setAuthLoading(false);
      setAuthError(error.message);
      return;
    }

    currentSession = data.session || null;
    currentUser = currentSession?.user || data.user || null;
    clearLogoutFlagForSignedInUser();
  } catch (error) {
    setAuthLoading(false);
    setAuthError(error?.message || "Sign in failed. Please check your connection and try again.");
  }
}

async function logoutCloud() {
  if (!ensureCloudAuthReady()) return;
  sessionStorage.setItem("justLoggedOut", "true");
  closeAuthModal(true);

  try {
    const { error } = await withCloudTimeout(supabaseClient.auth.signOut(), "Sign out");
    if (error) throw error;
  } catch (error) {
    setAuthError(error?.message || "Sign out failed. Please check your connection and try again.");
    return;
  }

  currentUser = null;
  currentSession = null;
  cloudReady = false;
  cloudHadSave = false;
  cloudLoadSucceeded = false;
  recoveryModeActive = false;
  pendingFirstRunSetup = false;
  authViewMode = "login";
  deadlineSplashShownThisLoad = false;
  welcomeSplashShownThisLoad = false;

  localStorage.removeItem(KEY);
  localStorage.removeItem(PREFS_KEY);

  setAuthLoading(false);
  updateAuthButton();
  updateAuthLock();
  resetLocalAppState();
  renderAuthGate("login");
}

let cloudLoadPromise = null;

async function loadCloudSave(options = {}) {
  if (cloudLoadPromise) return cloudLoadPromise;
  cloudLoadPromise = loadCloudSaveInner(options).finally(() => {
    cloudLoadPromise = null;
  });
  return cloudLoadPromise;
}

async function loadCloudSaveInner(options = {}) {
  cloudLoadSucceeded = false;
  if (!supabaseClient) {
    cloudReady = false;
    setAuthError("Cloud sign-in did not load. Refresh the page and check your internet connection.");
    return;
  }

  if (options.session) {
    currentSession = options.session;
    currentUser = options.session.user || currentUser;
  }

  if (!currentUser) {
    let sessionData;
    let sessionError;
    try {
      ({ data: sessionData, error: sessionError } = await withCloudTimeout(supabaseClient.auth.getSession(), "Session check"));
    } catch (error) {
      console.warn("Cloud session error:", error?.message || error);
      cloudReady = false;
      return;
    }

    if (sessionError) {
      console.warn("Cloud session error:", sessionError.message);
      return;
    }

    currentSession = sessionData.session || null;
    currentUser = currentSession?.user || null;
  }

  console.log("Cloud user:", currentUser?.email || "not logged in");
  updateAuthButton();

  if (!currentUser) {
    cloudReady = false;
    pendingFirstRunSetup = false;
    return;
  }

  let profile;
  try {
    ({ profile } = await withCloudTimeout(loadTrackerProfileFromApi(currentSession), "Cloud data load"));
  } catch (cloudError) {
    console.warn("Cloud load error:", cloudError?.message || cloudError);
    cloudReady = true;
    return;
  }

  cloudLoadSucceeded = true;

  if (profile?.data) {
    cloudHadSave = true;
    state = profile.data;
    localStorage.setItem(KEY, JSON.stringify(state));
  } else {
    cloudHadSave = false;
  }

  if (profile?.prefs) {
    Object.assign(preferences, profile.prefs);
    localStorage.setItem(PREFS_KEY, JSON.stringify(preferences));
  }

  cloudReady = true;
  syncUndoBaseline();

}

async function saveCloudNow() {
  if (!supabaseClient || !currentUser || !cloudReady) return;

  try {
    await withCloudTimeout(saveTrackerProfileToApi(), "Cloud save");
    console.log("Cloud save complete");
  } catch (error) {
    console.warn("Cloud save error:", error?.message || error);
    setAuthMessage(error?.message || "Cloud save failed. Your latest changes remain saved in this browser.", "error");
  }
}

let cloudSaveTimer = null;
function saveCloudDebounced() {
  if (!currentUser || !cloudReady) return;
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(saveCloudNow, 700);
}

async function saveCloud() {
  await saveCloudNow();
}

if (supabaseClient) {
supabaseClient.auth.onAuthStateChange(async (event, session) => {
  if (event === "INITIAL_SESSION") {
    markAuthStateKnown();
    return;
  }

  currentSession = session || null;
  currentUser = currentSession?.user || null;
  markAuthStateKnown();
  clearLogoutFlagForSignedInUser();
  if (!currentUser) cloudReady = false;
  if (accountCreationInProgress) return;
  updateAuthButton();
  const btn = document.getElementById("auth-btn");
  if (btn) btn.textContent = currentUser ? "Account \u2713" : "Account";
  if (event === "PASSWORD_RECOVERY" || isRecoveryFlow()) {
    recoveryModeActive = true;
    authViewMode = "recovery";
    setAuthLoading(false);
    updateAuthLock();
    openAuthModal("recovery");
    return;
  }
  if (currentUser) {
    const shouldBlockUi = authScreenLoading;
    if (shouldBlockUi) {
      cloudReady = false;
      pendingFirstRunSetup = false;
    }
    await loadCloudSave({ session: currentSession });
    pendingFirstRunSetup = cloudLoadSucceeded && !cloudHadSave;
    if (pendingFirstRunSetup && shouldBlockUi) {
      resetLocalAppState();
      cloudReady = true;
    }
    if (shouldBlockUi) setAuthLoading(false);
    updateAuthLock();
    refreshAppAfterAuth();
    return;
  }
  pendingFirstRunSetup = false;
  cloudHadSave = false;
  setAuthLoading(false);
  updateAuthLock();
  renderAuthGate("login");
});
} else {
  markAuthStateKnown();
  setTimeout(() => {
    setAuthLoading(false);
    updateAuthLock();
    if (cloudConfigMissing) {
      renderCloudUnavailableGate();
    } else {
      setAuthError("Cloud sign-in did not load. Refresh the page and check your internet connection.");
    }
  }, 0);
}
