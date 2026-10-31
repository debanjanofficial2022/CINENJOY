// Server-side TMDB calls (the key stays in the TMDB_TOKEN environment variable).
async function tmdb(path, params = {}) {
  const token = (process.env.TMDB_TOKEN || '').trim();
  if (!token) throw new Error('TMDB_TOKEN is not set');
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') q.set(k, String(v));
  q.set('include_adult', 'false');
  const headers = { accept: 'application/json' };
  if (/^[0-9a-f]{32}$/i.test(token)) q.set('api_key', token);
  else headers.authorization = `Bearer ${token}`;
  const res = await fetch(`https://api.themoviedb.org/3/${path}?${q}`, { headers, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`tmdb ${res.status}`);
  return res.json();
}

module.exports = { tmdb };
