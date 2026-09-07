import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { FeatureCollection, MultiLineString } from 'geojson';
import {
  createExpression,
  featureFilter,
  validateStyleMin,
} from '@maplibre/maplibre-gl-style-spec';
import {
  findMajorRiver,
  majorRivers,
  majorRiverLayers,
  riverFilter,
  riverSegmentName,
  riverLabelAnchors,
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
    const coverage = {
      yangtze: { features: 5, west: 91, east: 119 },
      yellow: { features: 3, west: 97, east: 119 },
      huai: { features: 3, west: 114, east: 119.5 },
    }[river.id];
    assert.ok(coverage, `Missing coverage check for ${river.id}`);
    assert.equal(features.length, coverage.features);
    const coordinates = features.flatMap((feature) => feature.geometry.coordinates.flat());
    assert.ok(
      coordinates.some((point) => point[0] === river.center[0] && point[1] === river.center[1]),
    );
    assert.ok(coordinates.some((point) => point[0] > coverage.east));
    assert.ok(coordinates.some((point) => point[0] < coverage.west));
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
  for (const name of ['淮河', '淮水', '淮河干流', 'Huai', 'Hudi', 'Huai River'])
    assert.equal(findMajorRiver(name)?.id, 'huai');
  // Unknown rivers and explicitly historical channels keep their own annotations.
  for (const name of ['汉江', '古黄河', '长江古河道', '淮南', '淮北', '古淮河', '淮河故道', ''])
    assert.equal(findMajorRiver(name), undefined);
});

test('all main-channel sections use their own river color and Chinese name', () => {
  const layers = majorRiverLayers();
  const line = layers.find((layer) => layer.id === 'major-river-line');
  const label = layers.find((layer) => layer.id === 'major-river-label');
  assert.ok(line?.type === 'line' && label?.type === 'symbol');
  const colorExpression = createExpression(line.paint!['line-color']);
  const labelExpression = createExpression(label.layout!['text-field']);
  assert.equal(colorExpression.result, 'success');
  assert.equal(labelExpression.result, 'success');
  if (colorExpression.result !== 'success' || labelExpression.result !== 'success') return;
  for (const river of majorRivers) {
    for (const name of river.names) {
      const feature = { type: 2 as const, properties: { name } };
      assert.equal(colorExpression.value.evaluate({ zoom: 5 }, feature), river.color);
      assert.equal(labelExpression.value.evaluate({ zoom: 5 }, feature), riverSegmentName(name));
    }
  }
  assert.equal(riverSegmentName('Hudi'), '淮河');
  assert.equal(riverSegmentName('Han'), 'Han');
  for (const anchor of riverLabelAnchors().features) {
    const river = findMajorRiver(anchor.properties.name)!;
    const coordinates = data.features
      .filter((feature) => river.names.includes(feature.properties.name))
      .flatMap((feature) => feature.geometry.coordinates.flat());
    assert.ok(
      coordinates.some(
        (point) =>
          point[0] === anchor.geometry.coordinates[0] &&
          point[1] === anchor.geometry.coordinates[1],
      ),
      'River labels must be anchored on the bundled channel',
    );
  }
});

test('Huai supplement retains separate river and lake geometries through the middle and lower course', () => {
  const features = data.features.filter((feature) =>
    ['Huai', 'Hudi'].includes(feature.properties.name),
  );
  assert.equal(features.flatMap((feature) => feature.geometry.coordinates).length, 7);
  assert.equal(features.flatMap((feature) => feature.geometry.coordinates.flat()).length, 386);
  const upstream = features.find((feature) => feature.properties.name === 'Huai')!;
  const downstream = features.filter((feature) => feature.properties.name === 'Hudi');
  const join = upstream.geometry.coordinates.at(-1)!.at(-1)!;
  assert.deepEqual(join, [116.521414, 32.501247]);
  assert.ok(
    downstream.some((feature) =>
      feature.geometry.coordinates.some((part) => part[0][0] === join[0] && part[0][1] === join[1]),
    ),
  );
});

test('river channel and text layers form a valid style using locally generated glyphs', () => {
  const errors = validateStyleMin({
    version: 8,
    sources: {
      rivers: { type: 'geojson', data },
      'river-labels': { type: 'geojson', data: riverLabelAnchors() },
    },
    layers: majorRiverLayers(),
  });
  assert.deepEqual(
    errors.map((error) => error.message),
    [],
  );
  const { filter } = featureFilter(riverFilter([]));
  assert.equal(filter({ zoom: 5 }, { type: 2, properties: { name: 'Huang' } }), false);
});
