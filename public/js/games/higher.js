// Higher or Lower: is the next title rated higher, did it earn more, does it
// run longer? Keep the streak going. Practice is endless; a challenge link
// stores the exact run so friends get the same titles.
import { t, getLang } from '../i18n.js';
import * as db from '../data.js';
import * as tmdb from '../tmdb.js';
import { track } from '../loading.js';
import { esc, el, frag, toast } from '../ui.js';
import { ensureName, share, challengeUrl, boardHtml } from './common.js';

const API_LANG = { en: 'en-US', 'zh-CN': 'zh-CN', es: 'es-ES' };
const RUN = 25; // a challenge run
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

async function pool() {
  const pages = shuffle([1, 2, 3, 4, 5, 6, 7, 8]).slice(0, 3);
  const lists = await Promise.all([
    ...pages.map((p) => api('discover/movie', { sort_by: 'vote_count.desc', 'vote_count.gte': 2500, page: p }).then((d) => d.results.map((r) => ({ mt: 'movie', id: r.id })))),
    api('discover/tv', { sort_by: 'vote_count.desc', 'vote_count.gte': 1500, page: 1 + Math.floor(Math.random() * 3), without_genres: '10767,10763,10764' }).then((d) => d.results.map((r) => ({ mt: 'tv', id: r.id }))),
  ]);
  return shuffle(lists.flat());
}

/** One title with the numbers the game compares. */
async function card({ mt, id }) {
  const d = await api(`${mt}/${id}`);
  return {
    mt,
    id,
    title: d.title || d.name,
    year: String(d.release_date || d.first_air_date || '').slice(0, 4),
    poster: d.poster_path || null,
    rating: d.vote_count > 200 ? Math.round(d.vote_average * 10) / 10 : null,
    revenue: mt === 'movie' && d.revenue > 1e6 ? d.revenue : null,
    runtime: mt === 'movie' && d.runtime > 0 ? d.runtime : null,
    episodes: mt === 'tv' && d.number_of_episodes > 0 ? d.number_of_episodes : null,
  };
}

const METRICS = ['rating', 'revenue', 'runtime', 'episodes'];

/** The question for a pair: a measure both titles have, with different values. */
function metricFor(a, b, seed) {
  const ok = METRICS.filter((m) => a[m] != null && b[m] != null && a[m] !== b[m]);
  if (!ok.length) return null;
  return ok[seed % ok.length];
}

