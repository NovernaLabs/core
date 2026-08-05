import {
  type AnyCtor,
  type Ctor,
  DESIGN_PARAMTYPES,
  getOwnMetadata,
  getParamTypes,
  type Token,
  tokenName,
} from '../../shared';
import { CircularDependencyException, DependencyResolutionException } from '../errors/exceptions';
import { INJECT_PARAMS, OPTIONAL_PARAMS } from '../keys';
import { hasHook } from '../lifecycle/hook';
import { normalizeProvider } from './provider';
import {
  type Binding,
  type Provider,
  type ProviderDefinition,
  type ResolutionContext,
  Scope,
} from './types';

function pathOf(ctx: ResolutionContext, token: Token): string[] {
  return [...ctx.stack, token].map(tokenName);
}

const UNRESOLVABLE_DESIGN_TYPES = new Set<unknown>([
  Object,
  Function,
  Array,
  String,
  Number,
  Boolean,
  Symbol,
  Promise,
  undefined,
]);

export class Container {
  readonly #bindings = new Map<Token, Binding>();
  readonly #instances = new Map<Token, unknown>();
  readonly #pending = new Map<Token, Promise<unknown>>();
  readonly #imports: Container[] = [];
  readonly #exported = new Set<Token>();
  readonly #children = new Set<Container>();
  readonly #disposables = new Set<object>();
  #disposed = false;

  public constructor(
    public readonly name: string = 'root',
    public readonly parent?: Container,
    public readonly isScope: boolean = false,
  ) {
    if (parent) parent.#children.add(this);
  }

  public register(provider: Provider): this {
    const binding = normalizeProvider(provider);
    this.#bindings.set(binding.token, binding);
    return this;
  }

  public registerMany(providers: readonly Provider[]): this {
    for (const provider of providers) this.register(provider);
    return this;
  }

