// CineQuiz: 10-question rounds on plots, creators, years, cast and taglines,
// written automatically from TMDB details (no AI). Practice with filters,
// friend rooms (fastest correct answer scores most) and challenge links.
import { t, getLang } from '../i18n.js';
import * as db from '../data.js';
import * as tmdb from '../tmdb.js';
import { track } from '../loading.js';
import { store } from '../store.js';
import { esc, el, frag, toast, openSheet } from '../ui.js';
import { share, challengeUrl, boardHtml, ensureName } from './common.js';
import { createRoom, joinRoom, getRoom, roomPeople, patchRoom, liveRoom, whilePresent, ensureRoomName, me } from '../rooms.js';

const API_LANG = { en: 'en-US', 'zh-CN': 'zh-CN', es: 'es-ES' };
const ROUND = 10;
const SECONDS = 15;
const go = (href) => document.dispatchEvent(new CustomEvent('cinenjoy:navigate', { detail: href }));

async function api(path, params = {}) {
  const q = new URLSearchParams({ path, language: API_LANG[getLang()] || 'en-US', ...params });
  for (let i = 0; i < 3; i += 1) {
    const r = await fetch(`/api/tmdb?${q}`).catch(() => null);
    if (r && r.ok) return r.json();
    await new Promise((res) => setTimeout(res, 400 * (i + 1)));
  }
  throw new Error('tmdb');
}

const shuffle = (a) => {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};
const pickN = (a, n) => shuffle(a).slice(0, n);

// ---------- Writing the questions ----------

export const DEFAULT_FILTERS = { difficulty: 'medium', medium: 'all', language: '', region: '' };

async function pool(f) {
  const narrow = f.language || f.region;
  const votes = { easy: narrow ? 800 : 6000, medium: narrow ? 200 : 1500, hard: narrow ? 40 : 300 }[f.difficulty] || 1500;
  const pages = { easy: [1, 2, 3], medium: [1, 2, 3, 4, 5, 6], hard: [2, 4, 6, 8, 10, 12] }[f.difficulty] || [1, 2, 3];
  const kinds = f.medium === 'tv' ? ['tv'] : f.medium === 'movie' ? ['movie'] : f.medium === 'anime' ? ['tv', 'movie'] : ['movie', 'movie', 'tv'];
  const params = (mt) => ({
    sort_by: 'vote_count.desc',
    'vote_count.gte': votes,
    ...(f.language ? { with_original_language: f.language } : {}),
    ...(f.region ? { with_origin_country: f.region } : {}),
    ...(f.medium === 'anime' ? { with_genres: '16', with_original_language: 'ja' } : {}),
    ...(mt === 'tv' && f.medium !== 'anime' && f.medium !== 'tv' ? { without_genres: '10767,10763,10764' } : {}),
  });
  const chosen = pickN(pages, 2);
  const lists = await Promise.all(
    chosen.flatMap((p) => kinds.slice(0, 2).map((mt) => api(`discover/${mt}`, { ...params(mt), page: p }).then((d) => (d.results || []).map((r) => ({ ...r, media_type: mt }))).catch(() => []))),
  );
  const seen = new Set();
  return lists.flat().filter((r) => r.overview && !seen.has(`${r.media_type}:${r.id}`) && seen.add(`${r.media_type}:${r.id}`));
}

const titleOf = (r) => r.title || r.name || '';
const yearOf = (r) => String(r.release_date || r.first_air_date || '').slice(0, 4);

function mask(text, title) {
  let out = text;
  const words = title.split(/[\s:,.-]+/).filter((w) => w.length > 2);
  for (const w of [title, ...words]) out = out.split(w).join('▒▒▒');
  return out.length > 380 ? `${out.slice(0, 370).replace(/\s+\S*$/, '')}…` : out;
}

