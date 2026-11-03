// Emoji Plot: name the film or series from a row of emojis. Three tries;
// each wrong guess adds a hint (the year, then the type and first letter).
import { t } from '../i18n.js';
import { esc, toast } from '../ui.js';
import { FRAMES } from './frame-data.js';
import { EMOJI } from './emoji-data.js';
import { puzzlePage } from './shell.js';
import { titlePicker } from './picker.js';
import { titleCard } from './common.js';

const TRIES = 3;
const entry = (i) => {
  const [fi, emojis] = EMOJI[i];
  const [tv, id, title, year] = FRAMES[fi];
  return { emojis, mt: tv ? 'tv' : 'movie', id, title, year };
};

export function emojiPage(mode, challengeId) {
  return puzzlePage(
    {
      game: 'emoji',
      name: () => t('ep.name'),
      path: '/games/emoji',
      count: EMOJI.length,
      seed: 'cinenjoy-emoji-v1',
      maxScore: TRIES,
      help: () => `<p>${esc(t('ep.help1'))}</p><p>${esc(t('ep.help2'))}</p>`,
      initial: () => ({ guesses: [], done: false, won: false }),
      play(ctx) {
        const e = entry(ctx.idx);
        const s = ctx.state;
        const top = document.createElement('div');
        const list = document.createElement('ol');
        list.className = 'frame-guesses';
        const form = document.createElement('div');
        form.className = 'frame-form';
        const draw = () => {
          const wrong = s.guesses.filter((g) => !g.right).length;
          const hints = [];
          if (wrong >= 1 || s.done) hints.push(`${t('cw.hint.year')}: ${e.year}`);
          if (wrong >= 2 || s.done) hints.push(`${t('cw.hint.medium')}: ${t(`medium.${e.mt === 'tv' ? 'series' : 'film'}`)} · ${t('ep.starts', { l: e.title[0] })}`);
          top.innerHTML = `<div class="emoji-clue" role="img" aria-label="${esc(t('ep.clueLabel'))}">${esc(e.emojis)}</div>
            <p class="muted">${esc(s.done ? '' : t('fg.triesLeft', { n: TRIES - s.guesses.length }))}</p>
            ${hints.length ? `<ul class="cryptic-hints">${hints.map((h) => `<li>💡 ${esc(h)}</li>`).join('')}</ul>` : ''}`;
          list.innerHTML = s.guesses.map((g) => `<li class="${g.right ? 'ok' : 'bad'}">${g.right ? '🟩' : g.skip ? '⬜' : '🟥'} ${esc(g.skip ? t('fg.skipped') : g.label)}</li>`).join('');
          form.hidden = s.done;
        };
        const step = (g) => {
          s.guesses.push(g);
          if (g.right || s.guesses.length >= TRIES) ctx.finish(Boolean(g.right), s.guesses.length);
          else {
            toast(t('fg.notIt'));
            ctx.save();
          }
          draw();
        };
        const picker = titlePicker((r) => {
          if (s.done) return;
          if (s.guesses.some((g) => g.id === r.tmdb_id)) return toast(t('fg.already'));
          step({ label: r.title, id: r.tmdb_id, right: r.tmdb_id === e.id && r.media_type === e.mt });
        });
        const skip = document.createElement('button');
        skip.type = 'button';
        skip.className = 'btn btn-ghost';
        skip.textContent = t('fg.skip');
        skip.addEventListener('click', () => !s.done && step({ skip: true }));
        form.append(picker, skip);
        ctx.area.append(top, form, list);
        draw();
      },
      summary(ctx) {
        const e = entry(ctx.idx);
        const s = ctx.state;
        return {
          head: s.won ? t('fg.won', { n: s.guesses.length }) : t('fg.lost'),
          line: `${e.emojis}\n${s.guesses.map((g) => (g.right ? '🟩' : g.skip ? '⬜' : '🟥')).join('')}`,
          card: titleCard({ mt: e.mt, id: e.id, label: e.title, y: e.year, medium: e.mt === 'tv' ? 'series' : 'film' }),
        };
      },
    },
    mode,
    challengeId,
  );
}
