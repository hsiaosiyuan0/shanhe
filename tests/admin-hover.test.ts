import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import type { Map } from 'maplibre-gl';
import {
  decodeAdminAreas,
  areaContains,
  adminAreaQuery,
  AdminAreaLoader,
  type AdminArea,
} from '../src/map/adminAreas';
import { AdminAreaController, type AdminHoverState } from '../src/map/AdminAreaController';

const fixture = JSON.parse(
  gunzipSync(readFileSync('tests/fixtures/admin-nanjing-areas.json.gz')).toString(),
);
const realAreas = decodeAdminAreas(fixture);
const settle = () => new Promise((resolve) => setTimeout(resolve, 8));

test('Nanjing and Xuanwu real relation polygons identify interiors at distinct levels', () => {
  assert.deepEqual(
    realAreas.map((a) => [a.properties.name, a.properties.level]),
    [
      ['南京市', 5],
      ['玄武区', 6],
    ],
  );
  for (const area of realAreas) {
    assert.ok(areaContains(area, [118.79, 32.06]));
    assert.equal(areaContains(area, [120.16, 30.27]), false);
    assert.ok(area.properties.sourceDate);
  }
  assert.equal(realAreas[0].geometry.type, 'MultiPolygon');
  assert.equal(
    areaContains(realAreas[0], [118.9, 31.8]),
    true,
    'interior far from the city name still selects the city',
  );
  assert.equal(areaContains(realAreas[1], [118.9, 31.8]), false);
  const broken = structuredClone(fixture);
  const gap = broken.elements[0].members.findIndex(
    (m: any) => JSON.stringify(m.geometry[0]) !== JSON.stringify(m.geometry.at(-1)),
  );
  assert.ok(gap >= 0);
  broken.elements[0].members.splice(gap, 1);
  assert.equal(
    decodeAdminAreas(broken).some((a) => a.properties.name === '南京市'),
    false,
    'an incomplete boundary must not be closed with an invented edge',
  );
});

test('multipolygon islands remain selectable while inner exclusions do not', () => {
  const way = (points: number[][], role = 'outer') => ({
    type: 'way',
    role,
    geometry: points.map(([lon, lat]) => ({ lon, lat })),
  });
  const relation = {
    type: 'relation',
    id: 123,
    tags: { name: '测试市', boundary: 'administrative', admin_level: '5' },
    members: [
      way([
        [0, 0],
        [6, 0],
        [6, 6],
      ]),
      way([
        [0, 0],
        [0, 6],
        [6, 6],
      ]),
      way(
        [
          [2, 2],
          [4, 2],
          [4, 4],
          [2, 4],
          [2, 2],
        ],
        'inner',
      ),
      way([
        [8, 0],
        [9, 0],
        [9, 1],
        [8, 1],
        [8, 0],
      ]),
    ],
  };
  const [area] = decodeAdminAreas({ elements: [relation] });
  assert.ok(areaContains(area, [1, 1]));
  assert.ok(areaContains(area, [8.5, 0.5]));
  assert.equal(areaContains(area, [3, 3]), false);
  assert.equal(areaContains(area, [7, 1]), false);
  assert.equal(area.geometry.type, 'MultiPolygon');
  assert.throws(() => decodeAdminAreas({ elements: [], remark: 'timeout' }), /繁忙/);
  assert.throws(() => adminAreaQuery([Infinity, 30]), /坐标/);
  assert.match(adminAreaQuery([118.79, 32.06]), /is_in\(32.06000,118.79000\)/);
  assert.match(adminAreaQuery([118.79, 32.06]), /北京市/, 'include municipality-level cities');
});

test('loader caches polygons by identity and checks the geometry instead of a rounded pointer position', async () => {
  let calls = 0;
  const loader = new AdminAreaLoader((async (input, init) => {
    calls++;
    assert.match(String(input), /overpass/);
    assert.equal(init?.method, 'POST');
    assert.match(String(init?.body), /data=/);
    return Response.json(fixture);
  }) as typeof fetch);
  await loader.load([118.79, 32.06], new AbortController().signal);
  assert.equal(loader.find([118.9, 31.8], 5)?.properties.name, '南京市');
  assert.equal(loader.find([118.9, 31.8], 6), undefined);
  assert.equal(loader.find([118.79, 32.06], 6)?.properties.name, '玄武区');
  assert.equal(calls, 1);
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(loader.load([118.79, 32.06], aborted.signal));
  assert.equal(calls, 1);
});

