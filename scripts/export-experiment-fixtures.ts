import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { exportFixtureDocuments } from '../tests/fixture-adapter.ts';

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: new URL('..', import.meta.url), encoding: 'utf8' }).trim();
}

const sourceRevision = git(['rev-parse', 'HEAD']);
const trackedFixtures = git(['ls-tree', '-r', '--name-only', 'HEAD', 'fixtures/experiment']);
if (trackedFixtures !== '') {
  throw new Error('run fixture export at an A-equivalent executable commit before fixtures are tracked');
}

const directory = new URL('../fixtures/experiment', import.meta.url);
await mkdir(directory, { recursive: true });
for (const fixture of await exportFixtureDocuments(sourceRevision)) {
  const name = `${fixture.fixture_id}.json`;
  await writeFile(join(directory.pathname, name), `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
}
