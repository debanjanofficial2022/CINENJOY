// Lobby › Movie Night: friends swipe through a shortlist built from their
// lists; a title everyone likes is a match. Shows where to stream it, lets you
// set a date, and if nobody matches, a quick vote or a spin of the wheel decides.
import { t, getLang } from './i18n.js';
import * as db from './data.js';
import * as tmdb from './tmdb.js';
import { track } from './loading.js';
import { store } from './store.js';
import { esc, el, frag, toast, openSheet, confirmSheet } from './ui.js';
import { createRoom, joinRoom, getRoom, myRooms, roomPeople, patchRoom, leaveRoom, reportRoom, liveRoom, whilePresent, ensureRoomName, me } from './rooms.js';

const go = (href) => document.dispatchEvent(new CustomEvent('cinenjoy:navigate', { detail: href }));
const keyOf = (i) => `${i.media_type}:${i.tmdb_id}`;
const MAX_ITEMS = 30;

function loadingBox() {
  return el(`<div class="loading-box"><span class="spinner"></span>${esc(t('ui.loading'))}</div>`);
}
function errorBox(msg) {
  return el(`<div class="error-box"><p>${esc(msg)}</p></div>`);
}
const hue = (id) => [...String(id)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
const avatar = (p, online) =>
  `<span class="avatar${online ? ' online' : ''}" style="--h:${hue(p.user_id)}" title="${esc(p.me ? t('wl.you') : p.name || t('wl.friend'))}">${esc(
    ((p.me ? t('wl.you') : p.name) || '?').slice(0, 1).toUpperCase(),
  )}</span>`;

// ---------- Where to watch ----------

const REGIONS = ['US', 'GB', 'IN', 'CA', 'AU', 'IE', 'DE', 'FR', 'ES', 'IT', 'MX', 'AR', 'CO', 'CL', 'BR', 'JP', 'KR', 'TW', 'HK', 'SG', 'MY', 'PH', 'ID', 'TH', 'NZ', 'NL', 'SE', 'NO', 'DK', 'PL', 'TR', 'ZA'];
export function myRegion() {
  const saved = store.get('watchRegion');
  if (saved && REGIONS.includes(saved)) return saved;
  for (const l of navigator.languages || [navigator.language || '']) {
    const r = String(l).split('-')[1];
    if (r && REGIONS.includes(r.toUpperCase())) return r.toUpperCase();
  }
  return 'US';
}

function regionName(code) {
  try {
    return new Intl.DisplayNames([getLang()], { type: 'region' }).of(code) || code;
  } catch {
    return code;
  }
}

const providerCache = new Map();
async function providers(item, region) {
  const k = `${keyOf(item)}:${region}`;
  if (!providerCache.has(k)) {
    providerCache.set(
      k,
      fetch(`/api/tmdb?${new URLSearchParams({ path: `${item.media_type}/${item.tmdb_id}/watch/providers` })}`)
        .then((r) => (r.ok ? r.json() : {}))
        .then((d) => {
          const here = (d.results || {})[region] || {};
          const seen = new Set();
          const list = (kind) =>
            (here[kind] || [])
              .filter((p) => !seen.has(p.provider_id) && seen.add(p.provider_id))
              .slice(0, 5)
              .map((p) => ({ name: p.provider_name, logo: p.logo_path, kind }));
          return { stream: [...list('flatrate'), ...list('free'), ...list('ads')], rent: list('rent'), buy: list('buy'), link: here.link || null };
        })
        .catch(() => ({ stream: [], rent: [], buy: [], link: null })),
    );
  }
  return providerCache.get(k);
}

async function whereHtml(item, { compact = false } = {}) {
  const region = myRegion();
  const full = await providers(item, region);
  // On the swipe card: streaming only, a few logos
  const p = compact ? { ...full, stream: full.stream.slice(0, 4), rent: full.stream.length ? [] : full.rent.slice(0, 3), buy: [] } : full;
  const chips = (list) =>
    list
      .map(
        (x) => `<span class="prov" title="${esc(x.name)}">${x.logo ? `<img src="${esc(tmdb.poster(x.logo, 'w45'))}" alt="" />` : ''}${esc(x.name)}</span>`,
      )
      .join('');
  if (!p.stream.length && !p.rent.length && !p.buy.length) return `<p class="muted where-none">${esc(t('mn.notStreaming'))}</p>`;
  return `<div class="where">
    ${p.stream.length ? `<div><span class="label">${esc(t('mn.stream'))}</span>${chips(p.stream)}</div>` : ''}
    ${p.rent.length ? `<div><span class="label">${esc(t('mn.rent'))}</span>${chips(p.rent)}</div>` : ''}
    ${!p.stream.length && !p.rent.length && p.buy.length ? `<div><span class="label">${esc(t('mn.buy'))}</span>${chips(p.buy)}</div>` : ''}
    <p class="fine-print">${esc(t('mn.justwatch'))}</p>
  </div>`;
}

// ---------- Overview: your nights, start one, join one ----------

export function movieNightsPage() {
  const node = document.createElement('section');
  node.className = 'page mn';
  node.append(
    frag(`
    <a class="back" href="/lobby" data-link>‹ ${esc(t('nav.lobby'))}</a>
    <header class="page-head">
      <h1>${esc(t('mn.title'))}</h1>
      <p class="lead">${esc(t('mn.lead'))}</p>
    </header>`),
  );
  const body = el('<div></div>');
  node.append(body);

  async function load() {
    body.replaceChildren(loadingBox());
    try {
      const [rooms, lists] = await track(Promise.all([myRooms('movienight'), db.myLists()]));
      const cards = rooms
        .filter((r) => !r.closed)
        .map((r) => {
          const pick = r.state && r.state.pick && (r.state.items || []).find((i) => i.k === r.state.pick);
          const when = r.state && r.state.date ? new Date(r.state.date).toLocaleString(getLang(), { dateStyle: 'medium', timeStyle: 'short' }) : '';
          return `<a class="list-card" href="/lobby/movie-night/${esc(r.id)}" data-link>
            <span class="list-emoji" aria-hidden="true">🍿</span>
            <span class="list-text"><span class="list-name">${esc(r.title || t('mn.title'))}</span>
            <span class="list-meta">${esc([pick ? `${t('mn.tonight')}: ${pick.title}` : t('mn.choosing'), when].filter(Boolean).join(' · '))}</span></span>
            <span class="list-go" aria-hidden="true">›</span></a>`;
        })
        .join('');
      body.replaceChildren(
        frag(`
        <div class="wl-actions">
          <button class="btn" type="button" data-new>+ ${esc(t('mn.new'))}</button>
          <form class="join-form">
            <input type="text" maxlength="200" autocomplete="off" placeholder="${esc(t('mn.codePlaceholder'))}" aria-label="${esc(t('mn.join'))}" />
            <button class="btn btn-ghost" type="submit">${esc(t('wl.joinBtn'))}</button>
          </form>
        </div>
        <div class="list-cards">${cards || `<p class="empty">${esc(t('mn.none'))}</p>`}</div>`),
      );
      body.querySelector('[data-new]').addEventListener('click', () => startNight(lists));
      body.querySelector('.join-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const raw = e.currentTarget.querySelector('input').value.trim();
        const code = (raw.match(/join\/([A-Za-z0-9]+)/) || [null, raw])[1].replace(/[^A-Za-z0-9]/g, '');
        if (code) go(`/lobby/movie-night/join/${code}`);
      });
    } catch (err) {
      console.warn(err);
      body.replaceChildren(errorBox(t('errors.offline')));
    }
  }

  async function startNight(lists) {
    if (!lists.length) return toast(t('mn.needList'));
    const form = el(`
      <form class="form">
        <label class="field"><span>${esc(t('mn.nameLabel'))}</span>
          <input type="text" maxlength="60" value="${esc(t('mn.title'))}" /></label>
        <div class="field"><span>${esc(t('mn.fromLists'))}</span>
          <div class="check-list">${lists
            .map(
              (l, i) => `<label class="check"><input type="checkbox" value="${esc(l.id)}" ${i === 0 || l.is_shared ? 'checked' : ''} />
                <span>${esc(l.emoji || '🎞️')} ${esc(l.name)} <span class="muted">(${l.itemCount})</span></span></label>`,
            )
            .join('')}</div></div>
        <label class="check"><input type="checkbox" data-unwatched checked /> <span>${esc(t('mn.onlyUnwatched'))}</span></label>
        <div class="row-end"><button class="btn" type="submit">${esc(t('mn.create'))}</button></div>
      </form>`);
    const close = openSheet({ title: t('mn.new'), body: form });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const ids = [...form.querySelectorAll('.check-list input:checked')].map((x) => x.value);
      if (!ids.length) return toast(t('mn.pickList'));
      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        const name = await ensureRoomName();
        if (!name) {
          btn.disabled = false;
          return;
        }
        const unwatchedOnly = form.querySelector('[data-unwatched]').checked;
        const all = [];
        for (const id of ids) {
          const d = await db.getList(id);
          if (!d) continue;
          const watchedBy = new Set(d.watched.filter((w) => w.user_id === d.me).map((w) => w.item_id));
          for (const it of d.items) if (!unwatchedOnly || !watchedBy.has(it.id)) all.push(it);
        }
        const seen = new Set();
        const items = all
          .filter((i) => !seen.has(keyOf(i)) && seen.add(keyOf(i)))
          .sort(() => Math.random() - 0.5)
          .slice(0, MAX_ITEMS)
          .map((i) => ({
            k: keyOf(i),
            media_type: i.media_type,
            tmdb_id: i.tmdb_id,
            title: tmdb.displayTitle(i),
            original_title: i.original_title,
            poster_path: i.poster_path,
            year: tmdb.yearOf(i),
            medium: tmdb.mediumOf(i),
            genres: (i.meta && i.meta.genres) || [],
            runtime: (i.meta && i.meta.runtime) || 0,
          }));
        if (items.length < 2) {
          btn.disabled = false;
          return toast(t('mn.tooFew'));
        }
        const title = form.querySelector('input[type=text]').value.trim() || t('mn.title');
        const room = await track(createRoom('movienight', { title, state: { items, date: null, pick: null, spin: null } }));
        close();
        go(`/lobby/movie-night/${room.id}`);
        setTimeout(() => shareInvite(room), 600);
      } catch (err) {
        console.warn(err);
        btn.disabled = false;
        toast(t('errors.generic'), 'error');
      }
    });
  }

  load();
  return node;
}

