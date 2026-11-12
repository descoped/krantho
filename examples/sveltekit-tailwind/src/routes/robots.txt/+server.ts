import type { RequestHandler } from '@sveltejs/kit'

// The krantho API answers robots.txt from site.baseUrl and the robots overrides in its SEO settings.
// It reads no tagged content, so no purge would reach it at a CDN: keep it uncached there.
export const GET: RequestHandler = async ({ fetch }) => {
  const robots = await fetch('/api/seo/robots.txt')
  const response = new Response(robots.body, robots)
  response.headers.set('cache-control', 'no-cache')
  return response
}
