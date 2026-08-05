import {
  type FindQuery,
  PersistenceAdapter,
  type PersistenceCapabilities,
  PersistenceException,
  type Repository,
  type RepositoryOptions,
  type TransactionContext,
  type Where,
} from '@noverna/core';
import {
  asModels,
  isDelegate,
  modelNames,
  type PrismaClientLike,
  type PrismaDelegate,
  PrismaErrorCode,
  type PrismaModels,
  prismaErrorCode,
} from './client';

export interface PrismaAdapterOptions {
  idFields?: Readonly<Record<string, string>>;
}

export class PrismaAdapter<
  TClient extends PrismaClientLike = PrismaClientLike,
> extends PersistenceAdapter {
  public override readonly capabilities: PersistenceCapabilities = {
    transactions: true,
  };

  readonly #idFields: Readonly<Record<string, string>>;

  public constructor(
    private readonly prisma: TClient,
    options: PrismaAdapterOptions = {},
  ) {
    super();
    this.#idFields = options.idFields ?? {};
  }

  public get client(): TClient {
    return this.prisma;
  }

  public async connect(): Promise<void> {
    await this.prisma.$connect();
  }

  public async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }

  public repository<T, K = string>(
    name: string,
    options: RepositoryOptions = {},
  ): Repository<T, K> {
    return new PrismaRepository<T, K>(
      delegate(asModels(this.prisma), name),
      name,
      options.idField ?? this.#idFields[name] ?? 'id',
    );
  }

  public transaction<R>(fn: (tx: TransactionContext) => Promise<R>): Promise<R> {
    return this.prisma.$transaction((tx: PrismaModels) =>
      fn({
        repository: (name, options) =>
          new PrismaRepository(
            delegate(tx, name),
            name,
            options?.idField ?? this.#idFields[name] ?? 'id',
          ),
      }),
    ) as Promise<R>;
  }
}

function delegate(client: PrismaModels, name: string): PrismaDelegate {
  const candidate = client[name];
  if (isDelegate(candidate)) return candidate;

  const available = modelNames(client);
  throw new PersistenceException(
    `No Prisma model "${name}". ${
      available.length > 0
        ? `This client exposes: ${available.join(', ')}. Note that delegates are camelCase, a \`model Character\` is \`character\`.`
        : 'No models could be found on this client at all, check that what was passed to PrismaAdapter is a generated PrismaClient.'
    }`,
  );
}

class PrismaRepository<T, K> implements Repository<T, K> {
  public constructor(
    private readonly model: PrismaDelegate,
    private readonly name: string,
    private readonly idField: string,
  ) {}

  public async findById(id: K): Promise<T | undefined> {
    const row = await this.#guard(() => this.model.findUnique({ where: this.#key(id) }));
    return nullToUndefined<T>(row);
  }

  public async findOne(where: Where<T>): Promise<T | undefined> {
    const row = await this.#guard(() => this.model.findFirst({ where: plain(where) }));
    return nullToUndefined<T>(row);
  }

  public async findMany(query: FindQuery<T> = {}): Promise<T[]> {
    const args: Parameters<PrismaDelegate['findMany']>[0] = {};
    if (query.where) args.where = plain(query.where);
    if (query.orderBy) args.orderBy = toPrismaOrderBy(query.orderBy);
    if (query.take !== undefined) args.take = query.take;
    if (query.skip !== undefined) args.skip = query.skip;

    return (await this.#guard(() => this.model.findMany(args))) as T[];
  }

  public count(where?: Where<T>): Promise<number> {
    return this.#guard(() => this.model.count(where ? { where: plain(where) } : {}));
  }

  public async create(data: T): Promise<T> {
    try {
      return (await this.model.create({ data: plain(data) })) as T;
    } catch (error) {
      if (prismaErrorCode(error) === PrismaErrorCode.UniqueConstraint) {
        throw new PersistenceException(
          `Cannot create ${this.name}: a record with that key already exists.`,
          { cause: error },
        );
      }
      throw this.#wrap('create', error);
    }
  }

  public async update(id: K, data: Partial<T>): Promise<T> {
    const { [this.idField]: _ignored, ...patch } = plain(data);

    try {
      return (await this.model.update({
        where: this.#key(id),
        data: patch,
      })) as T;
    } catch (error) {
      if (prismaErrorCode(error) === PrismaErrorCode.RecordNotFound) {
        throw new PersistenceException(
          `Cannot update ${this.name}: no record with ${this.idField} "${String(id)}".`,
          { cause: error },
        );
      }
      throw this.#wrap('update', error);
    }
  }

  public async upsert(id: K, data: T): Promise<T> {
    const row = plain(data);
    const { [this.idField]: _ignored, ...patch } = row;

    return (await this.#guard(() =>
      this.model.upsert({
        where: this.#key(id),
        create: { ...row, [this.idField]: id },
        update: patch,
      }),
    )) as T;
  }

  public async delete(id: K): Promise<boolean> {
    const { count } = await this.#guard(() => this.model.deleteMany({ where: this.#key(id) }));
    return count > 0;
  }

  public async deleteMany(where: Where<T>): Promise<number> {
    const { count } = await this.#guard(() => this.model.deleteMany({ where: plain(where) }));
    return count;
  }

  #key(id: K): Record<string, unknown> {
    return { [this.idField]: id };
  }

  async #guard<R>(operation: () => Promise<R>): Promise<R> {
    try {
      return await operation();
    } catch (error) {
      throw this.#wrap('query', error);
    }
  }

  #wrap(operation: string, error: unknown): PersistenceException {
    if (error instanceof PersistenceException) return error;

    const code = prismaErrorCode(error);
    const detail = error instanceof Error ? error.message : String(error);
    return new PersistenceException(
      `Prisma ${operation} on "${this.name}" failed${code ? ` (${code})` : ''}: ${detail}`,
      { cause: error },
    );
  }
}

function toPrismaOrderBy(orderBy: Record<string, string | undefined>): Record<string, string>[] {
  const clauses: Record<string, string>[] = [];
  for (const [field, direction] of Object.entries(orderBy)) {
    if (direction) clauses.push({ [field]: direction });
  }
  return clauses;
}

function plain(value: unknown): Record<string, unknown> {
  return { ...(value as Record<string, unknown>) };
}

function nullToUndefined<T>(row: unknown): T | undefined {
  return row === null || row === undefined ? undefined : (row as T);
}
