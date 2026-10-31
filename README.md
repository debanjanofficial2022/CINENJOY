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
| b | Friend rooms and Movie Night | Next |
| c | CineQuiz and Frame Guess | To do |
| d | Minute Cryptic and Movie Impostor | To do |
| e | Instagram and TikTok import | On hold (owner's decision) |

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
public/js/games/        CineWordle, Daily Mini crossword, their data and shared game code
vercel.json             Vercel settings
```

### Database

`supabase/schema.sql` creates the tables (profiles, lists, list members, list items, watched marks, ratings, tags) and their Row Level Security rules. It is safe to run again. Shared lists are joined with an invite code through the `join_list` function.

### Games

- **CineWordle** (`js/games/wordle.js`): guess a 5 or 6 letter title in six tries; one hint per game (year, type, genre or lead actor), marked in the score. The answers are well-known one-word titles from TMDB's top-rated films and series; guesses must be common English words or answers.
- **Daily Mini** (`js/games/crossword.js`, `crossword-gen.js`): a 5x5 American-style crossword, every square in an across and a down word. Every answer is a real title, clued from its details ("1979 science fiction film directed by Ridley Scott"), or a word from a well-known title, clued as a blank ("The Dark Knight ___", 2012 film). Clues are written in the site language. Check adds 3 seconds per letter, Reveal 15.
- **Daily** puzzles are the same for everyone on a given local date (#1 is 31 October 2026), built from a seeded shuffle. **Practice** is unlimited. **Challenge links** store the exact puzzle in Supabase so friends play the same one and see each other's scores.
- Results, streaks and stats are saved to the visitor's account (`game_results`, `challenges`, `challenge_results` in `supabase/games.sql`).
- **Games data** (`js/games/wordle-data.js`, `crossword-data.js`) was generated once from TMDB top-rated titles (11,600 films and series) and a list of common English words (google-10000-english). Answers are kept in the files so the daily puzzles stay the same for everyone.

### Diary & Stats and Suggestions

- **Diary** (`js/diary.js`, `/lobby/diary`): every title you rated or marked watched, by month. Ratings keep the title's details (`supabase/diary.sql`); older ones are filled in from TMDB once.
- **Stats**: totals, and breakdowns by type, language, country, decade, genre, creator and rating. The world map (`js/worldmap.js`) loads d3-geo, topojson-client, world-atlas and i18n-iso-countries from jsDelivr only when shown.
- **Suggestions** (`js/suggest.js`, `/watchlist/suggestions`): TMDB recommendations for your favourites (4 stars and up), weighted by the genres, languages and media you rate highly; only titles rated 6.6+ by 300+ people. One daily pick outside your comfort zone: a highly rated title in a language you rarely watch.

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
