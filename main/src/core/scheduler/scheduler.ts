import type { MaybePromise } from '../../shared';
import { ExecutionType } from '../execution/execution.context';
import { HandlerKind } from '../execution/handler.metadata';
import type { ExecutionPipeline, HandlerBinding } from '../execution/pipeline';
import type { Logger } from '../logging/logger';
import { parseCron } from './cron';

export interface SchedulerRuntime {
  setTick(handler: () => void): number;
  clearTick(id: number): void;
  setTimeout(handler: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(handler: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  now(): number;
}

export function defaultSchedulerRuntime(): SchedulerRuntime {
  const globals = globalThis as unknown as {
    setTick?: (handler: () => void) => number;
    clearTick?: (id: number) => void;
  };

  return {
    setTick(handler) {
      if (typeof globals.setTick === 'function') return globals.setTick(handler);
      return setInterval(handler, 16) as unknown as number;
    },
    clearTick(id) {
      if (typeof globals.clearTick === 'function') globals.clearTick(id);
      else clearInterval(id as unknown as ReturnType<typeof setInterval>);
    },
    setTimeout: (handler, ms) => setTimeout(handler, ms),
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    setInterval: (handler, ms) => setInterval(handler, ms),
    clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
    now: () => Date.now(),
  };
}

interface ScheduledJob {
  kind: 'tick' | 'interval' | 'cron';
  label: string;
  stop(): void;
}

export class Scheduler {
  readonly #jobs: ScheduledJob[] = [];
  readonly #deferred: (() => void)[] = [];
  #running = false;

  public constructor(
    private readonly pipeline: ExecutionPipeline,
    private readonly logger: Logger,
    private readonly runtime: SchedulerRuntime = defaultSchedulerRuntime(),
  ) {}

  public get jobCount(): number {
    return this.#jobs.length;
  }

  public register(binding: HandlerBinding): void {
    switch (binding.kind) {
      case HandlerKind.Tick:
        this.#registerTick(binding);
        break;
      case HandlerKind.Interval:
        this.#registerInterval(binding);
        break;
      case HandlerKind.Cron:
        this.#registerCron(binding);
        break;
      default:
        throw new Error(`Scheduler cannot register handler kind "${binding.kind}"`);
    }
  }

  #registerTick(binding: HandlerBinding): void {
    const throttleMs = binding.options.intervalMs;
    let last = 0;
    const guard = this.#overlapGuard(binding.id);

    const pending: { id: number | undefined } = { id: undefined };
    const start = (): void => {
      pending.id = this.runtime.setTick(() => {
        if (throttleMs !== undefined) {
          const now = this.runtime.now();
          if (now - last < throttleMs) return;
          last = now;
        }
        void guard(() => this.#invoke(binding, ExecutionType.Tick));
      });
    };

    this.#jobs.push({
      kind: 'tick',
      label: binding.id,
      stop: () => {
        if (pending.id !== undefined) this.runtime.clearTick(pending.id);
      },
    });
    this.#deferred.push(start);
  }

  #registerInterval(binding: HandlerBinding): void {
    const ms = binding.options.intervalMs ?? 1000;
    const guard = this.#overlapGuard(binding.id);
    const handle: { value: unknown } = { value: undefined };

    this.#jobs.push({
      kind: 'interval',
      label: `${binding.id} every ${ms}ms`,
      stop: () => this.runtime.clearInterval(handle.value),
    });
    this.#deferred.push(() => {
      handle.value = this.runtime.setInterval(() => {
        void guard(() => this.#invoke(binding, ExecutionType.Interval));
      }, ms);
    });
  }

  #registerCron(binding: HandlerBinding): void {
    const expression = parseCron(binding.options.expression ?? '');
    const guard = this.#overlapGuard(binding.id);
    const handle: { value: unknown } = { value: undefined };
    let stopped = false;

    const schedule = (): void => {
      if (stopped) return;
      const delay = expression.msUntilNext(new Date(this.runtime.now()));
      handle.value = this.runtime.setTimeout(() => {
        void guard(() => this.#invoke(binding, ExecutionType.Cron)).finally(schedule);
      }, delay);
    };

    this.#jobs.push({
      kind: 'cron',
      label: `${binding.id} (${expression.source})`,
      stop: () => {
        stopped = true;
        this.runtime.clearTimeout(handle.value);
      },
    });
    this.#deferred.push(schedule);
  }

  public start(): void {
    if (this.#running) return;
    this.#running = true;
    for (const start of this.#deferred) start();
    if (this.#jobs.length > 0) {
      this.logger.debug(`Scheduler started with ${this.#jobs.length} job(s)`, {
        jobs: this.#jobs.map((job) => job.label),
      });
    }
  }

  public stop(): void {
    if (!this.#running) return;
    this.#running = false;
    for (const job of this.#jobs) job.stop();
  }

  #overlapGuard(label: string): (run: () => Promise<unknown>) => Promise<void> {
    let inFlight = false;
    let skipped = 0;
    return async (run) => {
      if (inFlight) {
        skipped += 1;
        if (skipped === 1 || skipped % 100 === 0) {
          this.logger.warn(`Scheduled job ${label} is still running; skipped ${skipped} run(s)`);
        }
        return;
      }
      inFlight = true;
      skipped = 0;
      try {
        await run();
      } finally {
        inFlight = false;
      }
    };
  }

  async #invoke(binding: HandlerBinding, type: ExecutionType): Promise<unknown> {
    const result = await this.pipeline.dispatch(binding, {
      type,
      name: binding.options.expression ?? binding.id,
      args: [],
    });
    return result.value;
  }
}

export type JobFn = () => MaybePromise<void>;
