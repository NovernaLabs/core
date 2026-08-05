# tools/

Shared build and repository tooling. Nothing here is user-facing.

| Path                      | What it is                                                           |
| ------------------------- | -------------------------------------------------------------------- |
| [`tsconfig/`](./tsconfig) | Shared TypeScript configs  `library`, `fivem-client`, `fivem-server` |
| [`bundler/`](./bundler)   | tsdown wrapper producing FiveM-compatible client/server bundles      |

Note the directory is `bundler/`, not `build/`: `.gitignore` excludes any directory named
`build`, so a workspace called that silently never gets committed.
| [`scripts/`](./scripts) | Repository scripts, run from the root |

## Scripts

| Script                 | Run by              | What it does                                           |
| ---------------------- | ------------------- | ------------------------------------------------------ |
| `check-boundaries.mjs` | CI                  | Enforces the dependency direction from ARCHITECTURE.md |
| `check-secrets.mjs`    | pre-commit hook     | Tripwire for credentials in staged files               |
| `report-size.mjs`      | CI                  | Bundle size table in the PR summary                    |
| `setup-server.mjs`     | `pnpm server:setup` | Downloads the pinned FXServer artifact                 |
| `dev-server.mjs`       | `pnpm server:dev`   | Builds, watches, and boots the local server            |

All of them assume the repository root as the working directory.

## Why the tsconfigs are split

`fivem-client.json` deliberately omits `@types/node`. Client code that reaches for `fs` or
`process` then fails to compile instead of failing at runtime in a player's game. The
bundler enforces the same rule a second time by rejecting `node:` specifiers  belt and
braces, because this particular mistake is invisible until production.
