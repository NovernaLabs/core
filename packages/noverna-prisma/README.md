# @noverna/persistence-prisma

Prisma implementation of the `PersistenceAdapter` port from
[`@noverna/core`](https://www.npmjs.com/package/@noverna/core).

```bash
npm install @noverna/persistence-prisma @prisma/client @prisma/adapter-pg pg
```

## Prisma on FXServer

This is the part that is not optional, and it is why the install line above includes a driver
adapter.

**The Rust query engine cannot run inside FXServer.** Its embedded Node does not expose a full
N-API, so the `.node` addon panics, and the binary engine's IPC transport hangs instead of
connecting. Prisma 7's Rust-free client is what makes this work at all: a TypeScript client
with a WASM query compiler, talking to the database through a pure-JS driver.

Generate the client into your source tree:

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
  runtime  = "nodejs"
}

datasource db {
  provider = "postgresql"
}
```

Note the missing `url`. Prisma 7 rejects it in the schema (`P1012`), the connection belongs
to the driver adapter you pass to `new PrismaClient(...)`, and Migrate reads it from
`prisma.config.ts`.

`output` matters: a resource has no `node_modules` beside it at run time, so the client has to
be somewhere your bundler can reach. This adapter never imports `@prisma/client` itself, it
describes the methods it calls structurally, so a client generated to a custom path is
exactly as valid as one from the published package.

**Polyfill `performance` before constructing the client.** FXServer's script runtime omits it,
and Prisma's wasm-bindgen glue assumes it exists. The failure is a bare `performance is not
defined` from inside generated code, which points at nothing:

```ts
import { ensurePrismaRuntime } from '@noverna/persistence-prisma';

ensurePrismaRuntime(); // before `new PrismaClient(...)`, not after
```

**FXServer does not load a resource-local `.env`.** Read the connection string from a convar,
which is where a server owner expects to configure one:

noverna-allow-secret
```cfg
# server.cfg
# noverna-allow-secret
set DATABASE_URL ""
```

## Usage

```ts
import { Initialize } from '@noverna/core/server';
import { ensurePrismaRuntime, PrismaAdapter } from '@noverna/persistence-prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

ensurePrismaRuntime();

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: GetConvar('DATABASE_URL', '') }),
});

Initialize(
  async (app) => {
    app.registerRootModule(RootModule);
    await app.start();
  },
  { persistence: new PrismaAdapter(prisma) },
);
```

The client stays yours: you choose the driver adapter, the logging, the pooling. The framework
takes over only its lifecycle, `$connect()` before the first provider is built, `$disconnect()`
after the last one is disposed. Do not also open or close it yourself.

## Repositories

`repository(name)` maps to the Prisma model delegate of that name, so the string is the
**camelCase** delegate, not the schema's model name, `model Character` is `character`. An
unknown name throws at start-up with the available models listed, rather than failing later
with `undefined is not a function`.

```prisma
model Character {
  id    String @id @default(cuid())
  owner String
  name  String
}
```

```ts
export const CHARACTERS = createToken<Repository<Character>>('CHARACTERS');

@Module({
  providers: [repositoryProvider(CHARACTERS, 'character'), CharacterService],
})
export class CharacterModule {}
```

The module names no backend. Swapping Prisma for something else touches the bootstrap and
nothing here.

If your primary key is not `id`:

```ts
new PrismaAdapter(prisma, { idFields: { character: 'citizenId' } });
```

Two behaviours are the port's rules rather than Prisma's defaults, and this adapter enforces
them so every backend agrees:

- `findById()` and `findOne()` resolve to `undefined` for a missing row, never `null`.
- `update(id, data)` cannot move the primary key. An `id` inside the patch is dropped; the
  first argument wins.

## Transactions

Backed by Prisma's interactive transactions, so `capabilities.transactions` is `true` and the
port's atomicity guarantee holds without caveats.

```ts
await adapter.transaction(async (tx) => {
  const accounts = tx.repository<Account>('account');
  await accounts.update(from, { balance: fromBalance - amount });
  await accounts.update(to, { balance: toBalance + amount });
});
```

**One gotcha:** Prisma's interactive transactions time out after 5 seconds by default and roll
back. Anything slow, a native call, an HTTP request, does not belong inside the callback.
Raise it via `transactionOptions` on your `PrismaClient` if you really need to.

## When the port is not enough

It will not be, and that is by design. `Repository` is equality filters and CRUD, because that
is the intersection of Prisma, MongoDB and plain SQL. Relations, `select`, `include`,
aggregations, `groupBy` and raw SQL are not in it and never will be.

Use your client. It is fully typed, it is the one you constructed, and reaching for it is not
a defeat.

`PrismaAdapter` is generic over the client, so `adapter.client` gives back the *generated*
type rather than a widened one:

```ts
const persistence = new PrismaAdapter(prisma); // PrismaAdapter<PrismaClient>

persistence.client.character.findMany({
  where: { vehicles: { some: { impounded: true } } },
  include: { vehicles: true },
});
```

For application code, register the client as a provider of its own and inject that where you
need the real thing, keeping `PersistenceAdapter` for the code that should stay portable:

```ts
export const PRISMA = createToken<PrismaClient>('PRISMA');

@Module({
  providers: [{ provide: PRISMA, useValue: prisma }],
  exports: [PRISMA],
})
export class DatabaseModule {}
```

```ts
@Injectable()
export class CharacterQueries {
  public constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  public impounded() {
    return this.prisma.character.findMany({ include: { vehicles: true } });
  }
}
```

The split is the point: a service that only does CRUD injects `Repository` and survives a
backend change; a service that needs Prisma says so in its constructor.

## Conformance

The adapter is verified against `persistenceConformance` from `@noverna/core`, the port's
executable specification, so its answers match every other adapter's.

## Requirements

|                  |                                                         |
| ---------------- | ------------------------------------------------------- |
| `@noverna/core`  | peer, `^0.x`                                            |
| `@prisma/client` | peer, `>=7`, the Rust-free client, required on FXServer |
| A driver adapter | `@prisma/adapter-pg`, `@prisma/adapter-mariadb`, …      |
| Node             | 26+                                                     |

Prisma is a peer dependency: your generated client is the one that gets used, and there is only
ever one copy of the core in the tree.

Prisma with MySQL is this same adapter, change `provider` in your datasource and the driver
adapter. It is not a separate package.

## License

[MIT](../../LICENSE) © Noverna Labs
