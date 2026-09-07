import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BrowserStore } from '../src/browser/store';
import { createBrowserApi, desktopOnlyMessage } from '../src/browser/api';
import type { Story, Message, StoryDetail, Snapshot } from '../shared/schema';

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

test('browser edits, snapshots and JSON migration preserve imported conversation history', async () => {
  const { name, store, api } = fixture();
  try {
    const original = (await store.list())[0];
    const history: Message[] = [
      {
        id: 'old-user',
        role: 'user',
        content: '聊聊苏轼',
        actions: [],
        mode: 'live',
        createdAt: original.createdAt,
      },
      {
        id: 'old-reply',
        role: 'assistant',
        content: '这是此前保存的探索记录。',
        actions: [],
        mode: 'live',
        createdAt: original.createdAt,
      },
    ];
    const story = await api<Story>(
      '/import',
      json('POST', {
        format: 'shanhe-story/v1',
        story: original,
        messages: history,
      }),
    );
    const importedHistory = (await store.detail(story.id)).messages;
    assert.deepEqual(
      importedHistory.map((m) => m.content),
      history.map((m) => m.content),
    );
    const snapshot = await api<Snapshot>(
      `/stories/${story.id}/snapshots`,
      json('POST', { name: '编辑之前' }),
    );
    const view = { center: [110, 30], zoom: 7, pitch: 0 };
    const edited = await api<Story>(
      `/stories/${story.id}/actions`,
      json('POST', {
        revision: 0,
        actions: [{ type: 'set_view', view }],
      }),
    );
    assert.deepEqual(edited.view, view);
    await api(`/stories/${story.id}`, json('PUT', { ...edited, subtitle: '在线整理后的故事' }));
    await store.close();
    const reopened = new BrowserStore(name);
    try {
      const { api: nextApi } = createBrowserApi(reopened);
      const exported = await nextApi<{ story: Story; messages: Message[] }>(
        `/stories/${story.id}/export`,
      );
      assert.equal(exported.story.subtitle, '在线整理后的故事');
      assert.deepEqual(exported.messages, importedHistory);
      assert.ok(!('snapshots' in exported));
      const copy = await nextApi<Story>('/import', json('POST', exported));
      assert.notEqual(copy.id, story.id);
      assert.deepEqual(
        (await reopened.detail(copy.id)).messages.map((m) => m.content),
        history.map((m) => m.content),
      );
      const restored = await nextApi<StoryDetail>(
        `/stories/${story.id}/snapshots/${snapshot.id}/restore`,
        json('POST', { revision: 2 }),
      );
      assert.deepEqual(restored.story.view, original.view);
      assert.deepEqual(restored.messages, importedHistory);
      assert.equal(restored.snapshots.length, 2);
      assert.equal(restored.snapshots[0].name, '恢复前的自动备份');
    } finally {
      await reopened.close();
    }
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

test('browser rejects model settings and chat without sending requests or changing stories', async (t) => {
  const { store, api } = fixture();
  const network = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('unexpected request');
  });
  try {
    const story = (await store.list())[0];
    const before = await store.detail(story.id);
    for (const [path, options] of [
      ['/settings', undefined],
      ['/settings', json('PUT', { baseUrl: 'https://model.example/v1', model: 'test' })],
      ['/agents/codex/status', undefined],
      [`/stories/${story.id}/chat`, json('POST', { prompt: '标记山川', revision: 0 })],
      [`/stories/${story.id}/chat/cancel`, json('POST', {})],
    ] as const) {
      await assert.rejects(api(path, options), { message: desktopOnlyMessage });
    }
    assert.equal(network.mock.callCount(), 0);
    assert.deepEqual(await store.detail(story.id), before);
  } finally {
    await store.close();
  }
});

test('custom river geometry survives IndexedDB reopening, exports and snapshot restore', async () => {
  const { name, store, api } = fixture();
  const original = (await store.list())[0];
  const added = await api<Story>(
    `/stories/${original.id}/actions`,
    json('POST', {
      revision: original.revision,
      actions: [{ type: 'add_catalog_river', catalogId: 'han', id: 'browser-han' }],
    }),
  );
  const snapshot = await api<Snapshot>(
    `/stories/${original.id}/snapshots`,
    json('POST', { name: 'river' }),
  );
  await store.close();
  const reopened = new BrowserStore(name);
  try {
    const { api: call } = createBrowserApi(reopened);
    assert.deepEqual((await reopened.detail(original.id)).story.riverChannels, added.riverChannels);
    const exported = await call<any>(`/stories/${original.id}/export`);
    const imported = await call<Story>('/import', json('POST', exported));
    assert.deepEqual(imported.riverChannels, added.riverChannels);
    const changed = await call<Story>(
      `/stories/${original.id}/actions`,
      json('POST', {
        revision: added.revision,
        actions: [{ type: 'update_river', id: 'browser-han', patch: { visible: false } }],
      }),
    );
    const restored = await call<StoryDetail>(
      `/stories/${original.id}/snapshots/${snapshot.id}/restore`,
      json('POST', { revision: changed.revision }),
    );
    assert.deepEqual(restored.story.riverChannels, added.riverChannels);
  } finally {
    await reopened.close();
  }
});
