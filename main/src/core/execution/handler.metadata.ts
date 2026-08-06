import {
  appendMetadata,
  type Ctor,
  defineMetadata,
  getMetadataChain,
  getOwnMetadata,
} from '../../shared';
import { CONTROLLER_PREFIX, GUARDS, HANDLERS, INTERCEPTORS, MIDDLEWARE, PIPES } from '../keys';
import type { CanActivate, Interceptor, Middleware, PipelineRef, PipeTransform } from './contracts';

export const HandlerKind = {
  Event: 'event',
  RuntimeEvent: 'runtime-event',
  NetEvent: 'net-event',
  NuiEvent: 'nui-event',
  StateBag: 'state-bag',
  GlobalStateBag: 'global-state-bag',
  Export: 'export',
  Http: 'http',
  Tick: 'tick',
  Interval: 'interval',
  Cron: 'cron',
  ResourceStart: 'resource-start',
  ResourceStop: 'resource-stop',
} as const;
export type HandlerKind = (typeof HandlerKind)[keyof typeof HandlerKind];

export interface HandlerOptions {
  name?: string;
  method?: string;
  intervalMs?: number;
  expression?: string;
  withPlayer?: boolean;
  deferrals?: boolean;
}

export interface HandlerDeclaration {
  kind: HandlerKind;
  method: string | symbol;
  options: HandlerOptions;
}

export function declareHandler(
  prototype: object,
  method: string | symbol,
  kind: HandlerKind,
  options: HandlerOptions = {},
): void {
  appendMetadata<HandlerDeclaration>(HANDLERS, { kind, method, options }, prototype.constructor);
}

export function collectHandlers(target: Ctor): HandlerDeclaration[] {
  return getMetadataChain<HandlerDeclaration>(HANDLERS, target);
}

export function UseGuards(...guards: PipelineRef<CanActivate>[]): ClassDecorator & MethodDecorator {
  return attach(GUARDS, guards);
}

export function UsePipes(...pipes: PipelineRef<PipeTransform>[]): ClassDecorator & MethodDecorator {
  return attach(PIPES, pipes);
}

export function UseInterceptors(
  ...interceptors: PipelineRef<Interceptor>[]
): ClassDecorator & MethodDecorator {
  return attach(INTERCEPTORS, interceptors);
}

export function UseMiddleware(
  ...middleware: PipelineRef<Middleware>[]
): ClassDecorator & MethodDecorator {
  return attach(MIDDLEWARE, middleware);
}

function attach(key: symbol, values: readonly unknown[]): ClassDecorator & MethodDecorator {
  return ((target: object, propertyKey?: string | symbol) => {
    const owner = propertyKey === undefined ? target : target.constructor;
    const existing = getOwnMetadata<unknown[]>(key, owner, propertyKey) ?? [];
    defineMetadata(key, [...values, ...existing], owner, propertyKey);
  }) as ClassDecorator & MethodDecorator;
}

export function collectPipeline<T>(
  key: symbol,
  target: Ctor,
  method: string | symbol,
): PipelineRef<T>[] {
  return [
    ...getMetadataChain<PipelineRef<T>>(key, target),
    ...getMetadataChain<PipelineRef<T>>(key, target, method),
  ];
}

export { GUARDS, INTERCEPTORS, MIDDLEWARE, PIPES };

export function Controller(prefix = ''): ClassDecorator {
  return (target) => {
    defineMetadata(CONTROLLER_PREFIX, prefix, target);
  };
}

export function getControllerPrefix(target: Ctor): string {
  return getOwnMetadata<string>(CONTROLLER_PREFIX, target) ?? '';
}
