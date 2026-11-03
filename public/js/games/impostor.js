// Movie Impostor: a friend-room game. Everyone gets the same secret title
// except one player, the impostor. Each gives a one-word clue, twice, then
// everyone votes. If the impostor is caught, they get one guess at the title.
// The database deals the cards (supabase/secrets.sql).
import { t } from '../i18n.js';
import * as db from '../data.js';
import { track } from '../loading.js';
import { esc, el, frag, toast } from '../ui.js';
import { FRAMES } from './frame-data.js';
import { botsOffer } from './roomkit.js';
import { createRoom, joinRoom, getRoom, roomPeople, patchRoom, liveRoom, whilePresent, ensureRoomName, me, isRude, clean } from '../rooms.js';

const CLUE_ROUNDS = 2;
const go = (href) => document.dispatchEvent(new CustomEvent('cinenjoy:navigate', { detail: href }));

function options() {
  const pool = FRAMES.map(([tv, id, title, year]) => ({ title, year, mt: tv ? 'tv' : 'movie', id }));
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 40);
}

export function impostorHome() {
  const node = el(`<section class="page game impostor">
    <header class="game-head"><a class="back" href="/games" data-link>‹ ${esc(t('nav.games'))}</a>
      <div class="game-title-row"><h1>${esc(t('imp2.name'))}</h1><span class="chip">${esc(t('modes.room'))}</span></div></header>
    <p class="lead">${esc(t('imp2.lead'))}</p>
    <ol class="imp-rules"><li>${esc(t('imp2.rule1'))}</li><li>${esc(t('imp2.rule2'))}</li><li>${esc(t('imp2.rule3'))}</li><li>${esc(t('imp2.rule4'))}</li></ol>
    <div class="row-start quiz-start"><button class="btn" type="button" data-new>👥 ${esc(t('imp2.newRoom'))}</button>
      <a class="btn btn-ghost" href="/games/impostor/practice" data-link>🤖 ${esc(t('bots.practice'))}</a></div>
    <form class="join-form quiz-join"><input type="text" maxlength="120" placeholder="${esc(t('mn.codePlaceholder'))}" aria-label="${esc(t('imp2.join'))}" />
      <button class="btn btn-ghost" type="submit">${esc(t('wl.joinBtn'))}</button></form>
  </section>`);
  node.querySelector('[data-new]').addEventListener('click', async (e) => {
    if (!(await ensureRoomName())) return;
    e.target.disabled = true;
    try {
      const room = await track(createRoom('impostor', { title: t('imp2.name'), state: { phase: 'lobby', round: 0 } }));
      go(`/games/impostor/room/${room.id}`);
    } catch (err) {
      console.warn(err);
      toast(t('errors.generic'), 'error');
      e.target.disabled = false;
    }
  });
  node.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = e.currentTarget.querySelector('input').value.trim();
    const code = (raw.match(/join\/([A-Za-z0-9]+)/) || [null, raw])[1].replace(/[^A-Za-z0-9]/g, '');
    if (code) go(`/games/impostor/join/${code}`);
  });
  return node;
}

export function impostorJoin(code) {
  const node = el(`<section class="page game impostor"><div class="loading-box"><span class="spinner"></span>${esc(t('ui.loading'))}</div></section>`);
  (async () => {
    try {
      if (!(await ensureRoomName())) throw new Error('name');
      const id = await track(joinRoom(code));
      go(`/games/impostor/room/${id}`);
    } catch {
      node.replaceChildren(el(`<div class="error-box"><p>${esc(t('mn.notFound'))}</p></div>`));
    }
  })();
  return node;
}

