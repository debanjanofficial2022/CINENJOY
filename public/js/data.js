// Saved data: the visitor's automatic account and everything they keep.
// Supabase anonymous sign-ins give every visitor an account on their first
// visit; Row Level Security on the database decides who sees what.
import { SUPABASE_URL, SUPABASE_KEY, SUPABASE_JS } from './config.js';
import { getLang, setLang, onLangChange, LANGS } from './i18n.js';
import { store } from './store.js';

let clientP = null;
let userP = null;

function client() {
  if (!clientP) {
    clientP = import(SUPABASE_JS).then(({ createClient }) =>
      createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: 'cinenjoy-auth' },
      }),
    );
    clientP.catch(() => {
      clientP = null;
    });
  }
  return clientP;
}

/** The signed-in visitor, creating an anonymous account on the first visit. */
export function currentUser() {
  if (!userP) {
    userP = (async () => {
      const sb = await client();
      const { data } = await sb.auth.getSession();
      if (data.session) return data.session.user;
      const res = await sb.auth.signInAnonymously();
      if (res.error) throw res.error;
      return res.data.user;
    })();
    userP.catch(() => {
      userP = null;
    });
  }
  return userP;
}

async function ready() {
  const sb = await client();
  const user = await currentUser();
  return { sb, uid: user.id };
}

const must = ({ data, error }) => {
  if (error) throw error;
  return data;
};

// ---------- Profile and settings ----------

let profileCache = null;

export async function getProfile() {
  const { sb, uid } = await ready();
  if (!profileCache) {
    const row = must(await sb.from('profiles').select('id, display_name, settings').eq('id', uid).maybeSingle());
    profileCache = row || must(await sb.from('profiles').insert({ id: uid }).select().single());
  }
  return profileCache;
}

export async function updateProfile(patch) {
  const { sb, uid } = await ready();
  const current = await getProfile();
  const next = { ...patch };
  if (patch.settings) next.settings = { ...(current.settings || {}), ...patch.settings };
  profileCache = must(await sb.from('profiles').update(next).eq('id', uid).select().single());
  return profileCache;
}

/** Start the account quietly and keep settings in step with it. */
export async function initAccount() {
  const profile = await getProfile();
  const saved = profile.settings && profile.settings.lang;
  if (LANGS.includes(saved) && store.get('lang') == null) setLang(saved);
  else if (saved !== getLang()) updateProfile({ settings: { lang: getLang() } }).catch(() => {});
  onLangChange((lang) => updateProfile({ settings: { lang } }).catch(() => {}));
  return profile;
}

// ---------- Lists ----------

export async function myLists() {
  const { sb } = await ready();
  return must(
    await sb
      .from('lists')
      .select('id, name, emoji, is_shared, invite_code, owner_id, created_at, list_items(count), list_members(count)')
      .order('created_at', { ascending: true }),
  ).map((l) => ({
    ...l,
    itemCount: (l.list_items && l.list_items[0] && l.list_items[0].count) || 0,
    memberCount: (l.list_members && l.list_members[0] && l.list_members[0].count) || 1,
  }));
}

export async function createList({ name, emoji }) {
  const { sb, uid } = await ready();
  return must(
    await sb.from('lists').insert({ name, emoji: emoji || null, owner_id: uid }).select().single(),
  );
}

export async function updateList(id, patch) {
  const { sb } = await ready();
  return must(await sb.from('lists').update(patch).eq('id', id).select().single());
}

export async function deleteList(id) {
  const { sb } = await ready();
  must(await sb.from('lists').delete().eq('id', id));
}

export async function shareList(id) {
  return updateList(id, { is_shared: true });
}

export async function leaveList(id) {
  const { sb, uid } = await ready();
  must(await sb.from('list_members').delete().eq('list_id', id).eq('user_id', uid));
}

