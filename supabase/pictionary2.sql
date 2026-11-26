-- CINEJOY database: CinePictionary v2 (a skribbl-style game).
-- The drawer picks one of three titles; everyone guesses by typing in the
-- chat; the database checks each message against the answer, so the answer
-- never reaches the guessers early. Needs secrets.sql, moves.sql and
-- pictionary.sql first. Safe to run more than once.

-- Text with only letters and digits, lower case: "Spider-Man: No Way Home" -> "spidermannowayhome"
create or replace function public.px_norm(s text)
returns text language sql immutable set search_path = '' as $$
  select regexp_replace(replace(lower(coalesce(s, '')), '&', 'and'), '[^[:alnum:]]+', '', 'g')
$$;

-- Edit distance, for "close!" (short strings only)
create or replace function public.px_lev(a text, b text)
returns integer language plpgsql immutable set search_path = '' as $$
declare
  la int := char_length(a);
  lb int := char_length(b);
  prev int[];
  cur int[];
  i int;
  j int;
begin
  if la = 0 then return lb; end if;
  if lb = 0 then return la; end if;
  if la > 80 or lb > 80 then return 99; end if;
  prev := array(select generate_series(0, lb));
  for i in 1..la loop
    cur := array[i];
    for j in 1..lb loop
      cur := cur || least(prev[j + 1] + 1, cur[j] + 1, prev[j] + case when substr(a, i, 1) = substr(b, j, 1) then 0 else 1 end);
    end loop;
    prev := cur;
  end loop;
  return prev[lb + 1];
end;
$$;

create or replace function public.px_now_ms()
returns bigint language sql stable set search_path = '' as $$
  select (extract(epoch from clock_timestamp()) * 1000)::bigint
$$;

-- Deal a turn: three titles go to the drawer only. Host only.
create or replace function public.px_deal(rid uuid, rnd integer, drawer uuid, choices jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.rooms r where r.id = rid and r.host_id = (select auth.uid()) and r.kind = 'pictionary') then
    raise exception 'only the host can deal';
  end if;
  if not exists (select 1 from public.room_members m where m.room_id = rid and m.user_id = drawer) then
    raise exception 'drawer not in room';
  end if;
  if jsonb_typeof(choices) <> 'array' or jsonb_array_length(choices) < 1 or jsonb_array_length(choices) > 5 then
    raise exception 'need 1 to 5 choices';
  end if;
  if exists (select 1 from public.room_answers a where a.room_id = rid and a.round = rnd) then
    raise exception 'round already dealt';
  end if;
  insert into public.room_answers (room_id, round, data) values (rid, rnd, jsonb_build_object('drawer', drawer, 'choices', choices));
  insert into public.room_secrets (room_id, round, user_id, data)
  select rid, rnd, m.user_id,
    case when m.user_id = drawer then jsonb_build_object('role', 'drawer', 'choices', choices) else jsonb_build_object('role', 'guesser') end
  from public.room_members m where m.room_id = rid;
end;
$$;

-- The drawer picks a title (or the host picks one when the drawer runs out of
-- time). Starts the drawing clock and puts the blank word mask in the room.
create or replace function public.px_choose(rid uuid, rnd integer, idx integer)
returns void language plpgsql security definer set search_path = '' as $$
declare
  ans jsonb;
  pick jsonb;
  me uuid := (select auth.uid());
  host uuid;
begin
  select a.data into ans from public.room_answers a where a.room_id = rid and a.round = rnd;
  if ans is null then raise exception 'no such round'; end if;
  if ans ? 'title' then return; end if;
  select r.host_id into host from public.rooms r where r.id = rid;
  if me <> (ans->>'drawer')::uuid and me <> host then raise exception 'not your turn'; end if;
  pick := ans->'choices'->greatest(0, least(idx, jsonb_array_length(ans->'choices') - 1));
  update public.room_answers set data = ans || jsonb_build_object('title', pick) where room_id = rid and round = rnd;
  update public.room_secrets set data = data || jsonb_build_object('title', pick)
    where room_id = rid and round = rnd and user_id = (ans->>'drawer')::uuid;
  update public.rooms set state = state || jsonb_build_object(
      'phase', 'draw',
      'startedAt', public.px_now_ms(),
      'mask', regexp_replace(pick->>'title', '[[:alnum:]]', '_', 'g'),
      'hints', '{}'::jsonb)
    where id = rid and coalesce((state->>'round')::int, -1) = rnd;
end;
$$;

