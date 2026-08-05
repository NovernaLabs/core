import { declareHandler, HandlerKind } from '../execution/handler.metadata';
import { HttpMethod } from '../http/router';

export function OnEvent(event: string): MethodDecorator {
  return (target, propertyKey) => {
    declareHandler(target, propertyKey, HandlerKind.Event, { name: event });
  };
}

export interface NetEventOptions {
  withPlayer?: boolean; // opt-out for server->server com, if you dont need a Player
}

export function OnNetEvent(event: string, options: NetEventOptions = {}): MethodDecorator {
  return (target, propertyKey) => {
    declareHandler(target, propertyKey, HandlerKind.NetEvent, {
      name: event,
      withPlayer: options.withPlayer ?? true,
    });
  };
}

export function OnNuiEvent(event: string): MethodDecorator {
  return (target, propertyKey) => {
    declareHandler(target, propertyKey, HandlerKind.NuiEvent, { name: event });
  };
}

export function OnStateBagChange(key: string): MethodDecorator {
  return (target, propertyKey) => {
    declareHandler(target, propertyKey, HandlerKind.StateBag, { name: key });
  };
}

export function OnGlobalStateBagChange(key: string): MethodDecorator {
  return (target, propertyKey) => {
    declareHandler(target, propertyKey, HandlerKind.GlobalStateBag, {
      name: key,
    });
  };
}

export function OnResourceStart(): MethodDecorator {
  return (target, propertyKey) => {
    declareHandler(target, propertyKey, HandlerKind.ResourceStart, {});
  };
}

export function OnResourceStop(): MethodDecorator {
  return (target, propertyKey) => {
    declareHandler(target, propertyKey, HandlerKind.ResourceStop, {});
  };
}

export function Export(name?: string): MethodDecorator {
  return (target, propertyKey) => {
    declareHandler(target, propertyKey, HandlerKind.Export, {
      name: name ?? String(propertyKey),
    });
  };
}

export function Tick(everyMs?: number): MethodDecorator {
  return (target, propertyKey) => {
    declareHandler(target, propertyKey, HandlerKind.Tick, {
      ...(everyMs !== undefined ? { intervalMs: everyMs } : {}),
    });
  };
}

export function Interval(ms: number): MethodDecorator {
  return (target, propertyKey) => {
    declareHandler(target, propertyKey, HandlerKind.Interval, {
      intervalMs: ms,
    });
  };
}

export function Cron(expression: string): MethodDecorator {
  return (target, propertyKey) => {
    declareHandler(target, propertyKey, HandlerKind.Cron, { expression });
  };
}

function route(method: HttpMethod) {
  return (path = '/'): MethodDecorator =>
    (target, propertyKey) => {
      declareHandler(target, propertyKey, HandlerKind.Http, {
        name: path,
        method,
      });
    };
}

export const Get = route(HttpMethod.Get);
export const Post = route(HttpMethod.Post);
export const Put = route(HttpMethod.Put);
export const Patch = route(HttpMethod.Patch);
export const Delete = route(HttpMethod.Delete);
