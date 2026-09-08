import test from 'node:test';
import assert from 'node:assert/strict';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { readFileSync } from 'node:fs';
import { ModernAdminController, type AdminState } from '../src/map/ModernAdminController';
import { decodeAdminPackage, type AdminPackage, type AdminLevel } from '../src/map/adminPackage';
const settle = () => new Promise((resolve) => setImmediate(resolve));
const data = Object.fromEntries(
  ([4, 5, 6] as const).map((level, i) => [
    level,
    decodeAdminPackage(
      JSON.parse(
        readFileSync(`public/data/admin/${['province', 'city', 'county'][i]}.topo.json`, 'utf8'),
      ),
      level,
    ),
  ]),
) as Record<AdminLevel, AdminPackage>;
function fixture(load: (level: AdminLevel, signal: AbortSignal) => Promise<AdminPackage>) {
  const events = new Map<string, Set<(event?: any) => void>>();
  const sources = new Map<string, any>(),
    layers = new Map<string, any>(),
    featureStates = new Map<string, any>();
  const reports: AdminState[] = [];
  let zoom = 7.5;
  const map = {
    on(name: string, fn: (event?: any) => void) {
      if (!events.has(name)) events.set(name, new Set());
      events.get(name)!.add(fn);
    },
    off(name: string, fn: (event?: any) => void) {
      events.get(name)?.delete(fn);
    },
    getZoom: () => zoom,
    isMoving: () => false,
    isStyleLoaded: () => false,
    getSource: (id: string) => sources.get(id),
    getLayer: (id: string) => layers.get(id),
    addSource(id: string, options: any) {
      sources.set(id, {
        ...options,
        setData: async function (data: any) {
          this.data = data;
        },
      });
    },
    addLayer(layer: any, before: string) {
      assert.equal(before, 'major-river-hover');
      layers.set(layer.id, { ...layer, layout: { ...layer.layout } });
    },
    setLayoutProperty(id: string, key: string, value: string) {
      layers.get(id).layout[key] = value;
    },
    setFeatureState({ id }: { id: string }, state: any) {
      featureStates.set(id, state);
    },
    removeFeatureState() {
      featureStates.clear();
    },
  } as unknown as MapLibreMap;
  const controller = new ModernAdminController(map, (s) => reports.push(s), { load });
  const emit = (name: string, event?: any) => events.get(name)?.forEach((fn) => fn(event));
  return {
    controller,
    events,
    reports,
    sources,
    layers,
    featureStates,
    emit,
    zoom(value: number) {
      zoom = value;
      emit('zoom');
    },
    move(point: number[]) {
      emit('mousemove', { lngLat: { lng: point[0], lat: point[1] } });
    },
  };
}

test('real local areas respond to mouse movement while remote map sources are still loading, clear on drag/leave/disable', async () => {
  const loads: AdminLevel[] = [];
  const f = fixture(async (level) => {
    loads.push(level);
    return data[level];
  });
  f.controller.setEnabled(true);
  await settle();
  f.move([118.79, 32.06]);
  assert.equal(f.reports.at(-1)?.area?.properties.name, '南京市');
  assert.equal(f.featureStates.get('156320100')?.hover, true);
  f.emit('movestart');
  assert.equal(f.featureStates.get('156320100')?.hover, false);
  f.move([118.79, 32.06]);
  f.emit('mouseout');
  assert.equal(f.reports.at(-1)?.area, undefined);
  f.zoom(9);
  assert.equal(f.layers.get('admin-border-line').layout.visibility, 'none');
  await settle();
  f.move([118.79, 32.06]);
  assert.equal(f.reports.at(-1)?.area?.properties.name, '玄武区');
  assert.equal(f.sources.get('admin-areas').data, data[6].areas);
  assert.equal(f.sources.get('admin-borders').data, data[6].borders);
  f.controller.setEnabled(false);
  for (const layer of f.layers.values()) assert.equal(layer.layout.visibility, 'none');
  assert.equal(f.controller.at([118.79, 32.06]), undefined);
  f.move([118.79, 32.06]);
  assert.equal(f.reports.at(-1)?.area, undefined);
  f.zoom(5);
  assert.deepEqual(loads, [5, 6]);
  f.controller.dispose();
  assert.ok([...f.events.values()].every((set) => set.size === 0));
});

