import type { Dict } from '../../shared/types';

export const LogLevel = {
  Trace: 10,
  Debug: 20,
  Info: 30,
  Warn: 40,
  Error: 50,
  Fatal: 60,
  Silent: 100,
} as const;

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

export const LOG_LEVEL_NAMES: Readonly<Record<number, string>> = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal',
};

export interface LogRecord {
  level: LogLevel;
  levelName: string;
  /* milliseconds. */
  time: number;
  context: string;
  message: string;
  fields?: Dict;
  error?: { name: string; message: string; stack?: string; code?: string };
}

export interface LoggerTransport {
  readonly name: string;
  write(record: LogRecord): void;
  flush?(): Promise<void>;
}

export interface LoggerOptions {
  level?: LogLevel;
  context?: string;
  fields?: Dict;
}

export class Logger {
  readonly #transports: LoggerTransport[];
  readonly #fields: Dict;

  public level: LogLevel;
  public readonly context: string;

  public constructor(options: LoggerOptions = {}, transports: LoggerTransport[] = []) {
    this.level = options.level ?? LogLevel.Info;
    this.context = options.context ?? 'app';
    this.#fields = options.fields ?? {};
    this.#transports = transports;
  }

  public child(context: string, fields: Dict = {}): Logger {
    const child = new Logger(
      { level: this.level, context, fields: { ...this.#fields, ...fields } },
      this.#transports,
    );
    return child;
  }

  public addTransport(transport: LoggerTransport): this {
    this.#transports.push(transport);
    return this;
  }

  public removeTransport(name: string): this {
    const index = this.#transports.findIndex((transport) => transport.name === name);
    if (index >= 0) this.#transports.splice(index, 1);
    return this;
  }

  public get transports(): readonly LoggerTransport[] {
    return this.#transports;
  }

  public trace(message: string, fields?: Dict): void {
    this.#log(LogLevel.Trace, message, fields);
  }

  public debug(message: string, fields?: Dict): void {
    this.#log(LogLevel.Debug, message, fields);
  }

  public info(message: string, fields?: Dict): void {
    this.#log(LogLevel.Info, message, fields);
  }

  public warn(message: string, fields?: Dict): void {
    this.#log(LogLevel.Warn, message, fields);
  }

  public error(message: string, error?: unknown, fields?: Dict): void {
    this.#log(LogLevel.Error, message, fields, error);
  }

  public fatal(message: string, error?: unknown, fields?: Dict): void {
    this.#log(LogLevel.Fatal, message, fields, error);
  }

  #log(level: LogLevel, message: string, fields?: Dict, error?: unknown): void {
    if (level < this.level) return;

    const record: LogRecord = {
      level,
      levelName: LOG_LEVEL_NAMES[level] ?? String(level),
      time: Date.now(),
      context: this.context,
      message,
      ...(this.#fields || fields ? { fields: { ...this.#fields, ...fields } } : {}),
      ...(error !== undefined ? { error: serializeError(error) } : {}),
    };

    for (const transport of this.#transports) {
      try {
        transport.write(record);
      } catch {}
    }
  }
}

export function serializeError(error: unknown): NonNullable<LogRecord['error']> {
  if (error instanceof Error) {
    const code = (error as Error & { code?: unknown }).code;
    return {
      name: error.name,
      message: error.message,
      ...(error.stack !== undefined ? { stack: error.stack } : {}),
      ...(typeof code === 'string' ? { code } : {}),
    };
  }
  return { name: 'NonError', message: String(error) };
}

export class MemoryTransport implements LoggerTransport {
  public readonly name = 'memory';
  public readonly records: LogRecord[] = [];

  public constructor(private readonly limit = 500) {}

  public write(record: LogRecord): void {
    this.records.push(record);
    if (this.records.length > this.limit) this.records.shift();
  }
}
