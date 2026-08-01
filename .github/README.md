# GitHub project config

## Required CI checks (branch protection)

Workflow: [`.github/workflows/ci.yml`](workflows/ci.yml)

| Check name | Job |
|---|---|
| `Backend` | lint, types, import-linter, Alembic head gate, unit + integration tests |
| `Frontend` | ESLint, Prettier, `tsc`, Next.js build |
| `Docker` | backend image build |

These exact names must be listed as **required status checks** on `main`.

## Branch protection on `main` (P0.3)

Target settings (public repo / GitHub Free):

- Require a pull request before merging
- Require status checks to pass: `Backend`, `Frontend`, `Docker`
- Require branches to be up to date before merging
- Require conversation resolution before merging
- Do not allow bypassing the above settings (includes administrators)
- Block force pushes
- Block deletions

CODEOWNERS is intentionally omitted for now (single-maintainer).

## Templates

- Pull request: [`PULL_REQUEST_TEMPLATE.md`](PULL_REQUEST_TEMPLATE.md)
- Issues: [`ISSUE_TEMPLATE/`](ISSUE_TEMPLATE/)
