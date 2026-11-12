import type { FrameLocator, Locator, Page } from '@playwright/test'
import {
  createDocument,
  expect,
  pageDocument,
  publishDocument,
  type SeedDocument,
  saveDocument,
  type Target,
  test,
} from '../src/fixtures.js'

// Live mode on the target's own draft preview. Studio loads
// `GET /api/preview?collection=&slug=` in a frame; the target turns it into its preview —
// Next.js draft mode, or a signed link — and renders the document of its page collection
// (`site.pages`: a service at /services/<slug> on the examples, a feature at
// /features/<slug> on krantho.com). Each target marks the document's title and the field
// shown beside it (`kranthoField`), and its body's lead and `##` sections; the collection's
// index page (the `pages` document) marks each card with the card's own document.

const BODY = [
  'Lead words for the live spec.',
  '',
  '## Alpha',
  '',
  'Alpha words with [a link](/about).',
  '',
  '## Beta',
  '',
  'Beta words.',
].join('\n')

/** The documents the spec previews on a target */
interface LiveDocs {
  collection: string
  /** Published, then a draft saved over it: the preview shows the draft, visitors the live version */
  drafted: SeedDocument
  /** The draft value of the shown field (`site.pages.shown`) */
  draftValue: string
  /** Typed into in place and saved */
  typed: SeedDocument
}

function liveDocs(target: Target): LiveDocs {
  const { collection, shown } = target.site.pages
  const drafted = pageDocument(target, 'e2e-live-drafted', 'Live drafted', BODY)
  return {
    collection,
    drafted,
    draftValue: `${String(drafted.fields[shown])}, draft only`,
    typed: pageDocument(target, 'e2e-live-typed', 'Live typed', BODY),
  }
}

interface CollectionInfo {
  name: string
  pages: boolean
  path?: string | false | undefined
  sections: string[]
}

async function api<T>(target: Target, path: string): Promise<T> {
  const res = await fetch(new URL(path, target.baseURL))
  if (!res.ok) throw new Error(`GET ${path} failed with ${res.status}`)
  return (await res.json()) as T
}

async function exists(target: Target, collection: string, slug: string): Promise<boolean> {
  return (await fetch(new URL(`/api/content/${collection}/${slug}`, target.baseURL))).ok
}

async function seedLive(target: Target, doc: SeedDocument): Promise<void> {
  if (await exists(target, doc.collection, doc.slug)) return
  await createDocument(target, doc)
  await publishDocument(target, doc.collection, doc.slug)
}

let seeding: Promise<void> | null = null

function seed(target: Target): Promise<void> {
  seeding ??= (async () => {
    const { drafted, typed, draftValue } = liveDocs(target)
    for (const doc of [drafted, typed]) await seedLive(target, doc)
    const fields = { ...drafted.fields, [target.site.pages.shown]: draftValue }
    await saveDocument(target, { ...drafted, fields })
  })()
  return seeding
}

test.beforeEach(async ({ target }) => {
  if (target.site.preview !== null) await seed(target)
})

/** Skip a test of the draft preview on a target that renders none (react-spa) */
function requirePreview({ target }: { target: Target }): void {
  test.skip(target.site.preview === null, `${target.site.name} renders no drafts for editors`)
}

/** A string or number for each required field of a collection's schema; null when one needs more */
async function requiredFields(
  target: Target,
  collection: string,
): Promise<Record<string, unknown> | null> {
  const { schema } = await api<{
    schema: {
      properties?:
        | Record<string, { type?: string | undefined; enum?: unknown[] | undefined }>
        | undefined
      required?: string[] | undefined
    }
  }>(target, `/api/schema/${collection}`)
  const fields: Record<string, unknown> = {}
  for (const name of schema.required ?? []) {
    const property = schema.properties?.[name]
    if (property?.enum) fields[name] = property.enum[0]
    else if (property?.type === 'string') fields[name] = `E2E ${name}`
    else if (property?.type === 'number' || property?.type === 'integer') fields[name] = 1
    else return null
  }
  return fields
}

