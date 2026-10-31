// Watchlist section: your lists, one list, and joining a shared list.
import { t, getLang } from './i18n.js';
import * as db from './data.js';
import * as tmdb from './tmdb.js';
import { track } from './loading.js';
import { store } from './store.js';
import { esc, el, frag, debounce, toast, openSheet, prompt, confirmSheet, starsText, starInput, initials } from './ui.js';

const go = (href) => document.dispatchEvent(new CustomEvent('cinenjoy:navigate', { detail: href }));

function shell(cls) {
  const s = document.createElement('section');
  s.className = `page ${cls}`;
  return s;
}

const loadingBox = () =>
  el(`<div class="loading-box" role="status"><span class="spinner" aria-hidden="true"></span>${esc(t('ui.loading'))}</div>`);

function errorBox(message, retry) {
  const box = el(`<div class="error-box" role="alert"><p>${esc(message)}</p></div>`);
  if (retry) {
    const b = el(`<button class="btn" type="button">${esc(t('ui.retry'))}</button>`);
    b.addEventListener('click', retry);
    box.append(b);
  }
  return box;
}

function displayName(names) {
  try {
    return new Intl.DisplayNames([getLang()], names);
  } catch {
    return { of: (x) => x };
  }
}
const langName = (code) => (code ? displayName({ type: 'language' }).of(code) || code : '');
const regionName = (code) => (code ? displayName({ type: 'region' }).of(code) || code : '');

/** Today's date where the visitor is, as YYYY-MM-DD */
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const hue = (id) => [...String(id)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
const avatar = (id, name, extra = '') =>
  `<span class="avatar" style="--h:${hue(id)}" title="${esc(name)}">${esc(initials(name))}${extra}</span>`;

async function askName(force = false) {
  const profile = await db.getProfile();
  if (profile.display_name && !force) return profile.display_name;
  const name = await prompt({
    title: t('wl.yourName'),
    label: t('wl.personName'),
    value: profile.display_name || '',
    max: 40,
  });
  if (!name) return null;
  await db.updateProfile({ display_name: name });
  return name;
}

// ===================== All my lists =====================

// Live updates for a page: listen while its node is on screen, stop once it is gone.
function liveWhileShown(node, scope, onChange) {
  const stop = db.watchLive(scope, () => {
    if (node.isConnected) onChange();
  });
  const check = setInterval(() => {
    if (!node.isConnected && node.dataset.liveStarted) {
      clearInterval(check);
      stop();
    }
    if (node.isConnected) node.dataset.liveStarted = '1';
  }, 1000);
}

export function listsPage() {
  const node = shell('wl-lists');
  node.append(
    frag(`<header class="page-head">
      <h1>${esc(t('watchlist.title'))}</h1>
      <p class="lead">${esc(t('watchlist.lead'))}</p>
    </header>`),
  );
  const body = el('<div class="wl-body"></div>');
  node.append(body);

  let lastLists = '';
  async function load(quiet = false) {
    if (!quiet) body.replaceChildren(loadingBox());
    try {
      if (quiet) {
        const lists = await db.myLists();
        const sig = JSON.stringify(lists);
        if (sig !== lastLists && node.isConnected && !node.querySelector('.join-form input:focus')) {
          lastLists = sig;
          render(lists);
        }
        return;
      }
      let lists = await track(db.myLists());
      if (!lists.length) {
        const profile = await db.getProfile();
        if (!(profile.settings && profile.settings.defaultList)) {
          await db.createList({ name: t('wl.defaultName'), emoji: '🎬' });
          await db.updateProfile({ settings: { defaultList: true } });
          lists = await db.myLists();
        }
      }
      lastLists = JSON.stringify(lists);
      if (node.isConnected) render(lists);
    } catch (err) {
      console.warn(err);
      if (!quiet) body.replaceChildren(errorBox(t('errors.offline'), () => load()));
    }
  }

  function render(lists) {
    const cards = lists
      .map((l) => {
        const meta = [
          l.itemCount === 1 ? t('wl.titlesOne') : t('wl.titles', { n: l.itemCount }),
          l.is_shared || l.memberCount > 1 ? `${t('wl.shared')} · ${t('wl.people', { n: l.memberCount })}` : '',
        ]
          .filter(Boolean)
          .join(' · ');
        return `<a class="list-card" href="/watchlist/${esc(l.id)}" data-link>
          <span class="list-emoji" aria-hidden="true">${esc(l.emoji || '🎞️')}</span>
          <span class="list-text">
            <span class="list-name">${esc(l.name)}</span>
            <span class="list-meta">${esc(meta)}</span>
          </span>
          <span class="list-go" aria-hidden="true">›</span>
        </a>`;
      })
      .join('');
    body.replaceChildren(
      frag(`
      <div class="wl-actions">
        <button class="btn" type="button" data-new>+ ${esc(t('wl.newList'))}</button>
        <form class="join-form">
          <label class="sr" for="join-code">${esc(t('wl.join'))}</label>
          <input id="join-code" type="text" maxlength="200" autocomplete="off" placeholder="${esc(t('wl.joinPlaceholder'))}" />
          <button class="btn btn-ghost" type="submit">${esc(t('wl.joinBtn'))}</button>
        </form>
      </div>
      <div class="list-cards">${cards}</div>
      <p class="fine-print"><span class="dot" aria-hidden="true">●</span> ${esc(t('wl.savedNote'))}</p>`),
    );
    body.querySelector('[data-new]').addEventListener('click', async () => {
      const name = await prompt({
        title: t('wl.newListTitle'),
        label: t('wl.nameLabel'),
        placeholder: t('wl.namePlaceholder'),
        submit: t('wl.create'),
      });
      if (!name) return;
      try {
        const list = await track(db.createList({ name, emoji: '🎞️' }));
        go(`/watchlist/${list.id}`);
      } catch (err) {
        console.warn(err);
        toast(t('errors.generic'), 'error');
      }
    });
    body.querySelector('.join-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const raw = e.currentTarget.querySelector('input').value.trim();
      const code = (raw.match(/join\/([A-Za-z0-9]+)/) || [null, raw])[1].replace(/[^A-Za-z0-9]/g, '');
      if (code) go(`/join/${code}`);
    });
  }

  load();
  liveWhileShown(node, null, () => load(true));
  return node;
}