test('late old-tier requests cannot paint over the active tier; failures can be retried', async () => {
  let resolveOld!: (data: AdminPackage) => void;
  const f = fixture((level) =>
    level === 5
      ? new Promise((resolve) => {
          resolveOld = resolve;
        })
      : Promise.resolve(data[level]),
  );
  f.controller.setEnabled(true);
  f.zoom(9);
  await settle();
  resolveOld(data[5]);
  await settle();
  assert.equal(f.sources.get('admin-areas').data, data[6].areas);
  assert.equal(f.reports.at(-1)?.level, 6);
  f.controller.dispose();
  let failed = true;
  const g = fixture(async (level) => {
    if (failed) throw new Error('unavailable');
    return data[level];
  });
  g.controller.setEnabled(true);
  await settle();
  assert.equal(g.reports.at(-1)?.status, 'error');
  assert.equal(g.layers.get('admin-border-line').layout.visibility, 'none');
  failed = false;
  g.controller.retry();
  await settle();
  assert.equal(g.reports.at(-1)?.status, 'ready');
  assert.equal(g.layers.get('admin-border-line').layout.visibility, 'visible');
  g.controller.dispose();
});

test('explicit city selection survives zooming, panning and layer toggles until the user restores automatic mode', async () => {
  const loads: AdminLevel[] = [];
  const f = fixture(async (level) => {
    loads.push(level);
    return data[level];
  });
  f.zoom(9.5);
  f.controller.setEnabled(true);
  await settle();
  f.move([118.79, 32.06]);
  assert.equal(f.reports.at(-1)?.area?.properties.name, '玄武区');
  f.controller.setLevelMode(5);
  await settle();
  for (const zoom of [10.5, 12, 7, 4.5]) {
    f.zoom(zoom);
    f.move([118.79, 32.06]);
    assert.equal(f.reports.at(-1)?.area?.properties.name, '南京市');
    assert.equal(f.sources.get('admin-areas').data, data[5].areas);
    assert.equal(f.sources.get('admin-labels').data, data[5].labels);
  }
  assert.deepEqual(
    loads,
    [6, 5],
    'zooming a locked city layer must not load county or province data',
  );
  f.controller.setEnabled(false);
  f.zoom(9.5);
  f.controller.setEnabled(true);
  await settle();
  assert.equal(f.reports.at(-1)?.level, 5);
  f.controller.setLevelMode('auto');
  await settle();
  f.move([118.79, 32.06]);
  assert.equal(f.reports.at(-1)?.area?.properties.name, '玄武区');
  f.controller.dispose();
});

test('retry and late responses respect the manually selected administrative level', async () => {
  let resolveCounty!: (value: AdminPackage) => void;
  let failCity = true;
  const f = fixture(async (level) => {
    if (level === 6)
      return new Promise((resolve) => {
        resolveCounty = resolve;
      });
    if (level === 5 && failCity) throw new Error('unavailable');
    return data[level];
  });
  f.zoom(9.5);
  f.controller.setEnabled(true);
  f.controller.setLevelMode(5);
  await settle();
  assert.equal(f.reports.at(-1)?.status, 'error');
  failCity = false;
  f.controller.retry();
  await settle();
  resolveCounty(data[6]);
  await settle();
  assert.equal(f.reports.at(-1)?.status, 'ready');
  assert.equal(f.sources.get('admin-areas').data, data[5].areas);
  f.controller.dispose();
});

test('slow first downloads remain loading past 30 seconds; genuine timeouts show a retryable explanation', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let finish!: () => void;
  const f = fixture(
    (level, signal) =>
      new Promise((resolve, reject) => {
        finish = () => resolve(data[level]);
        signal.addEventListener(
          'abort',
          () => reject(new DOMException('The user aborted a request.', 'AbortError')),
          { once: true },
        );
      }),
  );
  f.controller.setEnabled(true);
  t.mock.timers.tick(45_000);
  await settle();
  assert.equal(f.reports.at(-1)?.status, 'loading');
  finish();
  await settle();
  assert.equal(f.reports.at(-1)?.status, 'ready');
  f.controller.retry();
  t.mock.timers.tick(90_000);
  await settle();
  assert.equal(f.reports.at(-1)?.status, 'error');
  assert.match(f.reports.at(-1)?.message ?? '', /加载超时.*重试/);
  f.controller.retry();
  finish();
  await settle();
  assert.equal(f.reports.at(-1)?.status, 'ready');
  f.controller.dispose();
});
