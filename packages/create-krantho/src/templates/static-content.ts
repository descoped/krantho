import type { PackageManager, ProjectOptions } from '../prompts.js'

/** The static docs site's starter pages, its README and the GitHub Pages workflow */
export function generateStaticContentFiles(options: ProjectOptions): Map<string, string> {
  return new Map([
    ['content/docs/index.md', indexPage(options)],
    ['content/docs/writing.md', writingPage()],
    ['content/docs/publishing.md', publishingPage()],
    ['README.md', readme(options)],
    ['.github/workflows/pages.yml', pagesWorkflow(options.packageManager)],
  ])
}

function indexPage(options: ProjectOptions): string {
  return `---
title: ${options.name}
description: Documentation for ${options.name}.
---

Welcome. This site is written in markdown in \`content/docs\` and published as static files.

- [How to write a page](/writing/): add a file, and it gets a page and a place in the sidebar.
- [Publish the site](/publishing/): every push to main publishes it to GitHub Pages.
`
}

function writingPage(): string {
  return `---
title: Write a page
description: Add a markdown file to content/docs, and it becomes a page.
group: Guide
order: 1
---

Each file in \`content/docs\` is a page, served at its file name: \`writing.md\` is \`/writing/\`.

## Frontmatter

- \`title\` and \`description\` head the page and its search result.
- \`group\` puts the page under a heading in the sidebar, and \`order\` sets its place there.
- \`status: draft\` keeps a page off the site until you remove it.

## Links and images

Link to another page from the site's root, \`[Publish the site](/publishing/)\`, and put images in
\`public/\`: \`![Diagram](/diagram.png)\`. They work at your own domain and under a GitHub Pages
project path alike.
`
}

function publishingPage(): string {
  return `---
title: Publish the site
description: Every push to main builds the site and publishes it to GitHub Pages.
group: Guide
order: 2
---

\`.github/workflows/pages.yml\` builds the site to \`out/\` and deploys it to GitHub Pages.

## Turn on GitHub Pages once

In the repository's **Settings → Pages**, set **Source** to **GitHub Actions**. The next push to main
publishes the site at \`https://<owner>.github.io/<repository>/\`.

## A domain of your own

Set it under **Settings → Pages → Custom domain**, and point the domain at GitHub Pages. The next
build publishes the site at the domain's root.

## Dates and the sitemap

Each page is dated by its file's last commit, which the sitemap and the structured data carry. The
workflow checks out the whole history for that.
`
}

function readme(options: ProjectOptions): string {
  const run = options.packageManager === 'npm' ? 'npm run' : options.packageManager
  return `# ${options.name}

A documentation site built with [krantho](https://krantho.com) and Next.js. The pages are markdown
files in \`content/docs\`; \`${run} build\` writes the whole site to \`out/\` as static files.

## Write

\`\`\`bash
${run} dev
\`\`\`

Open [http://localhost:${options.port}](http://localhost:${options.port}). Add or edit a file in
\`content/docs\`, and the page updates.

## Publish to GitHub Pages

1. Push the project to a GitHub repository.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.

Every push to main then builds the site and publishes it (\`.github/workflows/pages.yml\`), at
\`https://<owner>.github.io/<repository>/\`, or at the custom domain set in **Settings → Pages**.
The site's address comes from Pages, so the same project works under either.

## Structure

\`\`\`
content/docs/           # one markdown file per page; index.md is the home page
app/                    # the layout, the pages, sitemap.xml, llms.txt and robots.txt
components/doc-page.tsx # how a docs page renders
lib/krantho.ts          # the site's content loader
krantho.config.ts       # the site's name, address and structured data
krantho.collections.ts  # the fields each page has
\`\`\`
`
}

/** How the workflow sets up and runs each package manager */
const MANAGERS: Record<
  PackageManager,
  { setup: string; cache: string; install: string; build: string }
> = {
  pnpm: {
    setup: '      - uses: pnpm/action-setup@v6\n',
    cache: 'pnpm',
    install: 'pnpm install --frozen-lockfile',
    build: 'pnpm run build',
  },
  npm: { setup: '', cache: 'npm', install: 'npm ci', build: 'npm run build' },
  yarn: {
    setup: '',
    cache: 'yarn',
    install: 'yarn install --frozen-lockfile',
    build: 'yarn build',
  },
}

function pagesWorkflow(manager: PackageManager): string {
  const pm = MANAGERS[manager]
  return `name: Deploy to GitHub Pages

# Builds the site to static files and publishes it to GitHub Pages on every push
# to main. Turn Pages on once: Settings → Pages → Source: GitHub Actions.
on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

# One deployment at a time, and one that has started always finishes
concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          # The whole history: each page is dated by its file's last commit
          fetch-depth: 0
${pm.setup}      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: ${pm.cache}
      - run: ${pm.install}
      - id: pages
        uses: actions/configure-pages@v6
      - run: ${pm.build}
        env:
          # Where Pages serves the site: https://<owner>.github.io/<repository>, or the custom domain
          KRANTHO_SITE_BASE_URL: \${{ steps.pages.outputs.base_url }}
      - uses: actions/upload-pages-artifact@v5
        with:
          path: out

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v5
`
}
