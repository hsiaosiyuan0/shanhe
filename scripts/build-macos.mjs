import { cpSync, mkdirSync, rmSync, writeFileSync, chmodSync, existsSync } from 'node:fs';
import { resolve, join, relative, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { appPath, arch, minimumMacOS, requireMacOS, version } from './macos-config.mjs';
requireMacOS();
const root = process.cwd();
const app = appPath;
const nodeLicense = join(dirname(process.execPath), '..', 'LICENSE');
if (!existsSync(nodeLicense))
  throw new Error(
    '未找到 Node.js 许可证；请使用 nodejs.org 官方发行版（如 fnm/nvm 或 setup-node 安装）。',
  );
// A Homebrew-linked Node can work locally but fail on another computer.
const dependencies = execFileSync('otool', ['-L', process.execPath], { encoding: 'utf8' })
  .split('\n')
  .slice(1)
  .map((line) => line.trim().split(' (')[0])
  .filter(Boolean);
if (
  dependencies.some((path) => !path.startsWith('/usr/lib/') && !path.startsWith('/System/Library/'))
)
  throw new Error('当前 Node 依赖非系统动态库，请改用 nodejs.org 官方发行版后打包。');
rmSync(app, { recursive: true, force: true });
const resources = join(app, 'Contents', 'Resources');
const binaries = join(app, 'Contents', 'MacOS');
mkdirSync(resources, { recursive: true });
mkdirSync(binaries, { recursive: true });
const cache = resolve('test-results', 'swift-module-cache');
mkdirSync(cache, { recursive: true });
execFileSync(
  'xcrun',
  [
    'swiftc',
    '-swift-version',
    '5',
    '-O',
    '-target',
    `${arch === 'x64' ? 'x86_64' : 'arm64'}-apple-macosx${minimumMacOS}`,
    '-module-cache-path',
    cache,
    '-framework',
    'Cocoa',
    '-framework',
    'WebKit',
    'desktop/main.swift',
    '-o',
    join(binaries, 'Shanhe'),
  ],
  { stdio: 'inherit' },
);
cpSync(process.execPath, join(resources, 'node'));
cpSync(nodeLicense, join(resources, 'NODE-LICENSE.txt'));
cpSync('desktop/Shanhe.icns', join(resources, 'Shanhe.icns'));
chmodSync(join(resources, 'node'), 0o755);
for (const folder of ['dist', 'dist-server'])
  cpSync(folder, join(resources, folder), { recursive: true });
const modules = execFileSync('npm', ['ls', '--omit=dev', '--parseable', '--all'], {
  encoding: 'utf8',
})
  .trim()
  .split('\n')
  .filter((path) => path.startsWith(join(root, 'node_modules') + '/'));
for (const source of modules)
  cpSync(source, join(resources, relative(root, source)), {
    recursive: true,
    // Keep npm's relative links inside the app instead of pointing back to the checkout.
    verbatimSymlinks: true,
  });
writeFileSync(
  join(resources, 'package.json'),
  JSON.stringify({ name: 'shanhe-desktop-runtime', version, type: 'module' }),
);
writeFileSync(
  join(resources, 'build-info.json'),
  JSON.stringify(
    {
      version,
      arch,
      node: process.version,
      minimumMacOS,
      commit:
        process.env.GITHUB_SHA ||
        execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      builtAt: new Date().toISOString(),
      signing: 'ad-hoc',
      notarized: false,
    },
    null,
    2,
  ),
);
const buildNumber = process.env.GITHUB_RUN_NUMBER || '1';
if (!/^\d+$/.test(buildNumber)) throw new Error('构建编号必须为正整数。');
writeFileSync(
  join(app, 'Contents', 'Info.plist'),
  `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleName</key><string>山河</string><key>CFBundleDisplayName</key><string>山河</string><key>CFBundleIdentifier</key><string>local.shanhe.atlas</string><key>CFBundleIconFile</key><string>Shanhe</string><key>CFBundleExecutable</key><string>Shanhe</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>${version.split('-')[0]}</string><key>CFBundleVersion</key><string>${buildNumber}</string><key>LSMinimumSystemVersion</key><string>${minimumMacOS}</string><key>NSHighResolutionCapable</key><true/><key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict></dict></plist>`,
);
// Ad-hoc signing preserves bundle integrity; it is not Developer ID signing/notarization.
execFileSync('codesign', ['--force', '--sign', '-', '--timestamp=none', join(resources, 'node')], {
  stdio: 'inherit',
});
execFileSync('codesign', ['--force', '--sign', '-', '--timestamp=none', app], { stdio: 'inherit' });
execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
console.log(`本地 App 已生成：${app}`);
