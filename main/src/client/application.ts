import {
  Application,
  type ApplicationOptions,
  ExecutionType,
  type HandlerBinding,
  LifecyclePhase,
  LOG_LEVEL_NAMES,
  type LoggerTransport,
  type LogRecord,
  type MainThreadScheduler,
  type PlayerResolver,
  toStateBagChange,
} from '../core';
import type { Ctor, MaybePromise } from '../shared';
import { ClientPlayer } from './player';

class ClientMainThread implements MainThreadScheduler {
  public yield(): Promise<void> {
    return Promise.resolve();
  }

  public async run<T>(fn: () => MaybePromise<T>): Promise<T> {
    return fn();
  }
}

export class ConsoleTransport implements LoggerTransport {
  public readonly name = 'console';

  public constructor(private readonly prefix = '') {}

  public write(record: LogRecord): void {
    const level = (LOG_LEVEL_NAMES[record.level] ?? 'log').toUpperCase();
    const fields = record.fields && Object.keys(record.fields).length > 0 ? record.fields : '';
    const line = `${this.prefix ? `[${this.prefix}] ` : ''}${level} [${record.context}] ${record.message}`;

    if (record.level >= 50) console.error(line, fields, record.error ?? '');
    else if (record.level >= 40) console.warn(line, fields);
    else console.log(line, fields);
  }
}

export interface ClientApplicationOptions extends ApplicationOptions {
  playerClass?: Ctor<ClientPlayer>;
}

export class ClientApplication extends Application {
  public override readonly side = 'client' as const;

  readonly #stateBagCookies: number[] = [];
  #localPlayer: ClientPlayer | undefined;
  #playerClass: Ctor<ClientPlayer> = ClientPlayer;
  #resourceName: string | undefined;

  public constructor(options: ClientApplicationOptions = {}) {
    super(options);
    if (options.playerClass) this.#playerClass = options.playerClass;
  }

  public static create(options: ClientApplicationOptions = {}): Promise<ClientApplication> {
    return Promise.resolve(new ClientApplication(options));
  }

  public override get resourceName(): string {
    this.#resourceName ??= GetCurrentResourceName();
    return this.#resourceName;
  }

  public override usePlayer(playerClass: Ctor<ClientPlayer>): this {
    super.usePlayer(playerClass);
    this.#playerClass = playerClass;
    this.#localPlayer = undefined;
    return this;
  }

  public get localPlayer(): ClientPlayer {
    this.#localPlayer ??= new this.#playerClass(PlayerId());
    return this.#localPlayer;
  }

  protected override createMainThreadScheduler(): MainThreadScheduler {
    return new ClientMainThread();
  }

  protected override createPlayerResolver(): PlayerResolver {
    return { resolve: () => this.localPlayer };
  }

  protected override createDefaultLogTransport(): LoggerTransport {
    return new ConsoleTransport(this.resourceName);
  }

  protected override registerRuntimeProviders(): void {
    this.container.provide(ClientPlayer, {
      useFactory: () => this.localPlayer,
    });
  }

  protected override registerNetEvent(binding: HandlerBinding): void {
    const event = binding.options.name ?? '';
    onNet(event, (...args: unknown[]) => {
      void this.pipeline.dispatch(binding, {
        type: ExecutionType.NetEvent,
        name: event,
        args,
        player: this.localPlayer,
      });
    });
  }

  protected override registerRuntimeEvent(binding: HandlerBinding): void {
    const event = binding.options.name ?? '';

    if (binding.options.deferrals) {
      this.logger.warn(
        `${binding.id} declares @OnPlayerConnecting(), which only exists on the server. The handler will never fire on the client.`,
      );
      return;
    }

    on(event, (...args: unknown[]) => {
      void this.pipeline.dispatch(binding, {
        type: ExecutionType.RuntimeEvent,
        name: event,
        args,
        ...(binding.options.withPlayer ? { player: this.localPlayer } : {}),
      });
    });
  }

  protected override registerNuiEvent(binding: HandlerBinding): void {
    const name = binding.options.name ?? '';
    // RegisterNuiCallback(name, (data: unknown, cb: unknown) => {
    //   void (async () => {
    //     const result = await this.pipeline.dispatch(binding, {
    //       type: ExecutionType.NuiEvent,
    //       name,
    //       args: [data],
    //       player: this.localPlayer,
    //       extras: { body: data },
    //     });

    //     if (result.ok) cb(result.value ?? {});
    //     else if (result.outcome?.handled) cb(result.outcome.result ?? {});
    //     else cb({ error: result.outcome?.message ?? "Internal error" });
    //   })();
    // });
    RegisterNuiCallbackType(name);
    on(`__cfx_nui:${name}`, async (data: any, cb: (response: any) => void) => {
      const result = await this.pipeline.dispatch(binding, {
        type: ExecutionType.NuiEvent,
        name,
        args: [data],
        player: this.localPlayer,
        extras: { body: data },
      });

      if (result.ok) cb(result.value ?? {});
      else if (result.outcome?.handled) cb(result.outcome.result ?? {});
      else cb({ error: result.outcome?.message ?? 'Internal error' });
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
        void this.pipeline.dispatch(binding, {
          type: global ? ExecutionType.GlobalStateBag : ExecutionType.StateBag,
          name: `${bagName}:${changedKey}`,
          args: [change],
          extras: { stateBag: change },
        });
      },
    );
    this.#stateBagCookies.push(cookie);
  }

  protected override registerExport(binding: HandlerBinding): void {
    const name = binding.options.name ?? '';
    exports(name, async (...args: unknown[]) => {
      const result = await this.pipeline.dispatch(binding, {
        type: ExecutionType.Export,
        name,
        args,
      });
      if (!result.ok && !result.outcome?.handled) {
        throw new Error(`Export "${name}" failed: ${result.outcome?.message ?? 'unknown error'}`);
      }
      return result.ok ? result.value : result.outcome?.result;
    });
  }

  protected override registerHttpRoute(binding: HandlerBinding): void {
    this.logger.warn(
      `${binding.id} declares an HTTP route, which only exists on the server. The route will never be reachable from the client.`,
    );
  }

  protected override onRuntimeReady(): void {
    if (!IsDuplicityVersion()) return;
    on('onResourceStop', (resource: unknown) => {
      if (resource !== this.resourceName) return;
      void this.stop('onResourceStop');
    });
  }

  protected override onRuntimeShutdown(): void {
    for (const cookie of this.#stateBagCookies) RemoveStateBagChangeHandler(cookie);
    this.#stateBagCookies.length = 0;
  }
}

export function Initialize(
  bootstrap: (app: ClientApplication) => MaybePromise<void>,
  options: ClientApplicationOptions = {},
): void {
  const app = new ClientApplication(options);
  void (async () => {
    try {
      await bootstrap(app);
      if (app.phase === LifecyclePhase.Created) await app.start();
    } catch (error) {
      app.logger.fatal('Failed to start', error);
    }
  })();
}
