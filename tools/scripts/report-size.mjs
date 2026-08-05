import { glob, readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const targets = ['main/dist/**/*.{js,mjs,cjs}', 'packages/*/dist/**/*.{js,mjs,cjs}'];

const rows = [];
for await (const file of glob(targets, { cwd: process.cwd() })) {
  if (file.endsWith('.map')) continue;
  const contents = await readFile(file);
  rows.push({
    file: file.replaceAll('\\', '/'),
    raw: contents.byteLength,
    gzip: gzipSync(contents).byteLength,
  });
}

if (rows.length === 0) {
  console.log('No build output found. Did `pnpm build:packages` run?');
  process.exit(0);
}

rows.sort((a, b) => b.gzip - a.gzip);

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;

console.log('### Bundle size\n');
console.log('| File | Raw | Gzip |');
console.log('| --- | ---: | ---: |');
for (const row of rows) {
  console.log(`| \`${row.file}\` | ${kb(row.raw)} | ${kb(row.gzip)} |`);
}
const total = rows.reduce((sum, row) => sum + row.gzip, 0);
console.log(`| **Total** | | **${kb(total)}** |`);
