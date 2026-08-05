//!
//! Important Note:
//! Since the Metrics and Error Handling is Bound to our private Framework and Custom Watcher (Our Plattform for Metrics&Errors)
//! We need to Create a new Way of Handling them, maybe just store them in Memory (But then they will only be there per session, and not Persistent)
//!

import type { Ctor, Dict, Token } from '../../shared';
import type { Container } from '../di/container';
import type { ExceptionHandler, ExceptionOutcome } from '../errors/exception.handler';
import { ForbiddenException } from '../errors/exceptions';
import type { Logger } from '../logging/logger';
import type { ModuleRef } from '../modules/module-registry';
import { playerTokenChain, type SharedPlayer } from '../player/shared.player';
import {
  CURRENT_PLAYER,
  CURRENT_SOURCE,
  type MainThreadScheduler,
  type PlayerResolver,
} from '../token';
import type {
  ArgumentMetadata,
  CanActivate,
  Interceptor,
  Middleware,
  PipelineRef,
  PipeTransform,
} from './contracts';
import { ExecutionContext, type ExecutionType } from './execution.context';
import {
  collectPipeline,
  GUARDS,
  type HandlerDeclaration,
  type HandlerKind,
  type HandlerOptions,
  INTERCEPTORS,
  MIDDLEWARE,
  PIPES,
} from './handler.metadata';
import { buildParamPlan, ParamKind, type ResolvedParam } from './params';

export interface HandlerBinding {
  moduleRef: ModuleRef;
  target: Ctor;
  method: string | symbol;
  kind: HandlerKind;
  options: HandlerOptions;
  params: ResolvedParam[];
  guards: PipelineRef<CanActivate>[];
  pipes: PipelineRef<PipeTransform>[];
  interceptors: PipelineRef<Interceptor>[];
  middleware: PipelineRef<Middleware>[];
  id: string;
}

export function createHandlerBinding(
  moduleRef: ModuleRef,
  target: Ctor,
  declaration: HandlerDeclaration,
): HandlerBinding {
  return {
    moduleRef,
    target,
    method: declaration.method,
    kind: declaration.kind,
    options: declaration.options,
    params: buildParamPlan(target, declaration.method),
    guards: collectPipeline<CanActivate>(GUARDS, target, declaration.method),
    pipes: collectPipeline<PipeTransform>(PIPES, target, declaration.method),
    interceptors: collectPipeline<Interceptor>(INTERCEPTORS, target, declaration.method),
    middleware: collectPipeline<Middleware>(MIDDLEWARE, target, declaration.method),
    id: `${target.name}.${String(declaration.method)}`,
  };
}

export interface InvocationExtras {
  body?: unknown;
  params?: Dict<string>;
  query?: Dict<string>;
  headers?: Dict<string>;
  request?: unknown;
  response?: unknown;
  stateBag?: unknown;
}

export interface Invocation {
  type: ExecutionType;
  name: string;
  args: readonly unknown[];
  source?: number | undefined;
  player?: SharedPlayer | undefined;
  extras?: InvocationExtras;
}

export interface PipelineDependencies {
  rootContainer: Container;
  logger: Logger;
  exceptions: ExceptionHandler;
  mainThread: MainThreadScheduler;
  playerResolver?: PlayerResolver | undefined;
}

export interface DispatchResult {
  ok: boolean;
  value?: unknown;
  outcome?: ExceptionOutcome;
}

export class ExecutionPipeline {
  readonly #globalMiddleware: PipelineRef<Middleware>[] = [];
  readonly #globalGuards: PipelineRef<CanActivate>[] = [];
  readonly #globalInterceptors: PipelineRef<Interceptor>[] = [];
  readonly #globalPipes: PipelineRef<PipeTransform>[] = [];

  public constructor(private readonly deps: PipelineDependencies) {}

  public setPlayerResolver(resolver: PlayerResolver | undefined): this {
    this.deps.playerResolver = resolver;
    return this;
  }

  public useMiddleware(...middleware: PipelineRef<Middleware>[]): this {
    this.#globalMiddleware.push(...middleware);
    return this;
  }

  public useGuards(...guards: PipelineRef<CanActivate>[]): this {
    this.#globalGuards.push(...guards);
    return this;
  }

  public useInterceptors(...interceptors: PipelineRef<Interceptor>[]): this {
    this.#globalInterceptors.push(...interceptors);
    return this;
  }

  public usePipes(...pipes: PipelineRef<PipeTransform>[]): this {
    this.#globalPipes.push(...pipes);
    return this;
  }

