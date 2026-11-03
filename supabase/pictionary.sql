-- CINEJOY database, Phase 3 step b: CinePictionary. Uses room_secrets and
-- room_answers from secrets.sql. The drawer's card holds the title; guesses are
-- checked by the database, so nobody else can read the answer early.
-- Safe to run more than once.

-- Deal a drawing turn. Only the host deals; the drawer must be in the room.
create or replace function public.deal_word(rid uuid, rnd integer, drawer uuid, options jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  pick jsonb;
begin
  if not exists (select 1 from public.rooms r where r.id = rid and r.host_id = (select auth.uid()) and r.kind = 'pictionary') then
    raise exception 'only the host can deal';
  end if;
  if not exists (select 1 from public.room_members m where m.room_id = rid and m.user_id = drawer) then
    raise exception 'drawer not in room';
  end if;
  if jsonb_typeof(options) <> 'array' or jsonb_array_length(options) < 1 or jsonb_array_length(options) > 100 then
    raise exception 'need 1 to 100 options';
  end if;
  if exists (select 1 from public.room_answers a where a.room_id = rid and a.round = rnd) then
    raise exception 'round already dealt';
  end if;
  select o into pick from jsonb_array_elements(options) o order by random() limit 1;
  insert into public.room_answers (room_id, round, data) values (rid, rnd, jsonb_build_object('drawer', drawer, 'title', pick));
  insert into public.room_secrets (room_id, round, user_id, data)
  select rid, rnd, m.user_id,
    case when m.user_id = drawer then jsonb_build_object('role', 'drawer', 'title', pick) else jsonb_build_object('role', 'guesser') end
  from public.room_members m where m.room_id = rid;
end;
$$;

-- A guess: checked against the answer and saved as a move everyone can see
-- (whether it was right, and the guessed title only when it was wrong).
create or replace function public.pictionary_guess(rid uuid, rnd integer, mt text, tid integer, label text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  ans jsonb;
  ok boolean;
begin
  if not public.is_room_member(rid) then raise exception 'not in this room'; end if;
  select a.data into ans from public.room_answers a where a.room_id = rid and a.round = rnd;
  if ans is null then raise exception 'no such round'; end if;
  if (ans->>'drawer')::uuid = (select auth.uid()) then raise exception 'the drawer cannot guess'; end if;
  if exists (select 1 from public.room_moves m where m.room_id = rid and m.round = rnd and m.kind = 'pguess'
             and m.user_id = (select auth.uid()) and (m.data->>'right')::boolean) then
    return true;
  end if;
  ok := (ans->'title'->>'mt') = mt and (ans->'title'->>'id')::integer = tid;
  insert into public.room_moves (room_id, user_id, kind, round, data)
  values (rid, (select auth.uid()), 'pguess', rnd,
    case when ok then jsonb_build_object('right', true) else jsonb_build_object('right', false, 'label', left(coalesce(label, ''), 80)) end);
  return ok;
end;
$$;

-- After a turn, anyone in the room can see the answer
create or replace function public.reveal_answer(rid uuid, rnd integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  st jsonb;
begin
  if not public.is_room_member(rid) then raise exception 'not in this room'; end if;
  select r.state into st from public.rooms r where r.id = rid;
  if coalesce((st->>'round')::int, -1) = rnd and coalesce(st->>'phase', '') not in ('reveal', 'done') then
    raise exception 'not yet';
  end if;
  return (select a.data from public.room_answers a where a.room_id = rid and a.round = rnd);
end;
$$;

revoke execute on function public.deal_word(uuid, integer, uuid, jsonb) from public, anon;
revoke execute on function public.pictionary_guess(uuid, integer, text, integer, text) from public, anon;
revoke execute on function public.reveal_answer(uuid, integer) from public, anon;
grant execute on function public.deal_word(uuid, integer, uuid, jsonb) to authenticated;
grant execute on function public.pictionary_guess(uuid, integer, text, integer, text) to authenticated;
grant execute on function public.reveal_answer(uuid, integer) to authenticated;

-- Guesses go through pictionary_guess only: players can't add 'pguess' moves directly
drop policy if exists "moves: members add own" on public.room_moves;
create policy "moves: members add own" on public.room_moves
  for insert to authenticated with check (user_id = (select auth.uid()) and public.is_room_member(room_id) and kind <> 'pguess');