/** Ten questions from the filters. Each: { type, prompt, options, answer, title, poster } */
export async function makeQuestions(filters) {
  const all = await pool(filters);
  if (all.length < 8) throw new Error('not enough titles');
  const targets = pickN(all, Math.min(14, all.length));
  const full = (
    await Promise.all(targets.map((r) => api(`${r.media_type}/${r.id}`, { append_to_response: 'credits' }).then((d) => ({ ...d, media_type: r.media_type })).catch(() => null)))
  ).filter(Boolean);
  const makerOf = (d) =>
    d.media_type === 'movie' ? ((d.credits && d.credits.crew) || []).find((c) => c.job === 'Director')?.name : ((d.created_by || [])[0] || {}).name;
  const leadOf = (d) => (((d.credits && d.credits.cast) || [])[0] || {}).name;
  const makers = [...new Set(full.map(makerOf).filter(Boolean))];
  const leads = [...new Set(full.map(leadOf).filter(Boolean))];
  const used = { year: 0, maker: 0, cast: 0, plot: 0, tagline: 0 };
  const questions = [];

  for (const d of full) {
    if (questions.length >= ROUND) break;
    const name = titleOf(d);
    const y = Number(yearOf(d));
    const others = (pred) => pickN(all.filter((r) => r.id !== d.id && pred(r)), 3).map(titleOf);
    const types = shuffle(['plot', 'year', 'maker', 'cast', 'tagline']).filter((k) => used[k] < 3);
    for (const type of types) {
      let q = null;
      if (type === 'year' && y) {
        const offs = pickN([-4, -3, -2, -1, 1, 2, 3, 4], 3);
        const opts = shuffle([y, ...offs.map((o) => y + o)]);
        q = { prompt: t('quiz.q.year', { title: name }), options: opts.map(String), answer: opts.indexOf(y) };
      } else if (type === 'maker' && makerOf(d) && makers.length >= 4) {
        const right = makerOf(d);
        const opts = shuffle([right, ...pickN(makers.filter((m) => m !== right), 3)]);
        q = { prompt: t(d.media_type === 'movie' ? 'quiz.q.director' : 'quiz.q.creator', { title: name }), options: opts, answer: opts.indexOf(right) };
      } else if (type === 'cast' && leadOf(d) && leads.length >= 4) {
        const right = leadOf(d);
        const opts = shuffle([right, ...pickN(leads.filter((m) => m !== right), 3)]);
        q = { prompt: t('quiz.q.cast', { title: name }), options: opts, answer: opts.indexOf(right) };
      } else if (type === 'plot' && d.overview) {
        const wrong = others((r) => r.media_type === d.media_type);
        if (wrong.length === 3) {
          const opts = shuffle([name, ...wrong]);
          q = { prompt: t('quiz.q.plot'), quote: mask(d.overview, name), options: opts, answer: opts.indexOf(name) };
        }
      } else if (type === 'tagline' && d.tagline) {
        const wrong = others(() => true);
        if (wrong.length === 3) {
          const opts = shuffle([name, ...wrong]);
          q = { prompt: t('quiz.q.tagline'), quote: `“${d.tagline}”`, options: opts, answer: opts.indexOf(name) };
        }
      }
      if (q && new Set(q.options).size === 4) {
        used[type] += 1;
        questions.push({ type, ...q, title: name, year: yearOf(d), poster: d.poster_path || null, media_type: d.media_type, tmdb_id: d.id });
        break;
      }
    }
  }
  if (questions.length < 5) throw new Error('not enough questions');
  return questions;
}

export const points = (correct, ms) => (correct ? 500 + Math.round(500 * Math.max(0, 1 - ms / (SECONDS * 1000))) : 0);

// ---------- Shared question screen ----------

