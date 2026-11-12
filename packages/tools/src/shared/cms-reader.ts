/**
 * Shared CMS content reader/writer for build-time tools.
 *
 * Uses gray-matter for reading and the yaml package for writing,
 * matching the CMS Studio module's serialization format (single quotes,
 * no line wrapping, preserved YAML comments).
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import matter from 'gray-matter'
import { basename, join } from 'path'
import { parse as parseYAML, stringify as stringifyYAML } from 'yaml'
import { toolPaths } from './tool-paths'
import { YAML_WRITE_OPTIONS } from './yaml-utils'

export type Frontmatter = Record<string, unknown>

export interface CMSContent {
  frontmatter: Frontmatter
  content: string
}

/** Read a CMS content file by slug */
export function readCMSContent(slug: string): CMSContent {
  const filePath = join(toolPaths().pagesDir, `${slug}.md`)
  const raw = readFileSync(filePath, 'utf-8')
  const { data, content } = matter(raw)
  return { frontmatter: data as Frontmatter, content }
}

/** List all CMS content slugs */
export function listCMSSlugs(): string[] {
  return readdirSync(toolPaths().pagesDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => basename(f, '.md'))
}

/** Extract leading YAML comment lines from a content file */
function extractYamlComments(filePath: string): string {
  if (!existsSync(filePath)) return ''
  const existing = readFileSync(filePath, 'utf-8')
  const yamlMatch = existing.match(/^---\n([\s\S]*?)---/)
  if (!yamlMatch) return ''

  const yamlContent = yamlMatch[1]
  if (!yamlContent) return ''
  const commentLines: string[] = []
  for (const line of yamlContent.split('\n')) {
    if (line.startsWith('#')) {
      commentLines.push(line)
    } else {
      break
    }
  }
  return commentLines.length > 0 ? commentLines.join('\n') + '\n' : ''
}

/**
 * Update a single frontmatter field in a CMS content file.
 *
 * Uses the same serialization as the CMS Studio module:
 * - Single quotes for string values
 * - No line wrapping
 * - Preserves YAML comment lines
 */
export function updateFrontmatterField(slug: string, key: string, value: string): void {
  const filePath = join(toolPaths().pagesDir, `${slug}.md`)
  const raw = readFileSync(filePath, 'utf-8')
  const { data, content } = matter(raw)

  // Update the field
  data[key] = value

  // Preserve YAML comments and use same format as CMS Studio
  const yamlComments = extractYamlComments(filePath)
  const yamlBlock = stringifyYAML(data, YAML_WRITE_OPTIONS)

  // Rebuild the file matching CMS Studio format
  const rawContent = content.trim()
  const output = rawContent
    ? `---\n${yamlComments}${yamlBlock}---\n\n${rawContent}\n`
    : `---\n${yamlComments}${yamlBlock}---\n`

  writeFileSync(filePath, output)
}

/** Read a YAML file from the project's SEO directory */
export function readYAML<T>(filename: string): T {
  const filePath = join(toolPaths().seoDir, filename)
  const raw = readFileSync(filePath, 'utf-8')
  return parseYAML(raw) as T
}
