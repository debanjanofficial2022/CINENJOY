// CineWordle: guess a 5 or 6 letter film, series or anime title in six tries.
// Daily (same title for everyone that day), practice (unlimited) and challenge links.
import { t } from '../i18n.js';
import * as db from '../data.js';
import * as tmdb from '../tmdb.js';
import { track } from '../loading.js';
import { esc, el, frag, toast, openSheet } from '../ui.js';
import { ANSWERS, GUESSES } from './wordle-data.js';
import {
  todayKey, dayNumber, hashString, rng, shuffle, msToMidnight, fmtCountdown,
  loadState, saveState, keyboard, listenKeys, ensureName, stats, statsHtml, share, challengeUrl, boardHtml, titleCard,
} from './common.js';

const TRIES = 6;
const ORDER = shuffle(
  ANSWERS.map((_, i) => i),
  rng(hashString('cinenjoy-cinewordle-v1')),
);
const VALID = new Set([...GUESSES.split(' '), ...ANSWERS.map((a) => a.w)]);

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

function mediumOf(a) {
  if (a.anime) return 'anime';
  return a.mt === 'tv' ? 'series' : 'film';
}

/** mode: 'daily' | 'practice' | 'challenge'; arg: challenge id */
export function wordlePage(mode = 'daily', arg) {
  const node = document.createElement('section');
  node.className = 'page game wordle';
  const head = el('<header class="game-head"></header>');
  const boardBox = el('<div class="board-wrap"></div>');
  const bar = el('<div class="game-bar"></div>');
  const hintBox = el('<div class="hint-box" aria-live="polite"></div>');
  const kbBox = el('<div class="kb-wrap"></div>');
  node.append(head, boardBox, hintBox, bar, kbBox);

  let answerIdx = null;
  let puzzleKey = null;
  let challenge = null;
  let state = null; // { guesses: [], hint: null, done: false, won: false }
  let current = '';
  let busy = false;
  let kb = null;

  const answer = () => ANSWERS[answerIdx];
  const len = () => answer().w.length;

  function renderHead() {
    const label =
      mode === 'daily'
        ? t('games.dailyN', { n: dayNumber() })
        : mode === 'practice'
          ? t('games.practice')
          : t('games.challenge');
    head.replaceChildren(
      frag(`
      <a class="back" href="/games" data-link>‹ ${esc(t('nav.games'))}</a>
      <div class="game-title-row">
        <h1>CineWordle</h1>
        <span class="chip">${esc(label)}</span>
      </div>
      <div class="game-links">
        <button type="button" class="link-btn" data-help>${esc(t('games.howToPlay'))}</button>
        ${mode !== 'daily' ? `<a class="link-btn" href="/games/cinewordle" data-link>${esc(t('games.daily'))}</a>` : ''}
        ${mode !== 'practice' ? `<a class="link-btn" href="/games/cinewordle/practice" data-link>${esc(t('games.practice'))}</a>` : ''}
        <button type="button" class="link-btn" data-stats>${esc(t('games.stats'))}</button>
      </div>`),
    );
    head.querySelector('[data-help]').addEventListener('click', showHelp);
    head.querySelector('[data-stats]').addEventListener('click', () => showStats());
  }

  function renderBoard() {
    const rows = [];
    for (let r = 0; r < TRIES; r += 1) {
      const g = state.guesses[r];
      const typing = !g && r === state.guesses.length && !state.done ? current : '';
      const marks = g ? score(g, answer().w) : null;
      const tiles = [];
      for (let i = 0; i < len(); i += 1) {
        const ch = g ? g[i] : typing[i] || '';
        const st = marks ? marks[i] : ch ? 'typed' : 'empty';
        tiles.push(
          `<span class="tile-w" data-state="${st}" style="--i:${i}" ${
            marks ? `aria-label="${esc(`${ch} ${t(`games.state.${st}`)}`)}"` : ''
          }>${esc(ch)}</span>`,
        );
      }
      rows.push(`<div class="w-row${r === state.guesses.length && !state.done ? ' is-current' : ''}" role="row">${tiles.join('')}</div>`);
    }
    boardBox.innerHTML = `<div class="w-board" role="grid" aria-label="${esc(t('games.board'))}" style="--cols:${len()}">${rows.join('')}</div>`;
  }

  function markKeyboard() {
    kb.reset();
    for (const g of state.guesses) score(g, answer().w).forEach((st, i) => kb.mark(g[i], st));
  }

  function renderBar() {
    const a = answer();
    const used = state.hint;
    bar.replaceChildren(
      frag(`
      <span class="muted">${esc(t('cw.letters', { n: len() }))}</span>
      ${
        state.done
          ? `<button type="button" class="btn btn-small" data-result>${esc(t('games.seeResult'))}</button>`
          : `<button type="button" class="btn btn-small btn-ghost" data-hint ${used ? 'disabled' : ''}>💡 ${esc(
              used ? t('cw.hintUsed') : t('cw.useHint'),
            )}</button>`
      }`),
    );
    const hb = bar.querySelector('[data-hint]');
    if (hb) hb.addEventListener('click', chooseHint);
    const rb = bar.querySelector('[data-result]');
    if (rb) rb.addEventListener('click', showResult);
    renderHint(a);
  }

  async function hintText(kind) {
    const a = answer();
    if (kind === 'year') return `${t('cw.hint.year')}: ${a.y || '?'}`;
    if (kind === 'medium') return `${t('cw.hint.medium')}: ${t(`medium.${mediumOf(a)}`)}`;
    if (kind === 'genre') {
      const names = await tmdb.genreNames().catch(() => ({}));
      return `${t('cw.hint.genre')}: ${names[a.g] || '?'}`;
    }
    return a.a ? `${t('cw.hint.actor')}: ${a.a}` : `${t('cw.hint.director')}: ${a.d || '?'}`;
  }

  async function renderHint() {
    if (!state.hint) {
      hintBox.replaceChildren();
      return;
    }
    hintBox.textContent = `💡 ${await hintText(state.hint)}`;
  }

  function chooseHint() {
    if (state.hint || state.done) return;
    const box = el(`
      <div class="form">
        <p>${esc(t('cw.hintNote'))}</p>
        <div class="hint-choices">
          ${['year', 'medium', 'genre', 'actor']
            .map((k) => `<button type="button" class="btn btn-ghost" data-k="${k}">${esc(t(`cw.hint.${k}`))}</button>`)
            .join('')}
        </div>
      </div>`);
    const close = openSheet({ title: t('cw.useHint'), body: box });
    box.querySelectorAll('[data-k]').forEach((b) =>
      b.addEventListener('click', () => {
        state.hint = b.dataset.k;
        persist();
        close();
        renderBar();
      }),
    );
  }

  function persist() {
    saveState(`cinewordle:${puzzleKey}`, state);
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
    renderBoard();
  }

  async function submit() {
    if (current.length < len()) {
      toast(t('cw.tooShort'));
      shake();
      return;
    }
    if (!VALID.has(current)) {
      toast(t('cw.notWord'));
      shake();
      return;
    }
    state.guesses.push(current);
    current = '';
    const won = state.guesses[state.guesses.length - 1] === answer().w;
    if (won || state.guesses.length >= TRIES) {
      state.done = true;
      state.won = won;
    }
    persist();
    busy = true;
    renderBoard();
    markKeyboard();
    setTimeout(async () => {
      busy = false;
      if (state.done) {
        renderBar();
        await record();
        setTimeout(showResult, 250);
      }
    }, len() * 120 + 200);
  }

  async function record() {
    const result = { won: state.won, score: state.won ? state.guesses.length : null, hintUsed: Boolean(state.hint) };
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
          hintUsed: result.hintUsed,
          detail: { answer: answerIdx, guesses: state.guesses, hint: state.hint },
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
        ? `CINENJOY CineWordle #${dayNumber()}`
        : mode === 'challenge'
          ? `CINENJOY CineWordle · ${t('games.challenge')}`
          : 'CINENJOY CineWordle';
    const sc = `${state.won ? state.guesses.length : 'X'}/${TRIES}${state.hint ? ' 💡' : ''}`;
    const grid = state.guesses.map((g) => score(g, answer().w).map((s) => EMOJI[s]).join('')).join('\n');
    return `${head} ${sc}\n${grid}`;
  }

  async function showResult() {
    const a = answer();
    const box = el(`
      <div class="result-box">
        <p class="result-head">${esc(state.won ? t('cw.won', { n: state.guesses.length }) : t('cw.lost'))}${
          state.hint ? ` <span class="chip">💡 ${esc(t('cw.hintUsed'))}</span>` : ''
        }</p>
        <div data-card></div>
        <div class="result-actions">
          <button type="button" class="btn" data-share>${esc(t('games.shareResult'))}</button>
          ${mode !== 'challenge' ? `<button type="button" class="btn btn-ghost" data-challenge>${esc(t('games.challengeFriend'))}</button>` : ''}
          ${mode !== 'practice' ? `<a class="btn btn-ghost" href="/games/cinewordle/practice" data-link>${esc(t('games.playPractice'))}</a>` : `<button type="button" class="btn btn-ghost" data-again>${esc(t('games.playAgain'))}</button>`}
        </div>
        <div data-extra></div>
      </div>`);
    box.querySelector('[data-card]').append(titleCard({ ...a, label: a.w, medium: mediumOf(a) }));
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
            db.createChallenge('cinewordle', { answer: answerIdx }, { won: state.won, score: state.won ? state.guesses.length : null, hintUsed: Boolean(state.hint) }),
          );
          await share(t('games.challengeText', { game: 'CineWordle' }), challengeUrl('cinewordle', id));
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
      extra.innerHTML = `${statsHtml(stats(results))}<p class="muted next-in">${esc(t('games.nextIn'))} <b data-cd>${fmtCountdown(msToMidnight())}</b></p>`;
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
    openSheet({ title: t('games.stats'), body: el(`<div>${statsHtml(stats(results))}</div>`) });
  }

  function showHelp() {
    openSheet({
      title: t('games.howToPlay'),
      body: el(`<div class="help">
        <p>${esc(t('cw.help1'))}</p>
        <p>${esc(t('cw.help2'))}</p>
        <div class="help-row"><span class="tile-w" data-state="correct">A</span>${esc(t('cw.helpCorrect'))}</div>
        <div class="help-row"><span class="tile-w" data-state="present">L</span>${esc(t('cw.helpPresent'))}</div>
        <div class="help-row"><span class="tile-w" data-state="absent">X</span>${esc(t('cw.helpAbsent'))}</div>
        <p>${esc(t('cw.help3'))}</p>
      </div>`),
    });
  }

  function begin() {
    state = loadState(`cinewordle:${puzzleKey}`) || { guesses: [], hint: null, done: false, won: false };
    current = '';
    renderHead();
    renderBoard();
    if (!kb) {
      kb = keyboard(onKey);
      kbBox.replaceChildren(kb);
      listenKeys(node, (k) => onKey(k));
    }
    markKeyboard();
    renderBar();
    // Saved but not yet on the server (offline earlier): try again
    if (state.done && !state.saved) record();
  }

  function startPractice(fresh = false) {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem('cinenjoy:game:cinewordle:practice-current') || 'null');
    } catch {
      saved = null;
    }
    if (fresh || !saved || saved.answer == null || !ANSWERS[saved.answer]) {
      const avoid = dailyIndex();
      let i;
      do i = Math.floor(Math.random() * ANSWERS.length);
      while (i === avoid && ANSWERS.length > 1);
      saved = { answer: i, key: `p-${i}-${Date.now().toString(36)}` };
      try {
        localStorage.setItem('cinenjoy:game:cinewordle:practice-current', JSON.stringify(saved));
      } catch {
        /* fine */
      }
    }
    answerIdx = saved.answer;
    puzzleKey = saved.key;
    begin();
  }

  async function start() {
    if (mode === 'daily') {
      puzzleKey = todayKey();
      answerIdx = dailyIndex(puzzleKey);
      begin();
      // Played today on another device? Show that result.
      if (!state.done) {
        const results = await db.myResults('cinewordle', 30).catch(() => []);
        const today = results.find((r) => r.mode === 'daily' && r.puzzle_key === puzzleKey);
        if (today && today.detail && Array.isArray(today.detail.guesses)) {
          state = { guesses: today.detail.guesses, hint: today.detail.hint || null, done: true, won: today.won, saved: true };
          persist();
          renderBoard();
          markKeyboard();
          renderBar();
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
      if (!challenge || challenge.game !== 'cinewordle' || !ANSWERS[challenge.puzzle && challenge.puzzle.answer]) {
        renderHead();
        boardBox.replaceChildren(el(`<div class="error-box"><p>${esc(t('games.challengeMissing'))}</p></div>`));
        return;
      }
      answerIdx = challenge.puzzle.answer;
      puzzleKey = `c-${challenge.id}`;
      begin();
    }
  }

  start();
  return node;
}
