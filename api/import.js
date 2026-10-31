// Vercel serverless function: link import.
// POST { url } or { text }, plus { lang } (the visitor's site language).
// Reads the page on the server, finds likely titles without AI, matches each
// against TMDB, and returns the matches for the visitor to confirm.
const x = require('./_lib/extract');
const { fetchPage, ImportError } = require('./_lib/fetch');
const { tmdb } = require('./_lib/tmdb');

const TIME_BUDGET_MS = 22000;
const SEARCH_LANG = {
  en: 'en-US', zh: 'zh-CN', 'zh-cn': 'zh-CN', ja: 'ja-JP', ko: 'ko-KR', es: 'es-ES', fr: 'fr-FR', de: 'de-DE',
  it: 'it-IT', pt: 'pt-BR', ru: 'ru-RU', hi: 'hi-IN', tr: 'tr-TR', pl: 'pl-PL', nl: 'nl-NL', sv: 'sv-SE', th: 'th-TH',
};

function searchLang(title, pageLang) {
  if (/[぀-ヿ]/.test(title)) return 'ja-JP';
  if (/[가-힯]/.test(title)) return 'ko-KR';
  if (/[㐀-鿿]/.test(title)) return pageLang === 'ja' ? 'ja-JP' : 'zh-CN';
  // A Latin-script title on a Chinese, Japanese or Korean page is usually the English one
  const base = String(pageLang || 'en').toLowerCase().split('-')[0];
  if (['zh', 'ja', 'ko', 'th', 'ru', 'hi'].includes(base)) return 'en-US';
  return SEARCH_LANG[base] || 'en-US';
}

function shape(r, mediaType) {
  return {
    media_type: mediaType || r.media_type,
    tmdb_id: r.id,
    title: r.title || r.name || '',
    original_title: r.original_title || r.original_name || '',
    original_language: r.original_language || '',
    poster_path: r.poster_path || null,
    release_date: r.release_date || r.first_air_date || null,
    genre_ids: r.genre_ids || [],
  };
}

function scoreResult(c, r) {
  const nc = x.norm(c.title);
  const names = [r.title || r.name, r.original_title || r.original_name].filter(Boolean);
  const full = names.map(x.norm);
  const cut = names.map((n) => x.norm(String(n).split(/\s*[:：]\s+|\s+[-–—]\s+/)[0]));
  let s = 0;
  if (full.includes(nc)) s = 1;
  else if (cut.includes(nc) && nc.split(' ').length >= 2) s = 0.82;
  else if (cut.includes(nc)) s = 0.7;
  else return 0;

  const y = Number(String(r.release_date || r.first_air_date || '').slice(0, 4)) || null;
  if (c.year && y) s += Math.abs(y - c.year) <= 1 ? 0.25 : -0.6;
  else if (c.year && !y) s -= 0.1;
  if (c.hint === 'anime') s += r.original_language === 'ja' && (r.genre_ids || []).includes(16) ? 0.15 : -0.3;
  if ((c.hint === 'movie' || c.hint === 'tv') && r.media_type === c.hint) s += 0.05;
  const votes = r.vote_count || 0;
  s += (Math.min(votes, 5000) / 5000) * 0.05;
  if (c.strength < 2 && votes < 30) s -= 0.3;
  // An obscure title with no year to confirm it is only a maybe
  if (!c.year && votes < 15) s -= 0.2;
  if (c.strength < 2 && !nc.includes(' ') && votes < 200) s -= 0.3;
  return s;
}

