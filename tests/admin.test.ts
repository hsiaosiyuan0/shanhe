import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createExpression,
  featureFilter,
  validateStyleMin,
} from '@maplibre/maplibre-gl-style-spec';
import type { LayerSpecification, Map } from 'maplibre-gl';
import {
  modernAdminLayers,
  modernAdminSource,
  modernAdminSourceId,
  modernPlaceName,
  modernPlaceKind,
  provinceLabels,
  provinceLabelFeatures,
  adminScaleLabel,
} from '../src/map/modernAdmin';
import { ModernAdminController, type AdminDetailStatus } from '../src/map/ModernAdminController';

const fixture = JSON.parse(readFileSync('tests/fixtures/modern-admin-places.json', 'utf8'));
const layers = modernAdminLayers();
const matches = (layer: LayerSpecification, properties: Record<string, unknown>) =>
  featureFilter('filter' in layer ? layer.filter : undefined).filter(
    { zoom: layer.minzoom || 5 },
    { type: 1, properties },
  );

test('actual Chinese city, district and county place records are assigned to distinct zoom tiers', () => {
  const city = layers.find((l) => l.id === 'modern-city-label')!;
  const county = layers.find((l) => l.id === 'modern-county-label')!;
  const town = layers.find((l) => l.id === 'modern-town-label')!;
  assert.equal(city.minzoom, 5);
  assert.equal(county.minzoom, 8);
  assert.equal(town.minzoom, 11);
  for (const feature of fixture.features) {
    const properties = feature.properties;
    const isCounty = properties.capital === 6;
    assert.equal(matches(city, properties), !isCounty, properties.name);
    assert.equal(matches(county, properties), isCounty, properties.name);
    assert.equal(matches(town, properties), false);
    assert.equal(modernPlaceKind(properties), isCounty ? '区县地名' : '城市地名');
  }
  assert.ok(fixture.features.some((f: any) => f.properties.name === '东坡区'));
  assert.ok(fixture.features.some((f: any) => f.properties.name === '西湖区'));
  assert.equal(matches(town, { class: 'town', name: '某镇' }), true);
  assert.equal(matches(county, { class: 'town', name: '某县', capital: 6 }), true);
  assert.equal(matches(town, { class: 'town', name: '某县', capital: 6 }), false);
});

test('prefecture and county boundaries use Chinese admin levels 5 and 6, not class=city', () => {
  for (const [id, level, zoom] of [
    ['modern-city-boundary', 5, 6],
    ['modern-county-boundary', 6, 8],
  ] as const) {
    const layer = layers.find((l) => l.id === id)!;
    assert.equal(layer.minzoom, zoom);
    assert.ok(matches(layer, { admin_level: level, maritime: 0 }));
    assert.equal(matches(layer, { admin_level: 4, maritime: 0 }), false);
    assert.equal(matches(layer, { admin_level: level, maritime: 1 }), false);
  }
});

test('place labels prefer Simplified Chinese and skip empty translations', () => {
  const layer = layers.find((l) => l.id === 'modern-city-label')!;
  assert.equal(layer.type, 'symbol');
  if (layer.type !== 'symbol') return;
  const expression = createExpression(layer.layout!['text-field']);
  assert.equal(expression.result, 'success');
  if (expression.result !== 'success') return;
  for (const [properties, expected] of [
    [{ 'name:zh-Hans': '杭州', 'name:zh': '杭州市', name: 'Hangzhou' }, '杭州'],
    [{ 'name:zh-Hans': '', 'name:zh': '杭州市', name: 'Hangzhou' }, '杭州市'],
    [{ 'name:zh': '', name: '东坡区' }, '东坡区'],
  ] as const) {
    assert.equal(modernPlaceName(properties), expected);
    assert.equal(expression.value.evaluate({ zoom: 8 }, { type: 'Point', properties }), expected);
  }
  assert.equal(modernPlaceName({ name: '' }), undefined);
});