function chunks(arr, size = 100) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** One list with its items, members, watched marks and everyone's ratings. */
export async function getList(id) {
  const { sb, uid } = await ready();
  const list = must(await sb.from('lists').select('*').eq('id', id).maybeSingle());
  if (!list) return null;
  const [items, members] = await Promise.all([
    sb.from('list_items').select('*').eq('list_id', id).order('added_at', { ascending: false }).then(must),
    sb.from('list_members').select('user_id, role, joined_at').eq('list_id', id).then(must),
  ]);
  const memberIds = members.map((m) => m.user_id);
  const itemIds = items.map((i) => i.id);
  const tmdbIds = [...new Set(items.map((i) => i.tmdb_id))];

  const [profiles, watched, ratings] = await Promise.all([
    sb.from('profiles').select('id, display_name').in('id', memberIds).then(must),
    Promise.all(chunks(itemIds).map((ids) => sb.from('watched').select('item_id, user_id').in('item_id', ids).then(must))).then((r) => r.flat()),
    Promise.all(
      chunks(tmdbIds).map((ids) =>
        sb
          .from('ratings')
          .select('user_id, media_type, tmdb_id, rating, note, watched_on')
          .in('tmdb_id', ids)
          .in('user_id', memberIds)
          .then(must),
      ),
    ).then((r) => r.flat()),
  ]);

  const names = Object.fromEntries(profiles.map((p) => [p.id, p.display_name]));
  return {
    list,
    me: uid,
    isOwner: list.owner_id === uid,
    members: members.map((m) => ({ ...m, name: names[m.user_id] || null })),
    items,
    watched,
    ratings,
  };
}

// ---------- Items ----------

export async function addItem(listId, title) {
  const { sb, uid } = await ready();
  const row = {
    list_id: listId,
    media_type: title.media_type,
    tmdb_id: title.tmdb_id,
    title: title.title.slice(0, 300),
    original_title: (title.original_title || '').slice(0, 300) || null,
    original_language: title.original_language || null,
    poster_path: title.poster_path || null,
    release_date: title.release_date || null,
    meta: title.meta || {},
    added_by: uid,
  };
  return must(await sb.from('list_items').insert(row).select().single());
}

export async function removeItem(itemId) {
  const { sb } = await ready();
  must(await sb.from('list_items').delete().eq('id', itemId));
}

export async function setWatched(itemId, on) {
  const { sb, uid } = await ready();
  if (on) must(await sb.from('watched').upsert({ item_id: itemId, user_id: uid }, { onConflict: 'item_id,user_id' }));
  else must(await sb.from('watched').delete().eq('item_id', itemId).eq('user_id', uid));
}

// ---------- Ratings ----------

export async function myRatings() {
  const { sb, uid } = await ready();
  return must(await sb.from('ratings').select('*').eq('user_id', uid));
}

/** Save a rating, note or watched date; an empty one is removed. */
export async function saveRating(item, { rating, note, watched_on }) {
  const { sb, uid } = await ready();
  const empty = !rating && !(note && note.trim()) && !watched_on;
  if (empty) {
    must(
      await sb.from('ratings').delete().eq('user_id', uid).eq('media_type', item.media_type).eq('tmdb_id', item.tmdb_id),
    );
    return null;
  }
  return must(
    await sb
      .from('ratings')
      .upsert(
        {
          user_id: uid,
          media_type: item.media_type,
          tmdb_id: item.tmdb_id,
          rating: rating || null,
          note: (note || '').trim().slice(0, 1000) || null,
          watched_on: watched_on || null,
          title: item.title,
          poster_path: item.poster_path,
        },
        { onConflict: 'user_id,media_type,tmdb_id' },
      )
      .select()
      .single(),
  );
}

// ---------- Personal tags ----------

export async function myTags() {
  const { sb } = await ready();
  const [tags, links] = await Promise.all([
    sb.from('tags').select('id, name').order('name').then(must),
    sb.from('title_tags').select('tag_id, media_type, tmdb_id').then(must),
  ]);
  return { tags, links };
}

export async function createTag(name) {
  const { sb, uid } = await ready();
  return must(await sb.from('tags').insert({ name: name.trim().slice(0, 40), user_id: uid }).select().single());
}

export async function deleteTag(id) {
  const { sb } = await ready();
  must(await sb.from('tags').delete().eq('id', id));
}

export async function setTitleTag(tagId, item, on) {
  const { sb, uid } = await ready();
  const key = { tag_id: tagId, media_type: item.media_type, tmdb_id: item.tmdb_id };
  if (on) must(await sb.from('title_tags').upsert({ ...key, user_id: uid }, { onConflict: 'tag_id,media_type,tmdb_id' }));
  else must(await sb.from('title_tags').delete().match(key));
}

// ---------- Invites ----------

export async function invitePreview(code) {
  const { sb } = await ready();
  const rows = must(await sb.rpc('invite_preview', { code }));
  return rows && rows[0] ? rows[0] : null;
}

export async function joinList(code) {
  const { sb } = await ready();
  return must(await sb.rpc('join_list', { code }));
}

