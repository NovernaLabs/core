import type { MainThreadScheduler } from '../token';
import {
  type FindQuery,
  PersistenceAdapter,
  type PersistenceCapabilities,
  type Repository,
  type RepositoryOptions,
  type TransactionContext,
  type Where,
} from './port';

export function withMainThreadResume(
  adapter: PersistenceAdapter,
  mainThread: MainThreadScheduler,
): PersistenceAdapter {
  return new MainThreadAdapter(adapter, mainThread);
}

class MainThreadAdapter extends PersistenceAdapter {
  public constructor(
    private readonly inner: PersistenceAdapter,
    private readonly mainThread: MainThreadScheduler,
  ) {
    super();
  }

  public override get capabilities(): PersistenceCapabilities {
    return this.inner.capabilities;
  }

  public get unwrapped(): PersistenceAdapter {
    return this.inner;
  }

  public connect(): Promise<void> {
    return this.inner.connect();
  }

  public disconnect(): Promise<void> {
    return this.inner.disconnect();
  }

  public repository<T, K = string>(name: string, options?: RepositoryOptions): Repository<T, K> {
    return new MainThreadRepository(this.inner.repository<T, K>(name, options), this.mainThread);
  }

  public transaction<R>(fn: (tx: TransactionContext) => Promise<R>): Promise<R> {
    return resume(
      this.inner.transaction((tx) =>
        fn({
          repository: (name, options) =>
            new MainThreadRepository(tx.repository(name, options), this.mainThread),
        }),
      ),
      this.mainThread,
    );
  }
}

class MainThreadRepository<T, K> implements Repository<T, K> {
  public constructor(
    private readonly inner: Repository<T, K>,
    private readonly mainThread: MainThreadScheduler,
  ) {}

  public findById(id: K): Promise<T | undefined> {
    return resume(this.inner.findById(id), this.mainThread);
  }

  public findOne(where: Where<T>): Promise<T | undefined> {
    return resume(this.inner.findOne(where), this.mainThread);
  }

  public findMany(query?: FindQuery<T>): Promise<T[]> {
    return resume(this.inner.findMany(query), this.mainThread);
  }

  public count(where?: Where<T>): Promise<number> {
    return resume(this.inner.count(where), this.mainThread);
  }

  public create(data: T): Promise<T> {
    return resume(this.inner.create(data), this.mainThread);
  }

  public update(id: K, data: Partial<T>): Promise<T> {
    return resume(this.inner.update(id, data), this.mainThread);
  }

  public upsert(id: K, data: T): Promise<T> {
    return resume(this.inner.upsert(id, data), this.mainThread);
  }

  public delete(id: K): Promise<boolean> {
    return resume(this.inner.delete(id), this.mainThread);
  }

  public deleteMany(where: Where<T>): Promise<number> {
    return resume(this.inner.deleteMany(where), this.mainThread);
  }
}

async function resume<R>(operation: Promise<R>, mainThread: MainThreadScheduler): Promise<R> {
  try {
    const result = await operation;
    await mainThread.yield();
    return result;
  } catch (error) {
    await mainThread.yield();
    throw error;
  }
}
