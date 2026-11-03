// Practice with bots for the friend-room games: Movie Impostor, Poster Reveal
// and CinePictionary. Everything runs on this device; nothing is saved and no
// room is made, so you can practise alone as often as you like.
//
// How the bots play:
// - Impostor: crew bots give one-word clues from what TMDB knows about the title
//   (keywords, genres, cast, director, decade). The impostor bot guesses which
//   title it is from the other clues, and clues for its best guess. Bots vote
//   for whoever's clues fit the title least.
// - Poster Reveal: each bot knows some titles and buzzes in after a while.
// - CinePictionary: a bot "draws" by sketching the outlines of a still from the
//   title. Bots can't see your drawing, so on your turn they guess on a timer
//   that speeds up the more you draw.
import { t } from '../i18n.js';
import * as tmdb from '../tmdb.js';
import { TMDB_IMG } from '../config.js';
import { esc, el, toast } from '../ui.js';
import { FRAMES } from './frame-data.js';
import { shuffle, hashString, rng } from './common.js';
import { titlePicker } from './picker.js';
import { isRude, clean } from '../rooms.js';

const ME = 'me';
const NAMES = ['Reel Rita', 'Popcorn Pete', 'Director Dot', 'Credits Carl', 'Matinee Max', 'Cue Card Cleo'];
const rand = (a, b) => a + Math.random() * (b - a);
const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];
const mix = (arr) => shuffle(arr, Math.random);
const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .trim();

function makeBots(n) {
  return mix(NAMES)
    .slice(0, n)
    .map((name, i) => ({ id: `bot${i}`, name: `🤖 ${name}` }));
}

function titles() {
  return FRAMES.filter((f) => Number(f[3]) < 2026).map(([tv, id, title, year]) => ({ mt: tv ? 'tv' : 'movie', id, title, year }));
}

// Timers that stop when you leave the page
function timers(node) {
  const ids = new Set();
  const later = (fn, ms) => {
    const id = setTimeout(() => {
      ids.delete(id);
      if (node.isConnected) fn();
    }, ms);
    ids.add(id);
    return id;
  };
  const clearAll = () => {
    ids.forEach((id) => clearTimeout(id));
    ids.clear();
  };
  return { later, clearAll };
}

function header(node, { path, name }) {
  const head = el(`<header class="game-head"><a class="back" href="${path}" data-link>‹ ${esc(name)}</a>
    <div class="game-title-row"><h1>${esc(name)}</h1><span class="chip">🤖 ${esc(t('bots.chip'))}</span></div></header>`);
  node.append(head);
  return head;
}

function scoreList(players, scores) {
  return `<div class="board-list">${players
    .map((p) => [p, scores.get(p.id) || 0])
    .sort((a, b) => b[1] - a[1])
    .map(([p, sc], i) => `<div class="board-row${p.id === ME ? ' is-me' : ''}"><span class="board-rank">${i + 1}</span><span class="board-name">${esc(p.name)}</span><span class="board-score">${sc}</span></div>`)
    .join('')}</div>`;
}

// ---------- What TMDB knows about a title (for clues and votes) ----------

const STOP = new Set(
  'the a an and or of in on at to for with from by into over after before about his her their its this that these those who what when where which while is are was were be been being has have had not but as it he she they them him you your our we us one two three new old based film movie series story life man woman'.split(' '),
);
const facts = new Map();
async function factsOf(item) {
  const key = `${item.mt}/${item.id}`;
  if (!facts.has(key)) {
    const p = (async () => {
      const q = new URLSearchParams({ path: key, language: 'en-US', append_to_response: 'credits,keywords' });
      const r = await fetch(`/api/tmdb?${q}`);
      if (!r.ok) throw new Error('tmdb');
      const d = await r.json();
      const titleWords = new Set(norm(item.title).split(' '));
      const clues = [];
      const related = new Set();
      const add = (w, asClue) => {
        const x = norm(w).replace(/ /g, '');
        if (x.length < 3 || STOP.has(x) || titleWords.has(x)) return;
        related.add(x);
        if (asClue && !clues.includes(x)) clues.push(x);
      };
      const kws = ((d.keywords && (d.keywords.keywords || d.keywords.results)) || []).map((k) => k.name);
      for (const k of kws) {
        const parts = norm(k).split(' ').filter((w) => w.length > 2 && !STOP.has(w));
        parts.forEach((w) => add(w, false));
        if (parts.length) add(parts.sort((a, b) => b.length - a.length)[0], true);
      }
      for (const g of d.genres || []) norm(g.name).split(' ').forEach((w) => add(w, true));
      const cast = ((d.credits && d.credits.cast) || []).slice(0, 4).map((c) => c.name);
      const makers =
        item.mt === 'movie' ? ((d.credits && d.credits.crew) || []).filter((c) => c.job === 'Director').map((c) => c.name) : (d.created_by || []).map((c) => c.name);
      for (const n of [...makers.slice(0, 1), ...cast.slice(0, 3)]) add(norm(n).split(' ').pop(), true);
      const y = Number(item.year);
      if (y) add(`${Math.floor(y / 10) * 10}s`, true);
      norm(d.overview)
        .split(' ')
        .filter((w) => w.length >= 5)
        .forEach((w) => add(w, false));
      // Keyword clues are the most telling, so they come first, a little shuffled
      return { clues: [...mix(clues.slice(0, 6)), ...clues.slice(6)], related };
    })();
    facts.set(key, p);
    p.catch(() => facts.delete(key));
  }
  return facts.get(key);
}

