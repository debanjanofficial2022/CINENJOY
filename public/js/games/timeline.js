// Timeline: put five well-known titles in release order. Three tries; after
// each check, titles in the right place turn green and stay put.
import { t } from '../i18n.js';
import * as tmdb from '../tmdb.js';
import { esc } from '../ui.js';
import { FRAMES } from './frame-data.js';
import { puzzlePage } from './shell.js';
import { hashString, rng } from './common.js';

const SIZE = 5;
const TRIES = 3;
const COUNT = 2000;

/** Puzzle n: five titles from different years, in a shuffled order. */
export function puzzle(n) {
  const r = rng(hashString(`cinenjoy-timeline-${n}`));
  const picked = [];
  const years = new Set();
  let guard = 0;
  while (picked.length < SIZE && guard < 500) {
    guard += 1;
    const i = Math.floor(r() * FRAMES.length);
    const y = FRAMES[i][3];
    if (years.has(y) || Number(y) >= 2026) continue; // only titles that have been out a while
    years.add(y);
    picked.push(i);
  }
  const answer = picked.slice().sort((a, b) => Number(FRAMES[a][3]) - Number(FRAMES[b][3]));
  let start = picked;
  if (start.every((x, k) => x === answer[k])) start = picked.slice().reverse();
  return { start, answer };
}

export function timelinePage(mode, challengeId) {
  return puzzlePage(
    {
      game: 'timeline',
      name: () => t('tl.name'),
      path: '/games/timeline',
      count: COUNT,
      seed: 'cinenjoy-timeline-order-v1',
      maxScore: TRIES,
      help: () => `<p>${esc(t('tl.help1'))}</p><p>${esc(t('tl.help2'))}</p>`,
      initial: (ctx) => ({ order: puzzle(ctx.idx).start, tries: [], done: false, won: false }),
      play(ctx) {
        const { answer } = puzzle(ctx.idx);
        const s = ctx.state;
        let selected = null;
        const posters = {};
        const wrap = document.createElement('div');
        ctx.area.append(wrap);
        const locked = (k) => s.tries.length && s.order[k] === answer[k];
        const draw = () => {
          wrap.innerHTML = `<p class="lead">${esc(s.done ? t('tl.doneLead') : t('tl.lead'))}</p>
            <div class="tl-labels"><span>${esc(t('tl.oldest'))}</span><span>${esc(t('tl.newest'))}</span></div>
            <ol class="tl-list">${s.order
              .map((fi, k) => {
                const [tv, , title, year] = FRAMES[fi];
                const ok = locked(k) || (s.done && s.order[k] === answer[k]);
                const img = posters[fi];
                return `<li class="tl-item${ok ? ' ok' : ''}${selected === k ? ' sel' : ''}" data-k="${k}">
                  <span class="thumb">${img ? `<img src="${esc(img)}" alt="" />` : ''}</span>
                  <span class="tl-title"><b>${esc(title)}</b><span class="muted">${esc(t(`medium.${tv ? 'series' : 'film'}`))}${s.done ? ` · ${esc(year)}` : ''}</span></span>
                  ${s.done || ok ? '' : `<span class="tl-moves"><button type="button" class="icon-btn" data-up="${k}" aria-label="${esc(t('tl.up'))}" ${k === 0 ? 'disabled' : ''}>▲</button><button type="button" class="icon-btn" data-down="${k}" aria-label="${esc(t('tl.down'))}" ${k === SIZE - 1 ? 'disabled' : ''}>▼</button></span>`}
                </li>`;
              })
              .join('')}</ol>
            ${s.done ? '' : `<div class="row-start"><button class="btn" type="button" data-check>${esc(t('tl.check', { n: TRIES - s.tries.length }))}</button></div>`}
            <p class="tl-tries">${s.tries.map((n) => '🟩'.repeat(n) + '⬜'.repeat(SIZE - n)).join('<br>')}</p>`;
          wrap.querySelectorAll('[data-up],[data-down]').forEach((b) =>
            b.addEventListener('click', (e) => {
              e.stopPropagation();
              const k = Number(b.dataset.up ?? b.dataset.down);
              let j = b.dataset.up != null ? k - 1 : k + 1;
              while (j >= 0 && j < SIZE && locked(j)) j += b.dataset.up != null ? -1 : 1;
              if (j < 0 || j >= SIZE) return;
              [s.order[k], s.order[j]] = [s.order[j], s.order[k]];
              selected = null;
              ctx.save();
              draw();
            }),
          );
          // Or tap one title, then another, to swap them
          wrap.querySelectorAll('.tl-item').forEach((li) =>
            li.addEventListener('click', () => {
              const k = Number(li.dataset.k);
              if (s.done || locked(k)) return;
              if (selected == null) selected = k;
              else {
                if (selected !== k) [s.order[k], s.order[selected]] = [s.order[selected], s.order[k]];
                selected = null;
                ctx.save();
              }
              draw();
            }),
          );
          const check = wrap.querySelector('[data-check]');
          if (check)
            check.addEventListener('click', () => {
              const right = s.order.filter((fi, k) => fi === answer[k]).length;
              s.tries.push(right);
              if (right === SIZE) ctx.finish(true, s.tries.length);
              else if (s.tries.length >= TRIES) {
                s.order = answer.slice();
                ctx.finish(false, null);
              } else ctx.save();
              draw();
            });
        };
        draw();
        for (const fi of s.order) {
          const [tv, id] = FRAMES[fi];
          tmdb
            .details(tv ? 'tv' : 'movie', id)
            .then((d) => {
              posters[fi] = tmdb.poster(d.poster_path, 'w92');
              if (wrap.isConnected) draw();
            })
            .catch(() => {});
        }
      },
      summary(ctx) {
        const s = ctx.state;
        return {
          head: s.won ? t('tl.won', { n: s.tries.length }) : t('tl.lost'),
          line: s.tries.map((n) => '🟩'.repeat(n) + '⬜'.repeat(SIZE - n)).join('\n'),
        };
      },
    },
    mode,
    challengeId,
  );
}
