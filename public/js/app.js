// CINENJOY site shell: routing, language switching, header logo.
import { t, getLang, setLang, onLangChange } from './i18n.js';
import { createLogo } from './logo.js';
import * as pages from './pages.js';
import { listsPage, listPage, joinPage } from './watchlist.js';
import { diaryPage } from './diary.js';
import { suggestionsPage } from './suggest.js';
import { movieNightsPage, movieNightPage, movieNightJoinPage } from './movienight.js';
import { registerLoader } from './loading.js';
import { initAccount } from './data.js';

const routes = {
  '/': { view: pages.home, nav: 'home', title: null },
  '/watchlist': { view: listsPage, nav: 'watchlist', title: 'nav.watchlist' },
  '/games': { view: pages.games, nav: 'games', title: 'nav.games' },
  '/lobby': { view: pages.lobby, nav: 'lobby', title: 'nav.lobby' },
  '/lobby/diary': { view: diaryPage, nav: 'lobby', title: 'diary.title' },
  '/watchlist/suggestions': { view: suggestionsPage, nav: 'watchlist', title: 'sug.title' },
  '/lobby/movie-night': { view: movieNightsPage, nav: 'lobby', title: 'mn.title' },
};

// Addresses with a value in them: /watchlist/<list id>, /join/<invite code>
const patterns = [
  { re: /^\/watchlist\/([0-9a-f-]{36})$/i, view: listPage, nav: 'watchlist', title: 'nav.watchlist' },
  { re: /^\/join\/([A-Za-z0-9]{4,40})$/, view: joinPage, nav: 'watchlist', title: 'nav.watchlist' },
  { re: /^\/lobby\/movie-night\/join\/([A-Za-z0-9]{4,12})$/, view: movieNightJoinPage, nav: 'lobby', title: 'mn.title' },
  { re: /^\/lobby\/movie-night\/([0-9a-f-]{36})$/i, view: movieNightPage, nav: 'lobby', title: 'mn.title' },
  // /games/cinewordle, /games/cinewordle/practice, /games/cinewordle/c/<challenge id>; same for crossword
  { re: /^\/games\/(cinewordle|crossword|frame|cryptic)(?:\/(practice)|\/c\/([0-9a-f-]{36}))?$/i, view: gameView, nav: 'games', title: 'nav.games' },
  // CineQuiz: /games/quiz, /games/quiz/c/<id>, /games/quiz/room/<id>, /games/quiz/join/<code>
  // Movie Impostor: /games/impostor, /games/impostor/room/<id>, /games/impostor/join/<code>
  { re: /^\/games\/impostor(?:\/(room|join)\/([0-9a-f-]{36}|[A-Za-z0-9]{4,12}))?$/i, view: impostorView, nav: 'games', title: 'nav.games' },
  { re: /^\/games\/quiz(?:\/(c|room|join)\/([0-9a-f-]{36}|[A-Za-z0-9]{4,12}))?$/i, view: quizView, nav: 'games', title: 'nav.games' },
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
  const mode = practice ? 'practice' : challengeId ? 'challenge' : 'daily';
  const g = game.toLowerCase();
  const load =
    g === 'cinewordle'
      ? import('./games/wordle.js').then((m) => m.wordlePage(mode, challengeId))
      : g === 'frame'
        ? import('./games/frame.js').then((m) => m.framePage(mode, challengeId))
        : g === 'cryptic'
          ? import('./games/cryptic.js').then((m) => m.crypticPage(mode, challengeId))
          : import('./games/crossword.js').then((m) => m.crosswordPage(mode, challengeId));
  return lazy(load);
}

function quizView(kind, value) {
  return lazy(
    import('./games/quiz.js').then((m) =>
      kind === 'room' ? m.quizRoomPage(value) : kind === 'join' ? m.quizJoinPage(value) : m.quizPage(kind === 'c' ? 'challenge' : 'practice', value),
    ),
  );
}

function impostorView(kind, value) {
  return lazy(import('./games/impostor.js').then((m) => (kind === 'room' ? m.impostorRoom(value) : kind === 'join' ? m.impostorJoin(value) : m.impostorHome())));
}

function lazy(load) {
  const holder = document.createElement('section');
  holder.className = 'page';
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