/** How many of these words fit what we know about a title. */
function fit(words, related) {
  let n = 0;
  for (const raw of words) {
    const w = norm(raw).replace(/ /g, '');
    if (w.length < 3) continue;
    if (related.has(w)) n += 1;
    else if (w.length >= 4 && [...related].some((r) => r.length >= 4 && (r.startsWith(w) || w.startsWith(r)))) n += 0.6;
  }
  return n;
}

const VAGUE = ['classic', 'iconic', 'intense', 'epic', 'twist', 'journey', 'emotional', 'legendary', 'dramatic', 'unforgettable', 'gripping', 'memorable'];

// =====================================================================
// Movie Impostor with bots
// =====================================================================

export function impostorBots() {
  const node = document.createElement('section');
  node.className = 'page game impostor';
  header(node, { path: '/games/impostor', name: t('imp2.name') });
  const body = el('<div class="imp-body"></div>');
  node.append(body);
  const { later, clearAll } = timers(node);
  const bots = makeBots(3);
  const players = [{ id: ME, name: t('wl.you') }, ...bots];
  const nameOf = (id) => players.find((p) => p.id === id).name;
  const record = new Map(players.map((p) => [p.id, 0]));
  let s = null;
  let draft = '';

  const CLUE_ROUNDS = 2;
  const clueOf = (cr, id) => s.clues[`${cr}:${id}`];
  const cluesBy = (id) => [1, 2].map((cr) => clueOf(cr, id)).filter(Boolean);

  async function deal() {
    clearAll();
    body.innerHTML = `<div class="loading-box"><span class="spinner"></span>${esc(t('ui.loading'))}</div>`;
    const all = mix(titles());
    let title = null;
    let info = null;
    for (const cand of all.slice(0, 6)) {
      info = await factsOf(cand).catch(() => null);
      if (info && info.clues.length >= 4) {
        title = cand;
        break;
      }
    }
    if (!title) {
      body.innerHTML = `<div class="error-box"><p>${esc(t('errors.generic'))}</p></div>`;
      return;
    }
    const choices = mix([title, ...all.filter((x) => x.id !== title.id).slice(6, 11)]);
    s = {
      round: (s ? s.round : 0) + 1,
      phase: 'clues',
      clueRound: 1,
      title,
      info,
      impostor: pickOne(players).id,
      choices,
      clues: {},
      votes: {},
      guess: null,
      used: new Set(),
    };
    draft = '';
    render();
    botClues();
  }

  async function impostorBotClue() {
    // Rank the choices by how well the crew's clues so far fit each one
    const crewWords = players.filter((p) => p.id !== s.impostor).flatMap((p) => cluesBy(p.id));
    if (!crewWords.length) return pickOne(VAGUE.filter((w) => !s.used.has(w)));
    let best = null;
    let bestFit = -1;
    for (const c of s.choices) {
      const f = await factsOf(c).catch(() => null);
      if (!f) continue;
      const v = fit(crewWords, f.related) + Math.random() * 0.3;
      if (v > bestFit) {
        bestFit = v;
        best = f;
      }
    }
    const pool = best ? best.clues.filter((w) => !s.used.has(w) && !crewWords.map(norm).includes(w)) : [];
    return pool.length ? pickOne(pool.slice(0, 4)) : pickOne(VAGUE.filter((w) => !s.used.has(w)));
  }

  function botClues() {
    const cr = s.clueRound;
    const round = s.round;
    for (const b of bots) {
      later(async () => {
        if (!s || s.round !== round || s.phase !== 'clues' || s.clueRound !== cr) return;
        let word;
        if (b.id === s.impostor) word = await impostorBotClue();
        else word = s.info.clues.find((w) => !s.used.has(w)) || pickOne(VAGUE);
        if (!s || s.round !== round || s.clueRound !== cr) return;
        s.used.add(word);
        s.clues[`${cr}:${b.id}`] = word;
        step();
      }, rand(1200, 4200));
    }
  }

  function step() {
    if (s.phase === 'clues' && players.every((p) => clueOf(s.clueRound, p.id))) {
      if (s.clueRound < CLUE_ROUNDS) {
        s.clueRound += 1;
        render();
        later(botClues, 600);
        return;
      }
      s.phase = 'vote';
      render();
      botVotes();
      return;
    }
    if (s.phase === 'vote' && players.every((p) => s.votes[p.id])) {
      s.phase = 'reveal';
      render();
      later(() => {
        if (caught()) {
          s.phase = 'guess';
          render();
          if (s.impostor !== ME) later(botGuess, rand(1800, 3200));
        } else finish();
      }, 2600);
      return;
    }
    render();
  }

  function botVotes() {
    const round = s.round;
    for (const b of bots) {
      later(() => {
        if (!s || s.round !== round || s.phase !== 'vote') return;
        const others = players.filter((p) => p.id !== b.id);
        let target;
        if (b.id === s.impostor || Math.random() < 0.2) target = pickOne(others).id;
        else {
          const scored = others.map((p) => [p.id, fit(cluesBy(p.id), s.info.related) + Math.random() * 0.5]);
          scored.sort((a, c) => a[1] - c[1]);
          target = scored[0][0];
        }
        s.votes[b.id] = target;
        step();
      }, rand(1500, 4500));
    }
  }

  function tally() {
    const m = new Map();
    Object.values(s.votes).forEach((v) => m.set(v, (m.get(v) || 0) + 1));
    return m;
  }
  function caught() {
    const m = tally();
    const top = Math.max(0, ...m.values());
    const leaders = [...m].filter(([, n]) => n === top).map(([id]) => id);
    return top > 0 && leaders.length === 1 && leaders[0] === s.impostor;
  }

  async function botGuess() {
    const crewWords = players.filter((p) => p.id !== s.impostor).flatMap((p) => cluesBy(p.id));
    let best = s.choices[0];
    let bestFit = -1;
    for (const c of s.choices) {
      const f = await factsOf(c).catch(() => null);
      const v = (f ? fit(crewWords, f.related) : 0) + Math.random() * 0.4;
      if (v > bestFit) {
        bestFit = v;
        best = c;
      }
    }
    s.guess = best;
    finish();
  }

  function finish() {
    s.phase = 'over';
    const stole = s.guess && s.guess.id === s.title.id && s.guess.mt === s.title.mt;
    s.crewWins = caught() && !stole;
    s.stole = stole;
    for (const p of players) if ((p.id === s.impostor) !== s.crewWins) record.set(p.id, (record.get(p.id) || 0) + 1);
    render();
  }

  function cardHtml() {
    if (s.impostor === ME)
      return `<div class="imp-card is-impostor"><p class="label">${esc(t('imp2.yourCard'))}</p><p class="imp-role">🕵️ ${esc(t('imp2.youImpostor'))}</p><p class="muted">${esc(t('imp2.blendIn'))}</p></div>`;
    return `<div class="imp-card"><p class="label">${esc(t('imp2.yourCard'))}</p><p class="imp-title">${esc(s.title.title)} <span class="muted">${esc(s.title.year)}</span></p><p class="muted">${esc(t('imp2.crewNote'))}</p></div>`;
  }

  function cluesHtml() {
    const rows = players
      .map((p) => {
        const cells = [];
        for (let c = 1; c <= CLUE_ROUNDS; c += 1) {
          const w = clueOf(c, p.id);
          const hidden = s.phase === 'clues' && c === s.clueRound && w && p.id !== ME && !players.every((x) => clueOf(c, x.id));
          cells.push(`<td>${w ? (hidden ? '✓' : esc(clean(w))) : c <= s.clueRound || s.phase !== 'clues' ? '<span class="muted">…</span>' : ''}</td>`);
        }
        return `<tr><th>${esc(p.name)}</th>${cells.join('')}</tr>`;
      })
      .join('');
    return `<table class="imp-clues"><thead><tr><th></th>${Array.from({ length: CLUE_ROUNDS }, (_, i) => `<th>${esc(t('imp2.clueN', { n: i + 1 }))}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
  }

  function render() {
    if (!s) {
      body.innerHTML = `<p class="lead">${esc(t('bots.impLead'))}</p>
        <div class="board-list">${players.map((p) => `<div class="board-row${p.id === ME ? ' is-me' : ''}"><span class="board-name">${esc(p.name)}</span></div>`).join('')}</div>
        <button class="btn" type="button" data-deal>▶ ${esc(t('imp2.start'))}</button>`;
      body.querySelector('[data-deal]').addEventListener('click', deal);
      return;
    }
    const focused = document.activeElement && body.contains(document.activeElement) && document.activeElement.matches('.imp-form input');
    let html = `<p class="imp-step"><span class="chip">${esc(t('imp2.roundN', { n: s.round }))}</span></p>${cardHtml()}`;
    if (s.phase === 'clues') {
      const mine = clueOf(s.clueRound, ME);
      html += `<p class="imp-step">${esc(t('imp2.clueStep', { n: s.clueRound, of: CLUE_ROUNDS }))}</p>`;
      html += mine
        ? `<p class="muted">${esc(t('imp2.waitOthers'))}</p>`
        : `<form class="imp-form"><input type="text" maxlength="24" autocomplete="off" placeholder="${esc(t('imp2.oneWord'))}" aria-label="${esc(t('imp2.oneWord'))}" value="${esc(draft)}" />
            <button class="btn" type="submit">${esc(t('imp2.send'))}</button></form>`;
      html += cluesHtml();
    } else if (s.phase === 'vote') {
      html += cluesHtml();
      html += `<p class="imp-step">${esc(t('imp2.voteStep'))}</p>`;
      html += s.votes[ME]
        ? `<p class="muted">${esc(t('imp2.voted', { n: Object.keys(s.votes).length, of: players.length }))}</p>`
        : `<div class="imp-votes">${players
            .filter((p) => p.id !== ME)
            .map((p) => `<button class="btn btn-ghost" type="button" data-vote="${p.id}">${esc(p.name)}</button>`)
            .join('')}</div>`;
    } else {
      html += cluesHtml();
      const m = tally();
      html += `<div class="board-list">${players
        .map((p) => `<div class="board-row${s.impostor === p.id ? ' is-me' : ''}"><span class="board-name">${esc(p.name)}${s.impostor === p.id ? ' 🕵️' : ''}</span><span class="board-score">🗳 ${m.get(p.id) || 0}</span></div>`)
        .join('')}</div>`;
      html += `<p class="imp-step">${esc(t('imp2.itWas', { name: nameOf(s.impostor), title: s.title.title }))}</p>`;
      if (s.phase === 'reveal') html += `<p class="muted">${esc(caught() ? t('imp2.caught') : t('imp2.escaped'))}</p>`;
      if (s.phase === 'guess') {
        if (s.impostor === ME)
          html += `<p class="imp-step">${esc(t('imp2.lastChance'))}</p><div class="imp-votes">${s.choices
            .map((c, i) => `<button class="btn btn-ghost" type="button" data-guess="${i}">${esc(c.title)} <span class="muted">${esc(c.year)}</span></button>`)
            .join('')}</div>`;
        else html += `<p class="muted">${esc(t('imp2.guessing', { name: nameOf(s.impostor) }))}</p>`;
      }
      if (s.phase === 'over') {
        if (s.guess) html += `<p class="muted">${esc(t('bots.guessed', { name: nameOf(s.impostor), title: s.guess.title }))}</p>`;
        html += `<p class="result-head">${esc(s.crewWins ? t('imp2.crewWins') : s.stole ? t('imp2.stole', { name: nameOf(s.impostor) }) : t('imp2.impostorWins', { name: nameOf(s.impostor) }))}</p>`;
        html += `<h2 class="group-title">${esc(t('bots.roundsWon'))}</h2>${scoreList(players, record)}`;
        html += `<button class="btn" type="button" data-deal>▶ ${esc(t('imp2.next'))}</button>`;
      }
    }
    body.innerHTML = html;
    const form = body.querySelector('.imp-form');
    if (form) {
      const input = form.querySelector('input');
      if (focused) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
      input.addEventListener('input', () => (draft = input.value));
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const word = input.value.trim().split(/\s+/)[0] || '';
        if (!word) return;
        if (isRude(word)) return toast(t('imp2.rude'), 'error');
        if (s.impostor !== ME && norm(s.title.title).split(' ').includes(norm(word))) return toast(t('imp2.tooEasy'), 'error');
        s.clues[`${s.clueRound}:${ME}`] = word.slice(0, 24);
        s.used.add(norm(word));
        draft = '';
        step();
      });
    }
    body.querySelectorAll('[data-vote]').forEach((b) =>
      b.addEventListener('click', () => {
        s.votes[ME] = b.dataset.vote;
        step();
      }),
    );
    body.querySelectorAll('[data-guess]').forEach((b) =>
      b.addEventListener('click', () => {
        s.guess = s.choices[Number(b.dataset.guess)];
        finish();
      }),
    );
    const again = body.querySelector('[data-deal]');
    if (again) again.addEventListener('click', deal);
  }

  render();
  return node;
}

