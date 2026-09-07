import { randomUUID } from 'node:crypto';
import { type MapAction, type Story, type Message } from '../shared/schema.js';
import type { Store } from './db.js';
import { demo } from '../shared/demo.js';
import { respondWithApi } from '../shared/llm-client.js';

import { toolDefinition } from './story-tools.js';
import { respondWithCodex, type AgentOptions } from './agents/codex.js';
export { toolDefinition };

export function config(store: Store) {
  const saved = store.settings();
  return {
    connection: saved.connection ?? 'api',
    agentPath: saved.agentPath ?? '',
    agentModel: saved.agentModel ?? '',
    baseUrl: saved.baseUrl ?? process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1',
    model: saved.model ?? process.env.LLM_MODEL ?? '',
    apiKey: saved.apiKey ?? process.env.LLM_API_KEY ?? '',
  };
}
export function configured(c: ReturnType<typeof config>) {
  return (
    !!c.model &&
    (!!c.apiKey || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(c.baseUrl))
  );
}
export function publicConfig(store: Store) {
  const c = config(store);
  return {
    baseUrl: c.baseUrl,
    model: c.model,
    connection: c.connection,
    agentPath: c.agentPath,
    agentModel: c.agentModel,
    hasKey: !!c.apiKey,
    mode: c.connection === 'codex' || configured(c) ? 'live' : 'demo',
  };
}

export async function respond(
  store: Store,
  story: Story,
  prompt: string,
  options: AgentOptions = { signal: new AbortController().signal, emit: () => {} },
): Promise<{
  content: string;
  actions: MapAction[];
  mode: 'demo' | 'live';
  session?: import('../shared/schema.js').AgentSession;
}> {
  const c = config(store);
  if (c.connection === 'codex') return respondWithCodex(store, story, prompt, options);
  if (!configured(c)) return { ...demo(story, prompt), mode: 'demo' };
  return respondWithApi(c, story, store.messages(story.id), prompt, options);
}

export function makeMessage(
  role: Message['role'],
  content: string,
  actions: MapAction[],
  mode: Message['mode'],
): Message {
  return { id: randomUUID(), role, content, actions, mode, createdAt: new Date().toISOString() };
}
