import { LOG_LEVEL_NAMES, type LoggerTransport, LogLevel, type LogRecord } from '../core';

const ANSI = {
  reset: '\u001b[0m',
  dim: '\u001b[2m',
} as const;

const LEVEL_COLOR: Readonly<Record<number, string>> = {
  10: '\u001b[90m', // trace — grey
  20: '\u001b[36m', // debug — cyan
  30: '\u001b[32m', // info  — green
  40: '\u001b[33m', // warn  — yellow
  50: '\u001b[31m', // error — red
  60: '\u001b[1;31m', // fatal — bold red
};

export interface StdoutTransportOptions {
  json?: boolean;
  colors?: boolean;
  prefix?: string;
}

export class StdoutTransport implements LoggerTransport {
  public readonly name = 'stdout';
  readonly #colors: boolean;

  public constructor(private readonly options: StdoutTransportOptions = {}) {
    this.#colors = options.colors ?? resolveLogColors();
  }

  public write(record: LogRecord): void {
    process.stdout.write(`${this.options.json ? this.#json(record) : this.#pretty(record)}\n`);
  }

  #json(record: LogRecord): string {
    return JSON.stringify({
      time: new Date(record.time).toISOString(),
      level: record.levelName,
      context: record.context,
      msg: record.message,
      ...(record.fields ?? {}),
      ...(record.error ? { err: record.error } : {}),
    });
  }

  #pretty(record: LogRecord): string {
    const level = this.#paint(
      LEVEL_COLOR[record.level] ?? '',
      (LOG_LEVEL_NAMES[record.level] ?? 'log').toUpperCase().padEnd(5),
    );
    const scope = this.#paint(
      ANSI.dim,
      `[${this.options.prefix ? `${this.options.prefix}:` : ''}${record.context}]`,
    );
    const fields =
      record.fields && Object.keys(record.fields).length > 0
        ? ` ${this.#paint(ANSI.dim, JSON.stringify(record.fields))}`
        : '';
    return `${level} ${scope} ${record.message}${fields}${this.#error(record)}`;
  }

  #error(record: LogRecord): string {
    if (!record.error) return '';

    const { name, message, stack } = record.error;
    const header = this.#paint(LEVEL_COLOR[LogLevel.Error] ?? '', `  ${name}: ${message}`);

    const lines = stack?.split('\n') ?? [];
    const frames = lines[0]?.startsWith(name) ? lines.slice(1) : lines;
    if (frames.length === 0) return `\n${header}`;

    return `\n${header}\n${this.#paint(ANSI.dim, indent(frames.join('\n')))}`;
  }

  #paint(code: string, text: string): string {
    return this.#colors && code ? `${code}${text}${ANSI.reset}` : text;
  }
}

function indent(text: string): string {
  return text
    .split('\n')
    .map((line) => `    ${line.trim()}`)
    .join('\n');
}

export function resolveLogLevel(fallback: LogLevel = LogLevel.Info): LogLevel {
  const raw = GetConvar('noverna_log_level', 'debug') ?? processEnv('NOVERNA_LOG_LEVEL');
  if (!raw) return fallback;

  const byName = Object.entries(LOG_LEVEL_NAMES).find(
    ([, name]) => name === raw.trim().toLowerCase(),
  );
  return byName ? (Number(byName[0]) as LogLevel) : fallback;
}

export function resolveLogColors(): boolean {
  const convar = GetConvar('noverna_log_colors', '');
  if (convar !== undefined) return convar !== '0' && convar.toLowerCase() !== 'false';

  if (processEnv('NO_COLOR')) return false;
  const force = processEnv('FORCE_COLOR');
  if (force !== undefined) return force !== '0';

  return process.stdout.isTTY === true;
}

function processEnv(name: string): string | undefined {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[
    name
  ];
}
