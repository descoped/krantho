import { crc32, deflateSync } from 'node:zlib'
import AxeBuilder from '@axe-core/playwright'
import type { Locator, Page } from '@playwright/test'
import { createDocument, expect, type Target, test } from '../src/fixtures.js'

// Media on nextjs-shadcn: its local store, empty at the start of a run (the
// harness points KRANTHO_MEDIA_LOCAL_DIR into the run's data directory). The
// spec uploads its own images through the API; a `pages` document embeds one
// by its stable URL, which is how the API's usage scan finds a reference.
// Every expected figure is read from the API, never assumed.

interface MediaItem {
  id: string
  filename: string
  altText: string
  mimeType: string
  width: number | null
  height: number | null
  folder: string | null
  crop: { x: number; y: number; width: number; height: number } | null
}

interface MediaFolder {
  id: string
  name: string
}

// ---------------------------------------------------------------------------
// Images, built here: a solid-colour PNG of any size (the API reads its dimensions)
// ---------------------------------------------------------------------------

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(4)
  head.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const tail = Buffer.alloc(4)
  tail.writeUInt32BE(crc32(body))
  return Buffer.concat([head, body, tail])
}

function png(width: number, height: number, rgb: [number, number, number]): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2, 0, 0, 0], 8)
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array(width).fill(rgb).flat())])
  const pixels = deflateSync(Buffer.concat(Array(height).fill(row)))
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([
    signature,
    chunk('IHDR', header),
    chunk('IDAT', pixels),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---------------------------------------------------------------------------
// The API, as the spec reads and seeds it
// ---------------------------------------------------------------------------

async function api<T>(target: Target, path: string): Promise<T> {
  const res = await fetch(new URL(path, target.baseURL))
  if (!res.ok) throw new Error(`GET ${path} failed with ${res.status}`)
  return (await res.json()) as T
}

async function send(
  target: Target,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const res = await fetch(new URL(path, target.baseURL), {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!res.ok) throw new Error(`${method} ${path} failed with ${res.status}`)
  return res.json()
}

/** The files whose name contains `name` */
async function findFiles(target: Target, name: string): Promise<MediaItem[]> {
  const query = new URLSearchParams({ search: name })
  return (await api<{ items: MediaItem[] }>(target, `/api/media?${query}`)).items
}

async function upload(target: Target, name: string, bytes: Buffer): Promise<MediaItem> {
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(bytes)], { type: 'image/png' }), name)
  const res = await fetch(new URL('/api/media/upload', target.baseURL), {
    method: 'POST',
    body: form,
  })
  if (!res.ok) throw new Error(`Upload of ${name} failed with ${res.status}: ${await res.text()}`)
  return (await res.json()) as MediaItem
}

/** The spec's file by its name, uploaded when the store does not hold it yet */
async function ensureFile(target: Target, name: string, bytes: Buffer): Promise<MediaItem> {
  const [existing] = (await findFiles(target, name)).filter((file) => file.filename === name)
  return existing ?? upload(target, name, bytes)
}

/** Distinct documents the API's usage scan finds for a file */
async function referencingDocuments(target: Target, id: string): Promise<number> {
  const { usage } = await api<{ usage: Array<{ collection: string; slug: string }> }>(
    target,
    `/api/media/${id}/usage`,
  )
  return new Set(usage.map((ref) => `${ref.collection}/${ref.slug}`)).size
}

const HERO_NAME = 'e2e-media-hero.png'
const SPARE_NAME = 'e2e-media-spare.png'
const FOLDER_NAME = 'e2e-media-brand'

/** A page that embeds the hero by its stable URL — the hero's one reference */
async function referenceHero(target: Target, hero: MediaItem): Promise<void> {
  const doc = {
    collection: 'pages',
    slug: 'e2e-media-ref',
    fields: { title: 'Media reference', description: 'Seeded by the media spec' },
    body: `## Hero\n\n![Hero](/api/media/${hero.id}/image?preset=xl)\n`,
  }
  await createDocument(target, doc)
}

