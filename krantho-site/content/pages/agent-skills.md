---
title: 'Agent skills for Claude Code'
description: 'The krantho plugin for Claude Code gives your coding agent krantho''s own guidance for setup, content models, page templates, content and SEO.'
eyebrow: 'Agent skills'
status: published
---

Coding agents are good at code they have seen before. Krantho is new, so an agent without guidance guesses: an outdated import, an invented option, a route shape that breaks page caching. The krantho plugin for Claude Code gives the agent the same guidance this documentation gives you, written against the krantho version it names.

## Add the plugin

In Claude Code, add the krantho marketplace and install the plugin from it:

{{sample:plugin-install}}

> [!NOTE]
> The plugin is distributed from the krantho repository on GitHub.

A project created with `create-krantho` prepares this for you: its `.claude/settings.json` registers the marketplace and turns the plugin on. Claude Code reads it once you trust the folder, and each person installs the plugin on their own machine the first time.

## The skills

Skills load when a task calls for them. You can also ask for one by name, such as `/krantho:content-model`.

### start

Adds krantho to a new or existing Next.js, SvelteKit or Express project: the packages, `krantho.config.ts`, collections, the API and Studio routes, the content loader, the database, the media store, page caching and deployment.

### site-design

Builds a site's pages from krantho content with any UI package: page structure, flat navigation, light and dark themes applied without a flash, accessibility and performance budgets.

### content-model

Designs the content templates and the page templates that render them, together: which collections a site needs, their schemas, fields and sections, globals, references, localization, and media and SEO fields.

### content

Creates and edits content through files, the API or Studio: drafts and publishing, preview, and writing to a template's fields and sections.

### seo

Sets up structured data: the Schema.org archetypes at each scope, the `seo` section of the configuration, validation, and enrichment through `@krantho/ai` with whichever provider and credential the project has.

## What to expect

Here is how a session can go. You start from an empty Next.js app and ask the agent to add krantho with a pages collection and a list of features, each with a page of its own. The `start` skill adds the packages (from a local build of krantho until it is on npm), writes the configuration, collections and routes, and wires the loader in the shape the examples use. The `content-model` skill proposes the schemas and page templates, and you adjust them before any code is written. You finish by opening `/studio`, where the forms match the schemas.

The agent still makes mistakes, and you still review its work. The skills make it start from krantho's conventions rather than from a guess.

## Scope

The plugin holds guidance about krantho as a library, for any site built with it. It does not contain krantho.com's own design or content, and it holds no data of its own: the skills work in your project, through the same files, API and Studio you use.

Read [the agent skills documentation](/docs/agent-skills) for installation details and how the skills are versioned.
