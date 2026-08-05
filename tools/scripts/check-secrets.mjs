import { readFile, stat } from 'node:fs/promises';

const PATTERNS = [
  [/\bsk-[A-Za-z0-9]{20,}\b/, 'API key'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}\b/, 'GitHub token'],
  [/\bnpm_[A-Za-z0-9]{30,}\b/, 'npm token'],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, 'Slack token'],
  [/-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/, 'private key'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key id'],
  [/\bcfx_[A-Za-z0-9_]{20,}\b/, 'Cfx.re server key'],
  [
    /(?:password|passwd|secret|api[_-]?key|auth[_-]?token)\s*[:=]\s*['"][^'"\s]{12,}['"]/i,
    'hardcoded credential',
  ],
  [
    /(?:mysql|postgres(?:ql)?|mongodb(?:\+srv)?):\/\/[^:\s]+:[^@\s]+@/,
    'database URL with password',
  ],
];

const PLACEHOLDER = /(example|placeholder|changeme|your[-_]?|xxx+|\.\.\.|<[^>]+>|\$\{)/i;

const files = process.argv.slice(2).filter(Boolean);
let failed = false;

for (const file of files) {
  let contents;
  try {
    const info = await stat(file);
    if (!info.isFile() || info.size > 2_000_000) continue;
    contents = await readFile(file, 'utf8');
  } catch {
    continue;
  }

  contents.split('\n').forEach((line, index) => {
    if (line.includes('noverna-allow-secret') || PLACEHOLDER.test(line)) return;
    for (const [pattern, label] of PATTERNS) {
      if (pattern.test(line)) {
        console.error(`✗ ${file}:${index + 1}  possible ${label}`);
        failed = true;
        return;
      }
    }
  });
}

if (failed) {
  console.error(
    '\nCommit blocked. Move the value into an environment variable, or add a\n' +
      '`noverna-allow-secret` comment on the line if this is a false positive.\n',
  );
  process.exit(1);
}
