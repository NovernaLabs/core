import { SharedPlayer, type StateBagView } from '../core';

export class ServerPlayer extends SharedPlayer {
  public readonly source: number;

  #identifiers: readonly string[] | undefined;

  public constructor(source: number) {
    super();
    this.source = source;
  }

  public override get handle(): number {
    return this.source;
  }

  public override get name(): string {
    return GetPlayerName(this.source);
  }

  public get identifiers(): readonly string[] {
    this.#identifiers ??= getPlayerIdentifiers(this.source);
    return this.#identifiers;
  }

  public identifier(prefix: string): string | undefined {
    return this.identifiers
      .find((value) => value.startsWith(`${prefix}:`))
      ?.slice(prefix.length + 1);
  }

  public get ping(): number {
    return GetPlayerPing(this.source.toString());
  }

  public get endpoint(): string {
    return GetPlayerEndpoint(this.source.toString());
  }

  public get ped(): number {
    return GetPlayerPed(this.source);
  }

  public override get state(): StateBagView {
    const bag = Player?.(this.source)?.state;
    return {
      get: <T>(key: string): T | undefined => bag?.[key] as T | undefined,
      set: (key: string, value: unknown, replicated = true): void => {
        bag?.set(key, value, replicated);
      },
    };
  }

  public emit(event: string, ...args: unknown[]): void {
    emitNet(event, this.source, ...args);
  }

  public kick(reason = 'Kicked'): void {
    DropPlayer(this.source.toString(), reason);
  }
}
