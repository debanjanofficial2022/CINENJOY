// CineWordle: guess a popular film (sometimes a series) title of any length in
// six tries. Each green letter you find unlocks a clear clue, each yellow letter
// a vague one. Daily (same title for everyone that day), practice (unlimited)
// and challenge links.
import { t, getLang } from '../i18n.js';
import * as db from '../data.js';
import { track } from '../loading.js';
import { esc, el, frag, toast, openSheet } from '../ui.js';
import { ANSWERS } from './wordle-data.js';
import { FRAMES } from './frame-data.js';
import {
  todayKey, dayNumber, hashString, rng, shuffle, msToMidnight, fmtCountdown,
  loadState, saveState, nextPractice, keyboard, listenKeys, ensureName, stats, statsHtml, share, challengeUrl, boardHtml, titleCard,
} from './common.js';

const TRIES = 6;

// Answers: popular titles of any length (4 to 14 letters, up to three words),
// mostly films. Spaces show as gaps on the board and are not typed.
const clean = (s) =>
  String(s)
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/['’]/g, '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
export const POOL = (() => {
  const out = [];
  const seen = new Set();
  for (const [tv, id, title, year] of FRAMES) {
    if (/\d/.test(title)) continue;
    const w = clean(title);
    const n = w.replace(/ /g, '').length;
    if (n < 4 || n > 14 || w.split(' ').length > 3) continue;
    const mt = tv ? 'tv' : 'movie';
    if (seen.has(`${mt}/${id}`)) continue;
    seen.add(`${mt}/${id}`);
    out.push({ w, mt, id, title, y: year });
  }
  // Well-known one-word films from the earlier word list
  for (const a of ANSWERS) {
    if (a.mt !== 'movie' || seen.has(`movie/${a.id}`)) continue;
    seen.add(`movie/${a.id}`);
    out.push({ w: a.w, mt: 'movie', id: a.id, title: a.w.charAt(0) + a.w.slice(1).toLowerCase(), y: a.y });
  }
  return out;
})();
const ORDER = shuffle(
  POOL.map((_, i) => i),
  rng(hashString('cinejoy-cinewordle-any-length-v2')),
);
const SAVE = 'cinewordle2'; // new save names: answers of any length

const go = (href) => document.dispatchEvent(new CustomEvent('cinenjoy:navigate', { detail: href }));

export function dailyIndex(key = todayKey()) {
  const n = dayNumber(key);
  return ORDER[(((n - 1) % ORDER.length) + ORDER.length) % ORDER.length];
}

/** Green, yellow, grey for one guess, counting repeated letters correctly. */
export function score(guess, answer) {
  const res = Array(answer.length).fill('absent');
  const left = {};
  for (let i = 0; i < answer.length; i += 1) {
    if (guess[i] === answer[i]) res[i] = 'correct';
    else left[answer[i]] = (left[answer[i]] || 0) + 1;
  }
  for (let i = 0; i < answer.length; i += 1) {
    if (res[i] === 'correct') continue;
    if (left[guess[i]]) {
      res[i] = 'present';
      left[guess[i]] -= 1;
    }
  }
  return res;
}

const EMOJI = { correct: '🟩', present: '🟨', absent: '⬛' };
const API_LANG = { en: 'en-US', 'zh-CN': 'zh-CN', es: 'es-ES' };

/** Everything the clues are written from, in the site language. */
const infoCache = new Map();
function infoOf(a) {
  const key = `${a.mt}/${a.id}/${getLang()}`;
  if (!infoCache.has(key)) {
    const q = new URLSearchParams({ path: `${a.mt}/${a.id}`, language: API_LANG[getLang()] || 'en-US', append_to_response: 'credits,keywords' });
    const p = fetch(`/api/tmdb?${q}`).then((r) => {
      if (!r.ok) throw new Error('tmdb');
      return r.json();
    });
    infoCache.set(key, p);
    p.catch(() => infoCache.delete(key));
  }
  return infoCache.get(key);
}

/** Hide the title's own words in a clue. */
function mask(text, a) {
  let out = String(text || '');
  const words = new Set([...clean(a.title).split(' '), ...a.w.split(' ')].filter((w) => w.length >= 3));
  for (const w of words) out = out.replace(new RegExp(`\\b${w}\\b`, 'gi'), '___');
  return out;
}
const firstSentence = (s) => (String(s || '').match(/^.*?[.!?。！？](\s|$)/) || [s || ''])[0].trim();

/** Clear clues (one per green letter) and vague ones (one per yellow letter). */
async function cluesFor(a) {
  const d = await infoOf(a);
  const cast = ((d.credits && d.credits.cast) || []).map((c) => c.name);
  const makers = a.mt === 'movie' ? ((d.credits && d.credits.crew) || []).filter((c) => c.job === 'Director').map((c) => c.name) : (d.created_by || []).map((c) => c.name);
  const year = String(d.release_date || d.first_air_date || a.y || '').slice(0, 4);
  const genres = (d.genres || []).slice(0, 2).map((g) => g.name).join(', ');
  const clear = [];
  const vague = [];
  if (genres) clear.push([t('cw.clue.genre'), genres]);
  if (year) clear.push([t('cw.clue.year'), year]);
  if (makers[0]) clear.push([t(a.mt === 'movie' ? 'cw.clue.director' : 'cw.clue.creator'), makers[0]]);
  if (cast[0]) clear.push([t('cw.clue.actor'), cast[0]]);
  if (cast[1]) clear.push([t('cw.clue.actor2'), cast[1]]);
  if (d.tagline) clear.push([t('cw.clue.tagline'), mask(d.tagline, a)]);
  if (d.overview) clear.push([t('cw.clue.plot'), mask(firstSentence(d.overview), a)]);

  if (year) vague.push([t('cw.clue.decade'), t('cw.clue.decadeVal', { d: `${year.slice(0, 3)}0` })]);
  const country = (d.production_countries && d.production_countries[0] && d.production_countries[0].name) || (d.origin_country || [])[0];
  if (country) vague.push([t('cw.clue.country'), country]);
  if (a.mt === 'movie' && d.runtime)
    vague.push([t('cw.clue.length'), t(d.runtime < 100 ? 'cw.clue.short' : d.runtime <= 130 ? 'cw.clue.mid' : 'cw.clue.long')]);
  if (a.mt === 'tv' && d.number_of_seasons) vague.push([t('cw.clue.length'), t('cw.clue.seasons', { n: d.number_of_seasons })]);
  const kws = ((d.keywords && (d.keywords.keywords || d.keywords.results)) || []).map((k) => k.name).filter((k) => !/\d/.test(k) && mask(k, a) === k);
  if (kws.length) vague.push([t('cw.clue.keyword'), kws[hashString(a.w) % Math.min(kws.length, 5)]]);
  if (d.vote_average) {
    const lo = Math.floor(d.vote_average);
    vague.push([t('cw.clue.rating'), t('cw.clue.ratingVal', { lo, hi: lo + 1 })]);
  }
  if (d.original_language) {
    let lang = d.original_language;
    try {
      lang = new Intl.DisplayNames([getLang()], { type: 'language' }).of(d.original_language) || lang;
    } catch {
      /* code it is */
    }
    vague.push([t('cw.clue.language'), lang]);
  }
  if (cast[0]) vague.push([t('cw.clue.initials'), cast[0].split(/\s+/).map((p) => `${p[0]}.`).join(' ')]);
  return { clear, vague };
}

/** mode: 'daily' | 'practice' | 'challenge'; arg: challenge id */
export function wordlePage(mode = 'daily', arg) {
  const node = document.createElement('section');
  node.className = 'page game wordle';
  const head = el('<header class="game-head"></header>');
  const boardBox = el('<div class="board-wrap"></div>');
  const bar = el('<div class="game-bar"></div>');
  const hintBox = el('<div class="cw-clues" aria-live="polite"></div>');
  const kbBox = el('<div class="kb-wrap"></div>');
  node.append(head, boardBox, bar, kbBox, hintBox);

  let entry = null; // { w, mt, id, title, y }
  let puzzleKey = null;
  let challenge = null;
  let state = null; // { guesses: [], done: false, won: false }
  let current = '';
  let busy = false;
  let kb = null;
  let clues = null;
  let shownClues = 0;
  let primed = false;

  const answer = () => entry;
  const letters = () => entry.w.replace(/ /g, '');
  const len = () => letters().length;
  const words = () => entry.w.split(' ');

  function renderHead() {
    const label =
      mode === 'daily'
        ? t('play.dailyN', { n: dayNumber() })
        : mode === 'practice'
          ? t('play.practice')
          : t('play.challenge');
    head.replaceChildren(
      frag(`
      <a class="back" href="/games" data-link>‹ ${esc(t('nav.games'))}</a>
      <div class="game-title-row">
        <h1>CineWordle</h1>
        <span class="chip">${esc(label)}</span>
      </div>
      <div class="game-links">
        <button type="button" class="link-btn" data-help>${esc(t('play.howToPlay'))}</button>
        ${mode !== 'daily' ? `<a class="link-btn" href="/games/cinewordle" data-link>${esc(t('play.daily'))}</a>` : ''}
        ${mode !== 'practice' ? `<a class="link-btn" href="/games/cinewordle/practice" data-link>${esc(t('play.practice'))}</a>` : ''}
        <button type="button" class="link-btn" data-stats>${esc(t('play.stats'))}</button>
        ${mode === 'practice' ? `<button type="button" class="link-btn" data-new>⟳ ${esc(t('play.newPuzzle'))}</button>` : ''}
      </div>`),
    );
    head.querySelector('[data-help]').addEventListener('click', showHelp);
    const nb = head.querySelector('[data-new]');
    if (nb) nb.addEventListener('click', () => startPractice(true));
    head.querySelector('[data-stats]').addEventListener('click', () => showStats());
  }

  // The board is built once; typing only changes the current row, and a
  // submitted row is painted once, so earlier rows never move again.
  function rowHtml(r) {
    const g = state.guesses[r];
    const marks = g ? score(g, letters()) : null;
    let i = 0;
    const parts = words().map((wd) => {
      const tiles = [];
      for (let k = 0; k < wd.length; k += 1, i += 1) {
        const ch = g ? g[i] : '';
        const st = marks ? marks[i] : 'empty';
        tiles.push(`<span class="tile-w" data-state="${st}" data-i="${i}" style="--i:${i}" ${marks ? `aria-label="${esc(`${ch} ${t(`play.state.${st}`)}`)}"` : ''}>${esc(ch)}</span>`);
      }
      return `<span class="w-word" style="--n:${wd.length}">${tiles.join('')}</span>`;
    });
    return `<div class="w-row${g ? ' settled' : ''}" role="row" data-r="${r}">${parts.join('')}</div>`;
  }

  function renderBoard() {
    const gaps = words().length - 1;
    boardBox.innerHTML = `<div class="w-board" role="grid" aria-label="${esc(t('play.board'))}" style="--cols:${len()};--gaps:${gaps};--step:${Math.min(0.12, 1.2 / len())}s">${Array.from(
      { length: TRIES },
      (_, r) => rowHtml(r),
    ).join('')}</div>`;
    markCurrent();
  }

  function rowEl(r) {
    return boardBox.querySelector(`.w-row[data-r="${r}"]`);
  }
  function markCurrent() {
    boardBox.querySelectorAll('.w-row.is-current').forEach((x) => x.classList.remove('is-current'));
    const row = !state.done && rowEl(state.guesses.length);
    if (row) row.classList.add('is-current');
  }

  function paintCurrent() {
    const row = rowEl(state.guesses.length);
    if (!row) return;
    row.querySelectorAll('.tile-w').forEach((tile, i) => {
      const ch = current[i] || '';
      if (tile.textContent !== ch) tile.textContent = ch;
      const st = ch ? 'typed' : 'empty';
      if (tile.dataset.state !== st) tile.dataset.state = st;
    });
  }

  function revealRow(r) {
    const row = rowEl(r);
    const tmp = el(rowHtml(r));
    tmp.classList.remove('settled');
    row.replaceWith(tmp);
    // Once its flip is over, the row is settled and never animates again
    setTimeout(() => tmp.classList.add('settled'), len() * Math.min(120, 1200 / len()) + 600);
  }

  function markKeyboard() {
    kb.reset();
    for (const g of state.guesses) score(g, letters()).forEach((st, i) => kb.mark(g[i], st));
  }

  function renderBar() {
    const n = words().length;
    bar.replaceChildren(
      frag(`
      <span class="muted">${esc(n > 1 ? t('cw.lettersWords', { n: len(), w: n }) : t('cw.letters', { n: len() }))}</span>
      ${state.done ? `<button type="button" class="btn btn-small" data-result>${esc(t('play.seeResult'))}</button>` : ''}`),
    );
    const rb = bar.querySelector('[data-result]');
    if (rb) rb.addEventListener('click', showResult);
  }

  /** How many clear and vague clues the guesses so far have earned. */
  function earned() {
    const greens = new Set();
    const yellows = new Set();
    for (const g of state.guesses)
      score(g, letters()).forEach((st, i) => {
        if (st === 'correct') greens.add(i);
        else if (st === 'present') yellows.add(g[i]);
      });
    return { clear: greens.size, vague: yellows.size };
  }

  async function renderClues() {
    const mine = entry;
    if (!clues) {
      hintBox.innerHTML = `<p class="muted cw-clue-note">${esc(t('cw.clueNote'))}</p>`;
      clues = await cluesFor(entry).catch(() => ({ clear: [], vague: [] }));
      if (entry !== mine) return;
    }
    const e = earned();
    const list = [
      ...clues.clear.slice(0, state.done ? clues.clear.length : e.clear).map((c) => ['clear', ...c]),
      ...clues.vague.slice(0, state.done ? clues.vague.length : e.vague).map((c) => ['vague', ...c]),
    ];
    hintBox.innerHTML = `${list.length ? '' : `<p class="muted cw-clue-note">${esc(t('cw.clueNote'))}</p>`}
      <ul class="cw-clue-list">${list
        .map(
          ([kind, label, text], i) =>
            `<li class="cw-clue ${kind}${i >= shownClues && primed ? ' new' : ''}"><span class="cw-tag">${esc(t(kind === 'clear' ? 'cw.clear' : 'cw.vague'))}</span><b>${esc(label)}</b> ${esc(text)}</li>`,
        )
        .join('')}</ul>`;
    if (primed && list.length > shownClues && !state.done) toast(t('cw.newClue', { n: list.length - shownClues }));
    shownClues = list.length;
    primed = true;
  }

  function persist() {
    saveState(`${SAVE}:${puzzleKey}`, state);
  }

  function shake() {
    const row = boardBox.querySelector('.w-row.is-current');
    if (row) {
      row.classList.remove('shake');
      void row.offsetWidth;
      row.classList.add('shake');
    }
  }

  async function onKey(k) {
    if (busy || !state || state.done) return;
    if (k === 'BACK') current = current.slice(0, -1);
    else if (k === 'ENTER') return submit();
    else if (/^[A-Z]$/.test(k) && current.length < len()) current += k;
    else return;
    paintCurrent();
  }

  async function submit() {
    if (current.length < len()) {
      toast(t('cw.tooShort'));
      shake();
      return;
    }
    const r = state.guesses.length;
    state.guesses.push(current);
    current = '';
    const won = state.guesses[r] === letters();
    if (won || state.guesses.length >= TRIES) {
      state.done = true;
      state.won = won;
    }
    persist();
    busy = true;
    revealRow(r);
    markCurrent();
    markKeyboard();
    setTimeout(async () => {
      busy = false;
      renderClues();
      if (state.done) {
        renderBar();
        await record();
        setTimeout(showResult, 250);
      }
    }, len() * Math.min(120, 1200 / len()) + 300);
  }

  async function record() {
    const result = { won: state.won, score: state.won ? state.guesses.length : null, hintUsed: false };
    try {
      if (mode === 'challenge') {
        await ensureName();
        await db.saveChallengeResult(challenge.id, result);
      } else {
        await db.saveResult({
          game: 'cinewordle',
          mode,
          puzzleKey,
          won: result.won,
          score: result.score,
          hintUsed: false,
          detail: { v: 2, answer: `${entry.mt}/${entry.id}`, guesses: state.guesses },
        });
      }
      state.saved = true;
      persist();
    } catch (err) {
      console.warn('result not saved yet', err);
    }
  }

  function shareText() {
    const head =
      mode === 'daily'
        ? `CINEJOY CineWordle #${dayNumber()}`
        : mode === 'challenge'
          ? `CINEJOY CineWordle · ${t('play.challenge')}`
          : 'CINEJOY CineWordle';
    const sc = `${state.won ? state.guesses.length : 'X'}/${TRIES}`;
    const grid = state.guesses.map((g) => score(g, letters()).map((s) => EMOJI[s]).join('')).join('\n');
    return `${head} ${sc}\n${grid}`;
  }

  async function showResult() {
    const a = answer();
    const box = el(`
      <div class="result-box">
        <p class="result-head">${esc(state.won ? t('cw.won', { n: state.guesses.length }) : t('cw.lost'))}</p>
        <div data-card></div>
        <div class="result-actions">
          <button type="button" class="btn" data-share>${esc(t('play.shareResult'))}</button>
          ${mode !== 'challenge' ? `<button type="button" class="btn btn-ghost" data-challenge>${esc(t('play.challengeFriend'))}</button>` : ''}
          ${mode !== 'practice' ? `<a class="btn btn-ghost" href="/games/cinewordle/practice" data-link>${esc(t('play.playPractice'))}</a>` : `<button type="button" class="btn btn-ghost" data-again>${esc(t('play.playAgain'))}</button>`}
        </div>
        <div data-extra></div>
      </div>`);
    box.querySelector('[data-card]').append(titleCard({ mt: a.mt, id: a.id, y: a.y, label: a.title, medium: a.mt === 'tv' ? 'series' : 'film' }));
    const close = openSheet({ title: 'CineWordle', body: box });
    box.querySelectorAll('a[data-link]').forEach((x) => x.addEventListener('click', () => close()));
    box.querySelector('[data-share]').addEventListener('click', () =>
      share(shareText(), mode === 'challenge' ? challengeUrl('cinewordle', challenge.id) : `${location.origin}/games/cinewordle`),
    );
    const again = box.querySelector('[data-again]');
    if (again)
      again.addEventListener('click', () => {
        close();
        startPractice(true);
      });
    const chBtn = box.querySelector('[data-challenge]');
    if (chBtn)
      chBtn.addEventListener('click', async () => {
        chBtn.disabled = true;
        try {
          await ensureName();
          const id = await track(
            db.createChallenge('cinewordle', { v: 2, mt: entry.mt, id: entry.id, w: entry.w, title: entry.title, y: entry.y }, { won: state.won, score: state.won ? state.guesses.length : null, hintUsed: false }),
          );
          await share(t('play.challengeText', { game: 'CineWordle' }), challengeUrl('cinewordle', id));
        } catch (err) {
          console.warn(err);
          toast(t('errors.generic'), 'error');
        } finally {
          chBtn.disabled = false;
        }
      });
    const extra = box.querySelector('[data-extra]');
    if (mode === 'daily') {
      const results = await db.myResults('cinewordle').catch(() => []);
      extra.innerHTML = `${statsHtml(stats(results))}<p class="muted next-in">${esc(t('play.nextIn'))} <b data-cd>${fmtCountdown(msToMidnight())}</b></p>`;
      const cd = extra.querySelector('[data-cd]');
      const timer = setInterval(() => {
        if (!cd.isConnected) return clearInterval(timer);
        cd.textContent = fmtCountdown(msToMidnight());
      }, 1000);
    } else if (mode === 'challenge') {
      const rows = await db.challengeBoard(challenge.id).catch(() => []);
      extra.innerHTML = boardHtml(rows, (r) => `${r.score}/${TRIES}`);
    }
  }

  async function showStats() {
    const results = await track(db.myResults('cinewordle')).catch(() => []);
    openSheet({ title: t('play.stats'), body: el(`<div>${statsHtml(stats(results))}</div>`) });
  }

  function showHelp() {
    openSheet({
      title: t('play.howToPlay'),
      body: el(`<div class="help">
        <p>${esc(t('cw.help1'))}</p>
        <p>${esc(t('cw.help2'))}</p>
        <div class="help-row"><span class="tile-w" data-state="correct">A</span>${esc(t('cw.helpCorrect'))}</div>
        <div class="help-row"><span class="tile-w" data-state="present">L</span>${esc(t('cw.helpPresent'))}</div>
        <div class="help-row"><span class="tile-w" data-state="absent">X</span>${esc(t('cw.helpAbsent'))}</div>
        <p>${esc(t('cw.help3'))}</p>
        <p>${esc(t('cw.help4'))}</p>
      </div>`),
    });
  }

  function begin(next) {
    entry = next;
    state = loadState(`${SAVE}:${puzzleKey}`) || { guesses: [], done: false, won: false };
    current = '';
    clues = null;
    shownClues = 0;
    primed = false;
    renderHead();
    renderBoard();
    if (!kb) {
      kb = keyboard(onKey);
      kbBox.replaceChildren(kb);
      listenKeys(node, (k) => onKey(k));
    }
    markKeyboard();
    renderBar();
    renderClues();
    // Saved but not yet on the server (offline earlier): try again
    if (state.done && !state.saved) record();
  }

  function startPractice(fresh = false) {
    let saved = loadState(`${SAVE}:practice-current`);
    if (fresh || !saved || saved.answer == null || !POOL[saved.answer]) {
      const i = nextPractice(SAVE, POOL.length, dailyIndex());
      saved = { answer: i, key: `p-${i}-${Date.now().toString(36)}` };
      saveState(`${SAVE}:practice-current`, saved);
    }
    puzzleKey = saved.key;
    begin(POOL[saved.answer]);
  }

  async function start() {
    if (mode === 'daily') {
      puzzleKey = todayKey();
      begin(POOL[dailyIndex(puzzleKey)]);
      // Played today on another device? Show that result.
      if (!state.done) {
        const results = await db.myResults('cinewordle', 30).catch(() => []);
        const today = results.find((r) => r.mode === 'daily' && r.puzzle_key === puzzleKey && r.detail && r.detail.v === 2);
        if (today && Array.isArray(today.detail.guesses)) {
          state = { guesses: today.detail.guesses, done: true, won: today.won, saved: true };
          persist();
          renderBoard();
          markKeyboard();
          renderBar();
          renderClues();
        }
      }
    } else if (mode === 'practice') {
      startPractice();
    } else {
      boardBox.replaceChildren(el(`<p class="muted">${esc(t('ui.loading'))}</p>`));
      try {
        challenge = await track(db.getChallenge(arg));
      } catch (err) {
        console.warn(err);
      }
      const p = challenge && challenge.puzzle;
      if (!challenge || challenge.game !== 'cinewordle' || !p || p.v !== 2 || !p.w) {
        renderHead();
        boardBox.replaceChildren(el(`<div class="error-box"><p>${esc(t('play.challengeMissing'))}</p></div>`));
        return;
      }
      puzzleKey = `c-${challenge.id}`;
      begin({ w: clean(p.w), mt: p.mt, id: p.id, title: p.title || p.w, y: p.y });
    }
  }

  start();
  return node;
}
