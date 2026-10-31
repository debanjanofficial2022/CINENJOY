-- CINENJOY database, Phase 1 step b: settings, watchlists, tags and ratings.
--
-- Every visitor gets an automatic anonymous account (Supabase anonymous
-- sign-ins), so auth.uid() is always set. Row Level Security is on for every
-- table: people see their own data, plus the lists they belong to and the
-- ratings of people they share a list with.
--
-- Safe to run more than once.

-- ---------- Profiles and settings ----------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 40),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Lists ----------

create table if not exists public.lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 500),
  emoji text check (char_length(emoji) <= 16),
  is_shared boolean not null default false,
  invite_code text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.list_members (
  list_id uuid not null references public.lists (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (list_id, user_id)
);
create index if not exists list_members_user_idx on public.list_members (user_id);

create table if not exists public.list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists (id) on delete cascade,
  media_type text not null check (media_type in ('movie', 'tv')),
  tmdb_id integer not null,
  title text not null check (char_length(title) <= 300),
  original_title text check (char_length(original_title) <= 300),
  original_language text check (char_length(original_language) <= 10),
  poster_path text check (char_length(poster_path) <= 200),
  release_date date,
  meta jsonb not null default '{}'::jsonb, -- genres, countries, anime flag: used for built-in tags
  added_by uuid default auth.uid() references auth.users (id) on delete set null,
  added_at timestamptz not null default now(),
  unique (list_id, media_type, tmdb_id)
);
create index if not exists list_items_list_idx on public.list_items (list_id);

