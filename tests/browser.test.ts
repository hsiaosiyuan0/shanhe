import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BrowserStore } from '../src/browser/store';
import { createBrowserApi } from '../src/browser/api';
import type { Story, Settings, StoryDetail, Snapshot } from '../shared/schema';

const json = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) });
function fixture() {
  const name = `test-${crypto.randomUUID()}`;
  const store = new BrowserStore(name);
  return { name, store, ...createBrowserApi(store) };
}

test('browser stories survive reopening; clearing the library does not reseed it', async () => {
  const { name, store, api } = fixture();
  const stories = await api<Story[]>('/stories');
  assert.equal(stories.length, 3);
  assert.equal(stories[0].title, '苏轼的一生');
  const created = await api<Story>(
    '/stories',
    json('POST', { title: '我的历史故事', kind: 'history', template: 'blank' }),
  );
  await api(`/stories/${created.id}`, json('PUT', { ...created, subtitle: '重新打开后保留' }));
  await store.close();
  const reopened = new BrowserStore(name);
  assert.equal((await reopened.detail(created.id)).story.subtitle, '重新打开后保留');
  for (const story of await reopened.list()) await reopened.delete(story.id);
  await reopened.close();
  const empty = new BrowserStore(name);
  assert.equal((await empty.list()).length, 0);
  await empty.close();
});

test('browser demo, snapshots, restore and JSON migration retain a complete story', async () => {
  const { store, api, streamChat } = fixture();
  try {
    const story = (await store.list())[0];
    const snapshot = await api<Snapshot>(
      `/stories/${story.id}/snapshots`,
      json('POST', { name: '探索之前' }),
    );
    const reply = await streamChat(
      story.id,
      { prompt: '标记主要山川', revision: 0 },
      () => {},
      new AbortController().signal,
    );
    assert.equal(reply.messages.length, 2);
    assert.equal(reply.messages[1].mode, 'demo');
    assert.equal(reply.story.markers.length, 5);
    const exported = await api<{ story: Story; messages: unknown[] }>(
      `/stories/${story.id}/export`,
    );
    assert.equal(exported.messages.length, 2);
    assert.ok(!('snapshots' in exported));
    const imported = await api<Story>('/import', json('POST', exported));
    assert.notEqual(imported.id, story.id);
    assert.equal((await store.detail(imported.id)).messages.length, 2);
    const restored = await api<StoryDetail>(
      `/stories/${story.id}/snapshots/${snapshot.id}/restore`,
      json('POST', { revision: 1 }),
    );
    assert.equal(restored.story.markers.length, 0);
    assert.equal(restored.messages.length, 0);
    assert.equal(restored.snapshots.length, 2);
    assert.equal(restored.snapshots[0].name, '恢复前的自动备份');
  } finally {
    await store.close();
  }
});

