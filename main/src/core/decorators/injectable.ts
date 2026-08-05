import { defineMetadata, getOwnMetadata, type Token } from '../../shared';
import type { Scope } from '../di/types';
import { INJECT_PARAMS, INJECTABLE, OPTIONAL_PARAMS } from '../keys';

export interface InjectableOptions {
  scope?: Scope;
}

export function Injectable(options: InjectableOptions = {}): ClassDecorator {
  return (target) => {
    defineMetadata(INJECTABLE, options, target);
  };
}

export function isInjectable(target: object): boolean {
  return getOwnMetadata<InjectableOptions>(INJECTABLE, target) !== undefined;
}

export function getInjectableOptions(target: object): InjectableOptions | undefined {
  return getOwnMetadata<InjectableOptions>(INJECTABLE, target);
}

export function Inject(token: Token): ParameterDecorator {
  return (target, propertyKey, parameterIndex) => {
    if (propertyKey !== undefined) {
      throw new TypeError(
        `@Inject() is only valid on constructor parameters. Saw it on ${String(propertyKey)}(); for handler parameters use @Ctx()/@Player()/@Arg() instead.`,
      );
    }
    const existing = getOwnMetadata<Map<number, Token>>(INJECT_PARAMS, target) ?? new Map();
    existing.set(parameterIndex, token);
    defineMetadata(INJECT_PARAMS, existing, target);
  };
}

export function Optional(): ParameterDecorator {
  return (target, _propertyKey, parameterIndex) => {
    const existing = getOwnMetadata<Set<number>>(OPTIONAL_PARAMS, target) ?? new Set();
    existing.add(parameterIndex);
    defineMetadata(OPTIONAL_PARAMS, existing, target);
  };
}