// ---------- Live updates ----------
// Supabase Realtime pushes every insert, update and delete on these tables to the
// people allowed to see them (Row Level Security still applies). The page calls
// onChange (bundled, at most a few times a second) and reloads what it shows.
// Polling every 20 seconds while the page is visible is the safety net in case the
// live connection drops or a network blocks it.

/**
 * Keep a page up to date. `scope` is a list id, or null for the visitor's list overview.
 * Returns a function that stops listening.
 */
export function watchLive(scope, onChange) {
  let stopped = false;
  let channel = null;
  let timer = null;
  let poll = null;
  const fire = () => {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(() => !stopped && onChange(), 250);
  };
  (async () => {
    try {
      const { sb } = await ready();
      const { data } = await sb.auth.getSession();
      if (data.session && sb.realtime && sb.realtime.setAuth) sb.realtime.setAuth(data.session.access_token);
      if (stopped) return;
      const pg = (table, filter) => ({ event: '*', schema: 'public', table, ...(filter ? { filter } : {}) });
      channel = sb.channel(`live-${scope || 'lists'}-${Math.random().toString(36).slice(2, 8)}`);
      if (scope) {
        channel
          .on('postgres_changes', pg('list_items', `list_id=eq.${scope}`), fire)
          .on('postgres_changes', pg('list_members', `list_id=eq.${scope}`), fire)
          .on('postgres_changes', pg('lists', `id=eq.${scope}`), fire)
          .on('postgres_changes', pg('watched'), fire)
          .on('postgres_changes', pg('ratings'), fire);
      } else {
        channel
          .on('postgres_changes', pg('lists'), fire)
          .on('postgres_changes', pg('list_members'), fire)
          .on('postgres_changes', pg('list_items'), fire);
      }
      channel.subscribe();
    } catch (err) {
      console.warn('Live updates unavailable', err);
    }
  })();
  poll = setInterval(() => {
    if (!stopped && document.visibilityState === 'visible') onChange();
  }, 20000);
  const onVisible = () => document.visibilityState === 'visible' && fire();
  document.addEventListener('visibilitychange', onVisible);
  return async () => {
    stopped = true;
    clearTimeout(timer);
    clearInterval(poll);
    document.removeEventListener('visibilitychange', onVisible);
    if (channel) {
      try {
        const sb = await client();
        await sb.removeChannel(channel);
      } catch {
        /* already gone */
      }
    }
  };

// ---------- Games: results, streaks, challenge links ----------

export async function saveResult({ game, mode, puzzleKey, won, score, hintUsed = false, detail = {} }) {
  const { sb, uid } = await ready();
  const row = {
    user_id: uid,
    game,
    mode,
    puzzle_key: String(puzzleKey).slice(0, 80),
    won,
    score: score ?? null,
    hint_used: hintUsed,
    detail,
  };
  const { data, error } = await sb.from('game_results').insert(row).select().single();
  // A daily result already saved (another tab or device) is fine
  if (error && error.code !== '23505') throw error;
  return data || null;
}

export async function myResults(game, limit = 400) {
  const { sb } = await ready();
  return must(
    await sb
      .from('game_results')
      .select('mode, puzzle_key, won, score, hint_used, detail, created_at')
      .eq('game', game)
      .order('created_at', { ascending: false })
      .limit(limit),
  );
}

export async function createChallenge(game, puzzle, result) {
  const { sb, uid } = await ready();
  const ch = must(await sb.from('challenges').insert({ game, puzzle, created_by: uid }).select('id').single());
  if (result) {
    await sb.from('challenge_results').insert({
      challenge_id: ch.id,
      user_id: uid,
      won: result.won,
      score: result.score ?? null,
      hint_used: Boolean(result.hintUsed),
    });
  }
  return ch.id;
}

export async function getChallenge(id) {
  const { sb } = await ready();
  const rows = must(await sb.rpc('get_challenge', { cid: id }));
  return rows && rows[0] ? rows[0] : null;
}

export async function saveChallengeResult(id, { won, score, hintUsed }) {
  const { sb, uid } = await ready();
  const { error } = await sb
    .from('challenge_results')
    .insert({ challenge_id: id, user_id: uid, won, score: score ?? null, hint_used: Boolean(hintUsed) });
  if (error && error.code !== '23505') throw error;
}

export async function challengeBoard(id) {
  const { sb, uid } = await ready();
  const rows = must(await sb.rpc('challenge_board', { cid: id }));
  return rows.map((r) => ({ ...r, me: r.user_id === uid }));
}
