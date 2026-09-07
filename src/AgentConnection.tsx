import { useEffect, useRef, useState } from 'react';
import { Check, CircleAlert, LoaderCircle, Monitor, RefreshCw, Terminal } from 'lucide-react';
import type { AgentProbe } from '../shared/schema';
import { api, json } from './api';

export default function AgentConnection({
  path,
  model,
  onPath,
  onModel,
  onReady,
}: {
  path: string;
  model: string;
  onPath: (path: string) => void;
  onModel: (model: string) => void;
  onReady: (ready: boolean) => void;
}) {
  const [probe, setProbe] = useState<AgentProbe | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(0);
  async function check() {
    const id = ++request.current;
    setChecking(true);
    setError('');
    setProbe(null);
    onReady(false);
    try {
      const result = await api<AgentProbe>('/agents/codex/probe', json('POST', { path }));
      if (request.current !== id) return;
      setProbe(result);
      onPath(result.path);
      onReady(result.connected);
    } catch (e) {
      if (request.current === id) setError((e as Error).message);
    } finally {
      if (request.current === id) setChecking(false);
    }
  }
  useEffect(() => {
    void check();
    return () => {
      request.current++;
    };
  }, []);
  const ready = probe?.connected && !checking;
  return (
    <div className="agent-connection">
      <div className="agent-card">
        <div className="agent-card-icon">
          <Terminal size={23} aria-hidden="true" />
        </div>
        <div className="agent-card-name">
          <strong>Codex</strong>
          <span>使用本机已有的登录与模型</span>
        </div>
        <span className={`agent-badge ${ready ? 'ready' : ''}`}>
          {checking ? (
            <LoaderCircle className="spin" size={13} />
          ) : ready ? (
            <Check size={13} />
          ) : (
            <Monitor size={13} />
          )}
          {checking ? '连接中' : ready ? '已连接' : '未连接'}
        </span>
      </div>
      <div className="agent-status" role="status" aria-live="polite">
        {checking
          ? '正在查找 Codex，并读取登录状态与模型…'
          : ready
            ? `连接成功 · CLI ${probe.version} · ${probe.auth === 'chatgpt' ? 'ChatGPT 登录' : '使用 CLI 的模型配置'}`
            : probe?.loginRequired
              ? 'Codex 已安装，请先在终端运行 codex login 完成登录，再重新检测。'
              : '先连接本机 Codex，即可在故事中继续探索。'}
      </div>
      {error && (
        <p className="form-error" role="alert">
          <CircleAlert size={15} /> {error}
        </p>
      )}
      <label className="field-label">
        探索模型
        <select value={model} disabled={!ready} onChange={(e) => onModel(e.target.value)}>
          <option value="">沿用 Codex 默认模型</option>
          {model && !probe?.models.some((m) => m.id === model) && (
            <option value={model}>{model} · 上次选择</option>
          )}
          {probe?.models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
              {m.isDefault ? ' · 默认' : ''}
            </option>
          ))}
        </select>
      </label>
      <details className="agent-advanced">
        <summary>程序位置</summary>
        <label className="field-label">
          Codex 可执行文件
          <input
            value={path}
            placeholder="自动查找，或填写完整路径"
            spellCheck={false}
            onChange={(e) => {
              request.current++;
              setChecking(false);
              setProbe(null);
              onReady(false);
              onPath(e.target.value);
            }}
          />
        </label>
      </details>
      <button
        type="button"
        className="agent-recheck"
        onClick={() => void check()}
        disabled={checking}
      >
        <RefreshCw size={14} className={checking ? 'spin' : ''} />
        重新检测连接
      </button>
      <p className="field-hint">
        无需另填 API Key。模型请求使用 Codex 的服务配置；故事与对话保存在本机。首版支持 Codex CLI
        0.153 及更新版本。
      </p>
    </div>
  );
}
