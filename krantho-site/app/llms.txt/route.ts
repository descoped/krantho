import { llmsIndex, TEXT_HEADERS } from '../components/docs-llms'

// /llms.txt — a linked index of the docs and product pages for language models,
// written per request from the published documents (no revalidate export, so
// the build never reads the database).

export async function GET(): Promise<Response> {
  return new Response(await llmsIndex(), { headers: TEXT_HEADERS })
}
