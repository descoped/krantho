// The structured data of a deployed site's pages, checked the way a search engine
// reads it: fetch every page the sitemap lists, take the JSON-LD out of the page
// source and validate each graph. `check-structured-data.mjs` runs it.

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 }
const JSON_LD = /<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

/** The text of an XML element, with the entities XML escapes decoded */
const unescapeXml = (text) => text.replace(/&(amp|lt|gt|quot|apos);/g, (_, name) => ENTITIES[name])

/** The pages a sitemap lists, as paths: the check reads them from whichever site it is given */
export function sitemapPaths(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => {
    const { pathname, search } = new URL(unescapeXml(match[1].trim()))
    return `${pathname}${search}`
  })
}

/** Every JSON-LD block of a page's source, parsed; a block that is not JSON says so */
export function extractJsonLd(html) {
  return [...html.matchAll(JSON_LD)].map((match) => {
    try {
      return { graph: JSON.parse(match[1]) }
    } catch (err) {
      return { invalid: err instanceof Error ? err.message : String(err) }
    }
  })
}

/**
 * What one page's source says about its structured data: the findings of each
 * graph's validation, and the problems with the page itself (no structured data,
 * a block that is not JSON)
 */
export function checkPageSource(html, validate) {
  const blocks = extractJsonLd(html)
  const findings = []
  const problems = []
  if (blocks.length === 0) {
    problems.push({ severity: 'warning', message: 'The page carries no structured data.' })
  }
  for (const block of blocks) {
    if (block.invalid !== undefined) {
      problems.push({
        severity: 'error',
        message: `A JSON-LD block is not valid JSON: ${block.invalid}`,
      })
      continue
    }
    findings.push(...validate(block.graph))
  }
  return { blocks: blocks.length, findings, problems }
}

async function fetchText(fetcher, url) {
  const response = await fetcher(url, { redirect: 'follow' })
  return { status: response.status, text: response.ok ? await response.text() : '' }
}

/** A page's source; one more attempt after a network failure or a server error */
async function readPage(fetcher, url) {
  try {
    const first = await fetchText(fetcher, url)
    if (first.status < 500) return first
  } catch {
    // a network failure: try once more below
  }
  return fetchText(fetcher, url)
}

async function checkPage(fetcher, baseUrl, path, validate) {
  const url = new URL(path, baseUrl).href
  try {
    const { status, text } = await readPage(fetcher, url)
    if (status !== 200) {
      const message = `The page answered HTTP ${status}.`
      return { path, blocks: 0, findings: [], problems: [{ severity: 'error', message }] }
    }
    return { path, ...checkPageSource(text, validate) }
  } catch (err) {
    const message = `The page could not be read: ${err instanceof Error ? err.message : err}`
    return { path, blocks: 0, findings: [], problems: [{ severity: 'error', message }] }
  }
}

/** Run `task` over `items`, at most `limit` at a time; results keep the order of `items` */
async function inPool(items, limit, task) {
  const results = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await task(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

/**
 * Check every page of the site's sitemap. `validate` takes a JSON-LD graph and
 * returns its findings (`validateGraph` of @krantho/seo, with the site's readers).
 * Errors make the site fail; warnings are reported.
 */
export async function checkSite({ baseUrl, validate, fetcher = fetch, concurrency = 6 }) {
  const sitemap = await fetchText(fetcher, new URL('/sitemap.xml', baseUrl).href)
  if (sitemap.status !== 200) throw new Error(`sitemap.xml answered HTTP ${sitemap.status}`)
  const paths = sitemapPaths(sitemap.text)
  if (paths.length === 0) throw new Error('sitemap.xml lists no pages')
  const pages = await inPool(paths, concurrency, (path) =>
    checkPage(fetcher, baseUrl, path, validate),
  )
  return { pages, ...summarize(pages) }
}

/** How many errors and warnings the pages carry, in findings and in problems */
export function summarize(pages) {
  const all = pages.flatMap((page) => [...page.findings, ...page.problems])
  const count = (severity) => all.filter((item) => item.severity === severity).length
  return { errors: count('error'), warnings: count('warning'), notes: count('info') }
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

/** The report: each page's errors and warnings, findings per reader, then the totals; notes are only counted */
export function formatReport({ pages, errors, warnings, notes }) {
  const lines = []
  for (const page of pages) {
    const findings = page.findings.filter((finding) => finding.severity !== 'info')
    if (findings.length === 0 && page.problems.length === 0) continue
    lines.push('', page.path)
    for (const problem of page.problems) lines.push(`  [${problem.severity}] ${problem.message}`)
    const sorted = [...findings].sort(
      (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
    )
    for (const reader of new Set(sorted.map((finding) => finding.profile))) {
      lines.push(`  ${reader}`)
      for (const finding of sorted.filter((f) => f.profile === reader)) {
        const source = finding.source ? ` (${finding.source})` : ''
        lines.push(`    [${finding.severity}] ${finding.message}${source}`)
      }
    }
  }
  const totals = [plural(errors, 'error'), plural(warnings, 'warning'), plural(notes, 'note')]
  lines.push('', `Checked ${plural(pages.length, 'page')}: ${totals.join(', ')}.`)
  return lines.join('\n')
}
