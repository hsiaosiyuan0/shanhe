import test from 'node:test';
import assert from 'node:assert/strict';
import { smoothRoute, routeThroughAnchor } from '../src/map/routeGeometry.js';
import { Store } from '../server/db.js';
import { createStory } from '../server/seeds.js';
import { applyActions, storySchema } from '../shared/schema.js';

test('smooth routes pass through every waypoint without mutating the source', () => {
  const anchors: [number, number][] = [
    [104, 30],
    [114, 35],
    [118, 32],
    [120, 30],
  ];
  const original = structuredClone(anchors);
  const curve = smoothRoute(anchors);
  assert.deepEqual(anchors, original);
  anchors.forEach((p, i) => assert.deepEqual(curve.coordinates[curve.anchorIndices[i]], p));
  const progress = routeThroughAnchor(curve, 2);
  assert.deepEqual(progress, curve.coordinates.slice(0, curve.anchorIndices[2] + 1));
  assert.deepEqual(progress.at(-1), anchors[2]);
  // A bend changes direction gradually on both sides of the middle waypoint.
  const index = curve.anchorIndices[1];
  const [before, at, after] = curve.coordinates.slice(index - 1, index + 2);
  const incoming = [at[0] - before[0], at[1] - before[1]];
  const outgoing = [after[0] - at[0], after[1] - at[1]];
  const cosine =
    (incoming[0] * outgoing[0] + incoming[1] * outgoing[1]) /
    Math.hypot(...incoming) /
    Math.hypot(...outgoing);
  assert.ok(cosine > 0.9);
});

test('curves handle repeated stops, reversals and date-line crossings', () => {
  for (const anchors of [
    [
      [110, 30],
      [110, 30],
      [111, 31],
    ],
    [
      [110, 30],
      [111, 31],
      [110, 30],
    ],
    [
      [179, 20],
      [-179, 21],
      [-178, 20],
    ],
  ] as [number, number][][]) {
    const curve = smoothRoute(anchors);
    assert.ok(curve.coordinates.flat().every(Number.isFinite));
    for (let i = 1; i < curve.coordinates.length; i++) {
      assert.ok(Math.abs(curve.coordinates[i][0] - curve.coordinates[i - 1][0]) < 2);
    }
  }
  assert.deepEqual(
    routeThroughAnchor(
      smoothRoute([
        [110, 30],
        [111, 31],
      ]),
      0,
    ),
    [],
  );
});

test('old documents get new layer defaults, and new toggles survive save and restore', () => {
  const store = new Store(':memory:', false);
  try {
    const original = createStory('旧故事', 'history');
    const legacy = {
      ...original,
      layers: { terrain: false, rivers: true, mountains: true, routes: true },
    };
    store.db
      .prepare('INSERT INTO stories VALUES (?,?,?)')
      .run(original.id, JSON.stringify(legacy), 0);
    assert.equal(store.list()[0].layers.elevation, true);
    assert.equal(store.get(original.id).layers.admin, false);
    const changed = applyActions(store.get(original.id), {
      actions: [
        {
          type: 'set_layers',
          layers: { ...store.get(original.id).layers, admin: true, elevation: false },
        },
      ],
    });
    const saved = store.save(changed, 0);
    const snapshot = store.snapshot(saved.id, '对照模式');
    store.save({ ...saved, layers: { ...saved.layers, admin: false } }, saved.revision);
    const restored = store.restore(saved.id, snapshot.id, 2);
    assert.equal(restored.layers.admin, true);
    assert.equal(restored.layers.elevation, false);
    assert.deepEqual(
      storySchema.parse(JSON.parse(JSON.stringify(restored))).layers,
      restored.layers,
    );
  } finally {
    store.close();
  }
});
