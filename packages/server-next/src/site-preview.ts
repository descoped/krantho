import { resolveSitePath } from '@krantho/core'
import { draftMode, headers } from 'next/headers'

/** Where Studio sends an editor to preview a document on the site */
export const PREVIEW_PATH = '/api/preview'
/** Where a previewing editor leaves draft mode */
export const PREVIEW_EXIT_PATH = '/api/preview/exit'

/**
 * Whether this render is an editor's preview (Next.js draft mode). Outside a
 * request — a build, a test — it is not.
 */
export async function isPreview(): Promise<boolean> {
  try {
    return (await draftMode()).isEnabled
  } catch {
    return false
  }
}

/**
 * Whether the site's own "Previewing drafts" notice belongs on this render: it
 * does for an editor's preview, and not when a frame shows the page — Studio's
 * Live mode does, and it has its own way out of the preview. The browser says so
 * itself (`Sec-Fetch-Dest: iframe`), so the site needs no flag of its own.
 */
export async function showPreviewBanner(): Promise<boolean> {
  if (!(await isPreview())) return false
  try {
    return (await headers()).get('sec-fetch-dest') !== 'iframe'
  } catch {
    return true
  }
}

/**
 * Handle the preview routes, or return null for any other request. The API
 * decides who may preview (`GET /api/preview` answers the page's path to an
 * editor); this turns its answer into draft mode and sends the editor to the
 * page, where every read comes from the current version, uncached.
 */
export async function handleSitePreview(
  request: Request,
  apiResponse: () => Promise<Response>,
): Promise<Response | null> {
  if (request.method !== 'GET') return null
  const url = new URL(request.url)

  if (url.pathname === PREVIEW_EXIT_PATH) {
    ;(await draftMode()).disable()
    return redirect(sameSitePath(url.searchParams.get('path'), url), url)
  }
  if (url.pathname !== PREVIEW_PATH) return null

  const response = await apiResponse()
  if (!response.ok) return response
  const { path } = (await response.json()) as { path: string }
  ;(await draftMode()).enable()
  return redirect(sameSitePath(path, url), url)
}

/** A path on this site; anything else falls back to the home page */
function sameSitePath(path: string | null, base: URL): string {
  const target = path ? resolveSitePath(path, base) : null
  return target ? `${target.pathname}${target.search}` : '/'
}

function redirect(path: string, base: URL): Response {
  return new Response(null, {
    status: 307,
    headers: { location: new URL(path, base).toString(), 'cache-control': 'no-store' },
  })
}
