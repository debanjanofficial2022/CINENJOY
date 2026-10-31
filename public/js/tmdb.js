// Title data from TMDB, through the site's own /api/tmdb proxy.
import { getLang } from './i18n.js';
import { TMDB_IMG } from './config.js';

const API_LANG = { en: 'en-US', 'zh-CN': 'zh-CN', es: 'es-ES' };
const cache = new Map();

function call(path, params = {}) {
  const q = new URLSearchParams({ path, ...params });
  const key = q.toString();
  if (cache.has(key)) return cache.get(key);
  const p = fetch(`/api/tmdb?${q}`).then(async (r) => {
    if (!r.ok) throw new Error(`tmdb ${r.status}`);
    return r.json();
  });
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  return p;
}

export const poster = (path, size = 'w342') => (path ? `${TMDB_IMG}${size}${path}` : null);

const ANIMATION = 16;
const DOCUMENTARY = 99;

/** Turn a search result into the shape a list item is saved in. */
function fromResult(r) {
  return {
    media_type: r.media_type,
    tmdb_id: r.id,
    title: r.title || r.name || '',
    original_title: r.original_title || r.original_name || '',
    original_language: r.original_language || '',
    poster_path: r.poster_path || null,
    release_date: r.release_date || r.first_air_date || null,
    genre_ids: r.genre_ids || [],
    popularity: r.popularity || 0,
  };
}

/** Search films, series and anime in any language. */
export async function search(query, page = 1) {
  const q = query.trim();
  if (!q) return [];
  const data = await call('search/multi', { query: q, page, language: API_LANG[getLang()] });
  return (data.results || [])
    .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
    .map(fromResult);
}

function pickTranslation(list, lang, regions) {
  const matches = list.filter((t) => t.iso_639_1 === lang && (t.data.title || t.data.name));
  for (const region of regions) {
    const hit = matches.find((t) => t.iso_3166_1 === region);
    if (hit) return hit.data.title || hit.data.name;
  }
  const any = matches.find((t) => !['TW', 'HK'].includes(t.iso_3166_1)) || matches[0];
  return any ? any.data.title || any.data.name : null;
}

/**
 * Full details for one title, packed into the item's `meta`: titles in the
 * three site languages, genres, countries, creators, cast and universe.
 */
export async function details(mediaType, id) {
  const d = await call(`${mediaType}/${id}`, {
    language: 'en-US',
    append_to_response: 'credits,translations',
  });
  const trs = (d.translations && d.translations.translations) || [];
  const english = d.title || d.name || '';
  const genres = (d.genres || []).map((g) => g.id);
  const countries =
    mediaType === 'movie'
      ? (d.production_countries || []).map((c) => c.iso_3166_1)
      : d.origin_country || [];
  const crew = (d.credits && d.credits.crew) || [];
  const directors =
    mediaType === 'movie'
      ? crew.filter((c) => c.job === 'Director').map((c) => c.name)
      : (d.created_by || []).map((c) => c.name);
  const cast = ((d.credits && d.credits.cast) || []).slice(0, 6).map((c) => c.name);
  const anime = d.original_language === 'ja' && genres.includes(ANIMATION);
  const runtime = mediaType === 'movie' ? d.runtime || 0 : (d.episode_run_time || [])[0] || 0;

  return {
    media_type: mediaType,
    tmdb_id: d.id,
    title: english,
    original_title: d.original_title || d.original_name || english,
    original_language: d.original_language || '',
    poster_path: d.poster_path || null,
    release_date: d.release_date || d.first_air_date || null,
    meta: {
      titles: {
        en: english,
        'zh-CN': pickTranslation(trs, 'zh', ['CN', 'SG']) || null,
        es: pickTranslation(trs, 'es', ['ES', 'MX']) || null,
      },
      genres,
      countries: countries.slice(0, 4),
      directors: directors.slice(0, 3),
      cast,
      universe: (d.belongs_to_collection && d.belongs_to_collection.name) || null,
      anime,
      runtime,
      episodes: d.number_of_episodes || null,
      seasons: d.number_of_seasons || null,
    },
  };
}

let genreCache = {};
/** Genre id → name in the current site language. */
export async function genreNames() {
  const lang = getLang();
  if (genreCache[lang]) return genreCache[lang];
  const [m, t] = await Promise.all([
    call('genre/movie/list', { language: API_LANG[lang] }),
    call('genre/tv/list', { language: API_LANG[lang] }),
  ]);
  const map = {};
  for (const g of [...(m.genres || []), ...(t.genres || [])]) map[g.id] = g.name;
  genreCache[lang] = map;
  return map;
}

/** film | series | anime | documentary | short */
export function mediumOf(item) {
  const meta = item.meta || {};
  const genres = meta.genres || item.genre_ids || [];
  if (meta.anime || (item.original_language === 'ja' && genres.includes(ANIMATION))) return 'anime';
  if (genres.includes(DOCUMENTARY)) return 'documentary';
  if (item.media_type === 'movie' && meta.runtime > 0 && meta.runtime <= 40) return 'short';
  return item.media_type === 'tv' ? 'series' : 'film';
}

/** The title in the site language, falling back to what was saved. */
export function displayTitle(item) {
  const titles = (item.meta && item.meta.titles) || {};
  return titles[getLang()] || item.title;
}

export const yearOf = (item) => (item.release_date ? String(item.release_date).slice(0, 4) : '');
