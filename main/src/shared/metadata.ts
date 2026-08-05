import type {
  AnyCtor,
  MetadataBucket,
  MetadataKey,
  ReflectWithMetadata,
  TargetBuckets,
} from './types';

/** Constructor parameter types, emitted by `emitDecoratorMetadata`. */
export const DESIGN_PARAMTYPES = 'design:paramtypes';
/** Property/accessor type, emitted by `emitDecoratorMetadata`. */
export const DESIGN_TYPE = 'design:type';
/** Method return type, emitted by `emitDecoratorMetadata`. */
export const DESIGN_RETURNTYPE = 'design:returntype';

const store = new WeakMap<object, TargetBuckets>();

function bucketFor(
  target: object,
  propertyKey: MetadataKey | undefined,
  create: boolean,
): MetadataBucket | undefined {
  let buckets = store.get(target);
  if (!buckets) {
    if (!create) return undefined;
    buckets = new Map();
    store.set(target, buckets);
  }
  let bucket = buckets.get(propertyKey);
  if (!bucket) {
    if (!create) return undefined;
    bucket = new Map();
    buckets.set(propertyKey, bucket);
  }
  return bucket;
}

const shim: Required<ReflectWithMetadata> = {
  defineMetadata(key, value, target, propertyKey) {
    // biome-ignore lint/style/noNonNullAssertion: `create: true` always returns a bucket.
    bucketFor(target, propertyKey, true)!.set(key, value);
  },
  getOwnMetadata(key, target, propertyKey) {
    return bucketFor(target, propertyKey, false)?.get(key);
  },
  hasOwnMetadata(key, target, propertyKey) {
    return bucketFor(target, propertyKey, false)?.has(key) ?? false;
  },
  metadata(key, value) {
    return (target, propertyKey) => {
      shim.defineMetadata(key, value, target, propertyKey);
    };
  },
};

const reflect = Reflect as ReflectWithMetadata;
reflect.defineMetadata ??= shim.defineMetadata;
reflect.getOwnMetadata ??= shim.getOwnMetadata;
reflect.hasOwnMetadata ??= shim.hasOwnMetadata;
reflect.metadata ??= shim.metadata;

export function defineMetadata(
  key: MetadataKey,
  value: unknown,
  target: object,
  propertyKey?: MetadataKey,
): void {
  // biome-ignore lint/style/noNonNullAssertion: installed above.
  reflect.defineMetadata!(key, value, target, propertyKey);
}

export function getOwnMetadata<T>(
  key: MetadataKey,
  target: object,
  propertyKey?: MetadataKey,
): T | undefined {
  // biome-ignore lint/style/noNonNullAssertion: installed above.
  return reflect.getOwnMetadata!(key, target, propertyKey) as T | undefined;
}

export function hasOwnMetadata(
  key: MetadataKey,
  target: object,
  propertyKey?: MetadataKey,
): boolean {
  // biome-ignore lint/style/noNonNullAssertion: installed above.
  return reflect.hasOwnMetadata!(key, target, propertyKey);
}

export function getMetadata<T>(
  key: MetadataKey,
  target: object,
  propertyKey?: MetadataKey,
): T | undefined {
  let current: object | null = target;
  while (current) {
    const own = getOwnMetadata<T>(key, current, propertyKey);
    if (own !== undefined) return own;
    current = Object.getPrototypeOf(current) as object | null;
  }
  return undefined;
}

export function getMetadataChain<T>(
  key: MetadataKey,
  target: object,
  propertyKey?: MetadataKey,
): T[] {
  const chain: T[][] = [];
  let current: object | null = target;
  while (current) {
    const own = getOwnMetadata<T[]>(key, current, propertyKey);
    if (own && own.length > 0) chain.unshift(own);
    current = Object.getPrototypeOf(current) as object | null;
  }
  return chain.flat();
}

export function appendMetadata<T>(
  key: MetadataKey,
  value: T,
  target: object,
  propertyKey?: MetadataKey,
): void {
  const own = getOwnMetadata<T[]>(key, target, propertyKey) ?? [];
  defineMetadata(key, [...own, value], target, propertyKey);
}

export function getParamTypes(target: AnyCtor): readonly unknown[] | undefined {
  return getOwnMetadata<unknown[]>(DESIGN_PARAMTYPES, target);
}

export function getMethodParamTypes(
  prototype: object,
  methodName: string | symbol,
): readonly unknown[] {
  return getOwnMetadata<unknown[]>(DESIGN_PARAMTYPES, prototype, methodName) ?? [];
}
