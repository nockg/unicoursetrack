# UniTrack Industry Review

## Completed in this pass

- Removed hardcoded Supabase project values from browser source and generated bundles.
- Added a fail-closed runtime config file at `public/config.js`.
- Moved tracker profile reads/writes behind `api/tracker.js`.
- Added server-side session verification before persistence operations.
- Added server-side payload shape and size validation.
- Added best-effort API rate limiting.
- Updated cloud load, save, and reset flows to use `/api/tracker`.
- Added build-time secret marker checks in `scripts/build-assets.mjs`.
- Split the large stylesheet into ordered source files under `src/styles/app/`.
- Split the large app script into ordered source files under `src/js/app/`.

## Still below industry standard

- JavaScript is split by source area, but it still uses browser globals and needs ES module boundaries.
- CSS is split by source area, but selectors are still globally scoped and should move toward component-level ownership.
- Inline event handlers still exist in `index.html` and generated HTML strings.
- State is still scattered across top-level variables instead of a store/state machine.
- The app is still plain JavaScript, with no TypeScript or schema library.
- Automated tests are still missing.
- Accessibility needs a focused audit for focus trapping, keyboard paths, and contrast.
- The rate limiter is in-memory, which is acceptable as a first guard but not a durable distributed limiter.

## Recommended next refactor order

1. Replace inline handlers with `data-action` attributes and one delegated click/change/input layer.
2. Extract modules in this order: `utils/`, `api/`, `state/`, `auth/`, `features/deadlines/`, `features/modules/`, `features/todos/`.
3. Split CSS into `variables.css`, `base.css`, `buttons.css`, `modals.css`, `auth.css`, `dashboard.css`, and feature styles.
4. Add TypeScript with `checkJs` or migrate file-by-file.
5. Add tests around persistence, validation, auth gating, and the highest-risk UI flows.
