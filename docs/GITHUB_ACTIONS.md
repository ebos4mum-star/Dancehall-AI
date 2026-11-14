# GitHub Actions: cost strategy and usage review

The repository is public so standard GitHub-hosted runner minutes are free for public repositories. Keep the workflow light anyway, in case visibility ever changes.
Public visibility is not permission to expose confidential information (see SECURITY_PRIVACY.md).

## Strategy (enforced by `scripts/check-ci-config.mjs`)

- Standard Ubuntu runners only; no macOS, Windows or larger runners.
- One workflow (`ci.yml`) with one job; dependency caching via `actions/setup-node` with pnpm.
- Triggers: pull requests, and pushes to `main` only (avoids duplicate runs); docs-only changes skip CI via path filters.
- `concurrency` with `cancel-in-progress` cancels superseded runs.
- `permissions: contents: read`; no secrets are used; no paid external services; `pull_request_target` is forbidden.
- No scheduled workflows without a documented requirement; no iOS or Android binary builds in CI; `timeout-minutes` on every job.
- Logs never print secret values (the scanner reports file, line and rule only).

## Reviewing usage

- Repository: **Actions** tab, then the workflow, to see run counts and durations.
- Account owner: **Settings, Billing and plans** (or **Billing, Usage**) shows Actions minutes by repository and runner type. Confirm the repository is still public and that spending limits are set to $0 if the owner wants no overage.
- Look for: many runs per push, long jobs, cache misses, and any non-Ubuntu runner.
