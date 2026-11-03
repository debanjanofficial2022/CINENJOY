// Poster Reveal: a friend-room race. A poster appears tile by tile; the first
// right guess takes the round, and the earlier it comes, the more it scores.
import { t } from '../i18n.js';
import * as db from '../data.js';
import * as tmdb from '../tmdb.js';
import { track } from '../loading.js';
import { esc, el, toast } from '../ui.js';
import { FRAMES } from './frame-data.js';
import { hashString, rng, shuffle } from './common.js';
import { titlePicker } from './picker.js';
import { roomHome, roomJoin, liveGame } from './roomkit.js';

const PATH = '/games/poster';
const ROUNDS = 8;
const SECONDS = 25;
const COLS = 6;
const ROWS = 9;

export const posterHome = () =>
  roomHome({ kind: 'poster', name: t('pr.name'), lead: t('pr.lead'), rules: [t('pr.rule1'), t('pr.rule2'), t('pr.rule3')], path: PATH });
export const posterJoin = (code) => roomJoin(PATH, code);

const points = (ms) => 300 + Math.round(700 * Math.max(0, 1 - ms / (SECONDS * 1000)));

async function makeItems() {
  const pool = shuffle(FRAMES.map((_, i) => i).filter((i) => Number(FRAMES[i][3]) < 2026), rng(Date.now() >>> 0)).slice(0, ROUNDS + 4);
  const items = [];
  for (const i of pool) {
    if (items.length >= ROUNDS) break;
    const [tv, id, title, year] = FRAMES[i];
    const mt = tv ? 'tv' : 'movie';
    const d = await tmdb.details(mt, id).catch(() => null);
    if (d && d.poster_path) items.push({ mt, id, title, year, poster: d.poster_path });
  }
  return items;
}

