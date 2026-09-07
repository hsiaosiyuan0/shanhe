import { access, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, delimiter, isAbsolute, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { HttpError } from '../db.js';

const exec = promisify(execFile);
export function agentEnv(executable?: string) {
  const env = { ...process.env };
  // CLI children must not inherit the identity of the task that launched the dev server.
  delete env.CODEX_THREAD_ID;
  env.PATH = [
    ...new Set([
      ...(executable ? [dirname(executable)] : []),
      dirname(process.execPath),
      ...(env.PATH || '').split(delimiter).filter(isAbsolute),
      join(homedir(), '.local/bin'),
      join(homedir(), '.opencode/bin'),
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
    ]),
  ].join(delimiter);
  return env;
}
export async function resolveCodex(explicit = ''): Promise<string> {
  const candidates = explicit
    ? [explicit]
    : agentEnv()
        .PATH!.split(delimiter)
        .map((p) => join(p, 'codex'));
  for (const path of candidates) {
    if (!isAbsolute(path)) continue;
    try {
      await access(path, constants.X_OK);
      if ((await stat(path)).isFile()) return path;
    } catch {
      /* Try next install location. */
    }
  }
  throw new HttpError(
    400,
    explicit
      ? '这个路径不是可执行的 Codex 程序。'
      : '未找到 Codex。请先安装 Codex CLI，或填写完整的程序路径。',
  );
}
export async function codexVersion(path: string) {
  try {
    const { stdout } = await exec(path, ['--version'], {
      env: agentEnv(path),
      timeout: 8000,
      maxBuffer: 65536,
    });
    const version = stdout.match(/codex-cli\s+(\d+\.\d+\.\d+)/)?.[1];
    if (!version) throw new Error('Not Codex');
    const [major, minor] = version.split('.').map(Number);
    if (major === 0 && minor < 153)
      throw new HttpError(400, '请将 Codex CLI 更新到 0.153 或更新版本后连接。');
    return version;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, '无法读取 Codex 版本，请检查程序路径和安装状态。');
  }
}
