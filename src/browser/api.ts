import { z } from 'zod';
import {
  actionsSchema,
  applyActions,
  storySchema,
  type ChatProgress,
  type Message,
  type Settings,
  type StoryDetail,
} from '../../shared/schema';
import { createStory } from '../../shared/seeds';
import { demo } from '../../shared/demo';
import { respondWithApi } from '../../shared/llm-client';
import { BrowserStore } from './store';

// Only endpoint/model persist. Keys stay in this page's memory and disappear on reload.
export function createBrowserApi(store: BrowserStore) {
  let credential = { baseUrl: '', value: '' };
  const chats = new Map<string, AbortController>();
  async function settings(): Promise<Settings> {
    const config = await store.settings();
    const hasKey = credential.baseUrl === config.baseUrl && !!credential.value;
    return {
      ...config,
      hasKey,
      mode: config.model ? 'live' : 'demo',
      connection: 'api',
      agentPath: '',
      agentModel: '',
    };
  }
  async function api<T>(path: string, options?: RequestInit): Promise<T> {
    const method = options?.method || 'GET';
    const body = options?.body ? JSON.parse(String(options.body)) : {};
    const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
    let result: unknown;
    if (path === '/settings') {
      if (method === 'PUT') {
        const next = z
          .object({
            connection: z.literal('api').default('api'),
            baseUrl: z.url().refine((v) => {
              const url = new URL(v);
              return (
                url.protocol === 'https:' &&
                !url.username &&
                !url.password &&
                !url.search &&
                !url.hash &&
                !url.pathname.endsWith('/chat/completions')
              );
            }, '在线版请填写 HTTPS API 根地址，例如 https://api.example.com/v1'),
            model: z.string().trim().max(200),
            apiKey: z.string().max(2000).optional(),
            clearKey: z.boolean().optional(),
          })
          .parse(body);
        const baseUrl = next.baseUrl.replace(/\/+$/, '');
        await store.setSettings({ baseUrl, model: next.model });
        credential = {
          baseUrl,
          value: next.clearKey
            ? ''
            : next.apiKey || (credential.baseUrl === baseUrl ? credential.value : ''),
        };
      }
      result = await settings();
    } else if (path === '/stories') {
      if (method === 'POST') {
        const input = z
          .object({
            title: z.string().trim().min(1).max(80),
            kind: z.enum(['biography', 'history', 'travel']),
            template: z.enum(['sushi', 'five', 'travel', 'blank']).optional(),
          })
          .parse(body);
        result = await store.insert(createStory(input.title, input.kind, input.template));
      } else result = await store.list();
    } else if (path === '/import' && method === 'POST') {
      const input = z
        .object({
          format: z.literal('shanhe-story/v1'),
          story: storySchema,
          messages: z
            .array(
              z.object({
                role: z.enum(['user', 'assistant']),
                content: z.string().max(30000),
                actions: actionsSchema.shape.actions,
                mode: z.enum(['demo', 'live']),
                createdAt: z.string(),
              }),
            )
            .max(1000)
            .default([]),
        })
        .parse(body);
      const now = new Date().toISOString();
      result = await store.insert(
        {
          ...input.story,
          id: crypto.randomUUID(),
          title: input.story.title.slice(0, 74) + ' · 导入',
          revision: 0,
          createdAt: now,
          updatedAt: now,
        },
        input.messages.map((m) => ({ ...m, id: crypto.randomUUID() })),
      );
    } else if (parts[0] === 'stories' && parts[1]) {
      const id = parts[1];
      const action = parts[2];
      if (!action) {
        if (method === 'PUT') {
          const story = storySchema.parse(body);
          if (story.id !== id) throw new Error('故事 ID 不匹配');
          result = await store.save(story, story.revision);
        } else if (method === 'DELETE') result = await store.delete(id);
        else result = await store.detail(id);
      } else if (action === 'export') {
        const { story, messages } = await store.detail(id);
        result = {
          format: 'shanhe-story/v1',
          exportedAt: new Date().toISOString(),
          story,
          messages,
        };
      } else if (action === 'actions' && method === 'POST') {
        const input = z
          .object({ revision: z.number().int(), actions: actionsSchema.shape.actions })
          .parse(body);
        result = await store.save(
          applyActions((await store.detail(id)).story, input),
          input.revision,
        );
      } else if (action === 'snapshots' && method === 'POST') {
        if (parts[3] && parts[4] === 'restore')
          result = await store.restore(
            id,
            parts[3],
            z.object({ revision: z.number().int() }).parse(body).revision,
          );
        else
          result = await store.snapshot(
            id,
            z.object({ name: z.string().trim().min(1).max(100) }).parse(body).name,
          );
      } else if (action === 'chat' && parts[3] === 'cancel') {
        const controller = chats.get(id);
        controller?.abort();
        result = { stopped: !!controller };
      } else throw new Error('在线版不支持此操作');
    } else throw new Error('在线版不支持本地 Agent，请使用桌面版或本地服务。');
    return result as T;
  }
  async function streamChat(
    id: string,
    input: { prompt: string; revision: number },
    emit: (event: ChatProgress) => void,
    signal: AbortSignal,
  ): Promise<StoryDetail> {
    const { prompt, revision } = z
      .object({ prompt: z.string().trim().min(1).max(8000), revision: z.number().int() })
      .parse(input);
    const run = async () => {
      if (chats.has(id)) throw new Error('这个故事正在生成回答，请稍候。');
      const controller = new AbortController();
      chats.set(id, controller);
      const combined = AbortSignal.any([signal, controller.signal]);
      try {
        combined.throwIfAborted();
        const current = await store.detail(id);
        if (current.story.revision !== revision) throw new Error('故事已更新，请刷新后再提问。');
        const config = await settings();
        emit({ type: 'status', text: config.model ? '正在连接模型服务…' : '正在执行演示指令…' });
        const reply = config.model
          ? await respondWithApi(
              { ...config, apiKey: credential.baseUrl === config.baseUrl ? credential.value : '' },
              current.story,
              current.messages,
              prompt,
              { signal: combined, emit },
            )
          : { ...demo(current.story, prompt), mode: 'demo' as const };
        combined.throwIfAborted();
        const message = (
          role: Message['role'],
          content: string,
          actions: Message['actions'],
        ): Message => ({
          id: crypto.randomUUID(),
          role,
          content,
          actions,
          mode: reply.mode,
          createdAt: new Date().toISOString(),
        });
        const detail = await store.commitChat(
          applyActions(current.story, { actions: reply.actions }),
          revision,
          [message('user', prompt, []), message('assistant', reply.content, reply.actions)],
          combined,
        );
        emit({ type: 'complete', detail });
        return detail;
      } catch (error) {
        if (combined.aborted) throw new Error('已停止，本轮未保存。');
        if (error instanceof Error && /模型连接失败/.test(error.message))
          throw new Error(
            '浏览器无法连接模型。请检查 HTTPS 地址、网络，以及服务是否允许本站的跨域请求（CORS）；本轮未保存。可使用本地版连接此服务。',
          );
        throw error;
      } finally {
        chats.delete(id);
      }
    };
    if (typeof navigator !== 'undefined' && navigator.locks) {
      return navigator.locks.request(`shanhe-chat:${id}`, { ifAvailable: true }, (lock) => {
        if (!lock) throw new Error('这个故事正在另一标签页生成回答，请稍候。');
        return run();
      });
    }
    return run();
  }
  return { api, streamChat };
}

let singleton: ReturnType<typeof createBrowserApi> | undefined;
export const browserApi = () =>
  (singleton ||= createBrowserApi(new BrowserStore(`shanhe-browser:${import.meta.env.BASE_URL}`)));
