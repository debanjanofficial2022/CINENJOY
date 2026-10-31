// Small UI helpers shared by pages: escaping, sheets, toasts, stars.
import { t } from './i18n.js';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function frag(str) {
  const tpl = document.createElement('template');
  tpl.innerHTML = str.trim();
  return tpl.content;
}

export function el(str) {
  return frag(str).firstElementChild;
}

export function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// ---------- Toast ----------

let toastTimer;
export function toast(message, kind = 'info') {
  let box = document.getElementById('toast');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toast';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    document.body.append(box);
  }
  box.textContent = message;
  box.className = `toast show toast-${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove('show'), 2600);
}

// ---------- Sheet (bottom sheet on phones, dialog on desktop) ----------

export function openSheet({ title, body, onClose }) {
  const lastFocus = document.activeElement;
  const wrap = el(`
    <div class="sheet-wrap">
      <div class="sheet-backdrop" data-close></div>
      <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="sheet-head">
          <h2>${esc(title)}</h2>
          <button class="icon-btn" type="button" data-close aria-label="${esc(t('ui.close'))}">✕</button>
        </div>
        <div class="sheet-body"></div>
      </div>
    </div>`);
  wrap.querySelector('.sheet-body').append(body);
  document.body.append(wrap);
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => wrap.classList.add('open'));

  function close() {
    if (!wrap.isConnected) return;
    document.removeEventListener('keydown', onKey);
    wrap.classList.remove('open');
    document.body.classList.remove('no-scroll');
    setTimeout(() => wrap.remove(), 200);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    if (onClose) onClose();
  }
  function onKey(e) {
    if (e.key === 'Escape') close();
  }
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) close();
  });
  const first = wrap.querySelector('.sheet-body input, .sheet-body button, .sheet-body select, .sheet-body textarea');
  setTimeout(() => (first || wrap.querySelector('.sheet')).focus({ preventScroll: true }), 50);
  return close;
}

/** Ask for a line of text in a sheet; resolves with the text or null. */
export function prompt({ title, label, value = '', placeholder = '', submit, max = 80 }) {
  return new Promise((resolve) => {
    let done = false;
    const form = el(`
      <form class="form">
        <label class="field">
          <span>${esc(label)}</span>
          <input type="text" maxlength="${max}" value="${esc(value)}" placeholder="${esc(placeholder)}" required />
        </label>
        <div class="row-end"><button class="btn" type="submit">${esc(submit || t('ui.save'))}</button></div>
      </form>`);
    const close = openSheet({
      title,
      body: form,
      onClose: () => {
        if (!done) resolve(null);
      },
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = form.querySelector('input').value.trim();
      if (!v) return;
      done = true;
      resolve(v);
      close();
    });
  });
}

/** Yes/no question in a sheet. */
export function confirmSheet({ title, body, yes, danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const box = el(`
      <div class="form">
        <p>${esc(body)}</p>
        <div class="row-end">
          <button class="btn btn-ghost" type="button" data-no>${esc(t('ui.cancel'))}</button>
          <button class="btn${danger ? ' btn-danger' : ''}" type="button" data-yes>${esc(yes)}</button>
        </div>
      </div>`);
    const close = openSheet({ title, body: box, onClose: () => !done && resolve(false) });
    box.querySelector('[data-no]').addEventListener('click', () => close());
    box.querySelector('[data-yes]').addEventListener('click', () => {
      done = true;
      resolve(true);
      close();
    });
  });
}

// ---------- Stars ----------

/** Read-only stars for a rating from 0.5 to 5. */
export function starsText(r) {
  if (!r) return '';
  const full = Math.floor(r);
  return '★'.repeat(full) + (r % 1 ? '½' : '');
}

/** Half-star rating input. Click left half of a star for .5. */
export function starInput(value, onChange) {
  const box = el(`<div class="star-input" role="radiogroup" aria-label="${esc(t('rating.label'))}"></div>`);
  let current = Number(value) || 0;
  const render = (shown) => {
    box.innerHTML = '';
    for (let i = 1; i <= 5; i += 1) {
      const fill = shown >= i ? 'full' : shown >= i - 0.5 ? 'half' : 'empty';
      const s = el(`<span class="star ${fill}" aria-hidden="true">★</span>`);
      box.append(s);
    }
    for (let v = 0.5; v <= 5; v += 0.5) {
      const b = el(
        `<button type="button" class="star-hit" role="radio" aria-checked="${v === current}" aria-label="${esc(t('rating.stars', { n: v }))}"
          style="left:${(v - 0.5) * 20}%"></button>`,
      );
      b.addEventListener('mouseenter', () => paint(v));
      b.addEventListener('focus', () => paint(v));
      b.addEventListener('click', () => {
        current = current === v ? 0 : v;
        paint(current);
        onChange(current);
      });
      box.append(b);
    }
  };
  const paint = (shown) => {
    box.querySelectorAll('.star').forEach((s, i) => {
      const n = i + 1;
      s.className = `star ${shown >= n ? 'full' : shown >= n - 0.5 ? 'half' : 'empty'}`;
    });
  };
  box.addEventListener('mouseleave', () => paint(current));
  render(current);
  return box;
}

export function initials(name) {
  const s = String(name || '?').trim();
  return (s[0] || '?').toUpperCase();
}
