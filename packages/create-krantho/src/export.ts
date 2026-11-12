#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/**
 * Simple YAML serializer for frontmatter (flat key-value only).
 * Values are JSON.stringify'd, which handles quoting and escaping for strings.
 * Limitation: nested objects/arrays are serialized as inline JSON, not block YAML.
 */
function toYaml(data: Record<string, unknown>): string {
  return Object.entries(data)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join('\n')
}

interface ExportBundle {
  version: number
  timestamp: string
  content: Record<
    string,
    Record<
      string,
      { fields: Record<string, unknown>; body: string; status: string; locale: string }
    >
  >
  media: { items: unknown[] }
  schemas: Record<string, unknown[]>
  checksums: Record<string, string>
}

interface ExportArgs {
  baseUrl: string
  outputDir: string
}

/**
 * Parse CLI arguments, exiting with a usage message when required options are
 * missing. Keeping argument parsing out of `main()` shrinks main's mixed
 * responsibility list and makes arg validation testable in isolation.
 */
function parseExportArgs(args: readonly string[]): ExportArgs {
  const urlIndex = args.indexOf('--url')
  const outputIndex = args.indexOf('--output')

  const baseUrl = urlIndex >= 0 ? args[urlIndex + 1] : 'http://localhost:4002'
  const outputDir = outputIndex >= 0 ? args[outputIndex + 1] : './export-bundle'

  if (!baseUrl || !outputDir) {
    console.error('Usage: krantho-export --url <server-url> --output <directory>')
    process.exit(1)
  }

  return { baseUrl, outputDir }
}

/** Fetch the export bundle from the running krantho server. Exits on failure. */
async function fetchBundle(baseUrl: string): Promise<ExportBundle> {
  const res = await fetch(`${baseUrl}/api/export/bundle`)
  if (!res.ok) {
    console.error(`Export failed: ${res.status} ${res.statusText}`)
    const body = await res.text()
    console.error(body)
    process.exit(1)
  }
  return (await res.json()) as ExportBundle
}

/**
 * Write the content items from a bundle as `.md` files with reconstructed
 * YAML frontmatter. Each item lands at `{outputDir}/content/{collection}/{slug}.md`.
 */
async function writeExportedContent(outputDir: string, bundle: ExportBundle): Promise<void> {
  for (const [collection, items] of Object.entries(bundle.content)) {
    for (const [slug, item] of Object.entries(items)) {
      const filePath = join(outputDir, 'content', collection, `${slug}.md`)
      await mkdir(dirname(filePath), { recursive: true })

      // The locale is always written: the file then lands in its own locale on
      // any site, whatever default locale that site has.
      const frontmatter: Record<string, unknown> = { ...item.fields, locale: item.locale }
      if (item.status !== 'published') frontmatter['status'] = item.status

      const yaml = toYaml(frontmatter)
      const content = `---\n${yaml}---\n${item.body}`
      await writeFile(filePath, content, 'utf-8')
    }
  }
}

/**
 * Write the bundle's media metadata and runtime schema extensions as JSON
 * sidecars next to the exported content. Skipped when the bundle has none.
 */
async function writeExportedSidecars(outputDir: string, bundle: ExportBundle): Promise<void> {
  if (bundle.media.items.length > 0) {
    const mediaPath = join(outputDir, 'media', 'metadata.json')
    await mkdir(dirname(mediaPath), { recursive: true })
    await writeFile(mediaPath, JSON.stringify(bundle.media, null, 2), 'utf-8')
  }

  if (Object.keys(bundle.schemas).length > 0) {
    const schemaPath = join(outputDir, 'config', 'schemas.json')
    await mkdir(dirname(schemaPath), { recursive: true })
    await writeFile(schemaPath, JSON.stringify(bundle.schemas, null, 2), 'utf-8')
  }
}

/**
 * Reconstruct and write the content manifest from the bundle's checksum map.
 * The manifest is what the migration system uses on re-import to detect
 * changed vs. unchanged files.
 */
async function writeManifest(outputDir: string, bundle: ExportBundle): Promise<void> {
  const manifest = {
    version: bundle.version,
    generatedAt: bundle.timestamp,
    files: Object.fromEntries(
      Object.entries(bundle.checksums).map(([path, checksum]) => [
        `${path}.md`,
        { checksum, size: 0 },
      ]),
    ),
  }
  await writeFile(
    join(outputDir, 'content', 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8',
  )
}

/**
 * Export content from a running krantho server to local files.
 *
 * Usage: krantho-export --url http://localhost:4002 --output ./content
 */
async function main(): Promise<void> {
  const { baseUrl, outputDir } = parseExportArgs(process.argv.slice(2))
  console.log(`Exporting from ${baseUrl} to ${outputDir}...`)

  const bundle = await fetchBundle(baseUrl)
  await writeExportedContent(outputDir, bundle)
  await writeExportedSidecars(outputDir, bundle)
  await writeManifest(outputDir, bundle)

  const totalItems = Object.values(bundle.content).reduce(
    (sum, col) => sum + Object.keys(col).length,
    0,
  )
  console.log(
    `Exported ${totalItems} content items, ${bundle.media.items.length} media items, ${Object.keys(bundle.schemas).length} schemas`,
  )
  console.log(`Manifest version: ${bundle.version}`)
  console.log(`Output: ${outputDir}`)
}

main().catch((err) => {
  console.error('Export failed:', err)
  process.exit(1)
})
