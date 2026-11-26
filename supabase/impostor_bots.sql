-- CINEJOY database: bots in Movie Impostor rooms.
-- A room with 2 to 4 people is topped up with bots to 5 players. The bots are
-- played by the database, so no person (not even the host) can see which bot
-- is the impostor or what the bots were told. Needs secrets.sql and moves.sql.
-- Safe to run more than once.

-- Words match if equal, or if one starts the other (4+ letters)
create or replace function public.imp_norm(s text)
returns text language sql immutable set search_path = '' as $$
  select regexp_replace(lower(coalesce(s, '')), '[^[:alnum:]]+', '', 'g')
$$;

create or replace function public.imp_fit(words text[], rel jsonb)
returns numeric language sql immutable set search_path = '' as $$
  select coalesce(sum(case
    when exists (select 1 from jsonb_array_elements_text(rel) r where r = w) then 1
    when char_length(w) >= 4 and exists (select 1 from jsonb_array_elements_text(rel) r
      where char_length(r) >= 4 and (r like w || '%' or w like r || '%')) then 0.6
    else 0 end), 0)
  from (select public.imp_norm(x) as w from unnest(words) x) q where char_length(w) >= 3
$$;

-- Deal a round with bots. options: [{title, year, mt, id, words: [...], rel: [...]}]
-- (words = clue words for that title, rel = words related to it, both from
-- TMDB). bots: ["bot:1", "bot:2", ...]. Host only.
create or replace function public.deal_impostor_bots(rid uuid, rnd integer, options jsonb, bots jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  pick jsonb;
  imp text;
  choices jsonb;
  humans int;
begin
  if not exists (select 1 from public.rooms r where r.id = rid and r.host_id = (select auth.uid()) and r.kind = 'impostor') then
    raise exception 'only the host can deal';
  end if;
  if jsonb_typeof(options) <> 'array' or jsonb_array_length(options) < 6 or jsonb_array_length(options) > 60 then
    raise exception 'need 6 to 60 options';
  end if;
  if jsonb_typeof(bots) <> 'array' or jsonb_array_length(bots) > 6 then raise exception 'too many bots'; end if;
  select count(*) into humans from public.room_members m where m.room_id = rid;
  if humans < 2 or humans + jsonb_array_length(bots) < 3 then raise exception 'need at least 2 people'; end if;
  if exists (select 1 from public.room_answers a where a.room_id = rid and a.round = rnd) then
    raise exception 'round already dealt';
  end if;
  select o into pick from jsonb_array_elements(options) o order by random() limit 1;
  select p into imp from (
    select m.user_id::text as p from public.room_members m where m.room_id = rid
    union all select b from jsonb_array_elements_text(bots) b
  ) x order by random() limit 1;
  select jsonb_agg(c - 'words' - 'rel' order by random()) into choices from (
    select pick as c
    union all
    (select o from jsonb_array_elements(options) o where o->>'id' <> pick->>'id' order by random() limit 5)
  ) x;
  insert into public.room_answers (room_id, round, data) values (rid, rnd, jsonb_build_object(
    'impostor', imp, 'title', pick - 'words' - 'rel', 'bots', bots,
    'botbrain', jsonb_build_object('words', coalesce(pick->'words', '[]'), 'rel', coalesce(pick->'rel', '[]'),
                                   'options', options, 'choices', choices)));
  insert into public.room_secrets (room_id, round, user_id, data)
  select rid, rnd, m.user_id,
    case when m.user_id::text = imp then jsonb_build_object('role', 'impostor', 'choices', choices)
         else jsonb_build_object('role', 'crew', 'title', pick - 'words' - 'rel') end
  from public.room_members m where m.room_id = rid;
end;
$$;

-- One bot takes its next action (a clue, a vote or the impostor's guess).
-- The host's page calls this every second or two while bots are waiting.
-- Returns how many bots still have to act in this step.
create or replace function public.impostor_bot_turn(rid uuid, rnd integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  st jsonb;
  host uuid;
  ans jsonb;
  brain jsonb;
  bot text;
  cr int;
  clue_round int;
  word text;
  used text[];
  crew_words text[];
  target text;
  best jsonb;
  pending int;
  vague text[] := array['classic', 'iconic', 'intense', 'epic', 'twist', 'journey', 'emotional', 'legendary', 'dramatic', 'gripping', 'memorable', 'unforgettable'];
begin
  select r.state, r.host_id into st, host from public.rooms r where r.id = rid;
  if host <> (select auth.uid()) then raise exception 'only the host'; end if;
  if coalesce((st->>'round')::int, -1) <> rnd then return 0; end if;
  select a.data into ans from public.room_answers a where a.room_id = rid and a.round = rnd;
  if ans is null or not (ans ? 'bots') then return 0; end if;
  brain := ans->'botbrain';

  if st->>'phase' = 'clues' then
    cr := coalesce((st->>'clueRound')::int, 1);
    clue_round := rnd * 10 + cr;
    -- The impostor bot likes to hear a clue or two first, so it can blend in:
    -- while other bots are still to go, it usually lets them go first
    select b into bot from jsonb_array_elements_text(ans->'bots') b
      where not exists (select 1 from public.room_moves m where m.room_id = rid and m.round = clue_round and m.kind = 'clue' and m.data->>'bot' = b)
      order by (b = ans->>'impostor' and random() < 0.75) , random() limit 1;
    if bot is null then return 0; end if;
    if bot = ans->>'impostor' and cr = 1 and random() < 0.7 and not exists (
      select 1 from public.room_moves m where m.room_id = rid and m.round = clue_round and m.kind = 'clue') then
      return 1; -- nobody has clued yet this game: wait a moment
    end if;
    select coalesce(array_agg(public.imp_norm(m.data->>'word')), '{}') into used
      from public.room_moves m where m.room_id = rid and m.kind = 'clue' and m.round between rnd * 10 + 1 and rnd * 10 + 9;
    if bot <> ans->>'impostor' then
      -- Crew bot: reads the clues so far. If they already point clearly at
      -- the title, it gives a subtler word (from later in its list) so the
      -- impostor learns little; if they are vague, it gives a strong one.
      select coalesce(array_agg(m.data->>'word'), '{}') into crew_words
        from public.room_moves m where m.room_id = rid and m.kind = 'clue' and m.round between rnd * 10 + 1 and rnd * 10 + 9;
      if array_length(crew_words, 1) is not null
         and public.imp_fit(crew_words, brain->'rel') >= greatest(2, array_length(crew_words, 1) * 0.5) then
        select w into word from jsonb_array_elements_text(brain->'words') with ordinality t(w, n)
          where public.imp_norm(w) <> all(used) and n > 4 order by random() limit 1;
      end if;
      if word is null then
        select w into word from jsonb_array_elements_text(brain->'words') with ordinality t(w, n)
          where public.imp_norm(w) <> all(used) order by n limit 1;
      end if;
    else
      -- Impostor bot: work out the likeliest title from everyone else's clues
      -- and clue for that; with no clues yet, say something vague
      select coalesce(array_agg(m.data->>'word'), '{}') into crew_words
        from public.room_moves m where m.room_id = rid and m.kind = 'clue' and m.round between rnd * 10 + 1 and rnd * 10 + 9
        and coalesce(m.data->>'bot', m.user_id::text) <> bot;
      if array_length(crew_words, 1) is not null then
        select o into best from jsonb_array_elements(brain->'options') o
          order by public.imp_fit(crew_words, o->'rel') + random() * 0.3 desc limit 1;
        select w into word from jsonb_array_elements_text(best->'words') w
          where public.imp_norm(w) <> all(used) and public.imp_norm(w) <> all(array(select public.imp_norm(x) from unnest(crew_words) x))
          order by random() limit 1;
      end if;
    end if;
    if word is null then
      select v into word from unnest(vague) v where v <> all(used) order by random() limit 1;
    end if;
    insert into public.room_moves (room_id, user_id, kind, round, data)
      values (rid, host, 'clue', clue_round, jsonb_build_object('word', coalesce(word, 'movie'), 'bot', bot));
    select count(*) into pending from jsonb_array_elements_text(ans->'bots') b
      where not exists (select 1 from public.room_moves m where m.room_id = rid and m.round = clue_round and m.kind = 'clue' and m.data->>'bot' = b);
    return pending;
  end if;

  if st->>'phase' = 'vote' then
    select b into bot from jsonb_array_elements_text(ans->'bots') b
      where not exists (select 1 from public.room_moves m where m.room_id = rid and m.round = rnd * 10 and m.kind = 'vote' and m.data->>'bot' = b)
      order by random() limit 1;
    if bot is null then return 0; end if;
    if bot = ans->>'impostor' then
      -- Impostor bot: votes like a crew member would, against whoever's clues
      -- fit its best guess at the title least
      select coalesce(array_agg(m.data->>'word'), '{}') into crew_words
        from public.room_moves m where m.room_id = rid and m.kind = 'clue' and m.round between rnd * 10 + 1 and rnd * 10 + 9
        and coalesce(m.data->>'bot', m.user_id::text) <> bot;
      select o into best from jsonb_array_elements(brain->'options') o
        order by public.imp_fit(crew_words, o->'rel') + random() * 0.3 desc limit 1;
      select p into target from jsonb_array_elements_text(st->'players') p
        where p <> bot
        order by public.imp_fit(array(
          select m.data->>'word' from public.room_moves m where m.room_id = rid and m.kind = 'clue'
            and m.round between rnd * 10 + 1 and rnd * 10 + 9 and coalesce(m.data->>'bot', m.user_id::text) = p), coalesce(best->'rel', '[]')) + random() * 0.5
        limit 1;
    elsif random() < 0.15 then
      select p into target from jsonb_array_elements_text(st->'players') p where p <> bot order by random() limit 1;
    else
      -- Crew bot: vote for whoever's clues fit the real title least
      select p into target from jsonb_array_elements_text(st->'players') p
        where p <> bot
        order by public.imp_fit(array(
          select m.data->>'word' from public.room_moves m where m.room_id = rid and m.kind = 'clue'
            and m.round between rnd * 10 + 1 and rnd * 10 + 9 and coalesce(m.data->>'bot', m.user_id::text) = p), brain->'rel') + random() * 0.5
        limit 1;
    end if;
    insert into public.room_moves (room_id, user_id, kind, round, data)
      values (rid, host, 'vote', rnd * 10, jsonb_build_object('target', target, 'bot', bot));
    select count(*) into pending from jsonb_array_elements_text(ans->'bots') b
      where not exists (select 1 from public.room_moves m where m.room_id = rid and m.round = rnd * 10 and m.kind = 'vote' and m.data->>'bot' = b);
    return pending;
  end if;

  if st->>'phase' = 'guess' and (ans->'bots') ? (ans->>'impostor') then
    if exists (select 1 from public.room_moves m where m.room_id = rid and m.round = rnd * 10 and m.kind = 'guess') then return 0; end if;
    select coalesce(array_agg(m.data->>'word'), '{}') into crew_words
      from public.room_moves m where m.room_id = rid and m.kind = 'clue' and m.round between rnd * 10 + 1 and rnd * 10 + 9
      and coalesce(m.data->>'bot', m.user_id::text) <> ans->>'impostor';
    select c into best from jsonb_array_elements(brain->'choices') c
      order by public.imp_fit(crew_words, coalesce((select o->'rel' from jsonb_array_elements(brain->'options') o where o->>'id' = c->>'id' limit 1), '[]')) + random() * 0.4 desc
      limit 1;
    insert into public.room_moves (room_id, user_id, kind, round, data)
      values (rid, host, 'guess', rnd * 10, jsonb_build_object('title', best->>'title', 'bot', ans->>'impostor'));
    return 0;
  end if;
  return 0;
end;
$$;

-- After the vote, anyone in the room can see who it was and the title
-- (the bots' notes stay hidden)
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
  return (select a.data - 'botbrain' from public.room_answers a where a.room_id = rid and a.round = rnd);
end;
$$;

revoke execute on function public.deal_impostor_bots(uuid, integer, jsonb, jsonb) from public, anon;
revoke execute on function public.impostor_bot_turn(uuid, integer) from public, anon;
grant execute on function public.deal_impostor_bots(uuid, integer, jsonb, jsonb) to authenticated;
grant execute on function public.impostor_bot_turn(uuid, integer) to authenticated;

notify pgrst, 'reload schema';
