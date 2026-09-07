import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { Store } from '../server/db.js';
import { createApp } from '../server/app.js';
import { probeCodex } from '../server/agents/codex.js';

async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'shanhe-agent-test-'));
  const cli = join(dir, 'codex.mjs');
  copyFileSync(new URL('./fixtures/fake-codex.mjs', import.meta.url), cli);
  chmodSync(cli, 0o700);
  const store = new Store(join(dir, 'story.sqlite'));
  store.setSettings({
    connection: 'codex',
    agentPath: cli,
    agentModel: 'fixture',
    connectionId: 'test',
  });
  const server = createApp(store, '/nonexistent').listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', r));
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}/api`;
  const id = store.list()[0].id;
  return {
    dir,
    cli,
    store,
    id,
    async chat(prompt: string, stream = false, signal?: AbortSignal) {
      return fetch(`${base}/stories/${id}/chat`, {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
          ...(stream ? { Accept: 'text/event-stream' } : {}),
        },
        body: JSON.stringify({ prompt, revision: store.get(id).revision }),
      });
    },
    async close() {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('local probe reads models and login state without exposing account or config secrets', async () => {
  const f = await fixture();
  try {
    const probe = await probeCodex(f.cli);
    assert.equal(probe.connected, true);
    assert.equal(probe.models[0].id, 'fixture');
    assert.ok(!JSON.stringify(probe).includes('never-return-this'));
    const unlogged = join(f.dir, 'unlogged.mjs');
    copyFileSync(f.cli, unlogged);
    chmodSync(unlogged, 0o700);
    const missing = await probeCodex(unlogged);
    assert.equal(missing.loginRequired, true);
    assert.equal(missing.connected, false);
    assert.deepEqual(missing.models, []);
  } finally {
    await f.close();
  }
});

test('agent tools stream, commit atomically, strip unverified sources and resume across store reopen', async () => {
  const f = await fixture();
  try {
    const before = f.store.get(f.id);
    const response = await f.chat('ADD', true);
    const frames = (await response.text())
      .split('\n\n')
      .filter((t) => t.startsWith('data: '))
      .map((t) => JSON.parse(t.slice(6)));
    assert.ok(frames.some((e) => e.type === 'text'));
    assert.ok(frames.some((e) => e.type === 'tool' && e.count === 2));
    assert.equal(frames.at(-1).type, 'complete');
    const after = f.store.get(f.id);
    assert.equal(after.markers.length, before.markers.length + 1);
    assert.equal(after.markers.at(-1)?.confidence, 'unverified');
    assert.equal(after.markers.at(-1)?.source, undefined);
    assert.equal(f.store.messages(f.id).length, 2);
    const session = f.store.agentSession(f.id)!;
    const reopened = new Store(join(f.dir, 'story.sqlite'));
    assert.deepEqual(reopened.agentSession(f.id), session);
    reopened.close();
    const next = await (await f.chat('FOLLOWUP')).json();
    assert.match(next.messages.at(-1).content, new RegExp(session.threadId));
    assert.equal(f.store.agentSession(f.id)?.threadId, session.threadId);
    f.store.save({ ...f.store.get(f.id), title: '手动编辑' }, next.story.revision);
    assert.equal(f.store.agentSession(f.id), undefined);
    await (await f.chat('FOLLOWUP')).text();
    assert.notEqual(f.store.agentSession(f.id)?.threadId, session.threadId);
  } finally {
    await f.close();
  }
});

test('agent crash discards staged changes; malformed tools and non-story approvals stay contained', async () => {
  const f = await fixture();
  try {
    const before = f.store.detail(f.id);
    const failed = await f.chat('CRASH');
    assert.equal(failed.status, 502);
    await failed.text();
    assert.deepEqual(f.store.detail(f.id), before);
    assert.equal(f.store.agentSession(f.id), undefined);
    const invalid = await (await f.chat('INVALID')).json();
    assert.equal(invalid.story.markers.length, before.story.markers.length);
    assert.equal(invalid.story.layers.admin, before.story.layers.admin);
    const denied = await (await f.chat('DENY')).json();
    assert.equal(denied.messages.at(-1).content, '权限已拒绝');
  } finally {
    await f.close();
  }
});

test('disconnect cancels staged actions, releases the story lock and permits a clean retry', async () => {
  const f = await fixture();
  try {
    const before = f.store.detail(f.id);
    const controller = new AbortController();
    const response = await f.chat('PAUSE', true, controller.signal);
    const reader = response.body!.getReader();
    let data = '';
    while (!data.includes('"count":2')) {
      const part = await reader.read();
      data += new TextDecoder().decode(part.value);
    }
    const conflict = await f.chat('FOLLOWUP');
    assert.equal(conflict.status, 409);
    await conflict.text();
    controller.abort();
    for (let i = 0; i < 100 && f.store.db.prepare('SELECT 1 FROM chat_locks').get(); i++)
      await delay(10);
    assert.equal(f.store.db.prepare('SELECT 1 FROM chat_locks').get(), undefined);
    assert.deepEqual(f.store.detail(f.id), before);
    assert.equal(f.store.agentSession(f.id), undefined);
    const retry = await f.chat('FOLLOWUP');
    assert.equal(retry.status, 200);
    await retry.text();
  } finally {
    await f.close();
  }
});

test('concurrent manual edit prevents an in-flight agent from overwriting the latest story', async () => {
  const f = await fixture();
  try {
    const response = await f.chat('DELAY', true);
    const reader = response.body!.getReader();
    let data = '';
    while (!data.includes('"count":2')) {
      const part = await reader.read();
      data += new TextDecoder().decode(part.value);
    }
    const story = f.store.get(f.id);
    f.store.save({ ...story, title: '较新的手动编辑' }, story.revision);
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      data += new TextDecoder().decode(part.value);
    }
    assert.ok(data.includes('"type":"error"'));
    for (let i = 0; i < 100 && f.store.db.prepare('SELECT 1 FROM chat_locks').get(); i++)
      await delay(10);
    assert.equal(f.store.get(f.id).title, '较新的手动编辑');
    assert.deepEqual(f.store.get(f.id).markers, story.markers);
  } finally {
    await f.close();
  }
});
