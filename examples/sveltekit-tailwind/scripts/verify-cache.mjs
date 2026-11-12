// Checks the built server (`pnpm run build` first) under every page cache
// topology: `node build` on a fresh SQLite data directory per topology, then
// the headers on /about, /sitemap.xml from the API, /sitemap.xml and
// /robots.txt never cached at the CDN, a signed preview link that renders a
// draft, and — behind a CDN — a publish through the API that shows on /about.
// No request leaves this machine: the Cloud CDN API is stubbed (cdn-stub.mjs),
// and the CloudFront and Vercel SDKs are not installed, so their purges fail
// and are logged.
//
//   node scripts/verify-cache.mjs
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const EXAMPLE_DIR = fileURLToPath(new URL('..', import.meta.url))
const API_TOKEN = 'verify-cache-token'
const DOCUMENT_TAG = 'k:d:pages:about'
/** Tags of the page's JSON-LD read: every render of /about records them */
const SEO_TAGS = ['k:seo', 'k:seo:doc%3apages%2fabout']

/**
 * A topology's `cdn.control` is the CDN's own lifetime header, or null when the
 * CDN reads the lifetime from `Cache-Control` itself (CloudFront)
 * @typedef {{ name: string, env: Record<string, string>, cdn: { control: string | null, tag: string } | null }} Topology
 * @typedef {{ origin: string, child: import('node:child_process').ChildProcess, log: string[] }} Server
 */

/** Every CDN-side header any provider sets; a topology may set only its own */
const CDN_HEADERS = [
  'cdn-cache-control',
  'vercel-cdn-cache-control',
  'cache-tag',
  'vercel-cache-tag',
  'x-krantho-cache-tag',
]

/** @type {Topology[]} */
const TOPOLOGIES = [
  { name: 'default (cache.pages none)', env: {}, cdn: null },
  {
    name: 'cdn + gcp',
    env: {
      KRANTHO_CACHE_PAGES: 'cdn',
      KRANTHO_CACHE_CDN_PROVIDER: 'gcp',
      KRANTHO_CACHE_CDN_GCP_PROJECT: 'verify-project',
      KRANTHO_CACHE_CDN_GCP_URL_MAP: 'verify-url-map',
    },
    cdn: { control: 'cdn-cache-control', tag: 'cache-tag' },
  },
  {
    name: 'cdn + cloudfront',
    env: {
      KRANTHO_CACHE_PAGES: 'cdn',
      KRANTHO_CACHE_CDN_PROVIDER: 'cloudfront',
      KRANTHO_CACHE_CDN_CLOUDFRONT_DISTRIBUTION_ID: 'EVERIFYDISTRIBUTION',
    },
    cdn: { control: null, tag: 'x-krantho-cache-tag' },
  },
  {
    name: 'cdn + vercel',
    env: { KRANTHO_CACHE_PAGES: 'cdn', KRANTHO_CACHE_CDN_PROVIDER: 'vercel' },
    cdn: { control: 'vercel-cdn-cache-control', tag: 'vercel-cache-tag' },
  },
]

/**
 * @param {boolean} condition
 * @param {string} message
 */
function check(condition, message) {
  if (!condition) throw new Error(message)
  console.log(`  ok  ${message}`)
}

/** @returns {Promise<number>} */
function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = /** @type {import('node:net').AddressInfo} */ (server.address())
      server.close(() => resolve(address.port))
    })
  })
}

/** The environment without any krantho setting the developer's shell carries */
function cleanEnv() {
  /** @type {Record<string, string | undefined>} */
  const env = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('KRANTHO_') && !key.startsWith('OIDC_')) env[key] = value
  }
  return env
}

/**
 * @param {Topology} topology
 * @param {string} dataDir
 * @returns {Promise<Server>}
 */
