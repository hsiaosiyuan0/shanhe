import assert from 'node:assert/strict';
import { accessSync, constants, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  arch,
  artifactDir,
  artifactName,
  minimumMacOS,
  requireMacOS,
  version,
} from './macos-config.mjs';

requireMacOS();
// Test the actual archive outside the checkout, with a fresh, disposable database.
const isolated = mkdtempSync(join(tmpdir(), 'shanhe-package-test-'));
let backend;
let backendExit;
let output = '';
let errors = '';
async function start() {
  const resources = join(isolated, '山河.app', 'Contents', 'Resources');
  output = '';
  errors = '';
  backend = spawn(join(resources, 'node'), [join(resources, 'dist-server/server/index.js')], {
    cwd: isolated,
    env: {
      PATH: '/usr/bin:/bin',
      HOME: isolated,
      PORT: '0',
      DATA_DIR: join(isolated, 'data'),
      STATIC_DIR: join(resources, 'dist'),
      NODE_ENV: 'production',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  backendExit = once(backend, 'exit');
  backend.stderr.on('data', (chunk) => {
    errors += chunk;
  });
  const ready = new Promise((resolve, reject) => {
    backend.on('error', reject);
    backend.once('exit', (code) => reject(new Error(`打包服务提前退出 (${code}): ${errors}`)));
    backend.stdout.on('data', (chunk) => {
      output += chunk;
      const address = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
      if (address) resolve(address);
    });
  });
  let timer;
  try {
    return await Promise.race([
      ready,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`打包服务启动超时：${output} ${errors}`)), 30000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function stop() {
  if (!backend || backend.exitCode !== null) return;
  backend.kill('SIGTERM');
  const force = setTimeout(() => backend.kill('SIGKILL'), 5000);
  try {
    assert.equal((await backendExit)[0], 0, '服务应正常关闭');
  } finally {
    clearTimeout(force);
  }
}
async function request(base, path, options) {
  const response = await fetch(base + path, { ...options, signal: AbortSignal.timeout(10000) });
  assert.ok(response.ok, `${path}: ${response.status}`);
  return response;
}
try {
  execFileSync('ditto', ['-x', '-k', join(artifactDir, `${artifactName}.zip`), isolated]);
  const app = join(isolated, '山河.app');
  const resources = join(app, 'Contents', 'Resources');
  const executable = join(app, 'Contents', 'MacOS', 'Shanhe');
  for (const file of [executable, join(resources, 'node')]) accessSync(file, constants.X_OK);
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
  const info = JSON.parse(readFileSync(join(resources, 'build-info.json')));
  assert.equal(info.version, version);
  assert.equal(info.arch, arch);
  assert.equal(info.minimumMacOS, minimumMacOS);
  assert.equal(
    execFileSync(join(resources, 'node'), ['-p', 'process.arch'], { encoding: 'utf8' }).trim(),
    arch,
  );
  assert.ok(
    execFileSync('lipo', ['-archs', executable], { encoding: 'utf8' }).includes(
      arch === 'x64' ? 'x86_64' : arch,
    ),
  );
  const base = await start();
  assert.deepEqual(await (await request(base, '/api/health')).json(), {
    ok: true,
    storage: 'sqlite',
  });
  const html = await (await request(base, '/')).text();
  assert.ok(html.includes('山河'));
  const bundle = html.match(/src="([^"]+\.js)"/)?.[1];
  assert.ok(bundle, '页面应引用编译后的脚本');
  assert.match((await request(base, bundle)).headers.get('content-type'), /javascript/);
  assert.equal((await (await request(base, '/api/stories')).json()).length, 3);
  const created = await (
    await request(base, '/api/stories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '打包后的持久化检查', kind: 'history', template: 'blank' }),
    })
  ).json();
  await stop();
  const restarted = await start();
  const saved = await (await request(restarted, `/api/stories/${created.id}`)).json();
  assert.equal(saved.story.title, created.title);
  console.log(`macOS ${arch} 安装包检查通过：架构、签名完整性、独立运行、页面与 SQLite 重启保存。`);
} finally {
  try {
    await stop();
  } finally {
    rmSync(isolated, { recursive: true, force: true });
  }
}
