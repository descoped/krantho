---
name: dev-docs
description: >
  Writes and maintains developer documentation for the krantho project.
  Covers per-package API docs and cross-cutting guides (architecture,
  getting started, content authoring, SEO pipeline, persistence).
  Use whenever the user wants to create docs, update documentation,
  write architecture docs, create guides, or says "write docs for",
  "document this package", "architecture doc", "getting started guide",
  "update the docs". Also trigger after significant changes to a package.
  Package docs go to docs/<package>.md. Guides go to docs/guides/<topic>.md.
---

# Developer Documentation Skill

Write structured developer documentation for the krantho project. Two doc types:

| Type | Location | Template |
|------|----------|----------|
| Package doc | `docs/<package-name>.md` | `references/package-template.md` |
| Guide | `docs/guides/<topic>.md` | `references/<topic>.md` |

## Workflow

1. **Determine doc type** — package doc or guide?
2. **Read the reference template** from `references/` for the doc type
3. **Read the source code** — never guess APIs, imports, or types
4. **Write the doc** following the template structure
5. **Verify accuracy** — every import, type signature, and code example must match source

## Which template to use

| User asks for | Read this reference |
|---------------|-------------------|
| Package docs ("document @krantho/core") | `references/package-template.md` |
| Architecture overview | `references/architecture-guide.md` |
| Getting started guide | `references/getting-started-guide.md` |
| Content authoring guide | `references/content-authoring-guide.md` |
| SEO pipeline guide | `references/seo-pipeline-guide.md` |
| Persistence guide | `references/persistence-guide.md` |

## Writing rules

- **Voice:** Direct, technical, concise. Written for senior developers.
- **Code examples:** TypeScript. Import from `@krantho/<name>`. Self-contained and correct.
- **Accuracy over completeness:** Read the source. Don't guess APIs.
- **No duplication:** Cross-reference other docs, don't repeat their content.
- **Keep current:** Code is truth. Docs follow code.

## User docs

`docs/` is for people building krantho. People who use krantho read the Krantho Developer
Documentation at krantho.com/docs — `krantho-site/content/docs/`, written with the `docs` skill.
A change users can see (an API, an option, a default, a command) also updates the matching user
page there, usually `package-<name>.md` or the guide that covers it.
