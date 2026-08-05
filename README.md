<div align="center">

# Noverna - Framework

**A TypeScript-first framework for FiveM Enhanced.**

Typed events, dependency injection, swappable persistence, and a plug & play gamemode
built as a proper npm package instead of a folder you copy into `resources/`.

[![CI](https://github.com/novernalabs/core/actions/workflows/ci.yml/badge.svg)](https://github.com/novernalabs/core/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@noverna/core?label=%40noverna%2Fcore)](https://www.npmjs.com/package/@noverna/core)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D26-brightgreen)](./.nvmrc)

[Documentation](https://docs.noverna.dev) ·
[Quick start](#quick-start) ·
[Discord](https://discord.gg/noverna)

</div>

---

## What this is

Most FiveM frameworks are a resource you fork. Noverna is a **library you depend on**.

That difference is the whole point:

- **You own your resource.** The framework is a version-pinned dependency, not a folder you
  patched three months ago and can no longer update.
- **Types cross the netcode boundary.** Client -> server events are checked at compile time.
- **Persistence is an adapter.** Prisma, Drizzle, TypeORM or raw `mysql` the core never knows which one you picked.
- **Upgrades are semver, not a merge conflict.**

## Repository layout

This is a monorepo. Each root has one job:

| Path                      | Published as        | What it is                                                                    |
| ------------------------- | ------------------- | ----------------------------------------------------------------------------- |
| [`main/`](./main)         | `@noverna/core`     | The framework. The thing developers `npm install`.                            |
| [`packages/`](./packages) | `@noverna/*`        | First-party adapters, persistence, cache, logging, telemetry.                 |
| [`internal/`](./internal) |                     | Local FXServer runtime + a scratch resource for development. Never published. |
| [`tools/`](./tools)       | `@noverna/*-config` | Shared tsconfig, the FiveM bundler, repo scripts.                             |

## Quick start

```bash
pnpm install @noverna/core
```

```ts
import { LogLevel, Module } from '@noverna/core';
import { Initialize } from '@noverna/core/server';
import { InventoryModule } from './server/inventory.module.js';
import { DemoPlayer } from './server/player.js';

/**
 * The resource's root module.
 *
 * A real gamemode would import a dozen of these. The point of the split is that
 * `InventoryModule` knows nothing about the resource it happens to be loaded into.
 */
@Module({ imports: [InventoryModule] })
class RootModule {}

/**
 * The entry point.
 *
 * `Initialize` exists because FXServer loads a plain script: an IIFE bundle has no top-level
 * `await`, and an unhandled rejection here would produce a stack trace with no indication of
 * which resource failed. It also wires `onResourceStop`, so `@OnResourceStop()` handlers and
 * provider disposal actually run when the resource is stopped or restarted.
 */
Initialize(
  async (app) => {
    app.registerRootModule(RootModule).usePlayer(DemoPlayer);
    await app.start();
  },
  { logLevel: LogLevel.Debug },
);
```

### For contributors

```bash
git clone https://github.com/novernalabs/core.git
cd core
corepack enable
pnpm install
pnpm build
pnpm server:setup   # downloads the FXServer artifact into internal/server/
pnpm server:dev     # builds internal/test-resource and boots FXServer
```

Everything you need to know before opening a PR is in [CONTRIBUTING.md](./CONTRIBUTING.md).

## Requirements

|                       | Version                                      |
| --------------------- | -------------------------------------------- |
| FiveM server build    | Enhanced                                     |
| Node.js (development) | 26.x (matches the FXServer Enhanced runtime) |
| pnpm                  | 10+                                          |

## Project status

Pre-1.0. The public API of `@noverna/core` may change between minor versions until `1.0.0`
ships. Breaking changes are always directly Communicated and given time to adapt your resources.

## Support & security

- **Questions / help** -> [GitHub Discussions](https://github.com/novernalabs/core/discussions)
- **Bugs** -> [open an issue](https://github.com/novernalabs/core/issues/new/choose)

## License

[MIT](./LICENSE) © Noverna Labs
