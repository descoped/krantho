/**
 * Export helpers for JSON-LD structured data.
 *
 * Pure functions that serialize the composed graph for external use:
 * - Download as `.jsonld` file
 * - Copy as `<script type="application/ld+json">` block
 *
 * No React, no DOM (except `downloadFile` which uses browser APIs).
 */

/** Serialize composed JSON-LD data as a formatted string. */
export function exportAsJsonLd(data: unknown): string {
  return JSON.stringify(data, null, 2)
}

/** Wrap JSON-LD in a ready-to-paste HTML script tag. */
export function exportAsScriptTag(data: unknown): string {
  const json = JSON.stringify(data, null, 2)
  return `<script type="application/ld+json">\n${json}\n</script>`
}

/**
 * Generate a predictable filename for a JSON-LD export.
 * Document scope: `pages-home.jsonld`
 * Site scope: `site.jsonld`
 */
export function generateFilename(
  collection?: string | undefined,
  slug?: string | undefined,
): string {
  if (collection && slug) {
    return `${collection}-${slug}.jsonld`
  }
  if (collection) {
    return `${collection}.jsonld`
  }
  return 'site.jsonld'
}

/** Trigger a browser file download using a blob URL. */
export function downloadFile(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
