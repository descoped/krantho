---
title: 'Agent skills'
description: 'A Claude Code plugin that teaches your coding agent how to build with krantho: setup, content models, page templates, content and SEO.'
benefit: 'Your coding agent works from krantho''s own guidance instead of guessing at an API it has not seen.'
order: 9
icon: skills
proof-sample: plugin-install
docs-page: agent-skills
status: published
---

## Problem

Coding agents write code from what they have seen before. A library in active development is mostly new to them, so they guess: an outdated import, an invented option, a route shape that breaks page caching. You then spend the time you hoped to save correcting it.

## Approach

Krantho ships a plugin for Claude Code, named `krantho`, with skills that load when the task calls for them. Each skill is written against the krantho version it names, and points to the matching page of this documentation for depth.

- **start** — adds krantho to a new or existing Next.js, SvelteKit or Express project: packages, configuration, collections, the API and Studio routes, the loader, the database, media, page caching and deployment.
- **site-design** — builds pages from krantho content with any UI package: page structure, navigation, light and dark themes without a flash, accessibility and performance.
- **content-model** — designs collections and the page templates that render them together: schemas, fields and sections, globals, references, localization, media and SEO fields.
- **content** — creates and edits content through files, the API or Studio: drafts and publishing, preview, and writing to a template's fields and sections.
- **seo** — configures Schema.org archetypes, validates structured data, and runs enrichment through `@krantho/ai` on the provider the project uses.

The plugin holds guidance about krantho as a library. It carries nothing specific to any one site.

## Proof

Adding the plugin takes two commands in Claude Code: one adds the krantho marketplace, the other installs the plugin from it. Skills are namespaced by the plugin, so you can also ask for one by name, such as `/krantho:seo`.

A project created with `create-krantho` registers the marketplace and turns the plugin on in its `.claude/settings.json`. Once you trust the folder and install the plugin the first time, sessions in that project start with the krantho skills.

## Limits

- The skills are written for Claude Code. They follow the Agent Skills format, but other agents are not tested.
- A skill is only as current as the krantho version it names. Update the plugin when you update krantho.
