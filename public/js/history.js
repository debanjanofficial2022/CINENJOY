// Lobby › CineHistory: sourced stories of films that changed the real world,
// and a timeline of cinema through the ages.
import { t, getLang } from './i18n.js';
import { esc } from './ui.js';
import { STORIES, AGES } from './history-data.js';

const pick = (o) => o[getLang()] || o.en;
const host = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

export function historyPage() {
  const node = document.createElement('section');
  node.className = 'page history';
  node.innerHTML = `<header class="page-head">
      <a class="back" href="/lobby" data-link>‹ ${esc(t('nav.lobby'))}</a>
      <h1>${esc(t('lobby.tabs.history')[0])}</h1>
      <p class="lead">${esc(t('hi.lead'))}</p>
    </header>
    <h2 class="group-title">${esc(t('hi.changed'))}</h2>
    <div class="hi-stories">${STORIES.slice()
      .sort((a, b) => a.year - b.year)
      .map(
        (s) => `<article class="hi-story">
          <p class="label">${s.year} · <i>${esc(s.film)}</i></p>
          <h3>${esc(pick(s.title))}</h3>
          <p>${esc(pick(s.text))}</p>
          <p class="hi-source">${esc(t('hi.source'))}: <a href="${esc(s.source)}" target="_blank" rel="noopener">${esc(host(s.source))}</a></p>
        </article>`,
      )
      .join('')}</div>
    <h2 class="group-title">${esc(t('hi.ages'))}</h2>
    <ol class="hi-ages">${AGES.map(
      (a) => `<li><span class="hi-year">${a.year}</span><div><p>${esc(pick(a.text))}</p>
        <p class="hi-source"><a href="${esc(a.source)}" target="_blank" rel="noopener">${esc(t('hi.source'))}: ${esc(host(a.source))}</a></p></div></li>`,
    ).join('')}</ol>
    <p class="fine-print">${esc(t('hi.note'))}</p>`;
  return node;
}
