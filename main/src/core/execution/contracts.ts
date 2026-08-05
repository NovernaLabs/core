import type { Ctor, MaybePromise } from '../../shared';
import type { ExecutionContext } from './execution.context';

export interface CanActivate {
  canActivate(context: ExecutionContext): MaybePromise<boolean>;
}

export interface ArgumentMetadata {
  index: number;
  source: string;
  data?: string | undefined;
  metatype?: unknown;
}

export interface PipeTransform<TIn = unknown, TOut = unknown> {
  transform(value: TIn, metadata: ArgumentMetadata, context: ExecutionContext): MaybePromise<TOut>;
}

export interface Interceptor {
  intercept(context: ExecutionContext, next: () => Promise<unknown>): MaybePromise<unknown>;
}

export interface Middleware {
  use(context: ExecutionContext, next: () => Promise<unknown>): MaybePromise<unknown>;
}

export interface ExceptionFilter<T = unknown> {
  readonly catches?: Ctor<Error> | undefined;
  catch(error: T, context: ExecutionContext): MaybePromise<unknown>;
}

export type PipelineRef<T> = Ctor<T> | T;