// ===================== One list =====================

const PREFS_KEY = 'wlPrefs';
const defaultPrefs = { group: 'none', view: 'grid', show: 'all', tag: '' };

export function listPage(listId) {
  const node = shell('wl-list');
  const prefs = { ...defaultPrefs, ...(store.get(PREFS_KEY) || {}), tag: '' };
  const savePrefs = () => store.set(PREFS_KEY, { group: prefs.group, view: prefs.view, show: prefs.show });

  let data = null;
  let tags = { tags: [], links: [] };
  let genres = {};

  const head = el('<div class="wl-head"></div>');
  const searchBox = el('<div class="search"></div>');
  const toolbar = el('<div class="toolbar"></div>');
  const itemsBox = el('<div class="items"></div>');
  node.append(head, searchBox, toolbar, itemsBox);
  head.append(loadingBox());

  let lastSig = '';
  let liveOn = false;
  async function load(quiet = false) {
    if (!quiet) head.replaceChildren(loadingBox());
    try {
      const [d, tg, gn] = await track(
        Promise.all([db.getList(listId), db.myTags(), tmdb.genreNames().catch(() => ({}))]),
      );
      if (!node.isConnected) return;
      if (quiet && d && data) {
        const sig = JSON.stringify([d, tg]);
        if (sig === lastSig) return;
        lastSig = sig;
        const before = new Set(data.items.map((i) => i.id));
        const fresh = d.items.filter((i) => !before.has(i.id) && i.added_by !== d.me);
        data = d;
        tags = tg;
        genres = gn;
        renderHead();
        renderToolbar();
        renderItems();
        fresh.forEach((i) => {
          const card = itemsBox.querySelector(`[data-item="${i.id}"]`);
          if (card) card.classList.add('just-added');
        });
        return;
      }
      lastSig = d ? JSON.stringify([d, tg]) : '';
      if (!d) {
        head.replaceChildren(errorBox(t('errors.notFound')));
        searchBox.remove();
        toolbar.remove();
        itemsBox.remove();
        return;
      }
      data = d;
      tags = tg;
      genres = gn;
      document.title = `${data.list.name} · CINENJOY`;
      renderHead();
      if (!quiet) renderSearch();
      renderToolbar();
      renderItems();
      if (!liveOn) {
        liveOn = true;
        liveWhileShown(node, listId, () => {
          // Wait while a sheet is open so nothing jumps under the visitor; the next
          // change or the 20-second check catches up once it closes.
          if (!document.querySelector('.sheet')) load(true);
        });
      }
    } catch (err) {
      console.warn(err);
      if (!quiet) head.replaceChildren(errorBox(t('errors.offline'), () => load()));
      else toast(t('errors.generic'), 'error');
    }
  }
  const refresh = () => load(true);

  // ---------- helpers on the loaded data ----------

  const memberName = (uid) => {
    if (uid === data.me) return t('wl.you');
    const m = data.members.find((x) => x.user_id === uid);
    return (m && m.name) || t('wl.friend');
  };
  const isShared = () => data.list.is_shared || data.members.length > 1;
  const watchedBy = (item) => data.watched.filter((w) => w.item_id === item.id).map((w) => w.user_id);
  const iWatched = (item) => watchedBy(item).includes(data.me);
  const ratingsFor = (item) =>
    data.ratings.filter((r) => r.media_type === item.media_type && r.tmdb_id === item.tmdb_id);
  const myRating = (item) => ratingsFor(item).find((r) => r.user_id === data.me) || null;
  const tagIdsFor = (item) =>
    tags.links.filter((l) => l.media_type === item.media_type && l.tmdb_id === item.tmdb_id).map((l) => l.tag_id);
  const tagName = (id) => (tags.tags.find((x) => x.id === id) || {}).name;

  function groupKeys(item) {
    const meta = item.meta || {};
    const other = [t('wl.other')];
    switch (prefs.group) {
      case 'medium':
        return [t(`medium.${tmdb.mediumOf(item)}`)];
      case 'genre': {
        const g = (meta.genres || []).map((id) => genres[id]).filter(Boolean);
        return g.length ? g : other;
      }
      case 'language':
        return item.original_language ? [langName(item.original_language)] : other;
      case 'country': {
        const c = (meta.countries || []).map(regionName).filter(Boolean);
        return c.length ? c : other;
      }
      case 'decade': {
        const y = Number(tmdb.yearOf(item));
        return y ? [t('wl.decade', { d: Math.floor(y / 10) * 10 })] : other;
      }
      case 'director':
        return meta.directors && meta.directors.length ? meta.directors : other;
      case 'universe':
        return meta.universe ? [meta.universe] : other;
      case 'tag': {
        const n = tagIdsFor(item).map(tagName).filter(Boolean);
        return n.length ? n : other;
      }
      default:
        return [''];
    }
  }

  // ---------- header ----------

  function renderHead() {
    const { list } = data;
    const memberBits = data.members
      .map((m) => avatar(m.user_id, memberName(m.user_id)))
      .join('');
    head.replaceChildren(
      frag(`
      <a class="back" href="/watchlist" data-link>‹ ${esc(t('wl.backToLists'))}</a>
      <div class="wl-title-row">
        <h1><span aria-hidden="true">${esc(list.emoji || '🎞️')}</span> ${esc(list.name)}</h1>
        <div class="wl-buttons">
          <button class="btn" type="button" data-share>${esc(t('wl.share'))}</button>
          <button class="btn btn-ghost" type="button" data-import>${esc(t('imp.button'))}</button>
          ${data.isOwner ? `<button class="btn btn-ghost" type="button" data-rename>${esc(t('wl.rename'))}</button>` : ''}
          ${
            data.isOwner
              ? `<button class="btn btn-ghost btn-danger-text" type="button" data-delete>${esc(t('wl.deleteList'))}</button>`
              : `<button class="btn btn-ghost btn-danger-text" type="button" data-leave>${esc(t('wl.leave'))}</button>`
          }
        </div>
      </div>
      ${
        isShared()
          ? `<div class="members" aria-label="${esc(t('wl.members'))}">${memberBits}<span class="members-text">${esc(
              t('wl.shared'),
            )} · ${esc(t('wl.people', { n: data.members.length }))}</span></div>`
          : ''
      }`),
    );
    head.querySelector('[data-share]').addEventListener('click', openShare);
    head.querySelector('[data-import]').addEventListener('click', openImport);
    const rename = head.querySelector('[data-rename]');
    if (rename)
      rename.addEventListener('click', async () => {
        const name = await prompt({ title: t('wl.renameTitle'), label: t('wl.nameLabel'), value: list.name });
        if (!name) return;
        try {
          data.list = await track(db.updateList(list.id, { name }));
          renderHead();
        } catch (err) {
          console.warn(err);
          toast(t('errors.generic'), 'error');
        }
      });
    const del = head.querySelector('[data-delete]');
    if (del)
      del.addEventListener('click', async () => {
        const ok = await confirmSheet({
          title: t('wl.deleteList'),
          body: t('wl.deleteConfirm', { name: list.name }),
          yes: t('ui.delete'),
          danger: true,
        });
        if (!ok) return;
        try {
          await track(db.deleteList(list.id));
          go('/watchlist');
        } catch (err) {
          console.warn(err);
          toast(t('errors.generic'), 'error');
        }
      });
    const leave = head.querySelector('[data-leave]');
    if (leave)
      leave.addEventListener('click', async () => {
        const ok = await confirmSheet({
          title: t('wl.leave'),
          body: t('wl.leaveConfirm', { name: list.name }),
          yes: t('wl.leave'),
          danger: true,
        });
        if (!ok) return;
        try {
          await track(db.leaveList(list.id));
          go('/watchlist');
        } catch (err) {
          console.warn(err);
          toast(t('errors.generic'), 'error');
        }
      });
  }

  async function openShare() {
    try {
      const name = await askName();
      if (!name) return;
      if (!data.list.invite_code) data.list = await track(db.shareList(data.list.id));
      const link = `${location.origin}/join/${data.list.invite_code}`;
      const box = el(`
        <div class="form share-box">
          <p>${esc(t('wl.shareBody'))}</p>
          <label class="field"><span>${esc(t('wl.inviteLink'))}</span>
            <input type="text" readonly value="${esc(link)}" /></label>
          <p class="fine-print">${esc(t('wl.inviteCode'))}: <strong class="code">${esc(data.list.invite_code)}</strong></p>
          <div class="row-end">
            ${navigator.share ? `<button class="btn btn-ghost" type="button" data-native>${esc(t('wl.shareNative'))}</button>` : ''}
            <button class="btn" type="button" data-copy>${esc(t('wl.copyLink'))}</button>
          </div>
        </div>`);
      openSheet({ title: t('wl.shareTitle'), body: box, onClose: () => refresh() });
      const input = box.querySelector('input');
      input.addEventListener('focus', () => input.select());
      box.querySelector('[data-copy]').addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(link);
        } catch {
          input.select();
          document.execCommand('copy');
        }
        toast(t('wl.linkCopied'));
      });
      const native = box.querySelector('[data-native]');
      if (native)
        native.addEventListener('click', () =>
          navigator.share({ title: 'CINENJOY', text: t('wl.shareText', { name: data.list.name }), url: link }).catch(() => {}),
        );
    } catch (err) {
      console.warn(err);
      toast(t('errors.generic'), 'error');
    }
  }

  // ---------- import from a link or pasted text ----------

  function openImport() {
    let mode = 'link';
    let found = [];
    const box = el(`
      <div class="import">
        <div class="seg seg-wide" role="group">
          <button type="button" data-mode="link" aria-pressed="true">${esc(t('imp.fromLink'))}</button>
          <button type="button" data-mode="text" aria-pressed="false">${esc(t('imp.fromText'))}</button>
        </div>
        <form class="form" data-form>
          <label class="field" data-link-field><span>${esc(t('imp.linkLabel'))}</span>
            <input type="url" inputmode="url" autocomplete="off" placeholder="${esc(t('imp.linkPlaceholder'))}" /></label>
          <label class="field" data-text-field hidden><span>${esc(t('imp.textLabel'))}</span>
            <textarea rows="6" maxlength="20000" placeholder="${esc(t('imp.textPlaceholder'))}"></textarea></label>
          <p class="fine-print">${esc(t('imp.hint'))}</p>
          <div class="row-end"><button class="btn" type="submit">${esc(t('imp.find'))}</button></div>
        </form>
        <div data-status aria-live="polite"></div>
        <div data-results></div>
      </div>`);
    const form = box.querySelector('[data-form]');
    const status = box.querySelector('[data-status]');
    const resultsBox = box.querySelector('[data-results]');
    const urlInput = box.querySelector('input[type=url]');
    const textInput = box.querySelector('textarea');

    const setMode = (m) => {
      mode = m;
      box.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
      box.querySelector('[data-link-field]').hidden = m !== 'link';
      box.querySelector('[data-text-field]').hidden = m !== 'text';
      (m === 'link' ? urlInput : textInput).focus();
    };
    box.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

    const close = openSheet({ title: t('imp.title'), body: box });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = { lang: getLang() };
      if (mode === 'link') {
        let u = urlInput.value.trim();
        if (!u) return;
        if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
        payload.url = u;
      } else {
        const txt = textInput.value.trim();
        if (!txt) return;
        payload.text = txt;
      }
      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      resultsBox.replaceChildren();
      status.replaceChildren(loadingBoxWith(t('imp.reading')));
      try {
        const res = await track(
          fetch('/api/import', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          }).then((r) => r.json()),
        );
        if (!res.ok) {
          const msg = t(`imp.errors.${res.error}`);
          showError(msg.startsWith('imp.') ? t('errors.generic') : msg, res.error === 'blocked');
          return;
        }
        found = res.results || [];
        renderFound(res);
      } catch (err) {
        console.warn(err);
        showError(t('errors.generic'));
      } finally {
        btn.disabled = false;
      }
    });

    function loadingBoxWith(text) {
      return el(`<div class="loading-box" role="status"><span class="spinner" aria-hidden="true"></span>${esc(text)}</div>`);
    }

    function showError(msg, offerText = false) {
      const err = el(`<div class="error-box" role="alert"><p>${esc(msg)}</p></div>`);
      if (offerText) {
        const b = el(`<button class="btn btn-ghost" type="button">${esc(t('imp.switchToText'))}</button>`);
        b.addEventListener('click', () => {
          status.replaceChildren();
          setMode('text');
        });
        err.append(b);
      }
      status.replaceChildren(err);
    }

    function renderFound(res) {
      status.replaceChildren();
      if (!found.length) {
        showError(res.note === 'no_captions' ? `${t('imp.notes.no_captions')} ${t('imp.none')}` : t('imp.none'), mode === 'link');
        return;
      }
      const have = new Set(data.items.map((i) => `${i.media_type}:${i.tmdb_id}`));
      const summary =
        res.source && res.source.title
          ? t('imp.found', { n: found.length, source: res.source.title })
          : t('imp.foundText', { n: found.length });
      const rows = found
        .map((r, i) => {
          const inList = have.has(`${r.media_type}:${r.tmdb_id}`);
          const img = tmdb.poster(r.poster_path, 'w92');
          const orig = r.original_title && r.original_title !== r.title ? r.original_title : '';
          const meta = [tmdb.yearOf(r), t(`medium.${tmdb.mediumOf(r)}`)].filter(Boolean).join(' · ');
          return `<label class="pick${inList ? ' is-in' : ''}">
            <input type="checkbox" data-i="${i}" ${inList ? 'disabled' : r.confidence === 'high' ? 'checked' : ''} />
            <span class="thumb">${img ? `<img src="${esc(img)}" alt="" loading="lazy" />` : ''}</span>
            <span class="result-text">
              <span class="result-title">${esc(r.title)}${r.confidence === 'maybe' ? ` <span class="chip chip-maybe">${esc(t('imp.maybe'))}</span>` : ''}</span>
              ${orig ? `<span class="result-orig" lang="${esc(r.original_language)}">${esc(orig)}</span>` : ''}
              <span class="result-meta">${esc(meta)}</span>
              ${inList ? `<span class="result-meta">${esc(t('imp.inList'))}</span>` : ''}
              ${r.confidence === 'maybe' && r.found ? `<span class="result-meta">${esc(t('imp.foundAs', { t: r.found }))}</span>` : ''}
            </span>
          </label>`;
        })
        .join('');
      const note = res.note && t(`imp.notes.${res.note}`).startsWith('imp.') === false ? `<p class="fine-print">${esc(t(`imp.notes.${res.note}`))}</p>` : '';
      resultsBox.replaceChildren(
        frag(`
        <p class="import-summary">${esc(summary)}</p>
        ${note}
        <div class="row-start">
          <button type="button" class="link-btn" data-all>${esc(t('imp.selectAll'))}</button>
          <button type="button" class="link-btn" data-none>${esc(t('imp.selectNone'))}</button>
        </div>
        <div class="picks">${rows}</div>
        <div class="import-foot"><button class="btn" type="button" data-add></button></div>`),
      );
      const boxes = [...resultsBox.querySelectorAll('input[type=checkbox]')];
      const addBtn = resultsBox.querySelector('[data-add]');
      const update = () => {
        const n = boxes.filter((b) => b.checked).length;
        addBtn.textContent = n === 1 ? t('imp.addOne') : t('imp.add', { n });
        addBtn.disabled = n === 0;
      };
      boxes.forEach((b) => b.addEventListener('change', update));
      resultsBox.querySelector('[data-all]').addEventListener('click', () => {
        boxes.forEach((b) => {
          if (!b.disabled) b.checked = true;
        });
        update();
      });
      resultsBox.querySelector('[data-none]').addEventListener('click', () => {
        boxes.forEach((b) => (b.checked = false));
        update();
      });
      update();

      addBtn.addEventListener('click', async () => {
        const chosen = boxes.filter((b) => b.checked).map((b) => found[Number(b.dataset.i)]);
        if (!chosen.length) return;
        addBtn.disabled = true;
        boxes.forEach((b) => (b.disabled = true));
        let done = 0;
        await track(
          (async () => {
            for (const r of chosen) {
              addBtn.textContent = t('imp.adding', { i: done + 1, n: chosen.length });
              try {
                const full = await tmdb.details(r.media_type, r.tmdb_id);
                await db.addItem(data.list.id, full);
                done += 1;
              } catch (err) {
                if (err && err.code === '23505') done += 1;
                else console.warn(err);
              }
            }
          })(),
        );
        toast(t('imp.added', { n: done }));
        close();
        refresh();
      });
    }

    setTimeout(() => urlInput.focus(), 60);
  }

  // ---------- search and add ----------

  function renderSearch() {
    searchBox.replaceChildren(
      frag(`
      <label class="sr" for="title-search">${esc(t('wl.searchLabel'))}</label>
      <div class="search-field">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 3a7 7 0 0 1 5.6 11.2l4.6 4.6-1.4 1.4-4.6-4.6A7 7 0 1 1 10 3Zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z"/></svg>
        <input id="title-search" type="search" autocomplete="off" enterkeyhint="search" placeholder="${esc(t('wl.searchPlaceholder'))}" />
      </div>
      <div class="results" hidden></div>`),
    );
    const input = searchBox.querySelector('input');
    const results = searchBox.querySelector('.results');
    let seq = 0;

    const run = debounce(async () => {
      const q = input.value.trim();
      const mine = ++seq;
      if (q.length < 2) {
        results.hidden = true;
        return;
      }
      results.hidden = false;
      results.replaceChildren(el(`<p class="muted">${esc(t('wl.searching'))}</p>`));
      try {
        const found = await tmdb.search(q);
        if (mine !== seq) return;
        showResults(found);
      } catch (err) {
        console.warn(err);
        if (mine === seq) results.replaceChildren(el(`<p class="muted">${esc(t('errors.search'))}</p>`));
      }
    }, 320);

    function showResults(found) {
      if (!found.length) {
        results.replaceChildren(el(`<p class="muted">${esc(t('wl.noResults'))}</p>`));
        return;
      }
      const have = new Set(data.items.map((i) => `${i.media_type}:${i.tmdb_id}`));
      results.replaceChildren();
      for (const r of found.slice(0, 12)) {
        const key = `${r.media_type}:${r.tmdb_id}`;
        const added = have.has(key);
        const img = tmdb.poster(r.poster_path, 'w92');
        const orig = r.original_title && r.original_title !== r.title ? r.original_title : '';
        const row = el(`
          <div class="result">
            <span class="thumb">${img ? `<img src="${esc(img)}" alt="" loading="lazy" />` : ''}</span>
            <span class="result-text">
              <span class="result-title">${esc(r.title)}</span>
              ${orig ? `<span class="result-orig" lang="${esc(r.original_language)}">${esc(orig)}</span>` : ''}
              <span class="result-meta">${esc([tmdb.yearOf(r), t(`medium.${tmdb.mediumOf(r)}`)].filter(Boolean).join(' · '))}</span>
            </span>
            <button class="btn btn-small${added ? ' is-added' : ''}" type="button" ${added ? 'disabled' : ''}>
              ${esc(added ? `✓ ${t('wl.added')}` : `+ ${t('wl.add')}`)}</button>
          </div>`);
        const btn = row.querySelector('button');
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            const full = await track(tmdb.details(r.media_type, r.tmdb_id));
            await track(db.addItem(data.list.id, full));
            btn.classList.add('is-added');
            btn.textContent = `✓ ${t('wl.added')}`;
            toast(t('wl.addedToast', { list: data.list.name }));
            refresh();
          } catch (err) {
            if (err && err.code === '23505') {
              btn.classList.add('is-added');
              btn.textContent = `✓ ${t('wl.added')}`;
              return;
            }
            console.warn(err);
            btn.disabled = false;
            toast(t('errors.generic'), 'error');
          }
        });
        results.append(row);
      }
    }

    input.addEventListener('input', run);
    input.addEventListener('focus', () => {
      if (input.value.trim().length >= 2 && results.childElementCount) results.hidden = false;
    });
    // Escape anywhere in the search, or a click outside it, closes the results
    searchBox.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        results.hidden = true;
        input.focus();
      }
    });
    const outside = (e) => {
      if (!searchBox.isConnected) return document.removeEventListener('pointerdown', outside);
      if (!searchBox.contains(e.target)) results.hidden = true;
    };
    document.addEventListener('pointerdown', outside);
  }

  // ---------- toolbar ----------

  function renderToolbar() {
    const groups = ['none', 'medium', 'genre', 'language', 'country', 'decade', 'director', 'universe', 'tag'];
    const usedTags = tags.tags.filter((tg) =>
      data.items.some((i) => tagIdsFor(i).includes(tg.id)),
    );
    toolbar.replaceChildren(
      frag(`
      <label class="tool"><span>${esc(t('wl.groupBy'))}</span>
        <select data-group>${groups
          .map((g) => `<option value="${g}"${prefs.group === g ? ' selected' : ''}>${esc(t(`groups.${g}`))}</option>`)
          .join('')}</select></label>
      <label class="tool"><span>${esc(t('wl.show'))}</span>
        <select data-show>${['all', 'unwatched', 'watched']
          .map((s) => `<option value="${s}"${prefs.show === s ? ' selected' : ''}>${esc(t(`wl.${s}`))}</option>`)
          .join('')}</select></label>
      <div class="seg" role="group" aria-label="${esc(t('wl.view'))}">
        <button type="button" data-view="grid" aria-pressed="${prefs.view === 'grid'}">${esc(t('wl.grid'))}</button>
        <button type="button" data-view="compact" aria-pressed="${prefs.view === 'compact'}">${esc(t('wl.compact'))}</button>
      </div>
      ${
        usedTags.length
          ? `<div class="chips" role="group" aria-label="${esc(t('wl.filterTags'))}">${usedTags
              .map(
                (tg) =>
                  `<button type="button" class="chip-btn" data-tag="${esc(tg.id)}" aria-pressed="${prefs.tag === tg.id}"># ${esc(tg.name)}</button>`,
              )
              .join('')}</div>`
          : ''
      }`),
    );
    toolbar.querySelector('[data-group]').addEventListener('change', (e) => {
      prefs.group = e.target.value;
      savePrefs();
      renderItems();
    });
    toolbar.querySelector('[data-show]').addEventListener('change', (e) => {
      prefs.show = e.target.value;
      savePrefs();
      renderItems();
    });
    toolbar.querySelectorAll('[data-view]').forEach((b) =>
      b.addEventListener('click', () => {
        prefs.view = b.dataset.view;
        savePrefs();
        renderToolbar();
        renderItems();
      }),
    );
    toolbar.querySelectorAll('[data-tag]').forEach((b) =>
      b.addEventListener('click', () => {
        prefs.tag = prefs.tag === b.dataset.tag ? '' : b.dataset.tag;
        renderToolbar();
        renderItems();
      }),
    );
  }

  // ---------- items ----------

  function itemHtml(item) {
    const title = tmdb.displayTitle(item);
    const orig = item.original_title && item.original_title !== title ? item.original_title : '';
    const img = tmdb.poster(item.poster_path, prefs.view === 'grid' ? 'w342' : 'w92');
    const mine = myRating(item);
    const meta = [tmdb.yearOf(item), t(`medium.${tmdb.mediumOf(item)}`)].filter(Boolean).join(' · ');
    const others = isShared()
      ? ratingsFor(item)
          .filter((r) => r.user_id !== data.me && r.rating)
          .map((r) => avatar(r.user_id, memberName(r.user_id), `<b>${r.rating}</b>`))
          .join('')
      : '';
    const watched = iWatched(item);
    const addedBy =
      isShared() && item.added_by ? `<span class="pc-by">${esc(t('wl.addedBy', { name: memberName(item.added_by) }))}</span>` : '';
    if (prefs.view === 'compact') {
      return `<button type="button" class="row-card" data-item="${esc(item.id)}">
        <span class="thumb">${img ? `<img src="${esc(img)}" alt="" loading="lazy" />` : ''}</span>
        <span class="row-text">
          <span class="pc-title">${esc(title)}</span>
          ${orig ? `<span class="pc-orig" lang="${esc(item.original_language)}">${esc(orig)}</span>` : ''}
          <span class="pc-meta">${esc(meta)}</span>
          ${addedBy}
        </span>
        <span class="row-side">
          ${mine && mine.rating ? `<span class="pc-stars" aria-label="${esc(t('rating.stars', { n: mine.rating }))}">${starsText(mine.rating)}</span>` : ''}
          ${others ? `<span class="pc-others">${others}</span>` : ''}
          ${watched ? `<span class="watched-mark" title="${esc(t('item.watched'))}">✓</span>` : ''}
        </span>
      </button>`;
    }
    return `<button type="button" class="poster-card" data-item="${esc(item.id)}">
      <span class="poster">
        ${img ? `<img src="${esc(img)}" alt="" loading="lazy" />` : `<span class="poster-blank">${esc(title)}</span>`}
        ${watched ? `<span class="watched-badge" title="${esc(t('item.watched'))}">✓</span>` : ''}
      </span>
      <span class="pc-title">${esc(title)}</span>
      ${orig ? `<span class="pc-orig" lang="${esc(item.original_language)}">${esc(orig)}</span>` : ''}
      <span class="pc-meta">${esc(meta)}</span>
      ${mine && mine.rating ? `<span class="pc-stars" aria-label="${esc(t('rating.stars', { n: mine.rating }))}">${starsText(mine.rating)}</span>` : ''}
      ${others ? `<span class="pc-others">${others}</span>` : ''}
      ${addedBy}
    </button>`;
  }

  function renderItems() {
    if (!data.items.length) {
      itemsBox.replaceChildren(el(`<p class="empty">${esc(t('wl.empty'))}</p>`));
      return;
    }
    let items = data.items;
    if (prefs.show === 'watched') items = items.filter(iWatched);
    if (prefs.show === 'unwatched') items = items.filter((i) => !iWatched(i));
    if (prefs.tag) items = items.filter((i) => tagIdsFor(i).includes(prefs.tag));
    if (!items.length) {
      itemsBox.replaceChildren(el(`<p class="empty">${esc(t('wl.emptyFilter'))}</p>`));
      return;
    }

    const groups = new Map();
    for (const item of items) {
      for (const key of groupKeys(item)) {
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
      }
    }
    const other = t('wl.other');
    let entries = [...groups.entries()];
    if (prefs.group === 'decade') entries.sort((a, b) => (a[0] === other) - (b[0] === other) || b[0].localeCompare(a[0]));
    else if (prefs.group !== 'none')
      entries.sort((a, b) => (a[0] === other) - (b[0] === other) || b[1].length - a[1].length || a[0].localeCompare(b[0]));

    const cls = prefs.view === 'grid' ? 'poster-grid' : 'row-list';
    itemsBox.innerHTML = entries
      .map(
        ([key, list]) => `
        <section class="group">
          ${key ? `<h2 class="group-title">${esc(key)} <span>${list.length}</span></h2>` : ''}
          <div class="${cls}">${list.map(itemHtml).join('')}</div>
        </section>`,
      )
      .join('');
    itemsBox.querySelectorAll('[data-item]').forEach((b) =>
      b.addEventListener('click', () => openItem(data.items.find((i) => i.id === b.dataset.item))),
    );
  }

  // ---------- one title: rating, watched, note, tags ----------

  function openItem(item) {
    if (!item) return;
    let dirty = false;
    const title = tmdb.displayTitle(item);
    const meta = item.meta || {};
    const orig = item.original_title && item.original_title !== title ? item.original_title : '';
    const img = tmdb.poster(item.poster_path, 'w185');
    const facts = [
      tmdb.yearOf(item),
      t(`medium.${tmdb.mediumOf(item)}`),
      ...(meta.genres || []).slice(0, 3).map((id) => genres[id]).filter(Boolean),
      item.original_language ? langName(item.original_language) : '',
      meta.runtime && item.media_type === 'movie' ? t('item.minutes', { n: meta.runtime }) : '',
      meta.episodes ? t('item.episodes', { n: meta.episodes }) : '',
    ].filter(Boolean);
    const mine = myRating(item) || {};
    const canRemove = data.isOwner || item.added_by === data.me;

    const body = el(`
      <div class="item-sheet">
        <div class="item-top">
          <span class="thumb thumb-lg">${img ? `<img src="${esc(img)}" alt="" />` : ''}</span>
          <div>
            <h3>${esc(title)}</h3>
            ${orig ? `<p class="pc-orig" lang="${esc(item.original_language)}">${esc(t('item.original'))}: ${esc(orig)}</p>` : ''}
            <p class="pc-meta">${esc(facts.join(' · '))}</p>
            ${
              meta.directors && meta.directors.length
                ? `<p class="pc-meta">${esc(item.media_type === 'movie' ? t('item.director') : t('item.creator'))}: ${esc(meta.directors.join(', '))}</p>`
                : ''
            }
            ${meta.cast && meta.cast.length ? `<p class="pc-meta">${esc(t('item.cast'))}: ${esc(meta.cast.slice(0, 4).join(', '))}</p>` : ''}
          </div>
        </div>

        <div class="item-block">
          <div class="label-row"><span class="label">${esc(t('item.rating'))}</span>
            <button type="button" class="link-btn" data-clear>${esc(t('item.clear'))}</button></div>
          <div data-stars></div>
        </div>

        <div class="item-block item-two">
          <button type="button" class="btn ${iWatched(item) ? '' : 'btn-ghost'}" data-watched aria-pressed="${iWatched(item)}">
            ${esc(iWatched(item) ? `✓ ${t('item.watched')}` : t('item.markWatched'))}</button>
          <label class="field field-inline"><span>${esc(t('item.watchedOn'))}</span>
            <input type="date" data-date value="${esc(mine.watched_on || '')}" max="${today()}" /></label>
        </div>

        <label class="field item-block"><span>${esc(t('item.note'))}</span>
          <textarea rows="2" maxlength="1000" data-note placeholder="${esc(t('item.notePlaceholder'))}">${esc(mine.note || '')}</textarea></label>
        <p class="save-state muted" aria-live="polite"></p>

        <div class="item-block">
          <span class="label">${esc(t('item.tags'))}</span>
          <div class="chips" data-tags></div>
          <form class="tag-form" data-tagform>
            <input type="text" maxlength="40" placeholder="${esc(t('item.newTag'))}" aria-label="${esc(t('item.newTag'))}" />
            <button class="btn btn-small btn-ghost" type="submit">${esc(t('item.addTag'))}</button>
          </form>
        </div>

        ${
          isShared()
            ? `<div class="item-block"><span class="label">${esc(t('item.everyone'))}</span><div data-everyone></div></div>`
            : ''
        }
        ${canRemove ? `<div class="item-block"><button type="button" class="link-btn danger" data-remove>${esc(t('item.remove'))}</button></div>` : ''}
      </div>`);

    const state = {
      rating: mine.rating ? Number(mine.rating) : 0,
      note: mine.note || '',
      watched_on: mine.watched_on || '',
    };
    const saveState = body.querySelector('.save-state');

    const persist = async () => {
      try {
        saveState.textContent = '…';
        const row = await track(db.saveRating(item, state));
        data.ratings = data.ratings.filter(
          (r) => !(r.user_id === data.me && r.media_type === item.media_type && r.tmdb_id === item.tmdb_id),
        );
        if (row) data.ratings.push(row);
        dirty = true;
        saveState.textContent = `✓ ${t('item.saved')}`;
        renderEveryone();
      } catch (err) {
        console.warn(err);
        saveState.textContent = t('errors.generic');
      }
    };

    const starsSlot = body.querySelector('[data-stars]');
    const mountStars = () =>
      starsSlot.replaceChildren(
        starInput(state.rating, (v) => {
          state.rating = v;
          persist();
        }),
      );
    mountStars();
    body.querySelector('[data-clear]').addEventListener('click', () => {
      state.rating = 0;
      mountStars();
      persist();
    });

    const dateInput = body.querySelector('[data-date]');
    dateInput.addEventListener('change', () => {
      state.watched_on = dateInput.value;
      persist();
    });
    const note = body.querySelector('[data-note]');
    const saveNote = debounce(() => {
      state.note = note.value;
      persist();
    }, 700);
    note.addEventListener('input', saveNote);

    const wBtn = body.querySelector('[data-watched]');
    wBtn.addEventListener('click', async () => {
      const on = !iWatched(item);
      wBtn.disabled = true;
      try {
        await track(db.setWatched(item.id, on));
        if (on) data.watched.push({ item_id: item.id, user_id: data.me });
        else data.watched = data.watched.filter((w) => !(w.item_id === item.id && w.user_id === data.me));
        dirty = true;
        wBtn.className = `btn ${on ? '' : 'btn-ghost'}`;
        wBtn.setAttribute('aria-pressed', String(on));
        wBtn.textContent = on ? `✓ ${t('item.watched')}` : t('item.markWatched');
        if (on && !state.watched_on) {
          state.watched_on = today();
          dateInput.value = state.watched_on;
          persist();
        }
      } catch (err) {
        console.warn(err);
        toast(t('errors.generic'), 'error');
      } finally {
        wBtn.disabled = false;
      }
    });

    const tagBox = body.querySelector('[data-tags]');
    const renderTags = () => {
      const on = tagIdsFor(item);
      tagBox.innerHTML = tags.tags
        .map(
          (tg) =>
            `<button type="button" class="chip-btn" data-tag="${esc(tg.id)}" aria-pressed="${on.includes(tg.id)}"># ${esc(tg.name)}</button>`,
        )
        .join('');
      tagBox.querySelectorAll('[data-tag]').forEach((b) =>
        b.addEventListener('click', async () => {
          const id = b.dataset.tag;
          const turnOn = !tagIdsFor(item).includes(id);
          try {
            await track(db.setTitleTag(id, item, turnOn));
            if (turnOn) tags.links.push({ tag_id: id, media_type: item.media_type, tmdb_id: item.tmdb_id });
            else
              tags.links = tags.links.filter(
                (l) => !(l.tag_id === id && l.media_type === item.media_type && l.tmdb_id === item.tmdb_id),
              );
            dirty = true;
            renderTags();
          } catch (err) {
            console.warn(err);
            toast(t('errors.generic'), 'error');
          }
        }),
      );
    };
    renderTags();
    body.querySelector('[data-tagform]').addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = e.currentTarget.querySelector('input');
      const name = input.value.trim();
      if (!name) return;
      try {
        let tag = tags.tags.find((x) => x.name.toLowerCase() === name.toLowerCase());
        if (!tag) {
          tag = await track(db.createTag(name));
          tags.tags.push(tag);
          tags.tags.sort((a, b) => a.name.localeCompare(b.name));
        }
        if (!tagIdsFor(item).includes(tag.id)) {
          await track(db.setTitleTag(tag.id, item, true));
          tags.links.push({ tag_id: tag.id, media_type: item.media_type, tmdb_id: item.tmdb_id });
        }
        input.value = '';
        dirty = true;
        renderTags();
      } catch (err) {
        console.warn(err);
        toast(t('errors.generic'), 'error');
      }
    });

    function renderEveryone() {
      const box = body.querySelector('[data-everyone]');
      if (!box) return;
      const rows = ratingsFor(item).filter((r) => r.rating || r.note);
      box.innerHTML = rows.length
        ? rows
            .map(
              (r) => `<div class="everyone-row">
            ${avatar(r.user_id, memberName(r.user_id))}
            <span class="everyone-name">${esc(memberName(r.user_id))}</span>
            <span class="pc-stars">${r.rating ? starsText(Number(r.rating)) : ''}</span>
            ${r.note ? `<span class="everyone-note">${esc(r.note)}</span>` : ''}
          </div>`,
            )
            .join('')
        : `<p class="muted">${esc(t('item.noRatings'))}</p>`;
    }
    renderEveryone();

    const close = openSheet({
      title,
      body,
      onClose: () => {
        if (dirty) {
          renderToolbar();
          renderItems();
        }
      },
    });

    const remove = body.querySelector('[data-remove]');
    if (remove)
      remove.addEventListener('click', async () => {
        try {
          await track(db.removeItem(item.id));
          data.items = data.items.filter((i) => i.id !== item.id);
          dirty = true;
          close();
          toast(t('wl.removedToast'));
        } catch (err) {
          console.warn(err);
          toast(t('errors.generic'), 'error');
        }
      });
  }

  load();
  return node;
}

