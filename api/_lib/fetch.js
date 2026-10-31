// Fetch a public web page for link import, safely:
// http(s) only, no private or internal addresses (checked again on every
// redirect), a size cap and a time limit.
const dns = require('dns').promises;
const net = require('net');

const MAX_BYTES = 3_000_000;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 CINENJOY-link-import';

class ImportError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function privateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19))
    );
  }
  const x = ip.toLowerCase();
  if (x.startsWith('::ffff:')) return privateIp(x.slice(7));
  return x === '::' || x === '::1' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe8') || x.startsWith('fe9') || x.startsWith('fea') || x.startsWith('feb');
}

async function checkUrl(raw) {
  let u;
  try {
    u = new URL(String(raw).trim());
  } catch {
    throw new ImportError('bad_url');
  }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) throw new ImportError('bad_url');
  if (u.port && u.port !== '80' && u.port !== '443') throw new ImportError('bad_url');
  const host = u.hostname.toLowerCase();
  if (!host.includes('.') || /(^|\.)(localhost|local|internal|lan|home|corp)$/.test(host)) throw new ImportError('bad_url');
  let addrs;
  try {
    addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  } catch {
    throw new ImportError('fetch_failed');
  }
  if (!addrs.length || addrs.some((a) => privateIp(a.address))) throw new ImportError('bad_url');
  return u;
}

async function readCapped(res) {
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    chunks.push(value);
    if (size >= MAX_BYTES) {
      reader.cancel().catch(() => {});
      break;
    }
  }
  const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  const type = res.headers.get('content-type') || '';
  let charset = ((type.match(/charset=([\w-]+)/i) || [])[1] || 'utf-8').toLowerCase();
  if (!charset || charset === 'utf8') charset = 'utf-8';
  try {
    return new TextDecoder(charset).decode(buf);
  } catch {
    return new TextDecoder('utf-8').decode(buf);
  }
}

/** GET a public page. Returns { url, body, type }. Throws ImportError. */
async function fetchPage(raw, { accept = 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8', lang = 'en', cookie } = {}) {
  let url = await checkUrl(raw);
  for (let hop = 0; hop < 5; hop += 1) {
    let res;
    try {
      res = await fetch(url, {
        redirect: 'manual',
        headers: {
          'user-agent': UA,
          accept,
          'accept-language': `${lang},en;q=0.8`,
          ...(cookie ? { cookie } : {}),
        },
        signal: AbortSignal.timeout(9000),
      });
    } catch {
      throw new ImportError('fetch_failed');
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = await checkUrl(new URL(res.headers.get('location'), url).toString());
      continue;
    }
    if ([401, 403, 429, 451, 503].includes(res.status)) throw new ImportError('blocked');
    if (!res.ok) throw new ImportError(res.status === 404 ? 'not_found' : 'fetch_failed');
    const type = res.headers.get('content-type') || '';
    if (!/html|json|xml|text/i.test(type)) throw new ImportError('not_page');
    return { url: url.toString(), body: await readCapped(res), type };
  }
  throw new ImportError('fetch_failed');
}

module.exports = { fetchPage, checkUrl, ImportError, privateIp };
