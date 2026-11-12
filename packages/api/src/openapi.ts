import type { AuthSection } from '@krantho/config'
import { accessCookieName } from './cookies.js'
import type { ApiRouter } from './router.js'
import type { ApiHandler } from './types.js'

/** Infer a tag from an API route path */
function routeTag(path: string): string {
  if (path.startsWith('/api/auth')) return 'Auth'
  if (path.startsWith('/api/assistant')) return 'Assistant'
  if (path.includes('/versions')) return 'Versions'
  if (path.includes('/lock')) return 'Locking'
  if (path.includes('/publish')) return 'Publishing'
  if (path.includes('/search')) return 'Search'
  if (path.startsWith('/api/content')) return 'Content'
  if (path.startsWith('/api/collections')) return 'Collections'
  if (path.startsWith('/api/schema')) return 'Schema'
  if (path.startsWith('/api/seo')) return 'SEO'
  if (path.startsWith('/api/media')) return 'Media'
  if (path.startsWith('/api/checkpoints')) return 'Checkpoints'
  if (path.startsWith('/api/webhooks')) return 'Webhooks'
  if (path.startsWith('/api/users')) return 'Users'
  if (path.startsWith('/api/settings')) return 'Settings'
  if (path.startsWith('/api/site-config')) return 'Site Config'
  if (path.startsWith('/api/migration')) return 'Migrations'
  if (path.startsWith('/api/export') || path.includes('/export')) return 'Import/Export'
  if (path.startsWith('/api/import') || path.includes('/import')) return 'Import/Export'
  return 'Other'
}

/** Convert :param to {param} */
function toOpenApiPath(pattern: string): string {
  return pattern.replace(/:([a-zA-Z]+)/g, '{$1}')
}

/** Extract path parameters */
function extractParams(
  pattern: string,
): Array<{ name: string; in: string; required: boolean; schema: { type: string } }> {
  const params: Array<{ name: string; in: string; required: boolean; schema: { type: string } }> =
    []
  for (const match of pattern.matchAll(/:([a-zA-Z]+)/g)) {
    params.push({ name: match[1]!, in: 'path', required: true, schema: { type: 'string' } })
  }
  return params
}

/** Build OpenAPI 3.1 spec from router */
export function buildOpenApiSpec(
  router: ApiRouter,
  site: { name: string; baseUrl: string },
  auth: AuthSection,
): Record<string, unknown> {
  const routes = router.listRoutes()
  const paths: Record<string, Record<string, unknown>> = {}

  for (const route of routes) {
    if (route.pattern === '/api/openapi.json' || route.pattern === '/api/docs') continue

    const openApiPath = toOpenApiPath(route.pattern)
    const method = route.method.toLowerCase()
    const tag = routeTag(route.pattern)
    const params = extractParams(route.pattern)

    if (!paths[openApiPath]) paths[openApiPath] = {}

    const operation: Record<string, unknown> = {
      tags: [tag],
      summary: `${route.method} ${route.pattern}`,
      responses: {
        '200': { description: 'Success' },
        '400': { description: 'Bad Request' },
        '404': { description: 'Not Found' },
      },
    }

    if (params.length > 0) operation.parameters = params

    if (['post', 'put', 'patch'].includes(method)) {
      operation.requestBody = {
        content: { 'application/json': { schema: { type: 'object' } } },
      }
    }

    paths[openApiPath][method] = operation
  }

  const spec: Record<string, unknown> = {
    openapi: '3.1.0',
    info: {
      title: `${site.name} API`,
      version: '1.0.0',
      description: 'krantho CMS REST API',
    },
    servers: [{ url: site.baseUrl }],
    paths,
  }

  if (auth.mode !== 'none') {
    spec.components = {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer' },
        cookieAuth: { type: 'apiKey', in: 'cookie', name: accessCookieName(auth.session) },
      },
    }
    spec.security = [{ bearerAuth: [] }, { cookieAuth: [] }]
  }

  return spec
}

/** GET /api/openapi.json */
export function createOpenApiSpecHandler(router: ApiRouter): ApiHandler {
  return async (_req, ctx) => {
    const spec = buildOpenApiSpec(router, ctx.config.site, ctx.config.auth)
    return { status: 200, body: spec }
  }
}

/** GET /api/docs — Scalar UI */
export function createOpenApiDocsHandler(): ApiHandler {
  return async (_req, ctx) => {
    const html = `<!doctype html>
<html>
<head>
  <title>${ctx.config.site.name} — API Docs</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body>
  <script id="api-reference" data-url="${ctx.config.site.baseUrl}/api/openapi.json"></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.28.12"></script>
</body>
</html>`
    return { status: 200, headers: { 'Content-Type': 'text/html' }, body: html }
  }
}