// ===================== Join a shared list =====================

export function joinPage(code) {
  const node = shell('wl-join');
  const body = el('<div class="join-card"></div>');
  node.append(body);

  async function load() {
    body.replaceChildren(loadingBox());
    try {
      const [preview, profile] = await track(Promise.all([db.invitePreview(code), db.getProfile()]));
      if (!node.isConnected) return;
      if (!preview) {
        body.replaceChildren(
          frag(`<h1>${esc(t('join.title'))}</h1><p class="lead">${esc(t('join.notFound'))}</p>
            <p><a class="btn" href="/watchlist" data-link>${esc(t('wl.backToLists'))}</a></p>`),
        );
        return;
      }
      body.replaceChildren(
        frag(`
        <p class="kicker">${esc(t('join.title'))}</p>
        <div class="join-emoji" aria-hidden="true">${esc(preview.emoji || '🎞️')}</div>
        <h1>${esc(preview.name)}</h1>
        <p class="lead">${esc(t('join.body', { name: preview.name, items: preview.items, people: preview.members }))}</p>
        <form class="form join-go">
          <label class="field"><span>${esc(t('wl.yourName'))}</span>
            <input type="text" maxlength="40" required value="${esc(profile.display_name || '')}" placeholder="${esc(t('wl.personName'))}" /></label>
          <button class="btn" type="submit">${esc(t('join.btn'))}</button>
        </form>`),
      );
      body.querySelector('form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = e.currentTarget.querySelector('input').value.trim();
        if (!name) return;
        const btn = e.currentTarget.querySelector('button');
        btn.disabled = true;
        try {
          if (name !== profile.display_name) await db.updateProfile({ display_name: name });
          const listId = await track(db.joinList(code));
          toast(t('join.joined', { name: preview.name }));
          go(`/watchlist/${listId}`);
        } catch (err) {
          console.warn(err);
          btn.disabled = false;
          toast(t('errors.generic'), 'error');
        }
      });
    } catch (err) {
      console.warn(err);
      body.replaceChildren(errorBox(t('errors.offline'), load));
    }
  }

  load();
  return node;
}
