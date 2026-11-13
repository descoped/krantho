import type { ProjectOptions } from '../prompts.js'

export function generateCommonFiles(options: ProjectOptions): Map<string, string> {
  const files = new Map<string, string>()

  files.set('.gitignore', gitignore())
  files.set('.env', envFile(options))
  files.set('README.md', readme(options))
  files.set('.claude/settings.json', claudeSettings())
  if (options.packageManager === 'pnpm') files.set('pnpm-workspace.yaml', pnpmSettings())

  return files
}

function gitignore(): string {
  return `node_modules/
dist/
.next/
.svelte-kit/
.krantho/
.env.local
*.db
*.db-journal
`
}

/**
 * pnpm runs no dependency's install step until the project allows it, and the
 * default SQLite store needs better-sqlite3's native binary. pnpm 10 reads
 * `onlyBuiltDependencies`, pnpm 11 and later `allowBuilds`; each ignores the other.
 */
function pnpmSettings(): string {
  return `onlyBuiltDependencies:
  - better-sqlite3
allowBuilds:
  better-sqlite3: true
`
}

/** The GitHub repository that hosts the krantho plugin marketplace. */
const KRANTHO_MARKETPLACE_REPO = 'descoped/krantho'

/**
 * Shared Claude Code project settings. Registering the krantho marketplace and
 * enabling its plugin here means every Claude Code session opened in the new
 * project has the krantho skills from the start. Claude Code honors
 * `extraKnownMarketplaces` from a project file only after the folder is trusted.
 */
function claudeSettings(): string {
  const settings = {
    extraKnownMarketplaces: {
      krantho: {
        source: { source: 'github', repo: KRANTHO_MARKETPLACE_REPO },
      },
    },
    enabledPlugins: {
      'krantho@krantho': true,
    },
  }
  return `${JSON.stringify(settings, null, 2)}\n`
}

function envFile(options: ProjectOptions): string {
  const lines = [`# Krantho configuration`, `PORT=${options.port}`]

  if (options.auth) {
    lines.push('')
    lines.push('# Auth — token mode is set in krantho.config.ts')
    lines.push('# Set a secret token for Studio access')
    lines.push('KRANTHO_API_TOKEN=change-me-to-a-secret')
  }

  return lines.join('\n') + '\n'
}

function readme(options: ProjectOptions): string {
  const fw = options.framework === 'nextjs' ? 'Next.js' : 'SvelteKit'
  const pm = options.packageManager
  return `# ${options.name}

Built with [krantho](https://github.com/descoped/krantho) and ${fw}.

## Getting Started

\`\`\`bash
${pm} run dev
\`\`\`

Open [http://localhost:${options.port}](http://localhost:${options.port}) to see your site.

## Studio

Open [http://localhost:${options.port}/studio](http://localhost:${options.port}/studio) to manage content.

## Project Structure

\`\`\`
content/           # Markdown content files
  pages/           # Page content (frontmatter + markdown body)
  globals/         # Site-wide data (navigation, footer)
${options.framework === 'nextjs' ? 'app/               # Next.js App Router pages' : 'src/routes/        # SvelteKit route pages'}
${options.framework === 'nextjs' ? 'lib/               # Krantho initialization' : 'src/lib/           # Krantho initialization'}
\`\`\`

## Content

Edit markdown files in \`content/\` or use Studio.

Each page has YAML frontmatter (metadata) and a markdown body:

\`\`\`markdown
---
title: My Page
description: A brief description
status: published
---

## Section Heading

Page content here...
\`\`\`
`
}
