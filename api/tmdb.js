// Vercel serverless function: a small, read-only proxy to the TMDB API.
// The TMDB key stays on the server (environment variable TMDB_TOKEN) and never
// reaches the browser. Only the paths the site needs are allowed.

const ALLOWED = [
  /^search\/multi$/,
  /^(movie|tv)\/\d{1,9}$/,
  /^genre\/(movie|tv)\/list$/,
  /^trending\/(all|movie|tv)\/(day|week)$/,
];
const PASS_PARAMS = ['query', 'page', 'language', 'append_to_response', 'region'];

module.exports = async function handler(req, res) {
  const token = (process.env.TMDB_TOKEN || '').trim();
  res.setHeader('content-type', 'application/json; charset=utf-8');
  if (!token) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: 'TMDB_TOKEN is not set in Vercel' }));
  }
  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'GET only' }));
  }

  const query = req.query || {};
  const path = String(query.path || '');
  if (!ALLOWED.some((re) => re.test(path))) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'path not allowed' }));
  }

  const params = new URLSearchParams();
  for (const key of PASS_PARAMS) {
    if (query[key] != null && query[key] !== '') params.set(key, String(query[key]).slice(0, 200));
  }
  params.set('include_adult', 'false');

  // Accept either the long "API Read Access Token" or the short v3 API key
  const headers = { accept: 'application/json' };
  if (/^[0-9a-f]{32}$/i.test(token)) params.set('api_key', token);
  else headers.authorization = `Bearer ${token}`;

  try {
    const upstream = await fetch(`https://api.themoviedb.org/3/${path}?${params}`, { headers });
    const body = await upstream.text();
    res.statusCode = upstream.status;
    res.setHeader(
      'cache-control',
      upstream.ok ? 'public, s-maxage=86400, stale-while-revalidate=604800' : 'no-store',
    );
    return res.end(body);
  } catch (err) {
    res.statusCode = 502;
    res.setHeader('cache-control', 'no-store');
    return res.end(JSON.stringify({ error: 'TMDB unreachable' }));
  }
};
