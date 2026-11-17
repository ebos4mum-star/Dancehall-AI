# GitHub Actions: cost strategy and usage review

The repository is public so standard GitHub-hosted runner minutes are free for public repositories. Keep the workflow light anyway, in case visibility ever changes.
Public visibility is not permission to expose confidential information (see SECURITY_PRIVACY.md).

## Strategy (enforced by `scripts/check-ci-config.mjs`)

- Standard Ubuntu runners only; no Windows or larger runners; macOS only in the three pinned iOS workflows below.
- One workflow (`ci.yml`) with one job; dependency caching via `actions/setup-node` with pnpm.
- Triggers: pull requests, and pushes to `main` only (avoids duplicate runs); docs-only changes skip CI via path filters.
- `concurrency` with `cancel-in-progress` cancels superseded runs.
- `permissions: contents: read`; no secrets are used outside the two protected release environments; no paid external services; `pull_request_target` is forbidden.
- No scheduled workflows without a documented requirement; no iOS or Android binary builds in CI except the manual workflows below; `timeout-minutes` on every job.
- Logs never print secret values (the scanner reports file, line and rule only).

## Reviewing usage

- Repository: **Actions** tab, then the workflow, to see run counts and durations.
- Account owner: **Settings, Billing and plans** (or **Billing, Usage**) shows Actions minutes by repository and runner type. Confirm the repository is still public and that spending limits are set to $0 if the owner wants no overage.
- Look for: many runs per push, long jobs, cache misses, and any non-Ubuntu runner.

## Release workflows (GitHub Actions to Xcode to App Store Connect to TestFlight; EAS is not used)

Three manual workflows exist besides `ci.yml`; `scripts/check-ci-config.mjs` pins the rules for each and has tests that make every rule fail when broken.

- `ios-native-build.yml`: unsigned compile on `macos-26` with a pinned Xcode. No secrets, no archive, no export, no upload.
- `ios-testflight-build.yml`: signed App Store IPA, and it stops there. Manual only; explicit commit SHA that must be on the release branch; confirmation phrase; protected environment `testflight-build`; release validation first; environment guard (staging project only); signing material checks; IPA inspection; the IPA is encrypted before it is kept (the repository is public). It contains no upload command and no App Store Connect credential.
- `ios-testflight-upload.yml`: separate workflow, separate protected environment `testflight-upload` with its own approval. Validates the IPA with App Store Connect by default (`dry_run: true`); uploads only when `dry_run` is explicitly `false`; refuses an IPA whose hash differs from the build run's. It holds no signing certificate.
- Release workflows pin every action to a full commit SHA, never cancel a running release job (a new run waits), and are dispatched from `main` (`--ref main`) with an explicit release commit that the job checks out and verifies. They are not on `main` until the workflow-only pull request in `RELEASE_WORKFLOW_PR.md` is merged. Apple and GitHub setup: `TESTFLIGHT_SETUP_CHECKLIST.md`.
- Secrets and variables are referenced by name only, only after the environment line, only from each workflow's allow-list, and only in the two environments. Setup and exact commands: `TESTFLIGHT_RELEASE_READINESS.md` sections 4 and 5.