  public async dispatch(binding: HandlerBinding, invocation: Invocation): Promise<DispatchResult> {
    const scope = binding.moduleRef.container.createScope(`${invocation.type}:${invocation.name}`);
    // const started = Date.now();
    let context: ExecutionContext | undefined;

    try {
      const player = await this.#resolvePlayer(binding, invocation);

      context = new ExecutionContext({
        type: invocation.type,
        name: invocation.name,
        ...(invocation.source !== undefined ? { source: invocation.source } : {}),
        args: invocation.args,
        handler: (binding.target.prototype as Dict)[binding.method as string] as (
          ...args: never[]
        ) => unknown,
        handlerName: String(binding.method),
        target: binding.target,
        container: scope,
        ...(player ? { player } : {}),
      });

      this.#seedScope(scope, context, player, invocation.source);
      // @TODO: @Code-Pumba Need to be adressed later.
      //   this.deps.metrics.counter("handler.invocations", 1, {
      //     transport: invocation.type,
      //     handler: binding.id,
      //   });

      const value = await this.#run(binding, context, invocation, scope);
      // @TODO: @Code-Pumba Need to be adressed later.
      //   this.deps.metrics.counter("handler.success", 1, {
      //     transport: invocation.type,
      //     handler: binding.id,
      //   });
      return { ok: true, value };
    } catch (error) {
      // @TODO: @Code-Pumba Need to be adressed later.
      const reportingContext = context ?? this.#fallbackContext(binding, invocation, scope);

      const outcome = await this.deps.exceptions.handle(error, reportingContext);
      return { ok: false, outcome };
    } finally {
      // @TODO: @Code-Pumba Need to be adressed later.
      //   this.deps.metrics.histogram("handler.duration", Date.now() - started, {
      //     transport: invocation.type,
      //     handler: binding.id,
      //   });
      await scope.dispose();
    }
  }

