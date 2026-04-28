# Security Notes

## Supabase configuration

UniTrack reads Supabase settings from `window.UNITRACK_CONFIG`, supplied by generated `public/config.js`.

`public/config.js` is generated from `.env`, `.env.local`, or deployment environment variables and is ignored by git. Do not commit real project values to source control. Do not use a Supabase service-role key in browser code.

Supabase publishable/anon keys are not true secrets once a browser app uses them. Security must come from:

- Row Level Security enabled on every user-data table.
- Policies that require `auth.uid() = user_id` for select, insert, update, and delete.
- Server-side code for any privileged or cross-user operation.
- Input validation before writes and safe escaping before display.

## API boundary

Tracker persistence is handled by `api/tracker.js`, not by direct browser table access.

The API:

- Requires a Supabase bearer token from the signed-in browser session.
- Verifies the token with Supabase Auth before touching storage.
- Uses the signed-in user's bearer token for tracker reads/writes, with the server-side Supabase anon key as the REST API key.
- Forces `user_id` from the authenticated user.
- Validates payload shape and maximum size.
- Applies a best-effort in-memory rate limit for serverless instances.

This API does not replace Supabase Row Level Security. Keep RLS enabled so the database remains protected if any API route changes later.

## Expected `tracker_profiles` policy shape

The app reads and writes rows in `tracker_profiles` by `user_id`. The minimum policy model is:

- Authenticated users can select only rows where `user_id = auth.uid()`.
- Authenticated users can insert only rows where `user_id = auth.uid()`.
- Authenticated users can update only rows where `user_id = auth.uid()`.
- Authenticated users can delete only rows where `user_id = auth.uid()`, if deletes are enabled.

Keep public read access disabled for this table.
