import { loadSeoText } from '$lib/seo'

export function GET(): Response {
  const content = loadSeoText('llms.txt')
  if (!content) {
    return new Response('llms.txt not generated — run seo:generate', { status: 404 })
  }
  return new Response(content, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
