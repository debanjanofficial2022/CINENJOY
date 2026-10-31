// Daily Mini: a 5x5 American-style crossword where every answer is a film or
// series title, or a word from one. Daily, practice and challenge links.
import { t, getLang } from '../i18n.js';
import * as db from '../data.js';
import * as tmdb from '../tmdb.js';
import { track } from '../loading.js';
import { esc, el, frag, toast, openSheet } from '../ui.js';
import { generate, slotsOf } from './crossword-gen.js';
import {
  todayKey, dayNumber, hashString, rng, msToMidnight, fmtCountdown, fmtTime,
  loadState, saveState, keyboard, listenKeys, share, challengeUrl, boardHtml,
} from './common.js';

const CHECK_COST = 3; // seconds per checked letter
const REVEAL_COST = 15; // seconds per revealed letter

let vocabP = null;
function vocab() {
  if (!vocabP) {
    vocabP = import('./crossword-data.js').then(({ VOCAB }) => {
      const map = new Map(VOCAB.map((r) => [r[0], r]));
      return { words: VOCAB.map((r) => r[0]), map };
    });
  }
  return vocabP;
}

// ---------- Clues, written from each title's details in the site language ----------

function blanked(title, word) {
  const letters = word.split('').join("'?");
  const re = new RegExp(`(?<![A-Za-z])${letters}(?![A-Za-z])`, 'gi');
  const out = title.replace(re, '___');
  return out === title ? `${title} (___)` : out;
}

function clueFor(row, genres) {
  const lang = getLang();
  if (!row) return '?';
  if (row[1] === 'b') {
    const [, , tv, year, title] = row;
    const text = blanked(title, row[0]);
    if (lang === 'zh-CN') return `英文片名填空：“${text}”（${year}年${tv ? '剧集' : '电影'}）`;
    if (lang === 'es') return `Completa el título en inglés: «${text}» (${tv ? 'serie' : 'película'} de ${year})`;
    return `“${text}” (${year} ${tv ? 'series' : 'film'})`;
  }
  const [, , tv, , year, g, maker, lead, anime] = row;
  const genre = genres[g] || '';
  const gl = genre.toLowerCase();
  if (lang === 'zh-CN') {
    if (anime) return maker ? `${maker}的${year}年动画` : `${year}年的动画${tv ? '剧集' : '电影'}`;
    if (tv) return maker ? `${maker}创作的${genre}剧集（${year}年）` : `${lead}主演的${genre}剧集（${year}年）`;
    return maker ? `${maker}执导的${year}年${genre}电影` : `${lead}主演的${year}年${genre}电影`;
  }
  if (lang === 'es') {
    if (anime) return maker ? `Anime de ${year} de ${maker}` : `Anime de ${year}`;
    if (tv) return maker ? `Serie de ${gl} (${year}) creada por ${maker}` : `Serie de ${gl} (${year}) protagonizada por ${lead}`;
    return maker ? `Película de ${gl} de ${year} dirigida por ${maker}` : `Película de ${gl} de ${year} protagonizada por ${lead}`;
  }
  if (anime) return maker ? `${year} anime by ${maker}` : `Anime ${tv ? 'series' : 'film'} (${year})`;
  if (tv) return maker ? `${genre ? `${genre} series` : 'Series'} (${year}) created by ${maker}` : `${genre ? `${genre} series` : 'Series'} (${year}) starring ${lead}`;
  return maker ? `${year} ${gl ? `${gl} ` : ''}film directed by ${maker}` : `${year} ${gl ? `${gl} ` : ''}film starring ${lead}`;
}

// ---------- The page ----------

