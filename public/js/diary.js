// Lobby › Diary & Stats: everything you watched, and what it adds up to.
import { t, getLang } from './i18n.js';
import * as db from './data.js';
import * as tmdb from './tmdb.js';
import { track } from './loading.js';
import { store } from './store.js';
import { esc, el, frag, starsText } from './ui.js';
import { worldMap } from './worldmap.js';

function names(type) {
  try {
    return new Intl.DisplayNames([getLang()], { type });
  } catch {
    return { of: (x) => x };
  }
}

/** Fill in genres, countries and creators for titles saved before ratings kept them. */
async function completeMeta(entries) {
  const missing = entries.filter((e) => !e.meta || !Array.isArray(e.meta.genres)).slice(0, 150);
  let i = 0;
  await Promise.all(
    Array.from({ length: 5 }, async () => {
      while (i < missing.length) {
        const e = missing[i];
        i += 1;
        try {
          const full = await tmdb.details(e.media_type, e.tmdb_id);
          e.meta = full.meta;
          e.original_language = e.original_language || full.original_language;
          e.release_date = e.release_date || full.release_date;
          e.original_title = e.original_title || full.original_title;
          if (e.rated) db.saveRatingMeta(e).catch(() => {});
        } catch {
          /* leave it out of the stats that need it */
        }
      }
    }),
  );
}

