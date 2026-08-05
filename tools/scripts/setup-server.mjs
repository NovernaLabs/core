import { spawnSync } from 'node:child_process';
import { createWriteStream, existsSync } from 'node:fs';
import { copyFile, mkdir, open, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const SERVER_DIR = resolve('internal/server');
const ARTIFACT_DIR = join(SERVER_DIR, 'artifacts');
const PIN_FILE = join(SERVER_DIR, 'fxserver.json');
const MANIFEST_FILE = join(ARTIFACT_DIR, '.artifact.json');

const DOCS = 'https://docs.fivem.net/docs/developers/legacy-vs-enhanced/';

const isWindows = process.platform === 'win32';
const platform = isWindows ? 'windows' : 'linux';

const pin = JSON.parse(await readFile(PIN_FILE, 'utf8'));
const target = pin.builds?.[platform];

if (!target) {
  fail(`No pinned cfx-server build for platform "${platform}" in ${PIN_FILE}.`);
}
if (!target.url || target.url.includes('REPLACE_ME')) {
  fail(
    `${PIN_FILE} has no download URL for "${platform}".\n\n` +
      `Paste the current ${platform} release URL from the Cfx.re downloads into the\n` +
      `"${platform}" entry, along with its release id.\n\n  ${DOCS}`,
  );
}

const stamp = existsSync(MANIFEST_FILE) ? JSON.parse(await readFile(MANIFEST_FILE, 'utf8')) : null;

if (stamp?.id === target.id && existsSync(join(ARTIFACT_DIR, stamp.executable))) {
  console.log(`✓ cfx-server ${short(target.id)} already present.`);
} else {
  console.log(`Downloading cfx-server ${short(target.id)} (${platform})…`);
  console.log(`  ${target.url}`);

  await rm(ARTIFACT_DIR, { recursive: true, force: true });
  await mkdir(ARTIFACT_DIR, { recursive: true });

  const archive = join(ARTIFACT_DIR, target.archive ?? basenameOf(target.url));
  await download(target.url, archive);
  await assertArchiveLooksRight(archive);

  console.log('Extracting…');
  extract(archive);
  await rm(archive, { force: true });

  const executable = await locateExecutable(ARTIFACT_DIR, target.executable);
  if (!executable) {
    fail(
      `Extraction finished but "${target.executable}" is not in ${ARTIFACT_DIR}.\n` +
        'The archive layout may have changed check the download and the "executable"\n' +
        `field in ${PIN_FILE}.`,
    );
  }

  await writeFile(
    MANIFEST_FILE,
    `${JSON.stringify({ id: target.id, released: pin.released, platform, executable }, null, 2)}\n`,
  );
  console.log(`✓ cfx-server ${short(target.id)} ready (${executable}).`);
}

const cfg = join(SERVER_DIR, 'server.cfg');
if (!existsSync(cfg)) {
  await copyFile(join(SERVER_DIR, 'server.cfg.example'), cfg);
  console.log('✓ Created internal/server/server.cfg from the example (gitignored).');
  console.log('  Add your licence key from https://keymaster.fivem.net before starting.');
}

console.log('\nNext:  pnpm server:dev');

async function download(url, destination) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    fail(
      `Download failed: ${response.status} ${response.statusText}\n` +
        `The pinned build may have been withdrawn. Update ${PIN_FILE}.\n\n  ${DOCS}`,
    );
  }

  const total = Number(response.headers.get('content-length') ?? 0);
  let received = 0;
  let lastReport = 0;

  const counter = new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      if (total > 0 && process.stdout.isTTY && Date.now() - lastReport > 250) {
        lastReport = Date.now();
        const percent = Math.floor((received / total) * 100);
        process.stdout.write(`\r  ${percent}%  ${mib(received)} / ${mib(total)} MiB`);
      }
      callback(null, chunk);
    },
  });

  await pipeline(Readable.fromWeb(response.body), counter, createWriteStream(destination));
  if (process.stdout.isTTY && total > 0) process.stdout.write('\r\u001b[K');

  if (total > 0 && received !== total) {
    fail(`Download is truncated: got ${received} of ${total} bytes. Run the command again.`);
  }
  console.log(`  ${mib(received)} MiB downloaded.`);
}

async function assertArchiveLooksRight(archive) {
  const handle = await open(archive, 'r');
  try {
    const { buffer } = await handle.read(Buffer.alloc(6), 0, 6, 0);
    const magic = buffer.toString('hex');
    const isZip = magic.startsWith('504b'); // "PK"
    const isXz = magic === 'fd377a585a00';
    if (!isZip && !isXz) {
      fail(
        `${archive} is neither a zip nor an xz archive (starts with ${magic}).\n` +
          'That usually means the URL returned an error page. Check the pinned URL.',
      );
    }
  } finally {
    await handle.close();
  }
}

function extract(archive) {
  const attempts = isWindows
    ? [
        [
          join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe'),
          ['-xf', archive, '-C', ARTIFACT_DIR],
        ],
        [
          'powershell',
          [
            '-NoProfile',
            '-Command',
            `Expand-Archive -Path "${archive}" -DestinationPath "${ARTIFACT_DIR}" -Force`,
          ],
        ],
      ]
    : [['tar', ['-xJf', archive, '-C', ARTIFACT_DIR]]];

  for (const [command, args] of attempts) {
    if (command.includes('\\') && !existsSync(command)) continue;
    const result = spawnSync(command, args, { stdio: 'inherit' });
    if (result.status === 0) return;
  }

  fail(`Extraction failed. Unpack ${archive} manually into ${ARTIFACT_DIR}.`);
}

async function locateExecutable(root, name, depth = 3) {
  const entries = await readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isFile() && entry.name === name) return relative(ARTIFACT_DIR, join(root, name));
  }
  if (depth <= 1) return null;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const found = await locateExecutable(join(root, entry.name), name, depth - 1);
    if (found) return found;
  }
  return null;
}

function mib(bytes) {
  return (bytes / 1048576).toFixed(1);
}

function short(id) {
  return typeof id === 'string' ? id.slice(0, 8) : String(id);
}

function basenameOf(url) {
  return new URL(url).pathname.split('/').pop() || 'artifact';
}

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}
