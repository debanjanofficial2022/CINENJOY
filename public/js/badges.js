// Lobby › Badges & Year in review. Badges are worked out from what you have
// saved (ratings, watched titles, game results); nothing extra is stored.
// The year-in-review card can be saved as an image to share.
import { t, getLang } from './i18n.js';
import * as db from './data.js';
import * as tmdb from './tmdb.js';
import { track } from './loading.js';
import { esc, toast } from './ui.js';
import { todayKey } from './games/common.js';

const decade = (d) => (d ? `${String(d).slice(0, 3)}0s` : null);

function dailyStreak(results) {
  const days = [...new Set(results.filter((r) => r.mode === 'daily' && /^\d{4}-\d{2}-\d{2}$/.test(r.puzzle_key)).map((r) => r.puzzle_key))].sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const d of days) {
    const [y, m, dd] = d.split('-').map(Number);
    const yesterday = todayKey(new Date(y, m - 1, dd - 1));
    run = prev === yesterday ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

/** Each badge: [id, icon, value, target] */
export function badgeList(diary, results) {
  const rated = diary.filter((d) => d.rated).length;
  const countries = new Set(diary.flatMap((d) => (d.meta && d.meta.countries) || []));
  const langs = new Set(diary.map((d) => d.original_language).filter(Boolean));
  const decades = new Set(diary.map((d) => decade(d.release_date)).filter(Boolean));
  const anime = diary.filter((d) => tmdb.mediumOf(d) === 'anime').length;
  const games = new Set(results.map((r) => r.game));
  const won = (g, f = () => true) => results.some((r) => r.game === g && r.won && f(r));
  return [
    ['first', '🎟️', rated, 1],
    ['critic10', '⭐', rated, 10],
    ['critic50', '🌟', rated, 50],
    ['critic100', '🏆', rated, 100],
    ['globe', '🌍', countries.size, 10],
    ['polyglot', '🗣️', langs.size, 6],
    ['decades', '⏳', decades.size, 5],
    ['anime', '🍥', anime, 5],
    ['player', '🎮', results.length ? 1 : 0, 1],
    ['allround', '🎲', games.size, 8],
    ['streak', '🔥', dailyStreak(results), 7],
    ['wordle', '🎯', won('cinewordle', (r) => r.score <= 2) ? 1 : 0, 1],
    ['speedy', '⚡', won('crossword', (r) => r.score != null && r.score < 60 && !r.hint_used) ? 1 : 0, 1],
    ['weekend', '🗓️', won('weekend', (r) => !r.hint_used) ? 1 : 0, 1],
    ['cryptic', '✍️', won('cryptic', (r) => !r.hint_used) ? 1 : 0, 1],
    ['quiz', '🧠', results.some((r) => r.game === 'quiz' && r.detail && r.detail.n && r.detail.right === r.detail.n) ? 1 : 0, 1],
    ['party', '🎉', results.filter((r) => r.detail && r.detail.room).length, 3],
    ['degrees', '🔗', won('degrees', (r) => r.score <= 2) ? 1 : 0, 1],
  ];
}

function topOf(values) {
  const m = new Map();
  for (const v of values) if (v) m.set(v, (m.get(v) || 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1])[0] || null;
}

export function yearSummary(diary, results, year, genres) {
  const inYear = diary.filter((d) => String(d.date || '').startsWith(String(year)));
  const films = inYear.filter((d) => d.media_type === 'movie');
  const minutes = inYear.reduce((s, d) => {
    const m = d.meta || {};
    if (d.media_type === 'movie') return s + (m.runtime || 0);
    return s + (m.runtime || 0) * (m.episodes || 0);
  }, 0);
  const topGenre = topOf(inYear.flatMap((d) => (d.meta && d.meta.genres) || []).map((g) => genres[g]));
  const topCountry = topOf(inYear.flatMap((d) => (d.meta && d.meta.countries) || []));
  const topLang = topOf(inYear.map((d) => d.original_language));
  const best = inYear.filter((d) => d.rating != null).sort((a, b) => b.rating - a.rating || (a.date < b.date ? 1 : -1))[0] || null;
  const games = results.filter((r) => String(r.created_at || '').startsWith(String(year)));
  return {
    year,
    titles: inYear.length,
    films: films.length,
    series: inYear.length - films.length,
    hours: Math.round(minutes / 60),
    topGenre: topGenre && topGenre[0],
    topCountry: topCountry && topCountry[0],
    topLang: topLang && topLang[0],
    best,
    games: games.length,
    wins: games.filter((r) => r.won).length,
  };
}

function names() {
  try {
    return { lang: new Intl.DisplayNames([getLang()], { type: 'language' }), region: new Intl.DisplayNames([getLang()], { type: 'region' }) };
  } catch {
    return { lang: { of: (x) => x }, region: { of: (x) => x } };
  }
}

/** Draw the card onto a canvas, for saving or sharing as an image. */
function drawCard(sum, n) {
  const W = 1080;
  const H = 1350;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#5c0e1b');
  g.addColorStop(1, '#0d0809');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  x.strokeStyle = 'rgba(242,194,90,0.6)';
  x.lineWidth = 6;
  x.strokeRect(40, 40, W - 80, H - 80);
  const font = (size, weight = 700) => `${weight} ${size}px Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', system-ui, sans-serif`;
  x.fillStyle = '#f2c25a';
  x.font = font(44);
  x.fillText('CINEJOY', 90, 140);
  x.fillStyle = '#f5ecd9';
  x.font = font(92);
  x.fillText(t('yr.title', { year: sum.year }), 90, 260);
  const rows = [
    [t('yr.titles'), String(sum.titles)],
    [t('yr.split'), t('yr.splitValue', { f: sum.films, s: sum.series })],
    [t('yr.hours'), String(sum.hours)],
    [t('yr.genre'), sum.topGenre || '–'],
    [t('yr.country'), sum.topCountry ? n.region.of(sum.topCountry) : '–'],
    [t('yr.language'), sum.topLang ? n.lang.of(sum.topLang === 'cn' ? 'yue' : sum.topLang) : '–'],
    [t('yr.best'), sum.best ? `${sum.best.title} (${sum.best.rating}★)` : '–'],
    [t('yr.games'), t('yr.gamesValue', { n: sum.games, w: sum.wins })],
  ];
  let y = 390;
  for (const [label, value] of rows) {
    x.fillStyle = '#b4a394';
    x.font = font(34, 500);
    x.fillText(label, 90, y);
    x.fillStyle = '#ffe3a1';
    x.font = font(54);
    let v = value;
    while (x.measureText(v).width > W - 180 && v.length > 4) v = `${v.slice(0, -2)}…`;
    x.fillText(v, 90, y + 60);
    y += 118;
  }
  x.fillStyle = '#b4a394';
  x.font = font(28, 500);
  x.fillText(location.host, 90, H - 80);
  return c;
}

export function badgesPage() {
  const node = document.createElement('section');
  node.className = 'page badges';
  node.innerHTML = `<header class="page-head">
      <a class="back" href="/lobby" data-link>‹ ${esc(t('nav.lobby'))}</a>
      <h1>${esc(t('lobby.tabs.badges')[0])}</h1>
      <p class="lead">${esc(t('bd.lead'))}</p>
    </header><div class="bd-body"><div class="loading-box"><span class="spinner"></span>${esc(t('ui.loading'))}</div></div>`;
  const body = node.querySelector('.bd-body');
  const n = names();

  (async () => {
    try {
      const [diary, results, genres] = await track(Promise.all([db.myDiary(), db.allResults(), tmdb.genreNames().catch(() => ({}))]));
      const badges = badgeList(diary, results);
      const earned = badges.filter(([, , v, target]) => v >= target).length;
      const years = [...new Set([...diary.map((d) => String(d.date || '').slice(0, 4)), ...results.map((r) => String(r.created_at || '').slice(0, 4))].filter((y) => /^\d{4}$/.test(y)))].sort().reverse();
      const thisYear = String(new Date().getFullYear());
      if (!years.includes(thisYear)) years.unshift(thisYear);
      let year = years[0];

      const yearHtml = () => {
        const s = yearSummary(diary, results, year, genres);
        const stat = (label, value) => `<div class="yr-stat"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
        return `<div class="yr-card">
          <p class="yr-brand">CINEJOY</p>
          <h3>${esc(t('yr.title', { year: s.year }))}</h3>
          <div class="yr-grid">
            ${stat(t('yr.titles'), String(s.titles))}
            ${stat(t('yr.split'), t('yr.splitValue', { f: s.films, s: s.series }))}
            ${stat(t('yr.hours'), String(s.hours))}
            ${stat(t('yr.genre'), s.topGenre || '–')}
            ${stat(t('yr.country'), s.topCountry ? n.region.of(s.topCountry) : '–')}
            ${stat(t('yr.language'), s.topLang ? n.lang.of(s.topLang === 'cn' ? 'yue' : s.topLang) : '–')}
            ${stat(t('yr.best'), s.best ? `${s.best.title} (${s.best.rating}★)` : '–')}
            ${stat(t('yr.games'), t('yr.gamesValue', { n: s.games, w: s.wins }))}
          </div>
        </div>`;
      };

      body.innerHTML = `<h2 class="group-title">${esc(t('bd.earned', { n: earned, of: badges.length }))}</h2>
        <div class="bd-grid">${badges
          .map(([id, icon, v, target]) => {
            const done = v >= target;
            return `<div class="bd${done ? ' is-done' : ''}"><span class="bd-icon" aria-hidden="true">${icon}</span><b>${esc(t(`bd.b.${id}.name`))}</b>
              <span class="muted">${esc(t(`bd.b.${id}.how`))}</span>${target > 1 ? `<span class="bd-bar"><span style="width:${Math.min(100, (v / target) * 100)}%"></span></span><span class="bd-count">${Math.min(v, target)} / ${target}</span>` : `<span class="bd-count">${done ? '✓' : '—'}</span>`}</div>`;
          })
          .join('')}</div>
        <h2 class="group-title">${esc(t('yr.heading'))}</h2>
        <div class="row-start yr-tools">
          <label class="tool"><span>${esc(t('yr.year'))}</span><select data-year>${years.map((y) => `<option${y === year ? ' selected' : ''}>${y}</option>`).join('')}</select></label>
          <button type="button" class="btn" data-save>⬇ ${esc(t('yr.save'))}</button>
        </div>
        <div data-card>${yearHtml()}</div>`;
      body.querySelector('[data-year]').addEventListener('change', (e) => {
        year = e.target.value;
        body.querySelector('[data-card]').innerHTML = yearHtml();
      });
      body.querySelector('[data-save]').addEventListener('click', async () => {
        const canvas = drawCard(yearSummary(diary, results, year, genres), n);
        const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
        if (!blob) return toast(t('errors.generic'), 'error');
        const file = new File([blob], `cinejoy-${year}.png`, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: t('yr.title', { year }) });
            return;
          } catch (err) {
            if (err && err.name === 'AbortError') return;
          }
        }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = file.name;
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      });
    } catch (err) {
      console.warn(err);
      body.innerHTML = `<div class="error-box"><p>${esc(t('errors.generic'))}</p></div>`;
    }
  })();
  return node;
}
