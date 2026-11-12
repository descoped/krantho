import type { ProjectOptions } from '../prompts.js'

export function generateContentFiles(options: ProjectOptions): Map<string, string> {
  const files = new Map<string, string>()

  // Globals (always created)
  files.set('content/globals/navigation.md', navigationContent(options))
  files.set('content/globals/footer.md', footerContent(options))

  if (options.sampleContent) {
    files.set('content/pages/home.md', homePageContent(options))
    files.set('content/pages/about.md', aboutPageContent())
  } else {
    // Minimal starter page
    files.set('content/pages/home.md', minimalHomeContent(options))
  }

  return files
}

function navigationContent(options: ProjectOptions): string {
  return `---
logo-name: ${options.name}
logo-subtitle: Built with krantho
nav-home: Home
nav-about: About
---
`
}

function footerContent(options: ProjectOptions): string {
  return `---
footer-title: ${options.name}
footer-description: A content-driven site powered by krantho.
footer-copyright-text: "\u00A9 ${new Date().getFullYear()} ${options.name}. All rights reserved."
---
`
}

function homePageContent(options: ProjectOptions): string {
  return `---
title: Welcome to ${options.name}
description: ${options.name} — a content-driven site built with krantho.
status: published
---

## Getting Started

This is your home page. Edit it in \`content/pages/home.md\` or use Studio at [/studio](/studio).

Krantho gives you:

- **Markdown content** with YAML frontmatter
- **Studio** for content management
- **API endpoints** for headless use
- **Schema validation** with Zod
- **SQLite persistence** with auto-import from markdown

## How It Works

Content lives in the \`content/\` directory as markdown files. The framework auto-imports these into a SQLite database on first run, then serves them through a REST API.

Studio at \`/studio\` provides a full editing experience with:

- Collection browsing and search
- Schema-driven form fields
- Split-view markdown editor
- Version history and restore
- Publishing workflow (draft/published/archived)

## Next Steps

1. Edit this page in Studio or in \`content/pages/home.md\`
2. Create new pages by adding markdown files to \`content/pages/\`
3. Define custom collections with Zod schemas
4. Customize the layout and components
`
}

function aboutPageContent(): string {
  return `---
title: About
description: Learn more about this project.
status: published
---

## Our Story

This is a sample about page. Replace this content with your own.

## What We Do

We build great things with krantho — a full-site content framework with Studio, API, and schema validation.
`
}

function minimalHomeContent(options: ProjectOptions): string {
  return `---
title: ${options.name}
description: Welcome to ${options.name}.
status: published
---

## Welcome

Your krantho site is ready. Edit this page or create new content.
`
}