/** The spare file sits in the spec's folder */
async function folderWithSpare(target: Target, spare: MediaItem): Promise<MediaFolder> {
  const { folders } = await api<{ folders: MediaFolder[] }>(target, '/api/media/folders')
  const folder =
    folders.find((candidate) => candidate.name === FOLDER_NAME) ??
    ((await send(target, 'POST', '/api/media/folders', { name: FOLDER_NAME })) as MediaFolder)
  if (spare.folder !== folder.id) {
    await send(target, 'PUT', `/api/media/${spare.id}/move`, { folderId: folder.id })
  }
  return folder
}

interface Seeded {
  hero: MediaItem
  spare: MediaItem
  folder: MediaFolder
}

/** Idempotent: every step finds what an earlier attempt left before it writes */
async function seed(target: Target): Promise<Seeded> {
  const hero = await ensureFile(target, HERO_NAME, png(800, 600, [15, 118, 110]))
  const spare = await ensureFile(target, SPARE_NAME, png(320, 240, [109, 40, 217]))
  await referenceHero(target, hero)
  const folder = await folderWithSpare(target, spare)
  return { hero, spare, folder }
}

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------

async function openMedia(page: Page): Promise<Locator> {
  await page.goto('/studio/media')
  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { level: 1, name: 'Media' })).toBeVisible()
  await expect(main.getByRole('list', { name: 'Files' })).toBeVisible()
  return main
}

function tileOf(main: Locator, name: string): Locator {
  return main.getByRole('list', { name: 'Files' }).getByRole('button', { name: new RegExp(name) })
}

async function openDrawer(page: Page, name: string): Promise<Locator> {
  const main = await openMedia(page)
  await main.getByRole('searchbox', { name: 'Search media' }).fill(name)
  await tileOf(main, name).click()
  const drawer = page.getByRole('region', { name })
  await expect(drawer.getByRole('heading', { name })).toBeFocused()
  return drawer
}