function questionView(q, i, n, { onAnswer, endsAt }) {
  const box = el(`
    <div class="quiz-q">
      <div class="quiz-top"><span class="chip">${esc(t('quiz.qn', { i: i + 1, n }))}</span><span class="quiz-time" data-time></span></div>
      <div class="quiz-bar"><span data-bar></span></div>
      <h2 class="quiz-prompt">${esc(q.prompt)}</h2>
      ${q.quote ? `<blockquote class="quiz-quote">${esc(q.quote)}</blockquote>` : ''}
      <div class="quiz-options">${q.options
        .map((o, k) => `<button type="button" class="quiz-opt" data-k="${k}"><span class="opt-key">${'ABCD'[k]}</span><span>${esc(o)}</span></button>`)
        .join('')}</div>
      <p class="quiz-feedback" aria-live="polite"></p>
    </div>`);
  const started = Date.now();
  let done = false;
  const bar = box.querySelector('[data-bar]');
  const timeEl = box.querySelector('[data-time]');
  const finish = (k) => {
    if (done) return;
    done = true;
    clearInterval(timer);
    const ms = Date.now() - started;
    box.querySelectorAll('.quiz-opt').forEach((b) => {
      b.disabled = true;
      if (Number(b.dataset.k) === q.answer) b.classList.add('right');
      if (Number(b.dataset.k) === k && k !== q.answer) b.classList.add('wrong');
    });
    const fb = box.querySelector('.quiz-feedback');
    fb.textContent = k === q.answer ? t('quiz.right') : k == null ? t('quiz.timeUp', { a: q.options[q.answer] }) : t('quiz.wrong', { a: q.options[q.answer] });
    fb.className = `quiz-feedback ${k === q.answer ? 'ok' : 'bad'}`;
    onAnswer(k, ms);
  };
  const end = endsAt || started + SECONDS * 1000;
  const timer = setInterval(() => {
    if (!box.isConnected) return clearInterval(timer);
    const left = Math.max(0, end - Date.now());
    bar.style.width = `${(left / (SECONDS * 1000)) * 100}%`;
    timeEl.textContent = `${Math.ceil(left / 1000)}s`;
    if (left <= 0) finish(null);
  }, 100);
  box.querySelectorAll('.quiz-opt').forEach((b) => b.addEventListener('click', () => finish(Number(b.dataset.k))));
  box.keyHandler = (e) => {
    const k = 'abcd1234'.indexOf(e.key.toLowerCase());
    if (k >= 0 && !done && box.isConnected) finish(k % 4);
  };
  document.addEventListener('keydown', box.keyHandler);
  box.cleanup = () => document.removeEventListener('keydown', box.keyHandler);
  return box;
}

function filtersForm(f) {
  const opt = (name, values, label) =>
    `<label class="tool"><span>${esc(t(`quiz.f.${name}`))}</span><select data-f="${name}">${values
      .map((v) => `<option value="${esc(v)}"${f[name] === v ? ' selected' : ''}>${esc(label(v))}</option>`)
      .join('')}</select></label>`;
  let langName;
  let regionName;
  try {
    langName = new Intl.DisplayNames([getLang()], { type: 'language' });
    regionName = new Intl.DisplayNames([getLang()], { type: 'region' });
  } catch {
    langName = regionName = { of: (x) => x };
  }
  return `<div class="toolbar quiz-filters">
    ${opt('difficulty', ['easy', 'medium', 'hard'], (v) => t(`quiz.d.${v}`))}
    ${opt('medium', ['all', 'movie', 'tv', 'anime'], (v) => (v === 'all' ? t('wl.all') : t(`medium.${v === 'movie' ? 'film' : v === 'tv' ? 'series' : 'anime'}`)))}
    ${opt('language', ['', 'en', 'ko', 'ja', 'zh', 'hi', 'es', 'fr', 'it', 'de'], (v) => (v ? langName.of(v) : t('quiz.any')))}
    ${opt('region', ['', 'US', 'GB', 'KR', 'JP', 'CN', 'IN', 'ES', 'MX', 'FR'], (v) => (v ? regionName.of(v) : t('quiz.any')))}
  </div>`;
}
const readFilters = (box) => Object.fromEntries([...box.querySelectorAll('[data-f]')].map((s) => [s.dataset.f, s.value]));

// ---------- Solo: practice and challenge ----------

