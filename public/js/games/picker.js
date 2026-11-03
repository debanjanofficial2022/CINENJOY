// A search box that suggests films and series from TMDB as you type.
// onPick receives a search result ({ media_type, tmdb_id, title, release_date }).
import { t } from '../i18n.js';
import * as tmdb from '../tmdb.js';
import { esc, el, debounce } from '../ui.js';

export function titlePicker(onPick, { placeholder } = {}) {
  const box = el(`<div class="frame-input"><input type="search" maxlength="120" autocomplete="off" aria-label="${esc(t('fg.guessLabel'))}" placeholder="${esc(placeholder || t('fg.placeholder'))}" />
    <ul class="frame-suggest" role="listbox" hidden></ul></div>`);
  const input = box.querySelector('input');
  const list = box.querySelector('ul');
  let results = [];
  let active = -1;
  const paint = () => {
    list.hidden = !results.length;
    list.innerHTML = results
      .map((r, i) => `<li role="option" data-i="${i}" class="${i === active ? 'on' : ''}">${esc(r.title)} <span class="muted">${esc(tmdb.yearOf(r))} · ${esc(t(`medium.${r.media_type === 'tv' ? 'series' : 'film'}`))}</span></li>`)
      .join('');
  };
  const pick = (r) => {
    if (!r) return;
    input.value = '';
    results = [];
    paint();
    onPick(r);
  };
  const lookup = debounce(async () => {
    const q = input.value.trim();
    if (q.length < 2) {
      results = [];
      paint();
      return;
    }
    try {
      const found = (await tmdb.search(q)).slice(0, 6);
      if (input.value.trim() === q) {
        results = found;
        active = -1;
        paint();
      }
    } catch {
      /* keep typing */
    }
  }, 250);
  input.addEventListener('input', lookup);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!results.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
      paint();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results.length) pick(results[Math.max(0, active)]);
    } else if (e.key === 'Escape') {
      results = [];
      paint();
    }
  });
  list.addEventListener('mousedown', (e) => {
    const li = e.target.closest('[data-i]');
    if (li) {
      e.preventDefault();
      pick(results[Number(li.dataset.i)]);
    }
  });
  box.focus = () => input.focus();
  return box;
}
