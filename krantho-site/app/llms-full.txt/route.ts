import { llmsFull, TEXT_HEADERS } from '../components/docs-llms'

// /llms-full.txt — every docs page's full markdown, with code samples expanded,
// for language models that read the documentation in one pass.

export async function GET(): Promise<Response> {
  return new Response(await llmsFull(), { headers: TEXT_HEADERS })
}