export function posterRoom(roomId) {
  const node = document.createElement('section');
  node.className = 'page game poster';
  const head = el('<header class="game-head"></header>');
  const body = el('<div class="imp-body"><div class="loading-box"><span class="spinner"></span></div></div>');
  node.append(head, body);
  let shown = '';
  let timer = null;
  let hostTimer = null;
  let lockUntil = 0;
  let savedGame = null;

  const g = liveGame(node, roomId, { onLoad: render, kinds: ['buzz'] });
  const { r } = g;
  const st = () => r.room.state || {};
  const isHost = () => r.room.host_id === r.uid;
  const rk = (q) => (st().round || 1) * 100 + q;
  const guesses = (q) => r.moves.filter((m) => m.kind === 'buzz' && m.round === rk(q));
  const winner = (q) => guesses(q).find((m) => m.data.right);

  function scores() {
    const s = new Map(r.people.map((p) => [p.user_id, 0]));
    for (let q = 0; q < (st().items || []).length; q += 1) {
      const w = winner(q);
      if (w) s.set(w.user_id, (s.get(w.user_id) || 0) + points(w.data.ms));
    }
    return s;
  }

  function tiles(seed, frac) {
    const order = shuffle(Array.from({ length: COLS * ROWS }, (_, i) => i), rng(hashString(seed)));
    const open = new Set(order.slice(0, Math.floor(frac * COLS * ROWS)));
    return Array.from({ length: COLS * ROWS }, (_, i) => `<span class="${open.has(i) ? 'open' : ''}"></span>`).join('');
  }

  function render() {
    if (!r.room) {
      body.innerHTML = `<div class="error-box"><p>${esc(t('mn.notFound'))}</p></div>`;
      return;
    }
    const s = st();
    head.innerHTML = `<a class="back" href="${PATH}" data-link>‹ ${esc(t('pr.name'))}</a>
      <div class="game-title-row"><h1>${esc(t('pr.name'))}</h1><span class="chip">${esc(t('quiz.room'))} · ${esc(r.room.code)}</span></div>`;
    if (!s.phase || s.phase === 'lobby') {
      shown = 'lobby';
      body.innerHTML = `<p class="lead">${esc(t('quiz.lobbyLead'))}</p>${g.lobbyHtml(PATH, r.people.length >= 2, t('quiz.startGame'), r.people.length < 2 ? t('pr.needTwo') : '')}`;
      g.wireCopy(body);
      const b = body.querySelector('[data-start]');
      if (b) b.addEventListener('click', () => start(b));
      return;
    }
    const item = s.items[s.q];
    if (s.phase === 'play') {
      const key = `play-${s.round}-${s.q}`;
      const w = winner(s.q);
      if (shown !== key) {
        shown = key;
        body.innerHTML = `<p class="label">${esc(t('quiz.qn', { i: s.q + 1, n: s.items.length }))}</p>
          <div class="pr-stage"><img src="${esc(tmdb.poster(item.poster, 'w500'))}" alt="" /><div class="pr-tiles" style="--cols:${COLS};--rows:${ROWS}"></div></div>
          <div class="frame-form pr-form"></div><p class="quiz-feedback" aria-live="polite"></p><ol class="frame-guesses pr-guesses"></ol>`;
        const picker = titlePicker(async (res) => {
          if (Date.now() < lockUntil) return toast(t('pr.wait'));
          const right = res.tmdb_id === item.id && res.media_type === item.mt;
          const ms = Math.min(Date.now() - s.startedAt, SECONDS * 1000);
          try {
            const { sb } = await db.supa();
            await sb.from('room_moves').insert({ room_id: roomId, user_id: r.uid, kind: 'buzz', round: rk(s.q), data: { right, ms, label: right ? '' : res.title.slice(0, 80) } });
            if (!right) {
              lockUntil = Date.now() + 3000;
              toast(t('pr.wrongWait'));
            }
            g.reload();
          } catch (err) {
            console.warn(err);
          }
        });
        body.querySelector('.pr-form').append(picker);
        clearInterval(timer);
        const tick = () => {
          if (!body.isConnected || shown !== key) return clearInterval(timer);
          const frac = Math.min(1, Math.max(0.04, (Date.now() - s.startedAt) / (SECONDS * 1000)));
          body.querySelector('.pr-tiles').innerHTML = tiles(`${roomId}-${key}`, frac);
        };
        tick();
        timer = setInterval(tick, 500);
      }
      body.querySelector('.pr-guesses').innerHTML = guesses(s.q)
        .map((m) => `<li class="${m.data.right ? 'ok' : 'bad'}">${m.data.right ? '🟩' : '🟥'} ${esc(g.nameOf(m.user_id))}${m.data.right ? '' : `: ${esc(m.data.label)}`}</li>`)
        .join('');
      if (w) body.querySelector('.quiz-feedback').textContent = t('pr.got', { name: g.plainName(w.user_id) });
    } else {
      shown = s.phase;
      clearInterval(timer);
      const w = s.phase === 'reveal' ? winner(s.q) : null;
      body.innerHTML = `${
        s.phase === 'reveal'
          ? `<div class="pr-reveal"><img src="${esc(tmdb.poster(item.poster, 'w342'))}" alt="" /><div><p class="label">${esc(t('play.theAnswer'))}</p><p class="result-head">${esc(item.title)} <span class="muted">${esc(item.year)}</span></p>
             <p>${esc(w ? t('pr.got', { name: g.plainName(w.user_id) }) : t('pr.nobody'))}</p></div></div>`
          : `<p class="result-head">${esc(t('quiz.final'))}</p>`
      }${g.scoreList(scores())}${s.phase === 'done' && isHost() ? `<button class="btn" type="button" data-again>${esc(t('play.playAgain'))}</button>` : ''}`;
      const again = body.querySelector('[data-again]');
      if (again) again.addEventListener('click', () => start(again));
      if (s.phase === 'done' && savedGame !== s.round) {
        savedGame = s.round;
        const sc = scores();
        const top = Math.max(...sc.values());
        db.saveResult({ game: 'poster', mode: 'practice', puzzleKey: `room-${roomId}-${s.round}`, won: sc.get(r.uid) === top && top > 0, score: sc.get(r.uid) || 0, detail: { room: roomId } }).catch(() => {});
      }
    }
    if (isHost()) hostTick();
  }

  async function start(btn) {
    btn.disabled = true;
    try {
      const items = await track(makeItems());
      await g.patch({ phase: 'play', items, q: 0, round: (st().round || 0) + 1, startedAt: Date.now() + 1000 });
    } catch (err) {
      console.warn(err);
      btn.disabled = false;
      toast(t('errors.generic'), 'error');
    }
  }

  function hostTick() {
    clearTimeout(hostTimer);
    const s = st();
    if (!node.isConnected) return;
    if (s.phase === 'play') {
      if (winner(s.q) || Date.now() > s.startedAt + SECONDS * 1000 + 1500) {
        g.patch({ phase: 'reveal', revealAt: Date.now() });
        return;
      }
      hostTimer = setTimeout(hostTick, 700);
    } else if (s.phase === 'reveal') {
      const wait = 3500 - (Date.now() - (s.revealAt || 0));
      if (wait > 0) {
        hostTimer = setTimeout(hostTick, wait);
        return;
      }
      g.patch(s.q + 1 >= s.items.length ? { phase: 'done' } : { phase: 'play', q: s.q + 1, startedAt: Date.now() + 800 });
    }
  }

  return node;
}
