import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { lakeCatalog, searchLakes } from '../shared/lakes.js';
import originalLakeCatalog from '../shared/data/lake-catalog.json' with { type: 'json' };
import { lakeReference } from '../shared/lake-reference.js';
import {
  lakeLabels,
  lakeWaterLayers,
  lakeNameLayers,
  lakeDescription,
  lakeFeatureInfo,
} from '../src/map/lakes.js';
import { LakePackageLoader, lakePackagesInView, hydroManifest } from '../src/map/lakePackage.js';
import { pointInRing } from '../src/map/adminPackage.js';
import { storySchema, applyActions } from '../shared/schema.js';
import { createStory } from '../shared/seeds.js';
import { StoryTools } from '../shared/story-tools.js';
import { demo } from '../shared/demo.js';
const hash = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
const root = 'public/data/hydrolakes/';
const geometryHashes = JSON.parse(
  gunzipSync(readFileSync(root + 'geometry-hashes.json.gz')).toString(),
);
function geometryHash(g: any) {
  const polygons = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  const chunks: Buffer[] = [];
  const int = (n: number) => {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(n);
    chunks.push(b);
  };
  int(polygons.length);
  for (const polygon of polygons) {
    int(polygon.length);
    for (const ring of polygon) {
      int(ring.length);
      const bytes = Buffer.alloc(ring.length * 16);
      ring.forEach(([x, y]: number[], i: number) => {
        bytes.writeDoubleLE(x, i * 16);
        bytes.writeDoubleLE(y, i * 16 + 8);
      });
      chunks.push(bytes);
    }
  }
  return hash(Buffer.concat(chunks));
}

test('HydroLAKES packages preserve source coordinates, ring structure and unique ownership across tile edges', () => {
  const ids = new Set();
  let points = 0;
  const catalog = new Map(lakeCatalog.map((l) => [l.id, l]));
  const original = new Map(originalLakeCatalog.map((l) => [l.id, l]));
  for (const entry of [hydroManifest.overview, ...hydroManifest.tiles]) {
    const bytes = readFileSync(root + entry.file);
    assert.equal(hash(bytes), entry.sha256);
    assert.deepEqual(gunzipSync(readFileSync(root + entry.file + '.gz')), bytes);
    const data = JSON.parse(bytes.toString());
    assert.equal(data.features.length, entry.count);
    for (const f of data.features) {
      assert.ok(!ids.has(f.id), f.id);
      ids.add(f.id);
      assert.equal(geometryHash(f.geometry), geometryHashes[String(f.properties.Hylak_id)], f.id);
      const polygons =
        f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const polygon of polygons) for (const ring of polygon) points += ring.length;
      const lake = catalog.get(f.id);
      if (!lake) continue;
      assert.ok(
        polygons.some(
          ([outer, ...holes]: number[][][]) =>
            pointInRing(lake.center, outer) && !holes.some((h) => pointInRing(lake.center, h)),
        ),
        lake.label,
      );
      assert.equal(
        f.properties.label,
        original.get(f.id)?.label ?? '',
        'name overlay never rewrites source attributes',
      );
    }
  }
  assert.equal(ids.size, 44492);
  assert.equal(points, 1570301);
  assert.equal(ids.size, hydroManifest.count);
  const poyang = searchLakes('鄱阳湖')[0];
  assert.equal(poyang.sourceId, 151);
  assert.equal(poyang.labelZoom, 4.5);
  assert.equal(searchLakes('Poyang Hu')[0].id, poyang.id);
  const dongting = searchLakes('洞庭湖')[0];
  assert.equal(dongting.sourceId, 1470);
  assert.equal(dongting.coverage, 'partial');
  assert.match(lakeDescription(dongting), /不代表.*完整范围/);
  assert.match(
    lakeFeatureInfo({ source_id: 'hydrolakes:999', Hylak_id: 999, Poly_src: 'SWBD' })!.label,
    /名称待补充/,
  );
});

