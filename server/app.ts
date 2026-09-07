import express from 'express';
import { z, ZodError } from 'zod';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { applyActions, actionsSchema, storySchema } from '../shared/schema.js';
import { Store, HttpError } from './db.js';
import { createStory } from './seeds.js';
import { respond, makeMessage, config, publicConfig, toolDefinition } from './llm.js';
import { probeCodex } from './agents/codex.js';
import { resolveCodex, codexVersion } from './agents/discovery.js';
import type { ChatProgress } from '../shared/schema.js';

const activeChats = new Set<AbortController>();
export function stopChats() {
  for (const controller of activeChats) controller.abort();
}

export function createApp(store: Store, dist = resolve('dist')) {
  const app = express();
  const storyChats = new Map<string, AbortController>();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/.test(req.headers.host ?? ''))
      return res.status(403).json({ error: '只允许本机访问' });
    const origin = req.headers.origin;
    if (origin) {
      let allowed = false;
      try {
        const url = new URL(origin);
        allowed =
          ['http:', 'https:'].includes(url.protocol) &&
          ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
          (url.host === req.headers.host ||
            ['4310', '5178', String(process.env.PORT || 4310)].includes(url.port));
      } catch {
        /* invalid origin */
      }
      if (!allowed) return res.status(403).json({ error: '不允许这个来源访问本地 API' });
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '3mb' }));
  app.get('/api/health', (_req, res) => res.json({ ok: true, storage: 'sqlite' }));
  app.get('/api/capabilities', (_req, res) => res.json(toolDefinition));
  app.get('/api/settings', (_req, res) => res.json(publicConfig(store)));
  app.post('/api/agents/discover', async (_req, res) => {
    try {
      const path = await resolveCodex();
      res.json({ path, version: await codexVersion(path) });
    } catch (e) {
      res.json({ path: '', error: e instanceof Error ? e.message : '未找到 Codex' });
    }
  });
  app.post('/api/agents/codex/probe', async (req, res) => {
    const { path } = z.object({ path: z.string().max(2000).default('') }).parse(req.body);
    res.json(await probeCodex(path));
  });
  app.put('/api/settings', async (req, res) => {
    const settings = z
      .object({
        baseUrl: z.url().refine((v) => {
          const u = new URL(v);
          return (
            !u.username &&
            !u.password &&
            (u.protocol === 'https:' ||
              (u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)))
          );
        }, '远程服务须使用 HTTPS；本地服务可以使用 HTTP'),
        model: z.string().max(200),
        apiKey: z.string().max(2000).optional(),
        clearKey: z.boolean().optional(),
        connection: z.enum(['api', 'codex']).default('api'),
        agentPath: z.string().max(2000).default(''),
        agentModel: z.string().max(200).default(''),
      })
      .parse(req.body);
    const current = config(store);
    if (settings.connection === 'codex') {
      settings.agentPath = await resolveCodex(settings.agentPath);
      await codexVersion(settings.agentPath);
    }
    const sameConnection =
      settings.connection === current.connection &&
      settings.agentPath === current.agentPath &&
      settings.agentModel === current.agentModel;
    store.setSettings({
      connection: settings.connection,
      agentPath: settings.agentPath,
      agentModel: settings.agentModel,
      connectionId: sameConnection ? store.settings().connectionId || randomUUID() : randomUUID(),
      baseUrl: settings.baseUrl,
      model: settings.model,
      apiKey: settings.clearKey ? '' : settings.apiKey || current.apiKey,
    });
    res.json(publicConfig(store));
  });
  app.get('/api/stories', (_req, res) => res.json(store.list()));
  app.post('/api/stories', (req, res) => {
    const b = z
      .object({
        title: z.string().trim().min(1).max(80),
        kind: z.enum(['history', 'biography', 'travel']),
        template: z.enum(['sushi', 'five', 'travel', 'blank']).optional(),
      })
      .parse(req.body);
    res.status(201).json(store.insert(createStory(b.title, b.kind, b.template)));
  });
  app.post('/api/import', (req, res) => {
    const messageSchema = z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().max(30000),
      actions: actionsSchema.shape.actions,
      mode: z.enum(['demo', 'live']),
      createdAt: z.string(),
    });
    const data = z
      .object({
        format: z.literal('shanhe-story/v1'),
        story: storySchema,
        messages: z.array(messageSchema).max(1000).default([]),
      })
      .parse(req.body);
    const now = new Date().toISOString();
    const story = store.transaction(() => {
      const story = store.insert({
        ...data.story,
        id: randomUUID(),
        title: data.story.title.slice(0, 74) + ' · 导入',
        revision: 0,
        createdAt: now,
        updatedAt: now,
      });
      data.messages.forEach((m) => store.addMessage(story.id, { ...m, id: randomUUID() }));
      return story;
    });
    res.status(201).json(story);
  });
  app.get('/api/stories/:id', (req, res) => res.json(store.detail(req.params.id)));
  app.put('/api/stories/:id', (req, res) => {
    const story = storySchema.parse(req.body);
    if (story.id !== req.params.id) throw new HttpError(400, '故事 ID 不匹配');
    const existing = store.get(story.id);
    res.json(store.save({ ...story, createdAt: existing.createdAt }, story.revision));
  });
  app.delete('/api/stories/:id', (req, res) => {
    store.delete(req.params.id);
    res.status(204).end();
  });
  app.post('/api/stories/:id/actions', (req, res) => {
    const { revision, ...payload } = z
      .object({ revision: z.number().int(), actions: actionsSchema.shape.actions })
      .parse(req.body);
    const current = store.get(req.params.id);
    res.json(store.save(applyActions(current, payload), revision));
  });
  app.post('/api/stories/:id/chat', async (req, res) => {
    const { prompt, revision } = z
      .object({ prompt: z.string().trim().min(1).max(8000), revision: z.number().int() })
      .parse(req.body);
    const id = req.params.id;
    const story = store.get(id);
    if (story.revision !== revision) throw new HttpError(409, '故事已更新，请刷新后再提问。');
    const owner = randomUUID();
    store.acquireChat(id, owner);
    const controller = new AbortController();
    activeChats.add(controller);
    storyChats.set(id, controller);
    const streaming = req.headers.accept?.includes('text/event-stream');
    const emit = (event: ChatProgress) => {
      if (streaming && !res.destroyed) res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    if (streaming) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();
      emit({ type: 'status', text: '正在准备故事上下文…' });
    }
    const onClose = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on('close', onClose);
    const heartbeat = setInterval(() => {
      if (!store.renewChat(id, owner)) controller.abort();
      if (streaming && !res.destroyed) res.write(': heartbeat\n\n');
    }, 10000);
    try {
      const reply = await respond(store, story, prompt, { signal: controller.signal, emit });
      controller.signal.throwIfAborted();
      store.transaction(() => {
        if (!store.renewChat(id, owner)) throw new HttpError(409, '对话锁已失效，本轮未保存。');
        const updated = applyActions(story, { actions: reply.actions });
        store.save(updated, revision);
        store.addMessage(id, makeMessage('user', prompt, [], reply.mode));
        store.addMessage(id, makeMessage('assistant', reply.content, reply.actions, reply.mode));
        if (reply.session) store.setAgentSession(id, reply.session);
      });
      if (streaming) {
        emit({ type: 'complete', detail: store.detail(id) });
        res.end();
      } else res.json(store.detail(id));
    } catch (e) {
      if (streaming) {
        emit({
          type: 'error',
          error: controller.signal.aborted
            ? '已停止，本轮未保存。'
            : e instanceof Error
              ? e.message
              : 'Agent 连接失败，本轮未保存。',
        });
        res.end();
      } else throw e;
    } finally {
      clearInterval(heartbeat);
      res.off('close', onClose);
      activeChats.delete(controller);
      storyChats.delete(id);
      store.releaseChat(id, owner);
    }
  });
  app.post('/api/stories/:id/chat/cancel', (req, res) => {
    const controller = storyChats.get(req.params.id);
    controller?.abort();
    res.json({ stopped: !!controller });
  });
  app.post('/api/stories/:id/snapshots', (req, res) => {
    const { name } = z.object({ name: z.string().trim().min(1).max(100) }).parse(req.body);
    res.status(201).json(store.snapshot(req.params.id, name));
  });
  app.post('/api/stories/:id/snapshots/:snapshot/restore', (req, res) => {
    const { revision } = z.object({ revision: z.number().int() }).parse(req.body);
    store.restore(req.params.id, req.params.snapshot, revision);
    res.json(store.detail(req.params.id));
  });
  app.get('/api/stories/:id/export', (req, res) => {
    const { story, messages } = store.detail(req.params.id);
    res.setHeader('Content-Disposition', 'attachment; filename="shanhe-story.json"');
    res.json({ format: 'shanhe-story/v1', exportedAt: new Date().toISOString(), story, messages });
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: '接口不存在' }));
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get('/{*path}', (_req, res) => res.sendFile(resolve(dist, 'index.html')));
  }
  app.use(
    (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      if (error instanceof ZodError)
        return res
          .status(400)
          .json({ error: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('；') });
      if (error instanceof HttpError)
        return res.status(error.status).json({ error: error.message });
      if (error instanceof SyntaxError) return res.status(400).json({ error: 'JSON 格式不正确' });
      console.error(error instanceof Error ? error.message : 'Unexpected error');
      res.status(500).json({ error: '保存失败，请重试。' });
    },
  );
  return app;
}
