-- CINENJOY database, Phase 2 steps c and d (and Phase 3 room games):
-- moves players make in a room (quiz answers, clues, votes, guesses), and the
-- new games in game results and challenge links. Safe to run more than once.

create table if not exists public.room_moves (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (char_length(kind) <= 20),
  round integer not null default 0,
  data jsonb not null default '{}'::jsonb check (pg_column_size(data) < 4000),
  created_at timestamptz not null default now()
);
create index if not exists room_moves_room_idx on public.room_moves (room_id, round);

alter table public.room_moves enable row level security;
drop policy if exists "moves: members read" on public.room_moves;
create policy "moves: members read" on public.room_moves
  for select to authenticated using (public.is_room_member(room_id));
drop policy if exists "moves: members add own" on public.room_moves;
create policy "moves: members add own" on public.room_moves
  for insert to authenticated with check (user_id = (select auth.uid()) and public.is_room_member(room_id));
revoke all on public.room_moves from anon;
grant select, insert on public.room_moves to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_moves'
  ) then
    alter publication supabase_realtime add table public.room_moves;
  end if;
end $$;

-- All the games, for saved results and challenge links
alter table public.game_results drop constraint if exists game_results_game_check;
alter table public.game_results add constraint game_results_game_check check (game in (
  'cinewordle', 'crossword', 'quiz', 'frame', 'cryptic', 'impostor', 'pictionary', 'emoji', 'degrees', 'higher', 'timeline', 'poster', 'weekend'));
alter table public.challenges drop constraint if exists challenges_game_check;
alter table public.challenges add constraint challenges_game_check check (game in (
  'cinewordle', 'crossword', 'quiz', 'frame', 'cryptic', 'impostor', 'pictionary', 'emoji', 'degrees', 'higher', 'timeline', 'poster', 'weekend'));
