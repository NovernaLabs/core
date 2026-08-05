import type { MaybePromise, Unsubscribe } from '../../shared';

// biome-ignore lint/suspicious/noEmptyInterface: the empty declaration is the extension point.
export interface FrameworkEvents {}

type EventName = keyof FrameworkEvents extends never ? string : keyof FrameworkEvents | string;
type PayloadOf<K> = K extends keyof FrameworkEvents
  ? FrameworkEvents[K] extends readonly unknown[]
    ? FrameworkEvents[K]
    : unknown[]
  : unknown[];

export type EventListener<K extends EventName = EventName> = (
  ...args: PayloadOf<K>
) => MaybePromise<void>;

interface Registration {
  listener: (...args: unknown[]) => MaybePromise<void>;
  once: boolean;
}

export class EventBus {
  readonly #listeners = new Map<string, Registration[]>();

  public on<K extends EventName>(event: K, listener: EventListener<K>): Unsubscribe {
    return this.#add(event as string, listener as Registration['listener'], false);
  }

  public once<K extends EventName>(event: K, listener: EventListener<K>): Unsubscribe {
    return this.#add(event as string, listener as Registration['listener'], true);
  }

  #add(event: string, listener: Registration['listener'], once: boolean): Unsubscribe {
    const registrations = this.#listeners.get(event) ?? [];
    const registration: Registration = { listener, once };
    registrations.push(registration);
    this.#listeners.set(event, registrations);

    return () => {
      const current = this.#listeners.get(event);
      if (!current) return;
      const index = current.indexOf(registration);
      if (index >= 0) current.splice(index, 1);
      if (current.length === 0) this.#listeners.delete(event);
    };
  }

  public off<K extends EventName>(event: K, listener: EventListener<K>): void {
    const current = this.#listeners.get(event as string);
    if (!current) return;
    const index = current.findIndex((registration) => registration.listener === listener);
    if (index >= 0) current.splice(index, 1);
    if (current.length === 0) this.#listeners.delete(event as string);
  }

  public listenerCount(event: EventName): number {
    return this.#listeners.get(event as string)?.length ?? 0;
  }

  public eventNames(): string[] {
    return [...this.#listeners.keys()];
  }

  public async emit<K extends EventName>(event: K, ...args: PayloadOf<K>): Promise<void> {
    const registrations = this.#listeners.get(event as string);
    if (!registrations || registrations.length === 0) return;

    for (const registration of [...registrations]) {
      if (registration.once) this.off(event, registration.listener as EventListener<K>);
      await registration.listener(...(args as unknown[]));
    }
  }

  public emitSync<K extends EventName>(event: K, ...args: PayloadOf<K>): void {
    const registrations = this.#listeners.get(event as string);
    if (!registrations || registrations.length === 0) return;

    for (const registration of [...registrations]) {
      if (registration.once) this.off(event, registration.listener as EventListener<K>);
      try {
        const result = registration.listener(...(args as unknown[]));
        if (result instanceof Promise)
          result.catch((error: unknown) => this.#onError(error, event));
      } catch (error) {
        this.#onError(error, event);
      }
    }
  }

  #onError(error: unknown, event: EventName): void {
    this.onError?.(error, event as string);
  }

  public onError?: (error: unknown, event: string) => void;

  public removeAllListeners(event?: EventName): void {
    if (event === undefined) this.#listeners.clear();
    else this.#listeners.delete(event as string);
  }
}
