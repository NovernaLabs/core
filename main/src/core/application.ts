import { type Ctor, createToken, type MaybePromise, type Token } from '../shared';
import { Container } from './di/container';
import type { Provider } from './di/types';
import { ExceptionHandler } from './errors/exception.handler';
import { LifecycleException, PersistenceException } from './errors/exceptions';
import { EventBus } from './events/event.bus';
import type {
  CanActivate,
  ExceptionFilter,
  Interceptor,
  Middleware,
  PipelineRef,
  PipeTransform,
} from './execution/contracts';
import { ExecutionType } from './execution/execution.context';
import { collectHandlers, getControllerPrefix, HandlerKind } from './execution/handler.metadata';
import { createHandlerBinding, ExecutionPipeline, type HandlerBinding } from './execution/pipeline';
import { joinPath } from './http/router';
import { hasHook, LifecyclePhase } from './lifecycle/hook';
import { Logger, type LoggerTransport, LogLevel } from './logging/logger';
import { MetricsProvider, NoopMetricsProvider } from './metrics/metrics';
import { ModuleRef, ModuleRegistry } from './modules/module.registry';
import { withMainThreadResume } from './persistence/main.thread';
import { PersistenceAdapter } from './persistence/port';
import type { SharedPlayer } from './player/shared.player';
import { Scheduler, type SchedulerRuntime } from './scheduler/scheduler';
import {
  type MainThreadScheduler,
  type PlayerResolver,
  RESOURCE_NAME,
  RUNTIME_SIDE,
} from './token';

export const APPLICATION = createToken<Application>('APPLICATION');

export interface ApplicationOptions {
  rootModule?: Ctor;
  logLevel?: LogLevel;
  metrics?: MetricsProvider;
  playerClass?: Ctor<SharedPlayer>;
  persistence?: PersistenceAdapter;
  mainThreadPersistence?: boolean;
  providers?: readonly Provider[];
  schedulerRuntime?: SchedulerRuntime;
}

export abstract class Application {
  public readonly container: Container;
  public readonly logger: Logger;
  public readonly events: EventBus;
  public readonly metrics: MetricsProvider;
  public readonly exceptions: ExceptionHandler;
  public readonly pipeline: ExecutionPipeline;
  public readonly scheduler: Scheduler;

  readonly #registry: ModuleRegistry;
  readonly #bindings: HandlerBinding[] = [];
  readonly #eventSubscriptions: (() => void)[] = [];
  readonly #persistence: PersistenceAdapter | undefined;
  #rootModule: Ctor | undefined;
  #playerClass: Ctor<SharedPlayer> | undefined;
  #phase: LifecyclePhase = LifecyclePhase.Created;

  protected constructor(protected readonly options: ApplicationOptions = {}) {
    this.container = new Container('root');
    this.logger = new Logger({ level: options.logLevel ?? LogLevel.Info, context: 'noverna' }, []);
    this.events = new EventBus();
    this.metrics = options.metrics ?? new NoopMetricsProvider();
    this.exceptions = new ExceptionHandler(this.logger, this.metrics);
    this.#rootModule = options.rootModule;
    this.#playerClass = options.playerClass;

    const mainThread = this.createMainThreadScheduler();

    this.pipeline = new ExecutionPipeline({
      rootContainer: this.container,
      logger: this.logger,
      metrics: this.metrics,
      exceptions: this.exceptions,
      mainThread,
      playerResolver: undefined,
    });

    this.#persistence =
      options.persistence && (options.mainThreadPersistence ?? true)
        ? withMainThreadResume(options.persistence, mainThread)
        : options.persistence;

    this.scheduler = new Scheduler(this.pipeline, this.logger, options.schedulerRuntime);
    this.#registry = new ModuleRegistry(this.container);

    this.events.onError = (error, event) => {
      this.logger.error(`Listener for local event "${event}" failed`, error);
    };
  }

  public async start(): Promise<void> {
    this.#assertPhase(LifecyclePhase.Created, 'start');

    if (this.logger.transports.length === 0) {
      this.logger.addTransport(this.createDefaultLogTransport());
    }

    this.#phase = LifecyclePhase.Registering;
    this.#registerFrameworkProviders();

    if (!this.#rootModule) {
      throw new LifecycleException(
        'No root module. Pass one to Application.create({ rootModule }) or call app.registerRootModule(RootModule) before start().',
      );
    }

    const started = Date.now();
    await this.#connectPersistence();

    this.#registry.register(this.#rootModule);

    this.#phase = LifecyclePhase.Initializing;
    await this.#instantiateProviders();
    this.#collectHandlerBindings();
    await this.#bindHandlers();
    await this.onRuntimeReady();
    await this.#runHook('onModuleInit');

    this.#phase = LifecyclePhase.Bootstrapping;
    await this.#runHook('onApplicationBootstrap');
    this.scheduler.start();
    await this.#runLifecycleHandlers(HandlerKind.ResourceStart);

    this.#phase = LifecyclePhase.Running;
    this.logger.info(`${this.resourceName} started`, {
      side: this.side,
      modules: this.#registry.modules.length,
      handlers: this.#bindings.length,
      ms: Date.now() - started,
    });
  }

