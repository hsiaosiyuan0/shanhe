import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Natural Earth 1:10m, commit ca96624a56bd078437bca8184e78163e5039ad19.
// Preserve the source geometry, including disconnected parts and lake centerlines.
// The adjacent middle/lower Huai sections are named Hudi in this source.
const input = process.argv[2];
if (!input)
  throw new Error('Usage: node scripts/extract-huai.mjs <ne_10m_rivers_lake_centerlines.geojson>');
const bytes = readFileSync(input);
const blobHash = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
if (blobHash !== '61a0d7137a6ff1113cc259525e7479c63d5fec86')
  throw new Error(
    'Source differs from the documented Natural Earth revision. Review it before extraction.',
  );
const source = JSON.parse(bytes.toString('utf8'));
const ids = ['458River', '419River', '419Lake Centerline'];
const features = source.features
  .filter((feature) => ids.includes(feature.properties.dissolve))
  .map(({ properties, geometry }) => ({
    type: 'Feature',
    properties: {
      name: properties.name,
      name_zh: '淮河',
      scalerank: properties.scalerank,
      featurecla: properties.featurecla,
      source_id: properties.dissolve,
      source_scale: '10m',
    },
    geometry,
  }));
if (features.length !== ids.length) throw new Error('Expected three Huai river/lake features.');
const target = 'public/data/rivers.geojson';
const rivers = JSON.parse(readFileSync(target, 'utf8'));
rivers.features = rivers.features.filter(
  (feature) => !['Huai', 'Hudi'].includes(feature.properties.name),
);
rivers.features.push(...features);
writeFileSync(target, JSON.stringify(rivers));
console.log(`已补入 ${features.length} 条淮河要素，共 ${rivers.features.length} 条河流要素。`);
