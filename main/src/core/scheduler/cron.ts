const ALIASES: Readonly<Record<string, string>> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
};

interface FieldSpec {
  min: number;
  max: number;
  name: string;
}

const FIELDS: readonly FieldSpec[] = [
  { min: 0, max: 59, name: 'minute' },
  { min: 0, max: 23, name: 'hour' },
  { min: 1, max: 31, name: 'day of month' },
  { min: 1, max: 12, name: 'month' },
  { min: 0, max: 6, name: 'day of week' },
];

export class CronSyntaxError extends Error {
  public constructor(expression: string, detail: string) {
    super(`Invalid cron expression "${expression}": ${detail}`);
    this.name = 'CronSyntaxError';
  }
}

export class CronExpression {
  public readonly minutes: ReadonlySet<number>;
  public readonly hours: ReadonlySet<number>;
  public readonly daysOfMonth: ReadonlySet<number>;
  public readonly months: ReadonlySet<number>;
  public readonly daysOfWeek: ReadonlySet<number>;

  readonly #dayOfMonthRestricted: boolean;
  readonly #dayOfWeekRestricted: boolean;

  public constructor(public readonly source: string) {
    const normalized = ALIASES[source.trim()] ?? source.trim();
    const parts = normalized.split(/\s+/);
    if (parts.length !== 5) {
      throw new CronSyntaxError(source, `expected 5 fields, got ${parts.length}`);
    }

    const [minute, hour, dom, month, dow] = parts as [string, string, string, string, string];

    this.minutes = parseField(source, minute, FIELDS[0] as FieldSpec);
    this.hours = parseField(source, hour, FIELDS[1] as FieldSpec);
    this.daysOfMonth = parseField(source, dom, FIELDS[2] as FieldSpec);
    this.months = parseField(source, month, FIELDS[3] as FieldSpec);
    this.daysOfWeek = parseDayOfWeek(source, dow);

    this.#dayOfMonthRestricted = dom !== '*';
    this.#dayOfWeekRestricted = dow !== '*';
  }

  public matches(date: Date): boolean {
    if (!this.minutes.has(date.getMinutes())) return false;
    if (!this.hours.has(date.getHours())) return false;
    if (!this.months.has(date.getMonth() + 1)) return false;

    const domMatch = this.daysOfMonth.has(date.getDate());
    const dowMatch = this.daysOfWeek.has(date.getDay());

    if (this.#dayOfMonthRestricted && this.#dayOfWeekRestricted) return domMatch || dowMatch;
    if (this.#dayOfMonthRestricted) return domMatch;
    if (this.#dayOfWeekRestricted) return dowMatch;
    return true;
  }

  public next(from: Date = new Date()): Date {
    const candidate = new Date(from.getTime());
    candidate.setSeconds(0, 0);
    candidate.setMinutes(candidate.getMinutes() + 1);

    const limit = 4 * 366 * 24 * 60;
    for (let i = 0; i < limit; i += 1) {
      if (this.matches(candidate)) return candidate;
      candidate.setMinutes(candidate.getMinutes() + 1);
    }

    throw new CronSyntaxError(this.source, 'no matching time within four years');
  }

  public msUntilNext(from: Date = new Date()): number {
    return Math.max(0, this.next(from).getTime() - from.getTime());
  }
}

function parseField(expression: string, field: string, spec: FieldSpec): Set<number> {
  const values = new Set<number>();

  for (const part of field.split(',')) {
    const [range, stepRaw] = part.split('/');
    if (range === undefined || range === '') {
      throw new CronSyntaxError(expression, `empty ${spec.name} field`);
    }

    const step = stepRaw === undefined ? 1 : Number(stepRaw);
    if (!Number.isInteger(step) || step <= 0) {
      throw new CronSyntaxError(expression, `invalid step "${stepRaw}" in ${spec.name}`);
    }

    let start: number;
    let end: number;

    if (range === '*') {
      start = spec.min;
      end = spec.max;
    } else if (range.includes('-')) {
      const [a, b] = range.split('-');
      start = Number(a);
      end = Number(b);
    } else {
      start = Number(range);
      end = stepRaw === undefined ? start : spec.max;
    }

    if (!Number.isInteger(start) || !Number.isInteger(end)) {
      throw new CronSyntaxError(expression, `non-numeric ${spec.name} value "${range}"`);
    }
    if (start < spec.min || end > spec.max || start > end) {
      throw new CronSyntaxError(
        expression,
        `${spec.name} value "${range}" is outside ${spec.min}-${spec.max}`,
      );
    }

    for (let value = start; value <= end; value += step) values.add(value);
  }

  return values;
}

function parseDayOfWeek(expression: string, field: string): Set<number> {
  const parsed = parseField(expression, field, {
    min: 0,
    max: 7,
    name: 'day of week',
  });
  if (parsed.delete(7)) parsed.add(0);
  return parsed;
}

export function parseCron(expression: string): CronExpression {
  return new CronExpression(expression);
}
