// CINENJOY site shell: routing, language switching, header logo.
import { t, getLang, setLang, onLangChange } from './i18n.js';
import { createLogo } from './logo.js';
import * as pages from './pages.js';
import { listsPage, listPage, joinPage } from './watchlist.js';
import { registerLoader } from './loading.js';
import { initAccount } from './data.js';

const routes = {
  '/': { view: pages.home, nav: 'home', title: null },
  '/watchlist': { view: listsPage, nav: 'watchlist', title: 'nav.watchlist' },
  '/games': { view: pages.games, nav: 'games', title: 'nav.games' },
  '/lobby': { view: pages.lobby, nav: 'lobby', title: 'nav.lobby' },
};

// Addresses with a value in them: /watchlist/<list id>, /join/<invite code>
const patterns = [
  { re: /^\/watchlist\/([0-9a-f-]{36})$/i, view: listPage, nav: 'watchlist', title: 'nav.watchlist' },
  { re: /^\/join\/([A-Za-z0-9]{4,40})$/, view: joinPage, nav: 'watchlist', title: 'nav.watchlist' },
  // /games/cinewordle, /games/cinewordle/practice, /games/cinewordle/c/<challenge id>; same for crossword
  { re: /^\/games\/(cinewordle|crossword)(?:\/(practice)|\/c\/([0-9a-f-]{36}))?$/i, view: gameView, nav: 'games', title: 'nav.games' },
];

function match(path) {
  if (routes[path]) return { ...routes[path], args: [] };
  for (const p of patterns) {
    const m = path.match(p.re);
    if (m) return { ...p, args: m.slice(1) };
  }
  return null;
}

// Games load on demand: their word lists are only needed when you play
function gameView(game, practice, challengeId) {
  const holder = document.createElement('section');
  holder.className = 'page';
  const mode = practice ? 'practice' : challengeId ? 'challenge' : 'daily';
  const load =
    game.toLowerCase() === 'cinewordle'
      ? import('./games/wordle.js').then((m) => m.wordlePage(mode, challengeId))
      : import('./games/crossword.js').then((m) => m.crosswordPage(mode, challengeId));
  load
    .then((node) => {
      if (holder.isConnected) holder.replaceWith(node);
    })
    .catch((err) => {
      console.warn(err);
      holder.textContent = t('errors.generic');
    });
  return holder;
}

const main = document.getElementById('main');
const langSelect = document.getElementById('lang-select');

const firstPath = normalise(location.pathname);
const brandLogo = createLogo({ size: 'sm', autoplay: firstPath !== '/' });
document.getElementById('brand-logo').append(brandLogo.el);

// Pages make the logo loop while their data loads
registerLoader((on) => brandLogo.setLoading(on));

function normalise(path) {
  const p = path.replace(/\/+$/, '');
  return p === '' ? '/' : p;
}

function applyStaticText() {
  document.documentElement.lang = getLang();
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  langSelect.value = getLang();
}

function render({ focus = false } = {}) {
  const path = normalise(location.pathname);
  const route = match(path);
  main.replaceChildren(route ? route.view(...route.args) : pages.notFound());
  document.title = route && route.title ? `${t(route.title)} · CINENJOY` : 'CINENJOY';
  document.querySelectorAll('[data-nav]').forEach((a) => {
    const on = route && a.dataset.nav === route.nav;
    a.classList.toggle('active', Boolean(on));
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  if (focus) main.focus({ preventScroll: true });
}

function navigate(href) {
  const url = new URL(href, location.href);
  if (url.pathname === location.pathname) return;
  history.pushState({}, '', url.pathname + url.search);
  window.scrollTo(0, 0);
  render({ focus: true });
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  navigate(a.getAttribute('href'));
});

window.addEventListener('popstate', () => render());
document.addEventListener('cinenjoy:navigate', (e) => navigate(e.detail));

langSelect.addEventListener('change', () => setLang(langSelect.value));
onLangChange(() => {
  applyStaticText();
  render();
});

document.getElementById('year').textContent = String(new Date().getFullYear());
applyStaticText();
render();

// A first visit quietly creates an account, so nothing is ever lost
initAccount().catch((err) => console.warn('Account not ready yet', err));
