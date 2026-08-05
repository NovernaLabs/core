import { type Ctor, defineMetadata, getOwnMetadata, type Token } from '../../shared';
import type { Provider } from '../di/types';
import { MODULE } from '../keys';

export interface ModuleMetadata {
  imports?: readonly Ctor[];
  providers?: readonly Provider[];
  exports?: readonly (Token | Ctor)[];
  controllers?: readonly Ctor[];
  global?: boolean;
}

/*
Will Looks like this later:
 * @Module({
 *   imports: [DatabaseModule],
 *   providers: [InventoryService, InventoryRepository],
 *   controllers: [InventoryEvents],
 * })
 * export class InventoryModule {}
 */
export function Module(metadata: ModuleMetadata = {}): ClassDecorator {
  return (target) => {
    defineMetadata(MODULE, Object.freeze({ ...metadata }), target);
  };
}

export function getModuleMetadata(target: object): ModuleMetadata | undefined {
  return getOwnMetadata<ModuleMetadata>(MODULE, target);
}

export function isModule(target: unknown): target is Ctor {
  return typeof target === 'function' && getModuleMetadata(target) !== undefined;
}
