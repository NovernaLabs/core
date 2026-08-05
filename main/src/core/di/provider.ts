import { type Ctor, getOwnMetadata, type Token } from '../../shared';
import { INJECTABLE } from '../keys';
import {
  type Binding,
  type ClassProvider,
  type ExistingProvider,
  type FactoryProvider,
  type Provider,
  Scope,
  type ValueProvider,
} from './types';

export function isClassProvider(p: Provider): p is ClassProvider {
  return typeof p === 'object' && 'useClass' in p;
}

export function isValueProvider(p: Provider): p is ValueProvider {
  return typeof p === 'object' && 'useValue' in p;
}

export function isFactoryProvider(p: Provider): p is FactoryProvider {
  return typeof p === 'object' && 'useFactory' in p;
}

export function isExistingProvider(p: Provider): p is ExistingProvider {
  return typeof p === 'object' && 'useExisting' in p;
}

function scopeOfClass(target: Ctor): Scope {
  return getOwnMetadata<{ scope?: Scope }>(INJECTABLE, target)?.scope ?? Scope.Singleton;
}

export function isClassShorthand(p: Provider): p is Ctor {
  return typeof p === 'function';
}

export function providerToken(provider: Provider): Token {
  return isClassShorthand(provider) ? provider : provider.provide;
}

export function normalizeProvider(provider: Provider): Binding {
  if (isClassShorthand(provider)) {
    return {
      kind: 'class',
      token: provider,
      useClass: provider,
      scope: scopeOfClass(provider),
    };
  }
  if (isClassProvider(provider)) {
    return {
      kind: 'class',
      token: provider.provide,
      useClass: provider.useClass,
      scope: provider.scope ?? scopeOfClass(provider.useClass),
    };
  }
  if (isValueProvider(provider)) {
    return {
      kind: 'value',
      token: provider.provide,
      useValue: provider.useValue,
    };
  }
  if (isFactoryProvider(provider)) {
    return {
      kind: 'factory',
      token: provider.provide,
      useFactory: provider.useFactory,
      inject: provider.inject ?? [],
      scope: provider.scope ?? Scope.Singleton,
    };
  }
  if (isExistingProvider(provider)) {
    return {
      kind: 'existing',
      token: provider.provide,
      useExisting: provider.useExisting,
    };
  }
  throw new TypeError(
    `Invalid provider: expected a class or one of useClass/useValue/useFactory/useExisting, got ${JSON.stringify(provider)}`,
  );
}
