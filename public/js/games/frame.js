// Frame Guess: name the film or series from one still. It starts zoomed in
// and blurred, and each wrong guess or skip shows more. Six tries.
// Daily (same frame for everyone), practice and challenge links.
import { t } from '../i18n.js';
import * as db from '../data.js';
import * as tmdb from '../tmdb.js';
import { track } from '../loading.js';
import { TMDB_IMG } from '../config.js';
import { esc, el, frag, toast, openSheet, debounce } from '../ui.js';
import { FRAMES } from './frame-data.js';
import {
  todayKey, dayNumber, hashString, rng, shuffle, msToMidnight, fmtCountdown,
  loadState, saveState, nextPractice, ensureName, stats, statsHtml, share, challengeUrl, boardHtml, titleCard,
} from './common.js';

const TRIES = 6;
// The first image used to be too blurred to tell anything, so it now starts
// where the 4th image used to be (zoom 1.7, blur 3) and clears from there.
const ZOOM = [1.7, 1.5, 1.35, 1.2, 1.1, 1];
const BLUR = [3, 2.3, 1.6, 1, 0.5, 0];
const ORDER = shuffle(FRAMES.map((_, i) => i), rng(hashString('cinenjoy-frame-v1')));
const go = (href) => document.dispatchEvent(new CustomEvent('cinenjoy:navigate', { detail: href }));

export function dailyFrame(key = todayKey()) {
  const n = dayNumber(key);
  return ORDER[(((n - 1) % ORDER.length) + ORDER.length) % ORDER.length];
}

const entryOf = (i) => {
  const [tv, id, title, year] = FRAMES[i];
  return { mt: tv ? 'tv' : 'movie', id, title, year };
};

async function stillFor(i, seed) {
  const e = entryOf(i);
  const q = new URLSearchParams({ path: `${e.mt}/${e.id}/images`, include_image_language: 'null' });
  const r = await fetch(`/api/tmdb?${q}`);
  if (!r.ok) throw new Error('images');
  const data = await r.json();
  const list = (data.backdrops || []).filter((b) => b.width >= 1280).slice(0, 10);
  if (!list.length) throw new Error('no still');
  // Skip the most-voted backdrop (often the famous poster art) when there are others
  const pool = list.length > 2 ? list.slice(1) : list;
  const pick = pool[hashString(`${seed}`) % pool.length];
  return `${TMDB_IMG}w1280${pick.file_path}`;
}

