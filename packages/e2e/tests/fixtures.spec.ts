import {
  createDocument,
  expect,
  OTHER_USER,
  publishDocument,
  readPublicPage,
  saveDocument,
  seedForeignLock,
  test,
} from '../src/fixtures.js'

const SERVICE = {
  collection: 'services',
  slug: 'e2e-fixture-service',
  fields: {
    title: 'Fixture service',
    description: 'Seeded by the e2e fixtures',
    ingress: 'First ingress',
  },
}

test('a document created, saved and published through the API shows on its public page', async ({
  target,
}) => {
  const created = await createDocument(target, SERVICE)
  expect(created.slug).toBe(SERVICE.slug)

  const saved = await saveDocument(target, {
    ...SERVICE,
    fields: { ...SERVICE.fields, ingress: 'Saved ingress' },
  })
  expect(saved.version).toBeGreaterThan(created.version)

  await publishDocument(target, SERVICE.collection, SERVICE.slug)

  const page = await readPublicPage(target, `/services/${SERVICE.slug}`)
  expect(page.status).toBe(200)
  expect(page.html).toContain('Fixture service')
  expect(page.html).toContain('Saved ingress')
})

test('a lock seeded for another user is listed by the API', async ({ target }) => {
  await seedForeignLock(target, 'pages', 'about')

  const res = await fetch(new URL('/api/locks', target.baseURL))
  const { locks } = (await res.json()) as { locks: { slug: string; lockedBy: string }[] }

  expect(locks).toContainEqual(expect.objectContaining({ slug: 'about', lockedBy: OTHER_USER }))
})
