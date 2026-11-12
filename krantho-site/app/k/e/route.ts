// First-party analytics endpoint: app/analytics.tsx posts events here and this
// route forwards them to Plausible, so the browser never contacts plausible.io.
//
// The upstream request gets a fresh header set — the visitor IP and user agent
// Plausible needs to count unique visitors, and nothing else. Cookies are never
// forwarded, so krantho session cookies stay on this site. Without the real IP
// Plausible's bot filter drops the event while still answering 202.
const PLAUSIBLE_EVENT_API = 'https://plausible.io/api/event'

// Every event must reach Plausible; a cached response would swallow it
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  const headers = new Headers({
    'Content-Type': request.headers.get('content-type') ?? 'text/plain',
    'User-Agent': request.headers.get('user-agent') ?? '',
  })
  const ip = visitorIp(request.headers)
  if (ip) headers.set('X-Forwarded-For', ip)
  // Lets an operator ask Plausible which IP it recorded
  const debug = request.headers.get('x-debug-request')
  if (debug) headers.set('X-Debug-Request', debug)

  const upstream = await fetch(PLAUSIBLE_EVENT_API, {
    method: 'POST',
    headers,
    body: await request.text(),
    cache: 'no-store',
  })

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': upstream.headers.get('content-type') ?? 'text/plain',
    },
  })
}

/** Vercel sets x-real-ip to the client address; x-forwarded-for starts with it */
function visitorIp(headers: Headers): string | undefined {
  const realIp = headers.get('x-real-ip')
  if (realIp) return realIp
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined
}
