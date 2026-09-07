import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { routeSchema, type Story } from '../shared/schema.js';
import { suFirstJourney, upgradeSuJourney } from '../server/su-journey.js';
import { createStory } from '../server/seeds.js';
import { Store } from '../server/db.js';
import { journeyFeatures } from '../src/map/journeyGeometry.js';

function legacyStory(): Story {
  const story = createStory('苏轼的一生', 'biography', 'sushi');
  story.routes = story.routes.filter((r) => !r.journey);
  story.events = story.events.filter((e) => e.id !== 'su-1056');
  return story;
}
test('dated journeys reject bad indices, missing sections and reversed dates', () => {
  const route = suFirstJourney();
  assert.ok(routeSchema.safeParse(route).success);
  const badIndex = structuredClone(route);
  badIndex.journey!.stops[0].at = 999;
  assert.equal(routeSchema.safeParse(badIndex).success, false);
  const gap = structuredClone(route);
  gap.journey!.legs[1].from++;
  assert.equal(routeSchema.safeParse(gap).success, false);
  const empty = structuredClone(route);
  empty.journey!.legs = [];
  assert.equal(routeSchema.safeParse(empty).success, false);
  const reverse = structuredClone(route);
  reverse.journey!.endYear = 1037;
  assert.equal(routeSchema.safeParse(reverse).success, false);
});
test('historical legs preserve source geometry and expose transport uncertainty', () => {
  const story = createStory('苏轼', 'biography', 'sushi');
  const route = story.routes.find((r) => r.journey)!;
  const data = journeyFeatures(story);
  assert.equal(data.features.length, 3);
  assert.deepEqual(data.features[1].geometry.coordinates, route.coordinates.slice(5, 14));
  assert.equal(data.features[1].properties!.mode, 'unknown');
  assert.equal(data.features[1].properties!.evidence, 'unknown');
  assert.equal(story.layers.connections, false);
  assert.equal(route.journey!.startYear, 1056);
  assert.equal(story.events.find((e) => e.id === 'su-1057')!.year, 1057);
  assert.ok(!data.features.some((f) => f.properties!.routeId === 'su-route'));
  assert.equal(journeyFeatures(story, 'not-present').features.length, 0);
});
test('legacy sample migration preserves edits and keeps a reversible, one-time backup', () => {
  const folder = mkdtempSync(join(tmpdir(), 'shanhe-journey-'));
  const path = join(folder, 'test.sqlite');
  const original = legacyStory();
  const edited = structuredClone(original);
  edited.routes[0].coordinates[0] = [102, 30];
  assert.equal(upgradeSuJourney(edited), null);
  const renamed = structuredClone(original);
  renamed.routes[0].label = '我的地点关系图';
  assert.equal(upgradeSuJourney(renamed)?.routes[0].label, '我的地点关系图');
  let store = new Store(path, false);
  try {
    store.insert(original);
    store.close();
    store = new Store(path, false);
    const updated = store.get(original.id);
    assert.equal(updated.routes.filter((r) => r.journey).length, 1);
    assert.deepEqual(updated.routes[0].coordinates, original.routes[0].coordinates);
    assert.equal(updated.events.filter((e) => e.id === 'su-1056').length, 1);
    const snapshots = store.snapshots(original.id);
    assert.equal(snapshots.length, 1);
    store.restore(original.id, snapshots[0].id, updated.revision);
    store.close();
    store = new Store(path, false);
    assert.equal(store.get(original.id).routes.filter((r) => r.journey).length, 0);
  } finally {
    store.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