function fmtValue(metric, v) {
  const lang = getLang();
  if (metric === 'rating') return `★ ${v.toFixed(1)}`;
  if (metric === 'revenue') return new Intl.NumberFormat(lang, { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(v);
  if (metric === 'runtime') return t('hl.minutes', { n: v });
  return t('hl.episodes', { n: v });
}

/** Build a chain of cards where each neighbour pair has a question. */
async function buildChain(n, from = []) {
  const chain = from.slice();
  const ids = await pool();
  const seen = new Set(chain.map((c) => `${c.mt}:${c.id}`));
  for (const x of ids) {
    if (chain.length >= n) break;
    if (seen.has(`${x.mt}:${x.id}`)) continue;
    seen.add(`${x.mt}:${x.id}`);
    const c = await card(x).catch(() => null);
    if (!c) continue;
    const prev = chain[chain.length - 1];
    if (prev) {
      const m = metricFor(prev, c, chain.length + Math.floor(Math.random() * 4));
      if (!m) continue;
      c.q = m;
    }
    chain.push(c);
  }
  return chain;
}

export function higherPage(mode = 'practice', challengeId) {
  const node = document.createElement('section');
  node.className = 'page game higher';
  const head = el(`<header class="game-head"><a class="back" href="/games" data-link>‹ ${esc(t('nav.games'))}</a>
    <div class="game-title-row"><h1>${esc(t('hl.name'))}</h1><span class="chip">${esc(mode === 'challenge' ? t('play.challenge') : t('play.practice'))}</span></div></header>`);
  const body = el(`<div class="hl-body"><div class="loading-box"><span class="spinner"></span>${esc(t('ui.loading'))}</div></div>`);
  node.append(head, body);
  let chain = [];
  let i = 1;
  let streak = 0;
  let challenge = null;
  let over = false;

  const side = (c, showValue, metric) => `<div class="hl-side">
      <span class="hl-poster">${c.poster ? `<img src="${esc(tmdb.poster(c.poster, 'w342'))}" alt="" />` : ''}</span>
      <p class="hl-title">${esc(c.title)} <span class="muted">${esc(c.year)}</span></p>
      <p class="hl-value">${showValue ? esc(fmtValue(metric, c[metric])) : '?'}</p>
    </div>`;

  function draw(reveal = null) {
    const a = chain[i - 1];
    const b = chain[i];
    if (!b) return;
    const m = b.q;
    body.innerHTML = `<p class="hl-streak">${esc(t('hl.streak', { n: streak }))}</p>
      <p class="hl-question">${esc(t(`hl.q.${m}`, { a: a.title }))}</p>
      <div class="hl-pair">${side(a, true, m)}<span class="hl-vs">VS</span>${side(b, Boolean(reveal), m)}</div>
      ${reveal ? `<p class="quiz-feedback ${reveal === 'ok' ? 'ok' : 'bad'}">${esc(reveal === 'ok' ? t('quiz.right') : t('hl.wrong'))}</p>` : `<div class="hl-buttons">
        <button class="btn" type="button" data-pick="higher">▲ ${esc(t(`hl.more.${m}`))}</button>
        <button class="btn btn-ghost" type="button" data-pick="lower">▼ ${esc(t(`hl.less.${m}`))}</button></div>`}`;
    body.querySelectorAll('[data-pick]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const higher = b[m] > a[m];
        const right = (btn.dataset.pick === 'higher') === higher;
        draw(right ? 'ok' : 'bad');
        setTimeout(() => (right ? next() : finish()), 1400);
      }),
    );
  }

  async function next() {
    streak += 1;
    i += 1;
    if (i >= chain.length) {
      if (mode === 'challenge') return finish(true);
      body.querySelector('.hl-buttons')?.remove();
      try {
        chain = await track(buildChain(chain.length + 10, chain));
      } catch {
        return finish();
      }
      if (i >= chain.length) return finish(true);
    }
    draw();
  }

  async function finish(cleared = false) {
    if (over) return;
    over = true;
    const result = { won: true, score: streak, hintUsed: false };
    body.innerHTML = `<div class="result-box">
      <p class="result-head">${esc(cleared ? t('hl.cleared', { n: streak }) : t('hl.over', { n: streak }))}</p>
      <div class="result-actions">
        <button type="button" class="btn" data-share>${esc(t('play.shareResult'))}</button>
        ${mode !== 'challenge' ? `<button type="button" class="btn btn-ghost" data-challenge>${esc(t('hl.challengeRun'))}</button>` : ''}
        <button type="button" class="btn btn-ghost" data-again>${esc(t('play.playAgain'))}</button>
      </div><div data-board></div></div>`;
    body.querySelector('[data-share]').addEventListener('click', () =>
      share(`CINENJOY ${t('hl.name')} 🔥 ${streak}`, mode === 'challenge' ? challengeUrl('higher', challenge.id) : `${location.origin}/games/higher`),
    );
    body.querySelector('[data-again]').addEventListener('click', () => (mode === 'challenge' ? go('/games/higher') : restart()));
    const ch = body.querySelector('[data-challenge]');
    if (ch)
      ch.addEventListener('click', async () => {
        ch.disabled = true;
        try {
          await ensureName();
          // Friends get a fresh run of the same length, the same for all of them
          const run = await track(buildChain(RUN));
          const id = await track(db.createChallenge('higher', { chain: run }, null));
          await share(t('play.challengeText', { game: t('hl.name') }), challengeUrl('higher', id));
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
        const rows = (await db.challengeBoard(challenge.id)).sort((a, b) => (b.score || 0) - (a.score || 0));
        body.querySelector('[data-board]').innerHTML = boardHtml(rows, (r) => `🔥 ${r.score}`);
      } else {
        await db.saveResult({ game: 'higher', mode: 'practice', puzzleKey: `h-${Date.now().toString(36)}`, won: true, score: streak });
      }
    } catch (err) {
      console.warn('result not saved', err);
    }
  }

  async function restart() {
    over = false;
    streak = 0;
    i = 1;
    body.innerHTML = `<div class="loading-box"><span class="spinner"></span>${esc(t('ui.loading'))}</div>`;
    try {
      chain = await track(buildChain(8));
      if (chain.length < 2) throw new Error('short');
      draw();
    } catch (err) {
      console.warn(err);
      body.innerHTML = `<div class="error-box"><p>${esc(t('errors.generic'))}</p></div>`;
    }
  }

  if (mode === 'challenge')
    track(db.getChallenge(challengeId))
      .then((c) => {
        if (!c || c.game !== 'higher' || !c.puzzle || !Array.isArray(c.puzzle.chain) || c.puzzle.chain.length < 2) throw new Error('missing');
        challenge = c;
        chain = c.puzzle.chain;
        body.replaceChildren(frag(`<p class="lead">${esc(t('hl.challengeIntro', { n: chain.length - 1 }))}</p><button class="btn" type="button" data-go>▶ ${esc(t('quiz.startSolo'))}</button>`));
        body.querySelector('[data-go]').addEventListener('click', () => draw());
      })
      .catch(() => body.replaceChildren(el(`<div class="error-box"><p>${esc(t('play.challengeMissing'))}</p></div>`)));
  else restart();
  return node;
}
