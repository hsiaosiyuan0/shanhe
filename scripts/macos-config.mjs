import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version))
  throw new Error('package.json 的版本号必须为 SemVer，例如 0.1.0 或 0.2.0-beta.1。');
if (
  process.env.GITHUB_REF?.startsWith('refs/tags/') &&
  process.env.GITHUB_REF !== `refs/tags/v${version}`
)
  throw new Error(`发布标签必须与 package.json 一致：v${version}`);

export const arch = process.arch;
export const minimumMacOS = '13.5'; // Matches the bundled official Node.js 24 runtime.
export const appPath = resolve('release', `mac-${arch}`, '山河.app');
export const artifactDir = resolve('release', 'artifacts');
export const artifactName = `shanhe-${version}-macos-${arch}`;

export function requireMacOS() {
  if (process.platform !== 'darwin' || !['arm64', 'x64'].includes(arch))
    throw new Error('桌面打包需要 Apple Silicon 或 Intel Mac 与 Xcode Command Line Tools。');
  if (Number(process.versions.node.split('.')[0]) < 24)
    throw new Error('桌面打包需要 Node.js 24 或更新版本。');
}
