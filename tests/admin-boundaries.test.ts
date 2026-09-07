import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Map } from 'maplibre-gl';
import {
  AdminBoundaryTileLoader,
  boundaryTilesForBounds,
  decodeBoundaryTile,
  type BoundaryData,
} from '../src/map/adminBoundaryTiles';
import { AdminBoundaryOverview, type BoundaryStatus } from '../src/map/AdminBoundaryOverview';

const z8 = readFileSync('tests/fixtures/admin-boundary-z8.pbf');
const z9 = readFileSync('tests/fixtures/admin-boundary-z9.pbf');
const hangzhou = { x: 426, y: 210, z: 9 };

test('real source tiles omit city/county borders at z8; overview reads their actual z9 geometry', () => {
  assert.equal(decodeBoundaryTile(z8, { x: 213, y: 105, z: 8 }).features.length, 0);
  const data = decodeBoundaryTile(z9, hangzhou);
  assert.deepEqual(data.features.map((f) => f.properties!.admin_level).sort(), [5, 6]);
  for (const feature of data.features) {
    const lines =
      feature.geometry.type === 'LineString'
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates;
    assert.ok(
      lines.flat().length > 100,
      'retain actual boundary vertices, not city-center connections',
    );
    for (const [lng, lat] of lines.flat()) {
      assert.ok(lng > 119 && lng < 121);
      assert.ok(lat > 29 && lat < 32);
    }
  }
  const tiles = boundaryTilesForBounds([119.9, 30, 120.3, 30.5]);
  assert.ok(tiles.some((t) => t.x === hangzhou.x && t.y === hangzhou.y));
  assert.ok(tiles.every((t) => t.z === 9));
  assert.throws(() => boundaryTilesForBounds([-180, -80, 180, 80]), /放大/);
  assert.ok(
    boundaryTilesForBounds([179.8, 30, -179.8, 30.1]).every((t) => t.x === 0 || t.x === 511),
  );
});

test('boundary downloads cache decoded geometry, limit concurrency and retry failed tiles', async () => {
  let manifests = 0,
    requests = 0,
    active = 0,
    peak = 0,
    fail = true;
  const loader = new AdminBoundaryTileLoader((async (input) => {
    const url = String(input);
    if (url.endsWith('/planet')) {
      manifests++;
      return Response.json({ tiles: ['https://tiles.openfreemap.org/test/{z}/{x}/{y}.pbf'] });
    }
    requests++;
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active--;
    if (fail) return new Response('', { status: 503 });
    assert.match(url, /\/9\/\d+\/\d+\.pbf$/);
    return new Response(z9);
  }) as typeof fetch);
  await assert.rejects(loader.load([hangzhou], new AbortController().signal), /加载失败/);
  fail = false;
  const data = await loader.load([hangzhou], new AbortController().signal);
  assert.equal(data.features.length, 2);
  const count = requests;
  await loader.load([hangzhou], new AbortController().signal);
  assert.equal(requests, count);
  assert.equal(manifests, 1);
  await loader.load(
    Array.from({ length: 12 }, (_, i) => ({ ...hangzhou, x: 440 + i })),
    new AbortController().signal,
  );
  assert.ok(peak <= 6);
  const aborted = new AbortController();
  aborted.abort();
  const beforeAbort = requests;
  await assert.rejects(loader.load([hangzhou], aborted.signal), /abort/i);
  assert.equal(requests, beforeAbort);
});

test('panning or disabling comparison cancels overview loads and stale results never repaint the map', async () => {
  let zoom = 7,
    west = 119.9;
  const listeners = new Set<() => void>(),
    states: BoundaryStatus[] = [],
    painted: BoundaryData[] = [];
  const pending: { signal: AbortSignal; resolve: (data: BoundaryData) => void }[] = [];
  const map = {
    on(_: string, fn: () => void) {
      listeners.add(fn);
    },
    off(_: string, fn: () => void) {
      listeners.delete(fn);
    },
    getZoom() {
      return zoom;
    },
    getBounds() {
      return {
        getWest: () => west,
        getEast: () => west + 0.2,
        getSouth: () => 30,
        getNorth: () => 30.2,
      };
    },
    getSource() {
      return {
        setData(data: BoundaryData) {
          painted.push(data);
        },
      };
    },
  } as unknown as Map;
  const overview = new AdminBoundaryOverview(map, (s) => states.push(s), {
    load: (_, signal) => new Promise((resolve) => pending.push({ signal, resolve })),
  });
  overview.setEnabled(true);
  assert.equal(pending.length, 1);
  west = 121;
  listeners.forEach((fn) => fn());
  assert.ok(pending[0].signal.aborted);
  assert.equal(pending.length, 2);
  const old: BoundaryData = { type: 'FeatureCollection', features: [] };
  const current = decodeBoundaryTile(z9, hangzhou);
  pending[0].resolve(old);
  pending[1].resolve(current);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(painted, [current]);
  assert.equal(states.at(-1)?.status, 'ready');
  west = 122;
  listeners.forEach((fn) => fn());
  overview.setEnabled(false);
  assert.ok(pending[2].signal.aborted);
  pending[2].resolve(old);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(painted.length, 1);
  zoom = 9;
  overview.setEnabled(true);
  assert.equal(pending.length, 3, 'native detail tiles take over at z9');
  overview.dispose();
  assert.equal(listeners.size, 0);
});
