import {
  ExecutionPipeline,
  ExecutionType,
  type HandlerBinding,
  type HttpRequest,
  HttpResponse,
  HttpRouter,
  Logger,
  parseBody,
  parseQuery,
} from '../core';
import type { Dict } from '../shared';

export interface HttpRequestNative {
  address: string;
  headers: Dict<string>;
  method: string;
  path: string;
  setDataHandler(handler: (body: string) => void): void;
  setDataHandler(handler: (body: ArrayBuffer) => void, binary: 'binary'): void;
}

export interface HttpResponseNative {
  writeHead(status: number, headers?: Dict<string | string[]>): void;
  write(data: string): void;
  send(data?: string): void;
}

export class HttpServer {
  readonly #router = new HttpRouter<HandlerBinding>();
  #installed = false;

  public constructor(
    private readonly pipeline: ExecutionPipeline,
    private readonly logger: Logger,
  ) {}

  public get routes(): readonly { method: string; path: string }[] {
    return this.#router.routes.map((route) => ({
      method: route.method,
      path: route.path,
    }));
  }

  public register(binding: HandlerBinding, path: string): void {
    const method = binding.options.method ?? 'GET';
    this.#router.add(method, path, binding);
    this.logger.debug(`Route ${method} ${path} → ${binding.id}`);
  }

  public start(): void {
    if (this.#installed || this.#router.routes.length === 0) return;
    this.#installed = true;
    SetHttpHandler((request: HttpRequestNative, response: HttpResponseNative) => {
      void this.#handle(request, response);
    });
    this.logger.info(`HTTP server listening on the resource endpoint`, {
      routes: this.#router.routes.length,
    });
  }

  async #handle(native: HttpRequestNative, nativeResponse: HttpResponseNative): Promise<void> {
    const response = new HttpResponse();

    try {
      const request = await toRequest(native);
      const match = this.#router.find(request.method, request.path);

      if (!match) {
        const status = this.#router.pathExists(request.path) ? 405 : 404;
        respond(
          nativeResponse,
          response.json({ error: status === 405 ? 'Method not allowed' : 'Not found' }, status),
        );
        return;
      }

      request.params = match.params;

      const result = await this.pipeline.dispatch(match.route.payload, {
        type: ExecutionType.Http,
        name: `${request.method} ${match.route.path}`,
        args: [],
        extras: {
          body: request.body,
          params: request.params,
          query: request.query,
          headers: request.headers,
          request,
          response,
        },
      });

      if (!result.ok) {
        const outcome = result.outcome;
        if (outcome?.handled) {
          respond(nativeResponse, materialize(response, outcome.result, outcome.status));
          return;
        }
        respond(
          nativeResponse,
          response.json({ error: outcome?.message ?? 'Internal error' }, outcome?.status ?? 500),
        );
        return;
      }

      respond(nativeResponse, materialize(response, result.value, 200));
    } catch (error) {
      this.logger.error('HTTP request failed before dispatch', error);
      respond(nativeResponse, new HttpResponse().json({ error: 'Internal error' }, 500));
    }
  }
}

function materialize(response: HttpResponse, value: unknown, status: number): HttpResponse {
  if (response.sent) return response;
  if (value === undefined) {
    response.status = status === 200 ? 204 : status;
    response.body = '';
    return response;
  }
  if (typeof value === 'string') return response.text(value, status);
  return response.json(value, status);
}

function respond(native: HttpResponseNative, response: HttpResponse): void {
  native.writeHead(response.status, response.headers);
  native.send(response.body ?? '');
}

async function toRequest(native: HttpRequestNative): Promise<HttpRequest> {
  const [path, search = ''] = native.path.split('?');
  const headers = lowercaseKeys(native.headers ?? {});

  const rawBody = await readBody(native);

  return {
    method: native.method.toUpperCase(),
    path: path ?? '/',
    query: parseQuery(search),
    headers,
    rawBody,
    body: parseBody(rawBody, headers['content-type']),
    params: {},
    address: native.address,
  };
}

function readBody(native: HttpRequestNative): Promise<string | undefined> {
  const method = native.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'DELETE')
    return Promise.resolve(undefined);

  return new Promise<string | undefined>((resolve) => {
    let settled = false;
    const finish = (value: string | undefined): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    try {
      native.setDataHandler((body: string) => finish(body));
    } catch {
      finish(undefined);
    }

    setTimeout(() => finish(undefined), 5000);
  });
}

function lowercaseKeys(headers: Dict<string>): Dict<string> {
  const result: Dict<string> = {};
  for (const [key, value] of Object.entries(headers)) result[key.toLowerCase()] = value;
  return result;
}
