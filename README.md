# CINENJOY

A free website for tracking, sharing and playing with films, series, anime and every other kind of screen storytelling, in any language. It has three sections: **Watchlist**, **Games** and **Lobby**.

Live at <https://cinenjoy.vercel.app> once the Vercel project is set up.

## Status

| Phase 1 step | What | State |
| --- | --- | --- |
| a | Logo, look, site shell, three site languages | Done |
| b | Watchlists and saving (Supabase) | Next |
| c | Link import | To do |
| d | CineWordle and the Daily Mini crossword | To do |

## How it is built

- **Static site, no build step.** Plain HTML, CSS and JavaScript modules in `public/`. Vercel serves the folder as it is.
- **Hosting:** Vercel (free Hobby plan). `vercel.json` sets the output folder and sends every page address to `index.html`, so links like `/games` work on refresh.
- **Saved data (from step b):** Supabase, with anonymous sign-ins, so a visitor's lists and scores are saved from the first visit. Only the public anon key is used in the site. Row Level Security is on for every table.
- **Secret keys (TMDB):** read only inside Vercel serverless functions in `api/`, from environment variables. They never go in the code.

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
vercel.json             Vercel settings
```

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
