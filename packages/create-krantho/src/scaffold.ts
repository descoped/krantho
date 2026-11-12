import type { ProjectOptions } from './prompts.js'
import { generateCommonFiles } from './templates/common.js'
import { generateContentFiles } from './templates/content.js'
import { generateNextjsFiles } from './templates/nextjs.js'
import { generateSveltekitFiles } from './templates/sveltekit.js'

export function generateFiles(options: ProjectOptions): Map<string, string> {
  const files = new Map<string, string>()

  // Common files (gitignore, tsconfig, env, README)
  for (const [path, content] of generateCommonFiles(options)) {
    files.set(path, content)
  }

  // Content files (pages, globals)
  for (const [path, content] of generateContentFiles(options)) {
    files.set(path, content)
  }

  // Framework-specific files
  const frameworkFiles =
    options.framework === 'nextjs' ? generateNextjsFiles(options) : generateSveltekitFiles(options)

  for (const [path, content] of frameworkFiles) {
    files.set(path, content)
  }

  return files
}
