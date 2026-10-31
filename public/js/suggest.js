// Watchlist › Suggestions: picks based on your favourites and high ratings,
// weighted by the genres, languages, creators and media you like, plus one
// pick outside your comfort zone. No AI: TMDB recommendations and ranked lists.
import { t, getLang } from './i18n.js';
import * as db from './data.js';
import * as tmdb from './tmdb.js';
import { track } from './loading.js';
import { esc, el, frag, toast, openSheet } from './ui.js';

const API_LANG = { en: 'en-US', 'zh-CN': 'zh-CN', es: 'es-ES' };

async function api(path, params = {}) {
  const q = new URLSearchParams({ path, language: API_LANG[getLang()] || 'en-US', ...params });
  const r = await fetch(`/api/tmdb?${q}`);
  if (!r.ok) throw new Error(`tmdb ${r.status}`);
  return r.json();
}

const keyOf = (r) => `${r.media_type}:${r.id || r.tmdb_id}`;

/** Your tastes, from what you rated and watched: weights per genre, language, creator, medium. */
function tasteProfile(entries) {
  const p = { genres: new Map(), langs: new Map(), creators: new Map(), media: new Map(), decades: new Map() };
  const add = (m, k, w) => k && m.set(k, (m.get(k) || 0) + w);
  for (const e of entries) {
    // loved titles count most; a title you disliked counts against its traits
    const w = e.rating ? e.rating - 2.5 : 0.5;
    for (const g of (e.meta && e.meta.genres) || []) add(p.genres, g, w);
    add(p.langs, e.original_language, w);
    for (const d of (e.meta && e.meta.directors) || []) add(p.creators, d, w);
    add(p.media, e.media_type, w);
    const y = Number(tmdb.yearOf(e));
    if (y) add(p.decades, Math.floor(y / 10) * 10, 1);
  }
  return p;
}

/** Only well-rated titles that enough people have seen */
const good = (r) => (r.vote_count || 0) >= 300 && (r.vote_average || 0) >= 6.6;

function scoreCandidate(r, profile) {
  let s = ((r.vote_average || 0) - 6) * 1.6 + Math.log10(Math.max(10, r.vote_count || 0)) * 0.6;
  for (const g of r.genre_ids || []) s += Math.max(-1, Math.min(2, (profile.genres.get(g) || 0) / 4));
  s += Math.max(-1, Math.min(2, (profile.langs.get(r.original_language) || 0) / 4));
  s += Math.max(-0.5, Math.min(1, (profile.media.get(r.media_type) || 0) / 8));
  return s;
}

const COMFORT_LANGS = ['ko', 'ja', 'fr', 'it', 'es', 'hi', 'fa', 'de', 'zh', 'sv', 'da', 'pt', 'tr', 'th', 'pl', 'ru', 'ar', 'cs', 'hu', 'ta'];

function dayIndex() {
  const d = new Date();
  return d.getFullYear() * 400 + d.getMonth() * 32 + d.getDate();
}

