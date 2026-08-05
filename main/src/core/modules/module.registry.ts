import { type Ctor, type Token, tokenName } from '../../shared';
import { Container } from '../di/container';
import { providerToken } from '../di/provider';
import { ModuleException } from '../errors/exceptions';
import { getModuleMetadata, type ModuleMetadata } from './module.metadata';

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

export class ModuleRegistry {
  readonly #modules = new Map<Ctor, ModuleRef>();
  readonly #globals: ModuleRef[] = [];

  public constructor(private readonly rootContainer: Container) {}

  public get modules(): readonly ModuleRef[] {
    return [...this.#modules.values()];
  }

  public get(type: Ctor): ModuleRef | undefined {
    return this.#modules.get(type);
  }

  public register(type: Ctor): ModuleRef {
    const ref = this.#instantiate(type, []);
    this.#linkGlobals();
    return ref;
  }

  #instantiate(type: Ctor, path: Ctor[]): ModuleRef {
    if (path.includes(type)) {
      throw new ModuleException(
        `Circular module imports: ${[...path, type].map((m) => m.name).join(' -> ')}. Break the cycle by moving the shared providers into a module both sides import.`,
      );
    }

    const existing = this.#modules.get(type);
    if (existing) return existing;

    const metadata = getModuleMetadata(type);
    if (!metadata) {
      throw new ModuleException(
        `${type?.name ?? String(type)} is not a module. Did you forget @Module({ ... }) on it, or list a provider where a module was expected?`,
      );
    }

    const container = new Container(`module:${type.name}`, this.rootContainer);
    const ref = new ModuleRef(type, metadata, container);
    this.#modules.set(type, ref);

    for (const imported of metadata.imports ?? []) {
      const importedRef = this.#instantiate(imported, [...path, type]);
      container.addImport(importedRef.container);
    }

    for (const provider of [...(metadata.providers ?? []), ...(metadata.controllers ?? [])]) {
      container.register(provider);
    }

    if (!container.has(type)) container.register(type);
    container.seed(ModuleRef, ref);

    this.#markExports(ref);

    if (metadata.global) this.#globals.push(ref);

    return ref;
  }

  #markExports(ref: ModuleRef): void {
    const declared = new Set<Token>(
      [...(ref.metadata.providers ?? []), ...(ref.metadata.controllers ?? [])].map((p) =>
        providerToken(p),
      ),
    );

    for (const exported of ref.metadata.exports ?? []) {
      const importedRef =
        typeof exported === 'function' ? this.#modules.get(exported as Ctor) : undefined;
      if (importedRef && importedRef !== ref) {
        for (const token of importedRef.container.exportedTokens) ref.container.markExported(token);
        continue;
      }

      if (!declared.has(exported as Token)) {
        throw new ModuleException(
          `${ref.name} exports ${tokenName(exported)}, which it does not provide. Add it to \`providers\`, or export the module that owns it.`,
        );
      }
      ref.container.markExported(exported as Token);
    }
  }

  #linkGlobals(): void {
    for (const global of this.#globals) {
      for (const ref of this.#modules.values()) {
        if (ref === global) continue;
        ref.container.addImport(global.container);
      }
    }
  }
}