  async #resolvePlayer(
    binding: HandlerBinding,
    invocation: Invocation,
  ): Promise<SharedPlayer | undefined> {
    if (invocation.player) return invocation.player;
    if (invocation.source === undefined) return undefined;
    if (binding.options.withPlayer === false) return undefined;
    return this.deps.playerResolver?.resolve(invocation.source) ?? undefined;
  }

  #seedScope(
    scope: Container,
    context: ExecutionContext,
    player: SharedPlayer | undefined,
    source: number | undefined,
  ): void {
    scope.seed(ExecutionContext, context);
    if (source !== undefined) scope.seed(CURRENT_SOURCE, source);
    if (player) {
      scope.seed(CURRENT_PLAYER, player);
      for (const ctor of playerTokenChain(player.constructor as Ctor<SharedPlayer>)) {
        scope.seed(ctor as unknown as Token<SharedPlayer>, player);
      }
    }
  }
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: '#fallbackContext' read commit for information
  #fallbackContext(
    binding: HandlerBinding,
    invocation: Invocation,
    scope: Container,
  ): ExecutionContext {
    return new ExecutionContext({
      type: invocation.type,
      name: invocation.name,
      ...(invocation.source !== undefined ? { source: invocation.source } : {}),
      args: invocation.args,
      handler: () => undefined,
      handlerName: String(binding.method),
      target: binding.target,
      container: scope,
    });
  }

  async #run(
    binding: HandlerBinding,
    context: ExecutionContext,
    invocation: Invocation,
    scope: Container,
  ): Promise<unknown> {
    const middleware = [...this.#globalMiddleware, ...binding.middleware];
    const invokeCore = async (): Promise<unknown> => {
      await this.#runGuards(binding, context, scope);

      const args = await this.#resolveArgs(binding, context, invocation, scope);
      const interceptors = await this.#instantiateAll<Interceptor>(
        [...this.#globalInterceptors, ...binding.interceptors],
        scope,
      );

      const instance = (await scope.resolve(binding.target)) as Dict<
        (...args: unknown[]) => unknown
      >;
      const method = instance[binding.method as string];
      if (typeof method !== 'function') {
        throw new TypeError(`${binding.id} is not a method`);
      }

      const callHandler = async (): Promise<unknown> => {
        await this.deps.mainThread.yield();
        return method.apply(instance, args);
      };

      return composeInterceptors(interceptors, context, callHandler);
    };

    if (middleware.length === 0) return invokeCore();

    const instances = await this.#instantiateAll<Middleware>(middleware, scope);
    return composeMiddleware(instances, context, invokeCore);
  }

  async #runGuards(
    binding: HandlerBinding,
    context: ExecutionContext,
    scope: Container,
  ): Promise<void> {
    const guards = await this.#instantiateAll<CanActivate>(
      [...this.#globalGuards, ...binding.guards],
      scope,
    );
    for (const guard of guards) {
      const allowed = await guard.canActivate(context);
      if (!allowed) {
        throw new ForbiddenException(
          `${guard.constructor.name} denied ${context.label}`,
          guard.constructor.name,
        );
      }
    }
  }

  async #resolveArgs(
    binding: HandlerBinding,
    context: ExecutionContext,
    invocation: Invocation,
    scope: Container,
  ): Promise<unknown[]> {
    const extras = invocation.extras ?? {};
    const args: unknown[] = [];

    for (const param of binding.params) {
      const raw = await this.#rawValue(param, context, invocation, extras, scope);
      args[param.index] = await this.#applyPipes(binding, param, raw, context, scope);
    }

    return args;
  }

  async #rawValue(
    param: ResolvedParam,
    context: ExecutionContext,
    invocation: Invocation,
    extras: InvocationExtras,
    scope: Container,
  ): Promise<unknown> {
    switch (param.kind) {
      case ParamKind.Player:
        return context.getPlayer();
      case ParamKind.Source:
        return invocation.source;
      case ParamKind.Context:
        return context;
      case ParamKind.Args:
        return invocation.args;
      case ParamKind.Arg:
        return invocation.args[param.argIndex ?? param.index];
      case ParamKind.Dependency:
        return scope.resolve(param.data as Token);
      case ParamKind.Body:
        return extras.body;
      case ParamKind.Param:
        return param.data === undefined ? extras.params : extras.params?.[param.data as string];
      case ParamKind.Query:
        return param.data === undefined ? extras.query : extras.query?.[param.data as string];
      case ParamKind.Headers:
        return param.data === undefined
          ? extras.headers
          : extras.headers?.[(param.data as string).toLowerCase()];
      case ParamKind.Request:
        return extras.request;
      case ParamKind.Response:
        return extras.response;
      case ParamKind.StateBag:
        return extras.stateBag;
      default:
        return undefined;
    }
  }

  async #applyPipes(
    binding: HandlerBinding,
    param: ResolvedParam,
    value: unknown,
    context: ExecutionContext,
    scope: Container,
  ): Promise<unknown> {
    const refs = [...this.#globalPipes, ...binding.pipes, ...(param.pipes ?? [])];
    if (refs.length === 0) return value;

    if (
      param.kind === ParamKind.Context ||
      param.kind === ParamKind.Player ||
      param.kind === ParamKind.Request ||
      param.kind === ParamKind.Response ||
      param.kind === ParamKind.Dependency
    ) {
      return value;
    }

    const metadata: ArgumentMetadata = {
      index: param.index,
      source: param.kind,
      data: typeof param.data === 'string' ? param.data : undefined,
      metatype: param.metatype,
    };

    const pipes = await this.#instantiateAll<PipeTransform>(refs, scope);
    let current = value;
    for (const pipe of pipes) current = await pipe.transform(current, metadata, context);
    return current;
  }

  async #instantiateAll<T>(refs: readonly PipelineRef<T>[], scope: Container): Promise<T[]> {
    if (refs.length === 0) return [];
    return Promise.all(
      refs.map(async (ref) =>
        typeof ref === 'function' ? ((await scope.resolve(ref as Ctor<T>)) as T) : ref,
      ),
    );
  }
}

function composeMiddleware(
  middleware: readonly Middleware[],
  context: ExecutionContext,
  core: () => Promise<unknown>,
): Promise<unknown> {
  let index = -1;
  const step = async (i: number): Promise<unknown> => {
    if (i <= index) throw new Error('next() called more than once in middleware');
    index = i;
    const current = middleware[i];
    if (!current) return core();
    return current.use(context, () => step(i + 1));
  };
  return step(0);
}

function composeInterceptors(
  interceptors: readonly Interceptor[],
  context: ExecutionContext,
  core: () => Promise<unknown>,
): Promise<unknown> {
  let index = -1;
  const step = async (i: number): Promise<unknown> => {
    if (i <= index) throw new Error('next() called more than once in an interceptor');
    index = i;
    const current = interceptors[i];
    if (!current) return core();
    return current.intercept(context, () => step(i + 1));
  };
  return step(0);
}
