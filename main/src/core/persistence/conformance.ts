import type { PersistenceAdapter, PersistenceCapabilities, Repository } from './port';

export interface ConformanceRecord {
  id: string;
  name: string;
  score: number;
}

export interface ConformanceContext {
  readonly adapter: PersistenceAdapter;
  readonly model: string;
}

export interface AdapterTestCase {
  readonly name: string;
  readonly requires?: keyof PersistenceCapabilities;
  run(context: ConformanceContext): Promise<void>;
}

export const persistenceConformance: readonly AdapterTestCase[] = [
  {
    name: 'create() stores a record that findById() returns',
    async run(ctx) {
      const repo = await fresh(ctx);
      const created = await repo.create({ id: 'a', name: 'Ada', score: 10 });

      assertEquals(created.id, 'a', 'create() returns the stored record');
      assertEquals(created.name, 'Ada', 'create() returns the stored record');
      assertEquals((await repo.findById('a'))?.score, 10, 'findById() finds it');
    },
  },
  {
    name: 'findById() resolves to undefined for a missing key, and does not throw',
    async run(ctx) {
      const repo = await fresh(ctx);
      const found = await repo.findById('nope');

      assert(found === undefined, `findById() must resolve to undefined, got ${describe(found)}`);
    },
  },
  {
    name: 'create() rejects when the key already exists',
    async run(ctx) {
      const repo = await fresh(ctx);
      await repo.create({ id: 'a', name: 'Ada', score: 10 });

      await assertRejects(
        () => repo.create({ id: 'a', name: 'Grace', score: 20 }),
        'create() with a duplicate key',
      );
      assertEquals((await repo.findById('a'))?.name, 'Ada', 'the original is untouched');
    },
  },
  {
    name: 'findOne() matches on any field and resolves to undefined when nothing does',
    async run(ctx) {
      const repo = await seeded(ctx);

      assertEquals((await repo.findOne({ name: 'Grace' }))?.id, 'b', 'matches by name');
      assertEquals((await repo.findOne({ score: 30 }))?.id, 'c', 'matches by number');
      assert(
        (await repo.findOne({ name: 'nobody' })) === undefined,
        'findOne() must resolve to undefined when nothing matches',
      );
    },
  },
  {
    name: 'findMany() returns everything when given no query',
    async run(ctx) {
      const repo = await seeded(ctx);
      assertEquals((await repo.findMany()).length, 3, 'findMany() with no query');
    },
  },
  {
    name: 'findMany() filters on where',
    async run(ctx) {
      const repo = await seeded(ctx);
      const rows = await repo.findMany({ where: { score: 20 } });

      assertEquals(rows.length, 1, 'one row scores 20');
      assertEquals(rows[0]?.id, 'b', 'and it is the right one');
      assertEquals(
        (await repo.findMany({ where: { name: 'nobody' } })).length,
        0,
        'no match yields an empty array, not undefined',
      );
    },
  },
  {
    name: 'findMany() honours orderBy in both directions',
    async run(ctx) {
      const repo = await seeded(ctx);

      assertEquals(
        (await repo.findMany({ orderBy: { score: 'asc' } })).map((r) => r.id).join(','),
        'a,b,c',
        'ascending',
      );
      assertEquals(
        (await repo.findMany({ orderBy: { score: 'desc' } })).map((r) => r.id).join(','),
        'c,b,a',
        'descending',
      );
    },
  },
  {
    name: 'findMany() honours take and skip',
    async run(ctx) {
      const repo = await seeded(ctx);
      const order = { score: 'asc' } as const;

      assertEquals(
        (await repo.findMany({ orderBy: order, take: 2 })).map((r) => r.id).join(','),
        'a,b',
        'take',
      );
      assertEquals(
        (await repo.findMany({ orderBy: order, skip: 1 })).map((r) => r.id).join(','),
        'b,c',
        'skip',
      );
      assertEquals(
        (await repo.findMany({ orderBy: order, skip: 1, take: 1 })).map((r) => r.id).join(','),
        'b',
        'skip + take',
      );
      assertEquals(
        (await repo.findMany({ orderBy: order, skip: 99 })).length,
        0,
        'skipping past the end is empty, not an error',
      );
    },
  },
  {
    name: 'count() counts the model, and the filtered subset',
    async run(ctx) {
      const repo = await seeded(ctx);

      assertEquals(await repo.count(), 3, 'unfiltered');
      assertEquals(await repo.count({ score: 20 }), 1, 'filtered');
      assertEquals(await repo.count({ name: 'nobody' }), 0, 'no match');
    },
  },
  {
    name: 'update() applies a partial patch and leaves other fields alone',
    async run(ctx) {
      const repo = await seeded(ctx);
      const updated = await repo.update('a', { score: 99 });

      assertEquals(updated.score, 99, 'update() returns the new value');
      assertEquals(updated.name, 'Ada', 'a field the patch omitted is untouched');
      assertEquals((await repo.findById('a'))?.score, 99, 'and it was persisted');
    },
  },
  {
    name: 'update() does not move the primary key',
    async run(ctx) {
      const repo = await fresh(ctx);
      await repo.create({ id: 'a', name: 'Ada', score: 10 });

      await repo.update('a', { id: 'moved' } as Partial<ConformanceRecord>);

      assert((await repo.findById('moved')) === undefined, 'the row did not move');
      assertEquals((await repo.findById('a'))?.id, 'a', 'and it is still under its own key');
    },
  },
  {
    name: 'update() rejects for a missing key rather than creating one',
    async run(ctx) {
      const repo = await fresh(ctx);

      await assertRejects(() => repo.update('ghost', { score: 1 }), 'update() on a missing key');
      assertEquals(await repo.count(), 0, 'nothing was created');
    },
  },
  {
    name: 'upsert() creates when absent and replaces when present',
    async run(ctx) {
      const repo = await fresh(ctx);

      const created = await repo.upsert('a', {
        id: 'a',
        name: 'Ada',
        score: 10,
      });
      assertEquals(created.name, 'Ada', 'upsert() created');

      const replaced = await repo.upsert('a', {
        id: 'a',
        name: 'Grace',
        score: 20,
      });
      assertEquals(replaced.name, 'Grace', 'upsert() replaced');
      assertEquals(await repo.count(), 1, 'and did not add a second row');
    },
  },
  {
    name: 'delete() reports whether it removed anything',
    async run(ctx) {
      const repo = await seeded(ctx);

      assertEquals(await repo.delete('a'), true, 'the first delete removes it');
      assertEquals(await repo.delete('a'), false, 'the second finds nothing to remove');
      assertEquals(await repo.count(), 2, 'exactly one row is gone');
    },
  },
  {
    name: 'deleteMany() removes matches and counts them, and {} means everything',
    async run(ctx) {
      const repo = await seeded(ctx);

      assertEquals(await repo.deleteMany({ score: 20 }), 1, 'filtered delete returns the count');
      assertEquals(await repo.count(), 2, 'and removed exactly that many');
      assertEquals(await repo.deleteMany({}), 2, 'an empty filter matches everything');
      assertEquals(await repo.count(), 0, 'leaving the model empty');
    },
  },
  {
    name: 'returned records are detached from the store',
    async run(ctx) {
      const repo = await fresh(ctx);
      await repo.create({ id: 'a', name: 'Ada', score: 10 });

      const first = await repo.findById('a');
      assert(first !== undefined, 'the record exists');
      first.name = 'mutated locally';

      assertEquals(
        (await repo.findById('a'))?.name,
        'Ada',
        'editing a result must not write to the store',
      );
    },
  },
  {
    name: 'transaction() returns the callback result and keeps its writes',
    async run(ctx) {
      await fresh(ctx);

      const result = await ctx.adapter.transaction(async (tx) => {
        const repo = tx.repository<ConformanceRecord>(ctx.model);
        await repo.create({ id: 'a', name: 'Ada', score: 10 });
        return 'done';
      });

      assertEquals(result, 'done', 'the callback result is passed through');
      const repo = ctx.adapter.repository<ConformanceRecord>(ctx.model);
      assertEquals(await repo.count(), 1, 'the write survived the commit');
    },
  },
  {
    name: 'transaction() rolls every write back when the callback throws',
    requires: 'transactions',
    async run(ctx) {
      const repo = await fresh(ctx);
      await repo.create({ id: 'a', name: 'Ada', score: 10 });

      await assertRejects(
        () =>
          ctx.adapter.transaction(async (tx) => {
            const inner = tx.repository<ConformanceRecord>(ctx.model);
            await inner.create({ id: 'b', name: 'Grace', score: 20 });
            await inner.update('a', { score: 999 });
            throw new Error('rollback please');
          }),
        'a throwing transaction',
      );

      assertEquals(await repo.count(), 1, 'the insert was rolled back');
      assertEquals((await repo.findById('a'))?.score, 10, 'and so was the update');
    },
  },
];

