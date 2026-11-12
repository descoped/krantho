import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import type { Request as ExpressRequest, Response as ExpressResponse, NextFunction } from 'express'
import {
  createStudioServer,
  createHandler,
  renderCachedPage,
  toWebRequest,
  writeWebResponse,
} from '@krantho/server-node'
import type { RenderedPage } from '@krantho/server-node'
import config from './krantho.config'
import { collections } from './krantho.collections'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isProduction = process.env.NODE_ENV === 'production'
const PORT = Number(process.env['PORT'] ?? 4005)
const HOST = process.env['HOST']
const SEO_GENERATED = path.join(__dirname, '..', 'content', 'seo', 'generated')

/** Renders the page for a request path with its query string */
type PageRenderer = (url: string) => Promise<RenderedPage>

/** What entry-server.tsx renders */
interface AppRender {
  render: (url: string) => Promise<{ status: number; html: string; head: string }>
}

const api = createHandler({
  config,
  collections,
  // Editors preview drafts through a short-lived link signed with auth.jwtSecret
  sitePreview: 'signed-url',
})
const serveStudio = createStudioServer(config)

function ownsPath(prefix: string, pathname: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

/** The krantho API at /api */
async function apiRoute(req: ExpressRequest, res: ExpressResponse, next: NextFunction): Promise<void> {
  if (!ownsPath('/api', req.path)) return next()
  try {
    await writeWebResponse(res, await api.handle(await toWebRequest(req)))
  } catch (e) {
    next(e)
  }
}

/** krantho Studio at /studio */
async function studioRoute(req: ExpressRequest, res: ExpressResponse, next: NextFunction): Promise<void> {
  if (!ownsPath('/studio', req.path)) return next()
  try {
    const url = new URL(`http://localhost${req.originalUrl}`)
    await writeWebResponse(res, serveStudio({ url, cookie: req.headers.cookie }))
  } catch (e) {
    next(e)
  }
}

/**
 * The sitemap and robots.txt come from the krantho API, built from the
 * published content and site.baseUrl. They read no tagged content, so no purge
 * would reach them at a CDN: they answer no-cache.
 */
function seoRoute(apiPath: string) {
  return async (req: ExpressRequest, res: ExpressResponse, next: NextFunction): Promise<void> => {
    try {
      const response = await api.handle(new Request(`http://${req.headers.host ?? 'localhost'}${apiPath}`))
      res.setHeader('Cache-Control', 'no-cache')
      await writeWebResponse(res, response)
    } catch (e) {
      next(e)
    }
  }
}

/**
 * Every page renders under the page cache rules: tagged CDN headers when
 * `cache.pages` is 'cdn', drafts behind a signed preview link. The rules read
 * the full request URL (`req.originalUrl`), and every header the page carries
 * — a cookie included — is returned by the render and set here, never on `res`
 * inside it, so the rules see it.
 */
function pageRoute(renderPage: PageRenderer) {
  return async (req: ExpressRequest, res: ExpressResponse, next: NextFunction): Promise<void> => {
    try {
      const page = await renderCachedPage({ url: req.originalUrl, method: req.method }, config, () =>
        renderPage(req.originalUrl),
      )
      for (const [name, value] of Object.entries(page.headers)) res.setHeader(name, value)
      res.status(page.status).type('html').send(page.html)
    } catch (e) {
      next(e)
    }
  }
}

function fillTemplate(template: string, rendered: { html: string; head: string }): string {
  return template.replace('<!--head-outlet-->', rendered.head).replace('<!--ssr-outlet-->', rendered.html)
}

async function productionRenderer(app: express.Express): Promise<PageRenderer> {
  const clientDir = path.resolve(__dirname, 'dist/client')
  // index: false — `/` is a page, rendered below, not the built index.html
  app.use(express.static(clientDir, { index: false }))
  const template = fs.readFileSync(path.join(clientDir, 'index.html'), 'utf-8')
  // The server bundle exists only after the build, so its path is a value, not a module
  // the type checker resolves
  const serverEntry = './dist/server/entry-server.js'
  const { render } = (await import(serverEntry)) as AppRender
  return async (url) => {
    const rendered = await render(url)
    return { status: rendered.status, html: fillTemplate(template, rendered) }
  }
}

async function developmentRenderer(app: express.Express): Promise<PageRenderer> {
  const { createServer: createViteServer } = await import('vite')
  const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'custom' })
  app.use(vite.middlewares)
  return async (url) => {
    try {
      const template = await vite.transformIndexHtml(url, fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8'))
      const { render } = (await vite.ssrLoadModule('/src/entry-server.tsx')) as AppRender
      const rendered = await render(url)
      return { status: rendered.status, html: fillTemplate(template, rendered) }
    } catch (e) {
      vite.ssrFixStacktrace(e as Error)
      throw e
    }
  }
}

async function createServer(): Promise<void> {
  const app = express()
  app.use(apiRoute)
  app.use(studioRoute)
  app.get('/sitemap.xml', seoRoute('/api/seo/sitemap'))
  app.get('/robots.txt', seoRoute('/api/seo/robots.txt'))
  app.get('/llms.txt', (_req, res) => {
    try {
      const content = fs.readFileSync(path.join(SEO_GENERATED, 'llms.txt'), 'utf-8')
      res.set('Content-Type', 'text/plain; charset=utf-8').send(content)
    } catch {
      res.status(404).send('llms.txt not generated — run seo:generate')
    }
  })

  const renderPage = isProduction ? await productionRenderer(app) : await developmentRenderer(app)
  app.use(pageRoute(renderPage))

  const onListen = () => console.log(`React SSR running at http://localhost:${PORT}`)
  if (HOST) app.listen(PORT, HOST, onListen)
  else app.listen(PORT, onListen)
}

createServer()