function count(entries, keysOf) {
  const m = new Map();
  for (const e of entries) for (const k of keysOf(e)) if (k) m.set(k, (m.get(k) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
}

function bars(title, rows, { limit = 8, label = (k) => k } = {}) {
  if (!rows.length) return '';
  const top = rows.slice(0, limit);
  const max = Math.max(...top.map((r) => r[1]));
  return `<section class="stat-block">
    <h2>${esc(title)}</h2>
    ${top
      .map(
        ([k, n]) => `<div class="bar-row">
          <span class="bar-label">${esc(label(k))}</span>
          <span class="bar-track"><span class="bar-fill" style="width:${Math.max(4, (n / max) * 100)}%"></span></span>
          <span class="bar-n">${n}</span>
        </div>`,
      )
      .join('')}
    ${rows.length > limit ? `<p class="muted more-n">${esc(t('diary.andMore', { n: rows.length - limit }))}</p>` : ''}
  </section>`;
}

export function diaryPage() {
  const node = document.createElement('section');
  node.className = 'page diary';
  const tab = { now: store.get('diaryTab') === 'stats' ? 'stats' : 'diary' };
  node.append(
    frag(`
    <a class="back" href="/lobby" data-link>‹ ${esc(t('nav.lobby'))}</a>
    <header class="page-head">
      <h1>${esc(t('diary.title'))}</h1>
      <p class="lead">${esc(t('diary.lead'))}</p>
      <div class="seg" role="tablist">
        <button type="button" role="tab" data-tab="diary">${esc(t('diary.tabDiary'))}</button>
        <button type="button" role="tab" data-tab="stats">${esc(t('diary.tabStats'))}</button>
      </div>
    </header>`),
  );
  const body = el('<div class="diary-body"></div>');
  node.append(body);
  let entries = null;
  let genres = {};

  const setTab = (name) => {
    tab.now = name;
    store.set('diaryTab', name);
    node.querySelectorAll('[data-tab]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.tab === name));
      b.setAttribute('aria-selected', String(b.dataset.tab === name));
    });
    if (entries) render();
  };
  node.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));

  async function load() {
    body.replaceChildren(el(`<div class="loading-box"><span class="spinner"></span>${esc(t('ui.loading'))}</div>`));
    try {
      entries = await track(db.myDiary());
      [genres] = await Promise.all([tmdb.genreNames().catch(() => ({})), track(completeMeta(entries))]);
      if (node.isConnected) render();
    } catch (err) {
      console.warn(err);
      body.replaceChildren(el(`<div class="error-box"><p>${esc(t('errors.offline'))}</p></div>`));
    }
  }

  function render() {
    if (!entries.length) {
      body.replaceChildren(
        frag(`<div class="empty empty-col"><p>${esc(t('diary.empty'))}</p>
          <a class="btn" href="/watchlist" data-link>${esc(t('nav.watchlist'))}</a></div>`),
      );
      return;
    }
    if (tab.now === 'stats') renderStats();
    else renderDiary();
  }

  function renderDiary() {
    const month = new Intl.DateTimeFormat(getLang(), { month: 'long', year: 'numeric' });
    const day = new Intl.DateTimeFormat(getLang(), { day: 'numeric', weekday: 'short' });
    const groups = new Map();
    for (const e of entries) {
      const k = e.date.slice(0, 7);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(e);
    }
    body.innerHTML = [...groups.entries()]
      .map(([k, list]) => {
        const [y, m] = k.split('-').map(Number);
        return `<section class="diary-month">
          <h2>${esc(month.format(new Date(y, m - 1, 1)))} <span>${list.length}</span></h2>
          ${list
            .map((e) => {
              const [yy, mm, dd] = e.date.split('-').map(Number);
              const title = tmdb.displayTitle(e);
              const orig = e.original_title && e.original_title !== title ? e.original_title : '';
              const img = tmdb.poster(e.poster_path, 'w92');
              const meta = [tmdb.yearOf(e), t(`medium.${tmdb.mediumOf(e)}`)].filter(Boolean).join(' · ');
              return `<div class="diary-row">
                <span class="diary-day">${esc(day.format(new Date(yy, mm - 1, dd)))}</span>
                <span class="thumb">${img ? `<img src="${esc(img)}" alt="" loading="lazy" />` : ''}</span>
                <span class="row-text">
                  <span class="pc-title">${esc(title)}</span>
                  ${orig ? `<span class="pc-orig" lang="${esc(e.original_language || '')}">${esc(orig)}</span>` : ''}
                  <span class="pc-meta">${esc(meta)}</span>
                  ${e.note ? `<span class="diary-note">“${esc(e.note)}”</span>` : ''}
                </span>
                <span class="pc-stars" ${e.rating ? `aria-label="${esc(t('rating.stars', { n: e.rating }))}"` : ''}>${e.rating ? starsText(e.rating) : ''}</span>
              </div>`;
            })
            .join('')}
        </section>`;
      })
      .join('');
  }

  function renderStats() {
    const lang = names('language');
    const region = names('region');
    const year = String(new Date().getFullYear());
    const rated = entries.filter((e) => e.rating);
    const avg = rated.length ? rated.reduce((a, e) => a + e.rating, 0) / rated.length : null;
    const films = entries.filter((e) => e.media_type === 'movie');
    const minutes = films.reduce((a, e) => a + ((e.meta && e.meta.runtime) || 0), 0);
    const languages = count(entries, (e) => [e.original_language]);
    const countries = count(entries, (e) => (e.meta && e.meta.countries) || []);
    const decades = count(entries, (e) => {
      const y = Number(tmdb.yearOf(e));
      return y ? [`${Math.floor(y / 10) * 10}`] : [];
    }).sort((a, b) => b[0].localeCompare(a[0]));
    const media = count(entries, (e) => [tmdb.mediumOf(e)]);
    const genreRows = count(entries, (e) => ((e.meta && e.meta.genres) || []).map((g) => genres[g]).filter(Boolean));
    const creators = count(entries, (e) => (e.meta && e.meta.directors) || []);
    const ratingRows = count(rated, (e) => [String(e.rating)]).sort((a, b) => Number(b[0]) - Number(a[0]));

    body.innerHTML = `
      <div class="stat-tiles">
        <div class="stat-tile"><b>${entries.length}</b><span>${esc(t('diary.titles'))}</span></div>
        <div class="stat-tile"><b>${entries.filter((e) => e.date.startsWith(year)).length}</b><span>${esc(t('diary.thisYear', { y: year }))}</span></div>
        <div class="stat-tile"><b>${languages.length}</b><span>${esc(t('diary.languages'))}</span></div>
        <div class="stat-tile"><b>${countries.length}</b><span>${esc(t('diary.countries'))}</span></div>
        <div class="stat-tile"><b>${Math.round(minutes / 60)}</b><span>${esc(t('diary.filmHours'))}</span></div>
        <div class="stat-tile"><b>${avg != null ? avg.toFixed(1) : '–'}</b><span>${esc(t('diary.avgRating'))}</span></div>
      </div>
      <section class="stat-block map-block">
        <h2>${esc(t('diary.map'))}</h2>
        <div class="map-slot"><div class="loading-box"><span class="spinner"></span>${esc(t('ui.loading'))}</div></div>
        <p class="muted">${esc(t('diary.mapNote', { n: countries.length }))}</p>
      </section>
      <div class="stat-grid">
        ${bars(t('diary.byMedium'), media, { label: (k) => t(`medium.${k}`) })}
        ${bars(t('diary.byLanguage'), languages, { label: (k) => lang.of(k) || k })}
        ${bars(t('diary.byCountry'), countries, { label: (k) => region.of(k) || k })}
        ${bars(t('diary.byDecade'), decades, { limit: 12, label: (k) => t('wl.decade', { d: k }) })}
        ${bars(t('diary.byGenre'), genreRows)}
        ${bars(t('diary.byCreator'), creators)}
        ${bars(t('diary.byRating'), ratingRows, { limit: 10, label: (k) => starsText(Number(k)) })}
      </div>`;
    const slot = body.querySelector('.map-slot');
    worldMap(Object.fromEntries(countries))
      .then((svg) => {
        svg.setAttribute('aria-label', t('diary.mapNote', { n: countries.length }));
        slot.replaceChildren(svg);
      })
      .catch(() => {
        slot.replaceChildren(el(`<p class="muted">${esc(t('diary.mapOffline'))}</p>`));
      });
  }

  setTab(tab.now);
  load();
  return node;
}
