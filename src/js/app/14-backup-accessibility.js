/* UniTrack backup/accessibility compatibility layer
   Consolidated cleanup version.
   Backup UI is handled only inside Account by 15-security-guardrails.js.
   This file intentionally does not inject backup controls into Preferences. */

(function () {
  "use strict";

  function addEscapeCloseForVisibleModals(event) {
    if (event.key !== "Escape") return;

    const modalSelectors = [
      "#prefs-panel",
      "#dashboard-modal",
      "#timeline-modal",
      "#todo-modal",
      "#calendar-modal",
      "#deadline-form-modal",
      "#module-library-modal"
    ];

    for (const selector of modalSelectors) {
      const node = document.querySelector(selector);
      if (!node || node.classList.contains("hidden")) continue;

      if (selector === "#prefs-panel") {
        node.classList.add("hidden");
        return;
      }

      const closeButton = node.querySelector(".deadline-splash-close, [data-close], button[aria-label='Close']");
      if (closeButton) {
        closeButton.click();
        return;
      }
    }
  }

  function applyReducedMotionPreference() {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    document.documentElement.classList.toggle("reduce-motion", !!reduceMotion);
  }

  document.addEventListener("keydown", addEscapeCloseForVisibleModals);
  document.addEventListener("DOMContentLoaded", applyReducedMotionPreference);

  try {
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.addEventListener("change", applyReducedMotionPreference);
  } catch {}
})();
