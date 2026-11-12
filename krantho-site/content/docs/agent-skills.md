---
title: Agent skills
description: The krantho plugin for Claude Code — what its skills do, how to install them, and how they follow krantho releases.
area: skills
order: 10
level: beginner
stacks: [next, sveltekit, express]
prerequisites: [project-status]
related: [installation, content-model, content-authoring, add-seo]
status: published
---

The krantho plugin for Claude Code gives your coding agent krantho's own guidance. With it, the agent adds krantho to a project, designs content templates and the pages that render them, writes content and sets up SEO the way krantho expects — from the code of the release the plugin targets, not from a guess at an API it has not seen.

> [!NOTE]
> The plugin is distributed from the `descoped/krantho` repository on GitHub. The krantho packages are not on npm yet: the skills say so whenever they show an install command, and point to [Project status](/docs/project-status) for running krantho from source.

## What the plugin gives your agent

The plugin, named `krantho`, holds five skills. Each is a set of instructions with reference files the agent reads when a task needs them. Claude Code loads a skill on its own when your request matches it; you can also call one by name, such as `/krantho:seo`.

The skills describe krantho as a library, for any site built with it. They hold no data and run nothing on their own: the agent works in your project, through the same files, API and Studio you use, and you review what it changes.

## Install

In Claude Code, add the marketplace and install the plugin from it:

{{sample:plugin-install}}

The first command registers the marketplace named `krantho` from the GitHub repository. Claude Code clones it with the git credentials on your machine, so your account needs read access to the repository. The second installs the plugin `krantho` from that marketplace.

To give everyone who works on a project the plugin, register the marketplace and enable the plugin in the project's `.claude/settings.json`. Claude Code applies it once each person trusts the project folder:

```json title=".claude/settings.json"
{
  "extraKnownMarketplaces": {
    "krantho": { "source": { "source": "github", "repo": "descoped/krantho" } }
  },
  "enabledPlugins": { "krantho@krantho": true }
}
```

Projects created with `create-krantho` will include these settings.

## The skills

### start

Adds krantho to a new or existing Next.js, SvelteKit or Express/Vite project: the packages, `krantho.config.ts`, `krantho.collections.ts`, the API and Studio routes, the content loader pages read through, persistence (SQLite by default, Postgres), the media store, page caching (`none`, `next-isr` or `cdn`) and deployment. It carries one reference per framework, grounded in the example apps, and one for hosting.

> Add krantho to this Next.js app. Keep my existing pages, and make the blog posts in `posts/` editable in Studio.

### site-design

Website practice for pages rendered from krantho content, with any UI package: landing page structure, flat navigation, a token design system with system, light and dark themes applied before first paint, WCAG 2.2 AA accessibility, Core Web Vitals budgets and motion that respects reduced-motion settings. It explains why a cached page must apply each visitor's theme in the browser: the same HTML is served to everyone.

> Give the site a light and dark theme with a switch in the header, without a flash on load.

### content-model

Designs content templates and page templates together: which collections a site needs, their schemas (the forms in `/studio`), fields versus body and `##` sections, globals, singletons and list → detail collections, reference and media pickers, localization and SEO fields — and the page template for each, in the cached route shape. It ships starter templates for a landing page, features, docs pages, code snippets, FAQ, glossary and release notes, with no site-specific content.

> We need a changelog and a docs section. Propose the collections and the page templates before writing code.

### content

Creates and edits content through markdown files, Studio or the REST API: drafts and the published version, publishing, preview, version history and restore, and how files reach the database — imported into an empty database, and later only through a content manifest. It includes the API calls and authentication for scripted changes.

> Write three FAQ entries about hosting as drafts, and link each to the Deploy to Vercel docs page.

### seo

Sets up structured data with krantho's archetypes — site, collection, route and document scopes — from the `seo` section of `krantho.config.ts` or a `krantho.seo` directory; renders meta tags and JSON-LD with `resolveSeoContent` and `SeoJsonLd`; serves the sitemap, robots.txt and `llms.txt`; validates rich result eligibility; and runs enrichment through `@krantho/ai`. The default provider is Anthropic with `claude-haiku-4-5`; OpenAI, Gemini, OpenRouter and Ollama also work. During development, the `claude-code` provider runs enrichment on a Claude subscription token (`KRANTHO_LLM_CLAUDE_CODE_OAUTH_TOKEN`), with Haiku only; deployments use an API key, one per provider (`KRANTHO_LLM_ANTHROPIC_API_KEY` for Anthropic).

> Mark up the docs collection as Article with breadcrumbs, check which properties Google needs, and fill the missing meta descriptions.

## How the skills follow krantho versions

- The plugin's version is the krantho release it describes. It starts at `0.1.0`, the version of the packages today.
- Each skill states the krantho range it targets in its `compatibility` field, and links to the matching page of this documentation for depth.
- Claude Code keeps you on the installed version until the plugin's version changes. After a krantho release, update with `/plugin marketplace update krantho`.
- The skills and these docs are written from the same code. When they disagree, the code in `packages/*/src` is right, and the difference is a bug worth reporting.

## Using the skills elsewhere

The skills use only the Agent Skills frontmatter fields, so other tools that read that format can load them. They are written and tested for Claude Code; other agents are not tested.

## Status

- The packages are not on npm. The `start` skill installs from a local build of krantho meanwhile — see [Project status](/docs/project-status).
- The skills describe krantho's code as it is today, and change with it until the first release.