export function impostorRoom(roomId) {
  const node = document.createElement('section');
  node.className = 'page game impostor';
  const head = el('<header class="game-head"></header>');
  const body = el('<div class="imp-body"><div class="loading-box"><span class="spinner"></span></div></div>');
  node.append(head, body);
  let uid = null;
  let room = null;
  let people = [];
  let moves = [];
  let card = null;
  let cardRound = null;
  let answer = null;
  let online = new Set();
  let busy = false;
  let saved = null;
  let draft = '';
  let lastSig = '';

  const st = () => room.state || {};
  const isHost = () => room.host_id === uid;
  const nameOf = (id) => {
    const p = people.find((x) => x.user_id === id);
    return p ? (p.me ? t('wl.you') : p.name || t('wl.friend')) : t('wl.friend');
  };
  const plainName = (id) => {
    const p = people.find((x) => x.user_id === id);
    return (p && p.name) || t('wl.friend');
  };
  const movesOf = (kind, round) => moves.filter((m) => m.kind === kind && m.round === round);

  async function load(first) {
    try {
      uid = uid || (await me());
      const { sb } = await db.supa();
      const [r, p, m] = await Promise.all([
        getRoom(roomId),
        roomPeople(roomId),
        sb.from('room_moves').select('user_id, kind, round, data').eq('room_id', roomId).order('id').then(({ data, error }) => {
          if (error) throw error;
          return data;
        }),
      ]);
      if (!node.isConnected) return;
      if (!r) {
        body.replaceChildren(el(`<div class="error-box"><p>${esc(t('mn.notFound'))}</p></div>`));
        return;
      }
      room = r;
      people = p;
      moves = m;
      const s = st();
      if (s.round && cardRound !== s.round) {
        const { data } = await sb.from('room_secrets').select('data').eq('room_id', roomId).eq('round', s.round).maybeSingle();
        card = data ? data.data : null;
        cardRound = s.round;
        answer = null;
      }
      if (['reveal', 'guess', 'over'].includes(s.phase) && !answer) {
        const { data } = await sb.rpc('reveal_impostor', { rid: roomId, rnd: s.round });
        answer = data;
      }
      if (first) {
        const live = liveRoom(roomId, { tables: ['room_moves'], onChange: () => load(), onPresence: (ids) => { online = new Set(ids); if (room) render(); } });
        whilePresent(node, live);
      }
      render();
      if (isHost()) hostStep();
    } catch (err) {
      console.warn(err);
    }
  }

  // ---------- The host's page moves the game on ----------

  async function patch(state) {
    if (busy) return;
    busy = true;
    try {
      room = await patchRoom(roomId, { state });
      await load();
    } finally {
      busy = false;
    }
  }

  function votesTally() {
    const s = st();
    const tally = new Map();
    for (const v of movesOf('vote', s.round * 10)) tally.set(v.data.target, (tally.get(v.data.target) || 0) + 1);
    return tally;
  }

  function caught() {
    if (!answer) return false;
    const tally = votesTally();
    const top = Math.max(0, ...tally.values());
    const leaders = [...tally].filter(([, n]) => n === top).map(([id]) => id);
    return top > 0 && leaders.length === 1 && leaders[0] === answer.impostor;
  }

  function hostStep(force = false) {
    const s = st();
    const players = s.players || [];
    if (s.phase === 'clues') {
      const done = movesOf('clue', s.round * 10 + s.clueRound).map((m) => m.user_id);
      if (force || players.every((p) => done.includes(p))) {
        patch(s.clueRound < CLUE_ROUNDS ? { clueRound: s.clueRound + 1 } : { phase: 'vote' });
      }
    } else if (s.phase === 'vote') {
      const done = movesOf('vote', s.round * 10).map((m) => m.user_id);
      if (force || players.every((p) => done.includes(p))) patch({ phase: 'reveal' });
    } else if (s.phase === 'reveal' && answer) {
      setTimeout(() => {
        if (node.isConnected && st().phase === 'reveal') patch({ phase: caught() ? 'guess' : 'over' });
      }, 2500);
    } else if (s.phase === 'guess') {
      if (force || movesOf('guess', s.round * 10).length) patch({ phase: 'over' });
    }
  }

  async function deal(btn) {
    btn.disabled = true;
    try {
      const { sb } = await db.supa();
      const round = (st().round || 0) + 1;
      const { error } = await sb.rpc('deal_impostor', { rid: roomId, rnd: round, options: options() });
      if (error) throw error;
      const players = people.map((p) => p.user_id);
      await patch({ phase: 'clues', round, clueRound: 1, players });
    } catch (err) {
      console.warn(err);
      toast(/3 players/.test(err.message || '') ? t('imp2.needThree') : t('errors.generic'), 'error');
      btn.disabled = false;
    }
  }

  async function addMove(kind, round, data) {
    const { sb } = await db.supa();
    const { error } = await sb.from('room_moves').insert({ room_id: roomId, user_id: uid, kind, round, data });
    if (error) throw error;
    await load();
  }

  // ---------- Screens ----------

  function cardHtml() {
    if (!card) return `<div class="imp-card is-watch"><p class="label">${esc(t('imp2.yourCard'))}</p><p>${esc(t('imp2.watching'))}</p></div>`;
    if (card.role === 'impostor')
      return `<div class="imp-card is-impostor"><p class="label">${esc(t('imp2.yourCard'))}</p><p class="imp-role">🕵️ ${esc(t('imp2.youImpostor'))}</p><p class="muted">${esc(t('imp2.blendIn'))}</p></div>`;
    return `<div class="imp-card"><p class="label">${esc(t('imp2.yourCard'))}</p><p class="imp-title">${esc(card.title.title)} <span class="muted">${esc(card.title.year)}</span></p><p class="muted">${esc(t('imp2.crewNote'))}</p></div>`;
  }

  function cluesHtml() {
    const s = st();
    const players = s.players || [];
    const rows = players
      .map((p) => {
        const cells = [];
        for (let c = 1; c <= CLUE_ROUNDS; c += 1) {
          const m = movesOf('clue', s.round * 10 + c).find((x) => x.user_id === p);
          const hidden = s.phase === 'clues' && c === s.clueRound && m && p !== uid;
          cells.push(`<td>${m ? (hidden ? '✓' : esc(clean(m.data.word))) : c <= (s.clueRound || 0) || s.phase !== 'clues' ? '<span class="muted">…</span>' : ''}</td>`);
        }
        return `<tr><th>${esc(nameOf(p))}${online.has(p) ? ' <span class="dot-on">●</span>' : ''}</th>${cells.join('')}</tr>`;
      })
      .join('');
    return `<table class="imp-clues"><thead><tr><th></th>${Array.from({ length: CLUE_ROUNDS }, (_, i) => `<th>${esc(t('imp2.clueN', { n: i + 1 }))}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
  }

  function render() {
    const s = st();
    const link = `${location.origin}/games/impostor/join/${room.code}`;
    head.innerHTML = `<a class="back" href="/games/impostor" data-link>‹ ${esc(t('imp2.name'))}</a>
      <div class="game-title-row"><h1>${esc(t('imp2.name'))}</h1><span class="chip">${esc(t('quiz.room'))} · ${esc(room.code)}</span>${s.round ? `<span class="chip">${esc(t('imp2.roundN', { n: s.round }))}</span>` : ''}</div>`;
    const players = s.players || [];
    const inRound = players.includes(uid);
    let html = '';
    if (!s.phase || s.phase === 'lobby') {
      html = `<p class="lead">${esc(t('imp2.lobbyLead'))}</p>
        <div class="share-box form"><label class="field"><span>${esc(t('wl.inviteLink'))}</span><input type="text" readonly value="${esc(link)}" /></label>
        <div class="row-end"><button class="btn btn-ghost" type="button" data-copy>${esc(t('wl.copyLink'))}</button></div></div>
        <h2 class="group-title">${esc(t('quiz.players', { n: people.length }))}</h2>
        <div class="board-list">${people.map((p) => `<div class="board-row${p.me ? ' is-me' : ''}"><span class="board-name">${esc(nameOf(p.user_id))}${online.has(p.user_id) ? ' <span class="dot-on">●</span>' : ''}</span></div>`).join('')}</div>
        ${isHost() ? `<button class="btn" type="button" data-deal ${people.length < 3 ? 'disabled' : ''}>▶ ${esc(t('imp2.start'))}</button>${people.length < 3 ? `<p class="muted">${esc(t('imp2.needThree'))}</p>` : ''}` : `<p class="muted">${esc(t('quiz.waitHost'))}</p>`}
        ${people.length < 3 ? botsOffer('/games/impostor') : ''}`;
    } else {
      html = cardHtml();
      if (s.phase === 'clues') {
        const mine = movesOf('clue', s.round * 10 + s.clueRound).find((m) => m.user_id === uid);
        html += `<p class="imp-step">${esc(t('imp2.clueStep', { n: s.clueRound, of: CLUE_ROUNDS }))}</p>`;
        if (inRound && !mine)
          html += `<form class="imp-form"><input type="text" maxlength="24" autocomplete="off" placeholder="${esc(t('imp2.oneWord'))}" aria-label="${esc(t('imp2.oneWord'))}" value="${esc(draft)}" />
            <button class="btn" type="submit">${esc(t('imp2.send'))}</button></form>`;
        else if (inRound) html += `<p class="muted">${esc(t('imp2.waitOthers'))}</p>`;
        html += cluesHtml();
      } else if (s.phase === 'vote') {
        const mine = movesOf('vote', s.round * 10).find((m) => m.user_id === uid);
        html += cluesHtml();
        html += `<p class="imp-step">${esc(t('imp2.voteStep'))}</p>`;
        if (inRound && !mine)
          html += `<div class="imp-votes">${players.filter((p) => p !== uid).map((p) => `<button class="btn btn-ghost" type="button" data-vote="${esc(p)}">${esc(nameOf(p))}</button>`).join('')}</div>`;
        else html += `<p class="muted">${esc(t('imp2.voted', { n: movesOf('vote', s.round * 10).length, of: players.length }))}</p>`;
      } else {
        html += cluesHtml();
        const tally = votesTally();
        html += `<div class="board-list">${players
          .map((p) => `<div class="board-row${answer && answer.impostor === p ? ' is-me' : ''}"><span class="board-name">${esc(nameOf(p))}${answer && answer.impostor === p ? ' 🕵️' : ''}</span><span class="board-score">🗳 ${tally.get(p) || 0}</span></div>`)
          .join('')}</div>`;
        if (answer) html += `<p class="imp-step">${esc(t('imp2.itWas', { name: plainName(answer.impostor), title: answer.title.title }))}</p>`;
        if (s.phase === 'reveal') html += `<p class="muted">${esc(caught() ? t('imp2.caught') : t('imp2.escaped'))}</p>`;
        if (s.phase === 'guess') {
          const g = movesOf('guess', s.round * 10)[0];
          if (card && card.role === 'impostor' && !g)
            html += `<p class="imp-step">${esc(t('imp2.lastChance'))}</p><div class="imp-votes">${card.choices
              .map((c, i) => `<button class="btn btn-ghost" type="button" data-guess="${i}">${esc(c.title)} <span class="muted">${esc(c.year)}</span></button>`)
              .join('')}</div>`;
          else html += `<p class="muted">${esc(t('imp2.guessing', { name: answer ? plainName(answer.impostor) : '' }))}</p>`;
        }
        if (s.phase === 'over' && answer) {
          const g = movesOf('guess', s.round * 10)[0];
          const stole = g && g.data.title === answer.title.title;
          const crewWins = caught() && !stole;
          html += `<p class="result-head">${esc(crewWins ? t('imp2.crewWins') : stole ? t('imp2.stole', { name: plainName(answer.impostor) }) : t('imp2.impostorWins', { name: plainName(answer.impostor) }))}</p>`;
          if (isHost()) html += `<button class="btn" type="button" data-deal>▶ ${esc(t('imp2.next'))}</button>`;
          if (saved !== s.round && inRound) {
            saved = s.round;
            const iAmImp = answer.impostor === uid;
            db.saveResult({ game: 'impostor', mode: 'practice', puzzleKey: `room-${roomId}-${s.round}`, won: iAmImp ? !crewWins : crewWins, detail: { room: roomId, impostor: iAmImp } }).catch(() => {});
          }
        }
      }
      if (isHost() && ['clues', 'vote', 'guess'].includes(s.phase)) html += `<p><button class="link-btn" type="button" data-force>${esc(t('imp2.moveOn'))}</button></p>`;
    }
    // Don't wipe a clue someone is typing: only refresh the table
    const typing = document.activeElement && document.activeElement.closest && document.activeElement.closest('.imp-form');
    const sig = `${s.phase}-${s.round}-${s.clueRound}`;
    if (typing && body.contains(typing) && sig === lastSig && html.includes('imp-form')) {
      const table = body.querySelector('.imp-clues');
      const tmp = el(`<div>${cluesHtml()}</div>`).firstElementChild;
      if (table && tmp) table.replaceWith(tmp);
      return;
    }
    lastSig = sig;
    body.innerHTML = html;
    wire();
  }

  function wire() {
    const copy = body.querySelector('[data-copy]');
    if (copy)
      copy.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(`${location.origin}/games/impostor/join/${room.code}`);
          toast(t('wl.linkCopied'));
        } catch {
          /* fine */
        }
      });
    const dealBtn = body.querySelector('[data-deal]');
    if (dealBtn) dealBtn.addEventListener('click', () => deal(dealBtn));
    const force = body.querySelector('[data-force]');
    if (force) force.addEventListener('click', () => hostStep(true));
    const form = body.querySelector('.imp-form');
    if (form) {
      const input = form.querySelector('input');
      input.addEventListener('input', () => (draft = input.value));
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const word = input.value.trim().split(/\s+/)[0] || '';
        const s = st();
        if (!word) return;
        if (isRude(word)) return toast(t('imp2.rude'), 'error');
        if (card && card.role === 'crew' && card.title.title.toLowerCase().split(/[^a-z0-9]+/i).includes(word.toLowerCase()))
          return toast(t('imp2.tooEasy'), 'error');
        form.querySelector('button').disabled = true;
        try {
          await addMove('clue', s.round * 10 + s.clueRound, { word: word.slice(0, 24) });
          draft = '';
        } catch (err) {
          console.warn(err);
          toast(t('errors.generic'), 'error');
        }
      });
    }
    body.querySelectorAll('[data-vote]').forEach((b) =>
      b.addEventListener('click', () => {
        body.querySelectorAll('[data-vote]').forEach((x) => (x.disabled = true));
        addMove('vote', st().round * 10, { target: b.dataset.vote }).catch(() => toast(t('errors.generic'), 'error'));
      }),
    );
    body.querySelectorAll('[data-guess]').forEach((b) =>
      b.addEventListener('click', () => {
        const c = card.choices[Number(b.dataset.guess)];
        body.querySelectorAll('[data-guess]').forEach((x) => (x.disabled = true));
        addMove('guess', st().round * 10, { title: c.title }).catch(() => toast(t('errors.generic'), 'error'));
      }),
    );
  }

  load(true);
  return node;
}
