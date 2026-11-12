# krantho plugin for Claude Code

Agent skills for building a content site with krantho — a CMS library that adds content
management, an admin and structured SEO to a Next.js, SvelteKit or Express/Vite app.

The skills teach a coding agent how krantho works, grounded in the code of the release they
target, so it can wire krantho into your project, design your content templates and the pages
that render them, write content, and set up SEO.

| Skill | Invoke | Use it to |
|---|---|---|
| `start` | `/krantho:start` | Add krantho to a new or existing project: configuration, collections, API and Studio routes, the page loader, persistence, media, page caching, deployment |
| `site-design` | `/krantho:site-design` | Design the site itself: page structure, navigation, a token design system with light and dark themes, accessibility, performance, motion |
| `content-model` | `/krantho:content-model` | Design content templates (collections, which are Studio's forms) together with the page templates that render them |
| `content` | `/krantho:content` | Create and edit content in markdown files, Studio or the REST API; drafts, publishing, preview and history |
| `seo` | `/krantho:seo` | Configure Schema.org archetypes, render meta tags and JSON-LD, validate, enrich with a language model, serve `llms.txt` |

Claude also picks a skill on its own when your request matches its description.

## Install

In Claude Code:

```text
/plugin marketplace add descoped/krantho
/plugin install krantho@krantho
```

The marketplace lives in the `descoped/krantho` GitHub repository, so adding it needs read
access to that repository. The repository is private while krantho is in active development:
for now only its collaborators can add the marketplace.

A project can register the marketplace for everyone who opens it, in `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "krantho": { "source": { "source": "github", "repo": "descoped/krantho" } }
  },
  "enabledPlugins": { "krantho@krantho": true }
}
```

## Status

krantho is in active development. Its packages are not published to npm yet, so the install
commands the skills show are the ones the first release will use. The `start` skill says how to
run krantho from source meanwhile; see also https://krantho.com/docs/project-status.

## Versions

The plugin version follows the krantho release it describes, and each skill states the range
it targets in its `compatibility` field. Documentation: https://krantho.com/docs/agent-skills.
