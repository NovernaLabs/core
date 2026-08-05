import type { Dict, Json } from '../../shared';

export interface HttpRequest {
  method: string;
  path: string;
  query: Dict<string>;
  headers: Dict<string>;
  rawBody?: string | undefined;
  body?: unknown;
  params: Dict<string>;
  address?: string | undefined;
}

export class HttpResponse {
  public status = 200;
  public readonly headers: Dict<string> = {};
  public body: string | undefined;
  #sent = false;

  public setStatus(status: number): this {
    this.status = status;
    return this;
  }

  public setHeader(name: string, value: string): this {
    this.headers[name.toLowerCase()] = value;
    return this;
  }

  public json(body: Json | unknown, status?: number): this {
    if (status !== undefined) this.status = status;
    this.setHeader('content-type', 'application/json; charset=utf-8');
    this.body = JSON.stringify(body ?? null);
    this.#sent = true;
    return this;
  }

  public text(body: string, status?: number): this {
    if (status !== undefined) this.status = status;
    this.setHeader('content-type', 'text/plain; charset=utf-8');
    this.body = body;
    this.#sent = true;
    return this;
  }

  public get sent(): boolean {
    return this.#sent;
  }
}

export interface HttpContext {
  request: HttpRequest;
  response: HttpResponse;
}

export function parseBody(raw: string | undefined, contentType: string | undefined): unknown {
  if (raw === undefined || raw === '') return undefined;
  if (contentType?.includes('application/json')) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}
