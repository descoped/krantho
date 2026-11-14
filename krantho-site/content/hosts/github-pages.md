---
title: GitHub Pages
description: Build a krantho site from the markdown in your repository to static files and publish it to GitHub Pages, with its structured data, sitemap and llms.txt. No database, API or Studio.
kind: platform
cache-strategy: none
frameworks:
  - Next.js
databases:
  - Markdown files
order: 5
docs-page: deploy-github-pages
status: published
---

A static krantho site is the markdown in your repository, built to plain files by Next.js and published to GitHub Pages by a workflow. It suits project documentation and other sites whose authors work in the repository: you edit the markdown and push. There is no database, API or Studio, so a site whose editors work in a browser needs one of the other hosts.

It can publish a repository's existing `docs/` folder as it is, with `README.md` as the home page and the links between files working on GitHub and on the site alike. The [dedupd](https://github.com/descoped/dedupd) repository is an example: its site lives in `site/` and reads `docs/`.

## Set up

- **Create the site.** `pnpm create krantho my-docs` and choose **Static site (Next.js, GitHub Pages)**. The project holds the pages, the configuration and the workflow.
- **Turn on Pages.** In the repository's **Settings → Pages**, set **Source** to **GitHub Actions**.
- **Push.** Every push to `main` builds the site and publishes it at `https://<owner>.github.io/<repository>/`.

## Configure

```bash
KRANTHO_SITE_BASE_URL=https://<owner>.github.io/<repository>   # set by the workflow
```

The workflow takes the address from `actions/configure-pages`, so the site's links, canonical URLs and sitemap name the address Pages serves it at, under the repository's path or at a domain of your own.

## Cache

Every page is written once, at build time. GitHub Pages serves the files from its CDN, and a push publishes a new build.

## Verify

- The workflow's deploy job links to the published site.
- `/<repository>/sitemap.xml` and `/<repository>/llms.txt` list every published page.
- A page's source holds its JSON-LD in a `<script type="application/ld+json">`.
