export type Where<T> = { readonly [K in keyof T]?: T[K] };

export type SortDirection = 'asc' | 'desc';

export type OrderBy<T> = { readonly [K in keyof T]?: SortDirection };

export interface FindQuery<T> {
  where?: Where<T>;
  orderBy?: OrderBy<T>;
  take?: number;
  skip?: number;
}

export interface RepositoryOptions {
  idField?: string;
}

export interface Repository<T, K = string> {
  findById(id: K): Promise<T | undefined>;

  findOne(where: Where<T>): Promise<T | undefined>;

  findMany(query?: FindQuery<T>): Promise<T[]>;

  count(where?: Where<T>): Promise<number>;

  create(data: T): Promise<T>;

  update(id: K, data: Partial<T>): Promise<T>;

  upsert(id: K, data: T): Promise<T>;

  delete(id: K): Promise<boolean>;

  deleteMany(where: Where<T>): Promise<number>;
}

export interface TransactionContext {
  repository<T, K = string>(name: string, options?: RepositoryOptions): Repository<T, K>;
}

export interface PersistenceCapabilities {
  readonly transactions: boolean;
}

export abstract class PersistenceAdapter {
  public abstract readonly capabilities: PersistenceCapabilities;

  public abstract connect(): Promise<void>;

  public abstract disconnect(): Promise<void>;

  public abstract repository<T, K = string>(
    name: string,
    options?: RepositoryOptions,
  ): Repository<T, K>;

  public abstract transaction<R>(fn: (tx: TransactionContext) => Promise<R>): Promise<R>;
}
