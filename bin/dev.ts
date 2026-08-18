import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// WHY: two processes, one command. The API server holds the sessions and the
// Vite dev server holds the UI; the proxy in vite.config.ts joins them. Either
// one dying takes the other with it, so a half-running dev environment cannot
// look like a working one.
const root = fileURLToPath(new URL('..', import.meta.url));

const children: ChildProcess[] = [
  start('node', ['bin/serve.ts']),
  start(`${root}node_modules/.bin/vite`, []),
];

function start(command: string, args: string[]): ChildProcess {
  const child = spawn(command, args, { cwd: root, stdio: 'inherit', env: process.env });
  child.on('exit', (code) => {
    stopAll();
    process.exit(code ?? 1);
  });
  return child;
}

function stopAll(): void {
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
}

process.on('SIGINT', () => {
  stopAll();
  process.exit(0);
});
