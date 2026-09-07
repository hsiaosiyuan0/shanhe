import { readFileSync, writeFileSync } from 'node:fs';

// Input: Natural Earth ne_10m_admin_1_states_provinces.geojson (public domain).
// Keep the dataset's mainland province-level features; do not infer historical borders.
const input = process.argv[2];
if (!input)
  throw new Error('Usage: node scripts/extract-admin.mjs <Natural Earth admin-1.geojson>');
const data = JSON.parse(readFileSync(input, 'utf8'));
const round = (coordinates) =>
  coordinates.map((v) => (Array.isArray(v) ? round(v) : Number(v.toFixed(4))));
const features = data.features
  .filter((f) => f.properties.adm0_a3 === 'CHN' && f.properties.adm1_code.startsWith('CHN-'))
  .map((f) => ({
    type: 'Feature',
    id: f.properties.adm1_code,
    properties: {
      name: f.properties.name_zh || f.properties.name,
      center: [f.properties.longitude, f.properties.latitude],
    },
    geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates) },
  }));
writeFileSync('public/data/admin.geojson', JSON.stringify({ type: 'FeatureCollection', features }));
console.log(`已提取 ${features.length} 个现代省级行政区。`);
