/**
 * Where the build-time pipeline reads and writes.
 *
 * Every path hangs off the resolved configuration's `paths` section, so a script
 * pointed at another project with `--root` reads that project's content and
 * writes that project's generated files. A caller that never resolves a
 * configuration — a unit test, or a mapper used programmatically — gets the
 * working directory.
 */

import { join } from 'node:path'
import type { KranthoConfig } from '@krantho/config'

export interface ToolPaths {
  /** Content root, the parent of the collection directories */
  contentDir: string
  /** Markdown pages the enrichment scripts read and write */
  pagesDir: string
  /** SEO inputs: business.yaml, guardrails.yaml, site-config.json */
  seoDir: string
  /** Deterministic pipeline output */
  generatedDir: string
}

function fromContentDir(contentDir: string): ToolPaths {
  return {
    contentDir,
    pagesDir: join(contentDir, 'pages'),
    seoDir: join(contentDir, 'seo'),
    generatedDir: join(contentDir, 'seo', 'generated'),
  }
}

let current: ToolPaths = fromContentDir(join(process.cwd(), 'content'))

/** Point the pipeline at a resolved project. Call once, before any read or write. */
export function setToolPaths(config: KranthoConfig): ToolPaths {
  current = {
    ...fromContentDir(config.paths.contentDir),
    generatedDir: config.paths.seoGeneratedDir,
  }
  return current
}

/** The paths in force. */
export function toolPaths(): ToolPaths {
  return current
}
