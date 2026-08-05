import type { Ctor } from '../../shared';

export interface StateBagView {
  get<T = unknown>(key: string): T | undefined;
  set(key: string, value: unknown, replicated?: boolean): void;
}

export abstract class SharedPlayer {
  // Source
  public abstract readonly handle: number;

  public abstract get name(): string;

  public abstract get state(): StateBagView;

  /*
   * Free-form storage for the lifetime of the player object.
   *
   * Deliberately not a plain property bag on `this`: keeping it separate means a subclass can
   * never collide with framework internals, and it stays visible in a debugger.
   */
  public readonly data = new Map<string | symbol, unknown>();

  public toString(): string {
    return `${this.constructor.name}(${this.handle})`;
  }

  public toJSON(): { handle: number; name: string } {
    return { handle: this.handle, name: this.name };
  }
}

export function playerTokenChain(playerClass: Ctor<SharedPlayer>): Ctor<SharedPlayer>[] {
  const chain: Ctor<SharedPlayer>[] = [];
  let current: unknown = playerClass;
  while (typeof current === 'function' && current !== Function.prototype) {
    chain.push(current as Ctor<SharedPlayer>);
    if (current === SharedPlayer) break;
    current = Object.getPrototypeOf(current);
  }
  return chain;
}

export function isPlayerClass(value: unknown): value is Ctor<SharedPlayer> {
  if (typeof value !== 'function') return false;
  let current: unknown = value;
  while (typeof current === 'function') {
    if (current === SharedPlayer) return true;
    current = Object.getPrototypeOf(current);
  }
  return false;
}