async function matchOne(c, pageLang) {
  if (c.imdb) {
    const d = await tmdb(`find/${c.imdb}`, { external_source: 'imdb_id', language: 'en-US' });
    const m = (d.movie_results || [])[0];
    const t = (d.tv_results || [])[0];
    if (m) return { result: shape(m, 'movie'), score: 2 };
    if (t) return { result: shape(t, 'tv'), score: 2 };
    return null;
  }
  const lang = searchLang(c.title, pageLang);
  const search = async (language) => {
    const d = await tmdb('search/multi', { query: c.title, language, page: 1 });
    return (d.results || []).filter((r) => r.media_type === 'movie' || r.media_type === 'tv').slice(0, 10);
  };
  const pick = (list) => {
    let top = null;
    for (const r of list) {
      const s = scoreResult(c, r);
      if (s > 0 && (!top || s > top.score)) top = { result: shape(r), score: s };
    }
    return top;
  };
  let results = await search(lang);
  let best = pick(results);
  // An English title on a Spanish page: "Spirited Away" is "El viaje de Chihiro" in Spanish
  if ((!best || best.score < 0.95) && lang !== 'en-US' && !x.hasCJK(c.title)) {
    const en = await search('en-US');
    const alt = pick(en);
    if (alt && (!best || alt.score > best.score)) {
      best = alt;
      results = en;
    }
  }
  // Site lists (MyAnimeList romaji, Letterboxd) are titles for sure: if no name
  // matches exactly, trust the search's own first result when it fits.
  if ((!best || best.score < 0.95) && c.strength >= 4) {
    const fits = (r) => {
      const y = Number(String(r.release_date || r.first_air_date || '').slice(0, 4)) || null;
      if (c.year && y && Math.abs(y - c.year) > 1) return false;
      if (c.hint === 'anime') return r.original_language === 'ja' && (r.genre_ids || []).includes(16);
      if (c.hint === 'movie') return r.media_type === 'movie';
      return true;
    };
    const i = results.findIndex(fits);
    if (i >= 0) {
      const s = i === 0 ? 0.96 : 0.76;
      if (!best || s > best.score) best = { result: shape(results[i]), score: s };
    }
  }
  return best;
}

function confidence(c, score) {
  if (c.imdb) return 'high';
  if (score >= 0.95 && (c.strength >= 2 || c.year)) return 'high';
  if (score >= 0.75) return 'maybe';
  return null;
}

async function matchAll(cands, pageLang) {
  const started = Date.now();
  const out = [];
  let partial = false;
  let i = 0;
  async function worker() {
    while (i < cands.length) {
      const c = cands[i];
      i += 1;
      if (Date.now() - started > TIME_BUDGET_MS) {
        partial = true;
        return;
      }
      try {
        const m = await matchOne(c, pageLang);
        if (!m) continue;
        const conf = confidence(c, m.score);
        if (conf) out.push({ ...m.result, confidence: conf, found: c.imdb ? null : c.title, pos: c.pos, score: m.score });
      } catch {
        /* one failed lookup should not stop the rest */
      }
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));

  // One row per title: keep the most certain, in the order they appear in the source
  const byKey = new Map();
  for (const r of out) {
    const key = `${r.media_type}:${r.tmdb_id}`;
    const prev = byKey.get(key);
    const better =
      !prev ||
      (r.confidence === 'high' && prev.confidence !== 'high') ||
      (r.confidence === prev.confidence && r.score > prev.score);
    if (better) byKey.set(key, { ...r, pos: prev ? Math.min(prev.pos, r.pos) : r.pos });
    else prev.pos = Math.min(prev.pos, r.pos);
  }
  const results = [...byKey.values()]
    .sort((a, b) => a.pos - b.pos)
    .map(({ pos, score, ...r }) => r);
  return { results, partial };
}

// ---------- Readers per site ----------

function addVideoTitle(c, raw) {
  const v = x.videoTitle(raw);
  if (v.title) c.add(v.title, { strength: 2, year: v.year });
}

