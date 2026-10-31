// Finds likely film / series / anime titles in web pages and text, without AI.
// The output is a list of candidates; api/import.js checks each one against TMDB.
//
// Candidate: { title, year?, imdb?, hint?, strength, pos }
//   strength 4 = the site says this is a title (Letterboxd, IMDb, MyAnimeList lists)
//   strength 3 = "Title (1999)", 《title》, «title»
//   strength 2 = headings, italics, numbered or timestamped lines, quotes
//   strength 1 = loose capitalised phrases in sentences

// ---------- HTML helpers ----------

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…', laquo: '«', raquo: '»',
  middot: '·', bull: '•', eacute: 'é', egrave: 'è', ecirc: 'ê', aacute: 'á', agrave: 'à',
  acirc: 'â', iacute: 'í', oacute: 'ó', ocirc: 'ô', uacute: 'ú', ntilde: 'ñ', ccedil: 'ç',
  uuml: 'ü', ouml: 'ö', auml: 'ä', Eacute: 'É', Aacute: 'Á', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ',
};

function decode(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return NAMED[e] ?? NAMED[e.toLowerCase()] ?? m;
  });
}

function stripTags(html) {
  return decode(
    String(html)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr|section|article|blockquote|dd|dt|figcaption|caption|ul|ol|table)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
  return m ? decode(m[2] ?? m[3] ?? '') : null;
}

