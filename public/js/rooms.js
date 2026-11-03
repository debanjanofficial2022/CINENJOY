// Friend rooms: private rooms joined with a code or invite link, with live
// updates (Supabase Realtime), who is online (presence), quick messages
// between players (broadcast) and a word filter on names and typed text.
import { supa, getProfile, updateProfile } from './data.js';
import { t } from './i18n.js';
import { prompt } from './ui.js';

const must = ({ data, error }) => {
  if (error) throw error;
  return data;
};

export async function createRoom(kind, { title, state = {} } = {}) {
  const { sb, uid } = await supa();
  return must(await sb.from('rooms').insert({ kind, title: title || null, state, host_id: uid }).select().single());
}

export async function joinRoom(code) {
  const { sb } = await supa();
  return must(await sb.rpc('join_room', { code }));
}

export async function getRoom(id) {
  const { sb } = await supa();
  return must(await sb.from('rooms').select('*').eq('id', id).maybeSingle());
}

export async function myRooms(kind) {
  const { sb } = await supa();
  return must(
    await sb.from('rooms').select('id, code, title, kind, state, closed, host_id, created_at').eq('kind', kind).order('created_at', { ascending: false }).limit(30),
  );
}

export async function roomPeople(id) {
  const { sb, uid } = await supa();
  const rows = must(await sb.rpc('room_people', { rid: id }));
  return rows.map((r) => ({ ...r, name: clean(r.name || ''), me: r.user_id === uid }));
}

/** Merge a change into the room's shared state. */
export async function patchRoom(id, patch, { replaceState = false } = {}) {
  const { sb } = await supa();
  const room = must(await sb.from('rooms').select('state').eq('id', id).single());
  const state = replaceState ? patch.state : { ...(room.state || {}), ...(patch.state || {}) };
  const row = { ...patch, state };
  return must(await sb.from('rooms').update(row).eq('id', id).select().single());
}

export async function leaveRoom(id) {
  const { sb, uid } = await supa();
  must(await sb.from('room_members').delete().eq('room_id', id).eq('user_id', uid));
}

export async function reportRoom(id, reason) {
  const { sb, uid } = await supa();
  must(await sb.from('room_reports').insert({ room_id: id, reporter: uid, reason: String(reason || '').slice(0, 500) }));
}

export async function me() {
  const { uid } = await supa();
  return uid;
}

/** Ask for a name once so friends know who you are. */
export async function ensureRoomName() {
  const profile = await getProfile();
  if (profile.display_name) return profile.display_name;
  const name = await prompt({ title: t('wl.yourName'), label: t('wl.personName'), max: 30 });
  if (!name) return null;
  const nice = clean(name).slice(0, 30);
  await updateProfile({ display_name: nice });
  return nice;
}

// ---------- Live room: database changes, who is online, messages ----------

/**
 * Listen to one room. Calls onChange() when its data changes, onPresence(userIds)
 * when people come and go, and onMessage(type, payload) for broadcast messages.
 * Returns { send(type, payload), stop() }.
 */
export function liveRoom(id, { tables = [], onChange, onPresence, onMessage } = {}) {
  let stopped = false;
  let channel = null;
  let timer = null;
  const fire = () => {
    if (stopped || !onChange) return;
    clearTimeout(timer);
    timer = setTimeout(() => !stopped && onChange(), 200);
  };
  const ready = (async () => {
    const { sb, uid } = await supa();
    const { data } = await sb.auth.getSession();
    if (data.session && sb.realtime && sb.realtime.setAuth) sb.realtime.setAuth(data.session.access_token);
    channel = sb.channel(`room-${id}`, { config: { presence: { key: uid }, broadcast: { self: false } } });
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${id}` }, fire);
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${id}` }, fire);
    for (const table of tables) channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `room_id=eq.${id}` }, fire);
    channel.on('presence', { event: 'sync' }, () => {
      if (onPresence) onPresence(Object.keys(channel.presenceState()));
    });
    channel.on('broadcast', { event: 'msg' }, ({ payload }) => {
      if (onMessage && payload) onMessage(payload.type, payload.data, payload.from);
    });
    await new Promise((resolve) => {
      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ at: Date.now() });
          resolve();
        }
      });
      setTimeout(resolve, 5000);
    });
    return uid;
  })().catch((err) => console.warn('Live room unavailable', err));

  // Safety net if the live connection drops
  const poll = setInterval(() => document.visibilityState === 'visible' && fire(), 15000);
  return {
    ready,
    async send(type, data) {
      const uid = await ready;
      if (channel) await channel.send({ type: 'broadcast', event: 'msg', payload: { type, data, from: uid } });
    },
    async stop() {
      stopped = true;
      clearInterval(poll);
      clearTimeout(timer);
      if (channel) {
        try {
          const { sb } = await supa();
          await sb.removeChannel(channel);
        } catch {
          /* already closed */
        }
      }
    },
  };
}

/** Stops a live room once its page is gone. */
export function whilePresent(node, live) {
  const check = setInterval(() => {
    if (!node.isConnected) {
      clearInterval(check);
      live.stop();
    }
  }, 1500);
}

// ---------- Word filter (names, guesses, chat) ----------

// Common slurs and strong swear words in the site languages. Matching is on
// whole words after removing accents and look-alike characters.
const BLOCK = [
  'fuck', 'fucking', 'fucker', 'motherfucker', 'shit', 'bitch', 'cunt', 'dick', 'cock', 'pussy', 'asshole', 'bastard',
  'whore', 'slut', 'nigger', 'nigga', 'faggot', 'fag', 'retard', 'chink', 'spic', 'kike', 'wetback', 'tranny', 'rape', 'rapist',
  'puta', 'puto', 'mierda', 'cabron', 'cabrón', 'pendejo', 'coño', 'maricon', 'maricón', 'gilipollas', 'hijueputa', 'verga', 'culero', 'zorra',
  '傻逼', '操你妈', '妈的', '他妈的', '婊子', '贱人', '混蛋', '王八蛋', '去死', '鸡巴', '屌',
];
const FOLD = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i' };
const fold = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[013457@$!]/g, (c) => FOLD[c] || c);
const BLOCK_FOLDED = BLOCK.map(fold);

export function isRude(text) {
  const f = fold(text);
  return BLOCK_FOLDED.some((w) => (/[㐀-鿿]/.test(w) ? f.includes(w) : new RegExp(`(^|[^a-z])${w}([^a-z]|$)`).test(f)));
}

/** Replace blocked words with ★★★ */
export function clean(text) {
  let out = String(text || '');
  for (let i = 0; i < BLOCK.length; i += 1) {
    const w = BLOCK[i];
    if (/[㐀-鿿]/.test(w)) out = out.split(w).join('★'.repeat(w.length));
  }
  return out
    .split(/(\s+)/)
    .map((part) => (part.trim() && isRude(part) ? '★'.repeat(Math.min(part.length, 6)) : part))
    .join('');
}
