// Six Degrees: link two actors through titles they were in. Pick a title the
// current actor was in, then someone else from its cast, until you reach the
// target. Fewer links is better; six at most. Data from TMDB credits.
import { t, getLang } from '../i18n.js';
import * as tmdb from '../tmdb.js';
import { esc, el, toast } from '../ui.js';
import { FRAMES } from './frame-data.js';
import { puzzlePage } from './shell.js';
import { hashString, rng } from './common.js';

const MAX = 6;
const COUNT = 2000;
const API_LANG = { en: 'en-US', 'zh-CN': 'zh-CN', es: 'es-ES' };
const cache = new Map();
function api(path, params = {}) {
  const q = new URLSearchParams({ path, language: API_LANG[getLang()] || 'en-US', ...params });
  const key = q.toString();
  if (!cache.has(key)) {
    const p = fetch(`/api/tmdb?${q}`).then((r) => {
      if (!r.ok) throw new Error('tmdb');
      return r.json();
    });
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return cache.get(key);
}
const FILMS = FRAMES.map((f, i) => [f, i]).filter(([f]) => !f[0] && Number(f[3]) < 2026).map(([, i]) => i);

/** Puzzle n: the leads of two well-known films. */
function films(n) {
  const r = rng(hashString(`cinenjoy-degrees-${n}`));
  const a = FILMS[Math.floor(r() * FILMS.length)];
  let b = a;
  while (b === a) b = FILMS[Math.floor(r() * FILMS.length)];
  return [a, b];
}

async function castOf(mt, id) {
  const d = await api(`${mt}/${id}/${mt === 'tv' ? 'aggregate_credits' : 'credits'}`);
  return (d.cast || []).filter((c) => c.known_for_department === 'Acting' || !c.known_for_department).slice(0, 40);
}

async function ends(n) {
  const [a, b] = films(n);
  const ca = await castOf('movie', FRAMES[a][1]);
  const cb = await castOf('movie', FRAMES[b][1]);
  const start = ca[0];
  const target = cb.find((c) => c.id !== start.id && !ca.slice(0, 3).some((x) => x.id === c.id));
  if (!start || !target) throw new Error('no cast');
  const pick = (c, fi) => ({ id: c.id, name: c.name, photo: c.profile_path || null, from: FRAMES[fi][2] });
  return { start: pick(start, a), target: pick(target, b) };
}

const face = (p, cls = '') => `<span class="dg-face ${cls}">${p.photo ? `<img src="${esc(tmdb.poster(p.photo, 'w185'))}" alt="" />` : '👤'}</span>`;

export function degreesPage(mode, challengeId) {
  return puzzlePage(
    {
      game: 'degrees',
      name: () => t('dg.name'),
      path: '/games/degrees',
      count: COUNT,
      seed: 'cinenjoy-degrees-order-v1',
      maxScore: MAX,
      fmtScore: (s) => t('dg.links', { n: s }),
      help: () => `<p>${esc(t('dg.help1'))}</p><p>${esc(t('dg.help2'))}</p>`,
      initial: () => ({ steps: [], done: false, won: false }),
      play(ctx) {
        const s = ctx.state;
        const box = el(`<div class="dg"><div class="loading-box"><span class="spinner"></span>${esc(t('ui.loading'))}</div></div>`);
        ctx.area.append(box);
        let game = null;
        let filter = '';
        let options = [];
        const last = () => (s.steps.length ? s.steps[s.steps.length - 1] : { kind: 'person', ...game.start });
        const links = () => s.steps.filter((x) => x.kind === 'title').length;

        async function loadOptions() {
          const cur = last();
          options = [];
          drawList(true);
          try {
            if (cur.kind === 'person') {
              const d = await api(`person/${cur.id}/combined_credits`);
              const seen = new Set();
              options = (d.cast || [])
                .filter((c) => (c.media_type === 'movie' || c.media_type === 'tv') && c.vote_count > 30 && !(c.genre_ids || []).some((g) => [10767, 10763, 10764, 99].includes(g)))
                .filter((c) => !seen.has(`${c.media_type}:${c.id}`) && seen.add(`${c.media_type}:${c.id}`))
                .sort((x, y) => y.vote_count - x.vote_count)
                .slice(0, 80)
                .map((c) => ({ kind: 'title', mt: c.media_type, id: c.id, name: c.title || c.name, year: String(c.release_date || c.first_air_date || '').slice(0, 4), photo: c.poster_path }));
            } else {
              const used = new Set([game.start.id, ...s.steps.filter((x) => x.kind === 'person').map((x) => x.id)]);
              options = (await castOf(cur.mt, cur.id)).filter((c) => !used.has(c.id)).map((c) => ({ kind: 'person', id: c.id, name: c.name, photo: c.profile_path, role: c.character || (c.roles && c.roles[0] && c.roles[0].character) || '' }));
            }
          } catch (err) {
            console.warn(err);
            toast(t('errors.generic'), 'error');
          }
          drawList();
        }

        function draw() {
          const chain = [{ kind: 'person', ...game.start }, ...s.steps];
          box.innerHTML = `<div class="dg-ends">
              <div class="dg-end">${face(game.start)}<b>${esc(game.start.name)}</b><span class="muted">${esc(game.start.from)}</span></div>
              <span class="dg-arrow">→</span>
              <div class="dg-end">${face(game.target, 'is-target')}<b>${esc(game.target.name)}</b><span class="muted">${esc(game.target.from)}</span></div>
            </div>
            <ol class="dg-chain">${chain
              .map((x) => `<li class="dg-link is-${x.kind}">${x.kind === 'title' ? `🎬 ${esc(x.name)} <span class="muted">${esc(x.year || '')}</span>` : `${face(x, 'sm')} ${esc(x.name)}`}</li>`)
              .join('')}</ol>
            <p class="muted">${esc(t('dg.used', { n: links(), max: MAX }))}</p>
            ${s.done ? '' : `<div class="dg-pick">
              <p class="imp-step">${esc(last().kind === 'person' ? t('dg.pickTitle', { name: last().name }) : t('dg.pickPerson', { title: last().name }))}</p>
              <div class="row-start"><input type="search" class="dg-filter" placeholder="${esc(t('dg.filter'))}" aria-label="${esc(t('dg.filter'))}" value="${esc(filter)}" />
              ${s.steps.length ? `<button type="button" class="btn btn-ghost btn-small" data-undo>↶ ${esc(t('dg.undo'))}</button>` : ''}</div>
              <ul class="dg-options"></ul>
              <p><button type="button" class="link-btn" data-giveup>${esc(t('dg.giveUp'))}</button></p></div>`}`;
          const f = box.querySelector('.dg-filter');
          if (f)
            f.addEventListener('input', () => {
              filter = f.value;
              drawList();
            });
          const give = box.querySelector('[data-giveup]');
          if (give)
            give.addEventListener('click', () => {
              ctx.finish(false, null);
              draw();
            });
          const undo = box.querySelector('[data-undo]');
          if (undo)
            undo.addEventListener('click', () => {
              s.steps.pop();
              filter = '';
              ctx.save();
              draw();
              loadOptions();
            });
        }

        function drawList(loading = false) {
          const ul = box.querySelector('.dg-options');
          if (!ul) return;
          if (loading) {
            ul.innerHTML = `<li class="muted">${esc(t('ui.loading'))}</li>`;
            return;
          }
          const q = filter.trim().toLowerCase();
          const shown = options.filter((o) => !q || o.name.toLowerCase().includes(q)).slice(0, 40);
          // The target is always easy to spot when they are in this cast
          shown.sort((a, b) => (b.id === game.target.id && b.kind === 'person') - (a.id === game.target.id && a.kind === 'person'));
          ul.innerHTML = shown.length
            ? shown
                .map(
                  (o, i) => `<li><button type="button" class="dg-opt" data-i="${options.indexOf(o)}">${o.kind === 'person' ? face(o, 'sm') : `<span class="thumb">${o.photo ? `<img src="${esc(tmdb.poster(o.photo, 'w92'))}" alt="" />` : ''}</span>`}
                  <span><b>${esc(o.name)}</b> <span class="muted">${esc(o.kind === 'title' ? o.year : o.role)}</span></span></button></li>`,
                )
                .join('')
            : `<li class="muted">${esc(t('dg.none'))}</li>`;
          ul.querySelectorAll('[data-i]').forEach((b) =>
            b.addEventListener('click', () => {
              const o = options[Number(b.dataset.i)];
              s.steps.push(o);
              filter = '';
              if (o.kind === 'person' && o.id === game.target.id) {
                ctx.finish(true, links());
                draw();
                return;
              }
              if (o.kind === 'title' && links() > MAX) {
                s.steps.pop();
                return toast(t('dg.tooMany', { max: MAX }));
              }
              ctx.save();
              draw();
              loadOptions();
            }),
          );
        }

        ends(ctx.idx)
          .then((g) => {
            game = g;
            ctx.ends = g;
            draw();
            if (!s.done) loadOptions();
          })
          .catch((err) => {
            console.warn(err);
            box.innerHTML = `<div class="error-box"><p>${esc(t('errors.generic'))}</p></div>`;
          });
      },
      summary(ctx) {
        const s = ctx.state;
        const g = ctx.ends || { start: { name: '?' }, target: { name: '?' } };
        const n = s.steps.filter((x) => x.kind === 'title').length;
        return {
          head: s.won ? t('dg.won', { n }) : t('play.notThisTime'),
          line: `${g.start.name} → ${g.target.name}\n${'🎬'.repeat(n)}`,
        };
      },
    },
    mode,
    challengeId,
  );
}
