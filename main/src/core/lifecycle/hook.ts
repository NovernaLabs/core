import type { MaybePromise } from '../../shared/types.js';

export const LifecyclePhase = {
  Created: 'created',
  Registering: 'registering',
  Initializing: 'initializing',
  Bootstrapping: 'bootstrapping',
  Running: 'running',
  ShuttingDown: 'shutting-down',
  Disposed: 'disposed',
} as const;

export type LifecyclePhase = (typeof LifecyclePhase)[keyof typeof LifecyclePhase];

export interface OnModuleInit {
  onModuleInit(): MaybePromise<void>;
}

export interface OnApplicationBootstrap {
  onApplicationBootstrap(): MaybePromise<void>;
}

export interface OnApplicationShutdown {
  onApplicationShutdown(reason?: string): MaybePromise<void>;
}

export interface OnModuleDestroy {
  onModuleDestroy(): MaybePromise<void>;
}

export interface OnDispose {
  onDispose(): MaybePromise<void>;
}

type HookName =
  | 'onModuleInit'
  | 'onApplicationBootstrap'
  | 'onApplicationShutdown'
  | 'onModuleDestroy'
  | 'onDispose';

export function hasHook<K extends HookName>(
  instance: unknown,
  hook: K,
): instance is Record<K, (...args: never[]) => MaybePromise<void>> {
  return (
    typeof instance === 'object' &&
    instance !== null &&
    typeof (instance as Record<string, unknown>)[hook] === 'function'
  );
}
