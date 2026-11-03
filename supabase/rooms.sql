-- CINEJOY database, Phase 2 step b: friend rooms and Movie Night.
-- A room is private: you get in with its code or invite link. Everything in it
-- is visible only to the people in it. Safe to run more than once.

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
  kind text not null check (kind in ('movienight', 'quiz', 'impostor', 'pictionary', 'poster')),
  title text check (char_length(title) <= 80),
  host_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  state jsonb not null default '{}'::jsonb check (pg_column_size(state) < 200000),
  closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.room_members (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index if not exists room_members_user_idx on public.room_members (user_id);

-- Movie Night: everyone says yes or no to each title on the shortlist
create table if not exists public.movie_votes (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item text not null check (char_length(item) <= 40), -- "movie:496243"
  vote smallint not null check (vote in (0, 1, 2)), -- 0 no, 1 yes, 2 "my pick" in the final vote
  created_at timestamptz not null default now(),
  primary key (room_id, user_id, item, vote)
);

-- Anyone in a room can report it; the owner reviews reports in Supabase
create table if not exists public.room_reports (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  reporter uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reason text check (char_length(reason) <= 500),
  created_at timestamptz not null default now()
);

create or replace function public.is_room_member(rid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.room_members m where m.room_id = rid and m.user_id = (select auth.uid()));
$$;

-- The host is always in their room
create or replace function public.add_room_host()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.room_members (room_id, user_id) values (new.id, new.host_id) on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists rooms_add_host on public.rooms;
create trigger rooms_add_host after insert on public.rooms for each row execute function public.add_room_host();

drop trigger if exists rooms_touch on public.rooms;
create trigger rooms_touch before update on public.rooms for each row execute function public.touch_updated_at();

-- Join with a code; returns the room id
create or replace function public.join_room(code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  rid uuid;
begin
  if (select auth.uid()) is null then raise exception 'not signed in'; end if;
  select r.id into rid from public.rooms r where r.code = upper(trim(join_room.code)) and not r.closed;
  if rid is null then raise exception 'room not found'; end if;
  if (select count(*) from public.room_members m where m.room_id = rid) >= 30 then raise exception 'room full'; end if;
  insert into public.room_members (room_id, user_id) values (rid, (select auth.uid())) on conflict do nothing;
  return rid;
end;
$$;

-- Who is in a room, with the names they chose
create or replace function public.room_people(rid uuid)
returns table (user_id uuid, name text, joined_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.user_id, p.display_name, m.joined_at
  from public.room_members m left join public.profiles p on p.id = m.user_id
  where m.room_id = rid and public.is_room_member(rid)
  order by m.joined_at;
$$;

revoke execute on function public.join_room(text) from public, anon;
revoke execute on function public.room_people(uuid) from public, anon;
grant execute on function public.join_room(text) to authenticated;
grant execute on function public.room_people(uuid) to authenticated;

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.movie_votes enable row level security;
alter table public.room_reports enable row level security;

drop policy if exists "rooms: members read" on public.rooms;
create policy "rooms: members read" on public.rooms
  for select to authenticated using (host_id = (select auth.uid()) or public.is_room_member(id));
drop policy if exists "rooms: host creates" on public.rooms;
create policy "rooms: host creates" on public.rooms
  for insert to authenticated with check (host_id = (select auth.uid()));
-- Members can update the shared state (votes in games, the wheel spin); only the host can close
drop policy if exists "rooms: members update" on public.rooms;
create policy "rooms: members update" on public.rooms
  for update to authenticated using (public.is_room_member(id)) with check (public.is_room_member(id));
drop policy if exists "rooms: host deletes" on public.rooms;
create policy "rooms: host deletes" on public.rooms
  for delete to authenticated using (host_id = (select auth.uid()));

drop policy if exists "room members: read" on public.room_members;
create policy "room members: read" on public.room_members
  for select to authenticated using (public.is_room_member(room_id));
drop policy if exists "room members: leave" on public.room_members;
create policy "room members: leave" on public.room_members
  for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "votes: members read" on public.movie_votes;
create policy "votes: members read" on public.movie_votes
  for select to authenticated using (public.is_room_member(room_id));
drop policy if exists "votes: own" on public.movie_votes;
create policy "votes: own" on public.movie_votes
  for insert to authenticated with check (user_id = (select auth.uid()) and public.is_room_member(room_id));
drop policy if exists "votes: change own" on public.movie_votes;
create policy "votes: change own" on public.movie_votes
  for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "reports: file" on public.room_reports;
create policy "reports: file" on public.room_reports
  for insert to authenticated with check (reporter = (select auth.uid()) and public.is_room_member(room_id));

revoke all on public.rooms, public.room_members, public.movie_votes, public.room_reports from anon;
grant select, insert, update, delete on public.rooms to authenticated;
grant select, delete on public.room_members to authenticated;
grant select, insert, delete on public.movie_votes to authenticated;
grant insert on public.room_reports to authenticated;

-- Live updates for rooms
do $$
declare t text;
begin
  foreach t in array array['rooms', 'room_members', 'movie_votes'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Members may update a room's shared state, but only the host may close it,
-- and nobody can change who hosts it, its code or its kind.
create or replace function public.guard_room_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.host_id <> old.host_id or new.code <> old.code or new.kind <> old.kind then
    raise exception 'room host, code and kind cannot change';
  end if;
  if new.closed <> old.closed and (select auth.uid()) <> old.host_id then
    raise exception 'only the host can close the room';
  end if;
  return new;
end;
$$;
drop trigger if exists rooms_guard on public.rooms;
create trigger rooms_guard before update on public.rooms for each row execute function public.guard_room_update();
