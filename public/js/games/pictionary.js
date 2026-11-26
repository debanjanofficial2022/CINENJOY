// CinePictionary: a friend-room drawing game laid out like the classic online
// draw-and-guess games: players and scores on the left, the board in the
// middle with the hidden title above it, and a chat on the right where you
// type your guesses.
//
// The database (supabase/pictionary2.sql) deals three titles to the drawer,
// starts the clock when one is picked, reveals hint letters, and checks every
// chat message against the answer, so nobody can read the answer early.
// Strokes travel as live messages while they are drawn and are never stored.
import { t } from '../i18n.js';
import * as db from '../data.js';
import { track } from '../loading.js';
import { esc, el, toast } from '../ui.js';
import { FRAMES } from './frame-data.js';
import { roomHome, roomJoin, liveGame, botsOffer } from './roomkit.js';

const PATH = '/games/pictionary';
const CHOOSE_SECONDS = 15;
const REVEAL_SECONDS = 5;
const BG = '#ffffff';
// Two rows of colours, light on top, dark below
const PALETTE = [
  '#ffffff', '#c1c1c1', '#ef130b', '#ff7100', '#ffe400', '#00cc00', '#00ff91', '#00b2ff', '#231fd3', '#a300ba', '#df69a7', '#ffac8e', '#a0522d',
  '#000000', '#505050', '#740b07', '#c23800', '#e8a200', '#004619', '#00785d', '#00569e', '#0e0865', '#550069', '#873554', '#cc774d', '#63300d',
];
const SIZES = [4, 10, 20, 36]; // brush widths on a board 1000 units wide
const AVATAR = ['#ef130b', '#ff7100', '#e8a200', '#00a86b', '#00b2ff', '#5b5bd6', '#a300ba', '#df69a7', '#a0522d', '#00785d'];

export const pictionaryHome = () =>
  roomHome({ kind: 'pictionary', name: 'CinePictionary', lead: t('px.lead'), rules: [t('px.rule1v2'), t('px.rule2v2'), t('px.rule3v2')], path: PATH });
export const pictionaryJoin = (code) => roomJoin(PATH, code);

function titlePool() {
  return FRAMES.filter((f) => Number(f[3]) < 2026).map(([tv, id, title, year]) => ({ mt: tv ? 'tv' : 'movie', id, title, year }));
}
function pickChoices(used) {
  const pool = titlePool().filter((x) => !used.includes(`${x.mt}/${x.id}`));
  const out = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}
