# UniTrack clean-source project

This version keeps the browser source files syntactically complete, so VS Code should not show fake `missing }` errors caused by rough chunk splitting.

## Edit these files

- `src/styles/app.css` - stylesheet manifest
- `src/styles/app/*.css` - split styling by app area
- `src/js/app.js` - script manifest
- `src/js/app/*.js` - split app logic by app area

## Local configuration

Cloud auth is configured at runtime and should not be committed with real project values.

1. Copy `.env.example` to `.env`.
2. Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Run `npm run sync`.

`scripts/build-assets.mjs` generates `public/config.js` from `.env`, `.env.local`, or deployment environment variables. `public/config.js` is ignored by git because it is runtime configuration.

Supabase publishable/anon keys are browser-visible in any static app. Treat Row Level Security policies, table permissions, and server-side endpoints for privileged operations as the real protection layer. Never put a Supabase service-role key in browser code.

## Server configuration

Cloud tracker persistence goes through `api/tracker.js`. Configure these environment variables in Vercel or your local function runtime:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

The frontend still uses the Supabase browser client for authentication, but tracker reads/writes now go through `/api/tracker`, where the server verifies the user session and forces `user_id` from the authenticated user. `SUPABASE_SERVICE_ROLE_KEY` is optional for local development; the API can use the signed-in user's bearer token with the anon key so Row Level Security still applies.

After editing, run:

```bash
npm run sync
```

Then test locally:

```bash
npm run dev
```

Build for deployment:

```bash
npm run build
```

## Vercel settings

- Framework Preset: Other
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`

## Troubleshooting search terms

Use VS Code search inside `src/js/app.js` / `src/styles/app.css`:

- Topic drag/click bugs: `draggedTopic`, `moveTopic`, `refreshTopicsOnly`, `suppress-topic-refresh`
- Deadline timeline: `timeline`, `deadline`, `switchTimelineView`
- Setup page: `setup-content`, `course-setup-modal`, `setup-required`
- Auth: `auth`, `supabase`, `currentUser`
