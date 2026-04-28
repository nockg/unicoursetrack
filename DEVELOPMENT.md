# UniTrack Development Guide

## Project Structure

```text
api/
  tracker.js              Server-side tracker persistence API
src/
  js/
    app.js                Script manifest
    app/*.js              Ordered app source chunks
  styles/
    app.css               Stylesheet manifest
    app/*.css             Ordered stylesheet source chunks
scripts/
  build-assets.mjs        Concatenates split source into generated browser assets
```

## Build Flow

`index.html` loads generated files from `public/generated/`.

Run:

```bash
npm run sync
```

This generates `public/config.js` from environment variables and concatenates `src/styles/app/*.css` and `src/js/app/*.js` into:

- `public/generated/styles.bundle.css`
- `public/generated/app.bundle.js`

The chunk order is intentional. Keep new chunks registered in `scripts/build-assets.mjs`.

## Refactor Notes

The JavaScript is split for maintainability, but it is not yet a true ES module architecture. Existing inline handlers still depend on functions being available in the global browser scope. The next safe step is replacing inline handlers with delegated `data-action` events, then moving chunks toward real modules.
