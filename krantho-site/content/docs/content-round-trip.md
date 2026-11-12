---
title: Bring production edits back to git
description: Editors change content in production between releases. Read those edits back as a branch, merge them with git, and the repository stays the durable copy of your content.
area: guides
order: 18
level: advanced
stacks: [next, sveltekit, express]
prerequisites: [deploy-vercel, cli]
related: [package-server, api, configuration, persistence]
status: published
---

Your content starts as markdown files in git. A deploy imports them into the database, and from then on editors change pages in Studio. Those edits live in the database only. This guide brings them back to the repository, so a rebuilt database or a new environment loses nothing and your files stay the source of truth.

> [!NOTE]
> krantho's packages and the `krantho` command line tool are not yet published, so you build the CLI from a checkout. [Project status](/docs/project-status) explains how to run krantho from source.

## How it works

1. A build writes `content/manifest.json` with the checksum of every content file and the git commit it ran at.
2. The deploy imports new and changed files and stores the manifest in the database. Nothing else is stored: the database already holds every version of every document.
3. `GET /api/changes` compares each live document with the checksum its file had at the last import and lists the files that differ, written the way they would sit in your repository.
4. `krantho pull` writes those files on a new branch, cut from the commit the last import came from, and commits them.
5. You merge the branch with git. The next deploy finds the files already say what the database says, and imports nothing for them.

git does the merging, so everything it offers for conflicts, review and history is there. A file you changed in the repository and an editor changed in production is never overwritten by a deploy: the database keeps the editor's version and the import records a conflict.

## Set it up

### Write the commit into the manifest

The build already writes the manifest when you [ship content with a deploy](/docs/package-server#ship-content-file-changes-with-a-deploy). Pass the commit as well:

```js title="scripts/content-dates.mjs"
import { join } from 'node:path'
import { contentCommit, contentVersion, generateManifest } from '@krantho/server'

const contentDir = join(import.meta.dirname, '..', 'content')
const version = await contentVersion(contentDir)
const commit = await contentCommit(contentDir)
await generateManifest(contentDir, version, commit ?? undefined)
```

Build from the full git history (in GitHub Actions, `fetch-depth: 0`). Without a commit, a pull has no starting point and you pass one with `--base`.

### Let your CI call the API without a stored secret

`/api` answers signed-in people only on a site with `auth.requireAuthForReads`, which is how a production site should run. A CI job proves who it is with the identity token its platform issues. krantho trusts one issuer, one audience and a set of subjects, and gives a token that passes an identity that can call `GET /api/changes` and nothing else.

```ts title="krantho.config.ts"
export default defineKranthoConfig({
  auth: {
    requireAuthForReads: true,
    workload: {
      issuer: 'https://token.actions.githubusercontent.com',
      audience: 'https://example.com',
      subjects: [
        'repo:your-org/your-repo:ref:refs/heads/main',
        'repo:your-org/your-repo:ref:refs/tags/v*',
      ],
    },
  },
})
```

The `subjects` patterns name the runs that may call. A run's subject names its repository and its ref, so trust the default branch and, if releases check production, your release tags, and not the whole repository: `repo:your-org/your-repo:*` would let a workflow on any branch or pull request read these edits. All three leaves are required together, and each has an environment variable ([Configuration](/docs/configuration)). Nothing is stored: the token is short-lived, and the site finds the issuer's keys from the issuer you configured, never from the token. [Workload identity in the API reference](/docs/api) lists every check.

Any platform that issues OIDC identity tokens works the same way. For a single run by hand, sign in with `krantho auth login` and pull as yourself.

### Pull on a schedule

This workflow reads the changes every day and, when there are some, pushes a branch and opens an issue with the link that turns it into a pull request.

```yaml title=".github/workflows/pull-production-content.yml"
name: Pull production content
on:
  schedule:
    - cron: '17 5 * * *'
  workflow_dispatch:

permissions:
  contents: write
  issues: write
  id-token: write

env:
  SITE_URL: https://example.com

jobs:
  pull:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
      - uses: actions/setup-go@v6
        with:
          go-version-file: cli/go.mod
      - run: go build -C cli -o "$RUNNER_TEMP/krantho" ./cmd/krantho
      - name: Pull production edits to a branch
        run: |
          audience=$(jq -rn --arg a "$SITE_URL" '$a|@uri')
          token=$(curl -fsS -H "Authorization: bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" \
            "$ACTIONS_ID_TOKEN_REQUEST_URL&audience=$audience" | jq -r .value)
          echo "::add-mask::$token"
          git config user.name 'github-actions[bot]'
          git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
          KRANTHO_TOKEN="$token" "$RUNNER_TEMP/krantho" pull \
            --api-url "$SITE_URL" --content-dir content --push \
            --branch "prod-pull/$(date -u +%Y%m%d-%H%M%S)"
```

The workflow krantho.com runs also opens the issue and skips a run while an earlier pull still waits. Where your organisation lets Actions create pull requests, open the pull request directly with `gh pr create`.

## Pull by hand

```bash
export KRANTHO_API_URL=https://example.com
krantho pull --dry-run        # list the files, write nothing
krantho pull                  # branch prod-pull/<date and time>, one commit
git merge prod-pull/20261018-051700
```

| Option | Meaning |
|--------|---------|
| `--content-dir` | The content directory, relative to the repository root (default `content`) |
| `--branch` | The branch to create |
| `--base` | Start from this commit instead of the one production recorded |
| `--push` | Push the branch to `origin` |
| `--token` | A bearer token; the CLI also reads `KRANTHO_TOKEN`, then the session from `krantho auth login` |
| `--dry-run` | List the changes and write nothing |

The command works in a temporary worktree. Your working tree and your current branch stay as they are.

## Check before a release

Until the edits are merged, a release would leave them only in the database. Ask production before you deploy and stop when a change is not in the files you are about to release:

```bash
curl -fsS -H "Authorization: Bearer $TOKEN" "$SITE_URL/api/changes?limit=200" > changes.json
base=$(jq -r .baseline.commit changes.json)
jq -r '.changes[].path' changes.json | while read -r path; do
  git diff --quiet "$base" HEAD -- "content/$path" && echo "not in this release: $path"
done
```

A merged pull touches each of its files after the baseline commit, so the check passes once the branch is merged, before the deploy that imports it. A response with more than 200 items carries `next`; pass it as `cursor` for the next page.

## What a pull contains

- **Published content only.** A draft stays in the database until an editor publishes it, so a pull never publishes anything and never reads a draft out. A page an editor unpublished keeps the file the repository has.
- **The default locale.** Other locales stay in the database.
- **Added, edited and deleted documents.** A document an editor deleted comes back as a deleted file; one an editor created comes back as a new file named after its slug.
- **Files in krantho's format.** A pulled file is written in the same layout every time: frontmatter in the order of the collection's schema, then the body. A document you wrote by hand in another layout is reformatted in the pull when an editor has changed it.

## Limits

- A file you delete in the repository does not remove the document in production. Removal works through Studio.
- Only collections kept in files (those with a `directory`) take part.
- The list empties when the next deploy imports the merged files. Until then, a second pull lists the same edits again; merging it changes nothing.
- A release check stops the release when production does not answer (a server error or no connection). Set the check to warn, or off, to release anyway.
- A pull cut from a commit your clone does not have fails and says so. Fetch first.
