import { expect, readPublicPage, type Target, test } from '../src/fixtures.js'

// Studio's Live marks are preview-only: a visitor's page never carries a `data-krantho-`
// attribute. Every page the target's sitemap lists is read the way a visitor reads it — a
// plain request, no cookie, no preview link — on the path the sitemap names, at the
// target's own origin (a sitemap names the site's configured `baseUrl`).

/**
 * A Live mark: an attribute on an element, or a mark passed as a prop in the page's serialized
 * component tree (`"data-krantho-field":`). Text that only names a mark — the docs that teach
 * the marks quote them in code samples, escaped as `&lt;h1 data-krantho-field=…` — is no mark.
 */
const MARKS = [/<[a-zA-Z][^<>]*\sdata-krantho-[\w-]+\s*=/, /\\?"data-krantho-[\w-]+\\?"\s*:/]

function carriesMarks(html: string): boolean {
  return MARKS.some((mark) => mark.test(html))
}

/** The paths the target's sitemap lists, read where the target serves it */
async function sitemapPaths(target: Target): Promise<string[]> {
  const res = await fetch(new URL(target.site.sitemap, target.baseURL))
  expect(res.status, `${target.site.sitemap} answers`).toBe(200)
  const xml = await res.text()
  const locations = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((match) => match[1])
  const paths = locations.flatMap((loc) => {
    if (loc === undefined) return []
    const url = new URL(loc.replaceAll('&amp;', '&'))
    return [`${url.pathname}${url.search}`]
  })
  return [...new Set(paths)]
}

test.describe('production HTML', () => {
  test('no page the sitemap lists carries a Live mark for a visitor', async ({ target }) => {
    test.setTimeout(300_000)
    const paths = await sitemapPaths(target)
    expect(paths.length, 'the sitemap lists pages').toBeGreaterThan(0)

    const marked: string[] = []
    for (const path of paths) {
      const page = await readPublicPage(target, path)
      expect(page.status, `${path} answers a visitor without a server error`).toBeLessThan(500)
      // A listed page the target has no route for: its not-found page is checked all the same
      if (page.status !== 200) {
        test.info().annotations.push({ type: 'not found', description: `${path}: ${page.status}` })
      }
      if (carriesMarks(page.html)) marked.push(path)
    }
    expect(marked, 'pages whose visitor HTML carries data-krantho- attributes').toEqual([])
  })

  test('the same kind of page carries the marks in an editor’s preview', async ({
    page,
    target,
  }) => {
    // The control: the check above could fail. The preview entry leads an editor's browser
    // to the page in the target's own preview, which marks the document.
    test.skip(target.site.preview === null, `${target.site.name} renders no drafts for editors`)
    const { collection } = target.site.pages
    const { items } = (await (
      await fetch(new URL(`/api/content/${collection}?sort=slug&limit=100`, target.baseURL))
    ).json()) as { items: Array<{ meta: { slug: string; liveVersion: number | null } }> }
    // A document with a live version, so a visitor reads the same page
    const slug = items.find((item) => item.meta.liveVersion !== null)?.meta.slug
    if (slug === undefined) throw new Error(`${collection} has no live documents`)

    await page.goto(`/api/preview?${new URLSearchParams({ collection, slug })}`)
    await expect(page).toHaveURL(new RegExp(`${target.site.pages.path(slug)}`))
    await expect(
      page.locator(`[data-krantho-document="${collection}/${slug}"]`).first(),
    ).toBeAttached()

    const visitor = await readPublicPage(target, target.site.pages.path(slug))
    expect(visitor.status).toBe(200)
    expect(carriesMarks(visitor.html)).toBe(false)
  })
})