async function startServer(topology, dataDir) {
  const port = await freePort()
  const env = {
    ...cleanEnv(),
    ...topology.env,
    HOST: '127.0.0.1',
    PORT: String(port),
    KRANTHO_PATHS_DATA_DIR: dataDir,
    KRANTHO_AUTH: 'token',
    KRANTHO_API_TOKEN: API_TOKEN,
    KRANTHO_TOKEN_ROLE: 'editor',
    KRANTHO_JWT_SECRET: 'verify-cache-jwt-secret',
  }
  const child = spawn(process.execPath, ['--import', './scripts/cdn-stub.mjs', 'build'], {
    cwd: EXAMPLE_DIR,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  /** @type {string[]} */
  const log = []
  child.stdout.on('data', (chunk) => log.push(String(chunk)))
  child.stderr.on('data', (chunk) => log.push(String(chunk)))
  const origin = `http://127.0.0.1:${port}`
  await waitForServer(origin, child, log)
  return { origin, child, log }
}

/**
 * @param {string} origin
 * @param {import('node:child_process').ChildProcess} child
 * @param {string[]} log
 */
async function waitForServer(origin, child, log) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited:\n${log.join('')}`)
    try {
      const response = await fetch(`${origin}/api/capabilities`)
      if (response.ok) return
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`server did not start:\n${log.join('')}`)
}

/**
 * @param {Topology} topology
 * @param {Response} response
 */
function checkPageHeaders(topology, response) {
  const present = CDN_HEADERS.filter((name) => response.headers.has(name))
  if (!topology.cdn) {
    check(present.length === 0, `/about carries no CDN headers (found: ${present.join(', ') || 'none'})`)
    return
  }
  const { control, tag } = topology.cdn
  const own = control ? [control, tag] : [tag]
  check(
    present.every((name) => own.includes(name)),
    `/about carries only ${own.join(' and ')} (found: ${present.join(', ')})`,
  )
  const tags = (response.headers.get(tag) ?? '').split(',')
  check(tags.includes(DOCUMENT_TAG), `${tag} contains ${DOCUMENT_TAG}: ${tags.join(',')}`)
  check(
    SEO_TAGS.every((seoTag) => tags.includes(seoTag)),
    `${tag} contains the JSON-LD tags ${SEO_TAGS.join(', ')}`,
  )
  const cacheControl = response.headers.get('cache-control')
  if (!control) {
    check(!response.headers.has('cdn-cache-control'), '/about sends no CDN-Cache-Control')
    check(
      cacheControl?.startsWith('public, max-age=0, s-maxage=') === true &&
        cacheControl.includes('stale-while-revalidate='),
      `Cache-Control carries the CDN lifetime: ${cacheControl}`,
    )
    return
  }
  check(
    response.headers.get(control)?.startsWith('public, s-maxage=') === true,
    `${control}: ${response.headers.get(control)}`,
  )
  check(cacheControl === 'public, max-age=0, must-revalidate', `Cache-Control: ${cacheControl}`)
}

/** @param {string} origin */
async function checkSitemap(origin) {
  const [site, api] = await Promise.all([
    fetch(`${origin}/sitemap.xml`),
    fetch(`${origin}/api/seo/sitemap`),
  ])
  const [siteXml, apiXml] = await Promise.all([site.text(), api.text()])
  check(site.status === 200 && siteXml.includes('<urlset'), '/sitemap.xml answers a sitemap')
  check(siteXml === apiXml, '/sitemap.xml is the API sitemap (/api/seo/sitemap)')
}

/**
 * A route that reads no tagged content: nothing would purge it, so the CDN never keeps it
 * @param {string} origin
 * @param {string} path
 */
async function checkUncached(origin, path) {
  const response = await fetch(`${origin}${path}`)
  await response.text()
  check(response.status === 200, `${path}: ${response.status}`)
  check(response.headers.get('cache-control') === 'no-cache', `${path} Cache-Control: ${response.headers.get('cache-control')}`)
  const present = CDN_HEADERS.filter((name) => response.headers.has(name))
  check(present.length === 0, `${path} carries no CDN headers (found: ${present.join(', ') || 'none'})`)
}

/** @param {string} origin */
async function login(origin) {
  const response = await fetch(`${origin}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: API_TOKEN }),
  })
  check(response.status === 200, `editor login: ${response.status}`)
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ')
}

