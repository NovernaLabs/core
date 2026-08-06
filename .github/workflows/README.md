# Workflows

| Workflow                           | Trigger                         | What it does                                                          |
| ---------------------------------- | ------------------------------- | --------------------------------------------------------------------- |
| [`ci.yml`](./ci.yml)               | PR, push to `main`, merge queue | Lint, typecheck, test, build, boundary checks, publish dry run        |
| [`pr-checks.yml`](./pr-checks.yml) | PR                              | Conventional title, bundle size report                                |
| [`release.yml`](./release.yml)     | manual                          | Builds, tests and publishes to npm. Defaults to a dry run             |
| [`codeql.yml`](./codeql.yml)       | PR, push, weekly                | Static security analysis for TS and for the workflows themselves      |
| [`labeler.yml`](./labeler.yml)     | PR                              | Applies `area: *` labels from the changed paths                       |
| [`stale.yml`](./stale.yml)         | daily                           | Closes abandoned issues and PRs                                       |

## Required repository setup

Do these once, before the first release.

### Secrets

| Secret                    | Used by       | Notes                                                                          |
| ------------------------- | ------------- | ------------------------------------------------------------------------------ |
| `DISCORD_RELEASE_WEBHOOK` | `release.yml` | Optional. Also set the repo variable `DISCORD_RELEASE_WEBHOOK_CONFIGURED=true` |

`GITHUB_TOKEN` is provided automatically - do not create one.

Publishing needs no npm token. `release.yml` authenticates with npm through OIDC
trusted publishing, configured per package under Settings on npmjs.com: provider
GitHub Actions, repository `NovernaLabs/core`, workflow `release.yml`. The job only
needs `id-token: write` for that.

Each package needs its own trusted publisher entry, and **Allow npm publish** has to be
ticked under *Allowed actions*. Leave *Environment name* empty unless the job actually
declares an `environment:`, since npm checks that value against the OIDC claim.

#### A failed publish burns the version

npm writes the provenance signature to the Sigstore transparency log *before* it uploads
([npm/cli#7654](https://github.com/npm/cli/issues/7654)), so a publish that fails on
authentication still leaves an entry behind. Retrying the same version then dies with
`TLOG_CREATE_ENTRY_ERROR` and a 409, because the log is append only and refuses the
duplicate. Bump the version and run again, the old number is not recoverable.

### Settings → Actions

- **Workflow permissions:** *Read repository contents and packages permissions*. Every
  workflow that needs more asks for it explicitly in its `permissions:` block.
- Releases are triggered by hand from the Actions tab. Bump the versions in the package
  manifests first, then run **Release** with `dry_run` unchecked.

### Branch protection on `main`

- Require a pull request, **1 approval**, and review from **Code Owners**
- Required status checks: **`CI`** (the aggregate job in `ci.yml`),
  **`Conventional PR title`**
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
