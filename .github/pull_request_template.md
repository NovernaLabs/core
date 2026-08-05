<!--
  PR titles are squash-merged into `main`, so the title must follow Conventional Commits:
      <type>(<scope>): <description>
      feat(core): add typed RPC between client and server
  See CONTRIBUTING.md#commit-and-pr-conventions for valid types and scopes.
-->

## What does this change?

<!-- One or two sentences. What is different after this PR that was not true before? -->

## Why?

<!-- The problem, not the solution. Link the issue: "Closes #123" / "Relates to #123" -->

Closes #

## How should a reviewer read this?

<!--
  Optional, but do fill it in if the diff is large.
  e.g. "Start with main/src/rpc/port.ts - the rest is mechanical."
-->

## Type of change

- [ ] Bug fix (non-breaking)
- [ ] New feature (non-breaking)
- [ ] Breaking change
- [ ] Documentation
- [ ] Build / CI / tooling
- [ ] Refactor with no behaviour change

## Affected areas

- [ ] `main/` - `@noverna/core`
- [ ] `packages/` - adapters
- [ ] `internal/` - dev harness
- [ ] `tools/` - build tooling
- [ ] CI / repository config

## Checklist

- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass locally
- [ ] Tests added or updated for the changed behaviour
- [ ] No new imports from `packages/` into `main/` - the port/adapter boundary holds
- [ ] No secrets, tokens, licence keys or real server IPs in the diff

## Breaking changes

<!--
  Delete this section if nothing breaks. Otherwise:
  - What breaks
  - What the migration looks like (before/after code)
  This text goes into the release notes.
-->

## Tested against

<!-- Delete if not applicable to your change. -->

- FXServer build:
- Game build: Enhanced
- Adapter used:

## Screenshots / recordings

<!-- For anything with a visible effect in game or in the UI. -->