-- Each member marks a title watched for themselves
create table if not exists public.watched (
  item_id uuid not null references public.list_items (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  watched_at timestamptz not null default now(),
  primary key (item_id, user_id)
);

-- ---------- Ratings (one per person per title; also the diary) ----------

create table if not exists public.ratings (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  media_type text not null check (media_type in ('movie', 'tv')),
  tmdb_id integer not null,
  rating numeric(2, 1) check (rating is null or (rating between 0.5 and 5 and rating * 2 = floor(rating * 2))),
  note text check (char_length(note) <= 1000),
  watched_on date,
  title text check (char_length(title) <= 300),
  poster_path text check (char_length(poster_path) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, media_type, tmdb_id)
);

-- ---------- Personal tags ("rainy Sunday", "watch with Dad") ----------

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.title_tags (
  tag_id uuid not null references public.tags (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  media_type text not null check (media_type in ('movie', 'tv')),
  tmdb_id integer not null,
  primary key (tag_id, media_type, tmdb_id)
);
create index if not exists title_tags_user_idx on public.title_tags (user_id);

-- ---------- Helper functions (used by the security rules) ----------

create or replace function public.is_list_member(lid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.list_members m
    where m.list_id = lid and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.owns_list(lid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.lists l
    where l.id = lid and l.owner_id = (select auth.uid())
  );
$$;

create or replace function public.shares_list_with(other uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select other = (select auth.uid()) or exists (
    select 1
    from public.list_members a
    join public.list_members b on b.list_id = a.list_id
    where a.user_id = (select auth.uid()) and b.user_id = other
  );
$$;

create or replace function public.item_visible(iid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.list_items i
    join public.list_members m on m.list_id = i.list_id
    where i.id = iid and m.user_id = (select auth.uid())
  );
$$;

-- ---------- Triggers ----------

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
drop trigger if exists lists_touch on public.lists;
create trigger lists_touch before update on public.lists
  for each row execute function public.touch_updated_at();
drop trigger if exists ratings_touch on public.ratings;
create trigger ratings_touch before update on public.ratings
  for each row execute function public.touch_updated_at();

-- A profile row for every new account
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- The list owner is always a member
create or replace function public.add_list_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.list_members (list_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists lists_add_owner on public.lists;
create trigger lists_add_owner after insert on public.lists
  for each row execute function public.add_list_owner();

-- Sharing a list gives it an invite code
create or replace function public.ensure_invite_code()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.is_shared and new.invite_code is null then
    new.invite_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  end if;
  return new;
end;
$$;
drop trigger if exists lists_invite_code on public.lists;
create trigger lists_invite_code before insert or update on public.lists
  for each row execute function public.ensure_invite_code();

-- Join a shared list with its invite code
create or replace function public.join_list(code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  lid uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not signed in';
  end if;
  select id into lid from public.lists
  where invite_code = upper(trim(code)) and is_shared;
  if lid is null then
    raise exception 'invite not found';
  end if;
  insert into public.list_members (list_id, user_id, role)
  values (lid, (select auth.uid()), 'member')
  on conflict do nothing;
  return lid;
end;
$$;

-- Preview a shared list before joining (name and size only)
create or replace function public.invite_preview(code text)
returns table (list_id uuid, name text, emoji text, items bigint, members bigint)
language sql stable security definer set search_path = '' as $$
  select l.id, l.name, l.emoji,
    (select count(*) from public.list_items i where i.list_id = l.id),
    (select count(*) from public.list_members m where m.list_id = l.id)
  from public.lists l
  where l.invite_code = upper(trim(code)) and l.is_shared;
$$;

revoke execute on function public.join_list(text) from public, anon;
revoke execute on function public.invite_preview(text) from public, anon;
grant execute on function public.join_list(text) to authenticated;
grant execute on function public.invite_preview(text) to authenticated;

-- ---------- Row Level Security ----------

alter table public.profiles enable row level security;
alter table public.lists enable row level security;
alter table public.list_members enable row level security;
alter table public.list_items enable row level security;
alter table public.watched enable row level security;
alter table public.ratings enable row level security;
alter table public.tags enable row level security;
alter table public.title_tags enable row level security;

-- profiles
drop policy if exists "profiles: read self and list friends" on public.profiles;
create policy "profiles: read self and list friends" on public.profiles
  for select to authenticated using (public.shares_list_with(id));
drop policy if exists "profiles: insert self" on public.profiles;
create policy "profiles: insert self" on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
drop policy if exists "profiles: update self" on public.profiles;
create policy "profiles: update self" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- lists
drop policy if exists "lists: read own and joined" on public.lists;
create policy "lists: read own and joined" on public.lists
  for select to authenticated using (owner_id = (select auth.uid()) or public.is_list_member(id));
drop policy if exists "lists: create own" on public.lists;
create policy "lists: create own" on public.lists
  for insert to authenticated with check (owner_id = (select auth.uid()));
drop policy if exists "lists: owner edits" on public.lists;
create policy "lists: owner edits" on public.lists
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists "lists: owner deletes" on public.lists;
create policy "lists: owner deletes" on public.lists
  for delete to authenticated using (owner_id = (select auth.uid()));

-- list_members (joining happens through join_list)
drop policy if exists "members: read co-members" on public.list_members;
create policy "members: read co-members" on public.list_members
  for select to authenticated using (public.is_list_member(list_id));
drop policy if exists "members: leave or owner removes" on public.list_members;
create policy "members: leave or owner removes" on public.list_members
  for delete to authenticated using (
    (user_id = (select auth.uid()) and role <> 'owner') or (public.owns_list(list_id) and role <> 'owner')
  );

-- list_items
drop policy if exists "items: members read" on public.list_items;
create policy "items: members read" on public.list_items
  for select to authenticated using (public.is_list_member(list_id));
drop policy if exists "items: members add" on public.list_items;
create policy "items: members add" on public.list_items
  for insert to authenticated with check (public.is_list_member(list_id) and added_by = (select auth.uid()));
drop policy if exists "items: adder or owner edits" on public.list_items;
create policy "items: adder or owner edits" on public.list_items
  for update to authenticated
  using (added_by = (select auth.uid()) or public.owns_list(list_id))
  with check (public.is_list_member(list_id));
drop policy if exists "items: adder or owner removes" on public.list_items;
create policy "items: adder or owner removes" on public.list_items
  for delete to authenticated using (added_by = (select auth.uid()) or public.owns_list(list_id));

-- watched
drop policy if exists "watched: members read" on public.watched;
create policy "watched: members read" on public.watched
  for select to authenticated using (public.item_visible(item_id));
drop policy if exists "watched: mark own" on public.watched;
create policy "watched: mark own" on public.watched
  for insert to authenticated with check (user_id = (select auth.uid()) and public.item_visible(item_id));
drop policy if exists "watched: unmark own" on public.watched;
create policy "watched: unmark own" on public.watched
  for delete to authenticated using (user_id = (select auth.uid()));

-- ratings
drop policy if exists "ratings: read own and list friends" on public.ratings;
create policy "ratings: read own and list friends" on public.ratings
  for select to authenticated using (public.shares_list_with(user_id));
drop policy if exists "ratings: write own" on public.ratings;
create policy "ratings: write own" on public.ratings
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "ratings: update own" on public.ratings;
create policy "ratings: update own" on public.ratings
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "ratings: delete own" on public.ratings;
create policy "ratings: delete own" on public.ratings
  for delete to authenticated using (user_id = (select auth.uid()));

-- tags
drop policy if exists "tags: own" on public.tags;
create policy "tags: own" on public.tags
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- title_tags
drop policy if exists "title_tags: own" on public.title_tags;
create policy "title_tags: own" on public.title_tags
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.tags t where t.id = tag_id and t.user_id = (select auth.uid()))
  );

-- ---------- Table access for signed-in visitors (rules above still apply) ----------

revoke all on public.profiles, public.lists, public.list_members, public.list_items,
  public.watched, public.ratings, public.tags, public.title_tags from anon;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.lists to authenticated;
grant select, delete on public.list_members to authenticated;
grant select, insert, update, delete on public.list_items to authenticated;
grant select, insert, delete on public.watched to authenticated;
grant select, insert, update, delete on public.ratings to authenticated;
grant select, insert, update, delete on public.tags to authenticated;
grant select, insert, update, delete on public.title_tags to authenticated;

-- ---------- Live updates ----------
-- Lets the site show changes from other people instantly (Supabase Realtime).
-- Row Level Security still decides who receives each change. Safe to run again.
do $$
declare t text;
begin
  foreach t in array array['lists', 'list_members', 'list_items', 'watched', 'ratings'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
