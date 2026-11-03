# CINENJOY

A free website for tracking, sharing and playing with films, series, anime and every other kind of screen storytelling, in any language. It has three sections: **Watchlist**, **Games** and **Lobby**.

Live at <https://cinenjoy.vercel.app> once the Vercel project is set up.

## Status

| Phase 1 step | What | State |
| --- | --- | --- |
| a | Logo, look, site shell, three site languages | Done |
| b | Watchlists, sharing, tags, ratings and saving (Supabase) | Done |
| c | Link import from pages, lists, Reddit and YouTube, or pasted text | Done |
| d | CineWordle and the Daily Mini crossword, with daily, practice and challenge links | Done |

| Phase 2 step | What | State |
| --- | --- | --- |
| a | Lobby: Diary & Stats (with world map); Suggestions | Done |
| b | Friend rooms and Movie Night | Done |
| c | CineQuiz and Frame Guess | Done |
| d | Minute Cryptic and Movie Impostor | Done |
| e | Instagram and TikTok import | On hold (owner's decision) |

| Phase 3 step | What | State |
| --- | --- | --- |
| a | Emoji Plot, Timeline, Higher or Lower | Done |
| b | Six Degrees, Poster Reveal, CinePictionary | Done |
| c | Weekend 11x11 crossword | Done |
| d | Lobby: Explore and CineHistory; badges; year in review | Next |

## How it is built

- **Static site, no build step.** Plain HTML, CSS and JavaScript modules in `public/`. Vercel serves the folder as it is.
- **Hosting:** Vercel (free Hobby plan). `vercel.json` sets the output folder and sends every page address to `index.html`, so links like `/games` work on refresh.
- **Saved data:** Supabase, with anonymous sign-ins, so a visitor's lists, ratings, tags and settings are saved from the first visit. Only the public (publishable) key is in the site, in `public/js/config.js`. Row Level Security is on for every table; the rules are in `supabase/schema.sql`. The Supabase JavaScript library loads from jsDelivr, pinned to one version.
- **Secret keys (TMDB):** `api/tmdb.js` is a Vercel serverless function that reads `TMDB_TOKEN` from the environment and only allows the TMDB paths the site needs. The key never reaches the browser.

### Live updates

Lists update on everyone's screen without refreshing: when a friend adds or removes a title, marks one watched, rates it, joins or renames the list, the change appears within a second, and a title a friend just added glows briefly. This uses Supabase Realtime, which still obeys the Row Level Security rules, so people only receive changes to lists they belong to. The tables are added to Realtime at the end of `supabase/schema.sql`. As a safety net, open list pages also re-check every 20 seconds and whenever the tab comes back into view.

### Files

```
public/
  index.html            page shell: top bar, phone tab bar, footer credits
  css/main.css          the dark cinema theme
  js/app.js             routing and language switching
  js/i18n.js            all site text in English, Chinese (Simplified) and Spanish
  js/logo.js            the CINENJOY logo and its N-flip animation
  js/pages.js           the Home, Watchlist, Games and Lobby pages
  js/store.js           safe browser storage for settings
  icons/, manifest.webmanifest   home-screen icons (installable on phones)
  js/watchlist.js       lists, one list, search, rating sheet, sharing and joining
  js/data.js            the visitor's account and all saved data (Supabase)
  js/tmdb.js            title search and details through /api/tmdb
  js/ui.js              sheets, toasts, star rating input
api/tmdb.js             TMDB proxy (Vercel serverless function)
api/import.js           link import: reads a page, finds titles, matches them on TMDB
api/_lib/               shared server code: title extraction, safe page fetch, TMDB
supabase/schema.sql     database tables and security rules (run in the Supabase SQL Editor)
supabase/games.sql      game results and challenge links (run after schema.sql)
supabase/diary.sql      title details kept on ratings, for Diary & Stats
supabase/rooms.sql      friend rooms, Movie Night votes and room reports
supabase/moves.sql      moves in game rooms (quiz answers, clues, votes); allows the newer game names
supabase/secrets.sql    cards dealt by the database in Movie Impostor (each player reads only their own)
supabase/pictionary.sql CinePictionary: the drawer's title and guesses checked by the database
public/js/games/        the games, their data and shared game code
vercel.json             Vercel settings
```

### Database

`supabase/schema.sql` creates the tables (profiles, lists, list members, list items, watched marks, ratings, tags) and their Row Level Security rules. It is safe to run again. Shared lists are joined with an invite code through the `join_list` function.

### Games

- **CineWordle** (`js/games/wordle.js`): guess a 5 or 6 letter title in six tries; one hint per game (year, type, genre or lead actor), marked in the score. The answers are well-known one-word titles from TMDB's top-rated films and series; guesses must be common English words or answers.
- **Daily Mini** (`js/games/crossword.js`, `crossword-gen.js`): a 5x5 American-style crossword, every square in an across and a down word. Every answer is a real title, clued from its details ("1979 science fiction film directed by Ridley Scott"), or a word from a well-known title, clued as a blank ("The Dark Knight ___", 2012 film). Clues are written in the site language. Check adds 3 seconds per letter, Reveal 15.
- **Weekend Crossword** (`/games/weekend`, same code as the Mini with `generateFree` in `crossword-gen.js`): an 11x11 freestyle grid of 14 to 22 answers, each crossing another. Besides the Mini's words it uses CineWordle titles and well-known titles run together ("LALALAND", clued with word lengths "(2,2,4)" and details fetched from TMDB). A new puzzle every Saturday.
- **Daily** puzzles are the same for everyone on a given local date (#1 is 31 October 2026), built from a seeded shuffle. **Practice** is unlimited. **Challenge links** store the exact puzzle in Supabase so friends play the same one and see each other's scores.
- **CineQuiz** (`js/games/quiz.js`, `/games/quiz`): ten multiple-choice questions written on the spot from TMDB details: release year, director or creator, lead actor, plot (title hidden) and tagline. Practice filters: difficulty (how well known the titles are), type, language and country. 15 seconds a question; a right answer scores 500 plus up to 500 for speed. **Friend rooms** (`/games/quiz/room/…`): the host's page runs the game, answers go into `room_moves`, and everyone sees the board live. **Challenge links** store the question set.
- **Frame Guess** (`js/games/frame.js`, `/games/frame`): name the title from a still with no text on it. It starts zoomed in and blurred; each wrong guess or skip shows more. Guesses are picked from a TMDB search. The 302 titles (`frame-data.js`) are well-known films and series with 2,500+ votes.
- **Minute Cryptic** (`js/games/cryptic.js`, `/games/cryptic`): one cryptic clue a day, in English. The definition describes a well-known title ("Ridley Scott's 1979 film"); the wordplay is an anagram or a hidden word made from common English words (`cryptic-data.js`, 85 clues generated once and checked by hand). Three staged hints (definition, wordplay, first letter); the score is your time plus 20 seconds a hint and 10 a wrong answer.
- **Movie Impostor** (`js/games/impostor.js`, `/games/impostor`): a friend-room game for 3 or more. The database function `deal_impostor` picks the title and the impostor, so not even the host knows; each player can read only their own card (`room_secrets`). Two rounds of one-word clues (word filter, no words from the title), a vote, and a last guess for a caught impostor.
- **Emoji Plot** (`js/games/emoji.js`, `emoji-data.js`): name the title from emojis written by hand for 170 well-known titles; three tries, with the year and then the type and first letter as hints.
- **Timeline** (`js/games/timeline.js`): put five well-known titles in release order; three checks, and titles in the right place lock in green.
- **Higher or Lower** (`js/games/higher.js`): rating, box office, running time or episode count, from TMDB. Practice is an endless streak; a challenge link stores one 25-title run so friends get the same questions.
- **Six Degrees** (`js/games/degrees.js`): link the leads of two well-known films through titles and casts from TMDB (`person/…/combined_credits`, `…/credits`); six links at most.
- **Poster Reveal** (`js/games/poster.js`): a friend-room race; a poster uncovers tile by tile over 25 seconds and the first right answer takes the round.
- **CinePictionary** (`js/games/pictionary.js`, `supabase/pictionary.sql`): each player draws a secret title once. Strokes travel as Realtime broadcast messages and are never stored. The database deals the title to the drawer only and checks every guess (`pictionary_guess`), so nobody can read the answer early.
- Room games share `js/games/roomkit.js` (start page, join link, live room).
- The smaller daily games share one frame (`js/games/shell.js`) for daily, practice and challenge puzzles, saving and the result sheet.
- Results, streaks and stats are saved to the visitor's account (`game_results`, `challenges`, `challenge_results` in `supabase/games.sql`).
- **Games data** (`js/games/wordle-data.js`, `crossword-data.js`) was generated once from TMDB top-rated titles (11,600 films and series) and a list of common English words (google-10000-english). Answers are kept in the files so the daily puzzles stay the same for everyone.

### Diary & Stats and Suggestions

- **Diary** (`js/diary.js`, `/lobby/diary`): every title you rated or marked watched, by month. Ratings keep the title's details (`supabase/diary.sql`); older ones are filled in from TMDB once.
- **Stats**: totals, and breakdowns by type, language, country, decade, genre, creator and rating. The world map (`js/worldmap.js`) loads d3-geo, topojson-client, world-atlas and i18n-iso-countries from jsDelivr only when shown.
- **Suggestions** (`js/suggest.js`, `/watchlist/suggestions`): TMDB recommendations for your favourites (4 stars and up), weighted by the genres, languages and media you rate highly; only titles rated 6.6+ by 300+ people. One daily pick outside your comfort zone: a highly rated title in a language you rarely watch.

### Friend rooms and Movie Night

- **Rooms** (`js/rooms.js`, `supabase/rooms.sql`): private rooms joined by a 6-character code or invite link (up to 30 people). Only members can see a room. Live updates, who is online (presence) and quick messages between players (broadcast) use Supabase Realtime. Names are checked by a word filter; anyone in a room can report it (`room_reports`, reviewed in Supabase). Only the host can close a room.
- **Movie Night** (`js/movienight.js`, `/lobby/movie-night`): a shortlist of up to 30 titles from the lists you choose; everyone swipes yes or no; a title everyone likes is a match. Where to watch comes from TMDB's watch providers (JustWatch data) for the country you pick. Set a date; if nobody matches, vote (most picks wins) or spin the wheel, which spins the same way on every screen.

### Link import (no AI)

`api/import.js` reads a page on the server and looks for titles the way a person would: "Title (1999)", 《片名》, «título», italics, headings, list items, table rows with a year, numbered and timestamped lines. Letterboxd, IMDb and MyAnimeList lists are read from their own markup (IMDb by IMDb id). Each candidate is checked against TMDB; exact matches (helped by the year) are ticked, unsure ones are marked, and nothing is saved until the visitor chooses.

- Pages are fetched safely: public http(s) only, private and internal addresses refused on every redirect, 3 MB and 9-second limits.
- Some sites refuse servers (Letterboxd, IMDb, Reddit, often YouTube). The visitor is then offered "Paste text" instead.
- YouTube: title, description and captions when YouTube allows; otherwise the page's own description tags, or the title alone. Setting an optional `YOUTUBE_API_KEY` (YouTube Data API v3, free) in Vercel lets it read every video's description.

### The logo

CINE and ENJOY share the E. One N flips like a card from position 3 (CINE) over the E to position 5 (ENJOY). It plays on page load, on hover or tap, and in a loop while something is loading (`setLoading(true)` in `js/app.js`). It respects the visitor's reduced-motion setting.

### Adding text

Every piece of site text has a key in `js/i18n.js`. Add new keys to all three languages.

## Run it on your computer

Any static file server that sends unknown paths to `index.html` works, for example:

```
npx serve -s public
```

## Deploy

1. In Vercel, **Add New > Project**, pick this repository, and click **Deploy**. Leave the settings as they are; `vercel.json` handles them.
2. Every push to `main` republishes the site. Other branches get preview links.
3. Secret keys go in Vercel under **Settings > Environment Variables**, then redeploy.

## Data sources and credits

- Movie, series and anime data: [TMDB](https://www.themoviedb.org). *This product uses the TMDB API but is not endorsed or certified by TMDB.* The credit line appears on every page.
- Anime seasons, studios and episode counts: [AniList](https://anilist.co).
- Fonts: Bebas Neue and Inter from Google Fonts.

TMDB and AniList are free for non-commercial use.
