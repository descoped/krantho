import { expect, test } from '../src/fixtures.js'

test('Studio renders its app root with no console errors', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto('/studio')
  await expect(page.locator('#root > *').first()).toBeVisible()
  await page.waitForLoadState('networkidle')

  expect(errors).toEqual([])
})
