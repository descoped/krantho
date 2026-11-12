import type { Page } from '@playwright/test'
import { expect, test } from '../src/fixtures.js'

// The example sites offer system, light and dark themes. Their pages are cached and shared, so
// the server cannot render a visitor's choice: a script in <head> applies it before first paint.
// krantho.com has its own scheme (`data-theme`), so its target is not part of this.

type Theme = 'light' | 'dark'

/** Store the visitor's choice (or none), and record the theme class on <html> when <body> appears */
async function prepare(page: Page, stored: Theme | null): Promise<void> {
  await page.addInitScript((value) => {
    if (value === null) localStorage.removeItem('theme')
    else localStorage.setItem('theme', value)
    const report: { atBody?: string } = {}
    Object.defineProperty(window, '__themeAtBody', { value: report })
    const observer = new MutationObserver(() => {
      if (document.body === null) return
      report.atBody = document.documentElement.className
      observer.disconnect()
    })
    observer.observe(document, { childList: true, subtree: true })
  }, stored)
}

test.describe('the example sites’ theme', () => {
  test.beforeEach(({ target }) => {
    test.skip(target.site.name === 'krantho-site', 'krantho.com applies its own theme scheme')
  })

  const cases: { stored: Theme | null; os: Theme; expected: Theme }[] = [
    { stored: 'dark', os: 'light', expected: 'dark' },
    { stored: 'light', os: 'dark', expected: 'light' },
    { stored: null, os: 'dark', expected: 'dark' },
    { stored: null, os: 'light', expected: 'light' },
  ]

  for (const { stored, os, expected } of cases) {
    test(`${stored ? `a stored ${stored} choice` : 'no stored choice'} with the OS in ${os} shows ${expected}, set before first paint`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: os })
      await prepare(page, stored)
      await page.goto('/')
      const atBody = await page.evaluate(
        () => (window as unknown as { __themeAtBody: { atBody?: string } }).__themeAtBody.atBody,
      )
      // The class was there when <body> was parsed, before anything could paint
      expect(atBody?.split(/\s+/)).toContain(expected)
      expect(atBody?.split(/\s+/)).not.toContain(expected === 'dark' ? 'light' : 'dark')
    })
  }

  test('the toggle still switches live', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await prepare(page, 'light')
    await page.goto('/')
    const toggle = page.getByRole('button', { name: /^Theme: /i }).first()
    await expect(toggle).toBeVisible()
    await toggle.click()
    await expect(page.locator('html')).toHaveClass(/\bdark\b/)
  })
})