test('admin labels use collision detection and source styles validate with existing province data', () => {
  const provinces = JSON.parse(readFileSync('public/data/admin.geojson', 'utf8'));
  const points = provinceLabelFeatures(provinces.features.map((f: any) => f.properties));
  assert.equal(points.features.length, 31);
  assert.deepEqual(
    validateStyleMin({
      version: 8,
      sources: {
        [modernAdminSourceId]: modernAdminSource,
        'province-labels': { type: 'geojson', data: points },
      },
      layers: [provinceLabels, ...layers],
    }),
    [],
  );
  for (const layer of layers.filter((l) => l.type === 'symbol')) {
    if (layer.type === 'symbol') assert.equal(layer.layout?.['text-allow-overlap'], false);
  }
  assert.match(adminScaleLabel(4), /省级/);
  assert.match(adminScaleLabel(6), /省市/);
  assert.match(adminScaleLabel(9), /区县/);
  assert.match(adminScaleLabel(12), /乡镇/);
});

test('detail tiles load lazily, reuse their source, hide completely and recover via retry', () => {
  const handlers = new globalThis.Map<string, Set<(e?: any) => void>>();
  const sources = new globalThis.Map<string, any>();
  const addedLayers = new globalThis.Map<
    string,
    { layer: any; before: string; visibility?: string }
  >();
  const states: AdminDetailStatus[] = [];
  let zoom = 4,
    urls = 0;
  const map = {
    on(name: string, fn: (e?: any) => void) {
      if (!handlers.has(name)) handlers.set(name, new Set());
      handlers.get(name)!.add(fn);
    },
    off(name: string, fn: (e?: any) => void) {
      handlers.get(name)?.delete(fn);
    },
    getZoom() {
      return zoom;
    },
    getSource(id: string) {
      return sources.get(id);
    },
    addSource(id: string) {
      sources.set(id, {
        setUrl(url: string) {
          assert.equal(url, modernAdminSource.url);
          urls++;
        },
      });
    },
    getLayer(id: string) {
      return addedLayers.get(id)?.layer;
    },
    addLayer(layer: any, before: string) {
      addedLayers.set(layer.id, { layer, before });
    },
    setLayoutProperty(id: string, _: string, value: string) {
      addedLayers.get(id)!.visibility = value;
    },
  } as unknown as Map;
  const emit = (name: string, e?: any) => handlers.get(name)?.forEach((fn) => fn(e));
  const controller = new ModernAdminController(map, (s) => states.push(s));
  controller.setEnabled(true);
  assert.equal(sources.size, 0, 'province overview must not request detailed tiles');
  controller.setEnabled(false);
  zoom = 9;
  emit('zoomend');
  assert.equal(sources.size, 0, 'disabled comparison must not request detailed tiles');
  controller.setEnabled(true);
  assert.equal(sources.size, 1);
  assert.deepEqual(states, ['loading']);
  emit('sourcedata', {
    sourceId: modernAdminSourceId,
    sourceDataType: 'metadata',
    isSourceLoaded: false,
  });
  assert.equal(states.at(-1), 'loading');
  emit('sourcedata', {
    sourceId: modernAdminSourceId,
    sourceDataType: 'content',
    isSourceLoaded: true,
  });
  assert.equal(states.at(-1), 'loading', 'TileJSON does not mean viewport tiles are ready');
  emit('sourcedata', { sourceId: modernAdminSourceId, tile: {}, isSourceLoaded: false });
  assert.equal(states.at(-1), 'loading');
  emit('sourcedata', { sourceId: modernAdminSourceId, tile: {}, isSourceLoaded: true });
  assert.equal(states.at(-1), 'ready');
  for (const info of addedLayers.values()) {
    assert.equal(info.before, 'major-river-hover');
    assert.equal(info.visibility, 'visible');
  }
  emit('error', { sourceId: modernAdminSourceId });
  assert.equal(states.at(-1), 'error');
  emit('sourcedata', {
    sourceId: modernAdminSourceId,
    sourceDataType: 'idle',
    isSourceLoaded: true,
  });
  assert.equal(states.at(-1), 'error', 'partial failures must not be masked by successful tiles');
  controller.retry();
  assert.equal(urls, 1);
  assert.equal(states.at(-1), 'loading');
  emit('sourcedata', {
    sourceId: modernAdminSourceId,
    sourceDataType: 'idle',
    isSourceLoaded: true,
  });
  assert.equal(states.at(-1), 'ready');
  controller.setEnabled(false);
  for (const info of addedLayers.values()) assert.equal(info.visibility, 'none');
  controller.setEnabled(true);
  assert.equal(sources.size, 1);
  zoom = 4;
  emit('zoomend');
  for (const info of addedLayers.values()) assert.equal(info.visibility, 'none');
  controller.dispose();
  assert.ok([...handlers.values()].every((s) => s.size === 0));
});
