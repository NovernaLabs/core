import {
  appendMetadata,
  type Ctor,
  getMetadataChain,
  getMethodParamTypes,
  type Token,
} from '../../shared';
import { PARAMS } from '../keys';
import { isPlayerClass } from '../player/shared.player';
import type { PipelineRef, PipeTransform } from './contracts';
import { ExecutionContext } from './execution.context';

export const ParamKind = {
  Player: 'player',
  Source: 'source',
  Context: 'context',
  Arg: 'arg',
  Args: 'args',
  Dependency: 'dependency',
  Body: 'body',
  Param: 'param',
  Query: 'query',
  Headers: 'headers',
  Request: 'request',
  Response: 'response',
  StateBag: 'state-bag',
} as const;

export type ParamKind = (typeof ParamKind)[keyof typeof ParamKind];

export interface ParamDeclaration {
  index: number;
  kind: ParamKind;
  data?: string | Token | undefined;
  pipes?: readonly PipelineRef<PipeTransform>[];
}

export interface ResolvedParam extends ParamDeclaration {
  argIndex?: number;
  metatype?: unknown;
}

function declareParam(
  kind: ParamKind,
  data?: string | Token,
  pipes: readonly PipelineRef<PipeTransform>[] = [],
): ParameterDecorator {
  return (target, propertyKey, index) => {
    if (propertyKey === undefined) {
      throw new TypeError(
        'Handler parameter decorators are only valid on methods. On a constructor parameter use @Inject(TOKEN).',
      );
    }
    appendMetadata<ParamDeclaration>(
      PARAMS,
      { index, kind, data, pipes },
      target.constructor,
      propertyKey,
    );
  };
}

export function Player(): ParameterDecorator {
  return declareParam(ParamKind.Player);
}

export function Source(): ParameterDecorator {
  return declareParam(ParamKind.Source);
}

export function Ctx(): ParameterDecorator {
  return declareParam(ParamKind.Context);
}

export function Arg(index?: number): ParameterDecorator {
  return declareParam(ParamKind.Arg, index === undefined ? undefined : String(index));
}

export function Args(): ParameterDecorator {
  return declareParam(ParamKind.Args);
}

export function Dep(token: Token): ParameterDecorator {
  return declareParam(ParamKind.Dependency, token);
}

export function Body(...pipes: PipelineRef<PipeTransform>[]): ParameterDecorator {
  return declareParam(ParamKind.Body, undefined, pipes);
}

export function Param(name: string, ...pipes: PipelineRef<PipeTransform>[]): ParameterDecorator {
  return declareParam(ParamKind.Param, name, pipes);
}

export function Query(name?: string, ...pipes: PipelineRef<PipeTransform>[]): ParameterDecorator {
  return declareParam(ParamKind.Query, name, pipes);
}

export function Headers(name?: string): ParameterDecorator {
  return declareParam(ParamKind.Headers, name);
}

export function Req(): ParameterDecorator {
  return declareParam(ParamKind.Request);
}

export function Res(): ParameterDecorator {
  return declareParam(ParamKind.Response);
}

export function Bag(): ParameterDecorator {
  return declareParam(ParamKind.StateBag);
}

export function buildParamPlan(target: Ctor, method: string | symbol): ResolvedParam[] {
  const declarations = getMetadataChain<ParamDeclaration>(PARAMS, target, method);
  const byIndex = new Map<number, ParamDeclaration>();
  for (const declaration of declarations) byIndex.set(declaration.index, declaration);

  const metatypes = getMethodParamTypes(target.prototype as object, method);
  const handler = (target.prototype as Record<string | symbol, unknown>)[method];
  const arity = Math.max(
    typeof handler === 'function' ? handler.length : 0,
    metatypes.length,
    ...[...byIndex.keys()].map((index) => index + 1),
    0,
  );

  const plan: ResolvedParam[] = [];
  let argCursor = 0;

  for (let index = 0; index < arity; index += 1) {
    const metatype = metatypes[index];
    const explicit = byIndex.get(index);

    if (explicit) {
      if (explicit.kind === ParamKind.Arg) {
        const fixed = explicit.data === undefined ? argCursor++ : Number(explicit.data);
        plan.push({ ...explicit, argIndex: fixed, metatype });
      } else {
        plan.push({ ...explicit, metatype });
      }
      continue;
    }

    if (isPlayerClass(metatype)) {
      plan.push({ index, kind: ParamKind.Player, metatype });
      continue;
    }

    if (metatype === ExecutionContext) {
      plan.push({ index, kind: ParamKind.Context, metatype });
      continue;
    }

    plan.push({ index, kind: ParamKind.Arg, argIndex: argCursor++, metatype });
  }

  return plan;
}
