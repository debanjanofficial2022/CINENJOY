-- CINENJOY database, Phase 1 step d: game results, streaks and challenge links.
-- Safe to run more than once.

-- One row per finished game. Daily games use the date as the puzzle key,
-- so each person has at most one result per game per day.
create table if not exists public.game_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  game text not null check (game in ('cinewordle', 'crossword')),
  mode text not null check (mode in ('daily', 'practice', 'challenge')),
  puzzle_key text not null check (char_length(puzzle_key) <= 80),
  won boolean not null default false,
  score integer, -- CineWordle: guesses used (1-6); crossword: seconds
  hint_used boolean not null default false,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists game_results_daily_once
  on public.game_results (user_id, game, puzzle_key) where mode = 'daily';
create index if not exists game_results_user_idx on public.game_results (user_id, game, created_at desc);

-- A challenge link: the exact puzzle, so friends play the same one
create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  game text not null check (game in ('cinewordle', 'crossword')),
  puzzle jsonb not null check (pg_column_size(puzzle) < 20000),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.challenge_results (
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  won boolean not null default false,
  score integer,
  hint_used boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

alter table public.game_results enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_results enable row level security;

-- Your own results only
drop policy if exists "results: own" on public.game_results;
create policy "results: own" on public.game_results
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "results: add own" on public.game_results;
create policy "results: add own" on public.game_results
  for insert to authenticated with check (user_id = (select auth.uid()));

-- Challenges are opened by their link (an unguessable id) through get_challenge;
-- people can read the ones they made.
drop policy if exists "challenges: own" on public.challenges;
create policy "challenges: own" on public.challenges
  for select to authenticated using (created_by = (select auth.uid()));
drop policy if exists "challenges: create own" on public.challenges;
create policy "challenges: create own" on public.challenges
  for insert to authenticated with check (created_by = (select auth.uid()));

drop policy if exists "challenge results: own" on public.challenge_results;
create policy "challenge results: own" on public.challenge_results
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "challenge results: add own" on public.challenge_results;
create policy "challenge results: add own" on public.challenge_results
  for insert to authenticated with check (user_id = (select auth.uid()));

-- Open a challenge by its id
create or replace function public.get_challenge(cid uuid)
returns table (id uuid, game text, puzzle jsonb, created_by uuid, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.id, c.game, c.puzzle, c.created_by, c.created_at from public.challenges c where c.id = cid;
$$;

-- Everyone's score on one challenge, with the names they chose
create or replace function public.challenge_board(cid uuid)
returns table (user_id uuid, name text, won boolean, score integer, hint_used boolean, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.user_id, p.display_name, r.won, r.score, r.hint_used, r.created_at
  from public.challenge_results r
  left join public.profiles p on p.id = r.user_id
  where r.challenge_id = cid
  order by r.won desc, r.score asc nulls last, r.created_at asc
  limit 100;
$$;

revoke execute on function public.get_challenge(uuid) from public, anon;
revoke execute on function public.challenge_board(uuid) from public, anon;
grant execute on function public.get_challenge(uuid) to authenticated;
grant execute on function public.challenge_board(uuid) to authenticated;

revoke all on public.game_results, public.challenges, public.challenge_results from anon;
grant select, insert on public.game_results to authenticated;
grant select, insert on public.challenges to authenticated;
grant select, insert on public.challenge_results to authenticated;
