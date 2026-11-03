// Shared pieces for friend-room games: the start page (new room or join with a
// code), the join link handler, and a live room that reloads on every change.
import { t } from '../i18n.js';
import * as db from '../data.js';
import { track } from '../loading.js';
import { esc, el, toast } from '../ui.js';
import { createRoom, joinRoom, getRoom, roomPeople, patchRoom, liveRoom, whilePresent, ensureRoomName, me } from '../rooms.js';

export const go = (href) => document.dispatchEvent(new CustomEvent('cinenjoy:navigate', { detail: href }));

export function roomHome({ kind, name, lead, rules = [], path, state = { phase: 'lobby', round: 0 } }) {
  const node = el(`<section class="page game ${kind}">
    <header class="game-head"><a class="back" href="/games" data-link>‹ ${esc(t('nav.games'))}</a>
      <div class="game-title-row"><h1>${esc(name)}</h1><span class="chip">${esc(t('modes.room'))}</span></div></header>
    <p class="lead">${esc(lead)}</p>
    ${rules.length ? `<ol class="imp-rules">${rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ol>` : ''}
    <div class="row-start quiz-start"><button class="btn" type="button" data-new>👥 ${esc(t('imp2.newRoom'))}</button></div>
    <form class="join-form quiz-join"><input type="text" maxlength="120" placeholder="${esc(t('mn.codePlaceholder'))}" aria-label="${esc(t('imp2.join'))}" />
      <button class="btn btn-ghost" type="submit">${esc(t('wl.joinBtn'))}</button></form>
  </section>`);
  node.querySelector('[data-new]').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (!(await ensureRoomName())) return;
    btn.disabled = true;
    try {
      const room = await track(createRoom(kind, { title: name, state }));
      go(`${path}/room/${room.id}`);
    } catch (err) {
      console.warn(err);
      toast(t('errors.generic'), 'error');
      btn.disabled = false;
    }
  });
  node.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = e.currentTarget.querySelector('input').value.trim();
    const code = (raw.match(/join\/([A-Za-z0-9]+)/) || [null, raw])[1].replace(/[^A-Za-z0-9]/g, '');
    if (code) go(`${path}/join/${code}`);
  });
  return node;
}

export function roomJoin(path, code) {
  const node = el(`<section class="page game"><div class="loading-box"><span class="spinner"></span>${esc(t('ui.loading'))}</div></section>`);
  (async () => {
    try {
      if (!(await ensureRoomName())) throw new Error('name');
      const id = await track(joinRoom(code));
      go(`${path}/room/${id}`);
    } catch {
      node.replaceChildren(el(`<div class="error-box"><p>${esc(t('mn.notFound'))}</p></div>`));
    }
  })();
  return node;
}

/**
 * A live room. onLoad(r) runs after every reload with r = { room, people, moves, uid, online }.
 * Returns { r, reload, patch(state), send(type, data), nameOf(id) }.
 */
export function liveGame(node, roomId, { onLoad, onMessage, kinds }) {
  const r = { room: null, people: [], moves: [], uid: null, online: new Set() };
  let live = null;
  let busy = false;
  let again = false;
  async function reload() {
    if (busy) {
      again = true;
      return;
    }
    busy = true;
    try {
      r.uid = r.uid || (await me());
      const { sb } = await db.supa();
      let q = sb.from('room_moves').select('id, user_id, kind, round, data').eq('room_id', roomId).order('id');
      if (kinds) q = q.in('kind', kinds);
      const [room, people, moves] = await Promise.all([
        getRoom(roomId),
        roomPeople(roomId),
        q.then(({ data, error }) => {
          if (error) throw error;
          return data;
        }),
      ]);
      r.room = room;
      r.people = people;
      r.moves = moves;
      if (!live && room) {
        live = liveRoom(roomId, {
          tables: ['room_moves'],
          onChange: reload,
          onPresence: (ids) => {
            r.online = new Set(ids);
            if (r.room && node.isConnected) onLoad(r);
          },
          onMessage,
        });
        whilePresent(node, live);
      }
      if (node.isConnected) await onLoad(r);
    } catch (err) {
      console.warn(err);
    } finally {
      busy = false;
      if (again) {
        again = false;
        reload();
      }
    }
  }
  const api = {
    r,
    reload,
    async patch(state) {
      r.room = await patchRoom(roomId, { state });
      await reload();
    },
    send: (type, data) => live && live.send(type, data),
    nameOf(id) {
      const p = r.people.find((x) => x.user_id === id);
      return p ? (p.me ? t('wl.you') : p.name || t('wl.friend')) : t('wl.friend');
    },
    plainName(id) {
      const p = r.people.find((x) => x.user_id === id);
      return (p && p.name) || t('wl.friend');
    },
    lobbyHtml(path, canStart, startLabel, note = '') {
      const link = `${location.origin}${path}/join/${r.room.code}`;
      return `<div class="share-box form"><label class="field"><span>${esc(t('wl.inviteLink'))}</span><input type="text" readonly value="${esc(link)}" /></label>
        <div class="row-end"><button class="btn btn-ghost" type="button" data-copy="${esc(link)}">${esc(t('wl.copyLink'))}</button></div></div>
        <h2 class="group-title">${esc(t('quiz.players', { n: r.people.length }))}</h2>
        <div class="board-list">${r.people.map((p) => `<div class="board-row${p.me ? ' is-me' : ''}"><span class="board-name">${esc(api.nameOf(p.user_id))}${r.online.has(p.user_id) ? ' <span class="dot-on">●</span>' : ''}</span></div>`).join('')}</div>
        ${r.room.host_id === r.uid ? `<button class="btn" type="button" data-start ${canStart ? '' : 'disabled'}>▶ ${esc(startLabel)}</button>${note ? `<p class="muted">${esc(note)}</p>` : ''}` : `<p class="muted">${esc(t('quiz.waitHost'))}</p>`}`;
    },
    wireCopy(box) {
      box.querySelectorAll('[data-copy]').forEach((b) =>
        b.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(b.dataset.copy);
            toast(t('wl.linkCopied'));
          } catch {
            /* fine */
          }
        }),
      );
    },
    scoreList(scores) {
      return `<div class="board-list">${[...scores]
        .sort((a, b) => b[1] - a[1])
        .map(([id, sc], i) => `<div class="board-row${id === r.uid ? ' is-me' : ''}"><span class="board-rank">${i + 1}</span><span class="board-name">${esc(api.nameOf(id))}${r.online.has(id) ? ' <span class="dot-on">●</span>' : ''}</span><span class="board-score">${sc}</span></div>`)
        .join('')}</div>`;
    },
  };
  reload();
  return api;
}
