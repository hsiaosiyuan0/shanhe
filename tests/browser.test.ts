import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BrowserStore } from '../src/browser/store';
import { createBrowserApi, desktopOnlyMessage } from '../src/browser/api';
import type { Story, Message, StoryDetail, Snapshot } from '../shared/schema';
import { customRiverFeatures, customRiverLabels } from '../src/map/customRivers';

const json = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) });
function fixture() {
  const name = `test-${crypto.randomUUID()}`;
  const store = new BrowserStore(name);
  return { name, store, ...createBrowserApi(store) };
}

// Write the historical on-disk shape directly: using today's insert/import
// would already add defaults and miss the production upgrade failure.
async function rawRecord(name: string, id: string, change?: (record: any) => void) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  try {
    return await new Promise<any>((resolve, reject) => {
      const tx = db.transaction('stories', change ? 'readwrite' : 'readonly');
      const records = tx.objectStore('stories');
      const req = records.get(id);
      let record: any;
      req.onsuccess = () => {
        record = req.result;
        if (change) {
          change(record);
          records.put(record);
        }
      };
      tx.oncomplete = () => resolve(record);
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

test('an existing v1 browser library gets current story defaults without erasing edits, messages or snapshots', async () => {
  const { name, store } = fixture();
  const original = (await store.list())[0];
  const snapshot = await store.snapshot(original.id, '升级前保存的版本');
  await store.close();
  const legacy = await rawRecord(name, original.id, (record) => {
    record.story.title = '用户此前编辑过的标题';
    record.story.revision = 7;
    record.messages = [
      {
        id: 'saved-message',
        role: 'assistant',
        content: '升级前保存的对话',
        actions: [],
        mode: 'live',
        createdAt: original.createdAt,
      },
    ];
    for (const story of [record.story, record.snapshots[0].story]) {
      delete story.riverChannels;
      delete story.layers.elevation;
      delete story.layers.admin;
      delete story.layers.connections;
    }
  });
  const reopened = new BrowserStore(name);
  const { api } = createBrowserApi(reopened);
  try {
    const listed = (await api<Story[]>('/stories')).find((s) => s.id === original.id)!;
    const current = await api<StoryDetail>(`/stories/${original.id}`);
    for (const story of [listed, current.story]) {
      assert.deepEqual(story.riverChannels, []);
      assert.equal(customRiverFeatures(story.riverChannels).features.length, 0);
      assert.equal(customRiverLabels(story.riverChannels).features.length, 0);
      assert.deepEqual(story.layers, {
        ...legacy.story.layers,
        elevation: true,
        admin: false,
        connections: false,
      });
      assert.equal(story.title, legacy.story.title);
      assert.equal(story.revision, 7);
      assert.deepEqual(story.events, original.events);
      assert.deepEqual(story.routes, original.routes);
    }
    assert.deepEqual(current.messages, legacy.messages);
    const exported = await api<{ story: Story; messages: Message[] }>(
      `/stories/${original.id}/export`,
    );
    assert.deepEqual(exported.story, current.story);
    assert.deepEqual(exported.messages, legacy.messages);
    assert.deepEqual(
      await rawRecord(name, original.id),
      legacy,
      'read compatibility must not rewrite the user library',
    );
    const fresh = await reopened.snapshot(original.id, '升级后保存');
    const stored = await rawRecord(name, original.id);
    assert.deepEqual(stored.snapshots.find((s: any) => s.id === fresh.id).story.riverChannels, []);
    assert.equal(stored.story.revision, 7);
    const edited = await reopened.save({ ...current.story, subtitle: '升级后继续编辑' }, 7);
    await assert.rejects(reopened.save(current.story, 7), /另一处更新/);
    const restored = await reopened.restore(original.id, snapshot.id, edited.revision);
    assert.deepEqual(restored.story.riverChannels, []);
    assert.equal(restored.story.title, original.title);
    const beforeRestore = (await rawRecord(name, original.id)).snapshots[0];
    assert.equal(beforeRestore.name, '恢复前的自动备份');
    assert.equal(beforeRestore.story.subtitle, '升级后继续编辑');
    assert.deepEqual(beforeRestore.messages, legacy.messages);
  } finally {
    await reopened.close();
  }
});

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
