// Minute Cryptic: one cryptic clue a day. Every clue is a definition (the
// title, described) plus wordplay (an anagram or a hidden word). Hints come in
// stages; the score is your time plus penalties. Daily, practice and challenge.
import { t } from '../i18n.js';
import * as db from '../data.js';
import { track } from '../loading.js';
import { esc, el, frag, toast, openSheet } from '../ui.js';
import { CRYPTIC } from './cryptic-data.js';
import {
  todayKey, dayNumber, hashString, rng, shuffle, msToMidnight, fmtCountdown, fmtTime,
  loadState, saveState, nextPractice, keyboard, listenKeys, ensureName, stats, statsHtml, share, challengeUrl, boardHtml, titleCard,
} from './common.js';

const HINT_COST = 20;
const WRONG_COST = 10;
// The seed is chosen so the first days have clear clues
const ORDER = shuffle(CRYPTIC.map((_, i) => i), rng(hashString('cinenjoy-cryptic-v1316')));

export function dailyClue(key = todayKey()) {
  const n = dayNumber(key);
  return ORDER[(((n - 1) % ORDER.length) + ORDER.length) % ORDER.length];
}

const PRE = ['Mixed-up', 'Crazy', 'Wild', 'Broken', 'Strange', 'Scrambled', 'Messy', 'Unusual'];
const POST = ['rearranged', 'in a mess', 'shuffled', 'mixed up', 'all over the place', 'broken up'];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function entry(i) {
  const [w, tv, id, y, maker, anime, type, fodder] = CRYPTIC[i];
  return { w, mt: tv ? 'tv' : 'movie', id, y, maker, anime: Boolean(anime), type, fodder: fodder.join(' ') };
}

/** The clue as parts: [{text, def?}] so the definition can be underlined. */
export function clueParts(i) {
  const e = entry(i);
  const def = e.anime ? `${e.y} anime` : e.mt === 'tv' ? (e.maker ? `${e.maker}'s series` : `${e.y} series`) : e.maker ? `${e.maker}'s ${e.y} film` : `${e.y} film`;
  const h = hashString(`${e.w}-clue`);
  const n = ` (${e.w.length})`;
  if (e.type === 'a') {
    if (h % 2)
      return [{ text: `${PRE[h % PRE.length]} ${e.fodder} makes ` }, { text: def, def: true }, { text: n }];
    return [{ text: cap(def), def: true }, { text: ` from ${e.fodder}, ${POST[h % POST.length]}${n}` }];
  }
  const k = h % 3;
  if (k === 0) return [{ text: cap(def), def: true }, { text: ` found in ${e.fodder}${n}` }];
  if (k === 1) return [{ text: `Some ${e.fodder} hold ` }, { text: def, def: true }, { text: n }];
  return [{ text: `Part of ${e.fodder} is ` }, { text: def, def: true }, { text: n }];
}

