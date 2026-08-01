# GitHub project config

## Required CI checks (branch protection)

Workflow: [`.github/workflows/ci.yml`](workflows/ci.yml)

| Check name | Job |
|---|---|
| `Backend` | lint, types, import-linter, Alembic head gate, unit + integration tests |
| `Frontend` | ESLint, Prettier, `tsc`, Next.js build |
| `Docker` | backend image build |

These exact names must be listed as **required status checks** on `main`.

Local parity: `make ci` (needs Docker for the image build, and a reachable Postgres for integration tests — e.g. `docker compose up -d db`).

## Workflow hardening notes

- `permissions.contents: read` — least-privilege `GITHUB_TOKEN`
- Third-party Actions pinned to commit SHAs (version tags in comments)
- Docker layer cache: read on PRs, write only on `push` (reduces untrusted PR cache poisoning risk)
- CI Postgres credentials are throwaways for the ephemeral service container only — do not reuse for cloud/shared environments

## Branch protection on `main` (P0.3)

Target settings (public repo / GitHub Free):

- Require a pull request before merging
- Require status checks to pass: `Backend`, `Frontend`, `Docker`
- Require branches to be up to date before merging
- Require conversation resolution before merging
- Do not allow bypassing the above settings (includes administrators)
- Block force pushes
- Block deletions
- Required approving reviews: 0 (solo-maintainer; PR still required)

CODEOWNERS is intentionally omitted for now (single-maintainer).

## Templates

- Pull request: [`PULL_REQUEST_TEMPLATE.md`](PULL_REQUEST_TEMPLATE.md)
- Issues: [`ISSUE_TEMPLATE/`](ISSUE_TEMPLATE/)
