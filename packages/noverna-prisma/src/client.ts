export interface PrismaDelegate {
  findUnique(args: { where: Record<string, unknown> }): Promise<unknown>;
  findFirst(args: { where?: Record<string, unknown> }): Promise<unknown>;
  findMany(args: {
    where?: Record<string, unknown>;
    orderBy?: Record<string, string>[];
    take?: number;
    skip?: number;
  }): Promise<unknown[]>;
  count(args: { where?: Record<string, unknown> }): Promise<number>;
  create(args: { data: Record<string, unknown> }): Promise<unknown>;
  update(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<unknown>;
  upsert(args: {
    where: Record<string, unknown>;
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  }): Promise<unknown>;
  deleteMany(args: { where?: Record<string, unknown> }): Promise<{ count: number }>;
}

export type PrismaModels = Record<string, unknown>;

export interface PrismaClientLike {
  $connect(): Promise<void>;
  $disconnect(): Promise<void>;
  // biome-ignore lint/suspicious/noExplicitAny: see above; narrowed at the one call site.
  $transaction: (...args: any[]) => any;
}

export function asModels(client: object): PrismaModels {
  return client as unknown as PrismaModels;
}

/*
 * Prisma's known error codes.
 *
 * @see https://www.prisma.io/docs/orm/reference/error-reference
 */
export const PrismaErrorCode = {
  /* Unique constraint violation. */
  UniqueConstraint: 'P2002',
  /* An operation depended on a record that does not exist. */
  RecordNotFound: 'P2025',
} as const;

export function prismaErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

export function isDelegate(value: unknown): value is PrismaDelegate {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as PrismaDelegate).findMany === 'function'
  );
}

export function modelNames(client: PrismaModels): string[] {
  const names = new Set<string>();

  let current: object | null = client;
  while (current && current !== Object.prototype) {
    for (const key of Object.getOwnPropertyNames(current)) {
      if (key === 'constructor' || key.startsWith('$') || key.startsWith('_')) continue;

      let value: unknown;
      try {
        value = (client as Record<string, unknown>)[key];
      } catch {
        continue;
      }

      if (isDelegate(value)) names.add(key);
    }
    current = Object.getPrototypeOf(current) as object | null;
  }

  return [...names].sort();
}