  public seed<T>(token: Token<T>, value: T): this {
    this.#bindings.set(token as Token, {
      kind: 'value',
      token: token as Token,
      useValue: value,
    });
    this.#instances.set(token as Token, value);
    return this;
  }

  public provide<T>(token: Token<T>, definition: ProviderDefinition<T>): this {
    return this.register({ provide: token, ...definition } as Provider);
  }

  public addImport(container: Container): this {
    this.#imports.push(container);
    return this;
  }

  public markExported(token: Token): this {
    this.#exported.add(token);
    return this;
  }

  public get exportedTokens(): ReadonlySet<Token> {
    return this.#exported;
  }

  public get ownTokens(): IterableIterator<Token> {
    return this.#bindings.keys();
  }

  public eagerTokens(): Token[] {
    const tokens: Token[] = [];
    for (const [token, binding] of this.#bindings) {
      if (binding.kind === 'value' || binding.kind === 'existing') continue;
      if (binding.scope !== Scope.Singleton) continue;
      tokens.push(token);
    }
    return tokens;
  }

  public has(token: Token): boolean {
    return this.#findOwner(token) !== undefined;
  }

  #findOwner(token: Token, seen = new Set<Container>()): Container | undefined {
    if (seen.has(this)) return undefined;
    seen.add(this);

    if (this.#bindings.has(token)) return this;

    for (const imported of this.#imports) {
      if (!imported.#exported.has(token)) continue;
      const owner = imported.#findOwner(token, seen);
      if (owner) return owner;
    }

    return this.parent ? this.parent.#findOwner(token, seen) : undefined;
  }

  public get<T>(token: Token<T>): T | undefined {
    const cached = this.#instances.get(token as Token);
    if (cached !== undefined) return cached as T;

    const owner = this.#findOwner(token as Token);
    if (!owner || owner === this) return undefined;
    return owner.get(token);
  }

  public async resolve<T>(token: Token<T>, ctx: ResolutionContext = { stack: [] }): Promise<T> {
    this.#assertUsable();

    const owner = this.#findOwner(token as Token);
    if (!owner) {
      throw new DependencyResolutionException(
        `No provider for ${tokenName(token)}. Add it to a module's \`providers\`, or export it from the module that declares it and import that module.`,
        pathOf(ctx, token as Token),
      );
    }

    // biome-ignore lint/style/noNonNullAssertion: `#findOwner` only returns a container that has the binding.
    const binding = owner.#bindings.get(token as Token)!;

    const host =
      binding.kind !== 'value' && this.#scopeOf(binding) === Scope.Scoped
        ? this.#nearestScope(token as Token, ctx)
        : owner;

    return host.#instantiate(binding, ctx) as Promise<T>;
  }

  #scopeOf(binding: Binding): Scope {
    return binding.kind === 'class' || binding.kind === 'factory' ? binding.scope : Scope.Singleton;
  }

  #nearestScope(token: Token, ctx: ResolutionContext): Container {
    let current: Container | undefined = this;
    while (current && !current.isScope) current = current.parent;
    if (!current) {
      throw new DependencyResolutionException(
        `${tokenName(token)} is registered with \`scope: 'scoped'\` but was requested outside an execution scope. Scoped providers can only be resolved while handling an event, an HTTP request, an export call or an NUI callback.`,
        pathOf(ctx, token),
      );
    }
    return current;
  }

  async #instantiate(binding: Binding, ctx: ResolutionContext): Promise<unknown> {
    const { token } = binding;

    if (binding.kind === 'value') return binding.useValue;
    if (binding.kind === 'existing') {
      return this.resolve(binding.useExisting, {
        stack: [...ctx.stack, token],
      });
    }

    const transient = binding.scope === Scope.Transient;

    if (!transient && this.#instances.has(token)) return this.#instances.get(token);

    if (ctx.stack.includes(token)) {
      throw new CircularDependencyException(pathOf(ctx, token));
    }

    if (!transient) {
      const inFlight = this.#pending.get(token);
      if (inFlight) return inFlight;
    }

    const nested: ResolutionContext = { stack: [...ctx.stack, token] };
    const build =
      binding.kind === 'class'
        ? this.#construct(binding.useClass, nested)
        : this.#callFactory(binding, nested);

    if (transient) {
      const instance = await build;
      this.#trackDisposable(instance);
      return instance;
    }

    const promise = build.then((instance) => {
      this.#instances.set(token, instance);
      this.#pending.delete(token);
      this.#trackDisposable(instance);
      return instance;
    });
    this.#pending.set(token, promise);
    return promise;
  }

  async #callFactory(
    binding: Extract<Binding, { kind: 'factory' }>,
    ctx: ResolutionContext,
  ): Promise<unknown> {
    const args = await Promise.all(binding.inject.map((dep) => this.resolve(dep, ctx)));
    return (binding.useFactory as (...a: unknown[]) => unknown)(...args);
  }

  async #construct(target: Ctor, ctx: ResolutionContext): Promise<unknown> {
    const paramTypes = getParamTypes(target);
    const overrides = getOwnMetadata<Map<number, Token>>(INJECT_PARAMS, target);
    const optional = getOwnMetadata<Set<number>>(OPTIONAL_PARAMS, target);

    const arity = Math.max(target.length, paramTypes?.length ?? 0, overrides?.size ?? 0);

    if (arity > 0 && paramTypes === undefined && (overrides?.size ?? 0) === 0) {
      throw new DependencyResolutionException(
        `${target.name} takes constructor arguments but carries no design:paramtypes. Add @Injectable() to the class — the compiler only emits parameter types for decorated declarations.`,
        pathOf(ctx, target),
      );
    }

    const args = await Promise.all(
      Array.from({ length: arity }, async (_, index) => {
        const explicit = overrides?.get(index);
        const token = explicit ?? (paramTypes?.[index] as Token | undefined);
        const isOptional = optional?.has(index) ?? false;

        if (!explicit && (token === undefined || UNRESOLVABLE_DESIGN_TYPES.has(token))) {
          if (isOptional) return undefined;
          throw new DependencyResolutionException(
            `Cannot resolve parameter #${index} of ${target.name}: its type erases to \`${tokenName(token)}\`. Interfaces, type aliases and primitives carry no runtime identity, inject them with an explicit token: \`@Inject(MY_TOKEN) private readonly dep: MyInterface\`.`,
            pathOf(ctx, target),
          );
        }

        // biome-ignore lint/style/noNonNullAssertion: the branch above rules out undefined.
        const resolvedToken = token!;
        if (isOptional && !this.has(resolvedToken)) return undefined;
        return this.resolve(resolvedToken, ctx);
      }),
    );

    return new target(...args);
  }

  #trackDisposable(instance: unknown): void {
    if (hasHook(instance, 'onDispose') || hasHook(instance, 'onModuleDestroy')) {
      this.#disposables.add(instance as object);
    }
  }

  public createScope(name: string): Container {
    this.#assertUsable();
    return new Container(name, this, true);
  }

  public get instances(): readonly unknown[] {
    return [...this.#instances.values()];
  }

  public async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;

    for (const child of [...this.#children]) await child.dispose();
    this.#children.clear();

    for (const instance of [...this.#disposables].reverse()) {
      if (hasHook(instance, 'onModuleDestroy')) await instance.onModuleDestroy();
      if (hasHook(instance, 'onDispose')) await instance.onDispose();
    }

    this.#disposables.clear();
    this.#instances.clear();
    this.#pending.clear();
    if (this.parent) this.parent.#children.delete(this);
  }

  public get disposed(): boolean {
    return this.#disposed;
  }

  #assertUsable(): void {
    if (this.#disposed) {
      throw new DependencyResolutionException(
        `Container "${this.name}" has been disposed. This usually means an async operation outlived its execution scope, capture what you need before the first await, or make the provider a singleton.`,
      );
    }
  }
}

export function isConstructor(value: unknown): value is Ctor {
  return typeof value === 'function' && value.prototype !== undefined;
}

export function describeDependencies(target: AnyCtor): string[] {
  const paramTypes = getOwnMetadata<unknown[]>(DESIGN_PARAMTYPES, target) ?? [];
  const overrides = getOwnMetadata<Map<number, Token>>(INJECT_PARAMS, target);
  return paramTypes.map((type, index) => tokenName(overrides?.get(index) ?? (type as Token)));
}
