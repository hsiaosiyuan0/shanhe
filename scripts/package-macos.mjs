import {
  createReadStream,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appPath, artifactDir, artifactName, requireMacOS, version } from './macos-config.mjs';

requireMacOS();
mkdirSync(artifactDir, { recursive: true });
const staging = mkdtempSync(join(tmpdir(), 'shanhe-dmg-'));
const zip = join(artifactDir, `${artifactName}.zip`);
const dmg = join(artifactDir, `${artifactName}.dmg`);
try {
  // ditto preserves executable bits, symlinks and the signed app bundle.
  execFileSync('ditto', ['--norsrc', '-c', '-k', '--keepParent', appPath, zip], {
    stdio: 'inherit',
  });
  execFileSync('ditto', [appPath, join(staging, '山河.app')], { stdio: 'inherit' });
  symlinkSync('/Applications', join(staging, 'Applications'));
  execFileSync(
    'hdiutil',
    [
      'create',
      '-volname',
      `山河 ${version}`,
      '-srcfolder',
      staging,
      '-ov',
      '-format',
      'UDZO',
      '-fs',
      'HFS+',
      dmg,
    ],
    { stdio: 'inherit' },
  );
  execFileSync('hdiutil', ['verify', dmg], { stdio: 'inherit' });
  const sums = [];
  for (const file of [dmg, zip]) {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    sums.push(`${hash.digest('hex')}  ${basename(file)}`);
  }
  writeFileSync(join(artifactDir, `${artifactName}.sha256`), sums.join('\n') + '\n');
  console.log(`安装包已生成：${artifactDir}/${artifactName}.{dmg,zip,sha256}`);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