-- A chat message. While a title is being drawn, a guesser's message is
-- checked: right -> a 'pguess' move (the text is never shown), close -> only
-- the sender is told, anything else -> shown to everyone as chat.
create or replace function public.px_say(rid uuid, rnd integer, msg text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  st jsonb;
  ans jsonb;
  m text := left(btrim(coalesce(msg, '')), 100);
  nm text;
  nt text;
  nt2 text;
  solved boolean;
begin
  if not public.is_room_member(rid) then raise exception 'not in this room'; end if;
  if m = '' then return 'empty'; end if;
  select r.state into st from public.rooms r where r.id = rid;
  select a.data into ans from public.room_answers a where a.room_id = rid and a.round = rnd;
  if coalesce(st->>'phase', '') = 'draw' and coalesce((st->>'round')::int, -1) = rnd and ans ? 'title' then
    nm := public.px_norm(m);
    nt := public.px_norm(ans->'title'->>'title');
    nt2 := public.px_norm(regexp_replace(ans->'title'->>'title', '^\s*(the|a|an)\s+', '', 'i'));
    if me = (ans->>'drawer')::uuid then
      if nt <> '' and (position(nt in nm) > 0 or position(nt2 in nm) > 0) then return 'blocked'; end if;
      insert into public.room_moves (room_id, user_id, kind, round, data) values (rid, me, 'pchat', rnd, jsonb_build_object('text', m, 'drawer', true));
      return 'sent';
    end if;
    select exists (select 1 from public.room_moves x where x.room_id = rid and x.round = rnd and x.kind = 'pguess'
                   and x.user_id = me and (x.data->>'right')::boolean) into solved;
    if solved then
      if nt <> '' and (position(nt in nm) > 0 or position(nt2 in nm) > 0) then return 'blocked'; end if;
      insert into public.room_moves (room_id, user_id, kind, round, data) values (rid, me, 'pchat', rnd, jsonb_build_object('text', m, 'solved', true));
      return 'sent';
    end if;
    if nm <> '' and (nm = nt or nm = nt2) then
      insert into public.room_moves (room_id, user_id, kind, round, data)
      values (rid, me, 'pguess', rnd, jsonb_build_object('right', true, 'at', public.px_now_ms()));
      return 'right';
    end if;
    if char_length(nt) >= 4 and (public.px_lev(nm, nt) <= case when char_length(nt) >= 10 then 2 else 1 end
                                 or public.px_lev(nm, nt2) <= case when char_length(nt2) >= 10 then 2 else 1 end) then
      return 'close';
    end if;
  end if;
  insert into public.room_moves (room_id, user_id, kind, round, data) values (rid, me, 'pchat', coalesce(rnd, 0), jsonb_build_object('text', m));
  return 'sent';
end;
$$;

-- Reveal one more letter of the title to everyone (the host's screen calls
-- this as the clock runs down). At most a third of the letters are shown.
create or replace function public.px_hint(rid uuid, rnd integer)
returns void language plpgsql security definer set search_path = '' as $$
declare
  ans jsonb;
  st jsonb;
  host uuid;
  me uuid := (select auth.uid());
  ttl text;
  hints jsonb;
  pos int[];
  total int;
  p int;
begin
  select a.data into ans from public.room_answers a where a.room_id = rid and a.round = rnd;
  select r.state, r.host_id into st, host from public.rooms r where r.id = rid;
  if ans is null or not (ans ? 'title') then return; end if;
  if me <> host and me <> (ans->>'drawer')::uuid then raise exception 'not allowed'; end if;
  if coalesce(st->>'phase', '') <> 'draw' or coalesce((st->>'round')::int, -1) <> rnd then return; end if;
  ttl := ans->'title'->>'title';
  hints := coalesce(st->'hints', '{}'::jsonb);
  select count(*) into total from generate_series(1, char_length(ttl)) i where substr(ttl, i, 1) ~ '[[:alnum:]]';
  if (select count(*) from jsonb_object_keys(hints)) >= total / 3 then return; end if;
  select array_agg(i) into pos from generate_series(1, char_length(ttl)) i
    where substr(ttl, i, 1) ~ '[[:alnum:]]' and not (hints ? (i - 1)::text);
  if pos is null then return; end if;
  p := pos[1 + floor(random() * array_length(pos, 1))::int];
  update public.rooms set state = jsonb_set(state, '{hints}', hints || jsonb_build_object((p - 1)::text, substr(ttl, p, 1)))
    where id = rid and state->>'phase' = 'draw' and (state->>'round')::int = rnd;
end;
$$;

revoke execute on function public.px_deal(uuid, integer, uuid, jsonb) from public, anon;
revoke execute on function public.px_choose(uuid, integer, integer) from public, anon;
revoke execute on function public.px_say(uuid, integer, text) from public, anon;
revoke execute on function public.px_hint(uuid, integer) from public, anon;
grant execute on function public.px_hint(uuid, integer) to authenticated;
grant execute on function public.px_deal(uuid, integer, uuid, jsonb) to authenticated;
grant execute on function public.px_choose(uuid, integer, integer) to authenticated;
grant execute on function public.px_say(uuid, integer, text) to authenticated;

-- Guesses and chat go through px_say only
drop policy if exists "moves: members add own" on public.room_moves;
create policy "moves: members add own" on public.room_moves
  for insert to authenticated with check (user_id = (select auth.uid()) and public.is_room_member(room_id) and kind not in ('pguess', 'pchat'));

-- Make the new functions visible to the API straight away
notify pgrst, 'reload schema';
