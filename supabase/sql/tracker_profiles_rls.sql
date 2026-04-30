-- UniTrack Supabase safety policies.
-- Run this in Supabase SQL Editor after confirming your table is public.tracker_profiles.

create extension if not exists pgcrypto;

create table if not exists public.tracker_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.tracker_profiles enable row level security;
alter table public.tracker_profiles force row level security;

drop policy if exists "Users can read own tracker" on public.tracker_profiles;
drop policy if exists "Users can insert own tracker" on public.tracker_profiles;
drop policy if exists "Users can update own tracker" on public.tracker_profiles;
drop policy if exists "Users can delete own tracker" on public.tracker_profiles;

create policy "Users can read own tracker"
on public.tracker_profiles
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
);

create policy "Users can insert own tracker"
on public.tracker_profiles
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
);

create policy "Users can update own tracker"
on public.tracker_profiles
for update
to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
)
with check (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
);

create policy "Users can delete own tracker"
on public.tracker_profiles
for delete
to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
);

create index if not exists tracker_profiles_updated_at_idx
on public.tracker_profiles (updated_at desc);
