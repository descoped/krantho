// Preloaded into the server by verify-cache.mjs (`node --import`): answers the
// Cloud CDN invalidation API and the metadata server locally, so a purge the
// server starts during the check never reaches Google Cloud.
const STUBBED_HOSTS = new Set(['compute.googleapis.com', 'metadata.google.internal'])
const realFetch = globalThis.fetch

/**
 * @param {string | URL | Request} input
 * @param {RequestInit} [init]
 */
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input))
  if (!STUBBED_HOSTS.has(url.hostname)) return realFetch(input, init)
  console.log(`[cdn-stub] ${init?.method ?? 'GET'} ${url.href}`)
  const body = url.hostname === 'metadata.google.internal' ? { access_token: 'stub', expires_in: 3600 } : {}
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}
