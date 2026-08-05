// biome-ignore lint/suspicious/noExplicitAny: constructor arguments are erased at the token level.
export type Ctor<T = unknown> = new (...args: any[]) => T;
// biome-ignore lint/suspicious/noExplicitAny: Same reason as Ctor
export type AbstractCtor<T = unknown> = abstract new (...args: any[]) => T;
export type AnyCtor<T = unknown> = Ctor<T> | AbstractCtor<T>;
export type MaybePromise<T> = T | Promise<T>;
export type Dict<T = unknown> = Record<string, T>;
export type Unsubscribe = () => void;
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export type MetadataKey = string | symbol;
export type MetadataBucket = Map<MetadataKey, unknown>;
export type TargetBuckets = Map<MetadataKey | undefined, MetadataBucket>;
export interface ReflectWithMetadata {
  metadata?: (
    key: MetadataKey,
    value: unknown,
  ) => (target: object, propertyKey?: MetadataKey) => void;
  defineMetadata?: (
    key: MetadataKey,
    value: unknown,
    target: object,
    propertyKey?: MetadataKey,
  ) => void;
  getOwnMetadata?: (key: MetadataKey, target: object, propertyKey?: MetadataKey) => unknown;
  hasOwnMetadata?: (key: MetadataKey, target: object, propertyKey?: MetadataKey) => boolean;
}