export function crosswordPage(mode = 'daily', arg) {
  const node = document.createElement('section');
  node.className = 'page game mini';
  const head = el('<header class="game-head"></header>');
  const tools = el('<div class="mini-tools"></div>');
  const clueBar = el('<div class="clue-bar" aria-live="polite"></div>');
  const gridBox = el('<div class="mini-grid-wrap"></div>');
  const lists = el('<div class="clue-lists"></div>');
  const kbBox = el('<div class="kb-wrap"></div>');
  const main = el('<div class="mini-main"></div>');
  const left = el('<div class="mini-left"></div>');
  left.append(clueBar, gridBox);
  main.append(left, lists);
  node.append(head, tools, main, kbBox);

  let puzzle = null; // { pattern, grid, slots }
  let puzzleKey = null;
  let challenge = null;
  let clues = {};
  let state = null; // { letters: [[...]], elapsed, penalty, checked: {}, revealed: {}, done, won }
  let sel = { r: 0, c: 0, dir: 'across' };
  let timer = null;
  let lastTick = Date.now();
  let kb = null;
  const N = 5;

  const isBlack = (r, c) => puzzle.grid[r][c] === '#';
  const slotAt = (r, c, dir) => puzzle.slots.find((s) => s.dir === dir && cellsOf(s).some(([y, x]) => y === r && x === c));
  const cellsOf = (s) => Array.from({ length: s.len }, (_, i) => (s.dir === 'across' ? [s.row, s.col + i] : [s.row + i, s.col]));
  const key = (r, c) => `${r},${c}`;

  function renderHead() {
    const label =
      mode === 'daily' ? t('games.dailyN', { n: dayNumber() }) : mode === 'practice' ? t('games.practice') : t('games.challenge');
    head.replaceChildren(
      frag(`
      <a class="back" href="/games" data-link>‹ ${esc(t('nav.games'))}</a>
      <div class="game-title-row">
        <h1>${esc(t('mini.title'))}</h1>
        <span class="chip">${esc(label)}</span>
      </div>
      <div class="game-links">
        <button type="button" class="link-btn" data-help>${esc(t('games.howToPlay'))}</button>
        ${mode !== 'daily' ? `<a class="link-btn" href="/games/crossword" data-link>${esc(t('games.daily'))}</a>` : ''}
        ${mode !== 'practice' ? `<a class="link-btn" href="/games/crossword/practice" data-link>${esc(t('games.practice'))}</a>` : ''}
        <button type="button" class="link-btn" data-stats>${esc(t('games.stats'))}</button>
      </div>
      ${getLang() !== 'en' ? `<p class="fine-print">${esc(t('mini.englishNote'))}</p>` : ''}`),
    );
    head.querySelector('[data-help]').addEventListener('click', showHelp);
    head.querySelector('[data-stats]').addEventListener('click', showStats);
  }

  function renderTools() {
    tools.replaceChildren(
      frag(`
      <span class="mini-timer" aria-label="${esc(t('mini.time'))}">⏱ <b data-time>${fmtTime(state.elapsed + state.penalty)}</b>${
        state.penalty ? ` <span class="muted">(+${fmtTime(state.penalty)})</span>` : ''
      }</span>
      <div class="mini-btns">
        <label class="tool"><span class="sr">${esc(t('mini.check'))}</span>
          <select data-check ${state.done ? 'disabled' : ''}>
            <option value="">${esc(t('mini.check'))}</option>
            <option value="cell">${esc(t('mini.letter'))}</option>
            <option value="word">${esc(t('mini.word'))}</option>
            <option value="all">${esc(t('mini.puzzle'))}</option>
          </select></label>
        <label class="tool"><span class="sr">${esc(t('mini.reveal'))}</span>
          <select data-reveal ${state.done ? 'disabled' : ''}>
            <option value="">${esc(t('mini.reveal'))}</option>
            <option value="cell">${esc(t('mini.letter'))}</option>
            <option value="word">${esc(t('mini.word'))}</option>
            <option value="all">${esc(t('mini.puzzle'))}</option>
          </select></label>
        ${state.done ? `<button type="button" class="btn btn-small" data-result>${esc(t('games.seeResult'))}</button>` : ''}
      </div>`),
    );
    const ch = tools.querySelector('[data-check]');
    const rv = tools.querySelector('[data-reveal]');
    ch.addEventListener('change', () => {
      if (ch.value) check(ch.value);
      ch.value = '';
    });
    rv.addEventListener('change', () => {
      if (rv.value) reveal(rv.value);
      rv.value = '';
    });
    const rb = tools.querySelector('[data-result]');
    if (rb) rb.addEventListener('click', showResult);
  }

  function currentSlot() {
    return slotAt(sel.r, sel.c, sel.dir) || slotAt(sel.r, sel.c, sel.dir === 'across' ? 'down' : 'across');
  }

  function renderGrid() {
    const slot = currentSlot();
    const inWord = new Set(slot ? cellsOf(slot).map(([r, c]) => key(r, c)) : []);
    const nums = new Map(puzzle.slots.map((s) => [key(s.row, s.col), s.num]));
    let html = `<div class="mini-grid" role="grid" aria-label="${esc(t('mini.title'))}">`;
    for (let r = 0; r < N; r += 1) {
      html += '<div class="mini-row" role="row">';
      for (let c = 0; c < N; c += 1) {
        if (isBlack(r, c)) {
          html += '<span class="cell black" role="gridcell" aria-hidden="true"></span>';
          continue;
        }
        const k = key(r, c);
        const letter = state.letters[r][c] || '';
        const cls = ['cell'];
        if (inWord.has(k)) cls.push('in-word');
        if (sel.r === r && sel.c === c) cls.push('selected');
        if (state.checked[k] === 'wrong' && letter) cls.push('wrong');
        if (state.revealed[k]) cls.push('revealed');
        if (state.done) cls.push('done');
        html += `<button type="button" class="${cls.join(' ')}" role="gridcell" data-r="${r}" data-c="${c}" aria-label="${esc(
          `${nums.get(k) ? `${nums.get(k)} ` : ''}${letter || t('mini.empty')}`,
        )}">${nums.get(k) ? `<span class="num">${nums.get(k)}</span>` : ''}<span class="ltr">${esc(letter)}</span></button>`;
      }
      html += '</div>';
    }
    html += '</div>';
    gridBox.innerHTML = html;
    gridBox.querySelectorAll('.cell[data-r]').forEach((b) =>
      b.addEventListener('click', () => {
        const r = Number(b.dataset.r);
        const c = Number(b.dataset.c);
        if (sel.r === r && sel.c === c) toggleDir();
        else {
          sel.r = r;
          sel.c = c;
          if (!slotAt(r, c, sel.dir)) sel.dir = sel.dir === 'across' ? 'down' : 'across';
        }
        renderAll();
      }),
    );
    renderClueBar(slot);
    renderLists(slot);
  }

  function renderClueBar(slot) {
    if (!slot) return clueBar.replaceChildren();
    clueBar.replaceChildren(
      frag(`
      <button type="button" class="icon-btn" data-prev aria-label="${esc(t('mini.prevClue'))}">‹</button>
      <button type="button" class="clue-text" data-flip>
        <b>${slot.num}${slot.dir === 'across' ? t('mini.a') : t('mini.d')}</b> ${esc(clues[`${slot.num}${slot.dir}`] || '')}
      </button>
      <button type="button" class="icon-btn" data-next aria-label="${esc(t('mini.nextClue'))}">›</button>`),
    );
    clueBar.querySelector('[data-prev]').addEventListener('click', () => moveClue(-1));
    clueBar.querySelector('[data-next]').addEventListener('click', () => moveClue(1));
    clueBar.querySelector('[data-flip]').addEventListener('click', () => {
      toggleDir();
      renderAll();
    });
  }

  function renderLists(slot) {
    const part = (dir) =>
      `<div class="clue-list"><h2>${esc(dir === 'across' ? t('mini.across') : t('mini.down'))}</h2><ol>${puzzle.slots
        .filter((s) => s.dir === dir)
        .map((s) => {
          const full = cellsOf(s).every(([r, c]) => state.letters[r][c]);
          return `<li><button type="button" class="clue-item${slot && slot.num === s.num && slot.dir === s.dir ? ' active' : ''}${
            full ? ' filled' : ''
          }" data-num="${s.num}" data-dir="${dir}"><b>${s.num}</b> ${esc(clues[`${s.num}${dir}`] || '')}</button></li>`;
        })
        .join('')}</ol></div>`;
    lists.innerHTML = part('across') + part('down');
    lists.querySelectorAll('.clue-item').forEach((b) =>
      b.addEventListener('click', () => {
        const s = puzzle.slots.find((x) => x.num === Number(b.dataset.num) && x.dir === b.dataset.dir);
        goToSlot(s);
        renderAll();
      }),
    );
  }

  function renderAll() {
    renderGrid();
  }

  function toggleDir() {
    const other = sel.dir === 'across' ? 'down' : 'across';
    if (slotAt(sel.r, sel.c, other)) sel.dir = other;
  }

  function goToSlot(s) {
    sel.dir = s.dir;
    const cells = cellsOf(s);
    const empty = cells.find(([r, c]) => !state.letters[r][c]) || cells[0];
    [sel.r, sel.c] = empty;
  }

  function orderedSlots() {
    return [...puzzle.slots.filter((s) => s.dir === 'across'), ...puzzle.slots.filter((s) => s.dir === 'down')];
  }

  function moveClue(step) {
    const all = orderedSlots();
    const cur = currentSlot();
    const i = all.findIndex((s) => s === cur);
    goToSlot(all[(i + step + all.length) % all.length]);
    renderAll();
  }

  function advance() {
    const s = currentSlot();
    const cells = cellsOf(s);
    const i = cells.findIndex(([r, c]) => r === sel.r && c === sel.c);
    const next = cells.slice(i + 1).find(([r, c]) => !state.letters[r][c]);
    if (next) [sel.r, sel.c] = next;
    else if (i < cells.length - 1) [sel.r, sel.c] = cells[i + 1];
    else {
      // word finished: go to the next clue with an empty square
      const all = orderedSlots();
      const k = all.indexOf(s);
      for (let j = 1; j <= all.length; j += 1) {
        const cand = all[(k + j) % all.length];
        if (cellsOf(cand).some(([r, c]) => !state.letters[r][c])) {
          goToSlot(cand);
          break;
        }
      }
    }
  }

  function onKey(k) {
    if (!puzzle || state.done) return;
    const { r, c } = sel;
    if (/^[A-Z]$/.test(k)) {
      if (state.revealed[key(r, c)]) {
        advance();
        renderAll();
        return;
      }
      state.letters[r][c] = k;
      delete state.checked[key(r, c)];
      advance();
      afterChange();
    } else if (k === 'BACK') {
      if (state.letters[r][c] && !state.revealed[key(r, c)]) state.letters[r][c] = '';
      else {
        const cells = cellsOf(currentSlot());
        const i = cells.findIndex(([y, x]) => y === r && x === c);
        if (i > 0) {
          [sel.r, sel.c] = cells[i - 1];
          if (!state.revealed[key(sel.r, sel.c)]) state.letters[sel.r][sel.c] = '';
        }
      }
      afterChange();
    } else if (k === 'ENTER' || k === 'Tab') moveClue(1);
    else if (k === ' ') {
      toggleDir();
      renderAll();
    } else if (k.startsWith('Arrow')) {
      const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[k];
      const dir = d[0] ? 'down' : 'across';
      if (sel.dir !== dir && slotAt(r, c, dir)) sel.dir = dir;
      else {
        let y = r + d[0];
        let x = c + d[1];
        while (y >= 0 && y < N && x >= 0 && x < N && isBlack(y, x)) {
          y += d[0];
          x += d[1];
        }
        if (y >= 0 && y < N && x >= 0 && x < N) {
          sel.r = y;
          sel.c = x;
          if (!slotAt(y, x, sel.dir)) toggleDir();
        }
      }
      renderAll();
    }
  }

  function afterChange() {
    persist();
    renderAll();
    const full = puzzle.grid.every((row, r) => row.split('').every((ch, c) => ch === '#' || state.letters[r][c]));
    if (!full) return;
    const right = puzzle.grid.every((row, r) => row.split('').every((ch, c) => ch === '#' || state.letters[r][c] === ch));
    if (right) finish(true);
    else toast(t('mini.notQuite'));
  }

  function cellsFor(scope) {
    if (scope === 'cell') return [[sel.r, sel.c]];
    if (scope === 'word') return cellsOf(currentSlot());
    const all = [];
    for (let r = 0; r < N; r += 1) for (let c = 0; c < N; c += 1) if (!isBlack(r, c)) all.push([r, c]);
    return all;
  }

  function check(scope) {
    if (state.done) return;
    const cells = cellsFor(scope).filter(([r, c]) => state.letters[r][c] && !state.revealed[key(r, c)]);
    let wrong = 0;
    for (const [r, c] of cells) {
      const ok = state.letters[r][c] === puzzle.grid[r][c];
      state.checked[key(r, c)] = ok ? 'ok' : 'wrong';
      if (!ok) wrong += 1;
    }
    state.penalty += cells.length * CHECK_COST;
    toast(wrong ? t('mini.wrongN', { n: wrong }) : t('mini.allRight'));
    persist();
    renderTools();
    renderAll();
  }

  function reveal(scope) {
    if (state.done) return;
    let n = 0;
    for (const [r, c] of cellsFor(scope)) {
      if (state.revealed[key(r, c)]) continue;
      state.letters[r][c] = puzzle.grid[r][c];
      state.revealed[key(r, c)] = true;
      delete state.checked[key(r, c)];
      n += 1;
    }
    state.penalty += n * REVEAL_COST;
    persist();
    renderTools();
    const total = cellsFor('all').length;
    if (Object.keys(state.revealed).length >= total) finish(false);
    else afterChange();
  }

  // ---------- Timer ----------

  function tick() {
    if (!node.isConnected) return clearInterval(timer);
    if (document.hidden || state.done) {
      lastTick = Date.now();
      return;
    }
    const now = Date.now();
    state.elapsed += (now - lastTick) / 1000;
    lastTick = now;
    const tb = tools.querySelector('[data-time]');
    if (tb) tb.textContent = fmtTime(state.elapsed + state.penalty);
    if (Math.floor(state.elapsed) % 5 === 0) persist();
  }

  function persist() {
    saveState(`crossword:${puzzleKey}`, { ...state, grid: puzzle.grid, pattern: puzzle.pattern });
  }

  // ---------- Finishing ----------

  async function finish(won) {
    state.done = true;
    state.won = won && Object.keys(state.revealed).length < cellsFor('all').length;
    persist();
    renderTools();
    renderAll();
    await record();
    setTimeout(showResult, 300);
  }

  const totalSeconds = () => Math.round(state.elapsed + state.penalty);

  async function record() {
    const result = { won: state.won, score: state.won ? totalSeconds() : null, hintUsed: Object.keys(state.revealed).length > 0 };
    try {
      if (mode === 'challenge') await db.saveChallengeResult(challenge.id, result);
      else
        await db.saveResult({
          game: 'crossword',
          mode,
          puzzleKey,
          won: result.won,
          score: result.score,
          hintUsed: result.hintUsed,
          detail: { grid: puzzle.grid, pattern: puzzle.pattern, penalty: Math.round(state.penalty) },
        });
      state.saved = true;
      persist();
    } catch (err) {
      console.warn('result not saved yet', err);
    }
  }

  function shareText() {
    const head = mode === 'daily' ? `CINENJOY ${t('mini.title')} #${dayNumber()}` : `CINENJOY ${t('mini.title')}`;
    const helped = Object.keys(state.revealed).length ? ` · ${t('mini.revealedN', { n: Object.keys(state.revealed).length })}` : '';
    return state.won ? `${head} ⏱ ${fmtTime(totalSeconds())}${helped}` : `${head} · ${t('mini.revealedAll')}`;
  }

  async function miniStatsHtml() {
    const results = await db.myResults('crossword').catch(() => []);
    const daily = results.filter((r) => r.mode === 'daily');
    const days = new Map(daily.map((r) => [r.puzzle_key, r]));
    const wins = [...days.values()].filter((r) => r.won);
    const best = wins.length ? Math.min(...wins.map((r) => r.score)) : null;
    const avg = wins.length ? wins.reduce((a, r) => a + r.score, 0) / wins.length : null;
    let streak = 0;
    const d = new Date();
    if (!days.has(todayKey(d))) d.setDate(d.getDate() - 1);
    while (days.get(todayKey(d)) && days.get(todayKey(d)).won) {
      streak += 1;
      d.setDate(d.getDate() - 1);
    }
    return `<div class="stats">
      <div class="stat"><b>${days.size}</b><span>${esc(t('games.played'))}</span></div>
      <div class="stat"><b>${streak}</b><span>${esc(t('games.streak'))}</span></div>
      <div class="stat"><b>${best != null ? fmtTime(best) : '–'}</b><span>${esc(t('mini.bestTime'))}</span></div>
      <div class="stat"><b>${avg != null ? fmtTime(avg) : '–'}</b><span>${esc(t('mini.avgTime'))}</span></div>
    </div>`;
  }

  async function showResult() {
    const box = el(`
      <div class="result-box">
        <p class="result-head">${esc(state.won ? t('mini.solved', { time: fmtTime(totalSeconds()) }) : t('mini.revealedAll'))}</p>
        ${state.penalty ? `<p class="muted">${esc(t('mini.penaltyNote', { time: fmtTime(state.penalty) }))}</p>` : ''}
        <div class="result-actions">
          <button type="button" class="btn" data-share>${esc(t('games.shareResult'))}</button>
          ${mode !== 'challenge' ? `<button type="button" class="btn btn-ghost" data-challenge>${esc(t('games.challengeFriend'))}</button>` : ''}
          ${
            mode !== 'practice'
              ? `<a class="btn btn-ghost" href="/games/crossword/practice" data-link>${esc(t('games.playPractice'))}</a>`
              : `<button type="button" class="btn btn-ghost" data-again>${esc(t('games.playAgain'))}</button>`
          }
        </div>
        <div data-extra></div>
      </div>`);
    const close = openSheet({ title: t('mini.title'), body: box });
    box.querySelectorAll('a[data-link]').forEach((x) => x.addEventListener('click', () => close()));
    box.querySelector('[data-share]').addEventListener('click', () =>
      share(shareText(), mode === 'challenge' ? challengeUrl('crossword', challenge.id) : `${location.origin}/games/crossword`),
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
          const id = await track(
            db.createChallenge(
              'crossword',
              { grid: puzzle.grid, pattern: puzzle.pattern },
              { won: state.won, score: state.won ? totalSeconds() : null, hintUsed: Object.keys(state.revealed).length > 0 },
            ),
          );
          await share(t('games.challengeText', { game: t('mini.title') }), challengeUrl('crossword', id));
        } catch (err) {
          console.warn(err);
          toast(t('errors.generic'), 'error');
        } finally {
          chBtn.disabled = false;
        }
      });
    const extra = box.querySelector('[data-extra]');
    if (mode === 'daily') {
      extra.innerHTML = `${await miniStatsHtml()}<p class="muted next-in">${esc(t('games.nextIn'))} <b data-cd>${fmtCountdown(msToMidnight())}</b></p>`;
      const cd = extra.querySelector('[data-cd]');
      const tm = setInterval(() => {
        if (!cd.isConnected) return clearInterval(tm);
        cd.textContent = fmtCountdown(msToMidnight());
      }, 1000);
    } else if (mode === 'challenge') {
      const rows = await db.challengeBoard(challenge.id).catch(() => []);
      extra.innerHTML = boardHtml(rows, (r) => fmtTime(r.score));
    }
  }

  async function showStats() {
    openSheet({ title: t('games.stats'), body: el(`<div>${await miniStatsHtml()}</div>`) });
  }

  function showHelp() {
    openSheet({
      title: t('games.howToPlay'),
      body: el(`<div class="help">
        <p>${esc(t('mini.help1'))}</p>
        <p>${esc(t('mini.help2'))}</p>
        <p>${esc(t('mini.help3', { check: CHECK_COST, reveal: REVEAL_COST }))}</p>
      </div>`),
    });
  }

  // ---------- Starting ----------

  async function begin(p) {
    puzzle = { pattern: p.pattern, grid: p.grid, slots: slotsOf(p.pattern).map((s) => ({ ...s, len: s.cells.length })).sort((a, b) => a.num - b.num) };
    const saved = loadState(`crossword:${puzzleKey}`);
    const fresh = () => ({ letters: puzzle.grid.map((row) => row.split('').map(() => '')), elapsed: 0, penalty: 0, checked: {}, revealed: {}, done: false, won: false });
    state = saved && saved.grid && saved.grid.join() === puzzle.grid.join() ? saved : fresh();
    const { map } = await vocab();
    const genres = await tmdb.genreNames().catch(() => ({}));
    clues = {};
    for (const s of puzzle.slots) {
      const word = cellsOf(s).map(([r, c]) => puzzle.grid[r][c]).join('');
      clues[`${s.num}${s.dir}`] = clueFor(map.get(word), genres);
    }
    const first = puzzle.slots.find((s) => s.dir === 'across');
    goToSlot(first);
    renderHead();
    renderTools();
    renderAll();
    if (!kb) {
      kb = keyboard(onKey, { enter: false });
      kbBox.replaceChildren(kb);
      listenKeys(node, (k) => onKey(k));
    }
    clearInterval(timer);
    lastTick = Date.now();
    timer = setInterval(tick, 500);
    if (state.done && !state.saved) record();
  }

  async function makePuzzle(seedText) {
    const { words } = await vocab();
    let n = 0;
    for (;;) {
      const p = generate(words, rng(hashString(`${seedText}:${n}`)));
      if (p) return p;
      n += 1;
    }
  }

  async function startPractice(fresh = false) {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem('cinenjoy:game:crossword:practice-current') || 'null');
    } catch {
      saved = null;
    }
    if (fresh || !saved || !saved.key) {
      saved = { key: `p-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}` };
      try {
        localStorage.setItem('cinenjoy:game:crossword:practice-current', JSON.stringify(saved));
      } catch {
        /* fine */
      }
    }
    puzzleKey = saved.key;
    const p = await track(makePuzzle(`cinenjoy-mini-${saved.key}`));
    await begin(p);
  }

  async function start() {
    renderHeadLoading();
    try {
      if (mode === 'daily') {
        puzzleKey = todayKey();
        const saved = loadState(`crossword:${puzzleKey}`);
        const p = saved && saved.grid ? { pattern: saved.pattern, grid: saved.grid } : await track(makePuzzle(`cinenjoy-mini-${puzzleKey}`));
        await begin(p);
      } else if (mode === 'practice') {
        await startPractice();
      } else {
        challenge = await track(db.getChallenge(arg));
        if (!challenge || challenge.game !== 'crossword' || !challenge.puzzle || !Array.isArray(challenge.puzzle.grid)) {
          renderHead();
          gridBox.replaceChildren(el(`<div class="error-box"><p>${esc(t('games.challengeMissing'))}</p></div>`));
          return;
        }
        puzzleKey = `c-${challenge.id}`;
        await begin({ pattern: challenge.puzzle.pattern, grid: challenge.puzzle.grid });
      }
    } catch (err) {
      console.warn(err);
      gridBox.replaceChildren(el(`<div class="error-box"><p>${esc(t('errors.generic'))}</p></div>`));
    }
  }

  function renderHeadLoading() {
    head.replaceChildren(frag(`<a class="back" href="/games" data-link>‹ ${esc(t('nav.games'))}</a><h1>${esc(t('mini.title'))}</h1>`));
    gridBox.replaceChildren(el(`<div class="loading-box"><span class="spinner"></span>${esc(t('ui.loading'))}</div>`));
  }

  start();
  return node;
}
