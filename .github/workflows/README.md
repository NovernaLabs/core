# Workflows

| Workflow                           | Trigger                         | What it does                                                          |
| ---------------------------------- | ------------------------------- | --------------------------------------------------------------------- |
| [`ci.yml`](./ci.yml)               | PR, push to `main`, merge queue | Lint, typecheck, test, build, boundary checks, publish dry run        |
| [`pr-checks.yml`](./pr-checks.yml) | PR                              | Conventional title, changeset presence, bundle size report            |
| [`release.yml`](./release.yml)     | push to `main`                  | Keeps the "Version Packages" PR open; publishes to npm when it merges |
| [`codeql.yml`](./codeql.yml)       | PR, push, weekly                | Static security analysis for TS and for the workflows themselves      |
| [`labeler.yml`](./labeler.yml)     | PR                              | Applies `area: *` labels from the changed paths                       |
| [`stale.yml`](./stale.yml)         | daily                           | Closes abandoned issues and PRs                                       |

## Required repository setup

Do these once, before the first release.

### Secrets

| Secret                    | Used by       | Notes                                                                          |
| ------------------------- | ------------- | ------------------------------------------------------------------------------ |
| `NPM_TOKEN`               | `release.yml` | npm **automation** token with publish rights on the `@noverna` scope           |
| `DISCORD_RELEASE_WEBHOOK` | `release.yml` | Optional. Also set the repo variable `DISCORD_RELEASE_WEBHOOK_CONFIGURED=true` |

`GITHUB_TOKEN` is provided automatically - do not create one.

### Settings → Actions

- **Workflow permissions:** *Read repository contents and packages permissions*. Every
  workflow that needs more asks for it explicitly in its `permissions:` block.
- Enable **"Allow GitHub Actions to create and approve pull requests"** - the Changesets
  action needs it to open the release PR.

### Branch protection on `main`

- Require a pull request, **1 approval**, and review from **Code Owners**
- Required status checks: **`CI`** (the aggregate job in `ci.yml`),
  **`Conventional PR title`**, **`Changeset present`**
- Require branches to be up to date before merging
- Require conversation resolution before merging
- **Allow squash merging only** - disable merge commits and rebase merging
- Set the squash commit message to *"Pull request title and description"*
- Do not allow force pushes or deletions; apply the rules to administrators too

### Labels

The issue templates and `labeler.yml` reference these. Create them under
Settings → Labels, or import [`../labels.yml`](../labels.yml) with
[`github-label-sync`](https://github.com/Financial-Times/github-label-sync):

```bash
npx github-label-sync --access-token "$GITHUB_TOKEN" --labels .github/labels.yml novernalabs/noverna-framework
```

## Hardening notes

- Workflows use major version tags (`@v4`). For a stricter supply chain, pin every `uses:`
  to a full commit SHA - [`ratchet`](https://github.com/sethvargo/ratchet) does this
  mechanically, and Dependabot keeps the pins fresh.
- `pull_request_target` is used in exactly one place (`labeler.yml`) and that job never
  checks out or executes PR code. Do not add a `checkout` step to it.
- The npm publish runs with `id-token: write` so releases carry
  [provenance](https://docs.npmjs.com/generating-provenance-statements). Do not remove it.
