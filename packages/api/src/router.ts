import type { ApiContext, ApiHandler, ApiRequest, ApiResponse } from './types.js'

interface Route {
  method: string
  pattern: string
  paramNames: string[]
  regex: RegExp
  handler: ApiHandler
}

/** Parse a route pattern like '/api/content/:collection/:slug' into a regex */
function compilePattern(pattern: string): { regex: RegExp; paramNames: string[] } {
  const paramNames: string[] = []
  const regexStr = pattern.replace(/:(\w+)/g, (_, name) => {
    paramNames.push(name)
    return '([^/]+)'
  })
  return { regex: new RegExp(`^${regexStr}$`), paramNames }
}

/** Match a request path against a route and extract params */
function matchRoute(
  req: ApiRequest,
  routes: readonly Route[],
): { route: Route; params: Record<string, string> } | undefined {
  for (const route of routes) {
    if (route.method !== req.method) continue
    const match = route.regex.exec(req.path)
    if (!match) continue

    const params: Record<string, string> = { ...req.params }
    for (let i = 0; i < route.paramNames.length; i++) {
      const name = route.paramNames[i]
      const value = match[i + 1]
      if (name && value) {
        params[name] = value
      }
    }
    return { route, params }
  }
  return undefined
}

export class ApiRouter {
  private readonly routes: Route[] = []

  /** Register a route */
  add(method: string, pattern: string, handler: ApiHandler): void {
    const { regex, paramNames } = compilePattern(pattern)
    this.routes.push({ method, pattern, paramNames, regex, handler })
  }

  /** List all registered routes (for OpenAPI spec generation) */
  listRoutes(): Array<{ method: string; pattern: string }> {
    return this.routes.map((r) => ({ method: r.method, pattern: r.pattern }))
  }

  /** Handle an incoming request */
  async handle(req: ApiRequest, ctx: ApiContext): Promise<ApiResponse> {
    const matched = matchRoute(req, this.routes)
    if (!matched) {
      return { status: 404, body: { error: `No handler for ${req.method} ${req.path}` } }
    }

    const enrichedReq: ApiRequest = { ...req, params: matched.params }
    return matched.route.handler(enrichedReq, ctx)
  }
}
