import type { AnyCtor } from './types';

export type Token<T = unknown> = InjectionToken<T> | AnyCtor<T>;

export class InjectionToken<T = unknown> {
  declare readonly __type: T;
  public constructor(public readonly description: string) {}
  public toString(): string {
    return `InjectionToken(${this.description})`;
  }
}

export function createToken<T>(description: string): InjectionToken<T> {
  return new InjectionToken<T>(description);
}

export function isInjectionToken(value: unknown): value is InjectionToken {
  return value instanceof InjectionToken;
}

export function tokenName(token: Token | unknown): string {
  if (token === null || token === undefined) return String(token);
  if (isInjectionToken(token)) return token.description;
  if (typeof token === 'function') return token.name || '<anonymous class>';
  return String(token);
}