function inviteLink(room) {
  return `${location.origin}/lobby/movie-night/join/${room.code}`;
}

function shareInvite(room) {
  const link = inviteLink(room);
  const box = el(`
    <div class="form share-box">
      <p>${esc(t('mn.inviteBody'))}</p>
      <label class="field"><span>${esc(t('wl.inviteLink'))}</span><input type="text" readonly value="${esc(link)}" /></label>
      <p class="fine-print">${esc(t('wl.inviteCode'))}: <strong class="code">${esc(room.code)}</strong></p>
      <div class="row-end">
        ${navigator.share ? `<button class="btn btn-ghost" type="button" data-native>${esc(t('wl.shareNative'))}</button>` : ''}
        <button class="btn" type="button" data-copy>${esc(t('wl.copyLink'))}</button>
      </div>
    </div>`);
  openSheet({ title: t('mn.invite'), body: box });
  box.querySelector('[data-copy]').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast(t('wl.linkCopied'));
    } catch {
      box.querySelector('input').select();
    }
  });
  const native = box.querySelector('[data-native]');
  if (native) native.addEventListener('click', () => navigator.share({ title: 'CINENJOY', text: t('mn.shareText', { name: room.title || t('mn.title') }), url: link }).catch(() => {}));
}

// ---------- Join by link ----------

