import type { Ctor } from '../../shared';
import type { ExceptionFilter } from '../execution/contracts';
import { type ExecutionContext, ExecutionType } from '../execution/execution.context';
import type { Logger } from '../logging/logger';
import type { MetricsProvider } from '../metrics/metrics';
import { ForbiddenException, HttpException, ValidationException } from './exceptions';

export interface ExceptionOutcome {
  handled: boolean;
  result?: unknown;
  status: number;
  message: string;
  error: unknown;
}

export class ExceptionHandler {
  readonly #filters: ExceptionFilter[] = [];

  public constructor(
    private readonly logger: Logger,
    private readonly metrics: MetricsProvider,
  ) {}

  public register(filter: ExceptionFilter): this {
    this.#filters.push(filter);
    return this;
  }

  public async handle(error: unknown, context: ExecutionContext): Promise<ExceptionOutcome> {
    const status = statusFor(error);
    const message = messageFor(error);
    this.metrics.counter('handler.errors', 1, {
      transport: context.type,
      handler: `${context.target.name}.${context.handlerName}`,
    });

    for (const filter of this.#filters) {
      if (filter.catches && !(error instanceof filter.catches)) continue;
      try {
        const result = await filter.catch(error, context);
        return { handled: true, result, status, message, error };
      } catch (filterError) {
        this.logger.error(`Exception filter ${filter.constructor.name} threw`, filterError);
      }
    }

    this.#log(error, context, status);
    return { handled: false, status, message, error };
  }

  #log(error: unknown, context: ExecutionContext, status: number): void {
    const fields = {
      transport: context.type,
      handler: `${context.target.name}.${context.handlerName}`,
      event: context.name,
      ...(context.source !== undefined ? { source: context.source } : {}),
    };

    if (error instanceof ForbiddenException || error instanceof ValidationException) {
      this.logger.warn(`${context.label} rejected: ${error.message}`, fields);
      return;
    }

    if (status < 500 && error instanceof HttpException) {
      this.logger.warn(`${context.label} failed: ${error.message}`, fields);
      return;
    }

    this.logger.error(`${context.label} threw`, error, fields);
  }
}

function statusFor(error: unknown): number {
  if (error instanceof HttpException) return error.status;
  if (error instanceof ForbiddenException) return 403;
  if (error instanceof ValidationException) return 400;
  if (error instanceof Error && error.name === 'NotFoundException') return 404;
  return 500;
}

function messageFor(error: unknown): string {
  if (
    error instanceof HttpException ||
    error instanceof ForbiddenException ||
    error instanceof ValidationException
  ) {
    return error.message;
  }
  return 'Internal error';
}

export function BaseExceptionFilter<T extends Error>(
  type: Ctor<T>,
): Ctor<ExceptionFilter<T>> & { prototype: ExceptionFilter<T> } {
  abstract class ScopedFilter implements ExceptionFilter<T> {
    public readonly catches = type;
    public abstract catch(error: T, context: ExecutionContext): unknown;
  }
  return ScopedFilter as unknown as Ctor<ExceptionFilter<T>>;
}

export const RESPONDING_TRANSPORTS: ReadonlySet<string> = new Set([
  ExecutionType.Http,
  ExecutionType.NuiEvent,
  ExecutionType.Export,
]);
