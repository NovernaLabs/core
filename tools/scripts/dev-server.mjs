import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, watch } from 'node:fs';
import { join, resolve } from 'node:path';

const SERVER_DIR = resolve('internal/server');
const ARTIFACT_DIR = join(SERVER_DIR, 'artifacts');
const MANIFEST_FILE = join(ARTIFACT_DIR, '.artifact.json');

const RESOURCE_SRC = resolve('internal/test-resource');
const RESOURCE_DEST = join(SERVER_DIR, 'resources', '[local]', 'test-resource');
const MIRRORED = ['fxmanifest.lua', 'dist'];

const isWindows = process.platform === 'win32';

const TURBO_ARGS = ['--ui=stream', '--filter=@noverna/test-resource...'];

function runPnpm(spawner, args, options) {
  return isWindows
    ? spawner(['pnpm', ...args].join(' '), { ...options, shell: true })
    : spawner('pnpm', args, { ...options, shell: false });
}

if (!existsSync(MANIFEST_FILE)) {
  console.error('cfx-server is not set up yet. Run:\n\n  pnpm server:setup\n');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST_FILE, 'utf8'));
const executable = join(ARTIFACT_DIR, manifest.executable);

if (!existsSync(executable)) {
  console.error(
    `cfx-server is missing at ${executable}.\nThe artifact directory looks damaged. Run:\n\n  pnpm server:setup\n`,
  );
  process.exit(1);
}

if (!existsSync(join(SERVER_DIR, 'server.cfg'))) {
  console.error('internal/server/server.cfg is missing. Run `pnpm server:setup`.\n');
  process.exit(1);
}

console.log('Building workspace resources…');
const build = runPnpm(spawnSync, ['turbo', 'run', 'build', ...TURBO_ARGS], { stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);

mirror();
console.log(`Mirrored test-resource into ${RESOURCE_DEST}`);

const children = [];

const verbose = process.argv.includes('--verbose');
const watchProcess = runPnpm(spawn, ['turbo', 'run', 'dev', ...TURBO_ARGS], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
children.push(watchProcess);

forward(watchProcess.stderr, true);
forward(watchProcess.stdout, verbose);

let pending;
const watcher = watch(join(RESOURCE_SRC, 'dist'), () => {
  clearTimeout(pending);
  pending = setTimeout(() => {
    try {
      mirror();
      console.log('↻ test-resource mirrored run `restart test-resource` in the console.');
    } catch (error) {
      console.error('Mirror failed:', error.message);
    }
  }, 150);
});

console.log(`\nStarting cfx-server ${String(manifest.id).slice(0, 8)}…\n`);
children.push(
  spawn(executable, ['+exec', 'server.cfg'], {
    cwd: SERVER_DIR,
    stdio: 'inherit',
    shell: false,
  }),
);

let shuttingDown = false;
const shutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  watcher.close();
  clearTimeout(pending);
  for (const child of children) killTree(child);
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
for (const child of children) child.on('exit', shutdown);

function forward(stream, enabled) {
  if (!stream) return;
  stream.setEncoding('utf8');
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    if (!enabled) return;
    for (const line of lines) {
      if (line.trim()) console.log(`[watch] ${line}`);
    }
  });
}

function killTree(child) {
  if (child.exitCode !== null || child.pid === undefined) return;
  if (isWindows)
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGTERM');
}

function mirror() {
  mkdirSync(RESOURCE_DEST, { recursive: true });
  for (const entry of MIRRORED) {
    const from = join(RESOURCE_SRC, entry);
    if (!existsSync(from)) continue;
    cpSync(from, join(RESOURCE_DEST, entry), { recursive: true, force: true });
  }
}
