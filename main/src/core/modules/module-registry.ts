import type { Ctor, Token } from '../../shared';
import type { Container } from '../di/container';
import type { ModuleMetadata } from './module.metadata';

export class ModuleRef {
  public constructor(
    public readonly type: Ctor,
    public readonly metadata: ModuleMetadata,
    public readonly container: Container,
  ) {}

  public get name(): string {
    return this.type.name;
  }

  public resolve<T>(token: Token<T>): Promise<T> {
    return this.container.resolve(token);
  }

  public get<T>(token: Token<T>): T | undefined {
    return this.container.get(token);
  }

  public get controllers(): readonly Ctor[] {
    return this.metadata.controllers ?? [];
  }
}
