import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { lakeCatalog, searchLakes } from '../shared/lakes.js';
import { lakeLabels, lakeWaterLayers, lakeNameLayers } from '../src/map/lakes.js';
import { pointInRing } from '../src/map/adminPackage.js';
import { storySchema, applyActions } from '../shared/schema.js';
import { createStory } from '../shared/seeds.js';
import { StoryTools, toolDefinitions } from '../shared/story-tools.js';
import { demo } from '../shared/demo.js';
const bytes = readFileSync('public/data/lakes.geojson');
const data = JSON.parse(bytes.toString());
const raw = JSON.parse(
  gunzipSync(readFileSync('public/data/lakes-source/selected.geojson.gz')).toString(),
);
const manifest = JSON.parse(readFileSync('public/data/lakes-source/manifest.json', 'utf8'));

test('lake surfaces keep every source coordinate and hole; labels fall on their own water surface', () => {
  assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.geometrySha256);
  assert.equal(data.features.length, 192);
  const byId = new Map(raw.features.map((f: any) => [String(f.properties.ne_id), f]));
  for (const f of data.features) {
    const source: any = byId.get(f.id);
    assert.deepEqual(f.geometry, source.geometry);
    assert.equal(f.properties.name_zh, source.properties.name_zh);
    const lake = lakeCatalog.find((l) => l.id === f.id)!;
    const polygons =
      f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    assert.ok(
      polygons.some(
        ([outer, ...holes]: number[][][]) =>
          pointInRing(lake.center, outer) && !holes.some((h) => pointInRing(lake.center, h)),
      ),
      lake.label || lake.id,
    );
  }
  for (const name of ['鄱阳湖', '洞庭湖']) {
    const [lake] = searchLakes(name);
    assert.ok(lake && lake.label === name);
    assert.equal(lake.labelZoom, 4.5, 'major lake names are visible at regional story scale');
  }
  assert.equal(searchLakes('Poyang Hu')[0].label, '鄱阳湖');
  assert.notEqual(searchLakes('Po Hu')[0].id, searchLakes('Poyang Hu')[0].id);
});

test('lake fills and names form a valid map style without a remote water service', () => {
  assert.deepEqual(
    validateStyleMin({
      version: 8,
      sources: {
        lakes: { type: 'geojson', data },
        'lake-labels': { type: 'geojson', data: lakeLabels() },
      },
      layers: [...lakeWaterLayers(), ...lakeNameLayers()],
    }).map((e) => e.message),
    [],
  );
});

test('legacy stories enable lakes; model lookup and lake toggles preserve rivers and create no fake markers', () => {
  const legacy: any = structuredClone(createStory('湖泊测试', 'history'));
  delete legacy.layers.lakes;
  const story = storySchema.parse(legacy);
  assert.equal(story.layers.lakes, true);
  const tools = new StoryTools(story);
  const matches = tools.call('search_lakes', { query: '洞庭湖' }) as any[];
  assert.equal(matches.length, 1);
  assert.equal(matches[0].period, 'modern');
  assert.equal(matches[0].label, '洞庭湖');
  assert.match(matches[0].source.url, /naturalearthdata/);
  assert.ok(toolDefinitions.some((t) => t.function.name === 'search_lakes'));
  const response = demo(story, '显示洞庭湖');
  const focused = applyActions(story, { actions: response.actions });
  assert.deepEqual(focused.view.center, matches[0].center);
  assert.equal(focused.layers.lakes, true);
  assert.deepEqual(focused.markers, story.markers);
  const hidden = applyActions(focused, { actions: demo(focused, '关闭湖泊').actions });
  assert.equal(hidden.layers.lakes, false);
  assert.equal(hidden.layers.rivers, story.layers.rivers);
  assert.equal(storySchema.parse(JSON.parse(JSON.stringify(hidden))).layers.lakes, false);
});
