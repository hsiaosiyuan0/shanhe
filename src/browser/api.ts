import { z } from 'zod';
import { actionsSchema, applyActions, storySchema } from '../../shared/schema';
import { createStory } from '../../shared/seeds';
import { BrowserStore } from './store';

export const desktopOnlyMessage = 'AI 探索请使用山河桌面版。';

export function createBrowserApi(store: BrowserStore) {
  async function api<T>(path: string, options?: RequestInit): Promise<T> {
    const method = options?.method || 'GET';
    const body = options?.body ? JSON.parse(String(options.body)) : {};
    const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
    let result: unknown;
    if (path === '/settings' || parts[0] === 'agents' || parts[2] === 'chat')
      throw new Error(desktopOnlyMessage);
    if (path === '/stories') {
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
      } else throw new Error('在线版不支持此操作');
    } else throw new Error('在线版不支持此操作');
    return result as T;
  }
  return { api };
}

let singleton: ReturnType<typeof createBrowserApi> | undefined;
export const browserApi = () =>
  (singleton ||= createBrowserApi(new BrowserStore(`shanhe-browser:${import.meta.env.BASE_URL}`)));
