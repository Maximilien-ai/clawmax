# Branch Protection: `main`

Branch protection rules are enforced via the GitHub API (not repo rulesets).

## Active Rules

### Required Pull Request Reviews
- **Minimum approving reviews:** 1
- **Dismiss stale reviews on push:** Yes
- **Require code owner reviews:** No

### Required Status Checks
- **Strict mode:** Yes (branch must be up-to-date with `main` before merge)
- **Required checks:** `test` (from `.github/workflows/ci.yml`)

### Other Settings
- **Enforce admins:** No (admins can bypass in emergencies)
- **Allow force pushes:** No
- **Allow deletions:** No
- **Require signed commits:** Not yet (consider enabling later)

## Implications
- No direct pushes to `main` — all changes go through PRs
- CI must pass before merge
- At least one reviewer must approve
- Stale approvals are dismissed when new commits are pushed

## Modifying These Rules
Use the GitHub API or repository Settings → Branches → `main`.

```bash
# View current protection
gh api repos/Maximilien-ai/clawmax/branches/main/protection

# Update (see GitHub docs for payload schema)
gh api repos/Maximilien-ai/clawmax/branches/main/protection --method PUT --input payload.json
```