export function quizPage(mode = 'practice', challengeId) {
  const node = document.createElement('section');
  node.className = 'page game quiz';
  const head = el(`<header class="game-head">
    <a class="back" href="/games" data-link>‹ ${esc(t('nav.games'))}</a>
    <div class="game-title-row"><h1>CineQuiz</h1><span class="chip">${esc(mode === 'challenge' ? t('play.challenge') : t('play.practice'))}</span></div>
  </header>`);
  const body = el('<div class="quiz-body"></div>');
  node.append(head, body);
  let filters = { ...DEFAULT_FILTERS, ...(store.get('quizFilters') || {}) };
  let challenge = null;

  function setup() {
    body.replaceChildren(
      frag(`
      <p class="lead">${esc(t('quiz.lead'))}</p>
      ${filtersForm(filters)}
      <div class="row-start quiz-start">
        <button class="btn" type="button" data-solo>▶ ${esc(t('quiz.startSolo'))}</button>
        <button class="btn btn-ghost" type="button" data-room>👥 ${esc(t('quiz.startRoom'))}</button>
      </div>
      <form class="join-form quiz-join"><input type="text" maxlength="120" placeholder="${esc(t('mn.codePlaceholder'))}" aria-label="${esc(t('quiz.joinRoom'))}" />
        <button class="btn btn-ghost" type="submit">${esc(t('wl.joinBtn'))}</button></form>`),
    );
    body.querySelector('[data-solo]').addEventListener('click', async () => {
      filters = readFilters(body);
      store.set('quizFilters', filters);
      await startSolo();
    });
    body.querySelector('[data-room]').addEventListener('click', async () => {
      filters = readFilters(body);
      store.set('quizFilters', filters);
      if (!(await ensureRoomName())) return;
      try {
        const room = await track(createRoom('quiz', { title: 'CineQuiz', state: { filters, phase: 'lobby' } }));
        go(`/games/quiz/room/${room.id}`);
      } catch (err) {
        console.warn(err);
        toast(t('errors.generic'), 'error');
      }
    });
    body.querySelector('.quiz-join').addEventListener('submit', (e) => {
      e.preventDefault();
      const raw = e.currentTarget.querySelector('input').value.trim();
      const code = (raw.match(/join\/([A-Za-z0-9]+)/) || [null, raw])[1].replace(/[^A-Za-z0-9]/g, '');
      if (code) go(`/games/quiz/join/${code}`);
    });
  }

  async function startSolo(questions) {
    body.replaceChildren(el(`<div class="loading-box"><span class="spinner"></span>${esc(t('quiz.writing'))}</div>`));
    try {
      const qs = questions || (await track(makeQuestions(filters)));
      play(qs);
    } catch (err) {
      console.warn(err);
      body.replaceChildren(el(`<div class="error-box"><p>${esc(t('quiz.cantWrite'))}</p></div>`));
      setTimeout(setup, 2500);
    }
  }

  function play(qs) {
    const answers = [];
    let i = 0;
    const next = () => {
      if (i >= qs.length) return finish(qs, answers);
      const view = questionView(qs[i], i, qs.length, {
        onAnswer: (k, ms) => {
          answers.push({ k, ms, correct: k === qs[i].answer });
          setTimeout(() => {
            view.cleanup();
            i += 1;
            next();
          }, 1600);
        },
      });
      body.replaceChildren(view);
    };
    next();
  }

  async function finish(qs, answers) {
    const right = answers.filter((a) => a.correct).length;
    const score = answers.reduce((s, a) => s + points(a.correct, a.ms), 0);
    const result = { won: right >= Math.ceil(qs.length / 2), score, hintUsed: false };
    body.replaceChildren(
      frag(`<div class="result-box quiz-done">
        <p class="result-head">${esc(t('quiz.done', { r: right, n: qs.length }))}</p>
        <p class="quiz-points">${score} <span>${esc(t('quiz.points'))}</span></p>
        <div class="result-actions">
          <button class="btn" type="button" data-share>${esc(t('play.shareResult'))}</button>
          ${mode !== 'challenge' ? `<button class="btn btn-ghost" type="button" data-challenge>${esc(t('play.challengeFriend'))}</button>` : ''}
          <button class="btn btn-ghost" type="button" data-again>${esc(t('play.playAgain'))}</button>
        </div>
        <div data-board></div>
        <ol class="quiz-review">${qs
          .map((q, k) => `<li class="${answers[k] && answers[k].correct ? 'ok' : 'bad'}"><b>${answers[k] && answers[k].correct ? '✓' : '✕'}</b> ${esc(q.prompt)} <span class="muted">${esc(q.options[q.answer])}</span></li>`)
          .join('')}</ol>
      </div>`),
    );
    const shareText = `CINENJOY CineQuiz ${right}/${qs.length} · ${score} ${t('quiz.points')}\n${answers.map((a) => (a.correct ? '🟩' : '🟥')).join('')}`;
    body.querySelector('[data-share]').addEventListener('click', () =>
      share(shareText, mode === 'challenge' ? challengeUrl('quiz', challenge.id) : `${location.origin}/games/quiz`),
    );
    body.querySelector('[data-again]').addEventListener('click', () => (mode === 'challenge' ? go('/games/quiz') : startSolo()));
    const ch = body.querySelector('[data-challenge]');
    if (ch)
      ch.addEventListener('click', async () => {
        ch.disabled = true;
        try {
          await ensureName();
          const id = await track(db.createChallenge('quiz', { questions: qs, lang: getLang() }, result));
          await share(t('play.challengeText', { game: 'CineQuiz' }), challengeUrl('quiz', id));
        } catch (err) {
          console.warn(err);
          toast(t('errors.generic'), 'error');
        } finally {
          ch.disabled = false;
        }
      });
    try {
      if (mode === 'challenge') {
        await ensureName();
        await db.saveChallengeResult(challenge.id, result);
        const rows = await db.challengeBoard(challenge.id);
        body.querySelector('[data-board]').innerHTML = boardHtml(rows, (r) => `${r.score}`);
      } else {
        await db.saveResult({ game: 'quiz', mode: 'practice', puzzleKey: `q-${Date.now().toString(36)}`, won: result.won, score, detail: { right, n: qs.length, filters } });
      }
    } catch (err) {
      console.warn('result not saved', err);
    }
  }

  if (mode === 'challenge') {
    body.replaceChildren(el(`<div class="loading-box"><span class="spinner"></span>${esc(t('ui.loading'))}</div>`));
    track(db.getChallenge(challengeId))
      .then((c) => {
        challenge = c;
        if (!c || c.game !== 'quiz' || !c.puzzle || !Array.isArray(c.puzzle.questions)) throw new Error('missing');
        body.replaceChildren(
          frag(`<p class="lead">${esc(t('quiz.challengeIntro', { n: c.puzzle.questions.length }))}</p>
            <button class="btn" type="button" data-go>▶ ${esc(t('quiz.startSolo'))}</button>`),
        );
        body.querySelector('[data-go]').addEventListener('click', () => play(c.puzzle.questions));
      })
      .catch(() => body.replaceChildren(el(`<div class="error-box"><p>${esc(t('play.challengeMissing'))}</p></div>`)));
  } else setup();
  return node;
}