// YouTube often refuses servers. Try, in order: the watch page (title,
// description, captions); the YouTube Data API if YOUTUBE_API_KEY is set
// (title and description); YouTube's public oEmbed (title only).
async function readYoutube(id, lang) {
  const c = new x.Collector();
  let page = null;
  try {
    page = await fetchPage(`https://www.youtube.com/watch?v=${id}&hl=en`, {
      cookie: 'CONSENT=YES+cb.20240101-00-p0.en+FX+000; SOCS=CAI',
      lang,
    });
  } catch {
    page = null;
  }
  const player = page && (x.jsonAfter(page.body, 'ytInitialPlayerResponse = ') || x.jsonAfter(page.body, 'ytInitialPlayerResponse='));
  if (player && player.videoDetails) {
    const vd = player.videoDetails;
    addVideoTitle(c, vd.title);
    x.fromText(`${vd.title || ''}\n${vd.shortDescription || ''}`, c, { lines: true });
    let captions = 'none';
    let pageLang = 'en';
    const tracks =
      (player.captions && player.captions.playerCaptionsTracklistRenderer && player.captions.playerCaptionsTracklistRenderer.captionTracks) || [];
    const manual = tracks.filter((t) => t.kind !== 'asr');
    const pick = manual.find((t) => /^en/.test(t.languageCode)) || manual[0] || tracks.find((t) => t.kind === 'asr') || null;
    if (pick && pick.baseUrl) {
      pageLang = (pick.languageCode || 'en').split('-')[0];
      try {
        const cap = await fetchPage(`${pick.baseUrl}&fmt=json3`, { accept: 'application/json', lang });
        const json = JSON.parse(cap.body);
        const text = (json.events || [])
          .map((e) => (e.segs || []).map((seg) => seg.utf8 || '').join(''))
          .join('\n')
          .replace(/\[[^\]]*\]/g, ' ');
        if (text.trim()) {
          if (pick.kind === 'asr') x.fromSpokenCaptions(text.replace(/\n/g, ' '), c);
          else x.fromText(text, c, { lines: true });
          captions = pick.kind;
        }
      } catch {
        captions = 'none';
      }
    }
    return { title: vd.title || 'YouTube', kind: 'youtube', lang: pageLang, cands: c.list(), note: captions === 'none' ? 'no_captions' : null };
  }

  // The page's own description tags, when the full data was withheld
  if (page) {
    const info = x.pageInfo(page.body);
    const desc = x.decode(((page.body.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i) || [])[1]) || '');
    const vtitle = (info.title || '').replace(/\s*-\s*YouTube\s*$/i, '').trim();
    if (vtitle && !/^youtube$/i.test(vtitle)) {
      addVideoTitle(c, vtitle);
      x.fromText(`${vtitle}\n${desc}`, c, { lines: true });
      return { title: vtitle, kind: 'youtube', lang: 'en', cands: c.list(), note: 'no_captions' };
    }
  }

  const key = (process.env.YOUTUBE_API_KEY || '').trim();
  if (key) {
    try {
      const api = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(id)}&key=${encodeURIComponent(key)}`,
        { signal: AbortSignal.timeout(8000) },
      );
      const j = await api.json();
      const sn = j.items && j.items[0] && j.items[0].snippet;
      if (sn) {
        addVideoTitle(c, sn.title);
        x.fromText(`${sn.title || ''}\n${sn.description || ''}`, c, { lines: true });
        return { title: sn.title || 'YouTube', kind: 'youtube', lang: (sn.defaultAudioLanguage || 'en').split('-')[0], cands: c.list(), note: 'no_captions' };
      }
    } catch {
      /* fall through to oEmbed */
    }
  }

  try {
    const o = await fetchPage(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`, {
      accept: 'application/json',
      lang,
    });
    const j = JSON.parse(o.body);
    addVideoTitle(c, j.title);
    x.fromText(j.title || '', c, { lines: true });
    return { title: j.title || 'YouTube', kind: 'youtube', lang: 'en', cands: c.list(), note: 'title_only' };
  } catch (err) {
    if (err instanceof ImportError && err.code === 'not_found') throw err;
    throw new ImportError('blocked');
  }
}

