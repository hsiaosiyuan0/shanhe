import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { createStory } from '../shared/seeds.js';
import { applyActions, storySchema, type Story } from '../shared/schema.js';
import {
  parseRiverGeoJSON,
  riverChannelSchema,
  riverGeometrySchema,
  riverLines,
  exportRiverGeoJSON,
} from '../shared/rivers.js';
import { riverCatalog } from '../shared/river-catalog.js';
import { StoryTools, toolDefinitions, agentToolSchema } from '../shared/story-tools.js';
import { respondWithApi } from '../shared/llm-client.js';
import {
  customRiverFeatures,
  customRiverLabels,
  customRiverLayers,
} from '../src/map/customRivers.js';
import { Store } from '../server/db.js';
import { createApp } from '../server/app.js';

const geometry = riverGeometrySchema.parse({
  type: 'MultiLineString',
  coordinates: [
    [
      [110, 30],
      [110.2, 30.4],
      [110.8, 30.2],
    ],
    [
      [111.4, 30],
      [112, 31],
    ],
  ],
});
const river = riverChannelSchema.parse({
  id: 'test-river',
  label: '测试河段',
  geometry,
  period: 'historical',
  periodLabel: '测试时期，非真实史料',
  source: { title: 'test', url: 'https://example.test/data' },
});

test('legacy stories default to no channels; imports retain gaps and reject wrong geometry/CRS/oversize', () => {
  const { riverChannels: _, ...legacy } = createStory('legacy', 'history');
  assert.deepEqual(storySchema.parse(legacy).riverChannels, []);
  const imported = parseRiverGeoJSON(exportRiverGeoJSON(river));
  assert.deepEqual(imported.geometry, geometry);
  const collection = parseRiverGeoJSON({
    type: 'FeatureCollection',
    features: riverLines(geometry).map((coordinates) => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates },
    })),
  });
  assert.deepEqual(collection.geometry, geometry);
  for (const bad of [
    { type: 'Point', coordinates: [110, 30] },
    {
      type: 'LineString',
      coordinates: [
        [30, 110],
        [31, 111],
      ],
    },
    {
      type: 'LineString',
      coordinates: [
        [110, 30],
        [110, 30],
      ],
    },
    {
      type: 'LineString',
      coordinates: [
        [110, 30],
        [111, 31],
      ],
      crs: { type: 'EPSG:3857' },
    },
    {
      type: 'LineString',
      coordinates: Array.from({ length: 8001 }, (_, i) => [110 + i / 10000, 30]),
    },
    { type: 'FeatureCollection', features: [] },
  ])
    assert.throws(() => parseRiverGeoJSON(bad));
});

test('channel CRUD batches are atomic and partial updates do not reset omitted values', () => {
  const original = createStory('atomic', 'history');
  const added = applyActions(original, { actions: [{ type: 'add_river', river }] });
  const hidden = applyActions(added, {
    actions: [{ type: 'update_river', id: river.id, patch: { visible: false, color: '#786093' } }],
  });
  assert.deepEqual(hidden.riverChannels[0], { ...river, visible: false, color: '#786093' });
  assert.deepEqual(original.riverChannels, []);
  for (const action of [
    { type: 'add_river', river },
    { type: 'remove_river', id: 'missing' },
    {
      type: 'update_river',
      id: river.id,
      patch: {
        geometry: {
          type: 'LineString',
          coordinates: [
            [999, 0],
            [0, 0],
          ],
        },
      },
    },
  ])
    assert.throws(() =>
      applyActions(added, {
        actions: [{ type: 'update_river', id: river.id, patch: { color: '#786093' } }, action],
      }),
    );
  assert.throws(
    () =>
      applyActions(added, {
        actions: [
          { type: 'update_river', id: river.id, patch: { visible: false } },
          { type: 'add_river', river },
        ],
      }),
    /ID/,
  );
  assert.equal(added.riverChannels[0].visible, true);
  assert.equal(
    applyActions(added, { actions: [{ type: 'remove_river', id: river.id }] }).riverChannels.length,
    0,
  );
  assert.equal(
    applyActions(added, {
      actions: [{ type: 'update_river', id: river.id, patch: { source: null } }],
    }).riverChannels[0].source,
    undefined,
  );
  assert.throws(() => storySchema.parse({ ...added, riverChannels: [river, river] }), /ID/);
  const large = {
    ...river,
    geometry: {
      type: 'LineString',
      coordinates: Array.from({ length: 8000 }, (_, i) => [110 + i / 10000, 30]),
    },
  };
  assert.throws(
    () =>
      storySchema.parse({
        ...added,
        riverChannels: Array.from({ length: 4 }, (_, i) => ({ ...large, id: `large-${i}` })),
      }),
    /24,000/,
  );
});