export function movieNightJoinPage(code) {
  const node = document.createElement('section');
  node.className = 'page mn';
  node.append(loadingBox());
  (async () => {
    try {
      const name = await ensureRoomName();
      if (!name) {
        node.replaceChildren(errorBox(t('mn.needName')));
        return;
      }
      const id = await track(joinRoom(code));
      go(`/lobby/movie-night/${id}`);
    } catch (err) {
      console.warn(err);
      node.replaceChildren(
        frag(`<a class="back" href="/lobby/movie-night" data-link>‹ ${esc(t('mn.title'))}</a>`),
        errorBox(/full/.test(String(err && err.message)) ? t('mn.full') : t('mn.notFound')),
      );
    }
  })();
  return node;
}

// ---------- One Movie Night ----------

export function movieNightPage(roomId) {
  const node = document.createElement('section');
  node.className = 'page mn mn-room';
  const head = el('<div class="mn-head"></div>');
  const tabs = el('<div class="seg seg-wide mn-tabs" role="tablist"></div>');
  const body = el('<div class="mn-body"></div>');
  node.append(head, tabs, body);
  head.append(loadingBox());

  let room = null;
  let people = [];
  let votes = [];
  let online = new Set();
  let uid = null;
  let tab = 'swipe';
  let spinning = false;
  let lastSpin = '';
  let live = null;

  const items = () => (room.state && room.state.items) || [];
  const myVote = (k) => votes.find((v) => v.user_id === uid && v.item === k && v.vote < 2);
  const yesCount = (k) => votes.filter((v) => v.item === k && v.vote === 1).length;
  const matches = () => {
    const n = Math.max(1, people.length);
    return items().filter((i) => yesCount(i.k) >= n && (n > 1 || yesCount(i.k) === 1));
  };
  const picks = () => {
    const m = new Map();
    for (const v of votes) if (v.vote === 2) m.set(v.item, (m.get(v.item) || 0) + 1);
    return m;
  };

  async function load(first = false) {
    try {
      uid = uid || (await me());
      const { sb } = await db.supa();
      const [r, p, v] = await Promise.all([
        getRoom(roomId),
        roomPeople(roomId),
        sb.from('movie_votes').select('user_id, item, vote').eq('room_id', roomId).then(({ data, error }) => {
          if (error) throw error;
          return data;
        }),
      ]);
      if (!node.isConnected) return;
      if (!r) {
        head.replaceChildren(errorBox(t('mn.notFound')));
        tabs.remove();
        body.remove();
        return;
      }
      room = r;
      people = p;
      votes = v;
      if (first) {
        live = liveRoom(roomId, {
          tables: ['movie_votes'],
          onChange: () => load(),
          onPresence: (ids) => {
            online = new Set(ids);
            renderHead();
          },
          onMessage: (type, data) => {
            if (type === 'spin' && data) animateSpin(data);
          },
        });
        whilePresent(node, live);
      }
      renderHead();
      renderTabs();
      if (!spinning) renderBody();
    } catch (err) {
      console.warn(err);
      if (first) head.replaceChildren(errorBox(t('errors.offline')));
    }
  }

  function renderHead() {
    if (!room) return;
    const pick = room.state.pick && items().find((i) => i.k === room.state.pick);
    const when = room.state.date ? new Date(room.state.date) : null;
    head.replaceChildren(
      frag(`
      <a class="back" href="/lobby/movie-night" data-link>‹ ${esc(t('mn.title'))}</a>
      <div class="wl-title-row">
        <h1>🍿 ${esc(room.title || t('mn.title'))}</h1>
        <div class="wl-buttons">
          <button class="btn" type="button" data-invite>${esc(t('mn.invite'))}</button>
          <button class="btn btn-ghost" type="button" data-date>📅 ${esc(when ? when.toLocaleString(getLang(), { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : t('mn.setDate'))}</button>
          <button class="btn btn-ghost btn-danger-text" type="button" data-more>⋯</button>
        </div>
      </div>
      <label class="tool region-pick"><span>${esc(t('mn.streamingIn'))}</span>
        <select data-region>${REGIONS.map((r) => `<option value="${r}"${r === myRegion() ? ' selected' : ''}>${esc(regionName(r))}</option>`).join('')}</select></label>
      <div class="members">${people.map((p) => avatar(p, online.has(p.user_id))).join('')}<span class="members-text">${esc(
        t('mn.peopleOnline', { n: people.length, o: people.filter((p) => online.has(p.user_id)).length || 1 }),
      )}</span></div>
      ${
        pick
          ? `<div class="tonight"><span class="thumb">${pick.poster_path ? `<img src="${esc(tmdb.poster(pick.poster_path, 'w92'))}" alt="" />` : ''}</span>
              <div><p class="label">${esc(t('mn.tonight'))}</p><p class="tonight-title">${esc(pick.title)}</p><div data-where></div></div></div>`
          : ''
      }`),
    );
    head.querySelector('[data-region]').addEventListener('change', (e) => {
      store.set('watchRegion', e.target.value);
      renderHead();
      renderBody();
    });
    head.querySelector('[data-invite]').addEventListener('click', () => shareInvite(room));
    head.querySelector('[data-date]').addEventListener('click', setDate);
    head.querySelector('[data-more]').addEventListener('click', moreMenu);
    if (pick) whereHtml(pick).then((h) => {
      const w = head.querySelector('[data-where]');
      if (w) w.innerHTML = h;
    });
  }

  function renderTabs() {
    const m = matches().length;
    tabs.innerHTML = ['swipe', 'matches', 'decide']
      .map((k) => `<button type="button" role="tab" data-tab="${k}" aria-pressed="${tab === k}">${esc(t(`mn.tab.${k}`))}${k === 'matches' && m ? ` (${m})` : ''}</button>`)
      .join('');
    tabs.querySelectorAll('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => {
        tab = b.dataset.tab;
        renderTabs();
        renderBody();
      }),
    );
  }

  function renderBody() {
    if (tab === 'swipe') renderSwipe();
    else if (tab === 'matches') renderMatches();
    else renderDecide();
  }

  // ----- Swipe -----

  async function vote(item, yes) {
    const prev = myVote(item.k);
    votes = votes.filter((v) => !(v.user_id === uid && v.item === item.k && v.vote < 2));
    votes.push({ user_id: uid, item: item.k, vote: yes ? 1 : 0 });
    renderTabs();
    renderSwipe();
    try {
      const { sb } = await db.supa();
      if (prev) await sb.from('movie_votes').delete().eq('room_id', roomId).eq('user_id', uid).eq('item', item.k).lt('vote', 2);
      const { error } = await sb.from('movie_votes').insert({ room_id: roomId, user_id: uid, item: item.k, vote: yes ? 1 : 0 });
      if (error) throw error;
      const n = Math.max(1, people.length);
      if (yes && n > 1 && yesCount(item.k) >= n) toast(t('mn.itsAMatch', { title: item.title }));
    } catch (err) {
      console.warn(err);
      toast(t('errors.generic'), 'error');
    }
  }

  function renderSwipe() {
    const todo = items().filter((i) => !myVote(i.k));
    const done = items().length - todo.length;
    if (!todo.length) {
      body.replaceChildren(
        frag(`<div class="empty empty-col"><p>${esc(t('mn.allSwiped'))}</p>
          <button class="btn" type="button" data-see>${esc(matches().length ? t('mn.seeMatches') : t('mn.decideNow'))}</button>
          <button class="link-btn" type="button" data-redo>${esc(t('mn.changeVotes'))}</button></div>`),
      );
      body.querySelector('[data-see]').addEventListener('click', () => {
        tab = matches().length ? 'matches' : 'decide';
        renderTabs();
        renderBody();
      });
      body.querySelector('[data-redo]').addEventListener('click', () => changeVotes());
      return;
    }
    const item = todo[0];
    const img = tmdb.poster(item.poster_path, 'w500');
    body.replaceChildren(
      frag(`
      <p class="muted swipe-progress">${esc(t('mn.progress', { i: done + 1, n: items().length }))}</p>
      <div class="swipe-wrap">
        <div class="swipe-card" tabindex="0" aria-label="${esc(item.title)}">
          ${img ? `<img src="${esc(img)}" alt="" draggable="false" />` : `<span class="poster-blank">${esc(item.title)}</span>`}
          <span class="stamp yes">${esc(t('mn.yes'))}</span><span class="stamp no">${esc(t('mn.no'))}</span>
          <div class="swipe-info">
            <p class="swipe-title">${esc(item.title)}</p>
            <p class="pc-meta">${esc([item.year, t(`medium.${item.medium}`), item.runtime ? t('item.minutes', { n: item.runtime }) : ''].filter(Boolean).join(' · '))}</p>
            <div data-where class="swipe-where"></div>
          </div>
        </div>
      </div>
      <div class="swipe-buttons">
        <button type="button" class="swipe-btn no" data-no aria-label="${esc(t('mn.no'))}">✕</button>
        <button type="button" class="swipe-btn yes" data-yes aria-label="${esc(t('mn.yes'))}">♥</button>
      </div>
      <p class="fine-print center">${esc(t('mn.swipeHint'))}</p>`),
    );
    whereHtml(item, { compact: true }).then((h) => {
      const w = body.querySelector('[data-where]');
      if (w) w.innerHTML = h;
    });
    const card = body.querySelector('.swipe-card');
    const decide = (yes) => {
      card.style.transition = 'transform .25s ease, opacity .25s';
      card.style.transform = `translateX(${yes ? 420 : -420}px) rotate(${yes ? 18 : -18}deg)`;
      card.style.opacity = '0';
      setTimeout(() => vote(item, yes), 200);
    };
    body.querySelector('[data-yes]').addEventListener('click', () => decide(true));
    body.querySelector('[data-no]').addEventListener('click', () => decide(false));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') decide(true);
      if (e.key === 'ArrowLeft') decide(false);
    });
    // Drag to swipe
    let startX = null;
    let dx = 0;
    card.addEventListener('pointerdown', (e) => {
      startX = e.clientX;
      card.setPointerCapture(e.pointerId);
      card.style.transition = 'none';
    });
    card.addEventListener('pointermove', (e) => {
      if (startX == null) return;
      dx = e.clientX - startX;
      card.style.transform = `translateX(${dx}px) rotate(${dx / 20}deg)`;
      card.classList.toggle('lean-yes', dx > 40);
      card.classList.toggle('lean-no', dx < -40);
    });
    const end = () => {
      if (startX == null) return;
      startX = null;
      if (Math.abs(dx) > 110) decide(dx > 0);
      else {
        card.style.transition = 'transform .2s';
        card.style.transform = '';
        card.classList.remove('lean-yes', 'lean-no');
      }
      dx = 0;
    };
    card.addEventListener('pointerup', end);
    card.addEventListener('pointercancel', end);
    setTimeout(() => card.focus({ preventScroll: true }), 50);
  }

  async function changeVotes() {
    try {
      const { sb } = await db.supa();
      await sb.from('movie_votes').delete().eq('room_id', roomId).eq('user_id', uid).lt('vote', 2);
      votes = votes.filter((v) => !(v.user_id === uid && v.vote < 2));
      renderTabs();
      renderSwipe();
    } catch (err) {
      console.warn(err);
    }
  }

  // ----- Matches -----

  function itemRow(i, extra = '') {
    const img = tmdb.poster(i.poster_path, 'w92');
    return `<div class="mn-row" data-k="${esc(i.k)}">
      <span class="thumb">${img ? `<img src="${esc(img)}" alt="" loading="lazy" />` : ''}</span>
      <span class="row-text"><span class="pc-title">${esc(i.title)}</span>
        <span class="pc-meta">${esc([i.year, t(`medium.${i.medium}`)].filter(Boolean).join(' · '))}</span>
        <span class="mn-where" data-where></span></span>
      ${extra}
    </div>`;
  }

  function fillWhere(box) {
    box.querySelectorAll('.mn-row').forEach((row) => {
      const i = items().find((x) => x.k === row.dataset.k);
      whereHtml(i).then((h) => {
        const w = row.querySelector('[data-where]');
        if (w) w.innerHTML = h;
      });
    });
  }

  function renderMatches() {
    const m = matches();
    if (!m.length) {
      const waiting = people.filter((p) => items().some((i) => !votes.some((v) => v.user_id === p.user_id && v.item === i.k && v.vote < 2)));
      body.replaceChildren(
        frag(`<div class="empty empty-col"><p>${esc(t('mn.noMatches'))}</p>
          ${waiting.length ? `<p class="muted">${esc(t('mn.stillSwiping', { names: waiting.map((p) => (p.me ? t('wl.you') : p.name || t('wl.friend'))).join(', ') }))}</p>` : ''}
          <button class="btn" type="button" data-decide>${esc(t('mn.decideNow'))}</button></div>`),
      );
      body.querySelector('[data-decide]').addEventListener('click', () => {
        tab = 'decide';
        renderTabs();
        renderBody();
      });
      return;
    }
    body.innerHTML = `<p class="muted">${esc(t('mn.matchesNote'))}</p><div class="mn-list">${m
      .map((i) => itemRow(i, `<button type="button" class="btn btn-small" data-choose="${esc(i.k)}">${esc(room.state.pick === i.k ? `✓ ${t('mn.chosen')}` : t('mn.choose'))}</button>`))
      .join('')}</div>`;
    fillWhere(body);
    body.querySelectorAll('[data-choose]').forEach((b) => b.addEventListener('click', () => choose(b.dataset.choose)));
  }

  async function choose(k) {
    try {
      room = await track(patchRoom(roomId, { state: { pick: k } }));
      toast(t('mn.picked', { title: (items().find((i) => i.k === k) || {}).title || '' }));
      renderHead();
      renderBody();
    } catch (err) {
      console.warn(err);
      toast(t('errors.generic'), 'error');
    }
  }

  // ----- Decide: vote or spin -----

  function candidates() {
    const list = items()
      .map((i) => ({ i, yes: yesCount(i.k) }))
      .sort((a, b) => b.yes - a.yes);
    const liked = list.filter((x) => x.yes > 0);
    return (liked.length >= 2 ? liked : list).slice(0, 8).map((x) => x.i);
  }

  function renderDecide() {
    const c = candidates();
    const tally = picks();
    const mine = votes.find((v) => v.user_id === uid && v.vote === 2);
    body.innerHTML = `
      <section class="decide-block">
        <h2>${esc(t('mn.voteTitle'))}</h2>
        <p class="muted">${esc(t('mn.voteNote'))}</p>
        <div class="mn-list">${c
          .map((i) =>
            itemRow(
              i,
              `<span class="tally">${tally.get(i.k) || 0}</span><button type="button" class="btn btn-small ${mine && mine.item === i.k ? '' : 'btn-ghost'}" data-pick="${esc(i.k)}">${esc(
                mine && mine.item === i.k ? `✓ ${t('mn.myPick')}` : t('mn.pickThis'),
              )}</button>`,
            ),
          )
          .join('')}</div>
      </section>
      <section class="decide-block">
        <h2>${esc(t('mn.spinTitle'))}</h2>
        <p class="muted">${esc(t('mn.spinNote'))}</p>
        <div class="wheel-wrap"><div class="wheel-pointer" aria-hidden="true">▼</div><canvas class="wheel" width="560" height="560" aria-hidden="true"></canvas></div>
        <div class="row-start"><button type="button" class="btn" data-spin>🎡 ${esc(t('mn.spin'))}</button></div>
        <p class="spin-result" aria-live="polite">${esc(lastSpin)}</p>
      </section>`;
    body.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => pickVote(b.dataset.pick)));
    drawWheel(c, 0);
    body.querySelector('[data-spin]').addEventListener('click', () => spin(c));
  }

  async function pickVote(k) {
    try {
      const { sb } = await db.supa();
      await sb.from('movie_votes').delete().eq('room_id', roomId).eq('user_id', uid).eq('vote', 2);
      await sb.from('movie_votes').insert({ room_id: roomId, user_id: uid, item: k, vote: 2 });
      votes = votes.filter((v) => !(v.user_id === uid && v.vote === 2));
      votes.push({ user_id: uid, item: k, vote: 2 });
      // Everyone has picked: the most-picked title wins
      const voted = new Set(votes.filter((v) => v.vote === 2).map((v) => v.user_id));
      if (voted.size >= people.length) {
        const top = [...picks().entries()].sort((a, b) => b[1] - a[1]);
        if (top.length && (top.length === 1 || top[0][1] > top[1][1])) await choose(top[0][0]);
        else toast(t('mn.tie'));
      }
      renderDecide();
    } catch (err) {
      console.warn(err);
      toast(t('errors.generic'), 'error');
    }
  }

  function drawWheel(options, angle) {
    const canvas = body.querySelector('.wheel');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const r = canvas.width / 2;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const n = Math.max(1, options.length);
    const colors = ['#861527', '#5c0e1b', '#a51c31', '#6d1020'];
    for (let i = 0; i < n; i += 1) {
      const a0 = angle + (i / n) * Math.PI * 2;
      const a1 = angle + ((i + 1) / n) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(r, r);
      ctx.arc(r, r, r - 6, a0, a1);
      ctx.closePath();
      ctx.fillStyle = colors[i % colors.length];
      ctx.fill();
      ctx.strokeStyle = '#f2c25a';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.save();
      ctx.translate(r, r);
      ctx.rotate((a0 + a1) / 2);
      ctx.fillStyle = '#fff6e3';
      ctx.font = '600 22px Inter, system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const label = options[i] ? options[i].title : '';
      ctx.fillText(label.length > 22 ? `${label.slice(0, 21)}…` : label, r - 26, 0);
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(r, r, 26, 0, Math.PI * 2);
    ctx.fillStyle = '#f2c25a';
    ctx.fill();
  }

  async function spin(options) {
    if (spinning || options.length < 2) return;
    const data = { options: options.map((o) => o.k), win: Math.floor(Math.random() * options.length), turns: 5 + Math.floor(Math.random() * 3) };
    if (live) live.send('spin', data);
    animateSpin(data, true);
  }

  function animateSpin(data, mine = false) {
    if (tab !== 'decide') {
      tab = 'decide';
      renderTabs();
      renderDecide();
    }
    const options = data.options.map((k) => items().find((i) => i.k === k)).filter(Boolean);
    if (options.length < 2) return;
    spinning = true;
    const n = options.length;
    // The pointer is at the top (-90°): land the middle of the winning slice there
    const target = -Math.PI / 2 - ((data.win + 0.5) / n) * Math.PI * 2 - data.turns * Math.PI * 2;
    const start = performance.now();
    const dur = 4200;
    const out = body.querySelector('.spin-result');
    const step = (now) => {
      const p = Math.min(1, (now - start) / dur);
      const ease = 1 - (1 - p) ** 3;
      drawWheel(options, target * ease);
      if (p < 1 && node.isConnected) requestAnimationFrame(step);
      else {
        spinning = false;
        const win = options[data.win];
        lastSpin = t('mn.wheelSays', { title: win.title });
        if (out) out.textContent = lastSpin;
        if (mine) choose(win.k);
      }
    };
    requestAnimationFrame(step);
  }

  // ----- Date, invite, report, leave -----

  function setDate() {
    const now = room.state.date ? new Date(room.state.date) : new Date(Date.now() + 86400000);
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const form = el(`<form class="form">
      <label class="field"><span>${esc(t('mn.when'))}</span><input type="datetime-local" value="${esc(local)}" required /></label>
      <div class="row-end">
        ${room.state.date ? `<button class="btn btn-ghost" type="button" data-clear>${esc(t('item.clear'))}</button>` : ''}
        <button class="btn" type="submit">${esc(t('ui.save'))}</button></div></form>`);
    const close = openSheet({ title: t('mn.setDate'), body: form });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = form.querySelector('input').value;
      try {
        room = await track(patchRoom(roomId, { state: { date: new Date(v).toISOString() } }));
        close();
        renderHead();
      } catch (err) {
        console.warn(err);
        toast(t('errors.generic'), 'error');
      }
    });
    const clr = form.querySelector('[data-clear]');
    if (clr)
      clr.addEventListener('click', async () => {
        room = await track(patchRoom(roomId, { state: { date: null } }));
        close();
        renderHead();
      });
  }

  function moreMenu() {
    const isHost = room.host_id === uid;
    const box = el(`<div class="form">
      <button class="btn btn-ghost" type="button" data-report>⚑ ${esc(t('mn.report'))}</button>
      ${isHost ? `<button class="btn btn-ghost btn-danger-text" type="button" data-end>${esc(t('mn.end'))}</button>` : `<button class="btn btn-ghost btn-danger-text" type="button" data-leave>${esc(t('wl.leave'))}</button>`}
    </div>`);
    const close = openSheet({ title: room.title || t('mn.title'), body: box });
    box.querySelector('[data-report]').addEventListener('click', async () => {
      const reason = 'reported from Movie Night';
      close();
      const ok = await confirmSheet({ title: t('mn.report'), body: t('mn.reportBody'), yes: t('mn.report') });
      if (!ok) return;
      try {
        await reportRoom(roomId, reason || 'reported from Movie Night');
        toast(t('mn.reported'));
      } catch {
        toast(t('errors.generic'), 'error');
      }
    });
    const end = box.querySelector('[data-end]');
    if (end)
      end.addEventListener('click', async () => {
        close();
        const ok = await confirmSheet({ title: t('mn.end'), body: t('mn.endBody'), yes: t('mn.end'), danger: true });
        if (!ok) return;
        await patchRoom(roomId, { closed: true });
        go('/lobby/movie-night');
      });
    const leave = box.querySelector('[data-leave]');
    if (leave)
      leave.addEventListener('click', async () => {
        close();
        await leaveRoom(roomId);
        go('/lobby/movie-night');
      });
  }

  load(true);
  return node;
}
