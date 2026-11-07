import { spawnSync } from 'node:child_process';
const account = '3bbe51d8973c406839b993e52753a08c';
const project = process.env.PIANO_PAGES_PROJECT || 'piano-quiz';
const env = { ...process.env, CLOUDFLARE_ACCOUNT_ID: account, WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: process.env.WRANGLER_LOG_PATH || '/tmp/piano-quiz-wrangler.log', CI: 'true' };
const run = args => spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', ...args], { env, stdio: 'inherit' });
if (run(['whoami']).status !== 0) process.exit(1);
if (process.argv.includes('--create')) {
  if (run(['pages', 'project', 'create', project, '--production-branch', 'main']).status !== 0) process.exit(1);
}
process.exit(run(['pages', 'deploy', 'dist', '--project-name', project, '--branch', 'main']).status ?? 1);
