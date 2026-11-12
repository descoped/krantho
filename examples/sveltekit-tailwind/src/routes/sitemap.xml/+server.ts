import type { RequestHandler } from '@sveltejs/kit'

// The krantho API builds the sitemap from the published content and site.baseUrl.
// It reads no tagged content, so no purge would reach it at a CDN: keep it uncached there.
export const GET: RequestHandler = async ({ fetch }) => {
  const sitemap = await fetch('/api/seo/sitemap')
  const response = new Response(sitemap.body, sitemap)
  response.headers.set('cache-control', 'no-cache')
  return response
}
