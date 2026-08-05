import { PersistenceException } from '../errors/exceptions';
import {
  type FindQuery,
  PersistenceAdapter,
  type PersistenceCapabilities,
  type Repository,
  type RepositoryOptions,
  type TransactionContext,
  type Where,
} from './port';

type Table = Map<unknown, Record<string, unknown>>;

export interface MemoryAdapterOptions {
  models?: readonly string[];
}

export class MemoryAdapter extends PersistenceAdapter {
  public override readonly capabilities: PersistenceCapabilities = {
    transactions: true,
  };

  #tables = new Map<string, Table>();
  readonly #declared: ReadonlySet<string>;
  #connected = false;

  public constructor(options: MemoryAdapterOptions = {}) {
    super();
    this.#declared = new Set(options.models ?? []);
    for (const model of this.#declared) this.#tables.set(model, new Map());
  }

  public connect(): Promise<void> {
    this.#connected = true;
    return Promise.resolve();
  }

  public disconnect(): Promise<void> {
    this.#connected = false;
    return Promise.resolve();
  }

  public get connected(): boolean {
    return this.#connected;
  }

  public reset(): void {
    this.#tables = new Map();
    for (const model of this.#declared) this.#tables.set(model, new Map());
  }

  public repository<T, K = string>(
    name: string,
    options: RepositoryOptions = {},
  ): Repository<T, K> {
    if (this.#declared.size > 0 && !this.#declared.has(name)) {
      throw new PersistenceException(
        `Unknown model "${name}". This MemoryAdapter declares: ${[...this.#declared].join(', ')}.`,
      );
    }
    return new MemoryRepository<T, K>(() => this.#table(name), name, options.idField ?? 'id');
  }

  public async transaction<R>(fn: (tx: TransactionContext) => Promise<R>): Promise<R> {
    const snapshot = this.#snapshot();
    try {
      return await fn({
        repository: (name, options) => this.repository(name, options),
      });
    } catch (error) {
      this.#tables = snapshot;
      throw error;
    }
  }

  #table(name: string): Table {
    let table = this.#tables.get(name);
    if (!table) {
      table = new Map();
      this.#tables.set(name, table);
    }
    return table;
  }

  #snapshot(): Map<string, Table> {
    const copy = new Map<string, Table>();
    for (const [name, table] of this.#tables) copy.set(name, new Map(table));
    return copy;
  }
}

class MemoryRepository<T, K> implements Repository<T, K> {
  public constructor(
    private readonly table: () => Table,
    private readonly model: string,
    private readonly idField: string,
  ) {}

  public findById(id: K): Promise<T | undefined> {
    const row = this.table().get(id);
    return Promise.resolve(row === undefined ? undefined : (clone(row) as T));
  }

  public findOne(where: Where<T>): Promise<T | undefined> {
    for (const row of this.table().values()) {
      if (matches(row, where)) return Promise.resolve(clone(row) as T);
    }
    return Promise.resolve(undefined);
  }

  public findMany(query: FindQuery<T> = {}): Promise<T[]> {
    let rows = [...this.table().values()];
    if (query.where) rows = rows.filter((row) => matches(row, query.where as Where<T>));
    if (query.orderBy) rows = sort(rows, query.orderBy);

    const skip = query.skip ?? 0;
    const end = query.take === undefined ? undefined : skip + query.take;
    return Promise.resolve(rows.slice(skip, end).map((row) => clone(row) as T));
  }

  public count(where?: Where<T>): Promise<number> {
    if (!where) return Promise.resolve(this.table().size);
    let total = 0;
    for (const row of this.table().values()) if (matches(row, where)) total += 1;
    return Promise.resolve(total);
  }

  public async create(data: T): Promise<T> {
    const row = clone(data as Record<string, unknown>);
    const id = this.#keyOf(row);

    if (this.table().has(id)) {
      throw new PersistenceException(
        `Cannot create ${this.model}: a record with ${this.idField} "${String(id)}" already exists.`,
      );
    }

    this.table().set(id, row);
    return clone(row) as T;
  }

  public async update(id: K, data: Partial<T>): Promise<T> {
    const existing = this.table().get(id);
    if (!existing) {
      throw new PersistenceException(
        `Cannot update ${this.model}: no record with ${this.idField} "${String(id)}".`,
      );
    }

    const merged = { ...existing, ...clone(data as Record<string, unknown>) };
    merged[this.idField] = id;

    this.table().set(id, merged);
    return clone(merged) as T;
  }

  public upsert(id: K, data: T): Promise<T> {
    const row = clone(data as Record<string, unknown>);
    row[this.idField] = id;
    this.table().set(id, row);
    return Promise.resolve(clone(row) as T);
  }

  public delete(id: K): Promise<boolean> {
    return Promise.resolve(this.table().delete(id));
  }

  public deleteMany(where: Where<T>): Promise<number> {
    const table = this.table();
    const doomed: unknown[] = [];
    for (const [key, row] of table) if (matches(row, where)) doomed.push(key);
    for (const key of doomed) table.delete(key);
    return Promise.resolve(doomed.length);
  }

  #keyOf(row: Record<string, unknown>): K {
    const id = row[this.idField];
    if (id === undefined || id === null) {
      throw new PersistenceException(
        `Cannot create ${this.model}: the record has no "${this.idField}". The MemoryAdapter does not generate keys, set one, or point the repository at the right field with \`repository(name, { idField })\`.`,
      );
    }
    return id as K;
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function matches(row: Record<string, unknown>, where: Where<unknown>): boolean {
  for (const [field, expected] of Object.entries(where as Record<string, unknown>)) {
    if (expected === undefined) continue;
    if (!same(row[field], expected)) return false;
  }
  return true;
}

function same(actual: unknown, expected: unknown): boolean {
  if (actual instanceof Date && expected instanceof Date) {
    return actual.getTime() === expected.getTime();
  }
  return Object.is(actual, expected);
}

function sort<T>(rows: Record<string, unknown>[], orderBy: NonNullable<FindQuery<T>['orderBy']>) {
  const fields = Object.entries(orderBy as Record<string, SortDirectionOrUndefined>);
  return [...rows].sort((a, b) => {
    for (const [field, direction] of fields) {
      if (!direction) continue;
      const result = compare(a[field], b[field]);
      if (result !== 0) return direction === 'desc' ? -result : result;
    }
    return 0;
  });
}

type SortDirectionOrUndefined = 'asc' | 'desc' | undefined;

function compare(a: unknown, b: unknown): number {
  const aEmpty = a === null || a === undefined;
  const bEmpty = b === null || b === undefined;
  if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? -1 : 1;

  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();

  const left = String(a);
  const right = String(b);
  return left < right ? -1 : left > right ? 1 : 0;
}
