// A world map that fills in with the countries of the titles you watched.
// Map data and drawing code load from jsDelivr only when the map is shown.
import { getLang } from './i18n.js';

const LIBS = {
  geo: 'https://cdn.jsdelivr.net/npm/d3-geo@3.1.1/+esm',
  topo: 'https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/+esm',
  atlas: 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json',
  codes: 'https://cdn.jsdelivr.net/npm/i18n-iso-countries@7.13.0/codes.json',
};

let ready = null;
function load() {
  if (!ready) {
    ready = Promise.all([
      import(LIBS.geo),
      import(LIBS.topo),
      fetch(LIBS.atlas).then((r) => r.json()),
      fetch(LIBS.codes).then((r) => r.json()),
    ]).then(([geo, topo, atlas, codes]) => {
      const features = topo.feature(atlas, atlas.objects.countries).features;
      // TMDB uses two-letter codes (KR); the map uses numbers ("410")
      const toNumeric = new Map(codes.map(([a2, , num]) => [a2, num]));
      return { geo, features, toNumeric };
    });
    ready.catch(() => {
      ready = null;
    });
  }
  return ready;
}

/** counts: { "KR": 3, "FR": 1, ... } → an <svg> element */
export async function worldMap(counts) {
  const { geo, features, toNumeric } = await load();
  const byNum = new Map();
  for (const [a2, n] of Object.entries(counts)) {
    const num = toNumeric.get(a2);
    if (num) byNum.set(num, (byNum.get(num) || 0) + n);
  }
  const max = Math.max(1, ...byNum.values());
  const width = 960;
  const height = 500;
  const projection = geo.geoNaturalEarth1().fitSize([width, height], { type: 'Sphere' });
  const path = geo.geoPath(projection);
  let names;
  try {
    names = new Intl.DisplayNames([getLang()], { type: 'region' });
  } catch {
    names = null;
  }
  const a2ByNum = new Map([...toNumeric.entries()].map(([a2, num]) => [num, a2]));

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', 'world-map');
  svg.setAttribute('role', 'img');
  const sphere = document.createElementNS(ns, 'path');
  sphere.setAttribute('d', path({ type: 'Sphere' }));
  sphere.setAttribute('class', 'map-sphere');
  svg.append(sphere);
  for (const f of features) {
    const d = path(f);
    if (!d) continue;
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    const n = byNum.get(String(f.id)) || 0;
    p.setAttribute('class', n ? 'map-country on' : 'map-country');
    if (n) p.style.setProperty('--k', String(0.35 + 0.65 * Math.sqrt(n / max)));
    const a2 = a2ByNum.get(String(f.id));
    const label = (a2 && names && names.of(a2)) || (f.properties && f.properties.name) || '';
    const title = document.createElementNS(ns, 'title');
    title.textContent = n ? `${label}: ${n}` : label;
    p.append(title);
    svg.append(p);
  }
  return svg;
}