async function designedSections(target: Target, collection: string): Promise<string[]> {
  const { collections } = await api<{ collections: CollectionInfo[] }>(target, '/api/collections')
  return collections.find((c) => c.name === collection)?.sections ?? []
}

function previewEntry(collection: string, slug: string): string {
  return `/api/preview?${new URLSearchParams({ collection, slug })}`
}

function frameTitle(collection: string, slug: string): string {
  return `Draft preview of ${collection}/${slug}`
}

/** Open a document's editor without `?mode=`: a page opens in Live mode */
async function openLive(page: Page, collection: string, slug: string): Promise<FrameLocator> {
  await page.goto(`/studio/site/${collection}/${slug}`)
  await expect(page.getByRole('tab', { name: 'Live' })).toHaveAttribute('aria-selected', 'true')
  await expect(
    page.getByRole('status').filter({ hasText: 'Loading the draft preview' }),
  ).toBeHidden({ timeout: 30_000 })
  return page.frameLocator(`iframe[title="${frameTitle(collection, slug)}"]`)
}

/** A marked element of a document in the preview */
function marked(
  frame: FrameLocator,
  doc: string,
  kind: 'field' | 'section',
  name: string,
): Locator {
  return frame.locator(`[data-krantho-document="${doc}"][data-krantho-${kind}="${name}"]`)
}

/**
 * A clicked field's editor: the element itself, edited in place in the
 * preview, when it holds only text; the floating editor when it holds markup
 */
async function fieldEditor(
  page: Page,
  frame: FrameLocator,
  element: Locator,
  name: string,
): Promise<{ input: Locator; inPlace: boolean }> {
  const inPlace = await element.evaluate((el) =>
    [...el.childNodes].every((node) => node.nodeType === Node.TEXT_NODE),
  )
  return { input: (inPlace ? frame : page).getByRole('textbox', { name }), inPlace }
}

function sidePanel(page: Page): Locator {
  return page.getByRole('complementary', { name: 'Side panel' })
}

/** The path the preview frame shows now */
async function framePath(page: Page, collection: string, slug: string): Promise<string> {
  const handle = await page
    .locator(`iframe[title="${frameTitle(collection, slug)}"]`)
    .elementHandle()
  const frame = await handle?.contentFrame()
  if (!frame) throw new Error('the preview frame has no content')
  return new URL(frame.url()).pathname
}

/** Studio's layer over the frame, which every outline, tag and inline editor stays inside */
function stage(page: Page): Locator {
  return page.locator('.live-stage')
}

/** Expect an element to show whole inside another: nothing of it clipped off */
async function expectInside(inner: Locator, outer: Locator): Promise<void> {
  await expect(inner).toBeVisible()
  const a = await inner.boundingBox()
  const b = await outer.boundingBox()
  if (!a || !b) throw new Error('no box to compare')
  expect(a.x).toBeGreaterThanOrEqual(b.x - 1)
  expect(a.y).toBeGreaterThanOrEqual(b.y - 1)
  expect(a.x + a.width).toBeLessThanOrEqual(b.x + b.width + 1)
  expect(a.y + a.height).toBeLessThanOrEqual(b.y + b.height + 1)
}

/** The WCAG contrast of an element's text against the first opaque background behind it */
async function textContrast(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    const channels = (color: string): number[] =>
      (color.match(/[\d.]+/g) ?? []).map(Number).slice(0, 4)
    const opaque = (color: string): boolean => (channels(color)[3] ?? 1) > 0
    let at: Element | null = element
    while (at && !opaque(getComputedStyle(at).backgroundColor)) at = at.parentElement
    const background = at ? getComputedStyle(at).backgroundColor : 'rgb(255, 255, 255)'
    const luminance = (color: string): number => {
      const [r = 0, g = 0, b = 0] = channels(color).map((c) => {
        const v = c / 255
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const [hi, lo] = [luminance(getComputedStyle(element).color), luminance(background)].sort(
      (x, y) => y - x,
    )
    return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05)
  })
}

/** The colour channels of the first colour in a computed style value */
function channels(color: string): [number, number, number] {
  const [r = 0, g = 0, b = 0] = (color.match(/[\d.]+/g) ?? []).map(Number)
  return [r, g, b]
}