function pageInfo(html) {
  const title =
    attr((html.match(/<meta[^>]+property=["']og:title["'][^>]*>/i) || [''])[0], 'content') ||
    stripTags((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ''])[1]);
  const lang = ((html.match(/<html[^>]*\slang=["']?([a-zA-Z-]{2,10})/i) || [])[1] || '').toLowerCase();
  return { title: (title || '').slice(0, 200), lang };
}

// ---------- Text normalising ----------

function norm(s) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(the|a|an|el|la|los|las|le|les|der|die|das) /, '');
}

const JUNK = new Set(
  [
    'intro', 'introduction', 'conclusion', 'final thoughts', 'honorable mentions', 'honourable mentions',
    'subscribe', 'share', 'comments', 'comment', 'menu', 'home', 'search', 'login', 'log in', 'sign in',
    'sign up', 'register', 'advertisement', 'newsletter', 'read more', 'more', 'privacy policy', 'privacy',
    'terms', 'terms of use', 'contact', 'contact us', 'about', 'about us', 'related', 'related posts',
    'recommended', 'trending', 'popular', 'latest', 'news', 'reviews', 'review', 'movies', 'movie', 'films',
    'film', 'tv', 'tv shows', 'series', 'anime', 'watch', 'watchlist', 'top 10', 'top 20', 'top 50',
    'top 100', 'list', 'lists', 'next', 'previous', 'back to top', 'cookie settings', 'accept', 'english',
    'outro', 'credits', 'sources', 'tags', 'categories', 'follow us', 'table of contents', 'contents',
    'spoilers', 'spoiler', 'trailer', 'synopsis', 'cast', 'director', 'plot', 'verdict', 'rating',
    'where to watch', 'streaming', 'netflix', 'hulu', 'disney', 'amazon prime', 'prime video', 'hbo max',
    'max', 'apple tv', 'youtube', 'reddit', 'letterboxd', 'imdb', 'myanimelist', 'twitter', 'instagram',
    'facebook', 'tiktok', 'patreon', 'discord', 'merch', 'chapters', 'timestamps', 'links', 'music',
  ].map(norm),
);

function cleanTitle(raw) {
  let t = decode(String(raw || ''))
    .replace(/\s+/g, ' ')
    .trim()
    // leading timestamps "01:23", "(1:02:03)"
    .replace(/^\(?\d{1,2}:\d{2}(?::\d{2})?\)?\s*[-–—:|]?\s*/, '')
    // leading list markers: "1.", "#1", "1)", "No. 1 -", "•"
    .replace(/^(?:[-*•▪◦·>]+|#\d{1,3}\b[.):]?|\d{1,3}\s*[.)\]:]|no\.?\s*\d{1,3}\s*[-–—:.]?|\d{1,3}\s*[-–—])\s*/i, '')
    .replace(/^["'“”‘’«»《》「」]+|["'“”‘’«»《》「」.,;:!?]+$/g, '')
    .trim();
  return t;
}

function yearOf(s) {
  const m = String(s).match(/[([]\s*((?:18|19|20)\d{2})\s*(?:[–-]\s*(?:(?:19|20)\d{2})?\s*)?[)\]]\s*$/);
  return m ? Number(m[1]) : null;
}

function stripYear(s) {
  return String(s).replace(/\s*[([]\s*(?:18|19|20)\d{2}\s*(?:[–-]\s*(?:(?:19|20)\d{2})?\s*)?[)\]]\s*$/, '').trim();
}

const wordCount = (s) => (String(s).match(/\S+/g) || []).length;
const hasCJK = (s) => /[぀-ヿ㐀-鿿가-힯]/.test(s);

function plausible(title) {
  if (!title) return false;
  const n = norm(title);
  if (!n || n.length < 2 || JUNK.has(n)) return false;
  if (/^\d+$/.test(n)) return false;
  if (/^(https?|www)\b/.test(n)) return false;
  if (hasCJK(title)) return title.length <= 40;
  return title.length <= 90 && wordCount(title) <= 12;
}

// ---------- Candidate list ----------

class Collector {
  constructor() {
    this.map = new Map();
    this.pos = 0;
  }
  add(raw, { strength, year = null, imdb = null, hint = null, alt = true } = {}) {
    if (imdb) {
      const key = `imdb:${imdb}`;
      if (!this.map.has(key)) this.map.set(key, { title: raw || imdb, imdb, strength: 4, pos: this.pos++, hint, count: 1 });
      return;
    }
    let t = cleanTitle(raw);
    // "Vertigo (Alfred Hitchcock, 1958, USA) (208 votes)" → "Vertigo", 1958
    let noteYear = null;
    const note = t.match(/^(.{1,90}?)\s*\(([^()]*?\b((?:18|19|20)\d{2})\b[^()]*)\)/);
    if (note && !/^\s*(?:18|19|20)\d{2}\s*$/.test(note[2])) {
      t = note[1];
      noteYear = Number(note[3]);
    }
    // "Parasite (2019) by Bong Joon Ho" → "Parasite (2019)"
    const mid = t.match(/^(.+?\s*[([]\s*(?:18|19|20)\d{2}\s*[)\]])\s*\S/);
    if (mid) t = mid[1];
    const y = year || noteYear || yearOf(t);
    t = stripYear(t);
    if (!plausible(t)) return;
    // One entry per title; a second entry only for a different year (Parasite 1982 vs 2019)
    const n = norm(t);
    let key = n;
    let prev = this.map.get(key);
    if (prev && y && prev.year && prev.year !== y) {
      key = `${n}|${y}`;
      prev = this.map.get(key);
    }
    if (prev) {
      prev.count += 1;
      if (strength > prev.strength) prev.strength = strength;
      if (y && !prev.year) prev.year = y;
    } else {
      this.map.set(key, { title: t, year: y || null, strength, pos: this.pos++, hint, count: 1 });
    }
    // "Parasite by Bong Joon Ho", "Parasite - Bong Joon Ho", "Parasite | Review"
    if (alt) {
      const parts = t.split(/\s+(?:[-–—|]|by|dir\.?|directed by)\s+/i);
      if (parts.length > 1 && parts[0].length >= 2) this.add(parts[0], { strength, year: y, hint, alt: false });
    }
  }
  list(limit = 150) {
    const all = [...this.map.values()];
    const strong = all.filter((c) => c.strength >= 2).sort((a, b) => b.strength - a.strength || a.pos - b.pos);
    // loose phrases: only the ones that come up more than once, or the first few
    const weak = all
      .filter((c) => c.strength < 2)
      .sort((a, b) => b.count - a.count || a.pos - b.pos)
      .slice(0, 15);
    return [...strong, ...weak].slice(0, limit);
  }
}

// "My favourite is Parasite (2019) by ..." → "Parasite", 2019
const CONNECT = new Set(['of', 'the', 'and', 'a', 'an', 'in', 'on', 'to', 'for', 'with', 'at', 'from', 'vs', 'vs.', '&', 'de', 'del', 'la', 'el', 'los', 'las', 'y', 'en', 'le', 'les', 'du', 'des', 'et', 'no', 'wa', 'ga']);
function titleBefore(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const out = [];
  for (let i = words.length - 1; i >= 0 && out.length < 10; i -= 1) {
    const w = words[i];
    if (/[.!?;"“”]$/.test(w) && out.length) break;
    const bare = w.replace(/^[("'“‘«]+|[)"'”’»,:]+$/g, '');
    if (!bare) break;
    if (/^[\p{Lu}\p{N}]/u.test(bare) || hasCJK(bare)) out.unshift(bare);
    else if (CONNECT.has(bare.toLowerCase()) && out.length) out.unshift(bare);
    else break;
    if (/^[("'“‘«]/.test(w)) break;
  }
  while (out.length && CONNECT.has(out[0].toLowerCase())) out.shift();
  return out.join(' ');
}

/** Candidates from plain text. lines: treat short lines as possible titles. */
function fromText(text, c, { lines = false } = {}) {
  const src = String(text || '').slice(0, 60000);

  // 《Title》 「Title」 «Title» — the usual way to write titles in Chinese, Japanese, Spanish
  for (const m of src.matchAll(/《([^》\n]{1,40})》|「([^」\n]{1,40})」|『([^』\n]{1,40})』|«([^»\n]{1,80})»/g)) {
    const t = m[1] || m[2] || m[3] || m[4];
    const after = src.slice(m.index + m[0].length, m.index + m[0].length + 8);
    const y = (after.match(/^\s*[（(]\s*((?:19|20)\d{2})/) || [])[1];
    c.add(t, { strength: 3, year: y ? Number(y) : null });
  }

  // Title (1999)
  for (const m of src.matchAll(/([^\n()[\]]{1,90}?)\s*[([]\s*((?:18|19|20)\d{2})\s*[)\]]/g)) {
    const before = m[1];
    const t = titleBefore(before);
    if (t) {
      c.add(t, { strength: 3, year: Number(m[2]) });
      const poss = t.split(/['’]s\s+/);
      if (poss.length > 1) c.add(poss[poss.length - 1], { strength: 3, year: Number(m[2]) });
      // "Vertigo and Parasite (1982)": also try the last part
      const and = t.split(/\s+(?:and|&|y|et|und)\s+/i);
      if (and.length > 1) c.add(and[and.length - 1], { strength: 3, year: Number(m[2]) });
    }
  }

  // "Quoted titles"
  for (const m of src.matchAll(/[“"]([^“”"\n]{2,70})[”"]/g)) {
    if (/^[\p{Lu}\p{N}]/u.test(m[1]) || hasCJK(m[1])) c.add(m[1], { strength: 2 });
  }

  // *italic* / **bold** / _italic_ (Reddit and other markdown)
  for (const m of src.matchAll(/(?<![*\w])\*{1,2}([^*\n]{2,80})\*{1,2}(?![*\w])|(?<![_\w])_([^_\n]{2,80})_(?![_\w])/g)) {
    c.add(m[1] || m[2], { strength: 2 });
  }

  if (lines) {
    for (const line of src.split(/\n/)) {
      const raw = line.trim();
      if (!raw) continue;
      const marked = /^(?:[-*•▪◦·>]+|#\d{1,3}\b|\d{1,3}\s*[.)\]:]|\(?\d{1,2}:\d{2}(?::\d{2})?\)?)\s*\S/.test(raw);
      const t = cleanTitle(raw);
      if (!t) continue;
      if (marked && wordCount(t) <= 10) c.add(t, { strength: 2 });
      else if (wordCount(t) <= 6 && (/^[\p{Lu}\p{N}]/u.test(t) || hasCJK(t))) c.add(t, { strength: 1 });
    }
  }

  // Loose capitalised phrases: "Spirited Away", "The Seventh Seal"
  const phrase =
    /(?:^|[\s(“"'‘«—–-])((?:\p{Lu}[\p{L}\p{N}'’.\-]*)(?:[ \t]+(?:(?:of|the|and|a|an|in|on|to|for|with|at|from|vs\.?|&|de|del|la|el|y|en)[ \t]+)*[\p{Lu}\p{N}][\p{L}\p{N}'’.\-]*){1,5})/gmu;
  for (const m of src.matchAll(phrase)) {
    const t = m[1].replace(/['’]s$/, '');
    if (wordCount(t) >= 2) c.add(t, { strength: 1, alt: false });
  }
}

function walkLd(node, c) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach((n) => walkLd(n, c));
  const type = [].concat(node['@type'] || []).join(' ');
  if (/ItemList/.test(type) && Array.isArray(node.itemListElement)) {
    for (const el of node.itemListElement) {
      const item = el.item || el;
      const url = (typeof item === 'object' && (item.url || item['@id'])) || el.url || '';
      const imdb = (String(url).match(/\/title\/(tt\d{6,9})/) || [])[1];
      const name = (typeof item === 'object' && item.name) || el.name;
      if (imdb) c.add(name, { imdb });
      else if (name) c.add(name, { strength: 3, year: yearFromDate(item.datePublished || item.dateCreated) });
    }
  }
  if (/\b(Movie|TVSeries|TVSeason|CreativeWorkSeries)\b/.test(type) && node.name) {
    const imdb = (String(node.url || node.sameAs || '').match(/\/title\/(tt\d{6,9})/) || [])[1];
    if (imdb) c.add(node.name, { imdb });
    else c.add(node.name, { strength: 3, year: yearFromDate(node.datePublished || node.dateCreated || node.startDate) });
  }
  for (const k of ['@graph', 'mainEntity', 'about', 'hasPart']) if (node[k]) walkLd(node[k], c);
}

function yearFromDate(d) {
  const m = String(d || '').match(/^((?:18|19|20)\d{2})/);
  return m ? Number(m[1]) : null;
}

function fromLdJson(html, c) {
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      walkLd(JSON.parse(m[1].trim()), c);
    } catch {
      /* broken JSON-LD: skip */
    }
  }
}

// Section headings after which a page is references, links and comments
const END_SECTIONS = /^(references|notes|footnotes|citations|sources|bibliography|see also|external links|further reading|works cited|comments?|related (posts|articles|stories)|you (may|might) also like|more from|read next|referencias|notas|véase también|enlaces externos|bibliografía|参考文献|参考资料|注释|外部链接|相关条目|延伸阅读)\b/i;

function mainHtml(html) {
  let h = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe|form|nav|footer|aside|select|button|sup)\b[\s\S]*?<\/\1>/gi, ' ');
  const articles = [...h.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)].map((m) => m[1]);
  if (articles.length) h = articles.sort((a, b) => b.length - a.length)[0];
  else {
    const main = h.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
    const body = h.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
    h = main ? main[1] : body ? body[1] : h;
  }
  // Stop at "References", "See also", "Comments"…
  for (const m of h.matchAll(/<h[2-4]\b[^>]*>([\s\S]*?)<\/h[2-4]>/gi)) {
    if (END_SECTIONS.test(stripTags(m[1]).trim())) {
      h = h.slice(0, m.index);
      break;
    }
  }
  return h;
}

/** Table rows: a title in one cell, its year in another (Wikipedia lists and the like). */
function fromTables(html, c) {
  let n = 0;
  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => m[1]);
    if (cells.length < 2) continue;
    let title = null;
    let year = null;
    for (const cell of cells) {
      const ital = cell.match(/<(i|em|cite)\b[^>]*>([\s\S]*?)<\/\1>/i);
      const text = stripTags(cell).trim();
      if (!title && ital) title = stripTags(ital[2]);
      if (!year) {
        const y = text.match(/^\(?((?:18|19|20)\d{2})\)?$/);
        if (y) year = Number(y[1]);
      }
    }
    if (title) {
      c.add(title, { strength: year ? 3 : 2, year });
      n += 1;
    }
  }
  return n;
}

/** Any article, blog post or list page. */
function fromHtml(html, c) {
  fromLdJson(html, c);
  const main = mainHtml(html);
  fromTables(main, c);
  for (const m of main.matchAll(/<(h[1-4]|li|em|i|cite|strong|b|dt|figcaption)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
    const tag = m[1].toLowerCase();
    // language menus: <li class="interlanguage-link"><a hreflang="pt">Português</a>
    if (/\s(?:lang|hreflang)=|interlanguage|language/i.test(m[2]) || /<a\b[^>]*\shreflang=/i.test(m[3])) continue;
    const text = stripTags(m[3]);
    if (!text || text.length > 120) continue;
    const strength = { h1: 1, h2: 2, h3: 2, h4: 2, em: 2, i: 2, cite: 2, li: 2, strong: 1.5, b: 1.5, dt: 2, figcaption: 1 }[tag] || 1;
    for (const line of text.split('\n')) c.add(line, { strength });
  }
  fromText(stripTags(main), c);
}

// ---------- Site-specific readers ----------

function fromLetterboxd(html, c) {
  let found = 0;
  for (const m of html.matchAll(/data-(?:item|film)-name="([^"]+)"/g)) {
    c.add(decode(m[1]), { strength: 4, hint: 'movie' });
    found += 1;
  }
  if (!found) {
    for (const m of html.matchAll(/<img[^>]+class="[^"]*image[^"]*"[^>]*alt="([^"]+)"/g)) {
      c.add(decode(m[1]), { strength: 4, hint: 'movie' });
      found += 1;
    }
  }
  if (!found) {
    for (const m of html.matchAll(/data-(?:film|item)-slug="([a-z0-9-]+)"/g)) {
      const slug = m[1];
      const y = (slug.match(/-((?:19|20)\d{2})$/) || [])[1];
      c.add(slug.replace(/-((?:19|20)\d{2})$/, '').replace(/-/g, ' '), { strength: 3, year: y ? Number(y) : null, hint: 'movie' });
      found += 1;
    }
  }
  return found;
}

function fromImdb(html, c) {
  const before = c.map.size;
  fromLdJson(html, c);
  const seen = new Set();
  for (const m of html.matchAll(/\/title\/(tt\d{6,9})\/|"(tt\d{7,9})"/g)) {
    m[1] = m[1] || m[2];
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    if (seen.size > 250) break;
    c.add(null, { imdb: m[1] });
  }
  return c.map.size - before;
}

function fromMal(html, c) {
  const items = html.match(/data-items="([^"]+)"/);
  if (items) {
    try {
      const list = JSON.parse(decode(items[1]));
      for (const it of list) {
        const t = it.anime_title_eng || it.anime_title || it.manga_title;
        if (t) c.add(String(t), { strength: 4, hint: 'anime' });
      }
      return list.length;
    } catch {
      /* fall through */
    }
  }
  let found = 0;
  for (const m of html.matchAll(/<h3[^>]*class="[^"]*(?:anime_ranking_h3|title)[^"]*"[^>]*>([\s\S]*?)<\/h3>/gi)) {
    c.add(stripTags(m[1]), { strength: 4, hint: 'anime' });
    found += 1;
  }
  return found;
}

function fromRedditJson(json, c) {
  const texts = [];
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    const d = n.data || n;
    if (d.title && d.selftext !== undefined) texts.push(d.title, d.selftext || '');
    if (d.body) texts.push(d.body);
    if (d.children) walk(d.children);
    if (d.replies) walk(d.replies);
  };
  walk(json);
  const text = texts.join('\n\n').slice(0, 60000);
  fromText(text, c, { lines: true });
  return texts.length;
}

/** Pull a JSON object that follows `marker` in a page, by matching braces. */
function jsonAfter(html, marker) {
  const at = html.indexOf(marker);
  if (at < 0) return null;
  const start = html.indexOf('{', at + marker.length);
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < html.length && i < start + 3_000_000; i += 1) {
    const ch = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function youtubeId(u) {
  try {
    const url = new URL(u);
    const host = url.hostname.replace(/^(www|m|music)\./, '');
    if (host === 'youtu.be') return url.pathname.slice(1, 12) || null;
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (url.searchParams.get('v')) return url.searchParams.get('v').slice(0, 11);
      const m = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/);
      if (m) return m[1];
    }
  } catch {
    /* not a URL */
  }
  return null;
}

/** Titles spoken in auto-captions: "number five is parasite" — words after a cue. */
const CUES = /\b(?:number \w+ is|number \w+|movie called|film called|show called|anime called|series called|the movie|the film|the show|the anime|the series|watch|watched|recommend|called)\s+/gi;
const STOP = new Set(['by', 'from', 'which', 'and', 'it', 'this', 'that', 'is', 'was', 'with', 'because', 'directed', 'starring', 'where', 'who', 'its', "it's", 'so', 'but', 'if', 'on', 'in', 'at', 'for', 'about', 'uh', 'um']);
function fromSpokenCaptions(text, c) {
  let n = 0;
  for (const m of text.matchAll(CUES)) {
    const rest = text.slice(m.index + m[0].length, m.index + m[0].length + 80).split(/\s+/);
    const words = [];
    for (const w of rest) {
      const bare = w.toLowerCase().replace(/[^\p{L}\p{N}'’-]/gu, '');
      if (!bare || STOP.has(bare) || words.length >= 5) break;
      words.push(bare);
    }
    while (words.length && ['the', 'a', 'an'].includes(words[0]) && words.length > 1) words.shift();
    if (words.length) {
      c.add(words.join(' '), { strength: 1.5, alt: false });
      n += 1;
      if (n >= 20) break;
    }
  }
}

/** "Parasite - Official Trailer (2019) Bong Joon Ho Film" → { title: "Parasite", year: 2019 } */
const VIDEO_WORDS =
  /\b(?:official|final|teaser|trailer|trailers|tráiler|avance|预告片?|予告編?|full movie|película completa|clip|scene|review|reseña|reaction|explained|ending explained|recap|breakdown|analysis|behind the scenes|featurette|hd|4k|uhd|imax|in theaters?[^|–-]*|now streaming[^|–-]*|on netflix|netflix|prime video|disney\+?|hbo max|\#\d+)\b/gi;
function videoTitle(raw) {
  let t = decode(String(raw || ''));
  const y = (t.match(/[([]\s*((?:19|20)\d{2})\s*[)\]]/) || [])[1];
  t = t
    .replace(/[([][^()\[\]]*[)\]]/g, ' ')
    .split(/\s+[|｜•·]\s+/)[0]
    .split(/\s+[-–—:]\s+(?=[^-–—:]*\b(?:official|trailer|teaser|clip|review|explained|recap|tráiler|avance)\b)/i)[0]
    .replace(VIDEO_WORDS, ' ')
    .replace(/\s+[-–—|:]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return { title: t, year: y ? Number(y) : null };
}

module.exports = {
  Collector,
  decode,
  stripTags,
  pageInfo,
  norm,
  hasCJK,
  fromText,
  fromHtml,
  fromLdJson,
  fromLetterboxd,
  fromImdb,
  fromMal,
  fromRedditJson,
  fromSpokenCaptions,
  jsonAfter,
  youtubeId,
  videoTitle,
  cleanTitle,
  titleBefore,
};
