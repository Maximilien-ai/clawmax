# Claude Co-Author History Cleanup Runbook

> Archived without execution. A Git history rewrite is explicitly outside the
> 2.0 launch scope.

## Purpose

This runbook explains how to remove historical `Co-authored-by: Claude ...` trailers from Git commit messages while preserving the real human author metadata.

Use this only during a planned maintenance window. It rewrites Git history and changes commit SHAs.

## Current Audit Snapshot

As of June 4, 2026, this repo has `565` commits whose commit messages match a Claude co-author trailer.

Audit commands:

```bash
git log --regexp-ignore-case \
  --grep='^Co-authored-by: .*Claude' \
  --pretty=format:'%h %ad %an | %s' \
  --date=short

git log --regexp-ignore-case \
  --grep='^Co-authored-by: .*Claude' \
  --pretty=format:'%H' | wc -l
```

## Recommendation

Do **not** do this casually on `main`.

Preferred options:

1. Leave history alone and stop adding future Claude co-author trailers.
2. If you want a clean major-version reset, do the cleanup as part of a `2.0` cut with a deliberate freeze window.
3. If you want the cleanest possible presentation, consider starting `2.0` from a sanitized branch and explicitly replacing `main` only after verification.

## What Changes

Rewriting commit messages will:

- change commit SHAs
- require force-pushing `main`
- require force-updating tags that point into rewritten history
- break old SHA references in docs/issues/PR discussions
- require downstream clones/branches to rebase or reset

What it should **not** change if done correctly:

- your real Git author name/email
- file contents
- tree state at `HEAD`

## Safe High-Level Process

### 1. Freeze writes

Before rewriting:

- stop merging to `main`
- stop tagging releases
- notify anyone with active branches

### 2. Create a full backup

Mirror backup:

```bash
git clone --mirror git@github.com:Maximilien-ai/clawmax.git clawmax.git.mirror-backup
```

Optional extra safety:

```bash
cp -R clawmax.git.mirror-backup clawmax.git.mirror-backup-2
```

### 3. Work in a fresh clone

```bash
git clone git@github.com:Maximilien-ai/clawmax.git clawmax-history-cleanup
cd clawmax-history-cleanup
```

### 4. Install `git-filter-repo`

Preferred tool:

```bash
brew install git-filter-repo
```

or follow upstream install instructions if not on macOS/Homebrew.

### 5. Rewrite only commit messages

This removes Claude co-author trailers while keeping the normal author metadata intact.

```bash
git filter-repo --force --message-callback '
import re
text = message.decode("utf-8", "replace")
text = re.sub(r"\nCo-authored-by: .*Claude.*?(?=\n|$)", "", text, flags=re.IGNORECASE)
text = re.sub(r"\n{3,}", "\n\n", text)
return text.rstrip().encode("utf-8") + b"\n"
'
```

If you need to support multiple Claude trailer variants, expand the regex after auditing exact message formats first.

### 6. Verify the rewrite

Check that no Claude trailers remain:

```bash
git log --regexp-ignore-case \
  --grep='^Co-authored-by: .*Claude' \
  --pretty=format:'%h %ad %an | %s' \
  --date=short
```

Expected result:

- no output

Confirm your own authorship is still intact:

```bash
git log --pretty=format:'%h %an <%ae> | %s' | head -50
```

Compare tree state against the original repo if needed:

```bash
git diff --stat origin/main..HEAD
```

Expected result:

- no content drift beyond rewritten metadata history

### 7. Review tags

List tags that may need to move:

```bash
git tag --sort=creatordate
```

If tags point to rewritten commits, they must be force-updated when you publish the cleaned history.

### 8. Publish via a dedicated branch first

Recommended dry-run branch:

```bash
git checkout -b history-cleanup-2-0
git push origin history-cleanup-2-0
```

Use that branch to:

- inspect commit history
- validate tags strategy
- confirm the repo still builds/tests as expected

### 9. Replace `main`

When ready:

```bash
git push --force-with-lease origin history-cleanup-2-0:main
```

If tags must move:

```bash
git push --force --tags origin
```

Only do this after confirming which tags actually need to be rewritten.

### 10. Notify all consumers

After cutover, tell everyone:

- history was rewritten
- they must not merge old local branches into new `main`
- they should re-clone or hard reset/rebase onto the new history

Typical reset command for consumers:

```bash
git fetch origin
git checkout main
git reset --hard origin/main
```

## Best Time To Do It

The cleanest moment is a major-version transition like `2.0`, because:

- it gives a natural change boundary
- you can communicate “new clean history from this point”
- downstream users already expect some release-management ceremony

## My Recommended `2.0` Strategy

If you want this done for `2.0`, I would do:

1. Create a fresh cleanup branch from current `main`.
2. Rewrite only the Claude co-author trailers.
3. Verify the tree/build/tests/tags.
4. Freeze merges briefly.
5. Force-move `main` to the cleaned branch.
6. Immediately tag the validated `2.0` release from the cleaned history.

That is a reasonable process.

## Alternative: New-Era History

If full rewrite feels too disruptive, another option is:

- keep this repo history as-is
- create a new repo or a new canonical `2.0` branch with a squashed or curated starting point

That is less faithful historically, but much less operationally risky.

## Quick Commands Reference

Audit count:

```bash
git log --regexp-ignore-case --grep='^Co-authored-by: .*Claude' --pretty=format:'%H' | wc -l
```

Audit list:

```bash
git log --regexp-ignore-case --grep='^Co-authored-by: .*Claude' --pretty=format:'%h %ad %an | %s' --date=short
```

Rewrite:

```bash
git filter-repo --force --message-callback '
import re
text = message.decode("utf-8", "replace")
text = re.sub(r"\nCo-authored-by: .*Claude.*?(?=\n|$)", "", text, flags=re.IGNORECASE)
text = re.sub(r"\n{3,}", "\n\n", text)
return text.rstrip().encode("utf-8") + b"\n"
'
```

Verify removal:

```bash
git log --regexp-ignore-case --grep='^Co-authored-by: .*Claude' --pretty=format:'%h %ad %an | %s' --date=short
```
