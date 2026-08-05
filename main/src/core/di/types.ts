import type { Ctor, MaybePromise, Token } from '../../shared';

export const Scope = {
  Singleton: 'singleton',
  Scoped: 'scoped',
  Transient: 'transient',
} as const;
export type Scope = (typeof Scope)[keyof typeof Scope];

export interface ClassProvider<T = unknown> {
  provide: Token<T>;
  useClass: Ctor<T>;
  scope?: Scope;
}

export interface ValueProvider<T = unknown> {
  provide: Token<T>;
  useValue: T;
}

export interface FactoryProvider<T = unknown> {
  provide: Token<T>;
  useFactory: (...args: never[]) => MaybePromise<T>;
  inject?: readonly Token[];
  scope?: Scope;
}

export interface ExistingProvider<T = unknown> {
  provide: Token<T>;
  useExisting: Token<T>;
}

export type Provider<T = unknown> =
  | Ctor<T>
  | ClassProvider<T>
  | ValueProvider<T>
  | FactoryProvider<T>
  | ExistingProvider<T>;

export type Binding =
  | { kind: 'class'; token: Token; useClass: Ctor; scope: Scope }
  | { kind: 'value'; token: Token; useValue: unknown }
  | {
      kind: 'factory';
      token: Token;
      useFactory: (...args: never[]) => MaybePromise<unknown>;
      inject: readonly Token[];
      scope: Scope;
    }
  | { kind: 'existing'; token: Token; useExisting: Token };

// Container Specific Types
export type ProviderDefinition<T> =
  | Omit<ClassProvider<T>, 'provide'>
  | Omit<ValueProvider<T>, 'provide'>
  | Omit<FactoryProvider<T>, 'provide'>
  | Omit<ExistingProvider<T>, 'provide'>;

export interface ResolutionContext {
  readonly stack: Token[];
}
