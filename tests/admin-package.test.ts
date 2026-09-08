import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import type { Position } from 'geojson';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import {
  AdminPackageLoader,
  areaContains,
  decodeAdminPackage,
  type AdminLevel,
  type AdminArea,
} from '../src/map/adminPackage';
import {
  adminLevelAtZoom,
  modernAdminLayers,
  adminSourceIds,
  townSource,
  townSourceId,
  townLayer,
} from '../src/map/modernAdmin';
const root = 'public/data/admin/';
const manifest = JSON.parse(readFileSync(root + 'manifest.json', 'utf8'));
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const segment = (a: Position, b: Position) => [a.join(','), b.join(',')].sort().join('|');
const ringEdges = (ring: Position[]) =>
  ring
    .slice(1)
    .map((p, i) => segment(ring[i], p))
    .sort();
const packages = new Map<AdminLevel, ReturnType<typeof decodeAdminPackage>>();

for (const [level, count, refs] of [
  [4, 34, 8],
  [5, 375, 13],
  [6, 2891, 7],
] as const) {
  test(`official level ${level} archive hashes, geometry, names, holes and mesh remain faithful to the download`, () => {
    const entry = manifest.levels[level];
    const bytes = gunzipSync(readFileSync(root + entry.originalArchive));
    const topoBytes = readFileSync(root + entry.file);
    const compressed = readFileSync(root + entry.gzipFile);
    assert.equal(compressed.length, entry.gzipBytes);
    assert.deepEqual(
      gunzipSync(compressed),
      topoBytes,
      'transport compression preserves every byte',
    );
    assert.equal(hash(bytes), entry.originalSha256);
    assert.equal(hash(topoBytes), entry.sha256);
    const raw = JSON.parse(bytes.toString());
    assert.equal(raw.crs.properties.name, 'urn:ogc:def:crs:EPSG::4490');
    const data = decodeAdminPackage(JSON.parse(topoBytes.toString()), level);
    packages.set(level, data);
    assert.equal(data.areas.features.length, count);
    assert.equal(data.references.features.length, refs);
    const byId = new Map(data.areas.features.map((area) => [area.id, area]));
    const sourceEdges = new Set<string>();
    for (const source of raw.features.filter((f: any) => f.geometry.type === 'MultiPolygon')) {
      const area = byId.get(source.properties.gb)!;
      assert.equal(area.properties.name, source.properties.name);
      assert.ok(
        areaContains(area, area.properties.center),
        `${area.properties.name}: label must be inside its own area`,
      );
      assert.equal(
        area.geometry.coordinates.length,
        source.geometry.coordinates.length,
        'preserve islands',
      );
      source.geometry.coordinates.forEach((polygon: Position[][], i: number) => {
        assert.equal(area.geometry.coordinates[i].length, polygon.length, 'preserve holes');
        polygon.forEach((ring, j) => {
          // TopoJSON may rotate a closed ring, but never changes its edges or grouping.
          assert.deepEqual(
            ringEdges(area.geometry.coordinates[i][j]),
            ringEdges(ring),
            area.properties.name,
          );
          for (const edge of ringEdges(ring))
            if (edge.split('|')[0] !== edge.split('|')[1]) sourceEdges.add(edge);
        });
      });
    }
    const meshEdges = new Set<string>();
    for (const line of data.borders.geometry.coordinates)
      for (let i = 1; i < line.length; i++) {
        const edge = segment(line[i - 1], line[i]);
        if (edge.split('|')[0] === edge.split('|')[1]) continue; // Original consecutive duplicate points have no length.
        assert.equal(meshEdges.has(edge), false, 'shared nonzero border segment drawn only once');
        meshEdges.add(edge);
      }
    assert.deepEqual(
      meshEdges,
      sourceEdges,
      'mesh has every original edge and no invented connector',
    );
    const referenceSources = raw.features.filter((f: any) => f.geometry.type === 'MultiLineString');
    data.references.features.forEach((f, i) => {
      assert.deepEqual(f.properties, referenceSources[i].properties);
      assert.deepEqual(f.geometry, referenceSources[i].geometry);
    });
  });
}

test('the Gaochun/Langxi screenshot uses a common boundary, and all label anchors hit the correct level', () => {
  const data = packages.get(6)!;
  const a = data.areas.features.find((a) => a.properties.name === '高淳区')!;
  const b = data.areas.features.find((a) => a.properties.name === '郎溪县')!;
  assert.ok(areaContains(a, a.properties.center));
  assert.equal(areaContains(b, a.properties.center), false);
  const edges = new Set(a.geometry.coordinates.flatMap((p) => p.flatMap(ringEdges)));
  const shared = b.geometry.coordinates
    .flatMap((p) => p.flatMap(ringEdges))
    .filter((e) => edges.has(e));
  assert.ok(shared.length === 7, 'real adjacent areas share exact source segments');
});

