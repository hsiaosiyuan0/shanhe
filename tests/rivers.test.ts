import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { FeatureCollection, MultiLineString } from 'geojson';
import { featureFilter, validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import {
  findMajorRiver,
  majorRivers,
  majorRiverLayers,
  riverFilter,
} from '../src/map/majorRivers.js';

const data = JSON.parse(readFileSync('public/data/rivers.geojson', 'utf8')) as FeatureCollection<
  MultiLineString,
  { name: string }
>;

test('major river filters include every bundled main-channel segment without tributaries', () => {
  for (const river of majorRivers) {
    const { filter } = featureFilter(riverFilter([river]));
    const features = data.features.filter((feature) =>
      filter({ zoom: 5 }, { type: 2, properties: feature.properties }),
    );
    assert.equal(features.length, river.id === 'yangtze' ? 5 : 3);
    const coordinates = features.flatMap((feature) => feature.geometry.coordinates.flat());
    assert.ok(
      coordinates.some((point) => point[0] === river.center[0] && point[1] === river.center[1]),
    );
    assert.ok(coordinates.some((point) => point[0] > 119));
    assert.ok(coordinates.some((point) => point[0] < (river.id === 'yangtze' ? 91 : 97)));
    assert.ok(!filter({ zoom: 5 }, { type: 2, properties: { name: 'Han' } }));
  }
});

test('saved Chinese river notes and source aliases resolve to the same river', () => {
  for (const name of [
    '长江',
    '长 江',
    'Chang Jiang',
    'Yangtze',
    'Jinsha',
    '金沙江',
    'Tongtian',
    'Tuotuo',
  ])
    assert.equal(findMajorRiver(name)?.id, 'yangtze');
  for (const name of ['黄河', 'Huang', 'Yellow River'])
    assert.equal(findMajorRiver(name)?.id, 'yellow');
  // Unknown rivers and explicitly historical channels keep their own annotations.
  for (const name of ['汉江', '古黄河', '长江古河道', ''])
    assert.equal(findMajorRiver(name), undefined);
});

test('river channel and text layers form a valid style using locally generated glyphs', () => {
  const errors = validateStyleMin({
    version: 8,
    sources: { rivers: { type: 'geojson', data } },
    layers: majorRiverLayers(),
  });
  assert.deepEqual(
    errors.map((error) => error.message),
    [],
  );
  const { filter } = featureFilter(riverFilter([]));
  assert.equal(filter({ zoom: 5 }, { type: 2, properties: { name: 'Huang' } }), false);
});
