# UniTrack — Split Vercel Project

This is the same working UniTrack app, but reorganised so it is easier to troubleshoot.

## How it works

The editable source is split into:

```txt
src/styles/
src/js/
```

The browser still loads generated bundles from:

```txt
public/generated/styles.bundle.css
public/generated/app.bundle.js
```

This keeps the app stable because the split files are concatenated back into the same runtime order as the original working single-file version.

## Commands

Install once:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

Build for Vercel:

```bash
npm run build
```

Manually regenerate bundles after editing source files:

```bash
npm run sync
```

## Where to edit

- Topic clicking / nesting / flashing: `src/js/40-topic-drag-reorder.js`, `src/js/70-module-rendering.js`
- Deadline timeline animation: `src/js/50-deadlines-calendar.js`, `src/styles/80-setup-onboarding-deadlines.css`
- Auth / login / setup: `src/js/80-auth-onboarding-cloud.js`, `src/styles/10-auth-setup.css`
- Walkthrough / onboarding: `src/js/80-auth-onboarding-cloud.js`, `src/styles/80-setup-onboarding-deadlines.css`
- Buttons/global polish: `src/styles/90-responsive-final-overrides.css`

Do not edit the generated files directly unless you are debugging a build output.
