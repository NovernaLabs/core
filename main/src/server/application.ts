import {
  Application,
  type ApplicationOptions,
  type Deferrals,
  ExecutionType,
  type HandlerBinding,
  LifecyclePhase,
  type LoggerTransport,
  type MainThreadScheduler,
  type PlayerResolver,
  toStateBagChange,
} from '../core';
import type { Ctor, MaybePromise } from '../shared';
import { HttpServer } from './http.server';
import { resolveLogLevel, StdoutTransport } from './log.transport';
import type { ServerPlayer } from './player';
import { PlayerRegistry } from './player.registry';

class ServerMainThread implements MainThreadScheduler {
  public yield(): Promise<void> {
    const immediate = (globalThis as { setImmediate?: (fn: () => void) => unknown }).setImmediate;
    if (typeof immediate !== 'function') return Promise.resolve();
    return new Promise<void>((resolve) => {
      immediate(() => resolve());
    });
  }

  public async run<T>(fn: () => MaybePromise<T>): Promise<T> {
    await this.yield();
    return fn();
  }
}

export interface ServerApplicationOptions extends ApplicationOptions {
  jsonLogs?: boolean;
  playerClass?: Ctor<ServerPlayer>;
}

export class ServerApplication extends Application {
  public override readonly side = 'server' as const;

  readonly #players: PlayerRegistry;
  readonly #http: HttpServer;
  readonly #stateBagCookies: number[] = [];
  #resourceName: string | undefined;

  public constructor(options: ServerApplicationOptions = {}) {
    super({ logLevel: resolveLogLevel(), ...options });
    this.#players = new PlayerRegistry(this.logger.child('players'), this.events);
    this.#http = new HttpServer(this.pipeline, this.logger.child('http'));

    if (options.playerClass) this.#players.usePlayerClass(options.playerClass);
    if (options.jsonLogs) this.addLogTransport(new StdoutTransport({ json: true }));
  }

  public static create(options: ServerApplicationOptions = {}): Promise<ServerApplication> {
    return Promise.resolve(new ServerApplication(options));
  }

  public override get resourceName(): string {
    this.#resourceName ??= GetCurrentResourceName();
    return this.#resourceName;
  }

  public get players(): PlayerRegistry {
    return this.#players;
  }

  public get http(): HttpServer {
    return this.#http;
  }

  public override usePlayer(playerClass: Ctor<ServerPlayer>): this {
    super.usePlayer(playerClass);
    this.#players.usePlayerClass(playerClass);
    return this;
  }

  protected override createMainThreadScheduler(): MainThreadScheduler {
    return new ServerMainThread();
  }

  protected override createPlayerResolver(): PlayerResolver {
    return this.#players;
  }

  protected override createDefaultLogTransport(): LoggerTransport {
    return new StdoutTransport({ prefix: this.resourceName });
  }

  protected override registerRuntimeProviders(): void {
    this.container.seed(PlayerRegistry, this.#players).seed(HttpServer, this.#http);
  }

  protected override registerNetEvent(binding: HandlerBinding): void {
    const event = binding.options.name ?? '';
    onNet(event, (...args: unknown[]) => {
      const source = global.source as number;
      void this.pipeline.dispatch(binding, {
        type: ExecutionType.NetEvent,
        name: event,
        args,
        source,
      });
    });
  }

  protected override registerRuntimeEvent(binding: HandlerBinding): void {
    const event = binding.options.name ?? '';

    if (binding.options.deferrals) {
      this.#registerDeferredEvent(binding, event);
      return;
    }

    on(event, (...args: unknown[]) => {
      const source = global.source as number | undefined;
      void this.pipeline.dispatch(binding, {
        type: ExecutionType.RuntimeEvent,
        name: event,
        args,
        ...(typeof source === 'number' && Number.isInteger(source) && source > 0 ? { source } : {}),
      });
    });
  }

  #registerDeferredEvent(binding: HandlerBinding, event: string): void {
    on(event, (name: string, setKickReason: (reason: string) => void, deferrals: Deferrals) => {
      deferrals.defer();

      const source = global.source as number;
      let settled = false;
      const release = (reason?: string): void => {
        if (settled) return;
        settled = true;
        if (reason === undefined) deferrals.done();
        else deferrals.done(reason);
      };

      void this.pipeline
        .dispatch(binding, {
          type: ExecutionType.RuntimeEvent,
          name: event,
          args: [name, setKickReason, deferrals],
          source,
        })
        .then((result) => {
          if (result.ok) {
            release();
            return;
          }
          release(result.outcome?.message ?? 'Connection refused');
        })
        .catch((error: unknown) => {
          this.logger.error(`${binding.id} threw while holding a connection`, error);
          release('Internal error');
        });
    });
  }

