import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
execFileSync('open', [resolve('release', `mac-${process.arch}`, '山河.app')]);