const quiet = async (p) => {
  try {
    return await p;
  } catch (err) {
    console.warn(err);
    return null;
  }
};
const hue = (id) => AVATAR[[...String(id)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % AVATAR.length];

export function pictionaryRoom(roomId) {
  const node = document.createElement('section');
  node.className = 'page game pictionary sk-page';
  const head = el('<header class="game-head"></header>');
  const shell = el(`<div class="sk">
      <div class="sk-top"><span class="sk-clock" data-clock>⏱ <b></b></span><span class="sk-round" data-round></span><div class="sk-word" data-word></div><span class="chip" data-code></span></div>
      <aside class="sk-players" data-players></aside>
      <div class="sk-board">
        <div class="sk-canvas-wrap"><canvas class="sk-canvas" aria-label="${esc(t('px.canvas'))}"></canvas><div class="sk-overlay" data-overlay hidden></div></div>
        <div class="sk-tools" data-tools hidden></div>
      </div>
      <aside class="sk-chat"><ol class="sk-msgs" data-msgs aria-live="polite"></ol>
        <form class="sk-say" data-say><input type="text" maxlength="100" autocomplete="off" enterkeyhint="send" aria-label="${esc(t('px.chatPh'))}" /></form></aside>
    </div>`);
  node.append(head, shell);
  const $ = (sel) => shell.querySelector(sel);
  const canvas = $('canvas');

  let ops = []; // strokes and fills, in order
  let card = null;
  let cardRound = null;
  const answers = new Map(); // round -> title, once revealed
  const local = []; // messages only this player sees ("close!")
  let shownOverlay = '';
  let hostTimer = null;
  let clock = null;
  let savedGame = null;
  let lastHintAsk = '';
  let needsSql = false;

  const g = liveGame(node, roomId, {
    onLoad: load,
    kinds: ['pguess', 'pchat'],
    onMessage(type, data) {
      const s = st();
      if (!data || (data.round != null && data.round !== s.round)) return;
      if (amDrawer() && type !== 'sync?') return;
      if (type === 'seg') addSeg(data);
      else if (type === 'fill') {
        ops.push(data);
        drawOp(data);
      } else if (type === 'undo') {
        ops = ops.filter((o) => o.id !== data.id);
        paintAll();
      } else if (type === 'clear') {
        ops = [];
        paintAll();
      } else if (type === 'sync?' && amDrawer()) g.send('sync', { round: s.round, ops });
      else if (type === 'sync' && Array.isArray(data.ops) && data.ops.length >= ops.length) {
        ops = data.ops;
        paintAll();
      }
    },
  });
  const { r } = g;
  const st = () => (r.room && r.room.state) || {};
  const isHost = () => r.room && r.room.host_id === r.uid;
  const turnOf = (s = st()) => (s.turns || [])[s.turnIndex] || {};
  const amDrawer = () => turnOf().drawer === r.uid && ['choose', 'draw'].includes(st().phase);
  const movesOf = (round) => r.moves.filter((m) => m.round === round);
  const rightOf = (round) => movesOf(round).filter((m) => m.kind === 'pguess' && m.data.right);
  const solvedBy = (id, round = st().round) => rightOf(round).some((m) => m.user_id === id);

  // ---------- Scores ----------
  function turnPoints(turn) {
    const pts = new Map();
    if (!turn || !turn.round) return pts;
    const total = (turn.drawTime || 80) * 1000;
    const right = rightOf(turn.round);
    right.forEach((m, i) => {
      const used = turn.startedAt && m.data.at ? Math.min(1, Math.max(0, (m.data.at - turn.startedAt) / total)) : 0.5;
      pts.set(m.user_id, Math.round(50 + 250 * (1 - used)) + (i === 0 ? 50 : 0));
    });
    const n = turn.n || Math.max(1, r.people.length - 1);
    if (right.length) pts.set(turn.drawer, Math.round((250 * right.length) / Math.max(1, n)));
    return pts;
  }
  function scores() {
    const s = st();
    const total = new Map(r.people.map((p) => [p.user_id, 0]));
    (s.turns || []).forEach((turn, i) => {
      if (i > s.turnIndex || (i === s.turnIndex && !['reveal', 'done'].includes(s.phase))) return;
      for (const [id, v] of turnPoints(turn)) total.set(id, (total.get(id) || 0) + v);
    });
    return total;
  }

  // ---------- Loading ----------
  async function load() {
    if (!r.room) {
      shell.replaceWith(el(`<div class="error-box"><p>${esc(t('mn.notFound'))}</p></div>`));
      return;
    }
    const s = st();
    const { sb } = await db.supa();
    const needCard = s.round && (cardRound !== s.round || (s.phase === 'draw' && card && card.role === 'drawer' && !card.title));
    if (needCard) {
      const fresh = cardRound !== s.round;
      const { data } = await sb.from('room_secrets').select('data').eq('room_id', roomId).eq('round', s.round).maybeSingle();
      card = data ? data.data : null;
      cardRound = s.round;
      if (fresh) {
        ops = [];
        paintAll();
        if (!amDrawer()) g.send('sync?', { round: s.round });
      }
    }
    if (['reveal', 'done'].includes(s.phase) && s.round && !answers.has(s.round)) {
      const { data } = await sb.rpc('reveal_answer', { rid: roomId, rnd: s.round });
      if (data && data.title) answers.set(s.round, data.title);
    }
    render();
  }

  // ---------- Drawing ----------
  function fit() {
    const box = canvas.getBoundingClientRect();
    if (!box.width) return;
    const ratio = window.devicePixelRatio || 1;
    const w = Math.round(box.width * ratio);
    const h = Math.round(box.width * 0.75 * ratio);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      paintAll();
    }
  }
  const ctx = () => canvas.getContext('2d', { willReadFrequently: true });
  function line(op, from) {
    const c = ctx();
    const w = canvas.width;
    const h = canvas.height;
    c.strokeStyle = PALETTE[op.c] || '#000';
    c.lineWidth = Math.max(1, (op.w || 10) * (w / 1000));
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    const start = Math.max(0, from - 1);
    op.p.slice(start).forEach(([x, y], i) => (i ? c.lineTo(x * w, y * h) : c.moveTo(x * w, y * h)));
    if (op.p.length - start === 1) c.lineTo(op.p[start][0] * w + 0.01, op.p[start][1] * h);
    c.stroke();
  }
  function fillAt(op) {
    const c = ctx();
    const w = canvas.width;
    const h = canvas.height;
    const x0 = Math.min(w - 1, Math.max(0, Math.floor(op.x * w)));
    const y0 = Math.min(h - 1, Math.max(0, Math.floor(op.y * h)));
    const img = c.getImageData(0, 0, w, h);
    const d = img.data;
    const at = (x, y) => (y * w + x) * 4;
    const k0 = at(x0, y0);
    const target = [d[k0], d[k0 + 1], d[k0 + 2]];
    const hex = PALETTE[op.c] || '#000000';
    const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const near = (k) => Math.abs(d[k] - target[0]) + Math.abs(d[k + 1] - target[1]) + Math.abs(d[k + 2] - target[2]) < 90;
    if (Math.abs(target[0] - rgb[0]) + Math.abs(target[1] - rgb[1]) + Math.abs(target[2] - rgb[2]) < 6) return;
    const seen = new Uint8Array(w * h);
    const stack = [[x0, y0]];
    while (stack.length) {
      const [x, y] = stack.pop();
      let xl = x;
      while (xl > 0 && !seen[y * w + xl - 1] && near(at(xl - 1, y))) xl -= 1;
      let xr = x;
      while (xr < w - 1 && !seen[y * w + xr + 1] && near(at(xr + 1, y))) xr += 1;
      for (let xx = xl; xx <= xr; xx += 1) {
        const k = at(xx, y);
        seen[y * w + xx] = 1;
        d[k] = rgb[0];
        d[k + 1] = rgb[1];
        d[k + 2] = rgb[2];
        d[k + 3] = 255;
        if (y > 0 && !seen[(y - 1) * w + xx] && near(at(xx, y - 1))) stack.push([xx, y - 1]);
        if (y < h - 1 && !seen[(y + 1) * w + xx] && near(at(xx, y + 1))) stack.push([xx, y + 1]);
      }
    }
    c.putImageData(img, 0, 0);
  }
  function drawOp(op) {
    if (op.t === 'f') fillAt(op);
    else if (op.p && op.p.length) line(op, 0);
  }
  function paintAll() {
    const c = ctx();
    c.fillStyle = BG;
    c.fillRect(0, 0, canvas.width, canvas.height);
    ops.forEach(drawOp);
  }
  function addSeg(seg) {
    if (!Array.isArray(seg.p)) return;
    let op = ops.find((o) => o.id === seg.id);
    if (!op) {
      op = { id: seg.id, c: seg.c, w: seg.w, p: [] };
      ops.push(op);
    }
    const from = op.p.length;
    op.p.push(...seg.p);
    line(op, from);
  }

  // The drawer's tools: brush with colour and size, eraser, fill, undo, clear
  const tool = { mode: 'brush', c: 13, w: 1 };
  let current = null;
  let unsent = [];
  let flushTimer = null;
  const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const pos = (e) => {
    const b = canvas.getBoundingClientRect();
    return [Math.round(((e.clientX - b.left) / b.width) * 1000) / 1000, Math.round(((e.clientY - b.top) / b.height) * 1000) / 1000];
  };
  function flush() {
    clearTimeout(flushTimer);
    flushTimer = null;
    if (!current || !unsent.length) return;
    g.send('seg', { round: st().round, id: current.id, c: current.c, w: current.w, p: unsent });
    unsent = [];
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (!amDrawer() || st().phase !== 'draw') return;
    e.preventDefault();
    const p = pos(e);
    if (tool.mode === 'fill') {
      const op = { id: uid(), t: 'f', c: tool.c, x: p[0], y: p[1] };
      ops.push(op);
      drawOp(op);
      g.send('fill', { ...op, round: st().round });
      return;
    }
    canvas.setPointerCapture(e.pointerId);
    current = { id: uid(), c: tool.mode === 'erase' ? 0 : tool.c, w: SIZES[tool.w] * (tool.mode === 'erase' ? 1.6 : 1), p: [p] };
    ops.push(current);
    line(current, 0);
    unsent = [p];
    flushTimer = setTimeout(flush, 40);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!current) return;
    const p = pos(e);
    const last = current.p[current.p.length - 1];
    if (last && last[0] === p[0] && last[1] === p[1]) return;
    current.p.push(p);
    line(current, current.p.length - 1);
    unsent.push(p);
    if (!flushTimer) flushTimer = setTimeout(flush, 40);
  });
  const endStroke = () => {
    if (!current) return;
    flush();
    current = null;
  };
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);
  window.addEventListener('resize', () => node.isConnected && fit());

  function toolsHtml() {
    return `<div class="sk-palette">${PALETTE.map((c, i) => `<button type="button" class="sk-swatch${tool.c === i && tool.mode !== 'erase' ? ' on' : ''}" data-c="${i}" style="--c:${c}" aria-label="${esc(t('px.color'))} ${i + 1}"></button>`).join('')}</div>
      <div class="sk-sizes">${SIZES.map((w, i) => `<button type="button" class="sk-size${tool.w === i ? ' on' : ''}" data-w="${i}" aria-label="${esc(t('px.brush'))} ${i + 1}"><span style="--d:${6 + i * 6}px"></span></button>`).join('')}</div>
      <div class="sk-actions">
        <button type="button" class="sk-tool${tool.mode === 'brush' ? ' on' : ''}" data-mode="brush" title="${esc(t('px.brushTool'))}" aria-label="${esc(t('px.brushTool'))}"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 20l4-1 11-11-3-3L5 16l-1 4z" fill="none" stroke="#222" stroke-width="2" stroke-linejoin="round"/><path d="M14 6l3 3" stroke="#222" stroke-width="2"/></svg></button>
        <button type="button" class="sk-tool${tool.mode === 'fill' ? ' on' : ''}" data-mode="fill" title="${esc(t('px.fill'))}" aria-label="${esc(t('px.fill'))}"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 11l7-7 7 7-7 7z" fill="none" stroke="#222" stroke-width="2" stroke-linejoin="round"/><path d="M5 11h14" stroke="#222" stroke-width="2"/><path d="M20 15c0 0 2 2.6 2 4a2 2 0 01-4 0c0-1.4 2-4 2-4z" fill="#00b2ff"/></svg></button>
        <button type="button" class="sk-tool${tool.mode === 'erase' ? ' on' : ''}" data-mode="erase" title="${esc(t('px.eraser'))}" aria-label="${esc(t('px.eraser'))}"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M3 15l9-9 7 7-6 6H8z" fill="#f4a6b8" stroke="#222" stroke-width="2" stroke-linejoin="round"/><path d="M8 19h12" stroke="#222" stroke-width="2"/></svg></button>
        <button type="button" class="sk-tool" data-undo title="${esc(t('dg.undo'))}" aria-label="${esc(t('dg.undo'))}"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M9 7L4 12l5 5" fill="none" stroke="#222" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 12h10a6 6 0 010 12h-2" fill="none" stroke="#222" stroke-width="2" stroke-linecap="round" transform="translate(0 -5)"/></svg></button>
        <button type="button" class="sk-tool" data-clear title="${esc(t('px.clear'))}" aria-label="${esc(t('px.clear'))}"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13" fill="none" stroke="#c0392b" stroke-width="2" stroke-linejoin="round"/></svg></button>
      </div>`;
  }
  function wireTools() {
    const box = $('[data-tools]');
    box.innerHTML = toolsHtml();
    box.querySelectorAll('[data-c]').forEach((b) =>
      b.addEventListener('click', () => {
        tool.c = Number(b.dataset.c);
        if (tool.mode === 'erase') tool.mode = 'brush';
        wireTools();
      }),
    );
    box.querySelectorAll('[data-w]').forEach((b) =>
      b.addEventListener('click', () => {
        tool.w = Number(b.dataset.w);
        wireTools();
      }),
    );
    box.querySelectorAll('[data-mode]').forEach((b) =>
      b.addEventListener('click', () => {
        tool.mode = b.dataset.mode;
        wireTools();
        canvas.dataset.tool = tool.mode;
      }),
    );
    box.querySelector('[data-undo]').addEventListener('click', () => {
      const op = ops.pop();
      if (!op) return;
      paintAll();
      g.send('undo', { round: st().round, id: op.id });
    });
    box.querySelector('[data-clear]').addEventListener('click', () => {
      ops = [];
      paintAll();
      g.send('clear', { round: st().round });
    });
  }

  // ---------- Chat ----------
  $('[data-say]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('[data-say] input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    try {
      const { sb } = await db.supa();
      const { data, error } = await sb.rpc('px_say', { rid: roomId, rnd: st().round || 0, msg: text });
      if (error) throw error;
      if (data === 'right') toast(t('quiz.right'));
      else if (data === 'close') {
        local.push({ round: st().round, text: t('px.close', { text }), cls: 'close' });
        renderChat();
      } else if (data === 'blocked') toast(t('px.blocked'), 'error');
      g.reload();
    } catch (err) {
      console.warn(err);
      if (/px_say/.test(String(err && (err.message || err.hint)))) needsSql = true;
      toast(needsSql ? t('px.needSql') : t('errors.generic'), 'error');
      input.value = text;
    }
  });

  function chatItems() {
    const s = st();
    const items = [];
    const viewerSolved = (round) => solvedBy(r.uid, round) || ((s.turns || []).find((x) => x.round === round) || {}).drawer === r.uid;
    const live = (round) => round === s.round && s.phase === 'draw';
    const byRound = new Map();
    for (const m of r.moves) {
      if (!byRound.has(m.round)) byRound.set(m.round, []);
      byRound.get(m.round).push(m);
    }
    const msg = (m) => {
      if (m.kind === 'pguess') {
        if (m.data.right) items.push({ cls: 'right', html: esc(t('px.guessedIt', { name: g.plainName(m.user_id) })) });
        else if (m.data.label) items.push({ cls: '', html: `<b>${esc(g.nameOf(m.user_id))}:</b> ${esc(m.data.label)}` });
        return;
      }
      const secret = m.data.solved || m.data.drawer;
      if (secret && live(m.round) && !viewerSolved(m.round)) return;
      items.push({ cls: secret ? 'secret' : '', html: `<b>${esc(g.nameOf(m.user_id))}:</b> ${esc(m.data.text || '')}` });
    };
    (byRound.get(0) || []).forEach(msg);
    for (const turn of s.turns || []) {
      if (!turn.round || turn.round > (s.round || 0)) continue;
      items.push({ cls: 'sys', html: esc(t('px.drawingNow', { name: g.plainName(turn.drawer) })) });
      (byRound.get(turn.round) || []).forEach(msg);
      local.filter((x) => x.round === turn.round).forEach((x) => items.push({ cls: x.cls, html: esc(x.text) }));
      const ans = answers.get(turn.round);
      if (ans) items.push({ cls: 'answer', html: esc(t('px.titleWas', { title: ans.title })) });
    }
    return items.slice(-150);
  }
  function renderChat() {
    const box = $('[data-msgs]');
    const atEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
    box.innerHTML = chatItems().map((m) => `<li class="${m.cls}">${m.html}</li>`).join('');
    if (atEnd) box.scrollTop = box.scrollHeight;
    const s = st();
    const input = $('[data-say] input');
    input.placeholder = s.phase === 'draw' && turnOf().drawer === r.uid ? t('px.chatPhDrawer') : t('px.chatPh');
  }

  // ---------- Screen ----------
  function renderPlayers() {
    const s = st();
    const sc = scores();
    const turn = turnOf();
    const playing = s.phase && s.phase !== 'lobby';
    const rows = r.people
      .map((p) => [p, sc.get(p.user_id) || 0])
      .sort((a, b) => b[1] - a[1]);
    $('[data-players]').innerHTML = rows
      .map(([p, score], i) => {
        const solved = playing && s.phase === 'draw' && solvedBy(p.user_id);
        const drawing = playing && ['choose', 'draw'].includes(s.phase) && turn.drawer === p.user_id;
        const name = g.plainName(p.user_id);
        return `<div class="sk-player${solved ? ' solved' : ''}${p.me ? ' me' : ''}${r.online.has(p.user_id) ? '' : ' away'}">
          <span class="sk-rank">#${i + 1}</span>
          <span class="sk-avatar" style="--a:${hue(p.user_id)}">${esc((name || '?').slice(0, 1).toUpperCase())}</span>
          <span class="sk-pname"><b>${esc(name)}${p.me ? ` (${esc(t('wl.you'))})` : ''}</b><small>${esc(t('px.points', { n: score }))}</small></span>
          ${drawing ? '<span class="sk-pen" title="drawing">✏️</span>' : ''}${p.user_id === r.room.host_id ? '<span class="sk-host" title="host">👑</span>' : ''}
        </div>`;
      })
      .join('');
  }

  function wordHtml() {
    const s = st();
    if (s.phase === 'draw' && amDrawer() && card && card.title) return `<span class="sk-word-label">${esc(t('px.drawThisLabel'))}</span><span class="sk-word-text">${esc(card.title.title)}</span>`;
    if (s.phase === 'draw' && s.mask) {
      const hints = s.hints || {};
      const chars = [...s.mask].map((ch, i) => (hints[i] ? `<span class="hint">${esc(hints[i])}</span>` : ch === '_' ? '<span class="blank">_</span>' : ch === ' ' ? '<span class="gap"></span>' : `<span>${esc(ch)}</span>`));
      const counts = s.mask.split(/\s+/).map((w) => w.replace(/[^_]/g, '').length).filter(Boolean).join(' ');
      return `<span class="sk-word-label">${esc(t('px.guessThisLabel'))}</span><span class="sk-mask">${chars.join('')}</span><sup class="sk-count">${counts}</sup>`;
    }
    if ((s.phase === 'reveal' || s.phase === 'done') && answers.get(s.round)) return `<span class="sk-word-text">${esc(answers.get(s.round).title)}</span>`;
    if (s.phase === 'choose') return `<span class="sk-word-label">${esc(t('px.waiting'))}</span>`;
    return `<span class="sk-word-label">${esc(t('px.waitingPlayers'))}</span>`;
  }

  function overlayHtml() {
    const s = st();
    const turn = turnOf();
    if (!s.phase || s.phase === 'lobby') {
      const link = `${location.origin}${PATH}/join/${r.room.code}`;
      const rounds = s.rounds || 3;
      const drawTime = s.drawTime || 80;
      return `<div class="sk-card">
        <h2>${esc(t('px.lobbyTitle'))}</h2>
        ${
          isHost()
            ? `<div class="sk-settings"><label>${esc(t('px.rounds'))}<select data-rounds>${[1, 2, 3, 4, 5, 6].map((n) => `<option ${n === rounds ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
               <label>${esc(t('px.drawTime'))}<select data-time>${[60, 80, 100, 120, 150].map((n) => `<option value="${n}" ${n === drawTime ? 'selected' : ''}>${esc(t('px.seconds', { n }))}</option>`).join('')}</select></label></div>`
            : ''
        }
        <div class="sk-invite"><input type="text" readonly value="${esc(link)}" aria-label="${esc(t('wl.inviteLink'))}" /><button class="btn btn-ghost btn-small" type="button" data-copy="${esc(link)}">${esc(t('wl.copyLink'))}</button></div>
        ${
          isHost()
            ? `<button class="btn" type="button" data-start ${r.people.length >= 2 ? '' : 'disabled'}>▶ ${esc(t('px.start'))}</button>${r.people.length < 2 ? `<p class="muted">${esc(t('pr.needTwo'))}</p>` : ''}`
            : `<p class="muted">${esc(t('quiz.waitHost'))}</p>`
        }
        ${r.people.length < 2 ? botsOffer(PATH) : ''}
      </div>`;
    }
    if (s.phase === 'choose') {
      if (turn.drawer === r.uid && card && card.choices)
        return `<div class="sk-card"><h2>${esc(t('px.chooseTitle'))}</h2><div class="sk-choices">${card.choices
          .map((c, i) => `<button class="btn" type="button" data-choose="${i}">${esc(c.title)} <span class="muted">${esc(c.year)}</span></button>`)
          .join('')}</div></div>`;
      return `<div class="sk-card"><p class="sk-big">${esc(t('px.choosing', { name: g.plainName(turn.drawer) }))}</p></div>`;
    }
    if (s.phase === 'reveal') {
      const ans = answers.get(s.round);
      const pts = turnPoints({ ...turn, startedAt: turn.startedAt || s.startedAt, drawTime: turn.drawTime || s.drawTime });
      return `<div class="sk-card"><p class="sk-big">${esc(t('px.titleWas', { title: ans ? ans.title : '…' }))}</p>
        <ul class="sk-gains">${r.people
          .map((p) => [p, pts.get(p.user_id) || 0])
          .sort((a, b) => b[1] - a[1])
          .map(([p, v]) => `<li><span>${esc(g.plainName(p.user_id))}</span><b class="${v ? 'up' : ''}">+${v}</b></li>`)
          .join('')}</ul></div>`;
    }
    if (s.phase === 'done') {
      const sc = [...scores()].sort((a, b) => b[1] - a[1]);
      const medal = ['🥇', '🥈', '🥉'];
      return `<div class="sk-card"><h2>${esc(t('quiz.final'))}</h2>
        <div class="sk-podium">${sc
          .slice(0, 3)
          .map(([id, v], i) => `<div class="sk-step s${i + 1}"><span class="sk-medal">${medal[i]}</span><span class="sk-avatar" style="--a:${hue(id)}">${esc(g.plainName(id).slice(0, 1).toUpperCase())}</span><b>${esc(g.plainName(id))}</b><small>${esc(t('px.points', { n: v }))}</small></div>`)
          .join('')}</div>
        ${isHost() ? `<button class="btn" type="button" data-again>${esc(t('play.playAgain'))}</button>` : ''}</div>`;
    }
    return '';
  }

  function renderOverlay() {
    const s = st();
    const key = `${s.phase}-${s.round}-${s.phase === 'lobby' || !s.phase ? r.people.length + (isHost() ? 'h' : '') : ''}-${card && card.choices ? 'c' : ''}-${answers.has(s.round)}`;
    const box = $('[data-overlay]');
    if (s.phase === 'draw') {
      box.hidden = true;
      shownOverlay = key;
      return;
    }
    if (key === shownOverlay && !box.hidden) return;
    shownOverlay = key;
    box.hidden = false;
    box.innerHTML = overlayHtml();
    g.wireCopy(box);
    const start = box.querySelector('[data-start]');
    if (start) start.addEventListener('click', () => startGame(start));
    const again = box.querySelector('[data-again]');
    if (again) again.addEventListener('click', () => startGame(again));
    const persist = () => {
      const rounds = Number(box.querySelector('[data-rounds]').value);
      const drawTime = Number(box.querySelector('[data-time]').value);
      g.patch({ rounds, drawTime }).catch(() => {});
    };
    box.querySelectorAll('[data-rounds], [data-time]').forEach((x) => x.addEventListener('change', persist));
    box.querySelectorAll('[data-choose]').forEach((b) =>
      b.addEventListener('click', async () => {
        box.querySelectorAll('[data-choose]').forEach((x) => (x.disabled = true));
        try {
          const { sb } = await db.supa();
          const { error } = await sb.rpc('px_choose', { rid: roomId, rnd: s.round, idx: Number(b.dataset.choose) });
          if (error) throw error;
          g.reload();
        } catch (err) {
          console.warn(err);
          toast(t('errors.generic'), 'error');
        }
      }),
    );
  }

  function tickClock() {
    const s = st();
    const b = $('[data-clock] b');
    let left = null;
    if (s.phase === 'draw' && s.startedAt) left = Math.ceil((s.startedAt + (s.drawTime || 80) * 1000 - Date.now()) / 1000);
    else if (s.phase === 'choose' && s.chooseUntil) left = Math.ceil((s.chooseUntil - Date.now()) / 1000);
    b.textContent = left == null ? '–' : String(Math.max(0, left));
    $('[data-clock]').classList.toggle('low', left != null && left <= 10 && s.phase === 'draw');
  }

  function render() {
    const s = st();
    head.innerHTML = `<a class="back" href="${PATH}" data-link>‹ CinePictionary</a>`;
    $('[data-code]').textContent = `${t('quiz.room')} · ${r.room.code}`;
    const turn = turnOf();
    $('[data-round]').textContent = s.phase && s.phase !== 'lobby' && turn.rn ? t('px.roundOf', { i: turn.rn, n: s.rounds || 3 }) : '';
    $('[data-word]').innerHTML = wordHtml();
    renderPlayers();
    renderOverlay();
    const tools = $('[data-tools]');
    const drawing = s.phase === 'draw' && amDrawer();
    if (drawing && tools.hidden) wireTools();
    tools.hidden = !drawing;
    canvas.classList.toggle('can-draw', drawing);
    canvas.dataset.tool = tool.mode;
    fit();
    renderChat();
    clearInterval(clock);
    tickClock();
    clock = setInterval(() => (node.isConnected ? tickClock() : clearInterval(clock)), 500);
    if (s.phase === 'done' && savedGame !== s.game) {
      savedGame = s.game;
      const sc = scores();
      const top = Math.max(...sc.values());
      db.saveResult({ game: 'pictionary', mode: 'practice', puzzleKey: `room-${roomId}-${s.game}`, won: sc.get(r.uid) === top && top > 0, score: sc.get(r.uid) || 0, detail: { room: roomId } }).catch(() => {});
    }
    if (isHost()) hostTick();
  }

  // ---------- The host runs the game ----------
  const usedTitles = []; // titles already offered in this room, so they don't come back
  let dealing = false;
  async function dealTurn(index, turns, game, fromRound = null) {
    if (dealing) return;
    // A tick that saw an older state must not deal a second turn
    if (fromRound !== null && (st().round || 0) !== fromRound) return;
    dealing = true;
    try {
      const s = st();
      const { sb } = await db.supa();
      const here = new Set(r.people.map((p) => p.user_id));
      let i = index;
      while (i < turns.length && !here.has(turns[i].drawer)) i += 1;
      if (i >= turns.length) {
        await g.patch({ phase: 'done', turns });
        return;
      }
      const round = (s.round || 0) + 1;
      const choices = pickChoices(usedTitles);
      choices.forEach((c) => usedTitles.push(`${c.mt}/${c.id}`));
      const { error } = await sb.rpc('px_deal', { rid: roomId, rnd: round, drawer: turns[i].drawer, choices });
      if (error) throw error;
      turns[i] = { ...turns[i], round, drawTime: s.drawTime || 80 };
      await g.patch({ phase: 'choose', round, turnIndex: i, turns, game, chooseUntil: Date.now() + CHOOSE_SECONDS * 1000, mask: null, hints: {}, startedAt: null });
    } finally {
      dealing = false;
    }
  }

  async function startGame(btn) {
    btn.disabled = true;
    try {
      const s = st();
      const order = r.people.map((p) => p.user_id).sort(() => Math.random() - 0.5);
      const turns = [];
      for (let rn = 1; rn <= (s.rounds || 3); rn += 1) for (const drawer of order) turns.push({ drawer, rn });
      await track(dealTurn(0, turns, (s.game || 0) + 1));
    } catch (err) {
      console.warn(err);
      btn.disabled = false;
      const missing = /px_deal|function/.test(String(err && (err.message || err.hint)));
      toast(missing ? t('px.needSql') : t('errors.generic'), 'error');
    }
  }

  async function hostTick() {
    clearTimeout(hostTimer);
    const s = st();
    if (!node.isConnected || !s.phase || s.phase === 'lobby' || s.phase === 'done') return;
    const turn = turnOf(s);
    const drawerHere = r.people.some((p) => p.user_id === turn.drawer);
    const { sb } = await db.supa();
    if (s.phase === 'choose') {
      if (!drawerHere) return endTurn(s);
      if (Date.now() > (s.chooseUntil || 0) + 800) {
        await quiet(sb.rpc('px_choose', { rid: roomId, rnd: s.round, idx: Math.floor(Math.random() * 3) }));
        g.reload();
        return;
      }
    } else if (s.phase === 'draw') {
      const total = (s.drawTime || 80) * 1000;
      const used = (Date.now() - (s.startedAt || Date.now())) / total;
      const guessers = r.people.filter((p) => p.user_id !== turn.drawer).length;
      const right = rightOf(s.round).length;
      if (!drawerHere || (guessers && right >= guessers) || used > 1.01) return endTurn(s);
      // Hint letters at 45%, 65% and 85% of the time
      const want = [0.45, 0.65, 0.85].filter((x) => used >= x).length;
      const have = Object.keys(s.hints || {}).length;
      const ask = `${s.round}-${want}`;
      if (want > have && lastHintAsk !== ask) {
        lastHintAsk = ask;
        await quiet(sb.rpc('px_hint', { rid: roomId, rnd: s.round }));
      }
    } else if (s.phase === 'reveal') {
      const wait = REVEAL_SECONDS * 1000 - (Date.now() - (s.revealAt || 0));
      if (wait <= 0) {
        await dealTurn(s.turnIndex + 1, (s.turns || []).slice(), s.game, s.round || 0).catch((err) => console.warn(err));
        return;
      }
      hostTimer = setTimeout(hostTick, Math.min(wait, 1000));
      return;
    }
    hostTimer = setTimeout(hostTick, 1000);
  }

  let endedRound = null;
  async function endTurn(s) {
    if (endedRound === s.round) return;
    endedRound = s.round;
    const turns = (s.turns || []).slice();
    const i = s.turnIndex;
    if (turns[i]) turns[i] = { ...turns[i], startedAt: s.startedAt || null, drawTime: s.drawTime || 80, n: Math.max(1, r.people.length - 1) };
    await g.patch({ phase: 'reveal', revealAt: Date.now(), turns }).catch((err) => console.warn(err));
  }

  return node;
}
