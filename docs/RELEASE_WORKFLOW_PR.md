# Workflow-only pull request (prepared, not created, not merged)

GitHub offers a manual run (`workflow_dispatch`) only for workflow files on the default branch, and `main` holds only `ci.yml`. The smallest change that makes the two release workflows runnable is **four files**; nothing from the application branch is merged.

| File                                          | Why it is needed on `main`                                                                               |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `.github/workflows/ios-testflight-build.yml`  | the signed-IPA build workflow (manual only, cannot upload)                                               |
| `.github/workflows/ios-testflight-upload.yml` | the separate validate-or-upload workflow (manual only, validates by default)                             |
| `scripts/check-ci-config.mjs`                 | `main`'s CI runs this check on every workflow; without the new rules it would reject the macOS workflows |
| `scripts/check-ci-config.test.mjs`            | the tests that make every one of those rules fail when broken (they read the two workflows above)        |

Not in the pull request, on purpose: `scripts/release/*`, `scripts/staging/guard.mjs` and every other script. The workflows check out the **explicit release commit** and run those scripts from **that commit**, so they come with the release branch. The unsigned `ios-native-build.yml` is also left out (it is not needed to build).

## Verified on a clean checkout of `main`

On a throwaway checkout of `origin/main` with exactly these four files copied in: `node scripts/check-ci-config.mjs` passes (3 workflow files), the check's 23 tests pass, `actionlint` is clean, and `prettier --check` is clean. The pull request changes no application code.

## Create it (you, or tell me to, once you approve pushing a new branch; I am authorized to push only the Claude branch)

```bash
git fetch origin main claude/ecstatic-meitner-8you9v
git switch -c release/workflows-only origin/main
git checkout origin/claude/ecstatic-meitner-8you9v -- \
  .github/workflows/ios-testflight-build.yml \
  .github/workflows/ios-testflight-upload.yml \
  scripts/check-ci-config.mjs \
  scripts/check-ci-config.test.mjs
git status --short                      # exactly those four files
git commit -m "Add manual release workflows: signed TestFlight IPA build and separate upload (no automatic trigger)"
git push -u origin release/workflows-only
```

Then open a pull request from `release/workflows-only` to `main` with the description below. **Do not merge until you approve.**

## Pull request description

> **What:** two manual-only GitHub Actions workflows for the first internal TestFlight release (GitHub Actions, Xcode, App Store Connect, TestFlight), plus the CI-config rules and tests that police them. No application code.
>
> **Build workflow** (`ios-testflight-build.yml`): `workflow_dispatch` only. Takes an explicit 40-character release commit, checks it is on the named release branch, runs the full release validation, then (after approval of the protected environment `testflight-build`) checks the environment is the designated staging project only with no AI gateway or fixtures, generates the iOS project, signs with the approved App Store certificate and profile, archives, exports and inspects the IPA, and keeps it **encrypted**. It contains no upload command and no App Store Connect credential.
>
> **Upload workflow** (`ios-testflight-upload.yml`): `workflow_dispatch` only, separate protected environment `testflight-upload`, separate approval. Verifies the IPA hash, re-inspects it, validates with App Store Connect, and uploads only when `dry_run` is explicitly `false`.
>
> **Safety:** secrets exist only in the two environments (required reviewers, restricted to `main`); the CI-config check enforces the allow-lists of secrets and variables, pinned action SHAs, no automatic triggers, no production or service-role names, and no cancellation of a running release job. Nothing here runs until someone dispatches it and approves the environment.
>
> **Not included:** the application branch, `scripts/release/*` (run from the release commit), any secret or Apple asset.
>
> **Before first use:** the setup in `docs/TESTFLIGHT_SETUP_CHECKLIST.md` (Apple assets, environments, secrets and variables).

## Environment protection and the exact-commit check (reviewed)

- The workflows are always dispatched from `main` (`--ref main`), so `github.ref` is `refs/heads/main` and an environment restricted to `main` allows the run. The code that is built is not `main`: both jobs check out `ref: ${{ inputs.release_sha }}` and fail unless `git rev-parse HEAD` equals that input; the validation job also fails unless the commit is an ancestor of the named release branch.
- Required reviewers on each environment pause the signing job (or the upload job) until you approve, so approving the build does not approve the upload. Environment secrets are not readable before that approval.
- The release validation job runs without secrets and without an environment.
