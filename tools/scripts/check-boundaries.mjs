import { glob, readFile } from 'node:fs/promises';
import { dirname, sep } from 'node:path';

const ROOT = process.cwd();
const violations = [];

/** @type {Map<string, { dir: string; pkg: any }>} */
const workspaces = new Map();

for await (const entry of glob(
  ['main/package.json', 'packages/*/package.json', 'internal/*/package.json'],
  { cwd: ROOT },
)) {
  const pkg = JSON.parse(await readFile(entry, 'utf8'));
  if (pkg.name) workspaces.set(pkg.name, { dir: dirname(entry), pkg });
}

const internalNames = new Set(
  [...workspaces].filter(([, w]) => w.dir.split(sep)[0] === 'internal').map(([name]) => name),
);
const adapterNames = new Set(
  [...workspaces].filter(([, w]) => w.dir.split(sep)[0] === 'packages').map(([name]) => name),
);

for (const [name, { dir, pkg }] of workspaces) {
  const root = dir.split(sep)[0];
  if (root === 'internal') continue;

  const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };

  // Rule 1
  for (const dep of Object.keys(deps)) {
    if (internalNames.has(dep)) {
      violations.push(`${name} (${dir}) depends on internal workspace "${dep}".`);
    }
  }

  // Rule 2
  if (name === '@noverna/core') {
    for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies })) {
      if (adapterNames.has(dep)) {
        violations.push(
          `@noverna/core depends on adapter "${dep}". The core defines ports; it must not ` +
            'import an implementation. Fix the port instead of adding the dependency.',
        );
      }
    }
  }

  // Rule 3
  if (root === 'packages' && pkg.dependencies?.['@noverna/core']) {
    violations.push(
      `${name} lists @noverna/core as a regular dependency. It must be a peerDependency ` +
        '(plus a devDependency for local builds).',
    );
  }
}

if (violations.length > 0) {
  console.error('\nArchitecture boundary violations:\n');
  for (const violation of violations) console.error(`  ✗ ${violation}`);
  console.error('\nSee ARCHITECTURE.md#the-dependency-rule.\n');
  process.exit(1);
}

console.log(`✓ Boundaries hold across ${workspaces.size} workspaces.`);
