// CINENJOY site shell: routing, language switching, header logo.
import { t, getLang, setLang, onLangChange } from './i18n.js';
import { createLogo } from './logo.js';
import * as pages from './pages.js';

const routes = {
  '/': { view: pages.home, nav: 'home', title: null },
  '/watchlist': { view: pages.watchlist, nav: 'watchlist', title: 'nav.watchlist' },
  '/games': { view: pages.games, nav: 'games', title: 'nav.games' },
  '/lobby': { view: pages.lobby, nav: 'lobby', title: 'nav.lobby' },
};

const main = document.getElementById('main');
const langSelect = document.getElementById('lang-select');

const firstPath = normalise(location.pathname);
const brandLogo = createLogo({ size: 'sm', autoplay: firstPath !== '/' });
document.getElementById('brand-logo').append(brandLogo.el);

// Other parts of the site call this while they fetch data (step 1b onward).
export const setLoading = (on) => brandLogo.setLoading(on);

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
  const route = routes[path];
  const view = route ? route.view : pages.notFound;
  main.replaceChildren(view());
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

langSelect.addEventListener('change', () => setLang(langSelect.value));
onLangChange(() => {
  applyStaticText();
  render();
});

document.getElementById('year').textContent = String(new Date().getFullYear());
applyStaticText();
render();
