---
title: 'Krantho — a CMS library for sites built in your own codebase'
description: 'Krantho adds content management, an admin and structured SEO to your Next.js, SvelteKit or Express app, on the host and database you already use.'
eyebrow: 'A CMS library for Next.js, SvelteKit and Express'
headline: 'Content management that lives in your codebase'
subline: 'Define your content in TypeScript, render it with your own components, and give editors an admin at /studio. It runs inside your app, on your host and your database.'
primary-label: 'Read the introduction'
primary-href: /docs/introduction
secondary-label: 'See what it does'
secondary-href: /features
hero-sample: config
status: published
---

## Install

Krantho is on npm. Start a new project, or add it to the one you have.

### Add the krantho skills to Claude Code

The krantho plugin gives your coding agent skills to add krantho to a project, design content and page templates, write content and set up structured SEO.

{{sample:plugin-install}}

### Add krantho to your app

One command installs krantho for your framework. To start a new project instead, run `npx create-krantho my-site`.

{{sample:install}}

## Problem

You build content sites in Next.js, SvelteKit or Express. The code is yours, but the words on the pages belong to other people, and they need to change them without waiting for your next deploy.

The usual answer is a hosted CMS beside the app: another service to integrate, another bill, another login for editors, and your content in someone else's database, one network request away from your pages. The other answer is markdown in the repository, which works until the first editor who does not use git. Structured data for search engines waits for later, and later seldom comes.

## How it works

### Define your content

A collection is a Zod schema in `krantho.collections.ts`. The schema types your pages, validates every save, and becomes the form editors fill in Studio. Markdown files with frontmatter seed each collection on first boot.

{{sample:collections}}

### Write your content

Each document follows its collection's schema: fields in the frontmatter, and a markdown body whose `##` headings become sections. You write the first documents as files in your repository. Once the site runs, editors write them in Studio, in the form the schema generates.

{{sample:write-content}}

### Wire it into your app

One route serves the krantho API and one serves Studio, in the framework you already use. Configuration lives in `krantho.config.ts` and the environment. SQLite is the default database; Postgres is the production one.

{{sample:api-route}}

### Render your pages

Your page templates read the published version of each document in-process, through the content loader, with no request to your own API. Meta tags and JSON-LD come from the same content. With page caching on, a page stays cached until an editor changes something it shows.

{{sample:render-page}}

### Bring the edits home

Content moves both ways between your repository and your database. Export what editors have written back to markdown files and commit them, so content is reviewed and versioned with the code. A deploy built with a content manifest imports the new and changed files. A document an editor has changed since keeps the editor's version, the clash is recorded as a conflict, and the database gets a checkpoint before anything is imported.

{{diagram:content-lifecycle}}

```sh title="Terminal"
krantho export pages --out content/pages
git add content/pages
git commit -m "content: the editors' changes"
```

## For editors

Editors work in one Studio, the same for every framework, served by your app at `/studio`.

- **Forms from your schemas.** Text, selects, dates, tags, references to other documents and media pickers, all generated from the collection's schema.
- **Drafts and publishing.** Saving leaves the live page as it is. Publish makes the new version live.
- **Preview on the site.** Where the site turns it on, an editor opens a draft on its real page before publishing it.
- **Version history.** Every save is a version, with a diff view and restore.
- **Media.** A library with folders, tags, alt text, cropping and hotspots.
- **SEO tools.** Site identity, Schema.org types per collection, a JSON-LD graph browser for each document, search and social previews, and AI enrichment on request.
- **An assistant, when you turn it on.** A chat in Studio that finds, drafts and improves content and SEO on the language model you choose. It saves drafts, and waits for your confirmation before it publishes or replaces anything.
- **Sign-in and roles.** An access token or any OIDC provider, with Studio, editor and viewer roles.

## Fit

### Krantho fits when

- You build the site yourself in Next.js, SvelteKit or Express with Vite, and want the CMS inside the same codebase.
- Editors need to change text, pages and media without a deploy.
- You want to choose the host, database, CDN and media store, and be able to change them later through configuration.
- Structured data matters for how search engines and AI assistants read your site.
- Your content fits collections of documents: fields, plus a markdown body with sections.

### It is not the right fit when

- You want a page builder or a visual site designer. In krantho, editors change content; layout is code.
- You want a hosted service that someone else runs. Krantho runs inside your app, on your infrastructure.
- Editors must change a site that is served as static files. The API and Studio need a Node.js server runtime; a static build, such as project docs on GitHub Pages, is edited in the repository.
- Your frontend is built on a framework krantho has no adapter for.

## Get started

The documentation starts with what krantho is and walks you through a first page on your stack.
