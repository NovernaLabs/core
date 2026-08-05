import type { InjectionToken } from '../../shared';
import type { FactoryProvider } from '../di/types';
import { PersistenceAdapter, type Repository, type RepositoryOptions } from './port';

export function repositoryProvider<T, K = string>(
  token: InjectionToken<Repository<T, K>>,
  model: string,
  options?: RepositoryOptions,
): FactoryProvider<Repository<T, K>> {
  return {
    provide: token,
    useFactory: (persistence: PersistenceAdapter) => persistence.repository<T, K>(model, options),
    inject: [PersistenceAdapter],
  };
}