test('view selection retains crossing lakes and only loads detail at regional zoom', () => {
  assert.equal(lakePackagesInView([112, 29, 113, 30], 5).length, 1);
  assert.ok(lakePackagesInView([112, 29, 113, 30], 7).length > 1);
  assert.deepEqual(
    lakePackagesInView([472, 29, 473, 30], 7),
    lakePackagesInView([112, 29, 113, 30], 7),
  );
  assert.equal(lakePackagesInView([-80, -20, -79, -19], 8).length, 1);
  assert.deepEqual(
    validateStyleMin({
      version: 8,
      sources: {
        lakes: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
        'lake-labels': { type: 'geojson', data: lakeLabels() },
      },
      layers: [...lakeWaterLayers(), ...lakeNameLayers()],
    }).map((e) => e.message),
    [],
  );
});

test('name enrichment is traceable to GDW IDs or contained GeoNames water points; aliases reach the model', () => {
  const meta = JSON.parse(readFileSync('public/data/lake-names/manifest.json', 'utf8'));
  const gdwRaw = gunzipSync(readFileSync('public/data/lake-names/gdw-used.json.gz'));
  const gnRaw = gunzipSync(readFileSync('public/data/lake-names/geonames-matched.json.gz'));
  const allWaterRaw = gunzipSync(readFileSync('public/data/lake-names/geonames-water.json.gz'));
  assert.equal(hash(gdwRaw), meta.gdw.excerptSha256);
  assert.equal(hash(gnRaw), meta.geonames.excerptSha256);
  assert.equal(hash(allWaterRaw), meta.geonames.waterSha256);
  const allWater = new Map<string, any>(
    JSON.parse(allWaterRaw.toString()).map((r: any) => [String(r.id), r]),
  );
  const gdw = new Map<string, any>(JSON.parse(gdwRaw.toString()).map((r: any) => [r.GDW_ID, r]));
  const gn = new Map<string, any>(JSON.parse(gnRaw.toString()).map((r: any) => [String(r.id), r]));
  const source = new Map<string, any>();
  for (const entry of [hydroManifest.overview, ...hydroManifest.tiles])
    for (const f of JSON.parse(readFileSync(root + entry.file, 'utf8')).features)
      source.set(f.id, f);
  for (const lake of lakeCatalog) {
    const f = source.get(lake.id);
    assert.ok(f);
    for (const e of lake.nameEvidence ?? []) {
      if (e.source === 'GDW v1.0') {
        const r = gdw.get(e.sourceId);
        assert.equal(Number(r.HYLAK_ID), f.properties.Hylak_id);
        if (e.method === 'grand-id') assert.equal(Number(r.GRAND_ID), f.properties.Grand_id);
        assert.equal(r[e.field], e.value);
      }
      if (e.source === 'GeoNames') {
        const r = gn.get(e.sourceId);
        const { hylakId: _joinedId, ...originalPoint } = r;
        assert.deepEqual(originalPoint, allWater.get(e.sourceId));
        assert.ok(['LK', 'RSV'].includes(r.code));
        assert.equal(r.hylakId, lake.sourceId);
        assert.deepEqual(e.point, r.center);
        assert.ok([r.name, ...r.aliases].includes(e.value));
        const polygons =
          f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
        assert.ok(
          polygons.some(
            ([outer, ...holes]: number[][][]) =>
              pointInRing(r.center, outer) && !holes.some((h) => pointInRing(r.center, h)),
          ),
          lake.label,
        );
      }
    }
  }
  assert.equal(lakeCatalog.length, meta.totalNamed);
  assert.ok(meta.chineseNamed >= 1900);
  for (const rejection of meta.rejected) {
    if (rejection.source !== 'GeoNames' || !rejection.reason.endsWith('names-in-polygon')) continue;
    assert.ok(
      !lakeCatalog
        .find((l) => String(l.sourceId) === rejection.id)
        ?.nameEvidence?.some((e) => e.source === 'GeoNames'),
    );
  }
  const tools = new StoryTools(createStory('湖泊名称', 'history'));
  const target = (tools.call('search_lakes', { query: '仙宫湖' }) as any[])[0];
  assert.equal(target.sourceId, 15423);
  assert.equal(target.label, '紧水滩水库');
  assert.equal(target.nameStatus, 'verified-name');
  assert.ok(target.nameEvidence.some((e: any) => e.method === 'document-and-id'));
  assert.equal(searchLakes('Jinshuitan')[0].id, target.id);
  const associated = lakeCatalog.find((l) => l.nameStatus === 'dam-associated')!;
  assert.match(associated.label, / · 库区$/);
  assert.match(lakeDescription(associated), /不代表已确认湖泊名称/);
});

