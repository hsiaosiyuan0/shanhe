import type { Story, Message, ChatProgress } from './schema.js';
import { HttpError } from './errors.js';
import { StoryTools, toolDefinitions, agentInstructions } from './story-tools.js';

export type ModelConfig = { baseUrl: string; model: string; apiKey: string };
export async function respondWithApi(
  c: ModelConfig,
  story: Story,
  historyMessages: Message[],
  prompt: string,
  options: { signal: AbortSignal; emit: (event: ChatProgress) => void },
) {
  const history = historyMessages.slice(-16).map((m) => ({ role: m.role, content: m.content }));
  const staged = new StoryTools(story);
  const messages: Record<string, unknown>[] = [
    {
      role: 'system',
      content: `${agentInstructions}\n当前故事数据（河道几何按需读取）：${JSON.stringify(staged.context().story)}`,
    },
    ...history,
    { role: 'user', content: prompt },
  ];
  const actions = staged.actions;
  const deadline = AbortSignal.any([options.signal, AbortSignal.timeout(90000)]);
  for (let round = 0; round < 5; round++) {
    let response: Response;
    try {
      response = await fetch(c.baseUrl.replace(/\/$/, '') + '/chat/completions', {
        method: 'POST',
        signal: deadline,
        headers: {
          'Content-Type': 'application/json',
          ...(c.apiKey ? { Authorization: `Bearer ${c.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: c.model,
          messages,
          tools: toolDefinitions,
          tool_choice: round === 4 ? 'none' : 'auto',
        }),
      });
    } catch {
      throw new HttpError(502, '模型连接失败或超时。请检查服务地址与网络；本轮未保存任何修改。');
    }
    if (!response.ok)
      throw new HttpError(
        502,
        `模型服务返回 ${response.status}。请检查 API Key、模型名称和工具调用支持；本轮未保存。`,
      );
    const data = (await response.json()) as {
      choices?: {
        message?: {
          content?: string;
          tool_calls?: {
            id: string;
            type: string;
            function: { name: string; arguments: string };
          }[];
        };
      }[];
    };
    const message = data.choices?.[0]?.message;
    if (!message) throw new HttpError(502, '模型返回格式不符合 Chat Completions 协议。');
    if (!message.tool_calls?.length)
      return {
        content:
          message.content ||
          (actions.length ? '已更新地图；新增内容仍需核验。' : '模型没有返回文本，请重试。'),
        actions,
        mode: 'live' as const,
      };
    if (round === 4) throw new HttpError(502, '模型工具调用次数超限，本轮未保存。');
    messages.push({ role: 'assistant', ...message });
    for (const call of message.tool_calls) {
      try {
        const receipt = staged.call(call.function.name, JSON.parse(call.function.arguments));
        options.emit({
          type: 'tool',
          text:
            call.function.name === 'apply_story_actions'
              ? `已暂存 ${staged.actions.length} 项地图修改`
              : '读取故事与河道数据',
          count: staged.actions.length,
        });
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(receipt),
        });
      } catch (e) {
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify({
            ok: false,
            error: e instanceof Error ? e.message : 'Invalid arguments',
          }),
        });
      }
    }
  }
  throw new HttpError(502, '模型未完成回答，本轮未保存。');
}