function mapFixture() {
  const handlers = new globalThis.Map<string, Set<() => void>>();
  const sources = new Set<string>();
  const layers = new Set<string>();
  const painted: any[] = [];
  let zoom = 7;
  const map = {
    on(name: string, fn: () => void) {
      if (!handlers.has(name)) handlers.set(name, new Set());
      handlers.get(name)!.add(fn);
    },
    off(name: string, fn: () => void) {
      handlers.get(name)?.delete(fn);
    },
    getZoom: () => zoom,
    getCenter: () => ({ lng: 118.79, lat: 32.06 }),
    getSource: (id: string) =>
      sources.has(id) ? { setData: (data: any) => painted.push(data) } : undefined,
    addSource: (id: string) => sources.add(id),
    getLayer: (id: string) => layers.has(id),
    addLayer: (layer: any) => layers.add(layer.id),
  } as unknown as Map;
  return {
    map,
    painted,
    handlers,
    setZoom: (z: number) => {
      zoom = z;
      handlers.get('moveend')?.forEach((fn) => fn());
    },
  };
}

test('hover highlights an entire area, switches tiers, clears on leave and avoids cached-area requests', async () => {
  const { map, painted, handlers, setZoom } = mapFixture();
  const states: AdminHoverState[] = [];
  let calls = 0;
  const controller = new AdminAreaController(
    map,
    (s) => states.push(s),
    {
      find: (point, level) =>
        realAreas.find((a) => a.properties.level === level && areaContains(a, point)),
      load: async () => {
        calls++;
      },
    },
    0,
  );
  controller.setEnabled(true);
  controller.hover([118.9, 31.8]);
  assert.equal(states.at(-1)?.area?.properties.name, '南京市');
  assert.deepEqual(painted.at(-1).features, [realAreas[0]]);
  controller.hover([118.8, 32.05]);
  assert.equal(painted.length, 1, 'motion inside an area does not resend its geometry');
  controller.hover(null);
  assert.equal(painted.at(-1).features.length, 0);
  setZoom(8);
  controller.hover([118.79, 32.06]);
  assert.equal(states.at(-1)?.area?.properties.name, '玄武区');
  setZoom(9);
  controller.hover([118.79, 32.06]);
  assert.equal(states.at(-1)?.area?.properties.name, '玄武区');
  controller.setEnabled(false);
  assert.equal(painted.at(-1).features.length, 0);
  await settle();
  assert.equal(calls, 0);
  controller.dispose();
  assert.ok([...handlers.values()].every((h) => h.size === 0));
});

test('only one lookup runs; delayed responses cannot paint the previous pointer area', async () => {
  const { map, painted } = mapFixture();
  const states: AdminHoverState[] = [];
  let loaded = false;
  const requests: { signal: AbortSignal; resolve: () => void }[] = [];
  const controller = new AdminAreaController(
    map,
    (s) => states.push(s),
    {
      find: (p, level) =>
        loaded
          ? realAreas.find((a) => a.properties.level === level && areaContains(a, p))
          : undefined,
      load: (_, signal) =>
        new Promise<void>((resolve) =>
          requests.push({
            signal,
            resolve: () => {
              loaded = true;
              resolve();
            },
          }),
        ),
    },
    0,
  );
  controller.setEnabled(true);
  controller.hover([118.79, 32.06]);
  await settle();
  assert.equal(requests.length, 1);
  controller.hover([120.16, 30.27]);
  await settle();
  assert.equal(requests.length, 1);
  requests[0].resolve();
  await settle();
  assert.equal(painted.length, 0, 'Nanjing must not light up while pointer is over Hangzhou');
  assert.equal(requests.length, 2, 'only the latest uncached target is queued');
  controller.hover([118.79, 32.06]);
  assert.equal(states.at(-1)?.area?.properties.name, '南京市');
  controller.setEnabled(false);
  assert.ok(requests[1].signal.aborted);
  requests[1].resolve();
  await settle();
  assert.equal(painted.at(-1).features.length, 0);
  controller.dispose();
});

test('lookup failure is retryable without flooding the provider or leaving a stale highlight', async () => {
  const { map } = mapFixture();
  const states: AdminHoverState[] = [];
  let calls = 0;
  const controller = new AdminAreaController(
    map,
    (s) => states.push(s),
    {
      find: () => undefined,
      load: async () => {
        calls++;
        throw new Error('offline');
      },
    },
    0,
  );
  controller.setEnabled(true);
  controller.hover([118.79, 32.06]);
  await settle();
  assert.equal(states.at(-1)?.status, 'error');
  for (let i = 0; i < 10; i++) controller.hover([118.79 + i / 1000, 32.06]);
  controller.hover(null);
  await settle();
  assert.equal(calls, 1);
  assert.equal(states.at(-1)?.status, 'error', 'retry affordance survives moving off the canvas');
  controller.retry();
  await settle();
  assert.equal(calls, 2);
  controller.dispose();
});