test('lake downloads handle gzip and HTTP-decoded bodies, cache results, reject corrupt or aborted loads', async () => {
  const entry = hydroManifest.tiles.find((t) => t.count < 10)!;
  let requests = 0;
  const request = (async (url: string) => {
    requests++;
    return new Response(readFileSync(String(url)));
  }) as typeof fetch;
  const loader = new LakePackageLoader(root, request);
  const signal = new AbortController().signal;
  const first = await loader.read(entry, signal);
  assert.equal(first.features.length, entry.count);
  assert.equal(await loader.read(entry, signal), first);
  assert.equal(requests, 1);
  const decoded = new LakePackageLoader(
    root,
    (async (url: string) =>
      new Response(readFileSync(String(url).replace(/\.gz$/, '')))) as typeof fetch,
  );
  assert.deepEqual(await decoded.read(entry, signal), first);
  const bad = new LakePackageLoader(root, (async () => new Response('{}')) as typeof fetch);
  await assert.rejects(bad.read(entry, signal), /校验/);
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(loader.read(entry, abort.signal), { name: 'AbortError' });
});

test('model lookup exposes partial coverage and a dated JRC reference; legacy and saved layer states remain compatible', () => {
  const legacy: any = structuredClone(createStory('湖泊测试', 'history'));
  delete legacy.layers.lakes;
  delete legacy.layers.lakeReference;
  const story = storySchema.parse(legacy);
  assert.equal(story.layers.lakes, true);
  assert.equal(story.layers.lakeReference, false);
  const tools = new StoryTools(story);
  const matches = tools.call('search_lakes', { query: '洞庭湖' }) as any[];
  assert.equal(matches.length, 1);
  assert.equal(matches[0].coverage, 'partial');
  assert.match(matches[0].source.url, /hydrosheds/);
  assert.equal(matches[0].observationDate, null);
  assert.equal(matches[0].reference.period, '1984–2024');
  assert.equal((tools.call('search_lakes', {}) as any[]).length, 30);
  const focused = applyActions(story, { actions: demo(story, '显示洞庭湖').actions });
  assert.deepEqual(focused.view.center, matches[0].center);
  assert.deepEqual(focused.markers, story.markers);
  assert.match(demo(story, '显示洞庭湖').content, /仅代表局部/);
  const hidden = applyActions(focused, { actions: demo(focused, '关闭湖泊').actions });
  assert.equal(hidden.layers.rivers, story.layers.rivers);
  assert.equal(storySchema.parse(JSON.parse(JSON.stringify(hidden))).layers.lakes, false);
  const comparison = applyActions(story, {
    actions: [{ type: 'set_layers', layers: { ...story.layers, lakeReference: true } }],
  });
  assert.equal(
    storySchema.parse(JSON.parse(JSON.stringify(comparison))).layers.lakeReference,
    true,
  );
});

test('JRC comparison images are fixed, georeferenced observations with explicit temporal and display resolution metadata', () => {
  assert.equal(lakeReference.period, '1984–2024');
  assert.equal(lakeReference.resolutionMeters, 30);
  assert.equal(lakeReference.displayMercatorMeters, 50);
  for (const a of lakeReference.images) {
    const bytes = readFileSync('public/data/lake-reference/' + a.file);
    assert.equal(hash(bytes), a.sha256);
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(bytes.readUInt32BE(16), a.displaySize[0]);
    assert.equal(bytes.readUInt32BE(20), a.displaySize[1]);
    assert.equal(bytes[25], 3, 'lossless indexed colors, no image synthesis');
    assert.deepEqual(a.corners[0], [a.bounds[0], a.bounds[3]]);
    assert.deepEqual(a.corners[2], [a.bounds[2], a.bounds[1]]);
  }
});
