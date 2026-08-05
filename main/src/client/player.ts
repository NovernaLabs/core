import { SharedPlayer, type StateBagView } from '../core';

export class ClientPlayer extends SharedPlayer {
  public readonly playerId: number;

  public constructor(playerId: number = PlayerId()) {
    super();
    this.playerId = playerId;
  }

  public override get handle(): number {
    return this.playerId;
  }

  public override get name(): string {
    return GetPlayerName(this.playerId);
  }

  public get ped(): number {
    return this.isLocal ? PlayerPedId() : GetPlayerPed(this.playerId);
  }

  public get isLocal(): boolean {
    return this.playerId === PlayerId();
  }

  public get serverId(): number {
    return GetPlayerServerId(this.playerId);
  }

  public override get state(): StateBagView {
    const bag = this.isLocal ? LocalPlayer.state : undefined;
    return {
      get: <T>(key: string): T | undefined => bag?.[key] as T | undefined,
      set: (key: string, value: unknown, replicated = true): void => {
        bag?.set(key, value, replicated);
      },
    };
  }

  public emit(event: string, ...args: unknown[]): void {
    emitNet(event, ...args);
  }
}