  protected override registerStateBag(binding: HandlerBinding, global: boolean): void {
    const key = binding.options.name ?? '';
    const cookie = AddStateBagChangeHandler(
      key,
      global ? 'global' : 'null',
      (
        bagName: string,
        changedKey: string,
        value: unknown,
        _reserved: number,
        replicated: boolean,
      ) => {
        const change = toStateBagChange(bagName, changedKey, value, replicated);

        const source = change.owner.kind === 'player' ? change.owner.source : undefined;

        void this.pipeline.dispatch(binding, {
          type: global ? ExecutionType.GlobalStateBag : ExecutionType.StateBag,
          name: `${bagName}:${changedKey}`,
          args: [change],
          source,
          extras: { stateBag: change },
        });
      },
    );
    this.#stateBagCookies.push(cookie);
  }

  protected override registerExport(binding: HandlerBinding): void {
    const name = binding.options.name ?? '';
    registerExport(name, async (...args: unknown[]) => {
      const source = global.source as number;
      const result = await this.pipeline.dispatch(binding, {
        type: ExecutionType.Export,
        name,
        args,
        source,
      });

      if (!result.ok) {
        if (result.outcome?.handled) return result.outcome.result;
        throw new Error(`Export "${name}" failed: ${result.outcome?.message ?? 'unknown error'}`);
      }
      return result.value;
    });
  }

  protected override registerNuiEvent(binding: HandlerBinding): void {
    this.logger.warn(
      `${binding.id} declares @OnNuiEvent(), which only exists on the client. The handler will never fire on the server.`,
    );
  }

  protected override registerHttpRoute(binding: HandlerBinding, path: string): void {
    this.#http.register(binding, path);
  }

  protected override async onRuntimeReady(): Promise<void> {
    this.#http.start();
    this.#installRuntimeHooks();
    this.#players.hydrate();
  }

  protected override async onRuntimeShutdown(): Promise<void> {
    for (const cookie of this.#stateBagCookies) RemoveStateBagChangeHandler(cookie);
    this.#stateBagCookies.length = 0;
    this.#players.clear();
  }

  #installRuntimeHooks(): void {
    if (!IsDuplicityVersion()) return;

    on('playerDropped', (reason: unknown) => {
      const playerId = source;
      if (playerId !== undefined) this.#players.remove(playerId, String(reason ?? 'dropped'));
    });

    on('onResourceStop', (resource: unknown) => {
      if (resource !== this.resourceName) return;
      void this.stop('onResourceStop');
    });
  }
}

export function Initialize(
  bootstrap: (app: ServerApplication) => MaybePromise<void>,
  options: ServerApplicationOptions = {},
): void {
  const app = new ServerApplication(options);
  void (async () => {
    try {
      await bootstrap(app);
      if (app.phase === LifecyclePhase.Created) await app.start();
    } catch (error) {
      app.logger.fatal('Failed to start', error);
    }
  })();
}

export function registerExport(name: string, fn: (...args: unknown[]) => unknown): void {
  const register = exports as unknown as
    | ((name: string, fn: (...args: unknown[]) => unknown) => void)
    | undefined;
  if (typeof register !== 'function') missing('exports');
  register(name, fn);
}

function missing(name: string): never {
  throw new Error(
    `Native "${name}" is not available. @noverna/core/server must run inside an FXServer server_script — check the fxmanifest and that this bundle is not being loaded on the client.`,
  );
}
