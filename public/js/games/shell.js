// The frame shared by the smaller daily games (Emoji Plot, Timeline):
// header and links, daily / practice / challenge puzzles, saving progress and
// results, the result sheet with sharing, challenge links and stats.
import { t } from '../i18n.js';
import * as db from '../data.js';
import { track } from '../loading.js';
import { esc, el, frag, toast, openSheet } from '../ui.js';
import {
  todayKey, dayNumber, hashString, rng, shuffle, msToMidnight, fmtCountdown,
  loadState, saveState, ensureName, stats, statsHtml, share, challengeUrl, boardHtml,
} from './common.js';

/**
 * spec: {
 *   game, name, path, count, seed, help: () => html, maxScore,
 *   initial: () => state,
 *   play(ctx): draws the game into ctx.area; calls ctx.save() and ctx.finish(won, score)
 *   summary(ctx): { line, card?: Element, head?: string }
 *   lowerIsBetter (default true), fmtScore
 * }
 */
export function puzzlePage(spec, mode = 'daily', challengeId) {
  const order = shuffle(Array.from({ length: spec.count }, (_, i) => i), rng(hashString(spec.seed)));
  const daily = (key = todayKey()) => {
    const n = dayNumber(key);
    return order[(((n - 1) % order.length) + order.length) % order.length];
  };
  const node = document.createElement('section');
  node.className = `page game ${spec.game}`;
  const head = el('<header class="game-head"></header>');
  const area = el('<div class="puzzle-area"></div>');
  const bar = el('<div class="game-bar"></div>');
  node.append(head, area, bar);
  const fmt = spec.fmtScore || ((s) => `${s}/${spec.maxScore}`);
  const ctx = { mode, area, idx: null, key: null, state: null, challenge: null };

  function renderHead() {
    const label = mode === 'daily' ? t('play.dailyN', { n: dayNumber() }) : mode === 'practice' ? t('play.practice') : t('play.challenge');
    head.replaceChildren(
      frag(`<a class="back" href="/games" data-link>‹ ${esc(t('nav.games'))}</a>
      <div class="game-title-row"><h1>${esc(spec.name())}</h1><span class="chip">${esc(label)}</span></div>
      <div class="game-links">
        <button type="button" class="link-btn" data-help>${esc(t('play.howToPlay'))}</button>
        ${mode !== 'daily' ? `<a class="link-btn" href="${spec.path}" data-link>${esc(t('play.daily'))}</a>` : ''}
        ${mode !== 'practice' ? `<a class="link-btn" href="${spec.path}/practice" data-link>${esc(t('play.practice'))}</a>` : ''}
        <button type="button" class="link-btn" data-stats>${esc(t('play.stats'))}</button>
      </div>`),
    );
    head.querySelector('[data-help]').addEventListener('click', () => openSheet({ title: t('play.howToPlay'), body: el(`<div class="help">${spec.help()}</div>`) }));
    head.querySelector('[data-stats]').addEventListener('click', async () => {
      const results = await track(db.myResults(spec.game)).catch(() => []);
      openSheet({ title: t('play.stats'), body: el(`<div>${statsHtml(stats(results, spec.maxScore || 6), { distLabel: Boolean(spec.maxScore) })}</div>`) });
    });
  }

  ctx.save = () => saveState(`${spec.game}:${ctx.key}`, ctx.state);
  ctx.finish = async (won, score) => {
    ctx.state.done = true;
    ctx.state.won = won;
    ctx.state.score = won ? score : null;
    ctx.save();
    renderBar();
    await record();
    setTimeout(showResult, 500);
  };

  function renderBar() {
    bar.innerHTML = ctx.state.done ? `<button type="button" class="btn btn-small" data-result>${esc(t('play.seeResult'))}</button>` : '';
    const b = bar.querySelector('[data-result]');
    if (b) b.addEventListener('click', showResult);
  }

  async function record() {
    const s = ctx.state;
    const result = { won: s.won, score: s.score, hintUsed: Boolean(s.hint) };
    try {
      if (mode === 'challenge') {
        await ensureName();
        await db.saveChallengeResult(ctx.challenge.id, result);
      } else {
        await db.saveResult({ game: spec.game, mode, puzzleKey: ctx.key, won: s.won, score: s.score, hintUsed: result.hintUsed, detail: { puzzle: ctx.idx } });
      }
      s.saved = true;
      ctx.save();
    } catch (err) {
      console.warn('result not saved yet', err);
    }
  }

  async function showResult() {
    const sum = spec.summary(ctx);
    const s = ctx.state;
    const box = el(`<div class="result-box">
      <p class="result-head">${esc(sum.head || (s.won ? t('play.solved') : t('play.notThisTime')))}</p>
      <div data-card></div>
      <div class="result-actions">
        <button type="button" class="btn" data-share>${esc(t('play.shareResult'))}</button>
        ${mode !== 'challenge' ? `<button type="button" class="btn btn-ghost" data-challenge>${esc(t('play.challengeFriend'))}</button>` : ''}
        ${mode !== 'practice' ? `<a class="btn btn-ghost" href="${spec.path}/practice" data-link>${esc(t('play.playPractice'))}</a>` : `<button type="button" class="btn btn-ghost" data-again>${esc(t('play.playAgain'))}</button>`}
      </div>
      <div data-extra></div></div>`);
    if (sum.card) box.querySelector('[data-card]').append(sum.card);
    const close = openSheet({ title: spec.name(), body: box });
    box.querySelectorAll('a[data-link]').forEach((a) => a.addEventListener('click', () => close()));
    const top = mode === 'daily' ? `CINENJOY ${spec.name()} #${dayNumber()}` : `CINENJOY ${spec.name()}`;
    box.querySelector('[data-share]').addEventListener('click', () =>
      share(`${top} ${s.won ? fmt(s.score) : 'X'}\n${sum.line}`, mode === 'challenge' ? challengeUrl(spec.game, ctx.challenge.id) : `${location.origin}${spec.path}`),
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
          const id = await track(db.createChallenge(spec.game, { puzzle: ctx.idx }, { won: s.won, score: s.score, hintUsed: Boolean(s.hint) }));
          await share(t('play.challengeText', { game: spec.name() }), challengeUrl(spec.game, id));
        } catch (err) {
          console.warn(err);
          toast(t('errors.generic'), 'error');
        } finally {
          ch.disabled = false;
        }
      });
    const extra = box.querySelector('[data-extra]');
    if (mode === 'daily') {
      const rs = await db.myResults(spec.game).catch(() => []);
      extra.innerHTML = `${statsHtml(stats(rs, spec.maxScore || 6), { distLabel: Boolean(spec.maxScore) })}<p class="muted next-in">${esc(t('play.nextIn'))} <b data-cd>${fmtCountdown(msToMidnight())}</b></p>`;
      const cd = extra.querySelector('[data-cd]');
      const timer = setInterval(() => {
        if (!cd.isConnected) return clearInterval(timer);
        cd.textContent = fmtCountdown(msToMidnight());
      }, 1000);
    } else if (mode === 'challenge') {
      const lower = spec.lowerIsBetter !== false;
      const rows = (await db.challengeBoard(ctx.challenge.id).catch(() => [])).sort(
        (a, b) => b.won - a.won || (lower ? (a.score ?? 1e9) - (b.score ?? 1e9) : (b.score ?? -1) - (a.score ?? -1)),
      );
      extra.innerHTML = boardHtml(rows, (r) => fmt(r.score));
    }
  }

  function begin() {
    ctx.state = loadState(`${spec.game}:${ctx.key}`) || spec.initial(ctx);
    renderHead();
    area.replaceChildren();
    spec.play(ctx);
    renderBar();
    if (ctx.state.done && !ctx.state.saved) record();
  }

  function startPractice(fresh = false) {
    let saved = loadState(`${spec.game}:practice-current`);
    if (fresh || !saved || saved.puzzle == null || saved.puzzle >= spec.count) {
      const avoid = daily();
      let i;
      do i = Math.floor(Math.random() * spec.count);
      while (i === avoid && spec.count > 1);
      saved = { puzzle: i, key: `p-${i}-${Date.now().toString(36)}` };
      saveState(`${spec.game}:practice-current`, saved);
    }
    ctx.idx = saved.puzzle;
    ctx.key = saved.key;
    begin();
  }
  ctx.startPractice = startPractice;

  if (mode === 'daily') {
    ctx.key = todayKey();
    ctx.idx = daily(ctx.key);
    begin();
  } else if (mode === 'practice') startPractice();
  else
    track(db.getChallenge(challengeId))
      .then((c) => {
        if (!c || c.game !== spec.game || !c.puzzle || !(c.puzzle.puzzle >= 0 && c.puzzle.puzzle < spec.count)) throw new Error('missing');
        ctx.challenge = c;
        ctx.idx = c.puzzle.puzzle;
        ctx.key = `c-${c.id}`;
        begin();
      })
      .catch(() => {
        renderHead();
        area.replaceChildren(el(`<div class="error-box"><p>${esc(t('play.challengeMissing'))}</p></div>`));
      });
  return node;
}
