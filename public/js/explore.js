// Lobby › Explore: browse what is coming soon, and films and series by
// country, language, film movement or type. Data from TMDB discover.
import { t, getLang } from './i18n.js';
import * as db from './data.js';
import * as tmdb from './tmdb.js';
import { track } from './loading.js';
import { esc, el, toast, openSheet } from './ui.js';
import { store } from './store.js';

const API_LANG = { en: 'en-US', 'zh-CN': 'zh-CN', es: 'es-ES' };
async function api(path, params = {}) {
  const q = new URLSearchParams({ path, language: API_LANG[getLang()] || 'en-US', ...params });
  const r = await fetch(`/api/tmdb?${q}`);
  if (!r.ok) throw new Error('tmdb');
  return r.json();
}

const COUNTRIES = ['US', 'GB', 'FR', 'IT', 'DE', 'ES', 'MX', 'AR', 'BR', 'IN', 'JP', 'KR', 'CN', 'HK', 'TW', 'TH', 'IR', 'TR', 'EG', 'NG', 'ZA', 'SE', 'DK', 'NO', 'PL', 'RU', 'AU', 'NZ', 'CA', 'BE'];
const LANGUAGES = ['en', 'fr', 'es', 'it', 'de', 'ja', 'ko', 'zh', 'cn', 'hi', 'ta', 'te', 'ml', 'bn', 'pt', 'ru', 'fa', 'tr', 'ar', 'th', 'sv', 'da', 'pl', 'id', 'tl'];

// Film movements: years and where; the text is in i18n (ex.mv.<id>)
export const MOVEMENTS = [
  { id: 'expressionism', country: 'DE', from: 1919, to: 1933 },
  { id: 'montage', country: 'SU', from: 1924, to: 1932 },
  { id: 'neorealism', country: 'IT', from: 1943, to: 1955 },
  { id: 'japan', country: 'JP', from: 1950, to: 1965 },
  { id: 'nouvelle', country: 'FR', from: 1958, to: 1968 },
  { id: 'novo', country: 'BR', from: 1960, to: 1972 },
  { id: 'hollywood', country: 'US', from: 1967, to: 1982 },
  { id: 'hongkong', country: 'HK', from: 1979, to: 1997 },
  { id: 'iran', country: 'IR', from: 1985, to: 2005 },
  { id: 'dogme', country: 'DK', from: 1995, to: 2005 },
  { id: 'korea', country: 'KR', from: 1996, to: 2012 },
];

const TYPES = {
  film: { mt: 'movie', params: { 'with_runtime.gte': 60, without_genres: '99,16' } },
  series: { mt: 'tv', params: { without_genres: '16,99,10767,10763,10764' } },
  anime: { mt: 'tv', params: { with_genres: '16', with_original_language: 'ja' } },
  animeFilm: { mt: 'movie', params: { with_genres: '16', with_original_language: 'ja' } },
  documentary: { mt: 'movie', params: { with_genres: '99' } },
  short: { mt: 'movie', params: { 'with_runtime.lte': 40, 'with_runtime.gte': 1 } },
};

function names() {
  try {
    return { lang: new Intl.DisplayNames([getLang()], { type: 'language' }), region: new Intl.DisplayNames([getLang()], { type: 'region' }) };
  } catch {
    return { lang: { of: (x) => x }, region: { of: (x) => x } };
  }
}
const langLabel = (code, n) => (code === 'cn' ? n.lang.of('yue') : n.lang.of(code)) || code;
const regionLabel = (code, n) => (code === 'SU' ? t('ex.soviet') : n.region.of(code) || code);

