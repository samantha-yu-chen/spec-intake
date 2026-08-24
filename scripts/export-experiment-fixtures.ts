import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { exportFixtureDocuments } from '../tests/fixture-adapter.ts';

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: new URL('..', import.meta.url), encoding: 'utf8' }).trim();
}

const trackedFixtures = git(['ls-tree', '-r', '--name-only', 'HEAD', 'fixtures/experiment']);
const repin = process.argv.slice(2).includes('--repin');
if (trackedFixtures !== '' && !repin) {
  throw new Error('tracked fixtures require an explicit --repin after a new A-equivalent commit');
}
const sourceRevision = git(['log', '-1', '--format=%H', '--', 'tests/fixture-adapter.ts']);
git(['merge-base', '--is-ancestor', sourceRevision, 'HEAD']);

const directory = new URL('../fixtures/experiment', import.meta.url);
await mkdir(directory, { recursive: true });
for (const fixture of await exportFixtureDocuments(sourceRevision)) {
  const name = `${fixture.fixture_id}.json`;
  await writeFile(join(directory.pathname, name), `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
}