// ---------- Friend room ----------

export function quizJoinPage(code) {
  const node = el(`<section class="page game quiz"><div class="loading-box"><span class="spinner"></span>${esc(t('ui.loading'))}</div></section>`);
  (async () => {
    try {
      if (!(await ensureRoomName())) throw new Error('name');
      const id = await track(joinRoom(code));
      go(`/games/quiz/room/${id}`);
    } catch (err) {
      node.replaceChildren(el(`<div class="error-box"><p>${esc(t('mn.notFound'))}</p></div>`));
    }
  })();
  return node;
}

export function quizRoomPage(roomId) {
  const node = document.createElement('section');
  node.className = 'page game quiz quiz-room';
  const head = el('<header class="game-head"></header>');
  const body = el('<div class="quiz-body"></div>');
  node.append(head, body);
  body.append(el(`<div class="loading-box"><span class="spinner"></span>${esc(t('ui.loading'))}</div>`));
  let room = null;
  let people = [];
  let moves = [];
  let uid = null;
  let online = new Set();
  let shownQ = -1;
  let shownPhase = '';
  let view = null;
  let hostTimer = null;
  let savedRound = null;
  const rk = (q) => ((st().round || 1) * 100) + q; // answers are stored per round and question

  const isHost = () => room && room.host_id === uid;
  const st = () => room.state || {};

  async function load(first) {
    try {
      uid = uid || (await me());
      const { sb } = await db.supa();
      const [r, p, m] = await Promise.all([
        getRoom(roomId),
        roomPeople(roomId),
        sb.from('room_moves').select('user_id, kind, round, data').eq('room_id', roomId).eq('kind', 'answer').then(({ data, error }) => {
          if (error) throw error;
          return data;
        }),
      ]);
      if (!node.isConnected) return;
      if (!r) {
        body.replaceChildren(el(`<div class="error-box"><p>${esc(t('mn.notFound'))}</p></div>`));
        return;
      }
      room = r;
      people = p;
      moves = m;
      if (first) {
        const live = liveRoom(roomId, { tables: ['room_moves'], onChange: () => load(), onPresence: (ids) => { online = new Set(ids); render(); } });
        whilePresent(node, live);
      }
      render();
      if (isHost()) hostTick();
    } catch (err) {
      console.warn(err);
    }
  }

  function scores() {
    const s = new Map(people.map((p) => [p.user_id, 0]));
    for (const m of moves) {
      if (Math.floor(m.round / 100) !== (st().round || 1)) continue;
      const q = (st().questions || [])[m.round % 100];
      if (!q) continue;
      s.set(m.user_id, (s.get(m.user_id) || 0) + points(m.data.k === q.answer, m.data.ms || SECONDS * 1000));
    }
    return people.map((p) => ({ ...p, score: s.get(p.user_id) || 0 })).sort((a, b) => b.score - a.score);
  }

  function boardList() {
    return `<div class="board-list">${scores()
      .map((p, i) => `<div class="board-row${p.me ? ' is-me' : ''}"><span class="board-rank">${i + 1}</span><span class="board-name">${esc(p.me ? t('wl.you') : p.name || t('wl.friend'))}${online.has(p.user_id) ? ' <span class="dot-on">●</span>' : ''}</span><span class="board-score">${p.score}</span></div>`)
      .join('')}</div>`;
  }

  function render() {
    const s = st();
    const link = `${location.origin}/games/quiz/join/${room.code}`;
    head.innerHTML = `<a class="back" href="/games/quiz" data-link>‹ CineQuiz</a>
      <div class="game-title-row"><h1>CineQuiz</h1><span class="chip">${esc(t('quiz.room'))} · ${esc(room.code)}</span></div>`;
    if (s.phase === 'lobby' || !s.phase) {
      shownPhase = 'lobby';
      body.innerHTML = `<p class="lead">${esc(t('quiz.lobbyLead'))}</p>
        <div class="share-box form"><label class="field"><span>${esc(t('wl.inviteLink'))}</span><input type="text" readonly value="${esc(link)}" /></label>
        <div class="row-end"><button class="btn btn-ghost" type="button" data-copy>${esc(t('wl.copyLink'))}</button></div></div>
        <h2 class="group-title">${esc(t('quiz.players', { n: people.length }))}</h2>${boardList()}
        ${isHost() ? `<button class="btn" type="button" data-start>▶ ${esc(t('quiz.startGame'))}</button>` : `<p class="muted">${esc(t('quiz.waitHost'))}</p>`}`;
      body.querySelector('[data-copy]').addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(link);
          toast(t('wl.linkCopied'));
        } catch {
          /* fine */
        }
      });
      const start = body.querySelector('[data-start]');
      if (start) start.addEventListener('click', () => hostStart(start));
      return;
    }
    if (s.phase === 'question') {
      const q = s.questions[s.q];
      const mine = moves.find((m) => m.user_id === uid && m.round === rk(s.q));
      if (shownQ !== s.q || shownPhase !== 'question') {
        shownQ = s.q;
        shownPhase = 'question';
        if (view && view.cleanup) view.cleanup();
        view = questionView(q, s.q, s.questions.length, {
          onAnswer: async (k, ms) => {
            if (mine) return;
            try {
              const { sb } = await db.supa();
              await sb.from('room_moves').insert({ room_id: roomId, user_id: uid, kind: 'answer', round: rk(s.q), data: { k, ms: Math.min(ms, SECONDS * 1000) } });
            } catch (err) {
              console.warn(err);
            }
          },
        });
        body.replaceChildren(view, el(`<p class="muted answered" aria-live="polite"></p>`));
      }
      const n = moves.filter((m) => m.round === rk(s.q)).length;
      const a = body.querySelector('.answered');
      if (a) a.textContent = t('quiz.answered', { n, of: people.length });
      return;
    }
    if (s.phase === 'reveal' || s.phase === 'done') {
      if (view && view.cleanup) view.cleanup();
      shownPhase = s.phase;
      const q = s.questions[s.q];
      body.innerHTML = `${
        s.phase === 'reveal'
          ? `<p class="label">${esc(t('quiz.qn', { i: s.q + 1, n: s.questions.length }))}</p><p class="result-head">${esc(q.options[q.answer])}</p><p class="muted">${esc(q.prompt)}</p>`
          : `<p class="result-head">${esc(t('quiz.final'))}</p>`
      }${boardList()}
      ${s.phase === 'done' && isHost() ? `<button class="btn" type="button" data-again>${esc(t('play.playAgain'))}</button>` : ''}`;
      const again = body.querySelector('[data-again]');
      if (again) again.addEventListener('click', () => hostStart(again));
      if (s.phase === 'done' && savedRound !== s.round) {
        savedRound = s.round;
        const mine = scores().find((p) => p.user_id === uid);
        db.saveResult({ game: 'quiz', mode: 'practice', puzzleKey: `room-${roomId}-${s.round || 0}`, won: scores()[0] && scores()[0].user_id === uid, score: mine ? mine.score : 0, detail: { room: roomId } }).catch(() => {});
      }
    }
  }

  async function hostStart(btn) {
    btn.disabled = true;
    try {
      const qs = await track(makeQuestions(st().filters || DEFAULT_FILTERS));
      room = await patchRoom(roomId, { state: { questions: qs, q: 0, phase: 'question', startedAt: Date.now() + 1500, round: (st().round || 0) + 1 } });
      render();
      hostTick();
    } catch (err) {
      console.warn(err);
      btn.disabled = false;
      toast(t('quiz.cantWrite'), 'error');
    }
  }

  // The host's page moves the game on: after everyone answers or time runs out,
  // show the answer for a few seconds, then the next question.
  function hostTick() {
    clearTimeout(hostTimer);
    if (!node.isConnected || !isHost()) return;
    const s = st();
    if (s.phase === 'question') {
      const answeredAll = moves.filter((m) => m.round === rk(s.q)).length >= people.length;
      const timeUp = Date.now() > s.startedAt + SECONDS * 1000 + 1500;
      if (answeredAll || timeUp) {
        patchRoom(roomId, { state: { phase: 'reveal', revealAt: Date.now() } }).then((r) => {
          room = r;
          render();
          hostTimer = setTimeout(hostTick, 3500);
        });
        return;
      }
      hostTimer = setTimeout(hostTick, 700);
    } else if (s.phase === 'reveal') {
      if (Date.now() - (s.revealAt || 0) < 3200) {
        hostTimer = setTimeout(hostTick, 400);
        return;
      }
      const last = s.q + 1 >= s.questions.length;
      patchRoom(roomId, { state: last ? { phase: 'done' } : { phase: 'question', q: s.q + 1, startedAt: Date.now() + 800 } }).then((r) => {
        room = r;
        render();
        hostTimer = setTimeout(hostTick, 900);
      });
    }
  }

  load(true);
  return node;
}
