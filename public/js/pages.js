// Page views. Each returns an element; app.js swaps it into <main>.
import { t } from './i18n.js';
import { createLogo } from './logo.js';

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function html(str) {
  const tpl = document.createElement('template');
  tpl.innerHTML = str.trim();
  return tpl.content;
}

function section(cls, inner) {
  const s = document.createElement('section');
  s.className = `page ${cls}`;
  s.append(html(inner));
  return s;
}

const GAMES = [
  { id: 'cinewordle', modes: ['daily', 'practice', 'challenge'], phase: 1, href: '/games/cinewordle' },
  { id: 'crossword', modes: ['daily', 'practice', 'challenge'], phase: 1, href: '/games/crossword' },
  { id: 'cryptic', modes: ['daily', 'practice', 'challenge'], phase: 2, href: '/games/cryptic' },
  { id: 'quiz', modes: ['practice', 'room', 'challenge'], phase: 2, href: '/games/quiz' },
  { id: 'frame', modes: ['daily', 'practice', 'challenge'], phase: 2, href: '/games/frame' },
  { id: 'impostor', modes: ['room'], phase: 2, href: '/games/impostor' },
  { id: 'pictionary', modes: ['room'], phase: 3 },
  { id: 'emoji', modes: ['daily', 'practice', 'challenge'], phase: 3 },
  { id: 'degrees', modes: ['daily', 'practice', 'challenge'], phase: 3 },
  { id: 'higher', modes: ['practice', 'challenge'], phase: 3 },
  { id: 'timeline', modes: ['daily', 'practice', 'challenge'], phase: 3 },
  { id: 'poster', modes: ['room'], phase: 3 },
];

const LOBBY = [
  { id: 'night', phase: 2, icon: '🍿', href: '/lobby/movie-night' },
  { id: 'diary', phase: 2, icon: '📔', href: '/lobby/diary' },
  { id: 'explore', phase: 3, icon: '🧭' },
  { id: 'history', phase: 3, icon: '🎞️' },
];

const statusChip = ({ phase, step, href }) =>
  href
    ? `<span class="chip chip-next">▶ ${esc(t('play.playNow'))}</span>`
    : step
    ? `<span class="chip chip-next">${esc(t('status.next'))} · ${esc(t('status.step', { n: step }))}</span>`
    : `<span class="chip">${esc(t('status.phase', { n: phase }))}</span>`;

const stubNo = (n) => String(n).padStart(3, '0');

export function home() {
  const media = t('home.media');
  const ribbon = [...media, ...media].map((m) => `<li>${esc(m)}</li>`).join('');
  const node = section(
    'home',
    `
    <div class="marquee">
      <div class="bulbs" aria-hidden="true"></div>
      <p class="kicker">${esc(t('home.kicker'))}</p>
      <div class="logo-slot"></div>
      <button class="replay" type="button">${esc(t('home.replay'))}</button>
    </div>
    <h1 class="tagline">${esc(t('home.tagline'))}</h1>
    <p class="lead">${esc(t('home.lead'))}</p>
    <p class="saved"><span aria-hidden="true">●</span> ${esc(t('home.saved'))}</p>
    <div class="ribbon" aria-label="${esc(media.join(', '))}">
      <ul aria-hidden="true">${ribbon}</ul>
    </div>
    <div class="stubs">
      ${['watchlist', 'games', 'lobby']
        .map(
          (k, i) => `
        <a class="ticket" href="/${k}" data-link>
          <span class="ticket-main">
            <span class="ticket-kicker">${esc(t('home.admit'))}</span>
            <span class="ticket-title">${esc(t(`nav.${k}`))}</span>
            <span class="ticket-desc">${esc(t(`home.cards.${k}`))}</span>
          </span>
          <span class="ticket-stub" aria-hidden="true"><span>Nº ${stubNo(i + 1)}</span></span>
        </a>`,
        )
        .join('')}
    </div>`,
  );
  const logo = createLogo({ size: 'lg' });
  node.querySelector('.logo-slot').append(logo.el);
  node.querySelector('.replay').addEventListener('click', () => logo.play());
  return node;
}

export function games() {
  return section(
    'games',
    `
    <header class="page-head">
      <h1>${esc(t('games.title'))}</h1>
      <p class="lead">${esc(t('games.lead'))}</p>
    </header>
    <div class="grid">
      ${GAMES.map((g, i) => {
        const [name, desc] = t(`games.list.${g.id}`);
        const tag = g.href ? 'a' : 'article';
        return `
        <${tag} class="ticket${g.href ? ' is-next' : ' ticket-static'}"${g.href ? ` href="${g.href}" data-link` : ''}>
          <span class="ticket-main">
            ${statusChip(g)}
            <span class="ticket-title">${esc(name)}</span>
            <span class="ticket-desc">${esc(desc)}</span>
            <span class="modes">${g.modes.map((m) => `<span>${esc(t(`modes.${m}`))}</span>`).join('')}</span>
          </span>
          <span class="ticket-stub" aria-hidden="true"><span>Nº ${stubNo(i + 1)}</span></span>
        </${tag}>`;
      }).join('')}
    </div>`,
  );
}

export function lobby() {
  return section(
    'lobby',
    `
    <header class="page-head">
      <h1>${esc(t('lobby.title'))}</h1>
      <p class="lead">${esc(t('lobby.lead'))}</p>
    </header>
    <div class="grid grid-2">
      ${LOBBY.map((tab, i) => {
        const [name, desc] = t(`lobby.tabs.${tab.id}`);
        const tag = tab.href ? 'a' : 'article';
        return `
        <${tag} class="ticket${tab.href ? ' is-next' : ' ticket-static'}"${tab.href ? ` href="${tab.href}" data-link` : ''}>
          <span class="ticket-main">
            ${statusChip(tab)}
            <span class="ticket-title"><span class="emoji" aria-hidden="true">${tab.icon}</span> ${esc(name)}</span>
            <span class="ticket-desc">${esc(desc)}</span>
          </span>
          <span class="ticket-stub" aria-hidden="true"><span>Nº ${stubNo(i + 1)}</span></span>
        </${tag}>`;
      }).join('')}
    </div>`,
  );
}

export function notFound() {
  return section(
    'notfound',
    `
    <header class="page-head">
      <h1>${esc(t('notfound.title'))}</h1>
      <p class="lead">${esc(t('notfound.body'))}</p>
      <p><a class="btn" href="/" data-link>${esc(t('notfound.back'))}</a></p>
    </header>`,
  );
}