export function explorePage() {
  const node = document.createElement('section');
  node.className = 'page explore';
  const tabs = ['soon', 'country', 'language', 'movement', 'type'];
  let tab = store.get('exploreTab') || 'soon';
  if (!tabs.includes(tab)) tab = 'soon';
  const n = names();
  let lists = null;
  const found = new Map();

  node.innerHTML = `<header class="page-head">
      <a class="back" href="/lobby" data-link>‹ ${esc(t('nav.lobby'))}</a>
      <h1>${esc(t('lobby.tabs.explore')[0])}</h1>
      <p class="lead">${esc(t('ex.lead'))}</p>
    </header>
    <div class="seg ex-tabs" role="tablist">${tabs.map((x) => `<button type="button" role="tab" data-tab="${x}">${esc(t(`ex.tab.${x}`))}</button>`).join('')}</div>
    <div class="ex-body"></div>`;
  const body = node.querySelector('.ex-body');

  const keyOf = (r) => `${r.media_type}:${r.id}`;
  function card(r) {
    const title = r.title || r.name || '';
    const date = r.release_date || r.first_air_date || '';
    const img = tmdb.poster(r.poster_path, 'w342');
    found.set(keyOf(r), r);
    return `<div class="sug-card">
      <button type="button" class="poster-btn" data-open="${esc(keyOf(r))}" aria-label="${esc(title)}"><span class="poster">${img ? `<img src="${esc(img)}" alt="" loading="lazy" />` : `<span class="poster-blank">${esc(title)}</span>`}</span></button>
      <span class="pc-title">${esc(title)}</span>
      <span class="pc-meta">${esc([tab === 'soon' ? date : String(date).slice(0, 4), r.vote_average && tab !== 'soon' ? `★ ${r.vote_average.toFixed(1)}` : ''].filter(Boolean).join(' · '))}</span>
      <button type="button" class="btn btn-small" data-add="${esc(keyOf(r))}">+ ${esc(t('wl.add'))}</button>
    </div>`;
  }
  const strip = (title, items, note = '') =>
    `<section class="sug-row"><h2>${esc(title)}</h2>${note ? `<p class="muted">${esc(note)}</p>` : ''}${
      items.length ? `<div class="sug-strip">${items.map(card).join('')}</div>` : `<p class="empty">${esc(t('ex.nothing'))}</p>`
    }</section>`;
  const discover = (mt, params, page = 1) =>
    api(`discover/${mt}`, { sort_by: 'vote_count.desc', page, ...params }).then((d) => (d.results || []).map((r) => ({ ...r, media_type: mt })));

  function loadingBox() {
    body.innerHTML = `<div class="loading-box"><span class="spinner"></span>${esc(t('ui.loading'))}</div>`;
  }

  async function show() {
    node.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    store.set('exploreTab', tab);
    if (tab === 'soon') {
      loadingBox();
      const region = (navigator.language || 'en-US').split('-')[1] || 'US';
      const today = new Date().toISOString().slice(0, 10);
      try {
        const [films, series] = await track(
          Promise.all([
            api('movie/upcoming', { region }).then((d) => (d.results || []).filter((r) => (r.release_date || '') >= today).map((r) => ({ ...r, media_type: 'movie' }))),
            api('tv/on_the_air').then((d) => (d.results || []).map((r) => ({ ...r, media_type: 'tv' }))),
          ]),
        );
        films.sort((a, b) => String(a.release_date).localeCompare(String(b.release_date)));
        body.innerHTML = strip(t('ex.upcoming'), films, t('ex.inRegion', { region: regionLabel(region, n) })) + strip(t('ex.onAir'), series.sort((a, b) => b.popularity - a.popularity));
      } catch {
        body.innerHTML = `<div class="error-box"><p>${esc(t('errors.generic'))}</p></div>`;
      }
    } else if (tab === 'country' || tab === 'language') {
      const key = tab === 'country' ? 'exploreCountry' : 'exploreLanguage';
      const opts = tab === 'country' ? COUNTRIES : LANGUAGES;
      const pick = store.get(key) || opts[0];
      const label = (c) => (tab === 'country' ? regionLabel(c, n) : langLabel(c, n));
      body.innerHTML = `<label class="tool"><span>${esc(t(`ex.pick.${tab}`))}</span><select data-pick>${opts
        .map((c) => [c, label(c)])
        .sort((a, b) => a[1].localeCompare(b[1], getLang()))
        .map(([c, l]) => `<option value="${esc(c)}"${c === pick ? ' selected' : ''}>${esc(l)}</option>`)
        .join('')}</select></label><div data-results></div>`;
      const out = body.querySelector('[data-results]');
      const run = async (code) => {
        store.set(key, code);
        out.innerHTML = `<div class="loading-box"><span class="spinner"></span></div>`;
        const p = tab === 'country' ? { with_origin_country: code } : { with_original_language: code };
        try {
          const [films, series] = await track(Promise.all([discover('movie', p), discover('tv', { ...p, without_genres: '10767,10763,10764' })]));
          out.innerHTML = strip(t('ex.bestFilms', { x: label(code) }), films) + strip(t('ex.bestSeries', { x: label(code) }), series);
        } catch {
          out.innerHTML = `<div class="error-box"><p>${esc(t('errors.generic'))}</p></div>`;
        }
      };
      body.querySelector('[data-pick]').addEventListener('change', (e) => run(e.target.value));
      run(pick);
      return;
    } else if (tab === 'movement') {
      body.innerHTML = `<div class="ex-moves">${MOVEMENTS.map(
        (m) => `<button type="button" class="ex-move" data-move="${m.id}"><b>${esc(t(`ex.mv.${m.id}.name`))}</b>
          <span class="muted">${esc(regionLabel(m.country, n))} · ${m.from}–${m.to}</span><span>${esc(t(`ex.mv.${m.id}.text`))}</span></button>`,
      ).join('')}</div><div data-results></div>`;
      const out = body.querySelector('[data-results]');
      body.querySelectorAll('[data-move]').forEach((b) =>
        b.addEventListener('click', async () => {
          const m = MOVEMENTS.find((x) => x.id === b.dataset.move);
          body.querySelectorAll('[data-move]').forEach((x) => x.classList.toggle('on', x === b));
          out.innerHTML = `<div class="loading-box"><span class="spinner"></span></div>`;
          out.scrollIntoView({ behavior: 'smooth', block: 'start' });
          try {
            let films = await track(discover('movie', { with_origin_country: m.country, 'primary_release_date.gte': `${m.from}-01-01`, 'primary_release_date.lte': `${m.to}-12-31` }));
            if (!films.length && m.country === 'SU')
              films = await discover('movie', { with_original_language: 'ru', 'primary_release_date.gte': `${m.from}-01-01`, 'primary_release_date.lte': `${m.to}-12-31` });
            out.innerHTML = strip(t(`ex.mv.${m.id}.name`), films, `${regionLabel(m.country, n)} · ${m.from}–${m.to}`);
            wire(out);
          } catch {
            out.innerHTML = `<div class="error-box"><p>${esc(t('errors.generic'))}</p></div>`;
          }
        }),
      );
      return;
    } else if (tab === 'type') {
      const kind = store.get('exploreType') || 'film';
      body.innerHTML = `<div class="seg ex-types">${Object.keys(TYPES).map((k) => `<button type="button" data-type="${k}" class="${k === kind ? 'on' : ''}">${esc(t(`ex.type.${k}`))}</button>`).join('')}</div><div data-results></div>`;
      const out = body.querySelector('[data-results]');
      const run = async (k) => {
        store.set('exploreType', k);
        body.querySelectorAll('[data-type]').forEach((x) => x.classList.toggle('on', x.dataset.type === k));
        out.innerHTML = `<div class="loading-box"><span class="spinner"></span></div>`;
        const ty = TYPES[k];
        try {
          const [best, popular] = await track(
            Promise.all([
              discover(ty.mt, { ...ty.params, sort_by: 'vote_average.desc', 'vote_count.gte': ty.mt === 'tv' ? 300 : k === 'film' ? 3000 : 300 }),
              discover(ty.mt, { ...ty.params, sort_by: 'popularity.desc', 'vote_count.gte': 50 }),
            ]),
          );
          out.innerHTML = strip(t('ex.topRated'), best) + strip(t('ex.popularNow'), popular);
          wire(out);
        } catch {
          out.innerHTML = `<div class="error-box"><p>${esc(t('errors.generic'))}</p></div>`;
        }
      };
      body.querySelectorAll('[data-type]').forEach((b) => b.addEventListener('click', () => run(b.dataset.type)));
      run(kind);
      return;
    }
    wire(body);
  }

  // Wire cards after each render of a results area
  const observer = new MutationObserver(() => wire(body));
  observer.observe(body, { childList: true, subtree: true });

  function wire(root) {
    root.querySelectorAll('[data-add]:not([data-wired])').forEach((b) => {
      b.dataset.wired = '1';
      b.addEventListener('click', () => addTo(found.get(b.dataset.add), b));
    });
    root.querySelectorAll('[data-open]:not([data-wired])').forEach((b) => {
      b.dataset.wired = '1';
      b.addEventListener('click', () => openTitle(found.get(b.dataset.open)));
    });
  }

  async function openTitle(r) {
    if (!r) return;
    const box = el('<div class="ex-title"><div class="loading-box"><span class="spinner"></span></div></div>');
    openSheet({ title: r.title || r.name, body: box });
    try {
      const d = await tmdb.details(r.media_type, r.id);
      const m = d.meta || {};
      const genres = await tmdb.genreNames().catch(() => ({}));
      box.innerHTML = `<div class="ex-title-top">${d.poster_path ? `<img src="${esc(tmdb.poster(d.poster_path, 'w185'))}" alt="" />` : ''}<div>
        <p class="pc-meta">${esc([tmdb.yearOf(d), t(`medium.${tmdb.mediumOf(d)}`), (m.genres || []).map((g) => genres[g]).filter(Boolean).slice(0, 3).join(', ')].filter(Boolean).join(' · '))}</p>
        ${(m.directors || []).length ? `<p><span class="muted">${esc(t(r.media_type === 'tv' ? 'ex.createdBy' : 'ex.directedBy'))}</span> ${esc(m.directors.join(', '))}</p>` : ''}
        ${(m.cast || []).length ? `<p><span class="muted">${esc(t('ex.starring'))}</span> ${esc(m.cast.slice(0, 4).join(', '))}</p>` : ''}
        </div></div><p class="ex-overview">${esc(r.overview || '')}</p>`;
    } catch {
      box.innerHTML = `<p>${esc(r.overview || '')}</p>`;
    }
  }

  async function addTo(r, btn) {
    if (!r) return;
    const pick = async (list) => {
      btn.disabled = true;
      try {
        const full = await track(tmdb.details(r.media_type, r.id));
        await track(db.addItem(list.id, full));
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
    try {
      lists = lists || (await track(db.myLists()));
    } catch {
      lists = [];
    }
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

  node.querySelectorAll('[data-tab]').forEach((b) =>
    b.addEventListener('click', () => {
      tab = b.dataset.tab;
      show();
    }),
  );
  show();
  return node;
}