// =====================================================================
// Poster Reveal with bots
// =====================================================================

const PR_ROUNDS = 8;
const PR_SECONDS = 25;
const COLS = 6;
const ROWS = 9;
const prPoints = (ms) => 300 + Math.round(700 * Math.max(0, 1 - ms / (PR_SECONDS * 1000)));

async function posterItems() {
  const items = [];
  for (const it of mix(titles()).slice(0, PR_ROUNDS + 6)) {
    if (items.length >= PR_ROUNDS) break;
    const d = await tmdb.details(it.mt, it.id).catch(() => null);
    if (d && d.poster_path) items.push({ ...it, poster: d.poster_path });
  }
  return items;
}

function posterTiles(seed, frac) {
  const order = shuffle(Array.from({ length: COLS * ROWS }, (_, i) => i), rng(hashString(seed)));
  const open = new Set(order.slice(0, Math.floor(frac * COLS * ROWS)));
  return Array.from({ length: COLS * ROWS }, (_, i) => `<span class="${open.has(i) ? 'open' : ''}"></span>`).join('');
}

export function posterBots() {
  const node = document.createElement('section');
  node.className = 'page game poster';
  header(node, { path: '/games/poster', name: t('pr.name') });
  const body = el('<div class="imp-body"></div>');
  node.append(body);
  const { later, clearAll } = timers(node);
  const bots = makeBots(2).map((b, i) => ({ ...b, knows: i ? 0.45 : 0.6 }));
  const players = [{ id: ME, name: t('wl.you') }, ...bots];
  const nameOf = (id) => players.find((p) => p.id === id).name;
  let items = [];
  let q = 0;
  let startedAt = 0;
  let log = [];
  let scores = new Map();
  let lockUntil = 0;
  let clock = null;
  let phase = 'lobby';
  let game = 0;

  const winner = () => log.find((m) => m.right);

  function lobby() {
    body.innerHTML = `<p class="lead">${esc(t('bots.prLead'))}</p>
      <div class="board-list">${players.map((p) => `<div class="board-row${p.id === ME ? ' is-me' : ''}"><span class="board-name">${esc(p.name)}</span></div>`).join('')}</div>
      <button class="btn" type="button" data-start>▶ ${esc(t('quiz.startGame'))}</button>`;
    body.querySelector('[data-start]').addEventListener('click', start);
  }

  async function start() {
    clearAll();
    body.innerHTML = `<div class="loading-box"><span class="spinner"></span>${esc(t('ui.loading'))}</div>`;
    items = await posterItems();
    if (!items.length) {
      body.innerHTML = `<div class="error-box"><p>${esc(t('errors.generic'))}</p></div>`;
      return;
    }
    game += 1;
    scores = new Map(players.map((p) => [p.id, 0]));
    q = 0;
    play();
  }

  function guess(id, item, right, label) {
    if (phase !== 'play' || winner()) return;
    const ms = Math.min(Date.now() - startedAt, PR_SECONDS * 1000);
    log.push({ id, right, label, ms });
    if (right) {
      scores.set(id, (scores.get(id) || 0) + prPoints(ms));
      reveal();
    } else drawLog();
  }

  function play() {
    phase = 'play';
    log = [];
    lockUntil = 0;
    const item = items[q];
    startedAt = Date.now() + 800;
    const key = `${game}-${q}`;
    body.innerHTML = `<p class="label">${esc(t('quiz.qn', { i: q + 1, n: items.length }))}</p>
      <div class="pr-stage"><img src="${esc(tmdb.poster(item.poster, 'w500'))}" alt="" /><div class="pr-tiles" style="--cols:${COLS};--rows:${ROWS}"></div></div>
      <div class="frame-form pr-form"></div><p class="quiz-feedback" aria-live="polite"></p><ol class="frame-guesses pr-guesses"></ol>`;
    const picker = titlePicker((res) => {
      if (Date.now() < lockUntil) return toast(t('pr.wait'));
      const right = res.tmdb_id === item.id && res.media_type === item.mt;
      if (!right) {
        lockUntil = Date.now() + 3000;
        toast(t('pr.wrongWait'));
      }
      guess(ME, item, right, res.title.slice(0, 80));
    });
    body.querySelector('.pr-form').append(picker);
    clearInterval(clock);
    const tick = () => {
      const box = body.querySelector('.pr-tiles');
      if (!box || phase !== 'play') return clearInterval(clock);
      const frac = Math.min(1, Math.max(0.04, (Date.now() - startedAt) / (PR_SECONDS * 1000)));
      box.innerHTML = posterTiles(`bots-${key}`, frac);
      if (Date.now() > startedAt + PR_SECONDS * 1000 + 1500) reveal();
    };
    tick();
    clock = setInterval(tick, 500);
    // The bots
    const others = titles().filter((x) => x.id !== item.id);
    for (const b of bots) {
      if (Math.random() < b.knows) later(() => guess(b.id, item, true, ''), 800 + rand(6000, 22000));
      if (Math.random() < 0.45) later(() => guess(b.id, item, false, pickOne(others).title), 800 + rand(3500, 15000));
    }
  }

  function drawLog() {
    const box = body.querySelector('.pr-guesses');
    if (!box) return;
    box.innerHTML = log
      .map((m) => `<li class="${m.right ? 'ok' : 'bad'}">${m.right ? '🟩' : '🟥'} ${esc(nameOf(m.id))}${m.right ? '' : `: ${esc(m.label)}`}</li>`)
      .join('');
  }

  function reveal() {
    if (phase !== 'play') return;
    phase = 'reveal';
    clearInterval(clock);
    clearAll();
    const item = items[q];
    const w = winner();
    body.innerHTML = `<div class="pr-reveal"><img src="${esc(tmdb.poster(item.poster, 'w342'))}" alt="" /><div><p class="label">${esc(t('play.theAnswer'))}</p><p class="result-head">${esc(item.title)} <span class="muted">${esc(item.year)}</span></p>
      <p>${esc(w ? t('pr.got', { name: nameOf(w.id) }) : t('pr.nobody'))}</p></div></div>${scoreList(players, scores)}`;
    later(() => {
      q += 1;
      if (q >= items.length) done();
      else play();
    }, 3500);
  }

  function done() {
    phase = 'done';
    body.innerHTML = `<p class="result-head">${esc(t('quiz.final'))}</p>${scoreList(players, scores)}<button class="btn" type="button" data-again>${esc(t('play.playAgain'))}</button>`;
    body.querySelector('[data-again]').addEventListener('click', start);
  }

  lobby();
  return node;
}

