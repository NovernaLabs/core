import type { Dict } from '../../shared';

export const HttpMethod = {
  Get: 'GET',
  Post: 'POST',
  Put: 'PUT',
  Patch: 'PATCH',
  Delete: 'DELETE',
  Head: 'HEAD',
  Options: 'OPTIONS',
} as const;

export type HttpMethod = (typeof HttpMethod)[keyof typeof HttpMethod];

interface RouteSegment {
  value: string;
  param: boolean;
  wildcard: boolean;
}

export interface Route<T> {
  method: string;
  path: string;
  payload: T;
  readonly segments: readonly RouteSegment[];
}

export interface RouteMatch<T> {
  route: Route<T>;
  params: Dict<string>;
}

export class HttpRouter<T> {
  readonly #routes: Route<T>[] = [];

  public add(method: string, path: string, payload: T): this {
    const normalized = normalizePath(path);
    this.#routes.push({
      method: method.toUpperCase(),
      path: normalized,
      payload,
      segments: parseSegments(normalized),
    });
    this.#routes.sort(compareSpecificity);
    return this;
  }

  public get routes(): readonly Route<T>[] {
    return this.#routes;
  }

  public find(method: string, path: string): RouteMatch<T> | undefined {
    const wanted = method.toUpperCase();
    const segments = splitPath(normalizePath(path));

    for (const route of this.#routes) {
      const methodMatches =
        route.method === wanted || (wanted === 'HEAD' && route.method === 'GET');
      if (!methodMatches) continue;

      const params = matchSegments(route.segments, segments);
      if (params) return { route, params };
    }

    return undefined;
  }

  public pathExists(path: string): boolean {
    const segments = splitPath(normalizePath(path));
    return this.#routes.some((route) => matchSegments(route.segments, segments) !== undefined);
  }
}

function matchSegments(
  pattern: readonly RouteSegment[],
  actual: readonly string[],
): Dict<string> | undefined {
  const params: Dict<string> = {};

  for (let i = 0; i < pattern.length; i += 1) {
    const segment = pattern[i] as RouteSegment;

    if (segment.wildcard) {
      params[segment.value || 'wildcard'] = actual.slice(i).join('/');
      return params;
    }

    const value = actual[i];
    if (value === undefined) return undefined;

    if (segment.param) {
      params[segment.value] = decodeURIComponent(value);
      continue;
    }

    if (segment.value !== value) return undefined;
  }

  return pattern.length === actual.length ? params : undefined;
}

function compareSpecificity<T>(a: Route<T>, b: Route<T>): number {
  const score = (route: Route<T>): number =>
    route.segments.reduce(
      (total, segment) => total + (segment.wildcard ? 0 : segment.param ? 2 : 3),
      0,
    );
  return score(b) - score(a) || b.segments.length - a.segments.length;
}

export function normalizePath(path: string): string {
  const withLeading = path.startsWith('/') ? path : `/${path}`;
  const withoutTrailing = withLeading.length > 1 ? withLeading.replace(/\/+$/, '') : withLeading;
  return withoutTrailing.replace(/\/{2,}/g, '/');
}

function splitPath(path: string): string[] {
  return path === '/' ? [] : path.slice(1).split('/');
}

function parseSegments(path: string): RouteSegment[] {
  return splitPath(path).map((raw) => {
    if (raw === '*' || raw.startsWith('*')) {
      return { value: raw.slice(1), param: false, wildcard: true };
    }
    if (raw.startsWith(':')) return { value: raw.slice(1), param: true, wildcard: false };
    return { value: raw, param: false, wildcard: false };
  });
}

export function joinPath(prefix: string, path: string): string {
  if (!prefix) return normalizePath(path);
  if (!path || path === '/') return normalizePath(prefix);
  return normalizePath(`${normalizePath(prefix)}/${path.replace(/^\//, '')}`);
}

export function parseQuery(search: string): Dict<string> {
  const query: Dict<string> = {};
  const trimmed = search.startsWith('?') ? search.slice(1) : search;
  if (!trimmed) return query;

  for (const pair of trimmed.split('&')) {
    if (!pair) continue;
    const index = pair.indexOf('=');
    const rawKey = index === -1 ? pair : pair.slice(0, index);
    const rawValue = index === -1 ? '' : pair.slice(index + 1);
    query[safeDecode(rawKey)] = safeDecode(rawValue.replace(/\+/g, ' '));
  }

  return query;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
