import { createToken, type MaybePromise } from '../shared';

// Temp Type, until we have a dedicated type for it.
type SharedPlayer = any;

export const RESOURCE_NAME = createToken<string>('RESOURCE_NAME');
export const RUNTIME_SIDE = createToken<'server' | 'client'>('RUNTIME_SIDE');

export const CURRENT_PLAYER = createToken<SharedPlayer>('CURRENT_PLAYER');

export const CURRENT_SOURCE = createToken<number>('CURRENT_SOURCE');

export const MAIN_THREAD = createToken<MainThreadScheduler>('MAIN_THREAD');

export interface MainThreadScheduler {
  yield(): Promise<void>;
  run<T>(fn: () => MaybePromise<T>): Promise<T>;
}

export const PLAYER_RESOLVER = createToken<PlayerResolver>('PLAYER_RESOLVER');

export interface PlayerResolver {
  resolve(source: number): MaybePromise<SharedPlayer | undefined>;
}
