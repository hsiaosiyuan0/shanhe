import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import polylabel from 'polylabel';

// Natural Earth 1:10m, fixed revision; retain every original ring and coordinate.
const input = process.argv[2];
if (!input) throw new Error('Usage: node scripts/extract-lakes.mjs <ne_10m_lakes.geojson>');
const bytes = readFileSync(input);
const sha256 = createHash('sha256').update(bytes).digest('hex');
if (sha256 !== '2d036f53dedec578001c5c30c2959ee7d4eebc1306900fa4367c49929ec8f2d9')
  throw new Error(
    'Source differs from the documented Natural Earth revision. Review before extraction.',
  );
const source = JSON.parse(bytes);
const polygons = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
const bounds = (g) =>
  polygons(g)
    .flat(2)
    .reduce(
      (b, p) => [
        Math.min(b[0], p[0]),
        Math.min(b[1], p[1]),
        Math.max(b[2], p[0]),
        Math.max(b[3], p[1]),
      ],
      [Infinity, Infinity, -Infinity, -Infinity],
    );
const features = source.features.filter(({ geometry }) => {
  const [w, s, e, n] = bounds(geometry);
  return e >= 75 && w <= 135 && n >= 15 && s <= 54;
});
const priority = new Set(['Poyang Hu', 'Dongting Hu', 'Tai Hu', 'Hongze Hu']);
const outerArea = (ring) =>
  Math.abs(
    ring.reduce((sum, p, i) => {
      const q = ring[(i + 1) % ring.length];
      return sum + p[0] * q[1] - q[0] * p[1];
    }, 0),
  );
const catalog = features.map(({ properties: p, geometry }) => {
  const largest = polygons(geometry).reduce((a, b) => (outerArea(a[0]) >= outerArea(b[0]) ? a : b));
  return {
    id: String(p.ne_id),
    name: p.name,
    label: p.name_zh || p.name || '',
    kind: p.featurecla,
    center: polylabel(largest, 0.0000001).slice(0, 2),
    bounds: bounds(geometry),
    labelZoom: priority.has(p.name) ? 4.5 : Math.max(4.5, p.min_label || 6),
    priority: priority.has(p.name),
  };
});
const output = {
  type: 'FeatureCollection',
  features: features.map(({ properties: p, geometry }) => ({
    type: 'Feature',
    id: String(p.ne_id),
    properties: {
      source_id: String(p.ne_id),
      name: p.name,
      name_zh: p.name_zh,
      featurecla: p.featurecla,
      source_scale: '10m',
    },
    geometry,
  })),
};
mkdirSync('public/data/lakes-source', { recursive: true });
writeFileSync(
  'public/data/lakes-source/selected.geojson.gz',
  gzipSync(JSON.stringify({ ...source, features }), { level: 9 }),
);
writeFileSync('public/data/lakes.geojson', JSON.stringify(output));
writeFileSync('shared/data/lake-catalog.json', JSON.stringify(catalog));
writeFileSync(
  'public/data/lakes-source/manifest.json',
  JSON.stringify(
    {
      source: 'Natural Earth · Lakes + Reservoirs · 1:10m',
      url: 'https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-lakes/',
      revision: 'ca96624a56bd078437bca8184e78163e5039ad19',
      sourceFile: 'ne_10m_lakes.geojson',
      sha256,
      sourceCrs: 'OGC:CRS84',
      region: [75, 15, 135, 54],
      count: features.length,
      geometrySha256: createHash('sha256').update(JSON.stringify(output)).digest('hex'),
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `${features.length} lake/reservoir features; ${Buffer.byteLength(JSON.stringify(output))} bytes; original geometry retained`,
);
