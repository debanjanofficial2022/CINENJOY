-- CINEJOY database, Phase 2 step d: secrets in room games.
-- In Movie Impostor everyone but one player sees the secret title. The
-- database deals the cards, so not even the host knows who the impostor is.
-- Each player can read only their own card. Safe to run more than once.

create table if not exists public.room_secrets (
  room_id uuid not null references public.rooms (id) on delete cascade,
  round integer not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  data jsonb not null,
  primary key (room_id, round, user_id)
);

-- The answer to each round; nobody reads this table directly
create table if not exists public.room_answers (
  room_id uuid not null references public.rooms (id) on delete cascade,
  round integer not null,
  data jsonb not null,
  primary key (room_id, round)
);

alter table public.room_secrets enable row level security;
alter table public.room_answers enable row level security;
drop policy if exists "secrets: own card" on public.room_secrets;
create policy "secrets: own card" on public.room_secrets
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.room_secrets, public.room_answers from anon, authenticated;
grant select on public.room_secrets to authenticated;

-- Deal a round of Movie Impostor. options: a list of {title, year, mt, id}.
-- Picks one title and one impostor at random. Only the host can deal.
create or replace function public.deal_impostor(rid uuid, rnd integer, options jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  pick jsonb;
  imp uuid;
  choices jsonb;
begin
  if not exists (select 1 from public.rooms r where r.id = rid and r.host_id = (select auth.uid()) and r.kind = 'impostor') then
    raise exception 'only the host can deal';
  end if;
  if jsonb_typeof(options) <> 'array' or jsonb_array_length(options) < 6 or jsonb_array_length(options) > 100 then
    raise exception 'need 6 to 100 options';
  end if;
  if (select count(*) from public.room_members m where m.room_id = rid) < 3 then
    raise exception 'need at least 3 players';
  end if;
  if exists (select 1 from public.room_answers a where a.room_id = rid and a.round = rnd) then
    raise exception 'round already dealt';
  end if;
  select o into pick from jsonb_array_elements(options) o order by random() limit 1;
  select m.user_id into imp from public.room_members m where m.room_id = rid order by random() limit 1;
  -- The impostor's guess, if caught: the real title and five others
  select jsonb_agg(c order by random()) into choices from (
    select pick as c
    union all
    (select o from jsonb_array_elements(options) o where o <> pick order by random() limit 5)
  ) x;
  insert into public.room_answers (room_id, round, data) values (rid, rnd, jsonb_build_object('impostor', imp, 'title', pick));
  insert into public.room_secrets (room_id, round, user_id, data)
  select rid, rnd, m.user_id,
    case when m.user_id = imp then jsonb_build_object('role', 'impostor', 'choices', choices)
         else jsonb_build_object('role', 'crew', 'title', pick) end
  from public.room_members m where m.room_id = rid;
end;
$$;

-- After the vote, anyone in the room can see who it was and the title
create or replace function public.reveal_impostor(rid uuid, rnd integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  st jsonb;
begin
  if not public.is_room_member(rid) then raise exception 'not in this room'; end if;
  select r.state into st from public.rooms r where r.id = rid;
  if coalesce((st->>'round')::int, -1) = rnd and coalesce(st->>'phase', '') not in ('reveal', 'guess', 'over') then
    raise exception 'not yet';
  end if;
  return (select a.data from public.room_answers a where a.room_id = rid and a.round = rnd);
end;
$$;

revoke execute on function public.deal_impostor(uuid, integer, jsonb) from public, anon;
revoke execute on function public.reveal_impostor(uuid, integer) from public, anon;
grant execute on function public.deal_impostor(uuid, integer, jsonb) to authenticated;
grant execute on function public.reveal_impostor(uuid, integer) to authenticated;