/**
 * Save a draft the way the Studio editor does: a full save (fields and body)
 * writes a new draft version and leaves the live one published. A fields-only
 * update would change the live document in place — with `status: 'draft'` it
 * would unpublish the page.
 * @param {string} origin
 * @param {string} cookie
 * @param {string} title
 */
async function saveDraft(origin, cookie, title) {
  const current = await fetch(`${origin}/api/content/pages/about`, { headers: { cookie } })
  const doc = await current.json()
  const response = await fetch(`${origin}/api/content/pages/about`, {
    method: 'PUT',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ fields: { ...doc.fields, title }, body: doc.body }),
  })
  check(response.ok, `draft saved: ${response.status}`)
}

/**
 * @param {string} origin
 * @param {string} cookie
 * @param {string} title
 * @param {Topology} topology
 */
async function checkPreview(origin, cookie, title, topology) {
  await saveDraft(origin, cookie, title)

  const link = await fetch(`${origin}/api/preview?collection=pages&slug=about`, {
    headers: { cookie },
    redirect: 'manual',
  })
  const location = link.headers.get('location') ?? ''
  check(link.status === 307 && location.startsWith('/about?krantho-preview='), `preview link: ${link.status} ${location}`)

  const preview = await fetch(`${origin}${location}`)
  const html = await preview.text()
  check(preview.status === 200 && html.includes(title), 'the preview link renders the draft')
  check(preview.headers.get('cache-control')?.includes('no-store') === true, `preview Cache-Control: ${preview.headers.get('cache-control')}`)
  check(preview.headers.get('x-robots-tag') === 'noindex', 'preview X-Robots-Tag: noindex')
  const leaked = CDN_HEADERS.filter((name) => preview.headers.has(name))
  check(leaked.length === 0, `preview carries no CDN headers (found: ${leaked.join(', ') || 'none'})`)

  const published = await fetch(`${origin}/about`)
  const publishedHtml = await published.text()
  check(
    published.status === 200 && !publishedHtml.includes(title),
    `/about without the link still renders the published version: ${published.status}`,
  )
  checkPageHeaders(topology, published)
}

/**
 * Publish the draft through the API: behind a CDN the next render of /about
 * shows it — the purge empties the CDN, and the page loader keeps no read cache
 * of its own there. With `cache.pages` 'none' the loader caches reads for
 * `content.cache.ttlMs`, so a publish reaches the page after at most that long
 * @param {string} origin
 * @param {string} cookie
 * @param {string} title
 * @param {Topology} topology
 */
async function checkPublish(origin, cookie, title, topology) {
  const response = await fetch(`${origin}/api/content/pages/about/publish`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'published' }),
  })
  check(response.ok, `published through the API: ${response.status}`)
  const about = await fetch(`${origin}/about`)
  const html = await about.text()
  check(about.status === 200 && html.includes(title), '/about renders the published change')
  checkPageHeaders(topology, about)
}

/** @param {Topology} topology */
async function verify(topology) {
  console.log(`\n${topology.name}`)
  const dataDir = await mkdtemp(join(tmpdir(), 'krantho-verify-cache-'))
  const server = await startServer(topology, dataDir)
  try {
    const about = await fetch(`${server.origin}/about`)
    await about.text()
    check(about.status === 200, `/about: ${about.status}`)
    checkPageHeaders(topology, about)
    await checkSitemap(server.origin)
    await checkUncached(server.origin, '/sitemap.xml')
    await checkUncached(server.origin, '/robots.txt')
    const cookie = await login(server.origin)
    const title = `Draft preview ${Date.now()}`
    await checkPreview(server.origin, cookie, title, topology)
    if (topology.cdn) await checkPublish(server.origin, cookie, title, topology)
  } catch (error) {
    console.error(server.log.join(''))
    throw error
  } finally {
    server.child.kill()
    await rm(dataDir, { recursive: true, force: true })
  }
}

for (const topology of TOPOLOGIES) await verify(topology)
console.log('\nAll page cache topologies verified.')
