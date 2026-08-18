import Anthropic from '@anthropic-ai/sdk';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createEngine } from '../intake/engine.ts';
import { createServer } from '../server/http.ts';
import { createStore } from '../server/session-store.ts';

const PORT = Number(process.env['INTAKE_PORT'] ?? 4317);
const root = fileURLToPath(new URL('..', import.meta.url));
const built = `${root}web/dist`;

// WHY: credentials come from the environment. A missing key is a refusal at
// start-up rather than a failure in the middle of someone's first answer.
if (!process.env['ANTHROPIC_API_KEY']) {
  console.error('ANTHROPIC_API_KEY is not set. Set it before starting the intake.');
  process.exit(1);
}

const deps = {
  store: createStore(`${root}sessions`),
  engine: createEngine(new Anthropic()),
  submissionsDir: `${root}submitted`,
  resumeBase: process.env['INTAKE_PUBLIC_URL'] ?? `http://localhost:${PORT}`,
  webRoot: existsSync(built) ? built : null,
};

createServer(deps).listen(PORT, () => {
  console.log(`intake listening on http://localhost:${PORT}`);
  console.log(deps.webRoot === null ? 'no built UI — run `npm run dev` for the Vite dev server' : `serving the built UI from ${built}`);
});
