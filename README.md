# UniTrack clean-source project

This version keeps the browser source files syntactically complete, so VS Code should not show fake `missing }` errors caused by rough chunk splitting.

## Edit these files

- `src/styles/app.css` — all styling
- `src/js/app.js` — all app logic

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

- Framework Preset: Vite
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`

## Troubleshooting search terms

Use VS Code search inside `src/js/app.js` / `src/styles/app.css`:

- Topic drag/click bugs: `draggedTopic`, `moveTopic`, `refreshTopicsOnly`, `suppress-topic-refresh`
- Deadline timeline: `timeline`, `deadline`, `switchTimelineView`
- Setup page: `setup-content`, `course-setup-modal`, `setup-required`
- Auth: `auth`, `supabase`, `currentUser`