test.describe('Media', () => {
  test('the header names the store', async ({ page, target }) => {
    await seed(target)
    const info = await api<{ storageLabel: string }>(target, '/api/media/info')
    const main = await openMedia(page)
    await expect(main.locator('header')).toContainText(`Stored in ${info.storageLabel}`)
  })

  test('folders show their counts from the API, and New folder creates one', async ({
    page,
    target,
  }) => {
    const { folder } = await seed(target)
    const { total } = await api<{ total: number }>(target, `/api/media?folder=${folder.id}&limit=1`)
    const main = await openMedia(page)
    const folders = main.getByRole('navigation', { name: 'Folders' })
    await expect(folders.getByRole('button', { name: new RegExp(FOLDER_NAME) })).toContainText(
      String(total),
    )
    const created = `e2e-media-new-${Date.now()}`
    await folders.getByRole('button', { name: 'New folder' }).click()
    await folders.getByRole('textbox', { name: /New folder/ }).fill(created)
    await folders.getByRole('button', { name: 'Create' }).click()
    await expect(folders.getByRole('button', { name: new RegExp(created) })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    const { folders: after } = await api<{ folders: MediaFolder[] }>(target, '/api/media/folders')
    const made = after.find((candidate) => candidate.name === created)
    expect(made).toBeDefined()
    if (made) await send(target, 'DELETE', `/api/media/folders/${made.id}`)
  })

  test('a file dropped on the drop zone is uploaded', async ({ page, target }) => {
    const name = `e2e-media-dropped-${Date.now()}.png`
    const main = await openMedia(page)
    const zone = main.getByRole('region', { name: 'Upload' })
    const bytes = [...png(64, 48, [180, 83, 9])]
    const dataTransfer = await page.evaluateHandle(
      ([data, file]) => {
        const transfer = new DataTransfer()
        transfer.items.add(new File([new Uint8Array(data)], file, { type: 'image/png' }))
        return transfer
      },
      [bytes, name] as const,
    )
    await zone.dispatchEvent('dragover', { dataTransfer })
    await zone.dispatchEvent('drop', { dataTransfer })
    await expect(zone.getByRole('status')).toHaveText('Uploaded 1 file.')
    await expect(tileOf(main, name)).toBeVisible()
    const [stored] = await findFiles(target, name)
    expect(stored?.width).toBe(64)
    if (stored) await send(target, 'DELETE', `/api/media/${stored.id}`)
  })

  test('search shows only the files whose name matches', async ({ page, target }) => {
    await seed(target)
    const main = await openMedia(page)
    await main.getByRole('searchbox', { name: 'Search media' }).fill('e2e-media-spare')
    const expected = await findFiles(target, 'e2e-media-spare')
    await expect(main.getByRole('list', { name: 'Files' }).getByRole('listitem')).toHaveCount(
      expected.length,
    )
    await expect(tileOf(main, SPARE_NAME)).toBeVisible()
  })

  test('bulk select deletes the selected files once confirmed', async ({ page, target }) => {
    const stamp = Date.now()
    const names = [`e2e-media-bulk-a-${stamp}.png`, `e2e-media-bulk-b-${stamp}.png`]
    for (const name of names) await upload(target, name, png(40, 30, [190, 18, 60]))
    const main = await openMedia(page)
    await main.getByRole('searchbox', { name: 'Search media' }).fill(`bulk-a-${stamp}`)
    await main.getByRole('button', { name: 'Bulk select' }).click()
    await main.getByRole('checkbox', { name: `Select ${names[0]}` }).check()
    await main.getByRole('searchbox', { name: 'Search media' }).fill(`bulk-b-${stamp}`)
    await main.getByRole('checkbox', { name: `Select ${names[1]}` }).check()
    const bar = main.getByRole('region', { name: 'Selection' })
    await expect(bar).toContainText('2 selected')
    await bar.getByRole('button', { name: 'Delete' }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete files' })
    for (const name of names) await expect(dialog).toContainText(name)
    await dialog.getByRole('button', { name: 'Delete 2 files' }).click()
    await expect(dialog.getByRole('status')).toContainText('Deleted 2 files.')
    for (const name of names) expect(await findFiles(target, name)).toEqual([])
  })

  test('each tile shows the thumbnail, kind, name, dimensions and reference count', async ({
    page,
    target,
  }) => {
    const { hero } = await seed(target)
    const count = await referencingDocuments(target, hero.id)
    const main = await openMedia(page)
    await main.getByRole('searchbox', { name: 'Search media' }).fill(HERO_NAME)
    const tile = tileOf(main, HERO_NAME)
    await expect(tile.locator('img')).toHaveJSProperty('complete', true)
    await expect(tile).toContainText('PNG')
    await expect(tile).toContainText(`${hero.width} × ${hero.height}`)
    await expect(tile).toContainText(
      `Referenced by ${count} ${count === 1 ? 'document' : 'documents'}`,
    )
  })
})

test.describe('Media › details drawer', () => {
  test('renaming a file in use warns with its reference count first', async ({ page, target }) => {
    const { hero } = await seed(target)
    const count = await referencingDocuments(target, hero.id)
    const drawer = await openDrawer(page, HERO_NAME)
    await expect(drawer).toContainText(`Referenced by ${count}`)
    await drawer.getByRole('textbox', { name: 'Name' }).fill('e2e-media-renamed.png')
    await drawer.getByRole('button', { name: 'Save' }).click()
    const dialog = page.getByRole('dialog', { name: 'Rename a file in use' })
    await expect(dialog).toContainText(
      `${count} ${count === 1 ? 'document uses' : 'documents use'}`,
    )
    await expect(dialog).toContainText(
      'the file and its URL stay the same, so their pages keep the same image',
    )
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    const [kept] = await findFiles(target, HERO_NAME)
    expect(kept?.id).toBe(hero.id)
  })

  test('alt text saves on the file', async ({ page, target }) => {
    const { hero } = await seed(target)
    const drawer = await openDrawer(page, HERO_NAME)
    const alt = `A teal field ${Date.now()}`
    await drawer.getByRole('textbox', { name: 'Alt text' }).fill(alt)
    await drawer.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status', { name: 'Notifications' })).toContainText(
      'Saved on the media file.',
    )
    expect((await api<MediaItem>(target, `/api/media/${hero.id}`)).altText).toBe(alt)
  })

  test('Crop & hotspot opens the image editor', async ({ page, target }) => {
    const { hero } = await seed(target)
    const drawer = await openDrawer(page, HERO_NAME)
    await drawer.getByRole('link', { name: 'Crop & hotspot' }).click()
    await expect(page).toHaveURL(new RegExp(`/studio/media/${hero.id}/edit$`))
  })

  test('Replace keeps the id', async ({ page, target }) => {
    const { spare } = await seed(target)
    const drawer = await openDrawer(page, SPARE_NAME)
    await drawer.locator('input[type="file"]').setInputFiles({
      name: SPARE_NAME,
      mimeType: 'image/png',
      buffer: png(300, 200, [11, 92, 86]),
    })
    await expect(page.getByRole('status', { name: 'Notifications' })).toContainText('keeps its id')
    const replaced = await api<MediaItem>(target, `/api/media/${spare.id}`)
    expect(replaced.id).toBe(spare.id)
    expect([replaced.width, replaced.height]).toEqual([300, 200])
  })

  test('Copy markdown copies the image with its stable URL', async ({ page, context, target }) => {
    const { hero } = await seed(target)
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const drawer = await openDrawer(page, HERO_NAME)
    await drawer.getByRole('button', { name: 'Copy markdown' }).click()
    const saved = await api<MediaItem>(target, `/api/media/${hero.id}`)
    const markdown = `![${saved.altText}](/api/media/${hero.id}/image?preset=xl)`
    await expect(page.getByRole('status', { name: 'Notifications' })).toContainText(
      'Markdown copied',
    )
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(markdown)
  })

  test('Duplicate makes a copy with a new id', async ({ page, target }) => {
    const { spare } = await seed(target)
    const before = await findFiles(target, SPARE_NAME)
    const drawer = await openDrawer(page, SPARE_NAME)
    await drawer.getByRole('button', { name: 'Duplicate' }).click()
    await expect(page.getByRole('status', { name: 'Notifications' })).toContainText('Duplicated')
    const after = await findFiles(target, SPARE_NAME)
    expect(after).toHaveLength(before.length + 1)
    for (const copy of after.filter((file) => file.id !== spare.id)) {
      await send(target, 'DELETE', `/api/media/${copy.id}`)
    }
  })
})

test.describe('Media › image editor', () => {
  test('still crops and saves', async ({ page, target }) => {
    const { hero } = await seed(target)
    await page.goto(`/studio/media/${hero.id}/edit`)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(HERO_NAME)
    const image = page.locator('.image-editor-canvas img')
    await expect(image).toHaveJSProperty('complete', true)
    const box = await image.boundingBox()
    if (!box) throw new Error('The image is not shown')
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.7, { steps: 8 })
    await page.mouse.up()
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status', { name: 'Notifications' })).toContainText(
      'Crop and hotspot saved.',
    )
    const saved = await api<MediaItem>(target, `/api/media/${hero.id}`)
    expect(saved.crop?.width).toBeGreaterThan(0)
    expect(saved.crop?.height).toBeGreaterThan(0)
    await send(target, 'PUT', `/api/media/${hero.id}`, { crop: null, hotspot: null })
  })
})

/** Studio's own theme key, set before the page loads */
const THEME_KEY = 'krantho-studio-theme'

for (const theme of ['light', 'dark'] as const) {
  for (const width of [1280, 390]) {
    test.describe(`Media in the ${theme} theme at ${width}px`, () => {
      test.use({ viewport: { width, height: 900 } })

      test('reads clearly and fits the width, the drawer open', async ({ page, target }) => {
        await seed(target)
        await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
          THEME_KEY,
          theme,
        ] as const)
        await openDrawer(page, HERO_NAME)
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        )
        expect(overflow).toBeLessThanOrEqual(0)
        const results = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
        const violations = results.violations.flatMap((violation) =>
          violation.nodes.map((node) => `${node.target.join(' ')}: ${node.failureSummary ?? ''}`),
        )
        expect(violations).toEqual([])
      })
    })
  }
}
