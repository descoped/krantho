---
description: "Publishes the next krantho release — decides the semver bump, sets every versioned file, writes the changelog entry, lands the version PR, publishes vX.Y.Z and verifies the deploy. Use for \"release\", \"release to prod\", \"ship it\" or \"deploy to production\"."
argument-hint: "[x.y.z]"
---

# Release $ARGUMENTS

Publish the next krantho release: `/kt-release` (bump from the commits) or `/kt-release <x.y.z>`
(an explicit version). Follows `.claude/rules/releases.md`. This is what "release", "release to
prod" or "deploy to production" means — the operator's instruction is the go for the version PR's
merge once CI is green, and for the publish.

## 1. Decide the version

```bash
git fetch --tags origin
last=$(git tag -l 'v*' --sort=-v:refname | head -1)
git log --oneline "$last"..origin/main
```

Pick the bump from the conventional commits (rules: major `0` → `feat:`/breaking is minor, the
rest patch). An explicit argument wins. Say which version and why.

## 2. Version PR

On a branch `chore/release-vX.Y.Z` from `origin/main`:

1. `pnpm run release:version set X.Y.Z`
2. Write the release's changelog entry at the top of `CHANGELOG.md`: a
   `## X.Y.Z - YYYY-MM-DD` heading, then what changed for people who use krantho, grouped under
   Added / Changed / Fixed. Every release gets one, however small; model it on the latest entry.
3. Write krantho.com's entry for the `/changelog` page,
   `krantho-site/content/releases/vX-Y-Z.md` (`version: X.Y.Z`, `date`, `highlights`,
   `status: published`), in the `copywriting` voice, from the same changes.
4. `pnpm run release:version check vX.Y.Z` passes (versioned files and `CHANGELOG.md`), and so
   does `node krantho-site/scripts/check-release-entry.mjs vX.Y.Z`;
   `pnpm install --frozen-lockfile` still passes; run the TS gate for what changed.
5. Commit `chore: release vX.Y.Z` (specific files, both entries included), push, open the PR,
   wait for CI.
6. Merge it (`gh pr merge --squash --delete-branch`) once CI is green and the review has no
   critical finding — the release instruction is the go. A failing gate or a critical finding
   stops the release and goes back to the operator.

## 3. Publish

After the PR merged:

```bash
git checkout main && git pull
pnpm run release:version check vX.Y.Z
gh release create vX.Y.Z --target main --title vX.Y.Z --notes "…"
```

Notes: what changed for users, one line per change with its PR number; say whether the release
needs a database reset (the operator's deployment runbook — new and changed content files,
a changelog entry included, do not).

## 4. Verify krantho.com

The release is published; the site follows it. Watch the deploy (`gh run watch`), then check
production: `/changelog` shows the release's entry at `#vX.Y.Z`, the pages the release touched,
`/sitemap.xml`, and the Notify IndexNow step's log (key file, HTTP status, URLs).