  public async stop(reason = 'resource stop'): Promise<void> {
    if (this.#phase === LifecyclePhase.Disposed || this.#phase === LifecyclePhase.ShuttingDown) {
      return;
    }
    this.#phase = LifecyclePhase.ShuttingDown;

    try {
      await this.#runLifecycleHandlers(HandlerKind.ResourceStop);
      await this.#runHook('onApplicationShutdown', reason);
      await this.onRuntimeShutdown();
    } catch (error) {
      this.logger.error('Error during shutdown', error);
    } finally {
      this.scheduler.stop();
      for (const unsubscribe of this.#eventSubscriptions) unsubscribe();
      this.#eventSubscriptions.length = 0;
      this.events.removeAllListeners();
      await this.container.dispose();
      await this.#disconnectPersistence();
      this.#phase = LifecyclePhase.Disposed;
      this.logger.info(`${this.resourceName} stopped`, { reason });
    }
  }

  public get phase(): LifecyclePhase {
    return this.#phase;
  }

  public get handlers(): readonly HandlerBinding[] {
    return this.#bindings;
  }

  public get modules(): readonly ModuleRef[] {
    return this.#registry.modules;
  }

  public get persistence(): PersistenceAdapter | undefined {
    return this.#persistence;
  }

  public registerRootModule(module: Ctor): this {
    this.#assertPhase(LifecyclePhase.Created, 'registerRootModule');
    this.#rootModule = module;
    return this;
  }

  public usePlayer(playerClass: Ctor<SharedPlayer>): this {
    this.#assertPhase(LifecyclePhase.Created, 'usePlayer');
    this.#playerClass = playerClass;
    return this;
  }

  public get playerClass(): Ctor<SharedPlayer> | undefined {
    return this.#playerClass;
  }

  public use(...middleware: PipelineRef<Middleware>[]): this {
    this.pipeline.useMiddleware(...middleware);
    return this;
  }

  public useGlobalGuards(...guards: PipelineRef<CanActivate>[]): this {
    this.pipeline.useGuards(...guards);
    return this;
  }

  public useGlobalPipes(...pipes: PipelineRef<PipeTransform>[]): this {
    this.pipeline.usePipes(...pipes);
    return this;
  }

  public useGlobalInterceptors(...interceptors: PipelineRef<Interceptor>[]): this {
    this.pipeline.useInterceptors(...interceptors);
    return this;
  }

  public useExceptionFilter(filter: ExceptionFilter): this {
    this.exceptions.register(filter);
    return this;
  }

  public addLogTransport(transport: LoggerTransport): this {
    this.logger.addTransport(transport);
    return this;
  }

  public setLogLevel(level: LogLevel): this {
    this.logger.level = level;
    return this;
  }

  public provide(...providers: Provider[]): this {
    this.container.registerMany(providers);
    return this;
  }

  public resolve<T>(token: Token<T>): Promise<T> {
    return this.container.resolve(token);
  }

  #registerFrameworkProviders(): void {
    this.pipeline.setPlayerResolver(this.createPlayerResolver());

    this.container
      .seed(APPLICATION, this)
      .seed(Logger, this.logger)
      .seed(EventBus, this.events)
      .seed(MetricsProvider, this.metrics)
      .seed(ExceptionHandler, this.exceptions)
      .seed(ExecutionPipeline, this.pipeline)
      .seed(Scheduler, this.scheduler)
      .seed(RESOURCE_NAME, this.resourceName)
      .seed(RUNTIME_SIDE, this.side);

    if (this.#persistence) this.container.seed(PersistenceAdapter, this.#persistence);

    this.registerRuntimeProviders();
    if (this.options.providers) this.container.registerMany(this.options.providers);
  }

  async #connectPersistence(): Promise<void> {
    if (!this.#persistence) return;

    try {
      await this.#persistence.connect();
    } catch (error) {
      throw new PersistenceException(
        `The persistence adapter failed to connect, so the resource cannot start: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }

    if (!this.#persistence.capabilities.transactions) {
      this.logger.warn(
        'The persistence adapter reports no transaction support. transaction() will run the callback, but a failure part way through leaves earlier writes in place.',
      );
    }
  }

  async #disconnectPersistence(): Promise<void> {
    if (!this.#persistence) return;
    try {
      await this.#persistence.disconnect();
    } catch (error) {
      this.logger.error('Persistence adapter failed to disconnect', error);
    }
  }

  async #instantiateProviders(): Promise<void> {
    for (const moduleRef of this.#registry.modules) {
      for (const token of moduleRef.container.eagerTokens()) {
        await moduleRef.container.resolve(token);
      }
    }
  }

  #collectHandlerBindings(): void {
    for (const moduleRef of this.#registry.modules) {
      const classes = new Set<Ctor>([...moduleRef.controllers, ...providerClasses(moduleRef)]);

      for (const target of classes) {
        for (const declaration of collectHandlers(target)) {
          this.#bindings.push(createHandlerBinding(moduleRef, target, declaration));
        }
      }
    }
  }

  async #bindHandlers(): Promise<void> {
    for (const binding of this.#bindings) {
      switch (binding.kind) {
        case HandlerKind.Event:
          this.#bindLocalEvent(binding);
          break;
        case HandlerKind.NetEvent:
          this.registerNetEvent(binding);
          break;
        case HandlerKind.NuiEvent:
          this.registerNuiEvent(binding);
          break;
        case HandlerKind.StateBag:
          this.registerStateBag(binding, false);
          break;
        case HandlerKind.GlobalStateBag:
          this.registerStateBag(binding, true);
          break;
        case HandlerKind.Export:
          this.registerExport(binding);
          break;
        case HandlerKind.Http:
          this.registerHttpRoute(
            binding,
            joinPath(getControllerPrefix(binding.target), binding.options.name ?? '/'),
          );
          break;
        case HandlerKind.Tick:
        case HandlerKind.Interval:
        case HandlerKind.Cron:
          this.scheduler.register(binding);
          break;
        case HandlerKind.ResourceStart:
        case HandlerKind.ResourceStop:
          break;
        default:
          this.logger.warn(`Unhandled handler kind "${binding.kind}" on ${binding.id}`);
      }
    }
  }

  #bindLocalEvent(binding: HandlerBinding): void {
    const event = binding.options.name ?? '';
    const unsubscribe = this.events.on(event, async (...args: unknown[]) => {
      await this.pipeline.dispatch(binding, {
        type: ExecutionType.LocalEvent,
        name: event,
        args,
      });
    });
    this.#eventSubscriptions.push(unsubscribe);
  }

  async #runLifecycleHandlers(kind: HandlerKind): Promise<void> {
    for (const binding of this.#bindings) {
      if (binding.kind !== kind) continue;
      await this.pipeline.dispatch(binding, {
        type: ExecutionType.Lifecycle,
        name: kind,
        args: [this.resourceName],
      });
    }
  }

  async #runHook(
    hook: 'onModuleInit' | 'onApplicationBootstrap' | 'onApplicationShutdown',
    ...args: unknown[]
  ): Promise<void> {
    for (const moduleRef of this.#registry.modules) {
      for (const instance of moduleRef.container.instances) {
        if (!hasHook(instance, hook)) continue;
        try {
          await (instance[hook] as (...a: unknown[]) => MaybePromise<void>)(...args);
        } catch (error) {
          this.logger.error(`${instance.constructor.name}.${hook}() failed`, error);
          if (hook !== 'onApplicationShutdown') throw error;
        }
      }
    }
  }

  #assertPhase(expected: LifecyclePhase, action: string): void {
    if (this.#phase !== expected) {
      throw new LifecycleException(
        `Cannot ${action}: application is in phase "${this.#phase}", expected "${expected}".`,
      );
    }
  }

  public abstract readonly side: 'server' | 'client';

  public abstract get resourceName(): string;

  protected abstract createMainThreadScheduler(): MainThreadScheduler;

  protected abstract createPlayerResolver(): PlayerResolver | undefined;

  protected abstract createDefaultLogTransport(): LoggerTransport;

  protected abstract registerNetEvent(binding: HandlerBinding): void;

  protected abstract registerStateBag(binding: HandlerBinding, global: boolean): void;

  protected abstract registerExport(binding: HandlerBinding): void;

  protected abstract registerNuiEvent(binding: HandlerBinding): void;

  protected abstract registerHttpRoute(binding: HandlerBinding, path: string): void;

  protected registerRuntimeProviders(): void {}

  protected onRuntimeReady(): MaybePromise<void> {}

  protected onRuntimeShutdown(): MaybePromise<void> {}
}

function providerClasses(moduleRef: ModuleRef): Ctor[] {
  const classes: Ctor[] = [];
  for (const provider of moduleRef.metadata.providers ?? []) {
    if (typeof provider === 'function') classes.push(provider);
    else if ('useClass' in provider) classes.push(provider.useClass);
  }
  return classes;
}
