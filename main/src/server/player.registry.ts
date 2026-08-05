import type { EventBus, Logger, PlayerResolver } from '../core';
import type { Ctor } from '../shared';
import { ServerPlayer } from './player';

export const PlayerEvents = {
  Created: 'player.created',
  Dropped: 'player.dropped',
} as const;

export class PlayerRegistry implements PlayerResolver {
  readonly #players = new Map<number, ServerPlayer>();
  #playerClass: Ctor<ServerPlayer> = ServerPlayer;

  public constructor(
    private readonly logger: Logger,
    private readonly events: EventBus,
  ) {}

  public usePlayerClass(playerClass: Ctor<ServerPlayer>): void {
    this.#playerClass = playerClass;
    if (this.#players.size > 0) {
      this.logger.warn(
        `usePlayer(${playerClass.name}) was called after ${this.#players.size} player(s) already existed; those keep their previous class.`,
      );
    }
  }

  public get playerClass(): Ctor<ServerPlayer> {
    return this.#playerClass;
  }

  public get size(): number {
    return this.#players.size;
  }

  public all(): ServerPlayer[] {
    return [...this.#players.values()];
  }

  public get(source: number): ServerPlayer | undefined {
    if (!Number.isInteger(source) || source <= 0) return undefined;

    const existing = this.#players.get(source);
    if (existing) return existing;

    if (IsDuplicityVersion() && GetPlayerName(source) === '') return undefined;

    const player = new this.#playerClass(source);
    this.#players.set(source, player);
    this.events.emitSync(PlayerEvents.Created, player);
    return player;
  }

  public resolve(source: number): ServerPlayer | undefined {
    return this.get(source);
  }

  public has(source: number): boolean {
    return this.#players.has(source);
  }

  public remove(source: number, reason = 'dropped'): void {
    const player = this.#players.get(source);
    if (!player) return;
    this.#players.delete(source);
    this.events.emitSync(PlayerEvents.Dropped, player, reason);
  }

  public hydrate(): void {
    for (const source of getPlayers()) this.get(parseInt(source));
    this.logger.debug(`Player registry hydrated with ${this.#players.size} player(s)`);
  }

  public clear(): void {
    this.#players.clear();
  }

  public findByIdentifier(prefix: string, value: string): ServerPlayer | undefined {
    return this.all().find((player) => player.identifier(prefix) === value);
  }
}
