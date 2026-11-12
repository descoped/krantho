import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, test } from '../src/fixtures.js'

/** Studio's own key — never the site's `krantho-theme` */
const STORAGE_KEY = 'krantho-studio-theme'

type Theme = 'light' | 'dark' | 'system'
type Scheme = 'light' | 'dark'

/** What the page reported about `data-theme` while it loaded */
interface ThemeAtLoad {
  /** `data-theme` when the parser first inserted <body>, before anything could paint */
  atBody: string | null
  /** `data-theme` at DOMContentLoaded */
  atDomContentLoaded: string | null
}

/**
 * Store the theme choice (or none) before any page script runs, and record `data-theme` the
 * moment <body> appears — a value there was set before first paint.
 */
async function prepare(page: Page, theme: Theme | null): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      if (value === null) localStorage.removeItem(key)
      else localStorage.setItem(key, value)

      const report: { atBody?: string | null; atDomContentLoaded?: string | null } = {}
      Object.defineProperty(window, '__kranthoThemeAtLoad', { value: report })
      const read = (): string | null => document.documentElement.getAttribute('data-theme')
      const observer = new MutationObserver(() => {
        if (document.body === null) return
        report.atBody = read()
        observer.disconnect()
      })
      observer.observe(document, { childList: true, subtree: true })
      document.addEventListener('DOMContentLoaded', () => {
        report.atDomContentLoaded = read()
      })
    },
    [STORAGE_KEY, theme] as const,
  )
}

async function openStudio(page: Page, scheme: Scheme): Promise<ThemeAtLoad> {
  await page.emulateMedia({ colorScheme: scheme })
  await page.goto('/studio')
  await expect(page.locator('#root > *').first()).toBeVisible()
  return page.evaluate(() => {
    const report = (window as unknown as { __kranthoThemeAtLoad: Partial<ThemeAtLoad> })
      .__kranthoThemeAtLoad
    return {
      atBody: report.atBody ?? null,
      atDomContentLoaded: report.atDomContentLoaded ?? null,
    }
  })
}

/** The colour scheme the tokens resolved to, light or dark */
function appliedScheme(page: Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)
}

test.describe('theme', () => {
  const stored: { theme: Theme; scheme: Scheme; expected: Scheme }[] = [
    { theme: 'light', scheme: 'dark', expected: 'light' },
    { theme: 'dark', scheme: 'light', expected: 'dark' },
    { theme: 'system', scheme: 'dark', expected: 'dark' },
    { theme: 'system', scheme: 'light', expected: 'light' },
  ]

  for (const { theme, scheme, expected } of stored) {
    test(`a stored "${theme}" choice with the OS in ${scheme} shows ${expected}, set before first paint`, async ({
      page,
    }) => {
      await prepare(page, theme)
      const atLoad = await openStudio(page, scheme)

      expect(atLoad.atBody).toBe(theme)
      expect(atLoad.atDomContentLoaded).toBe(theme)
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      expect(await appliedScheme(page)).toBe(expected)
    })
  }

  for (const scheme of ['light', 'dark'] as const) {
    test(`with no stored choice the OS scheme (${scheme}) is followed`, async ({ page }) => {
      await prepare(page, null)
      const atLoad = await openStudio(page, scheme)

      expect(atLoad.atBody).toBe('system')
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'system')
      expect(await appliedScheme(page)).toBe(scheme)
    })
  }

  test('every font is served from the Studio origin', async ({ page, baseURL }) => {
    const fonts: string[] = []
    page.on('request', (request) => {
      const url = request.url()
      if (request.resourceType() === 'font' || /fonts\.(googleapis|gstatic)\.com/.test(url)) {
        fonts.push(url)
      }
    })

    await prepare(page, 'light')
    await openStudio(page, 'light')
    await page.evaluate(async () => {
      await document.fonts.ready
    })
    await page.waitForLoadState('networkidle')

    // The brand mark and the page title use the bundled display face
    expect(fonts.length).toBeGreaterThan(0)
    const origin = new URL(baseURL ?? '').origin
    for (const url of fonts) expect(new URL(url).origin, url).toBe(origin)
  })

  for (const theme of ['light', 'dark'] as const) {
    test(`the shell has no colour-contrast violation in the ${theme} theme`, async ({ page }) => {
      await prepare(page, theme)
      await openStudio(page, theme)
      await page.waitForLoadState('networkidle')

      const results = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
      const violations = results.violations.flatMap((violation) =>
        violation.nodes.map((node) => `${node.target.join(' ')}: ${node.failureSummary ?? ''}`),
      )
      expect(violations).toEqual([])
    })
  }
})