/** mode: 'daily' | 'practice' | 'challenge' */
export function crypticPage(mode = 'daily', challengeId) {
  const node = document.createElement('section');
  node.className = 'page game cryptic';
  const head = el('<header class="game-head"></header>');
  const card = el('<div class="cryptic-card"></div>');
  const tiles = el('<div class="cryptic-tiles" aria-live="polite"></div>');
  const bar = el('<div class="game-bar cryptic-bar"></div>');
  const hints = el('<ol class="cryptic-hints"></ol>');
  const kbBox = el('<div class="kb-wrap"></div>');
  node.append(head, card, tiles, bar, hints, kbBox);

  let idx = null;
  let puzzleKey = null;
  let challenge = null;
  let state = null; // { typed, hints, wrong, seconds, done, won, revealed }
  let kb = null;
  let ticker = null;

  const e = () => entry(idx);
  const total = () => state.seconds + state.hints * HINT_COST + state.wrong * WRONG_COST;

  function renderHead() {
    const label = mode === 'daily' ? t('play.dailyN', { n: dayNumber() }) : mode === 'practice' ? t('play.practice') : t('play.challenge');
    head.replaceChildren(
      frag(`<a class="back" href="/games" data-link>‹ ${esc(t('nav.games'))}</a>
      <div class="game-title-row"><h1>Minute Cryptic</h1><span class="chip">${esc(label)}</span></div>
      <div class="game-links">
        <button type="button" class="link-btn" data-help>${esc(t('play.howToPlay'))}</button>
        ${mode !== 'daily' ? `<a class="link-btn" href="/games/cryptic" data-link>${esc(t('play.daily'))}</a>` : ''}
        ${mode !== 'practice' ? `<a class="link-btn" href="/games/cryptic/practice" data-link>${esc(t('play.practice'))}</a>` : ''}
        <button type="button" class="link-btn" data-stats>${esc(t('play.stats'))}</button>
        ${mode === 'practice' ? `<button type="button" class="link-btn" data-new>⟳ ${esc(t('play.newPuzzle'))}</button>` : ''}
      </div>`),
    );
    head.querySelector('[data-help]').addEventListener('click', () =>
      openSheet({
        title: t('play.howToPlay'),
        body: el(`<div class="help"><p>${esc(t('mc.help1'))}</p><p>${esc(t('mc.help2'))}</p><p>${esc(t('mc.help3'))}</p><p class="muted">${esc(t('mc.englishNote'))}</p></div>`),
      }),
    );
    const nb = head.querySelector('[data-new]');
    if (nb) nb.addEventListener('click', () => startPractice(true));
    head.querySelector('[data-stats]').addEventListener('click', async () => {
      const results = await track(db.myResults('cryptic')).catch(() => []);
      openSheet({ title: t('play.stats'), body: el(`<div>${statsHtml(stats(results), { distLabel: false })}</div>`) });
    });
  }

  function render() {
    const parts = clueParts(idx);
    const showDef = state.hints >= 1 || state.done;
    card.innerHTML = `<p class="label">${esc(t('mc.clue'))}</p><p class="cryptic-clue" lang="en">${parts
      .map((p) => (p.def && showDef ? `<u class="cryptic-def">${esc(p.text)}</u>` : esc(p.text)))
      .join('')}</p>
      <p class="cryptic-time"><span data-time>${fmtTime(total())}</span>${state.hints || state.wrong ? ` <span class="muted">(${esc(t('mc.penalty', { s: state.hints * HINT_COST + state.wrong * WRONG_COST }))})</span>` : ''}</p>`;
    const word = e().w;
    const shown = state.done ? word : state.typed;
    tiles.innerHTML = `<div class="w-board" style="--cols:${word.length}"><div class="w-row is-current">${[...word]
      .map((ch, i) => {
        const c = shown[i] || (state.hints >= 3 && i === 0 ? word[0] : '');
        const st = state.done ? (state.won ? 'correct' : 'absent') : c ? 'typed' : 'empty';
        return `<span class="tile-w" data-state="${st}">${esc(c)}</span>`;
      })
      .join('')}</div></div>`;
    const list = [];
    if (state.hints >= 1 || state.done) list.push(t('mc.hintDef', { def: parts.find((p) => p.def).text }));
    if (state.hints >= 2 || state.done) list.push(e().type === 'a' ? t('mc.hintAnagram', { f: e().fodder.toUpperCase() }) : t('mc.hintHidden', { f: e().fodder }));
    if (state.hints >= 3 && !state.done) list.push(t('mc.hintFirst', { l: word[0] }));
    hints.innerHTML = list.map((h) => `<li>💡 ${esc(h)}</li>`).join('');
    bar.innerHTML = state.done
      ? `<button type="button" class="btn btn-small" data-result>${esc(t('play.seeResult'))}</button>`
      : state.hints < 3
        ? `<button type="button" class="btn btn-small btn-ghost" data-hint>💡 ${esc(t('mc.hintBtn', { n: state.hints + 1, s: HINT_COST }))}</button>`
        : `<button type="button" class="btn btn-small btn-ghost" data-reveal>${esc(t('mc.reveal'))}</button>`;
    const hb = bar.querySelector('[data-hint]');
    if (hb)
      hb.addEventListener('click', () => {
        state.hints += 1;
        if (state.hints >= 3 && !state.typed) state.typed = word[0];
        persist();
        render();
      });
    const rv = bar.querySelector('[data-reveal]');
    if (rv) rv.addEventListener('click', () => finish(false));
    const rb = bar.querySelector('[data-result]');
    if (rb) rb.addEventListener('click', showResult);
    kbBox.hidden = state.done;
  }

  function tick() {
    clearInterval(ticker);
    ticker = setInterval(() => {
      if (!node.isConnected) return clearInterval(ticker);
      if (state.done || document.visibilityState !== 'visible') return;
      state.seconds += 1;
      if (state.seconds % 5 === 0) persist();
      const tEl = card.querySelector('[data-time]');
      if (tEl) tEl.textContent = fmtTime(total());
    }, 1000);
  }

  function onKey(k) {
    if (!state || state.done) return;
    const word = e().w;
    if (k === 'BACK') state.typed = state.typed.slice(0, -1);
    else if (k === 'ENTER') return check();
    else if (/^[A-Z]$/.test(k) && state.typed.length < word.length) state.typed += k;
    else return;
    render();
  }

  function check() {
    const word = e().w;
    if (state.typed.length < word.length) {
      toast(t('cw.tooShort'));
      return;
    }
    if (state.typed === word) return finish(true);
    state.wrong += 1;
    state.typed = state.hints >= 3 ? word[0] : '';
    toast(t('mc.notIt', { s: WRONG_COST }));
    persist();
    render();
    const row = tiles.querySelector('.w-row');
    if (row) row.classList.add('shake');
  }

  async function finish(won) {
    state.done = true;
    state.won = won;
    persist();
    render();
    await record();
    setTimeout(showResult, 400);
  }

  function persist() {
    saveState(`cryptic:${puzzleKey}`, state);
  }

  async function record() {
    const result = { won: state.won, score: state.won ? total() : null, hintUsed: state.hints > 0 };
    try {
      if (mode === 'challenge') {
        await ensureName();
        await db.saveChallengeResult(challenge.id, result);
      } else {
        await db.saveResult({ game: 'cryptic', mode, puzzleKey, won: result.won, score: result.score, hintUsed: result.hintUsed, detail: { clue: idx, hints: state.hints, wrong: state.wrong, seconds: state.seconds } });
      }
      state.saved = true;
      persist();
    } catch (err) {
      console.warn('result not saved yet', err);
    }
  }

  function shareText() {
    const top = mode === 'daily' ? `CINEJOY Minute Cryptic #${dayNumber()}` : 'CINEJOY Minute Cryptic';
    return `${top}\n${state.won ? `⏱ ${fmtTime(total())}` : '❌'}${state.hints ? ` ${'💡'.repeat(state.hints)}` : ''}${state.wrong ? ` ${'✕'.repeat(Math.min(state.wrong, 5))}` : ''}`;
  }

  async function showResult() {
    const x = e();
    const box = el(`<div class="result-box">
      <p class="result-head">${esc(state.won ? t('mc.won', { time: fmtTime(total()) }) : t('mc.lost'))}</p>
      <p class="muted">${esc(x.type === 'a' ? t('mc.explainAnagram', { f: x.fodder.toUpperCase(), w: x.w }) : t('mc.explainHidden', { f: x.fodder, w: x.w }))}</p>
      <div data-card></div>
      <div class="result-actions">
        <button type="button" class="btn" data-share>${esc(t('play.shareResult'))}</button>
        ${mode !== 'challenge' ? `<button type="button" class="btn btn-ghost" data-challenge>${esc(t('play.challengeFriend'))}</button>` : ''}
        ${mode !== 'practice' ? `<a class="btn btn-ghost" href="/games/cryptic/practice" data-link>${esc(t('play.playPractice'))}</a>` : `<button type="button" class="btn btn-ghost" data-again>${esc(t('play.playAgain'))}</button>`}
      </div>
      <div data-extra></div></div>`);
    box.querySelector('[data-card]').append(titleCard({ mt: x.mt, id: x.id, label: x.w, y: x.y, d: x.maker, medium: x.anime ? 'anime' : x.mt === 'tv' ? 'series' : 'film' }));
    const close = openSheet({ title: 'Minute Cryptic', body: box });
    box.querySelectorAll('a[data-link]').forEach((a) => a.addEventListener('click', () => close()));
    box.querySelector('[data-share]').addEventListener('click', () =>
      share(shareText(), mode === 'challenge' ? challengeUrl('cryptic', challenge.id) : `${location.origin}/games/cryptic`),
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
          const id = await track(db.createChallenge('cryptic', { clue: idx }, { won: state.won, score: state.won ? total() : null, hintUsed: state.hints > 0 }));
          await share(t('play.challengeText', { game: 'Minute Cryptic' }), challengeUrl('cryptic', id));
        } catch (err) {
          console.warn(err);
          toast(t('errors.generic'), 'error');
        } finally {
          ch.disabled = false;
        }
      });
    const extra = box.querySelector('[data-extra]');
    if (mode === 'daily') {
      const rs = await db.myResults('cryptic').catch(() => []);
      extra.innerHTML = `${statsHtml(stats(rs), { distLabel: false })}<p class="muted next-in">${esc(t('play.nextIn'))} <b data-cd>${fmtCountdown(msToMidnight())}</b></p>`;
      const cd = extra.querySelector('[data-cd]');
      const timer = setInterval(() => {
        if (!cd.isConnected) return clearInterval(timer);
        cd.textContent = fmtCountdown(msToMidnight());
      }, 1000);
    } else if (mode === 'challenge') {
      const rows = (await db.challengeBoard(challenge.id).catch(() => [])).sort((a, b) => (b.won - a.won) || (a.score ?? 1e9) - (b.score ?? 1e9));
      extra.innerHTML = boardHtml(rows, (r) => fmtTime(r.score || 0));
    }
  }

  function begin() {
    state = loadState(`cryptic:${puzzleKey}`) || { typed: '', hints: 0, wrong: 0, seconds: 0, done: false, won: false };
    renderHead();
    render();
    if (!kb) {
      kb = keyboard(onKey);
      kbBox.replaceChildren(kb);
      listenKeys(node, onKey);
    }
    tick();
    if (state.done && !state.saved) record();
  }

  function startPractice(fresh = false) {
    let saved = loadState('cryptic:practice-current');
    if (fresh || !saved || !CRYPTIC[saved.clue]) {
      const i = nextPractice('cryptic', CRYPTIC.length, dailyClue());
      saved = { clue: i, key: `p-${i}-${Date.now().toString(36)}` };
      saveState('cryptic:practice-current', saved);
    }
    idx = saved.clue;
    puzzleKey = saved.key;
    begin();
  }

  if (mode === 'daily') {
    puzzleKey = todayKey();
    idx = dailyClue(puzzleKey);
    begin();
  } else if (mode === 'practice') startPractice();
  else
    track(db.getChallenge(challengeId))
      .then((c) => {
        if (!c || c.game !== 'cryptic' || !CRYPTIC[c.puzzle && c.puzzle.clue]) throw new Error('missing');
        challenge = c;
        idx = c.puzzle.clue;
        puzzleKey = `c-${c.id}`;
        begin();
      })
      .catch(() => {
        renderHead();
        card.replaceWith(el(`<div class="error-box"><p>${esc(t('play.challengeMissing'))}</p></div>`));
      });
  return node;
}