/** The WCAG contrast ratio of two computed colours */
function contrast(a: string, b: string): number {
  const luminance = (color: string): number => {
    const [r, g, b] = channels(color).map((c) => {
      const v = c / 255
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0)
  }
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05)
}

/** The first opaque background behind an element of the site's page */
async function pageBackground(element: Locator): Promise<string> {
  return element.evaluate((el) => {
    for (let at: Element | null = el; at; at = at.parentElement) {
      const color = getComputedStyle(at).backgroundColor
      const alpha = Number((color.match(/[\d.]+/g) ?? [])[3] ?? 1)
      if (alpha > 0 && color !== 'transparent') return color
    }
    return 'rgb(255, 255, 255)'
  })
}

/** The better of the outline ring's two tones against the page behind it */
async function ringContrast(outline: Locator, behind: Locator): Promise<number> {
  const tones = await outline.evaluate((el) => {
    const style = getComputedStyle(el)
    return [style.borderTopColor, style.boxShadow]
  })
  const background = await pageBackground(behind)
  return Math.max(...tones.map((tone) => contrast(tone, background)))
}

test.describe('editor Live mode', () => {
  test.beforeEach(requirePreview)

  test('the frame loads the draft preview of the page through the preview entry', async ({
    page,
    target,
  }) => {
    const { collection, drafted, draftValue } = liveDocs(target)
    const frame = await openLive(page, collection, drafted.slug)
    await expect(
      page.locator(`iframe[title="${frameTitle(collection, drafted.slug)}"]`),
    ).toHaveAttribute('src', previewEntry(collection, drafted.slug))
    expect(await framePath(page, collection, drafted.slug)).toBe(
      target.site.pages.path(drafted.slug),
    )
    // The draft, not the live version
    const shown = target.site.pages.shown
    await expect(marked(frame, `${collection}/${drafted.slug}`, 'field', shown)).toHaveText(
      draftValue,
    )
  })

  test('marked fields and sections of the edited document outline on hover with their tag', async ({
    page,
    target,
  }) => {
    const { collection, drafted } = liveDocs(target)
    const designed = (await designedSections(target, collection)).map((s) => s.toLowerCase())
    const doc = `${collection}/${drafted.slug}`
    const frame = await openLive(page, collection, drafted.slug)
    const tag = page.locator('.live-tag')

    await marked(frame, doc, 'field', 'title').hover()
    await expect(tag).toHaveText('field · title')
    await expectInside(tag, stage(page))
    await marked(frame, doc, 'section', 'Alpha').locator('p').first().hover()
    const kind = designed.includes('alpha') ? 'designed' : 'prose'
    await expect(tag).toHaveText(`section · Alpha · ${kind}`)
    await marked(frame, doc, 'section', '__lead').locator('p').first().hover()
    await expect(tag).toHaveText('section · lead')
  })

  test('marks of other documents on the page are ignored', async ({ page, target }) => {
    // The index page is the `pages` document; its cards are the documents' own
    const { collection, drafted } = liveDocs(target)
    const index = `pages/${target.site.pages.index}`
    const frame = await openLive(page, 'pages', target.site.pages.index)
    await marked(frame, index, 'field', 'title').hover()
    await expect(page.locator('.live-tag')).toHaveText('field · title')
    const card = frame.locator(`[data-krantho-document="${collection}/${drafted.slug}"]`).first()
    await card.hover()
    await expect(page.locator('.live-tag')).toHaveCount(0)
  })

  test('clicking selects the element in the side panel without navigating', async ({
    page,
    target,
  }) => {
    const { collection, drafted } = liveDocs(target)
    const doc = `${collection}/${drafted.slug}`
    const frame = await openLive(page, collection, drafted.slug)
    const panel = sidePanel(page)

    const title = marked(frame, doc, 'field', 'title')
    await title.click()
    await expect(panel.getByRole('heading', { level: 2 })).toHaveText('Field · title')
    const { input, inPlace } = await fieldEditor(page, frame, title, 'Edit field title')
    await expect(input).toBeFocused()
    if (!inPlace)
      await expectInside(page.getByRole('button', { name: 'Done editing' }), stage(page))
    // The selected outline is a border: the element's text shows through it
    const outline = page.locator('.live-outline--selected')
    await expect(outline).toHaveCount(1)
    expect(await outline.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
      'rgba(0, 0, 0, 0)',
    )
    await page.keyboard.press('Escape')
    await expect(outline).toHaveCount(0)
    await expect(input).toBeHidden()

    // A link inside a marked section does not navigate the preview
    await marked(frame, doc, 'section', 'Alpha').getByRole('link', { name: 'a link' }).click()
    await expect(panel.getByRole('heading', { level: 2 })).toHaveText('Section · Alpha')
    expect(await framePath(page, collection, drafted.slug)).toBe(
      target.site.pages.path(drafted.slug),
    )
  })

  test('typing in the inline editor changes the element in the frame at once, and Save reloads it with the saved draft', async ({
    page,
    target,
  }) => {
    const { collection, typed: typedDoc } = liveDocs(target)
    const doc = `${collection}/${typedDoc.slug}`
    const frame = await openLive(page, collection, typedDoc.slug)
    const title = marked(frame, doc, 'field', 'title')
    await title.click()
    const { input } = await fieldEditor(page, frame, title, 'Edit field title')
    const typed = `Typed in place ${Date.now().toString(36)}`
    await input.fill(typed)
    await expect(title).toHaveText(typed)
    // Esc finishes editing, so no editor covers anything further down the page
    await page.keyboard.press('Escape')

    const section = marked(frame, doc, 'section', 'Beta')
    await section.locator('p').first().click()
    const area = frame.getByRole('textbox', { name: 'Edit section Beta' })
    await area.fill('Beta, rewritten.')
    await area.selectText()
    await page.getByRole('button', { name: 'Bold', exact: true }).click()
    await expect(section.locator('strong')).toHaveText('Beta, rewritten.')

    // A reload replaces the frame's window: the mark set on it now is gone after Save
    await frame.locator('body').evaluate(() => {
      Object.defineProperty(window, '__kranthoBeforeSave', { value: true })
    })
    await page.getByRole('button', { name: 'Save draft' }).click()
    await expect(page.getByRole('status', { name: 'Notifications' })).toContainText('Draft saved')
    await expect
      .poll(() =>
        frame
          .locator('body')
          .evaluate(() => '__kranthoBeforeSave' in window)
          .catch(() => true),
      )
      .toBe(false)
    await expect(marked(frame, doc, 'field', 'title')).toHaveText(typed)
    await expect(marked(frame, doc, 'section', 'Beta').locator('strong')).toHaveText(
      'Beta, rewritten.',
    )
  })

  test('the panel has no content list, Page & sections or Reach: the page and the header hold them', async ({
    page,
    target,
  }) => {
    const { collection, drafted } = liveDocs(target)
    const frame = await openLive(page, collection, drafted.slug)
    await expect(marked(frame, `${collection}/${drafted.slug}`, 'field', 'title')).toBeVisible()
    const panel = sidePanel(page)
    await expect(panel.getByRole('region', { name: 'Page & sections' })).toHaveCount(0)
    await expect(panel.getByRole('region', { name: 'Reach' })).toHaveCount(0)
    await expect(page.getByText('Choose editable content')).toHaveCount(0)
  })

  test('a missing designed section shows the dashed placeholder with Add section', async ({
    page,
    target,
  }) => {
    const { collections } = await api<{ collections: CollectionInfo[] }>(target, '/api/collections')
    // A collection whose documents have pages of their own, so the preview is the new document's
    const contract = collections.find(
      (c) =>
        c.pages && c.sections.length > 0 && (typeof c.path !== 'string' || c.path.includes(':')),
    )
    test.skip(!contract, 'no collection of the target designs sections')
    if (!contract) return
    const [first] = contract.sections
    if (first === undefined) return
    const fields = await requiredFields(target, contract.name)
    test.skip(fields === null, `${contract.name} requires a field the spec cannot fill`)
    if (fields === null) return
    const slug = `e2e-live-contract-${Date.now().toString(36)}`
    await createDocument(target, { collection: contract.name, slug, fields, body: 'Lead only.' })

    await openLive(page, contract.name, slug)
    const missing = page.getByRole('list', { name: 'Designed sections not written' })
    await expect(missing).toContainText(
      `${first} is in this page's section contract but hasn't been written. The page leaves it out.`,
    )
    await missing.getByRole('button', { name: `Add section ${first}` }).click()
    await expect(sidePanel(page).getByRole('heading', { level: 2 })).toHaveText(
      `Section · ${first}`,
    )
    await page.getByRole('tab', { name: 'Structure' }).click()
    await expect(page.getByRole('textbox', { name: 'Body' })).toHaveValue(new RegExp(`## ${first}`))
  })

  test('when the preview cannot load, the empty state shows the URL it tried and a Structure mode button', async ({
    page,
    target,
  }) => {
    const { collection, drafted } = liveDocs(target)
    await page.route('**/api/preview?**', (route) => route.abort())
    await page.goto(`/studio/site/${collection}/${drafted.slug}`)
    await expect(page.getByText('The page preview did not load')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(previewEntry(collection, drafted.slug))).toBeVisible()
    await page.getByRole('button', { name: 'Switch to Structure mode' }).click()
    await expect(page.getByRole('tab', { name: 'Structure' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(page.getByRole('textbox', { name: 'Body' })).toBeVisible()
  })
  test('a link away from the page says the preview moved, and Back to the page returns', async ({
    page,
    target,
  }) => {
    const { collection, drafted } = liveDocs(target)
    const { index, indexLink } = target.site.pages
    const doc = `${collection}/${drafted.slug}`
    const frame = await openLive(page, collection, drafted.slug)
    await frame.getByRole('main').getByRole('link', { name: indexLink }).first().click()
    await expect(page.getByRole('alert').filter({ hasText: 'The preview moved to' })).toContainText(
      `/${index}`,
    )
    // The marks there are not this page's: no notes about its fields
    await expect(
      sidePanel(page).getByRole('list', { name: 'Fields not marked on the page' }),
    ).toHaveCount(0)
    await page.getByRole('button', { name: 'Back to the page' }).click()
    // The reloaded page is attached once its loading status clears, as on the first load
    await expect(
      page.getByRole('status').filter({ hasText: 'Loading the draft preview' }),
    ).toBeHidden({ timeout: 30_000 })
    await expect(marked(frame, doc, 'field', 'title')).toBeVisible({ timeout: 30_000 })
    // A hover sent while the frame was still hydrating is lost; hover again until Studio answers
    await expect(async () => {
      await marked(frame, doc, 'field', 'title').hover()
      await expect(page.locator('.live-tag')).toHaveText('field · title', { timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
  })

  test('a preview that answers with an error is not taken for the page', async ({
    page,
    target,
  }) => {
    const { collection, drafted } = liveDocs(target)
    await page.route('**/api/preview?**', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Authentication required' }),
      }),
    )
    await page.goto(`/studio/site/${collection}/${drafted.slug}`)
    await expect(page.getByText('The page preview did not load')).toBeVisible({ timeout: 30_000 })
    await expect(
      page.getByText('The preview answered with an error — for example, your sign-in expired.', {
        exact: false,
      }),
    ).toBeVisible()
    await expect(page.getByText(previewEntry(collection, drafted.slug))).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reload the preview' })).toBeVisible()
  })

  test('a version in another locale is edited in Structure mode, never previewed on the default page', async ({
    page,
    target,
  }) => {
    const { defaultLocale, supportedLocales } = await api<{
      defaultLocale: string
      supportedLocales: string[]
    }>(target, '/api/settings/locales')
    const other = supportedLocales.find((locale) => locale !== defaultLocale)
    test.skip(other === undefined, 'the target has one locale')
    if (other === undefined) return
    const { collection } = liveDocs(target)
    const doc = pageDocument(target, `e2e-live-locale-${Date.now().toString(36)}`, 'Live locale')
    await createDocument(target, doc)
    await createDocument(target, { ...doc, locale: other })

    await page.goto(`/studio/site/${collection}/${doc.slug}?locale=${other}`)
    await expect(
      page.getByText(
        `Live mode previews the site’s default-locale page; the site’s preview has no locale. Edit ${other} in Structure mode.`,
      ),
    ).toBeVisible()
    await expect(page.locator(`iframe[title="${frameTitle(collection, doc.slug)}"]`)).toHaveCount(0)
    await expect(page.getByText('The page preview did not load')).toHaveCount(0)
    await page.getByRole('button', { name: 'Switch to Structure mode' }).click()
    await expect(page.getByRole('tab', { name: 'Structure' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })
})

test.describe('editor Live mode at a phone width', () => {
  test.use({ viewport: { width: 390, height: 844 } })
  test.beforeEach(requirePreview)

  test('the tag and the inline editor, Done included, show whole inside the frame', async ({
    page,
    target,
  }) => {
    const { collection, drafted } = liveDocs(target)
    const doc = `${collection}/${drafted.slug}`
    const frame = await openLive(page, collection, drafted.slug)
    await marked(frame, doc, 'field', 'title').hover()
    await expectInside(page.locator('.live-tag'), stage(page))
    await marked(frame, doc, 'section', 'Beta').locator('p').first().click()
    await expectInside(page.locator('.live-context--markdown'), stage(page))
    await expectInside(page.getByRole('button', { name: 'Done editing' }), stage(page))
  })
})

/** Studio's own theme key, set before the page loads */
const THEME_KEY = 'krantho-studio-theme'

for (const theme of ['light', 'dark'] as const) {
  test.describe(`editor Live mode in the ${theme} theme`, () => {
    test.beforeEach(requirePreview)

    test('the outline, tag and inline editor show and read clearly over a light page', async ({
      page,
      target,
    }) => {
      // Studio's own theme is stored; the site follows the system, which is light
      await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
        THEME_KEY,
        theme,
      ] as const)
      await page.emulateMedia({ colorScheme: 'light' })
      const { collection, drafted } = liveDocs(target)
      const doc = `${collection}/${drafted.slug}`
      const frame = await openLive(page, collection, drafted.slug)
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)

      await marked(frame, doc, 'field', 'title').hover()
      const tag = page.locator('.live-tag')
      await expectInside(tag, stage(page))
      expect(await textContrast(tag)).toBeGreaterThanOrEqual(4.5)

      await marked(frame, doc, 'field', 'title').click()
      const outline = page.locator('.live-outline--selected')
      await expect(outline).toBeVisible()
      // One of the ring's two tones stands out against the page behind it
      const title = marked(frame, doc, 'field', 'title')
      expect(await ringContrast(outline, title)).toBeGreaterThanOrEqual(3)
      // Formatting controls sit beside the section edited in the page
      await page.keyboard.press('Escape')
      await marked(frame, doc, 'section', 'Beta').locator('p').first().click()
      const label = page.locator('.live-context--markdown strong').first()
      await expectInside(page.locator('.live-context--markdown'), stage(page))
      expect(await textContrast(label)).toBeGreaterThanOrEqual(4.5)
    })
  })
}

test.describe('editor Live mode on a site with no draft preview', () => {
  test('Live mode shows its empty state and leads to Structure mode', async ({ page, target }) => {
    test.skip(target.site.preview !== null, `${target.site.name} renders drafts for editors`)
    const slug = `e2e-live-none-${Date.now().toString(36)}`
    const doc = pageDocument(target, slug, 'Live none', BODY)
    await createDocument(target, doc)

    await page.goto(`/studio/site/${doc.collection}/${slug}`)
    await expect(page.getByRole('tab', { name: 'Live' })).toHaveAttribute('aria-selected', 'true')
    await expect(
      page.getByRole('heading', { name: 'The site does not render drafts for editors' }),
    ).toBeVisible()
    await expect(
      page.getByText('Live mode needs the site’s draft preview (sitePreview).'),
    ).toBeVisible()
    await expect(page.locator(`iframe[title="${frameTitle(doc.collection, slug)}"]`)).toHaveCount(0)
    await page.getByRole('button', { name: 'Switch to Structure mode' }).click()
    await expect(page.getByRole('tab', { name: 'Structure' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(page.getByRole('textbox', { name: 'Body' })).toBeVisible()
  })
})
