// CinePictionary: a friend-room drawing game. Each player takes a turn to draw
// a secret title; the others race to guess it. The database deals the title
// and checks guesses (supabase/pictionary.sql). Strokes travel as live
// messages, so the drawing is never stored.
import { t } from '../i18n.js';
import * as db from '../data.js';
import { track } from '../loading.js';
import { esc, el, toast } from '../ui.js';
import { FRAMES } from './frame-data.js';
import { titlePicker } from './picker.js';
import { roomHome, roomJoin, liveGame } from './roomkit.js';

const PATH = '/games/pictionary';
const SECONDS = 80;
const COLORS = ['#f5ecd9', '#f2c25a', '#e0525e', '#4caf6a', '#5aa9f2', '#b07cf2'];

export const pictionaryHome = () =>
  roomHome({ kind: 'pictionary', name: 'CinePictionary', lead: t('px.lead'), rules: [t('px.rule1'), t('px.rule2'), t('px.rule3')], path: PATH });
export const pictionaryJoin = (code) => roomJoin(PATH, code);

function options() {
  const pool = FRAMES.filter((f) => Number(f[3]) < 2026).map(([tv, id, title, year]) => ({ mt: tv ? 'tv' : 'movie', id, title, year }));
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 40);
}

export function pictionaryRoom(roomId) {
  const node = document.createElement('section');
  node.className = 'page game pictionary';
  const head = el('<header class="game-head"></header>');
  const body = el('<div class="imp-body"><div class="loading-box"><span class="spinner"></span></div></div>');
  node.append(head, body);
  let strokes = [];
  let card = null;
  let cardRound = null;
  let answer = null;
  let shown = '';
  let hostTimer = null;
  let clock = null;
  let savedGame = null;
  let canvas = null;

  const g = liveGame(node, roomId, {
    onLoad: load,
    kinds: ['pguess'],
    onMessage(type, data) {
      if (type === 'stroke' && data && Array.isArray(data.p)) {
        strokes.push(data);
        paint();
      } else if (type === 'clear') {
        strokes = [];
        paint();
      } else if (type === 'sync?' && card && card.role === 'drawer') g.send('sync', { round: st().round, strokes });
      else if (type === 'sync' && data && data.round === st().round && card && card.role !== 'drawer' && data.strokes.length > strokes.length) {
        strokes = data.strokes;
        paint();
      }
    },
  });
  const { r } = g;
  const st = () => r.room.state || {};
  const isHost = () => r.room.host_id === r.uid;
  const turnMoves = (round) => r.moves.filter((m) => m.round === round);

  function scores() {
    const s = new Map(r.people.map((p) => [p.user_id, 0]));
    for (const turn of st().turns || []) {
      const right = turnMoves(turn.round).filter((m) => m.data.right);
      right.forEach((m, i) => s.set(m.user_id, (s.get(m.user_id) || 0) + Math.max(50, 150 - 25 * i)));
      s.set(turn.drawer, (s.get(turn.drawer) || 0) + 50 * right.length);
    }
    return s;
  }

  async function load() {
    if (!r.room) {
      body.innerHTML = `<div class="error-box"><p>${esc(t('mn.notFound'))}</p></div>`;
      return;
    }
    const s = st();
    const { sb } = await db.supa();
    if (s.round && cardRound !== s.round) {
      const { data } = await sb.from('room_secrets').select('data').eq('room_id', roomId).eq('round', s.round).maybeSingle();
      card = data ? data.data : null;
      cardRound = s.round;
      answer = null;
      strokes = [];
      if (card && card.role !== 'drawer') g.send('sync?', {});
    }
    if ((s.phase === 'reveal' || s.phase === 'done') && s.round && (!answer || answer.round !== s.round)) {
      const { data } = await sb.rpc('reveal_answer', { rid: roomId, rnd: s.round });
      answer = data ? { ...data, round: s.round } : null;
    }
    render();
  }

  function paint() {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = '#120a0c';
    ctx.fillRect(0, 0, w, h);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const s of strokes) {
      ctx.strokeStyle = COLORS[s.c] || COLORS[0];
      ctx.lineWidth = (s.w || 4) * (w / 600);
      ctx.beginPath();
      s.p.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)));
      if (s.p.length === 1) ctx.lineTo(s.p[0][0] * w + 0.1, s.p[0][1] * h);
      ctx.stroke();
    }
  }

  function setupCanvas(drawer) {
    canvas = body.querySelector('canvas');
    const fit = () => {
      const box = canvas.getBoundingClientRect();
      canvas.width = Math.round(box.width * (window.devicePixelRatio || 1));
      canvas.height = Math.round(box.width * 0.75 * (window.devicePixelRatio || 1));
      paint();
    };
    fit();
    if (!drawer) return;
    let color = 0;
    let current = null;
    const pos = (e) => {
      const b = canvas.getBoundingClientRect();
      return [Math.round(((e.clientX - b.left) / b.width) * 1000) / 1000, Math.round(((e.clientY - b.top) / b.height) * 1000) / 1000];
    };
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      current = { c: color, w: 5, p: [pos(e)] };
      strokes.push(current);
      paint();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!current) return;
      current.p.push(pos(e));
      paint();
    });
    const end = () => {
      if (!current) return;
      g.send('stroke', current);
      current = null;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    body.querySelectorAll('[data-color]').forEach((b) =>
      b.addEventListener('click', () => {
        color = Number(b.dataset.color);
        body.querySelectorAll('[data-color]').forEach((x) => x.classList.toggle('on', x === b));
      }),
    );
    body.querySelector('[data-clear]').addEventListener('click', () => {
      strokes = [];
      paint();
      g.send('clear', {});
    });
    body.querySelector('[data-undo]').addEventListener('click', () => {
      strokes.pop();
      paint();
      g.send('clear', {});
      strokes.forEach((s) => g.send('stroke', s));
    });
  }

  function render() {
    const s = st();
    head.innerHTML = `<a class="back" href="${PATH}" data-link>‹ CinePictionary</a>
      <div class="game-title-row"><h1>CinePictionary</h1><span class="chip">${esc(t('quiz.room'))} · ${esc(r.room.code)}</span></div>`;
    if (!s.phase || s.phase === 'lobby') {
      shown = 'lobby';
      canvas = null;
      body.innerHTML = `<p class="lead">${esc(t('quiz.lobbyLead'))}</p>${g.lobbyHtml(PATH, r.people.length >= 2, t('quiz.startGame'), r.people.length < 2 ? t('pr.needTwo') : '')}`;
      g.wireCopy(body);
      const b = body.querySelector('[data-start]');
      if (b) b.addEventListener('click', () => startGame(b));
      return;
    }
    const turn = (s.turns || [])[s.turnIndex] || {};
    const drawer = turn.drawer === r.uid;
    const mine = turnMoves(s.round).filter((m) => m.user_id === r.uid);
    const solved = mine.some((m) => m.data.right);
    if (s.phase === 'draw') {
      const key = `draw-${s.round}`;
      if (shown !== key) {
        shown = key;
        body.innerHTML = `<div class="px-top"><span class="chip">${esc(t('px.turn', { i: s.turnIndex + 1, n: s.turns.length }))}</span><span class="quiz-time" data-time></span></div>
          <p class="imp-step">${drawer && card ? esc(t('px.drawThis', { title: card.title.title })) : esc(t('px.guessThis', { name: g.plainName(turn.drawer) }))}</p>
          <canvas class="px-canvas" aria-label="${esc(t('px.canvas'))}"></canvas>
          ${drawer ? `<div class="px-tools">${COLORS.map((c, i) => `<button type="button" class="px-color${i === 0 ? ' on' : ''}" data-color="${i}" style="--c:${c}" aria-label="${esc(t('px.color'))} ${i + 1}"></button>`).join('')}
            <button type="button" class="btn btn-ghost btn-small" data-undo>↶ ${esc(t('dg.undo'))}</button><button type="button" class="btn btn-ghost btn-small" data-clear>${esc(t('px.clear'))}</button></div>
            <p class="muted">${esc(t('px.noLetters'))}</p>` : '<div class="frame-form px-guess"></div>'}
          <ol class="frame-guesses px-log"></ol>`;
        setupCanvas(drawer);
        if (!drawer) {
          const picker = titlePicker(async (res) => {
            try {
              const { sb } = await db.supa();
              const { data, error } = await sb.rpc('pictionary_guess', { rid: roomId, rnd: s.round, mt: res.media_type, tid: res.tmdb_id, label: res.title });
              if (error) throw error;
              toast(data ? t('quiz.right') : t('fg.notIt'));
              g.reload();
            } catch (err) {
              console.warn(err);
              toast(t('errors.generic'), 'error');
            }
          });
          body.querySelector('.px-guess').append(picker);
        }
        clearInterval(clock);
        clock = setInterval(() => {
          const el2 = body.querySelector('[data-time]');
          if (!el2 || shown !== key) return clearInterval(clock);
          el2.textContent = `${Math.max(0, Math.ceil((s.startedAt + SECONDS * 1000 - Date.now()) / 1000))}s`;
        }, 500);
      }
      const form = body.querySelector('.px-guess');
      if (form) form.hidden = solved;
      body.querySelector('.px-log').innerHTML = turnMoves(s.round)
        .map((m) => `<li class="${m.data.right ? 'ok' : 'bad'}">${m.data.right ? `🟩 ${esc(t('px.gotIt', { name: g.nameOf(m.user_id) }))}` : `🟥 ${esc(g.nameOf(m.user_id))}: ${esc(m.data.label || '')}`}</li>`)
        .join('');
    } else {
      shown = s.phase;
      canvas = null;
      clearInterval(clock);
      body.innerHTML = `${
        s.phase === 'reveal' && answer
          ? `<p class="label">${esc(t('play.theAnswer'))}</p><p class="result-head">${esc(answer.title.title)} <span class="muted">${esc(answer.title.year)}</span></p>
             <p class="muted">${esc(t('px.solvedBy', { n: turnMoves(s.round).filter((m) => m.data.right).length }))}</p>`
          : `<p class="result-head">${esc(t('quiz.final'))}</p>`
      }${g.scoreList(scores())}${s.phase === 'done' && isHost() ? `<button class="btn" type="button" data-again>${esc(t('play.playAgain'))}</button>` : ''}`;
      const again = body.querySelector('[data-again]');
      if (again) again.addEventListener('click', () => startGame(again));
      if (s.phase === 'done' && savedGame !== s.game) {
        savedGame = s.game;
        const sc = scores();
        const top = Math.max(...sc.values());
        db.saveResult({ game: 'pictionary', mode: 'practice', puzzleKey: `room-${roomId}-${s.game}`, won: sc.get(r.uid) === top && top > 0, score: sc.get(r.uid) || 0, detail: { room: roomId } }).catch(() => {});
      }
    }
    if (isHost()) hostTick();
  }

  let dealing = false;
  async function deal(turnIndex, turns, game) {
    if (dealing) return;
    dealing = true;
    try {
      await dealNow(turnIndex, turns, game);
    } finally {
      dealing = false;
    }
  }
  async function dealNow(turnIndex, turns, game) {
    const { sb } = await db.supa();
    const round = (st().round || 0) + 1;
    const { error } = await sb.rpc('deal_word', { rid: roomId, rnd: round, drawer: turns[turnIndex].drawer, options: options() });
    if (error) throw error;
    turns[turnIndex].round = round;
    await g.patch({ phase: 'draw', round, turnIndex, turns, game, startedAt: Date.now() + 1000 });
  }

  async function startGame(btn) {
    btn.disabled = true;
    try {
      const turns = r.people.map((p) => ({ drawer: p.user_id }));
      await track(deal(0, turns, (st().game || 0) + 1));
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
    if (s.phase === 'draw') {
      const guessers = r.people.filter((p) => p.user_id !== s.turns[s.turnIndex].drawer).length;
      const right = turnMoves(s.round).filter((m) => m.data.right).length;
      if ((guessers && right >= guessers) || Date.now() > s.startedAt + SECONDS * 1000 + 1000) {
        g.patch({ phase: 'reveal', revealAt: Date.now() });
        return;
      }
      hostTimer = setTimeout(hostTick, 1000);
    } else if (s.phase === 'reveal') {
      const wait = 4000 - (Date.now() - (s.revealAt || 0));
      if (wait > 0) {
        hostTimer = setTimeout(hostTick, wait);
        return;
      }
      const nextTurn = s.turnIndex + 1;
      if (nextTurn >= s.turns.length) g.patch({ phase: 'done' });
      else deal(nextTurn, s.turns.slice(), s.game).catch((err) => console.warn(err));
    }
  }

  return node;
}