async function readReddit(u, lang) {
  const url = new URL(u);
  const path = url.pathname.replace(/\/+$/, '');
  const page = await fetchPage(`https://www.reddit.com${path}.json?limit=200&raw_json=1`, { accept: 'application/json', lang });
  let json;
  try {
    json = JSON.parse(page.body);
  } catch {
    throw new ImportError('blocked');
  }
  const c = new x.Collector();
  x.fromRedditJson(json, c);
  const post = Array.isArray(json) && json[0] && json[0].data && json[0].data.children && json[0].data.children[0];
  return { title: (post && post.data && post.data.title) || 'Reddit', kind: 'reddit', lang: 'en', cands: c.list() };
}

async function readPage(u, lang) {
  const host = new URL(u).hostname.replace(/^www\./, '');
  const page = await fetchPage(u, { lang });
  const info = x.pageInfo(page.body);
  const c = new x.Collector();
  let kind = 'page';
  if (/(^|\.)letterboxd\.com$/.test(host)) {
    kind = 'letterboxd';
    if (!x.fromLetterboxd(page.body, c)) x.fromHtml(page.body, c);
  } else if (/(^|\.)imdb\.com$/.test(host)) {
    kind = 'imdb';
    if (!x.fromImdb(page.body, c)) x.fromHtml(page.body, c);
  } else if (/(^|\.)myanimelist\.net$/.test(host)) {
    kind = 'mal';
    if (!x.fromMal(page.body, c)) x.fromHtml(page.body, c);
  } else if (/json/.test(page.type)) {
    try {
      x.fromText(JSON.stringify(JSON.parse(page.body)), c);
    } catch {
      /* not JSON after all */
    }
  } else {
    x.fromHtml(page.body, c);
  }
  const cands = c.list(kind === 'imdb' ? 200 : 150);
  // A tiny page with nothing in it is a "are you a robot?" check
  if (!cands.length && page.body.length < 8000) throw new ImportError('blocked');
  return { title: info.title || host, kind, lang: (info.lang || 'en').split('-')[0], cands, size: page.body.length };
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks = [];
  let size = 0;
  for await (const ch of req) {
    size += ch.length;
    if (size > 100_000) throw new ImportError('too_large');
    chunks.push(ch);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(obj));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'post_only' });
  let input;
  try {
    input = await readBody(req);
  } catch {
    return send(res, 400, { ok: false, error: 'bad_request' });
  }
  const lang = String(input.lang || 'en').slice(0, 10).toLowerCase();

  try {
    let source;
    if (input.text) {
      const text = String(input.text).slice(0, 20000);
      const c = new x.Collector();
      x.fromText(text, c, { lines: true });
      source = { title: null, kind: 'text', lang: x.hasCJK(text) ? 'zh' : lang.split('-')[0], cands: c.list() };
    } else if (input.url) {
      const url = String(input.url).trim().slice(0, 2000);
      const yt = x.youtubeId(url);
      if (yt) source = await readYoutube(yt, lang);
      else if (/^https?:\/\/(www\.|old\.|new\.)?reddit\.com\/r\/[^/]+\/comments\//i.test(url)) source = await readReddit(url, lang);
      else source = await readPage(url, lang);
    } else {
      return send(res, 400, { ok: false, error: 'bad_request' });
    }

    if (input.debug) {
      return send(res, 200, { ok: true, debug: true, source: { title: source.title, kind: source.kind, lang: source.lang, size: source.size }, cands: source.cands });
    }
    if (!source.cands.length) {
      return send(res, 200, { ok: true, source: { title: source.title, kind: source.kind }, results: [], note: source.note || null });
    }
    const { results, partial } = await matchAll(source.cands, source.lang);
    return send(res, 200, {
      ok: true,
      source: { title: source.title, kind: source.kind },
      results,
      note: source.note || (partial ? 'partial' : null),
    });
  } catch (err) {
    if (err instanceof ImportError) return send(res, 200, { ok: false, error: err.code });
    console.error('import failed', err && err.message);
    return send(res, 200, { ok: false, error: 'server' });
  }
};