test('two browser stores cannot overwrite the same revision; stale restore rolls back its backup', async () => {
  const { store, name } = fixture();
  const second = new BrowserStore(name);
  try {
    const story = (await store.list())[0];
    const snap = await store.snapshot(story.id, '开始');
    const results = await Promise.allSettled([
      store.save({ ...story, title: '甲' }, 0),
      second.save({ ...story, title: '乙' }, 0),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
    await assert.rejects(store.restore(story.id, snap.id, 0), /另一处更新/);
    assert.equal((await store.detail(story.id)).snapshots.length, 1);
  } finally {
    await store.close();
    await second.close();
  }
});

test('browser credentials stay in memory, clear explicitly, and never follow an endpoint change', async () => {
  const { store, api } = fixture();
  try {
    const config = {
      baseUrl: 'https://model.example/v1',
      model: 'test-model',
      apiKey: 'test-only-secret',
    };
    let result = await api<Settings>('/settings', json('PUT', config));
    assert.equal(result.hasKey, true);
    assert.ok(!JSON.stringify(await store.settings()).includes('test-only-secret'));
    assert.ok(!JSON.stringify(result).includes('test-only-secret'));
    const fresh = createBrowserApi(store);
    assert.equal((await fresh.api<Settings>('/settings')).hasKey, false);
    result = await api<Settings>(
      '/settings',
      json('PUT', { ...config, apiKey: undefined, clearKey: true }),
    );
    assert.equal(result.hasKey, false);
    await api('/settings', json('PUT', config));
    result = await api<Settings>(
      '/settings',
      json('PUT', { ...config, baseUrl: 'https://other.example/v1', apiKey: undefined }),
    );
    assert.equal(result.hasKey, false);
    await assert.rejects(
      api('/settings', json('PUT', { ...config, baseUrl: 'http://model.example/v1' })),
      /HTTPS/,
    );
    await assert.rejects(api('/settings', json('PUT', { ...config, connection: 'codex' })));
  } finally {
    await store.close();
  }
});

test('browser live API applies tools, downgrades generated evidence and commits with the final answer', async (t) => {
  const { store, api, streamChat } = fixture();
  const requests: { url: string; body: { messages: unknown[] } }[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    requests.push({ url, body: JSON.parse(String(init.body)) });
    return Response.json({
      choices: [
        {
          message:
            requests.length === 1
              ? {
                  role: 'assistant',
                  content: null,
                  tool_calls: [
                    {
                      id: 'call-1',
                      type: 'function',
                      function: {
                        name: 'apply_story_actions',
                        arguments: JSON.stringify({
                          actions: [
                            {
                              type: 'add_marker',
                              marker: {
                                id: 'model-marker',
                                label: '黄州',
                                coordinates: [114.87, 30.45],
                                description: '模型生成',
                                kind: 'place',
                                confidence: 'reference',
                                source: { title: '虚构出处', url: 'https://example.com' },
                              },
                            },
                          ],
                        }),
                      },
                    },
                  ],
                }
              : { role: 'assistant', content: '已标记，位置待核验。' },
        },
      ],
    });
  });
  try {
    await api(
      '/settings',
      json('PUT', {
        baseUrl: 'https://model.example/v1',
        model: 'test',
        apiKey: 'test-only-secret',
      }),
    );
    const story = (await store.list())[0];
    const result = await streamChat(
      story.id,
      { prompt: '标记黄州', revision: 0 },
      () => {},
      new AbortController().signal,
    );
    assert.equal(requests.length, 2);
    assert.equal(requests[0].url, 'https://model.example/v1/chat/completions');
    assert.ok(requests[1].body.messages.some((m) => (m as { role: string }).role === 'tool'));
    assert.equal(result.messages[1].mode, 'live');
    assert.equal(result.story.markers[0].confidence, 'unverified');
    assert.equal(result.story.markers[0].source, undefined);
    assert.equal(result.story.revision, 1);
  } finally {
    await store.close();
  }
});

test('browser cancellation and provider failure discard staged changes and messages', async (t) => {
  for (const cancel of [false, true]) {
    const { store, api, streamChat } = fixture();
    const controller = new AbortController();
    let count = 0;
    const mock = t.mock.method(globalThis, 'fetch', async () => {
      count++;
      if (count === 2) {
        if (cancel) controller.abort();
        return new Response('', { status: 503 });
      }
      return Response.json({
        choices: [
          {
            message: {
              role: 'assistant',
              tool_calls: [
                {
                  id: 'staged',
                  type: 'function',
                  function: {
                    name: 'apply_story_actions',
                    arguments: JSON.stringify({
                      actions: [
                        { type: 'set_view', view: { center: [100, 30], zoom: 8, pitch: 0 } },
                      ],
                    }),
                  },
                },
              ],
            },
          },
        ],
      });
    });
    try {
      await api('/settings', json('PUT', { baseUrl: 'https://model.example/v1', model: 'test' }));
      const story = (await store.list())[0];
      await assert.rejects(
        streamChat(story.id, { prompt: '移到这里', revision: 0 }, () => {}, controller.signal),
        cancel ? /已停止/ : /503/,
      );
      const detail = await store.detail(story.id);
      assert.deepEqual(detail.story.view, story.view);
      assert.equal(detail.story.revision, 0);
      assert.equal(detail.messages.length, 0);
    } finally {
      mock.mock.restore();
      await store.close();
    }
  }
});
