#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
if (process.argv.includes('--version')) {
  console.log('codex-cli 0.153.2');
  process.exit(0);
}
const send = (packet) => process.stdout.write(JSON.stringify(packet) + '\n');
let threadId, turnId, prompt, story;
const lines = createInterface({ input: process.stdin });
lines.on('line', (line) => {
  const p = JSON.parse(line);
  if (p.method === 'initialize') return send({ id: p.id, result: { userAgent: 'test' } });
  if (p.method === 'account/read')
    return send({
      id: p.id,
      result: {
        account: process.argv[1].includes('unlogged')
          ? null
          : { type: 'chatgpt', email: 'never-return-this@example.test' },
        requiresOpenaiAuth: true,
      },
    });
  if (p.method === 'model/list')
    return send({
      id: p.id,
      result: {
        data: [{ model: 'fixture', displayName: 'Fixture', isDefault: true }],
        nextCursor: null,
      },
    });
  if (p.method === 'config/read')
    return send({
      id: p.id,
      result: {
        config: { mcp_servers: { private: { token: 'never-return-this', enabled: true } } },
      },
    });
  if (p.method === 'thread/start' || p.method === 'thread/resume') {
    if (
      p.method === 'thread/start' &&
      !['search_rivers', 'get_river_data'].every((name) =>
        p.params.dynamicTools.some((t) => t.name === name),
      )
    )
      return send({ id: p.id, error: { code: -1, message: 'River tools missing' } });
    if (
      p.params.sandbox !== 'read-only' ||
      p.params.config['mcp_servers.private.enabled'] !== false ||
      p.params.config['features.shell_tool'] !== false
    )
      return send({ id: p.id, error: { code: -1, message: 'Unexpected tool permissions' } });
    threadId = p.params.threadId || 'fixture-' + randomUUID();
    return send({ id: p.id, result: { thread: { id: threadId } } });
  }
  if (p.method === 'turn/start') {
    prompt = p.params.input[0].text;
    turnId = randomUUID();
    send({ id: p.id, result: { turn: { id: turnId } } });
    send({ method: 'turn/started', params: { threadId, turn: { id: turnId } } });
    return send({
      id: 'context-call',
      method: 'item/tool/call',
      params: { threadId, turnId, callId: 'context', tool: 'get_story_context', arguments: {} },
    });
  }
  if (p.id === 'context-call') {
    story = JSON.parse(p.result.contentItems[0].text).story;
    if (prompt.includes('RIVER'))
      return send({
        id: 'river-search',
        method: 'item/tool/call',
        params: {
          threadId,
          turnId,
          callId: 'river-search',
          tool: 'search_rivers',
          arguments: { query: '汉江' },
        },
      });
    if (prompt.includes('DENY'))
      return send({
        id: 'approval',
        method: 'item/commandExecution/requestApproval',
        params: { threadId, turnId },
      });
    if (prompt.includes('FOLLOWUP')) return finish('续聊：' + threadId);
    send({
      id: 'apply-call',
      method: 'item/tool/call',
      params: {
        threadId,
        turnId,
        callId: 'apply',
        tool: 'apply_story_actions',
        arguments: {
          actions: [
            {
              type: 'add_marker',
              marker: {
                id: randomUUID(),
                label: '测试地点',
                kind: 'place',
                coordinates: prompt.includes('INVALID') ? [999, 30] : [110, 30],
                description: '自动测试',
                confidence: 'reference',
                source: { title: 'unverified', url: 'https://example.test/' },
              },
            },
            { type: 'set_layers', layers: { ...story.layers, admin: true } },
          ],
        },
      },
    });
  }
  if (p.id === 'approval') {
    if (p.result?.decision !== 'decline') process.exit(2);
    return finish('权限已拒绝');
  }
  if (p.id === 'river-search') {
    const entry = JSON.parse(p.result.contentItems[0].text)[0];
    if (entry?.id !== 'han') return process.exit(2);
    return send({
      id: 'river-read',
      method: 'item/tool/call',
      params: {
        threadId,
        turnId,
        callId: 'river-read',
        tool: 'get_river_data',
        arguments: { id: entry.id, scope: 'catalog' },
      },
    });
  }
  if (p.id === 'river-read') {
    const entry = JSON.parse(p.result.contentItems[0].text);
    if (entry.geometry.type !== 'MultiLineString') return process.exit(2);
    return send({
      id: 'apply-call',
      method: 'item/tool/call',
      params: {
        threadId,
        turnId,
        callId: 'apply',
        tool: 'apply_story_actions',
        arguments: {
          actions: [{ type: 'add_catalog_river', catalogId: entry.id, id: randomUUID() }],
        },
      },
    });
  }
  if (p.id === 'apply-call') {
    if (prompt.includes('PAUSE')) return;
    if (prompt.includes('DELAY')) return setTimeout(() => finish('延后完成'), 250);
    if (prompt.includes('CRASH')) return process.exit(1);
    finish(p.result.success ? '已添加地点。' : '无效坐标，操作未执行。');
  }
});
function finish(text) {
  const packet =
    JSON.stringify({
      method: 'item/agentMessage/delta',
      params: { threadId, turnId, itemId: 'answer', delta: text },
    }) + '\n';
  // Exercise partial JSONL chunks.
  process.stdout.write(packet.slice(0, 20));
  process.stdout.write(packet.slice(20));
  send({
    method: 'item/completed',
    params: {
      threadId,
      turnId,
      item: { id: 'answer', type: 'agentMessage', text, phase: 'final_answer' },
    },
  });
  send({
    method: 'turn/completed',
    params: { threadId, turn: { id: turnId, status: 'completed' } },
  });
}
