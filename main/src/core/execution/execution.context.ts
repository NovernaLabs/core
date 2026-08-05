import type { Ctor, Token } from '../../shared';
import type { Container } from '../di/container';
import type { SharedPlayer } from '../player/shared.player';

export const ExecutionType = {
  LocalEvent: 'local-event',
  NetEvent: 'net-event',
  NuiEvent: 'nui-event',
  StateBag: 'state-bag',
  GlobalStateBag: 'global-state-bag',
  Http: 'http',
  Export: 'export',
  Tick: 'tick',
  Interval: 'interval',
  Cron: 'cron',
  Lifecycle: 'lifecycle',
} as const;
export type ExecutionType = (typeof ExecutionType)[keyof typeof ExecutionType];

export interface ExecutionContextInit {
  type: ExecutionType;
  name: string;
  source?: number;
  args: readonly unknown[];
  handler: (...args: never[]) => unknown;
  handlerName: string;
  target: Ctor;
  container: Container;
  player?: SharedPlayer;
}

export class ExecutionContext {
  public readonly type: ExecutionType;
  public readonly name: string;
  public readonly source: number | undefined;
  public readonly handlerName: string;
  public readonly target: Ctor;
  public readonly container: Container;
  public readonly startedAt: number = Date.now();

  readonly #handler: (...args: never[]) => unknown;
  readonly #args: readonly unknown[];
  readonly #player: SharedPlayer | undefined;
  readonly #data = new Map<string | symbol, unknown>();

  public constructor(init: ExecutionContextInit) {
    this.type = init.type;
    this.name = init.name;
    this.source = init.source;
    this.handlerName = init.handlerName;
    this.target = init.target;
    this.container = init.container;
    this.#handler = init.handler;
    this.#args = init.args;
    this.#player = init.player;
  }

  public getPlayer<T extends SharedPlayer = SharedPlayer>(): T | undefined {
    return this.#player as T | undefined;
  }

  public getHandler(): (...args: never[]) => unknown {
    return this.#handler;
  }

  public getArguments(): readonly unknown[] {
    return this.#args;
  }

  public getClass(): Ctor {
    return this.target;
  }

  public resolve<T>(token: Token<T>): Promise<T> {
    return this.container.resolve(token);
  }

  public set(key: string | symbol, value: unknown): void {
    this.#data.set(key, value);
  }

  public get<T>(key: string | symbol): T | undefined {
    return this.#data.get(key) as T | undefined;
  }

  public get label(): string {
    return `${this.type} ${this.name}`;
  }
}
