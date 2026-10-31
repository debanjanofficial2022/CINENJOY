// Shared pieces for the games: daily numbering, seeded shuffles, the on-screen
// keyboard, streak stats, sharing and challenge links.
import { t } from '../i18n.js';
import * as db from '../data.js';
import * as tmdb from '../tmdb.js';
import { esc, el, toast } from '../ui.js';
import { track } from '../loading.js';

/** Today's date where the player is, as YYYY-MM-DD: the daily puzzle changes at local midnight. */
export function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Puzzle #1 is 31 October 2026, the day the games opened. */
export function dayNumber(key = todayKey()) {
  const [y, m, d] = key.split('-').map(Number);
  return Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(2026, 9, 31)) / 86400000) + 1;
}

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Small seeded random number generator (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function msToMidnight() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next - now;
}

export function fmtCountdown(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function fmtTime(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---------- Local game state (so a refresh keeps your progress) ----------

export function loadState(key) {
  try {
    return JSON.parse(localStorage.getItem(`cinenjoy:game:${key}`) || 'null');
  } catch {
    return null;
  }
}

export function saveState(key, state) {
  try {
    localStorage.setItem(`cinenjoy:game:${key}`, JSON.stringify(state));
  } catch {
    /* storage unavailable */
  }
}

// ---------- On-screen keyboard ----------

const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', '⏎ZXCVBNM⌫'];

/** onKey receives 'A'..'Z', 'ENTER' or 'BACK'. */
export function keyboard(onKey, { enter = true } = {}) {
  const box = el(`<div class="kb" role="group" aria-label="${esc(t('games.keyboard'))}"></div>`);
  const keys = {};
  for (const row of ROWS) {
    const r = el('<div class="kb-row"></div>');
    for (const ch of row) {
      if (ch === '⏎' && !enter) continue;
      const name = ch === '⏎' ? 'ENTER' : ch === '⌫' ? 'BACK' : ch;
      const label = ch === '⏎' ? t('games.enter') : ch === '⌫' ? '⌫' : ch;
      const b = el(
        `<button type="button" class="kb-key${name.length > 1 ? ' kb-wide' : ''}" data-key="${name}" aria-label="${esc(
          name === 'BACK' ? t('games.backspace') : label,
        )}">${esc(label)}</button>`,
      );
      b.addEventListener('click', () => onKey(name));
      keys[name] = b;
      r.append(b);
    }
    box.append(r);
  }
  const rank = { absent: 1, present: 2, correct: 3 };
  box.mark = (letter, state) => {
    const b = keys[letter];
    if (!b) return;
    if ((rank[state] || 0) > (rank[b.dataset.state] || 0)) b.dataset.state = state;
  };
  box.reset = () => Object.values(keys).forEach((b) => delete b.dataset.state);
  return box;
}

/** Physical keyboard, only while `node` is on the page. */
export function listenKeys(node, onKey) {
  const handler = (e) => {
    if (!node.isConnected) {
      document.removeEventListener('keydown', handler);
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('.sheet-wrap')) return;
    const tag = (e.target && e.target.tagName) || '';
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
    if (e.key === 'Enter') onKey('ENTER', e);
    else if (e.key === 'Backspace') onKey('BACK', e);
    else if (/^[a-zA-Z]$/.test(e.key)) onKey(e.key.toUpperCase(), e);
    else if (e.key.startsWith('Arrow') || e.key === ' ' || e.key === 'Tab') onKey(e.key, e);
    else return;
    e.preventDefault();
  };
  document.addEventListener('keydown', handler);
}

// ---------- Stats and streaks (daily games) ----------

export function stats(results, maxGuesses = 6) {
  const daily = results.filter((r) => r.mode === 'daily');
  const byDay = new Map(daily.map((r) => [r.puzzle_key, r]));
  const played = byDay.size;
  const wins = [...byDay.values()].filter((r) => r.won).length;
  const dist = Array.from({ length: maxGuesses }, () => 0);
  for (const r of byDay.values()) if (r.won && r.score >= 1 && r.score <= maxGuesses) dist[r.score - 1] += 1;

  // Current streak: consecutive won days ending today (or yesterday, if today is not played yet)
  const dayStep = (key, n) => {
    const [y, m, d] = key.split('-').map(Number);
    return todayKey(new Date(y, m - 1, d + n));
  };
  let streak = 0;
  let day = todayKey();
  if (!byDay.has(day)) day = dayStep(day, -1);
  while (byDay.get(day) && byDay.get(day).won) {
    streak += 1;
    day = dayStep(day, -1);
  }
  let best = 0;
  let run = 0;
  const keys = [...byDay.keys()].sort();
  let prev = null;
  for (const k of keys) {
    const r = byDay.get(k);
    if (r.won && prev && dayStep(prev, 1) === k && byDay.get(prev).won) run += 1;
    else run = r.won ? 1 : 0;
    best = Math.max(best, run);
    prev = k;
  }
  return { played, wins, winPct: played ? Math.round((wins / played) * 100) : 0, streak, best, dist };
}

export function statsHtml(s, { distLabel = true } = {}) {
  const max = Math.max(1, ...s.dist);
  return `<div class="stats">
    <div class="stat"><b>${s.played}</b><span>${esc(t('games.played'))}</span></div>
    <div class="stat"><b>${s.winPct}</b><span>${esc(t('games.winPct'))}</span></div>
    <div class="stat"><b>${s.streak}</b><span>${esc(t('games.streak'))}</span></div>
    <div class="stat"><b>${s.best}</b><span>${esc(t('games.bestStreak'))}</span></div>
  </div>
  ${
    distLabel
      ? `<div class="dist" aria-label="${esc(t('games.distribution'))}">${s.dist
          .map(
            (n, i) =>
              `<div class="dist-row"><span>${i + 1}</span><span class="dist-bar" style="width:${Math.max(8, (n / max) * 100)}%">${n}</span></div>`,
          )
          .join('')}</div>`
      : ''
  }`;
}

// ---------- Sharing and challenges ----------

export async function share(text, url) {
  const full = url ? `${text}\n${url}` : text;
  if (navigator.share) {
    try {
      await navigator.share({ text: full });
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(full);
    toast(t('games.copied'));
  } catch {
    toast(t('errors.generic'), 'error');
  }
}

export const challengeUrl = (game, id) => `${location.origin}/games/${game}/c/${id}`;

export function boardHtml(rows, fmtScore) {
  if (!rows.length) return '';
  return `<div class="board-list"><p class="label">${esc(t('games.challengeBoard'))}</p>${rows
    .map(
      (r, i) => `<div class="board-row${r.me ? ' is-me' : ''}">
        <span class="board-rank">${i + 1}</span>
        <span class="board-name">${esc(r.me ? t('wl.you') : r.name || t('wl.friend'))}</span>
        <span class="board-score">${esc(r.won ? fmtScore(r) : '✕')}${r.hint_used ? ' 💡' : ''}</span>
      </div>`,
    )
    .join('')}</div>`;
}

/** Ask for a name (once) so friends recognise you on challenge boards. */
export async function ensureName() {
  const profile = await db.getProfile();
  return profile.display_name || null;
}

// ---------- After a game: the title itself ----------

/** A card for the answer, with "Add to my watchlist". */
export function titleCard(entry) {
  const card = el(`
    <div class="answer-card">
      <span class="thumb thumb-lg"></span>
      <div>
        <p class="label">${esc(t('games.theAnswer'))}</p>
        <h3 class="answer-title"></h3>
        <p class="pc-meta answer-meta"></p>
        <button type="button" class="btn btn-small" data-add>+ ${esc(t('games.addToWatchlist'))}</button>
      </div>
    </div>`);
  card.querySelector('.answer-title').textContent = entry.label || entry.w;
  const meta = [entry.y, entry.medium ? t(`medium.${entry.medium}`) : '', entry.d].filter(Boolean).join(' · ');
  card.querySelector('.answer-meta').textContent = meta;
  // Poster and the title in the site language
  tmdb
    .details(entry.mt, entry.id)
    .then((full) => {
      card._full = full;
      const img = tmdb.poster(full.poster_path, 'w185');
      if (img) card.querySelector('.thumb').innerHTML = `<img src="${esc(img)}" alt="" />`;
      card.querySelector('.answer-title').textContent = tmdb.displayTitle(full);
    })
    .catch(() => {});
  const btn = card.querySelector('[data-add]');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      const full = card._full || (await tmdb.details(entry.mt, entry.id));
      const lists = await db.myLists();
      let list = lists[0];
      if (!list) list = await db.createList({ name: t('wl.defaultName'), emoji: '🎬' });
      await track(db.addItem(list.id, full));
      btn.textContent = `✓ ${t('wl.added')}`;
      toast(t('wl.addedToast', { list: list.name }));
    } catch (err) {
      if (err && err.code === '23505') {
        btn.textContent = `✓ ${t('wl.added')}`;
        return;
      }
      console.warn(err);
      btn.disabled = false;
      toast(t('errors.generic'), 'error');
    }
  });
  return card;
}