export interface ConformanceResult {
  readonly name: string;
  readonly status: 'passed' | 'failed' | 'skipped';
  readonly error?: Error;
}

export async function runConformance(context: ConformanceContext): Promise<ConformanceResult[]> {
  const results: ConformanceResult[] = [];

  for (const testCase of persistenceConformance) {
    if (testCase.requires && !context.adapter.capabilities[testCase.requires]) {
      results.push({ name: testCase.name, status: 'skipped' });
      continue;
    }
    try {
      await testCase.run(context);
      results.push({ name: testCase.name, status: 'passed' });
    } catch (error) {
      results.push({
        name: testCase.name,
        status: 'failed',
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  return results;
}

async function fresh(ctx: ConformanceContext): Promise<Repository<ConformanceRecord>> {
  const repo = ctx.adapter.repository<ConformanceRecord>(ctx.model);
  await repo.deleteMany({});
  return repo;
}

async function seeded(ctx: ConformanceContext): Promise<Repository<ConformanceRecord>> {
  const repo = await fresh(ctx);
  await repo.create({ id: 'a', name: 'Ada', score: 10 });
  await repo.create({ id: 'b', name: 'Grace', score: 20 });
  await repo.create({ id: 'c', name: 'Radia', score: 30 });
  return repo;
}

class ConformanceError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ConformanceError';
  }
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new ConformanceError(message);
}

function assertEquals<T>(actual: T, expected: T, what: string): void {
  if (!Object.is(actual, expected)) {
    throw new ConformanceError(`${what}: expected ${describe(expected)}, got ${describe(actual)}`);
  }
}

async function assertRejects(operation: () => Promise<unknown>, what: string): Promise<void> {
  try {
    await operation();
  } catch {
    return;
  }
  throw new ConformanceError(`${what} must reject, but it resolved`);
}

function describe(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  return String(value);
}