/** mode: 'daily' | 'practice' | 'challenge' */
export function framePage(mode = 'daily', challengeId) {
  const node = document.createElement('section');
  node.className = 'page game frame';
  const head = el('<header class="game-head"></header>');
  const stage = el('<div class="frame-stage"><div class="frame-img" role="img"></div><span class="frame-tries"></span></div>');
  const tries = el('<ol class="frame-guesses"></ol>');
  const form = el(`<form class="frame-form" autocomplete="off">
      <div class="frame-input"><input type="search" maxlength="120" aria-label="${esc(t('fg.guessLabel'))}" placeholder="${esc(t('fg.placeholder'))}" />
      <ul class="frame-suggest" role="listbox" hidden></ul></div>
      <button class="btn btn-ghost" type="button" data-skip>${esc(t('fg.skip'))}</button>
    </form>`);
  const bar = el('<div class="game-bar"></div>');
  node.append(head, stage, form, tries, bar);

  let idx = null;
  let puzzleKey = null;
  let challenge = null;
  let state = null; // { guesses: [{label, id, mt, right} | {skip:true}], done, won }

  const entry = () => entryOf(idx);

  function renderHead() {
    const label = mode === 'daily' ? t('play.dailyN', { n: dayNumber() }) : mode === 'practice' ? t('play.practice') : t('play.challenge');
    head.replaceChildren(
      frag(`<a class="back" href="/games" data-link>‹ ${esc(t('nav.games'))}</a>
      <div class="game-title-row"><h1>${esc(t('fg.name'))}</h1><span class="chip">${esc(label)}</span></div>
      <div class="game-links">
        <button type="button" class="link-btn" data-help>${esc(t('play.howToPlay'))}</button>
        ${mode !== 'daily' ? `<a class="link-btn" href="/games/frame" data-link>${esc(t('play.daily'))}</a>` : ''}
        ${mode !== 'practice' ? `<a class="link-btn" href="/games/frame/practice" data-link>${esc(t('play.practice'))}</a>` : ''}
        <button type="button" class="link-btn" data-stats>${esc(t('play.stats'))}</button>
        ${mode === 'practice' ? `<button type="button" class="link-btn" data-new>⟳ ${esc(t('play.newPuzzle'))}</button>` : ''}
      </div>`),
    );
    const nb = head.querySelector('[data-new]');
    if (nb) nb.addEventListener('click', () => startPractice(true));
    head.querySelector('[data-help]').addEventListener('click', () =>
      openSheet({ title: t('play.howToPlay'), body: el(`<div class="help"><p>${esc(t('fg.help1'))}</p><p>${esc(t('fg.help2'))}</p></div>`) }),
    );
    head.querySelector('[data-stats]').addEventListener('click', async () => {
      const results = await track(db.myResults('frame')).catch(() => []);
      openSheet({ title: t('play.stats'), body: el(`<div>${statsHtml(stats(results))}</div>`) });
    });
  }

  function render() {
    const step = state.done ? TRIES - 1 : Math.min(state.guesses.length, TRIES - 1);
    const img = stage.querySelector('.frame-img');
    img.style.setProperty('--zoom', ZOOM[step]);
    img.style.setProperty('--blur', `${BLUR[step]}px`);
    img.setAttribute('aria-label', t('fg.imgLabel', { n: step + 1 }));
    stage.querySelector('.frame-tries').textContent = state.done ? '' : t('fg.triesLeft', { n: TRIES - state.guesses.length });
    tries.innerHTML = state.guesses
      .map((g) => `<li class="${g.right ? 'ok' : g.skip ? 'skip' : 'bad'}">${g.right ? '🟩' : g.skip ? '⬜' : '🟥'} ${esc(g.skip ? t('fg.skipped') : g.label)}</li>`)
      .join('');
    form.hidden = state.done;
    bar.innerHTML = state.done ? `<button type="button" class="btn btn-small" data-result>${esc(t('play.seeResult'))}</button>` : '';
    const rb = bar.querySelector('[data-result]');
    if (rb) rb.addEventListener('click', showResult);
  }

  // Autocomplete from TMDB search
  const input = form.querySelector('input');
  const list = form.querySelector('.frame-suggest');
  let results = [];
  let active = -1;
  const paint = () => {
    list.hidden = !results.length;
    list.innerHTML = results
      .map((r, i) => `<li role="option" data-i="${i}" class="${i === active ? 'on' : ''}">${esc(r.title)} <span class="muted">${esc(tmdb.yearOf(r))} · ${esc(t(`medium.${r.media_type === 'tv' ? 'series' : 'film'}`))}</span></li>`)
      .join('');
  };
  const lookup = debounce(async () => {
    const q = input.value.trim();
    if (q.length < 2) {
      results = [];
      paint();
      return;
    }
    try {
      results = (await tmdb.search(q)).slice(0, 6);
      active = -1;
      if (input.value.trim() === q) paint();
    } catch {
      /* typing on */
    }
  }, 250);
  input.addEventListener('input', lookup);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!results.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
      paint();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results.length) guess(results[Math.max(0, active)]);
    } else if (e.key === 'Escape') {
      results = [];
      paint();
    }
  });
  list.addEventListener('mousedown', (e) => {
    const li = e.target.closest('[data-i]');
    if (li) {
      e.preventDefault();
      guess(results[Number(li.dataset.i)]);
    }
  });
  form.addEventListener('submit', (e) => e.preventDefault());
  form.querySelector('[data-skip]').addEventListener('click', () => step({ skip: true }));

  function guess(r) {
    if (!r || state.done) return;
    const e = entry();
    if (state.guesses.some((g) => g.id === r.tmdb_id && g.mt === r.media_type)) {
      toast(t('fg.already'));
      return;
    }
    step({ label: r.title, id: r.tmdb_id, mt: r.media_type, right: r.tmdb_id === e.id && r.media_type === e.mt });
  }

  function step(g) {
    state.guesses.push(g);
    input.value = '';
    results = [];
    paint();
    if (g.right || state.guesses.length >= TRIES) {
      state.done = true;
      state.won = Boolean(g.right);
    } else if (!g.skip) toast(t('fg.notIt'));
    persist();
    render();
    if (state.done) record().then(() => setTimeout(showResult, 500));
    else input.focus();
  }

  function persist() {
    saveState(`frame:${puzzleKey}`, state);
  }

  async function record() {
    const result = { won: state.won, score: state.won ? state.guesses.length : null, hintUsed: false };
    try {
      if (mode === 'challenge') {
        await ensureName();
        await db.saveChallengeResult(challenge.id, result);
      } else {
        await db.saveResult({ game: 'frame', mode, puzzleKey, won: result.won, score: result.score, detail: { frame: idx, guesses: state.guesses.length } });
      }
      state.saved = true;
      persist();
    } catch (err) {
      console.warn('result not saved yet', err);
    }
  }

  function shareText() {
    const top = mode === 'daily' ? `CINEJOY ${t('fg.name')} #${dayNumber()}` : `CINEJOY ${t('fg.name')}`;
    const row = state.guesses.map((g) => (g.right ? '🟩' : g.skip ? '⬜' : '🟥')).join('');
    return `${top} ${state.won ? state.guesses.length : 'X'}/${TRIES}\n🎞️ ${row}`;
  }

  async function showResult() {
    const e = entry();
    const box = el(`<div class="result-box">
      <p class="result-head">${esc(state.won ? t('fg.won', { n: state.guesses.length }) : t('fg.lost'))}</p>
      <div data-card></div>
      <div class="result-actions">
        <button type="button" class="btn" data-share>${esc(t('play.shareResult'))}</button>
        ${mode !== 'challenge' ? `<button type="button" class="btn btn-ghost" data-challenge>${esc(t('play.challengeFriend'))}</button>` : ''}
        ${mode !== 'practice' ? `<a class="btn btn-ghost" href="/games/frame/practice" data-link>${esc(t('play.playPractice'))}</a>` : `<button type="button" class="btn btn-ghost" data-again>${esc(t('play.playAgain'))}</button>`}
      </div>
      <div data-extra></div></div>`);
    box.querySelector('[data-card]').append(titleCard({ mt: e.mt, id: e.id, label: e.title, y: e.year, medium: e.mt === 'tv' ? 'series' : 'film' }));
    const close = openSheet({ title: t('fg.name'), body: box });
    box.querySelectorAll('a[data-link]').forEach((x) => x.addEventListener('click', () => close()));
    box.querySelector('[data-share]').addEventListener('click', () =>
      share(shareText(), mode === 'challenge' ? challengeUrl('frame', challenge.id) : `${location.origin}/games/frame`),
    );
    const again = box.querySelector('[data-again]');
    if (again)
      again.addEventListener('click', () => {
        close();
        startPractice(true);
      });
    const ch = box.querySelector('[data-challenge]');
    if (ch)
      ch.addEventListener('click', async () => {
        ch.disabled = true;
        try {
          await ensureName();
          const id = await track(db.createChallenge('frame', { frame: idx }, { won: state.won, score: state.won ? state.guesses.length : null, hintUsed: false }));
          await share(t('play.challengeText', { game: t('fg.name') }), challengeUrl('frame', id));
        } catch (err) {
          console.warn(err);
          toast(t('errors.generic'), 'error');
        } finally {
          ch.disabled = false;
        }
      });
    const extra = box.querySelector('[data-extra]');
    if (mode === 'daily') {
      const rs = await db.myResults('frame').catch(() => []);
      extra.innerHTML = `${statsHtml(stats(rs))}<p class="muted next-in">${esc(t('play.nextIn'))} <b data-cd>${fmtCountdown(msToMidnight())}</b></p>`;
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

  async function begin() {
    state = loadState(`frame:${puzzleKey}`) || { guesses: [], done: false, won: false };
    renderHead();
    render();
    const img = stage.querySelector('.frame-img');
    stage.classList.add('is-loading');
    try {
      const url = await track(stillFor(idx, puzzleKey));
      await new Promise((res, rej) => {
        const im = new Image();
        im.onload = res;
        im.onerror = rej;
        im.src = url;
      });
      img.style.backgroundImage = `url("${url}")`;
      // Each puzzle zooms in on its own spot, away from the edges
      const r = rng(hashString(puzzleKey));
      img.style.setProperty('--fx', `${25 + Math.round(r() * 50)}%`);
      img.style.setProperty('--fy', `${30 + Math.round(r() * 40)}%`);
    } catch (err) {
      console.warn(err);
      if (mode === 'practice') return startPractice(true);
      stage.querySelector('.frame-tries').textContent = t('errors.generic');
    } finally {
      stage.classList.remove('is-loading');
    }
    if (state.done && !state.saved) record();
  }

  function startPractice(fresh = false) {
    let saved = loadState('frame:practice-current');
    if (fresh || !saved || saved.frame == null || !FRAMES[saved.frame]) {
      const i = nextPractice('frame', FRAMES.length, dailyFrame());
      saved = { frame: i, key: `p-${i}-${Date.now().toString(36)}` };
      saveState('frame:practice-current', saved);
    }
    idx = saved.frame;
    puzzleKey = saved.key;
    begin();
  }

  if (mode === 'daily') {
    puzzleKey = todayKey();
    idx = dailyFrame(puzzleKey);
    begin();
  } else if (mode === 'practice') startPractice();
  else {
    track(db.getChallenge(challengeId))
      .then((c) => {
        if (!c || c.game !== 'frame' || !FRAMES[c.puzzle && c.puzzle.frame]) throw new Error('missing');
        challenge = c;
        idx = c.puzzle.frame;
        puzzleKey = `c-${c.id}`;
        begin();
      })
      .catch(() => node.replaceChildren(head, el(`<div class="error-box"><p>${esc(t('play.challengeMissing'))}</p></div>`)));
  }
  void go;
  return node;
}