export function suggestionsPage() {
  const node = document.createElement('section');
  node.className = 'page suggest';
  node.append(
    frag(`
    <a class="back" href="/watchlist" data-link>‹ ${esc(t('nav.watchlist'))}</a>
    <header class="page-head">
      <h1>${esc(t('sug.title'))}</h1>
      <p class="lead">${esc(t('sug.lead'))}</p>
    </header>`),
  );
  const body = el('<div class="sug-body"></div>');
  node.append(body);
  let lists = [];
  let seen = new Set();

  async function load() {
    body.replaceChildren(el(`<div class="loading-box"><span class="spinner"></span>${esc(t('sug.finding'))}</div>`));
    try {
      const [diary, listed, myLists] = await track(Promise.all([db.myDiary(), db.myListedKeys(), db.myLists()]));
      lists = myLists;
      seen = new Set([...diary.map((e) => e.key), ...listed.map((i) => `${i.media_type}:${i.tmdb_id}`)]);

      // Seeds: your favourites (4 stars and up), newest first; otherwise what you saved lately
      let seeds = diary.filter((e) => e.rating >= 4).sort((a, b) => b.rating - a.rating || (a.date < b.date ? 1 : -1));
      const fromLists = listed
        .slice()
        .sort((a, b) => (a.added_at < b.added_at ? 1 : -1))
        .map((i) => ({ ...i, key: `${i.media_type}:${i.tmdb_id}` }));
      if (seeds.length < 3) seeds = [...seeds, ...fromLists.filter((i) => !seeds.some((s) => s.key === i.key))];
      seeds = seeds.slice(0, 6);
      if (!seeds.length) {
        body.replaceChildren(
          frag(`<div class="empty empty-col"><p>${esc(t('sug.empty'))}</p>
            <a class="btn" href="/watchlist" data-link>${esc(t('nav.watchlist'))}</a></div>`),
        );
        return;
      }
      const profile = tasteProfile([...diary, ...fromLists.map((i) => ({ ...i, rating: null }))]);

      // Recommendations for each seed
      const recs = await track(
        Promise.all(
          seeds.map((s) =>
            api(`${s.media_type}/${s.tmdb_id}/recommendations`, { page: 1 })
              .then((d) => (d.results || []).map((r) => ({ ...r, media_type: r.media_type || s.media_type })))
              .catch(() => []),
          ),
        ),
      );
      const pool = new Map();
      recs.forEach((list, i) => {
        for (const r of list) {
          const k = keyOf(r);
          if (seen.has(k) || r.adult || !good(r)) continue;
          const prev = pool.get(k) || { r, seeds: new Set(), score: scoreCandidate(r, profile) };
          prev.seeds.add(i);
          pool.set(k, prev);
        }
      });
      for (const c of pool.values()) c.score += (c.seeds.size - 1) * 1.5;

      // "Because you loved X": a row per seed, without repeating titles
      const used = new Set();
      const rows = [];
      seeds.slice(0, 4).forEach((s, i) => {
        // Closest to this favourite first: same language, shared genres
        const genres = new Set((s.meta && s.meta.genres) || []);
        const near = (r) =>
          (r.original_language === s.original_language ? 1.5 : 0) + (r.genre_ids || []).filter((g) => genres.has(g)).length * 0.6;
        const picks = [...pool.values()]
          .filter((c) => c.seeds.has(i) && !used.has(keyOf(c.r)))
          .sort((a, b) => b.score + near(b.r) - (a.score + near(a.r)))
          .slice(0, 8);
        if (picks.length >= 3) {
          picks.forEach((c) => used.add(keyOf(c.r)));
          rows.push({ title: t('sug.because', { title: tmdb.displayTitle(s) || s.title }), items: picks.map((c) => c.r) });
        }
      });
      const top = [...pool.values()]
        .filter((c) => !used.has(keyOf(c.r)))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .map((c) => c.r);
      if (top.length) rows.unshift({ title: t('sug.forYou'), items: top });

      const outside = await track(comfortPick(profile).catch(() => null));
      if (node.isConnected) render(rows, outside);
    } catch (err) {
      console.warn(err);
      body.replaceChildren(el(`<div class="error-box"><p>${esc(t('errors.offline'))}</p></div>`));
    }
  }

  /** A highly rated title in a language you rarely watch, from a decade you rarely watch. */
  async function comfortPick(profile) {
    const yours = new Set([...profile.langs.entries()].filter(([, w]) => w > 0).map(([k]) => k));
    const choices = COMFORT_LANGS.filter((l) => !yours.has(l));
    if (!choices.length) return null;
    const start = dayIndex() % choices.length;
    const media = (profile.media.get('tv') || 0) > (profile.media.get('movie') || 0) ? 'movie' : dayIndex() % 3 === 0 ? 'tv' : 'movie';
    const decadesSeen = [...profile.decades.entries()].sort((a, b) => b[1] - a[1]).map(([d]) => d);
    const decadeOf = (r) => Math.floor(Number(String(r.release_date || r.first_air_date || '').slice(0, 4)) / 10) * 10;
    // Today's language first; if it has nothing well known enough, the next ones
    for (let k = 0; k < Math.min(4, choices.length); k += 1) {
      const lang = choices[(start + k) % choices.length];
      for (const minVotes of media === 'movie' ? [800, 200, 60] : [300, 80, 30]) {
        const d = await api(`discover/${media}`, {
          with_original_language: lang,
          sort_by: 'vote_average.desc',
          'vote_count.gte': minVotes,
          page: 1,
        });
        const results = (d.results || [])
          .map((r) => ({ ...r, media_type: media }))
          .filter((r) => !seen.has(keyOf(r)) && (r.vote_average || 0) >= 6.8);
        if (!results.length) continue;
        // Prefer a decade you have watched least
        results.sort((a, b) => {
          const ra = decadesSeen.indexOf(decadeOf(a));
          const rb = decadesSeen.indexOf(decadeOf(b));
          return (ra === -1 ? -1 : ra) - (rb === -1 ? -1 : rb) || (b.vote_average || 0) - (a.vote_average || 0);
        });
        return { lang, item: results[dayIndex() % Math.min(3, results.length)] };
      }
    }
    return null;
  }

  function card(r, extra = '') {
    const title = r.title || r.name || '';
    const orig = r.original_title || r.original_name || '';
    const year = String(r.release_date || r.first_air_date || '').slice(0, 4);
    const medium = tmdb.mediumOf({ media_type: r.media_type, original_language: r.original_language, genre_ids: r.genre_ids });
    const img = tmdb.poster(r.poster_path, 'w342');
    return `<div class="sug-card">
      <span class="poster">${img ? `<img src="${esc(img)}" alt="" loading="lazy" />` : `<span class="poster-blank">${esc(title)}</span>`}</span>
      <span class="pc-title">${esc(title)}</span>
      ${orig && orig !== title ? `<span class="pc-orig" lang="${esc(r.original_language || '')}">${esc(orig)}</span>` : ''}
      <span class="pc-meta">${esc([year, t(`medium.${medium}`), r.vote_average ? `★ ${r.vote_average.toFixed(1)}` : ''].filter(Boolean).join(' · '))}</span>
      ${extra}
      <button type="button" class="btn btn-small" data-add="${esc(keyOf(r))}">+ ${esc(t('wl.add'))}</button>
    </div>`;
  }

  function render(rows, outside) {
    const all = new Map();
    for (const row of rows) for (const r of row.items) all.set(keyOf(r), r);
    if (outside) all.set(keyOf(outside.item), outside.item);
    const lang = (() => {
      try {
        return new Intl.DisplayNames([getLang()], { type: 'language' });
      } catch {
        return { of: (x) => x };
      }
    })();
    body.innerHTML = `
      ${
        outside
          ? `<section class="sug-row comfort">
              <h2>${esc(t('sug.outside'))}</h2>
              <p class="muted">${esc(t('sug.outsideWhy', { lang: lang.of(outside.lang) || outside.lang }))}</p>
              <div class="sug-strip">${card(outside.item)}</div>
            </section>`
          : ''
      }
      ${rows
        .map(
          (row) => `<section class="sug-row">
            <h2>${esc(row.title)}</h2>
            <div class="sug-strip">${row.items.map((r) => card(r)).join('')}</div>
          </section>`,
        )
        .join('')}
      ${!rows.length && !outside ? `<p class="empty">${esc(t('sug.none'))}</p>` : ''}`;
    body.querySelectorAll('[data-add]').forEach((b) =>
      b.addEventListener('click', () => addTo(all.get(b.dataset.add), b)),
    );
  }

  async function addTo(r, btn) {
    if (!r) return;
    const pick = async (list) => {
      btn.disabled = true;
      try {
        const full = await track(tmdb.details(r.media_type, r.id));
        await track(db.addItem(list.id, full));
        seen.add(keyOf(r));
        btn.textContent = `✓ ${t('wl.added')}`;
        toast(t('wl.addedToast', { list: list.name }));
      } catch (err) {
        if (err && err.code === '23505') {
          btn.textContent = `✓ ${t('wl.added')}`;
          return;
        }
        console.warn(err);
        btn.disabled = false;
        toast(t('errors.generic'), 'error');
      }
    };
    if (lists.length <= 1) {
      let list = lists[0];
      if (!list) {
        list = await db.createList({ name: t('wl.defaultName'), emoji: '🎬' });
        lists = [list];
      }
      return pick(list);
    }
    const box = el(`<div class="list-pick">${lists
      .map((l, i) => `<button type="button" class="list-card" data-i="${i}"><span class="list-emoji">${esc(l.emoji || '🎞️')}</span><span class="list-text"><span class="list-name">${esc(l.name)}</span></span></button>`)
      .join('')}</div>`);
    const close = openSheet({ title: t('sug.addTo'), body: box });
    box.querySelectorAll('[data-i]').forEach((b) =>
      b.addEventListener('click', () => {
        close();
        pick(lists[Number(b.dataset.i)]);
      }),
    );
  }

  load();
  return node;
}
