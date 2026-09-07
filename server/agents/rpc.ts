import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { HttpError } from '../db.js';
import { agentEnv } from './discovery.js';

type Packet = {
  id?: number | string;
  method?: string;
  params?: any;
  result?: any;
  error?: { code?: number; message?: string };
};
const clients = new Set<CodexRpc>();
export async function stopAgentProcesses() {
  for (const client of clients) client.close();
  // Keep the event loop alive until the forced process-tree cleanup has run.
  await new Promise((resolve) => setTimeout(resolve, 1400));
}

/** Newline-delimited JSON-RPC. Protocol diagnostics never include config or stderr contents. */
export class CodexRpc {
  child: ChildProcessWithoutNullStreams;
  private pending = new Map<
    number,
    { method: string; resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }
  >();
  private nextId = 1;
  private buffer = '';
  private stopped = false;
  onNotification: (method: string, params: any) => void = () => {};
  onRequest: (method: string, params: any) => unknown | Promise<unknown> = () => {
    throw new Error('不支持此交互请求');
  };
  onFailure: (error: Error) => void = () => {};
  constructor(executable: string, cwd: string) {
    this.child = spawn(executable, ['app-server', '--listen', 'stdio://'], {
      cwd,
      env: agentEnv(executable),
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    clients.add(this);
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk: string) => {
      this.buffer += chunk;
      if (Buffer.byteLength(this.buffer) > 8 * 1024 * 1024)
        return this.fail(new HttpError(502, 'Agent 返回的数据过大，本轮未保存。'));
      let end: number;
      while ((end = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, end);
        this.buffer = this.buffer.slice(end + 1);
        if (line.trim()) this.receive(line);
      }
    });
    this.child.stderr.resume();
    this.child.stdin.on('error', () =>
      this.fail(new HttpError(502, 'Agent 连接中断，本轮未保存。')),
    );
    this.child.on('error', () => this.fail(new HttpError(502, 'Codex 启动失败，请检查程序路径。')));
    this.child.on('exit', () =>
      this.fail(new HttpError(502, 'Codex 已退出，本轮未保存。请检查 CLI 登录与配置。')),
    );
  }
  private send(packet: Packet) {
    if (this.stopped) throw new HttpError(502, 'Agent 连接已关闭');
    this.child.stdin.write(JSON.stringify(packet) + '\n');
  }
  private receive(line: string) {
    let packet: Packet;
    try {
      packet = JSON.parse(line);
    } catch {
      this.fail(new HttpError(502, 'Agent 协议数据无效'));
      return;
    }
    if (!packet || typeof packet !== 'object' || Array.isArray(packet)) {
      this.fail(new HttpError(502, 'Agent 协议数据无效'));
      return;
    }
    if (packet.method) {
      if (packet.id !== undefined) {
        const { id, method, params } = packet;
        void Promise.resolve()
          .then(() => this.onRequest(method, params))
          .then(
            (result) => {
              if (!this.stopped) this.send({ id, result });
            },
            () => {
              if (!this.stopped)
                this.send({
                  id,
                  error: {
                    code: -32601,
                    message: '山河未开放此工具或交互。请使用故事工具或直接向用户说明。',
                  },
                });
            },
          )
          .catch(() => {});
      } else {
        try {
          this.onNotification(packet.method, packet.params);
        } catch {
          this.fail(new HttpError(502, 'Agent 事件处理失败，本轮未保存。'));
        }
      }
    } else if (typeof packet.id === 'number') {
      const entry = this.pending.get(packet.id);
      if (!entry) return;
      this.pending.delete(packet.id);
      clearTimeout(entry.timer);
      if (packet.error) {
        const error = new HttpError(
          502,
          `Codex ${entry.method} 请求失败（${packet.error.code ?? '未知'}），请检查 CLI 版本和配置。`,
        );
        // Internal diagnostics only; HTTP responses expose the summary above.
        error.cause = packet.error.message;
        entry.reject(error);
      } else entry.resolve(packet.result);
    }
  }
  request(method: string, params: unknown, timeout = 30000): Promise<any> {
    if (this.stopped) return Promise.reject(new HttpError(502, 'Agent 连接已关闭'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new HttpError(504, `Codex ${method} 响应超时，本轮未保存。`));
      }, timeout);
      this.pending.set(id, { method, resolve, reject, timer });
      this.send({ id, method, params });
    });
  }
  async initialize() {
    await this.request('initialize', {
      clientInfo: { name: 'shanhe_story_atlas', title: '山河', version: '0.2.0' },
      capabilities: { experimentalApi: true },
    });
    this.send({ method: 'initialized' });
  }
  private fail(error: Error) {
    if (this.stopped) return;
    this.onFailure(error);
    this.close(error);
  }
  close(error: Error = new HttpError(499, '已停止，本轮未保存。')) {
    if (this.stopped) return;
    this.stopped = true;
    clients.delete(this);
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    this.pending.clear();
    this.child.stdin.destroy();
    const kill = (signal: NodeJS.Signals) => {
      try {
        if (process.platform !== 'win32' && this.child.pid) process.kill(-this.child.pid, signal);
        else this.child.kill(signal);
      } catch {
        /* Process tree already exited. */
      }
    };
    kill('SIGTERM');
    // Reap grandchildren even if the wrapper exits before them.
    setTimeout(() => kill('SIGKILL'), 1200).unref();
  }
}