test('hit testing excludes holes and preserves detached islands', () => {
  const square = (x: number, y: number, size: number) => [
    [x, y],
    [x + size, y],
    [x + size, y + size],
    [x, y + size],
    [x, y],
  ];
  const area: AdminArea = {
    type: 'Feature',
    id: '156000001',
    bbox: [0, 0, 12, 12],
    properties: { name: 'test', gb: '156000001', level: 6, center: [1, 1] },
    geometry: {
      type: 'MultiPolygon',
      coordinates: [[square(0, 0, 8), square(2, 2, 2)], [square(10, 10, 2)]],
    },
  };
  assert.ok(areaContains(area, [1, 1]));
  assert.equal(areaContains(area, [3, 3]), false);
  assert.ok(areaContains(area, [11, 11]));
  assert.equal(areaContains(area, [9, 9]), false);
});

test('local static loader verifies bytes, caches tiers, honors abort and recovers after a corrupt response', async () => {
  const urls: string[] = [];
  let corrupt = true;
  const loader = new AdminPackageLoader('/shanhe/data/admin/', async (input) => {
    const url = String(input);
    urls.push(url);
    const name = url.split('/').at(-1)!;
    const bytes = readFileSync(root + name);
    return new Response(corrupt && name.endsWith('.topo.json.gz') ? gzipSync('{}') : bytes);
  });
  await assert.rejects(loader.load(4, new AbortController().signal), /校验失败/);
  corrupt = false;
  const data = await loader.load(4, new AbortController().signal);
  assert.equal(data.areas.features.length, 34);
  const requests = urls.length;
  assert.equal(await loader.load(4, new AbortController().signal), data);
  assert.equal(urls.length, requests);
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(loader.load(4, aborted.signal), { name: 'AbortError' });
  assert.ok(urls.every((u) => u.startsWith('/shanhe/data/admin/')));
  assert.ok(urls.includes('/shanhe/data/admin/province.topo.json.gz'));
  assert.equal(urls.includes('/shanhe/data/admin/province.topo.json'), false);
});

test('static loader accepts gzip bodies already decoded by HTTP Content-Encoding', async () => {
  const loader = new AdminPackageLoader('/data/admin/', async (input) => {
    const name = String(input).split('/').at(-1)!;
    return new Response(readFileSync(root + name.replace(/\.gz$/, '')), {
      headers: name.endsWith('.gz') ? { 'Content-Encoding': 'gzip' } : {},
    });
  });
  assert.equal((await loader.load(5, new AbortController().signal)).areas.features.length, 375);
});

test('static loader still reads uncompressed packages from older manifests', async () => {
  const legacy = structuredClone(manifest);
  for (const entry of Object.values(legacy.levels) as any[]) delete entry.gzipFile;
  const urls: string[] = [];
  const loader = new AdminPackageLoader('/data/admin/', async (input) => {
    const name = String(input).split('/').at(-1)!;
    urls.push(name);
    return new Response(
      name === 'manifest.json' ? JSON.stringify(legacy) : readFileSync(root + name),
    );
  });
  assert.equal((await loader.load(5, new AbortController().signal)).areas.features.length, 375);
  assert.deepEqual(urls, ['manifest.json', 'city.topo.json']);
});

test('one zoom tier uses uniform border strokes; hover shares the polygon source and map style validates', () => {
  assert.deepEqual([3, 5.99, 6, 7.5, 8.99, 9, 12].map(adminLevelAtZoom), [4, 4, 5, 5, 5, 6, 6]);
  const layers = modernAdminLayers();
  assert.deepEqual(
    validateStyleMin({
      version: 8,
      sources: {
        [townSourceId]: townSource,
        ...Object.fromEntries(
          adminSourceIds.map((id) => [
            id,
            { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
          ]),
        ),
      },
      layers: [...layers, townLayer],
    }),
    [],
  );
  const line = layers.find((l) => l.id === 'admin-border-line')!;
  assert.equal(line.type, 'line');
  if (line.type === 'line') {
    assert.equal(line.paint?.['line-width'], 1.2);
    assert.equal(line.paint?.['line-dasharray'], undefined);
  }
  for (const id of ['admin-hover-outline', 'admin-area-fill'])
    assert.equal((layers.find((l) => l.id === id) as any).source, 'admin-areas');
});
