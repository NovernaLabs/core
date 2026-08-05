export interface StateBagChange<T = unknown> {
  /* The raw bag name, e.g. player:12, entity:74305, global. */
  bagName: string;
  key: string;
  value: T;
  replicated: boolean;
  owner: StateBagOwner;
}

export type StateBagOwner =
  | { kind: 'player'; source: number }
  | { kind: 'entity'; netId: number }
  | { kind: 'global' }
  | { kind: 'unknown'; raw: string };

export function parseBagName(bagName: string): StateBagOwner {
  if (bagName === 'global') return { kind: 'global' };

  const separator = bagName.indexOf(':');
  if (separator === -1) return { kind: 'unknown', raw: bagName };

  const prefix = bagName.slice(0, separator);
  const id = Number(bagName.slice(separator + 1));
  if (!Number.isFinite(id)) return { kind: 'unknown', raw: bagName };

  if (prefix === 'player') return { kind: 'player', source: id };
  if (prefix === 'entity') return { kind: 'entity', netId: id };
  return { kind: 'unknown', raw: bagName };
}

export function toStateBagChange(
  bagName: string,
  key: string,
  value: unknown,
  replicated: boolean,
): StateBagChange {
  return { bagName, key, value, replicated, owner: parseBagName(bagName) };
}