test('catalog geometry matches bundled source exactly and model tools preserve provenance appropriately', () => {
  const source = JSON.parse(readFileSync('public/data/rivers.geojson', 'utf8'));
  const names: Record<string, string> = { han: 'Han', dadu: 'Dadu', gan: 'Gan', xi: 'Xi' };
  for (const entry of riverCatalog) {
    const parts = source.features
      .filter((f: any) => f.properties.name === names[entry.id])
      .flatMap((f: any) =>
        f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates,
      );
    assert.deepEqual(riverLines(entry.geometry), parts);
  }
  const tools = new StoryTools(createStory('tools', 'history'));
  assert.equal((tools.call('search_rivers', { query: '汉江' }) as any[])[0].id, 'han');
  tools.call('apply_story_actions', {
    actions: [{ type: 'add_catalog_river', catalogId: 'han', id: 'my-han' }],
  });
  const channel = tools.story.riverChannels[0];
  assert.equal(channel.confidence, 'approximate');
  assert.ok(channel.source);
  assert.ok(!('geometry' in tools.context().story.riverChannels[0]));
  assert.deepEqual(
    (tools.call('get_river_data', { scope: 'story', id: 'my-han' }) as any).geometry,
    channel.geometry,
  );
  tools.apply({ actions: [{ type: 'update_river', id: 'my-han', patch: { color: '#786093' } }] });
  assert.deepEqual(tools.story.riverChannels[0].source, channel.source);
  tools.apply({ actions: [{ type: 'update_river', id: 'my-han', patch: { geometry } }] });
  assert.equal(tools.story.riverChannels[0].confidence, 'unverified');
  assert.equal(tools.story.riverChannels[0].source, undefined);
  tools.apply({ actions: [{ type: 'add_river', river: { ...river, confidence: 'approximate' } }] });
  assert.equal(tools.story.riverChannels[1].source, undefined);
  assert.equal(tools.story.riverChannels[1].confidence, 'unverified');
  const previous = structuredClone(tools.story);
  const count = tools.actions.length;
  assert.throws(() =>
    tools.apply({
      actions: [
        { type: 'remove_river', id: 'my-han' },
        { type: 'add_catalog_river', catalogId: 'missing', id: 'bad' },
      ],
    }),
  );
  assert.deepEqual(tools.story, previous);
  assert.equal(tools.actions.length, count);
  assert.doesNotThrow(() => JSON.stringify(agentToolSchema(toolDefinitions)));
});

test('map retains original geometry and on-channel label anchors with valid styles', () => {
  assert.deepEqual(customRiverFeatures([river]).features[0].geometry, geometry);
  assert.equal(customRiverFeatures([{ ...river, visible: false }]).features.length, 0);
  const label = customRiverLabels([river]).features[0];
  assert.ok(
    riverLines(geometry)
      .flat()
      .some((p) => JSON.stringify(p) === JSON.stringify(label.geometry.coordinates)),
  );
  assert.match(label.properties!.label, /测试时期/);
  assert.deepEqual(
    validateStyleMin({
      version: 8,
      sources: {
        'custom-rivers': { type: 'geojson', data: customRiverFeatures([river]) },
        'custom-river-labels': { type: 'geojson', data: customRiverLabels([river]) },
      },
      layers: customRiverLayers(),
    }),
    [],
  );
});

test('HTTP channels persist, export/import and restore snapshots with optimistic revisions', async () => {
  const store = new Store(':memory:');
  const server = createServer(createApp(store, '/nonexistent'));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api`;
  const request = async (path: string, body?: unknown) =>
    fetch(base + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  try {
    const story = store.list()[0];
    assert.equal((await (await request('/tools')).json()).tools.length, 5);
    assert.equal((await (await request('/river-catalog')).json()).length, 4);
    const added = (await (
      await request(`/stories/${story.id}/actions`, {
        revision: story.revision,
        actions: [{ type: 'add_river', river }],
      })
    ).json()) as Story;
    assert.deepEqual(store.get(story.id).riverChannels, [river]);
    const snap = store.snapshot(story.id, 'river');
    const exported = await (await request(`/stories/${story.id}/export`)).json();
    const imported = await (await request('/import', exported)).json();
    assert.deepEqual(imported.riverChannels, [river]);
    const stale = await request(`/stories/${story.id}/actions`, {
      revision: 0,
      actions: [{ type: 'remove_river', id: river.id }],
    });
    assert.equal(stale.status, 409);
    const removed = await (
      await request(`/stories/${story.id}/actions`, {
        revision: added.revision,
        actions: [{ type: 'remove_river', id: river.id }],
      })
    ).json();
    store.restore(story.id, snap.id, removed.revision);
    assert.deepEqual(store.get(story.id).riverChannels, [river]);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    store.close();
  }
});

test('model API exposes river read tools and commits catalog edits through the same action pipeline', async () => {
  let round = 0;
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    const declared = body.tools.map((t: any) => t.function.name);
    assert.ok(declared.includes('search_rivers') && declared.includes('get_river_data'));
    const calls = [
      { name: 'search_rivers', arguments: JSON.stringify({ query: '汉江' }) },
      { name: 'get_river_data', arguments: JSON.stringify({ id: 'han', scope: 'catalog' }) },
      {
        name: 'apply_story_actions',
        arguments: JSON.stringify({
          actions: [
            { type: 'add_catalog_river', catalogId: 'han', id: 'api-han' },
            { type: 'update_river', id: 'api-han', patch: { color: '#786093' } },
          ],
        }),
      },
    ];
    if (round === 1) assert.match(body.messages.at(-1).content, /汉江/);
    if (round === 2) assert.match(body.messages.at(-1).content, /MultiLineString/);
    const message =
      round < calls.length
        ? { tool_calls: [{ id: `call-${round}`, type: 'function', function: calls[round] }] }
        : { content: '汉江已添加。' };
    round++;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message }] }));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  try {
    const story = createStory('api', 'history');
    const reply = await respondWithApi(
      { baseUrl: `http://127.0.0.1:${(server.address() as any).port}`, model: 'test', apiKey: '' },
      story,
      [],
      '添加汉江',
      { signal: new AbortController().signal, emit: () => {} },
    );
    assert.equal(story.riverChannels.length, 0);
    const next = applyActions(story, { actions: reply.actions });
    assert.equal(next.riverChannels[0].label, '汉江');
    assert.equal(next.riverChannels[0].color, '#786093');
    assert.deepEqual(next.riverChannels[0].geometry, riverCatalog[0].geometry);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
