export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch('/api' + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  if (!response.ok) {
    let message = '请求失败，请检查本地服务。';
    try {
      message = (await response.json()).error || message;
    } catch {
      /* non-JSON error */
    }
    throw new Error(message);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});

export async function streamChat(
  id: string,
  body: { prompt: string; revision: number },
  onEvent: (event: import('../shared/schema').ChatProgress) => void,
  signal: AbortSignal,
): Promise<import('../shared/schema').StoryDetail> {
  const response = await fetch(`/api/stories/${encodeURIComponent(id)}/chat`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error((await response.json()).error || '对话连接失败');
  if (!response.body) throw new Error('当前环境不支持流式对话');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let end: number;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = frame
          .split('\n')
          .filter((line) => line.startsWith('data: '))
          .map((line) => line.slice(6))
          .join('\n');
        if (!data) continue;
        const event = JSON.parse(data) as import('../shared/schema').ChatProgress;
        onEvent(event);
        if (event.type === 'error') throw new Error(event.error);
        if (event.type === 'complete') return event.detail;
      }
      if (done) throw new Error('对话连接中断，请刷新检查是否已保存后再重试。');
    }
  } finally {
    reader.releaseLock();
  }
}
