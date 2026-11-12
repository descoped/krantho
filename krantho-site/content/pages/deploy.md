---
title: 'Deploy'
description: 'Where a krantho site can run: hosts, CDNs, databases and media stores side by side, with the page cache strategy each combination uses.'
eyebrow: 'Deploy'
status: published
---

Krantho runs inside your app, so it goes wherever your app goes. The hosts, CDNs, databases and media stores below are alternatives, listed in no preferred order. Each page shows how to set one up, the configuration it needs, how pages are cached there, and how to check that it works.

## Content between deploys

Editors change content on the live site, and developers change it in the repository. Krantho moves it both ways, on every host on this page. On Vercel, for example, Studio writes to the site's Postgres database. When you want the editors' work in git, `krantho export` pulls it from the production API as markdown files, and you commit and push them.

The push builds a new deployment, and the build writes a content manifest ([Ship content file changes with a deploy](/docs/package-server#ship-content-file-changes-with-a-deploy)). When the deployment starts, the server compares each file with its document. New and changed files are imported. A document an editor has changed since keeps the editor's version, and the clash is recorded as a conflict. A checkpoint is taken before anything is imported. [Deploy to Vercel](/docs/deploy-vercel) has the full setup.

{{diagram:content-on-vercel}}

```sh title="Terminal"
export KRANTHO_API_URL=https://example.com
krantho auth login --token "$KRANTHO_API_TOKEN"
krantho export pages --out content/pages
git add content/pages
git commit -m "content: the editors' changes"
git push
```
