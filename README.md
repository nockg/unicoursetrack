# UniTrack

A packaged Vite/Vercel deployment version of the UniTrack single-page tracker.

## Local setup

```bash
npm install
npm run dev
```

Then open the local URL Vite prints in the terminal.

## Production build

```bash
npm run build
npm run preview
```

## Deploy to Vercel

Push this folder to GitHub, import it in Vercel, and use:

- Framework Preset: Vite
- Build Command: npm run build
- Output Directory: dist
- Install Command: npm install

Or deploy from terminal:

```bash
npm install
npm run build
vercel --prod
```

## Notes

This package intentionally keeps the app as a full single-file `index.html`, because the split `src/styles` and `src/js` scaffold was incomplete. Once the app is stable, it can be refactored into separate CSS/JS modules later.