// =====================================================================
// CinePictionary with bots
// =====================================================================

const PX_SECONDS = 80;
const COLORS = ['#f5ecd9', '#f2c25a', '#e0525e', '#4caf6a', '#5aa9f2', '#b07cf2'];
const RGB = COLORS.map((c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)));

async function stillOf(item) {
  const q = new URLSearchParams({ path: `${item.mt}/${item.id}/images`, include_image_language: 'null' });
  const r = await fetch(`/api/tmdb?${q}`);
  if (!r.ok) throw new Error('images');
  const data = await r.json();
  const list = (data.backdrops || []).filter((b) => b.width >= 1280).slice(0, 8);
  if (!list.length) throw new Error('no still');
  const pool = list.length > 2 ? list.slice(1) : list;
  return `${TMDB_IMG}w780${pickOne(pool).file_path}`;
}

/** Turn a still into pencil strokes: trace the strongest outlines in it. */
async function sketch(item) {
  const url = await stillOf(item);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  await img.decode();
  const W = 160;
  const H = 120;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true });
  const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  x.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
  const px = x.getImageData(0, 0, W, H).data; // throws if the image can't be read
  const gray = new Float32Array(W * H);
  for (let i = 0; i < W * H; i += 1) gray[i] = 0.3 * px[i * 4] + 0.59 * px[i * 4 + 1] + 0.11 * px[i * 4 + 2];
  const mag = new Float32Array(W * H);
  for (let y = 1; y < H - 1; y += 1)
    for (let xx = 1; xx < W - 1; xx += 1) {
      const g = (dx, dy) => gray[(y + dy) * W + xx + dx];
      const gx = -g(-1, -1) - 2 * g(-1, 0) - g(-1, 1) + g(1, -1) + 2 * g(1, 0) + g(1, 1);
      const gy = -g(-1, -1) - 2 * g(0, -1) - g(1, -1) + g(-1, 1) + 2 * g(0, 1) + g(1, 1);
      mag[y * W + xx] = Math.hypot(gx, gy);
    }
  const sorted = Array.from(mag).sort((a, b) => b - a);
  const cut = sorted[Math.floor(W * H * 0.11)] || 1;
  const edge = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i += 1) if (mag[i] >= cut) edge[i] = 1;
  const strokes = [];
  const N8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  for (let y = 1; y < H - 1; y += 1)
    for (let xx = 1; xx < W - 1; xx += 1) {
      if (!edge[y * W + xx]) continue;
      const pts = [];
      let cx = xx;
      let cy = y;
      let rs = 0;
      let gs = 0;
      let bs = 0;
      while (pts.length < 70) {
        edge[cy * W + cx] = 0;
        pts.push([cx, cy]);
        const k = (cy * W + cx) * 4;
        rs += px[k];
        gs += px[k + 1];
        bs += px[k + 2];
        const nb = N8.find(([dx, dy]) => edge[(cy + dy) * W + cx + dx]);
        if (!nb) break;
        cx += nb[0];
        cy += nb[1];
      }
      if (pts.length < 5) continue;
      // Pencil colour: the palette colour nearest the outline's own colour,
      // brightened so it shows on the dark board
      const avg = [rs, gs, bs].map((v) => Math.min(255, (v / pts.length) * 1.35 + 40));
      let best = 0;
      let bd = Infinity;
      RGB.forEach((p, i) => {
        const d = (p[0] - avg[0]) ** 2 + (p[1] - avg[1]) ** 2 + (p[2] - avg[2]) ** 2;
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      strokes.push({ c: best, w: 3, p: pts.filter((_, i) => i % 2 === 0 || i === pts.length - 1).map(([a, b]) => [a / W, b / H]) });
    }
  // Long outlines first, as a person would block in the big shapes
  strokes.sort((a, b) => b.p.length - a.p.length);
  return strokes.slice(0, 420);
}

export function pictionaryBots() {
  const node = document.createElement('section');
  node.className = 'page game pictionary';
  header(node, { path: '/games/pictionary', name: 'CinePictionary' });
  const body = el('<div class="imp-body"></div>');
  node.append(body);
  const { later, clearAll } = timers(node);
  const bots = makeBots(2);
  const players = [{ id: ME, name: t('wl.you') }, ...bots];
  const nameOf = (id) => players.find((p) => p.id === id).name;
  let turns = [];
  let ti = 0;
  let item = null;
  let strokes = [];
  let log = [];
  let scores = new Map();
  let startedAt = 0;
  let phase = 'lobby';
  let canvas = null;
  let clock = null;

  const guessers = () => players.filter((p) => p.id !== turns[ti]);
  const solvedBy = (id) => log.some((m) => m.id === id && m.right);

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
    const box = canvas.getBoundingClientRect();
    canvas.width = Math.round(box.width * (window.devicePixelRatio || 1));
    canvas.height = Math.round(box.width * 0.75 * (window.devicePixelRatio || 1));
    paint();
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
    });
    body.querySelector('[data-undo]').addEventListener('click', () => {
      strokes.pop();
      paint();
    });
  }

  function lobby() {
    body.innerHTML = `<p class="lead">${esc(t('bots.pxLead'))}</p>
      <div class="board-list">${players.map((p) => `<div class="board-row${p.id === ME ? ' is-me' : ''}"><span class="board-name">${esc(p.name)}</span></div>`).join('')}</div>
      <button class="btn" type="button" data-start>▶ ${esc(t('quiz.startGame'))}</button>`;
    body.querySelector('[data-start]').addEventListener('click', start);
  }

  function start() {
    clearAll();
    turns = [bots[0].id, ME, bots[1].id];
    scores = new Map(players.map((p) => [p.id, 0]));
    ti = 0;
    turn();
  }

  function addGuess(id, right, label) {
    if (phase !== 'draw' || solvedBy(id)) return;
    log.push({ id, right, label });
    if (right) {
      const i = log.filter((m) => m.right).length - 1;
      scores.set(id, (scores.get(id) || 0) + Math.max(50, 150 - 25 * i));
      scores.set(turns[ti], (scores.get(turns[ti]) || 0) + 50);
    }
    drawLog();
    if (guessers().every((p) => solvedBy(p.id))) later(reveal, 600);
  }

  function drawLog() {
    const box = body.querySelector('.px-log');
    if (!box) return;
    box.innerHTML = log
      .map((m) => `<li class="${m.right ? 'ok' : 'bad'}">${m.right ? `🟩 ${esc(t('px.gotIt', { name: nameOf(m.id) }))}` : `🟥 ${esc(nameOf(m.id))}: ${esc(m.label || '')}`}</li>`)
      .join('');
    const form = body.querySelector('.px-guess');
    if (form) form.hidden = solvedBy(ME);
  }

  async function turn() {
    phase = 'loading';
    strokes = [];
    log = [];
    canvas = null;
    const drawerId = turns[ti];
    const drawer = drawerId === ME;
    body.innerHTML = `<div class="loading-box"><span class="spinner"></span>${esc(drawer ? t('ui.loading') : t('bots.sketching', { name: nameOf(drawerId) }))}</div>`;
    let plan = null;
    const pool = mix(titles());
    if (drawer) item = pool[0];
    else {
      for (const cand of pool.slice(0, 4)) {
        plan = await sketch(cand).catch((err) => {
          console.warn(err);
          return null;
        });
        if (plan && plan.length > 30) {
          item = cand;
          break;
        }
      }
      if (!plan) {
        toast(t('bots.cantDraw', { name: nameOf(drawerId) }));
        return next();
      }
    }
    if (!node.isConnected) return;
    phase = 'draw';
    startedAt = Date.now() + 600;
    body.innerHTML = `<div class="px-top"><span class="chip">${esc(t('px.turn', { i: ti + 1, n: turns.length }))}</span><span class="quiz-time" data-time></span></div>
      <p class="imp-step">${drawer ? esc(t('px.drawThis', { title: item.title })) : esc(t('px.guessThis', { name: nameOf(drawerId) }))}</p>
      <canvas class="px-canvas" aria-label="${esc(t('px.canvas'))}"></canvas>
      ${
        drawer
          ? `<div class="px-tools">${COLORS.map((c, i) => `<button type="button" class="px-color${i === 0 ? ' on' : ''}" data-color="${i}" style="--c:${c}" aria-label="${esc(t('px.color'))} ${i + 1}"></button>`).join('')}
        <button type="button" class="btn btn-ghost btn-small" data-undo>↶ ${esc(t('dg.undo'))}</button><button type="button" class="btn btn-ghost btn-small" data-clear>${esc(t('px.clear'))}</button></div>
        <p class="muted">${esc(t('px.noLetters'))} ${esc(t('bots.drawNote'))}</p>`
          : '<div class="frame-form px-guess"></div>'
      }
      <ol class="frame-guesses px-log"></ol>`;
    setupCanvas(drawer);
    const others = titles().filter((x) => x.id !== item.id);
    if (!drawer) {
      const picker = titlePicker((res) => {
        const right = res.tmdb_id === item.id && res.media_type === item.mt;
        toast(right ? t('quiz.right') : t('fg.notIt'));
        addGuess(ME, right, res.title.slice(0, 80));
      });
      body.querySelector('.px-guess').append(picker);
      // The bot draws its sketch over about 50 seconds
      const total = plan.length;
      plan.forEach((s, i) => later(() => {
        if (phase !== 'draw') return;
        strokes.push(s);
        paint();
      }, 600 + Math.round(48000 * (i / total) ** 0.8)));
      // The other bot guesses
      for (const b of bots.filter((x) => x.id !== drawerId)) {
        if (Math.random() < 0.6) later(() => addGuess(b.id, true, ''), 600 + rand(22000, 70000));
        later(() => addGuess(b.id, false, pickOne(others).title), 600 + rand(8000, 30000));
      }
    } else {
      // Bots can't see your drawing: the more you draw, the likelier they get it
      const guessTick = () => {
        if (phase !== 'draw') return;
        const n = strokes.length;
        for (const b of bots) {
          if (solvedBy(b.id) || n < 3) continue;
          if (Math.random() < 0.012 * Math.min(n, 25)) addGuess(b.id, true, '');
          else if (Math.random() < 0.025) addGuess(b.id, false, pickOne(others).title);
        }
        later(guessTick, 1000);
      };
      later(guessTick, 1500);
    }
    clearInterval(clock);
    clock = setInterval(() => {
      const box = body.querySelector('[data-time]');
      if (!box || phase !== 'draw') return clearInterval(clock);
      const left = Math.ceil((startedAt + PX_SECONDS * 1000 - Date.now()) / 1000);
      box.textContent = `${Math.max(0, left)}s`;
      if (left < -1) reveal();
    }, 500);
  }

  function reveal() {
    if (phase !== 'draw') return;
    phase = 'reveal';
    clearInterval(clock);
    clearAll();
    canvas = null;
    body.innerHTML = `<p class="label">${esc(t('play.theAnswer'))}</p><p class="result-head">${esc(item.title)} <span class="muted">${esc(item.year)}</span></p>
      <p class="muted">${esc(t('px.solvedBy', { n: log.filter((m) => m.right).length }))}</p>${scoreList(players, scores)}`;
    later(next, 4000);
  }

  function next() {
    ti += 1;
    if (ti < turns.length) return turn();
    phase = 'done';
    body.innerHTML = `<p class="result-head">${esc(t('quiz.final'))}</p>${scoreList(players, scores)}<button class="btn" type="button" data-again>${esc(t('play.playAgain'))}</button>`;
    body.querySelector('[data-again]').addEventListener('click', start);
  }

  lobby();
  return node;
}
