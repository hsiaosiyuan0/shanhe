import { cpSync, mkdirSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
if (process.platform !== 'darwin')
  throw new Error('桌面打包需要 macOS 与 Xcode Command Line Tools；其他系统请使用浏览器版本。');
const root = process.cwd();
const app = resolve('release', `mac-${process.arch}`, '山河.app');
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
  cpSync(source, join(resources, relative(root, source)), { recursive: true });
writeFileSync(
  join(resources, 'package.json'),
  JSON.stringify({ name: 'shanhe-desktop-runtime', type: 'module' }),
);
writeFileSync(
  join(app, 'Contents', 'Info.plist'),
  `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleName</key><string>山河</string><key>CFBundleDisplayName</key><string>山河</string><key>CFBundleIdentifier</key><string>local.shanhe.atlas</string><key>CFBundleIconFile</key><string>Shanhe</string><key>CFBundleExecutable</key><string>Shanhe</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>0.1.0</string><key>CFBundleVersion</key><string>1</string><key>LSMinimumSystemVersion</key><string>12.0</string><key>NSHighResolutionCapable</key><true/><key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict></dict></plist>`,
);
console.log(`本地 App 已生成：${app}`);
