# Release Rules

One version for the whole repository, following semver.org.

**"Release", "release to prod", "ship it" or "deploy to production" means `/kt-release`** —
never a bare `gh release create`. It decides the next version from the commits, bumps every
versioned file, lands the version PR and publishes `vX.Y.Z`; for krantho.com it then verifies
the deploy. The operator's release instruction is the go for that version PR's merge once its CI is green, and for the
publish; it covers nothing else. Other PRs merge under the normal rule (CI green, the automated
review's findings addressed — `.claude/rules/git-workflow.md`); only the version PR and the
publish wait for the operator's go.

- **The tag is `vMAJOR.MINOR.PATCH`** (`v0.7.7`), with an optional pre-release (`v0.8.0-rc.1`).
  No prefixes, no other forms. The release title is the tag.
- **Every versioned file carries the release version**, without the `v`: the root and every
  workspace `package.json`, the Claude Code plugins' `plugin.json`, and each plugin skill's
  `krantho-version`. `pnpm run release:version set <x.y.z>` sets them all;
  `pnpm run release:version check v<x.y.z>` verifies them. `create-krantho` pins the
  `@krantho/*` packages it scaffolds to `^<its own version>`.
- **The bump follows the conventional commits since the last release.** While the major is `0`:
  `feat:` or a breaking change → minor, anything else → patch. From `1.0.0`: a breaking change
  (`!` or `BREAKING CHANGE:`) → major, `feat:` → minor, `fix:`/other → patch.
- **The version change lands on main through a PR** like any other change
  (`chore: release vX.Y.Z`), then the release is published from main at that commit.
- **Published tags never move or get deleted** — a GitHub tag ruleset enforces it. A broken
  release is followed by a new patch release, never retagged.
- **Changelog: every release gets an entry** in `CHANGELOG.md`, written in the version PR, before
  the release is published: a `## X.Y.Z - YYYY-MM-DD` heading, newest first. No release is too
  small for one. `release:version check` fails without it. A pre-release needs none.
- Run `/kt-release` to do all of the above.

## krantho.com follows releases

The project's release ends at the published tag. The site in `krantho-site/` adds its own steps,
and they are the site's, not the project's:

- **Every published release deploys** krantho.com (`.github/workflows/deploy-site.yml`): a
  pre-release to preview, a release to production. The workflow refuses a tag that is not
  semver, does not match the versioned files, or is not higher than the latest release.
- **A site-only release** ships content and site changes between package releases: run the
  workflow by hand with `environment: production` and the ref `main`. It deploys only when the
  ref's versioned files carry the latest release's version, publishes nothing to npm and needs
  no version PR.
- **Release notes describe the release**, never the deployment: no deployment URL, Vercel
  account or rollback command (`.claude/rules/public-content.md`).
- **The `/changelog` page has an entry of its own** for each release:
  `krantho-site/content/releases/vX-Y-Z.md`, its `version` set to the release version, written in
  the version PR with the `CHANGELOG.md` entry. `krantho-site/scripts/check-release-entry.mjs`
  fails without it, so the deploy refuses the release. The deploy imports the entry (no database
  reset), and `/changelog` shows it under the anchor `#vX.Y.Z`.
