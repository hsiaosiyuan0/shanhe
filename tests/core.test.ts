import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import { Store } from '../server/db.js';
import { createApp } from '../server/app.js';
import { createStory } from '../server/seeds.js';
import { applyActions, type Story, type StoryDetail } from '../shared/schema.js';
import { makeMessage } from '../server/llm.js';

async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('No port');
  return `http://127.0.0.1:${address.port}`;
}
async function close(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
async function fixture() {
  const store = new Store(':memory:');
  const server = createServer(createApp(store, '/nonexistent'));
  const url = await listen(server);
  return {
    store,
    server,
    url,
    async request(path: string, method = 'GET', body?: unknown, headers?: Record<string, string>) {
      const response = await fetch(url + '/api' + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = response.status === 204 ? undefined : await response.json();
      return { status: response.status, data };
    },
    async cleanup() {
      await close(server);
      store.close();
    },
  };
}

test('a batch with an invalid coordinate leaves the original story untouched', () => {
  const story = createStory('test', 'history');
  assert.throws(() =>
    applyActions(story, {
      actions: [
        {
          type: 'add_marker',
          marker: { id: 'ok', label: 'A', coordinates: [110, 30], description: '', kind: 'place' },
        },
        {
          type: 'add_marker',
          marker: { id: 'bad', label: 'B', coordinates: [181, 30], description: '', kind: 'place' },
        },
      ],
    }),
  );
  assert.equal(story.markers.length, 0);
});
test('duplicate IDs reject the whole action batch', () => {
  const story = createStory('test', 'history');
  const marker = { id: 'same', label: 'A', coordinates: [110, 30], description: '', kind: 'place' };
  assert.throws(
    () =>
      applyActions(story, {
        actions: [
          { type: 'add_marker', marker },
          { type: 'add_marker', marker },
        ],
      }),
    /ID/,
  );
  assert.equal(story.markers.length, 0);
});
test('SQLite survives restart and intentionally empty libraries are not reseeded', () => {
  const directory = mkdtempSync(join(tmpdir(), 'shanhe-test-'));
  const path = join(directory, 'story.sqlite');
  try {
    let store = new Store(path);
    assert.equal(store.list().length, 3);
    const story = store.list()[0];
    store.save({ ...story, title: 'Persisted' }, 0);
    store.close();
    store = new Store(path);
    assert.equal(store.get(story.id).title, 'Persisted');
    store.list().forEach((s) => store.delete(s.id));
    store.close();
    store = new Store(path);
    assert.equal(store.list().length, 0);
    store.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
test('optimistic revisions prevent lost updates; snapshots restore conversation and keep a backup', () => {
  const store = new Store(':memory:');
  try {
    const story = store.list()[0];
    const snapshot = store.snapshot(story.id, 'before');
    store.save({ ...story, title: 'new' }, 0);
    assert.throws(() => store.save({ ...story, title: 'stale' }, 0), /另一处更新/);
    store.addMessage(story.id, makeMessage('user', 'new conversation', [], 'demo'));
    store.restore(story.id, snapshot.id, 1);
    assert.equal(store.get(story.id).title, story.title);
    assert.equal(store.get(story.id).revision, 2);
    assert.equal(store.messages(story.id).length, 0);
    assert.equal(store.snapshots(story.id).length, 2);
  } finally {
    store.close();
  }
});
test('demo chat commits maps and messages together, persists on read, and exports/imports without secrets', async () => {
  const f = await fixture();
  try {
    const story = f.store.list()[0];
    f.store.setSettings({
      baseUrl: 'https://example.com/v1',
      model: '',
      apiKey: 'secret-not-exported',
    });
    const result = await f.request(`/stories/${story.id}/chat`, 'POST', {
      prompt: '标记主要山川',
      revision: 0,
    });
    assert.equal(result.status, 200);
    const d = result.data as StoryDetail;
    assert.equal(d.story.markers.length, 5);
    assert.equal(d.messages.length, 2);
    assert.equal(d.messages[1].actions.length, 6);
    assert.equal(d.messages[1].mode, 'demo');
    const read = await f.request(`/stories/${story.id}`);
    assert.deepEqual(read.data, d);
    const exported = await f.request(`/stories/${story.id}/export`);
    assert.ok(!JSON.stringify(exported.data).includes('secret-not-exported'));
    const imported = await f.request('/import', 'POST', exported.data);
    assert.equal(imported.status, 201);
    assert.notEqual(imported.data.id, story.id);
    assert.equal(f.store.messages(imported.data.id).length, 2);
    assert.equal(imported.data.markers.length, 5);
    const config = await f.request('/settings');
    assert.equal(config.data.hasKey, true);
    assert.equal(config.data.apiKey, undefined);
  } finally {
    await f.cleanup();
  }
});
test('conversation toggles elevation and modern boundaries independently of 3D', async () => {
  const f = await fixture();
  try {
    f.store.setSettings({ baseUrl: 'https://api.example.com/v1', model: '', apiKey: '' });
    let story = f.store.list()[0];
    for (const [content, key, expected] of [
      ['打开今地对照', 'admin', true],
      ['关闭海拔设色', 'elevation', false],
      ['显示海拔分层', 'elevation', true],
    ] as const) {
      const result = await f.request(`/stories/${story.id}/chat`, 'POST', {
        prompt: content,
        revision: story.revision,
      });
      assert.equal(result.status, 200);
      story = result.data.story;
      assert.equal(story.layers[key], expected);
      assert.equal(story.layers.terrain, false);
      assert.equal(f.store.get(story.id).layers[key], expected);
    }
    assert.equal(story.layers.admin, true);
  } finally {
    await f.cleanup();
  }
});
test('CRUD, validation, conflict, origin checks, and invalid imports', async () => {
  const f = await fixture();
  try {
    const created = await f.request('/stories', 'POST', { title: '  新故事  ', kind: 'history' });
    assert.equal(created.status, 201);
    assert.equal(created.data.title, '新故事');
    assert.equal((await f.request('/stories', 'POST', { title: '', kind: 'history' })).status, 400);
    assert.equal(
      (await f.request(`/stories/${created.data.id}`, 'PUT', { ...created.data, title: 'changed' }))
        .status,
      200,
    );
    assert.equal((await f.request(`/stories/${created.data.id}`, 'PUT', created.data)).status, 409);
    assert.equal(
      (await f.request('/settings', 'PUT', { baseUrl: 'http://remote.example.com', model: 'test' }))
        .status,
      400,
    );
    assert.equal(
      (await f.request('/stories', 'GET', undefined, { Origin: 'https://malicious.example' }))
        .status,
      403,
    );
    assert.equal((await f.request('/import', 'POST', { format: 'invalid' })).status, 400);
    assert.equal((await f.request(`/stories/${created.data.id}`, 'DELETE')).status, 204);
    assert.equal((await f.request(`/stories/${created.data.id}`)).status, 404);
  } finally {
    await f.cleanup();
  }
});
test('real provider protocol: staged tool results are fed back and unverified sources are stripped', async () => {
  const f = await fixture();
  let calls = 0;
  const mock = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const input = JSON.parse(body);
    res.setHeader('Content-Type', 'application/json');
    calls++;
    if (calls === 1) {
      assert.equal(input.tools[0].function.name, 'apply_story_actions');
      res.end(
        JSON.stringify({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call_1',
                    type: 'function',
                    function: {
                      name: 'apply_story_actions',
                      arguments: JSON.stringify({
                        actions: [
                          {
                            type: 'add_marker',
                            marker: {
                              id: 'model-marker',
                              label: 'LLM place',
                              coordinates: [115, 30],
                              kind: 'place',
                              description: 'test',
                              confidence: 'reference',
                              source: { title: 'fabricated', url: 'https://example.com' },
                            },
                          },
                        ],
                      }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      );
    } else {
      assert.equal(input.messages.at(-1).role, 'tool');
      assert.equal(JSON.parse(input.messages.at(-1).content).ok, true);
      res.end(
        JSON.stringify({ choices: [{ message: { role: 'assistant', content: '地点已标记。' } }] }),
      );
    }
  });
  const url = await listen(mock);
  try {
    f.store.setSettings({ baseUrl: url + '/v1', model: 'mock', apiKey: '' });
    const story = f.store.list()[0];
    const result = await f.request(`/stories/${story.id}/chat`, 'POST', {
      prompt: 'add marker',
      revision: 0,
    });
    assert.equal(result.status, 200);
    assert.equal(calls, 2);
    const marker = result.data.story.markers[0];
    assert.equal(marker.confidence, 'unverified');
    assert.equal(marker.source, undefined);
    assert.equal(result.data.messages[1].mode, 'live');
  } finally {
    await close(mock);
    await f.cleanup();
  }
});
test('provider failure after a tool call rolls back the whole turn', async () => {
  const f = await fixture();
  let calls = 0;
  const mock = createServer(async (req, res) => {
    for await (const _chunk of req) {
      /* drain */
    }
    calls++;
    if (calls === 1) {
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call',
                    type: 'function',
                    function: {
                      name: 'apply_story_actions',
                      arguments: JSON.stringify({
                        actions: [
                          {
                            type: 'set_layers',
                            layers: { terrain: true, rivers: true, mountains: true, routes: true },
                          },
                        ],
                      }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      );
    } else {
      res.statusCode = 503;
      res.end('failed');
    }
  });
  const url = await listen(mock);
  try {
    f.store.setSettings({ baseUrl: url, model: 'mock' });
    const story = f.store.list()[0];
    const result = await f.request(`/stories/${story.id}/chat`, 'POST', {
      prompt: 'terrain',
      revision: 0,
    });
    assert.equal(result.status, 502);
    assert.deepEqual(f.store.get(story.id), story);
    assert.equal(f.store.messages(story.id).length, 0);
  } finally {
    await close(mock);
    await f.cleanup();
  }
});
