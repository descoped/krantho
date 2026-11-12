/**
 * What the site itself serves at a path — a page, `/sitemap.xml`,
 * `/robots.txt`, `/llms.txt` — read as a visitor's browser reads it. Studio
 * is served by the site's own app at `/studio`, so the site is on the same
 * origin: what comes back is what search engines and assistants get.
 */

/** The site's answer at a path: its status and body; status 0 when nothing answered */
export interface Served {
  path: string
  status: number
  text: string
}

/** Whether the site answered with the thing itself */
export function servedOk(served: Served): boolean {
  return served.status >= 200 && served.status < 300
}

/** Read a path of the site as served; never throws */
export async function fetchServed(path: string): Promise<Served> {
  try {
    const response = await fetch(path, { credentials: 'omit', cache: 'no-store' })
    return { path, status: response.status, text: await response.text() }
  } catch {
    return { path, status: 0, text: '' }
  }
}

/** Why a path could not be read, for people: its HTTP status, or no answer */
export function servedFailure(served: Served): string {
  if (served.status === 0) return `The site did not answer at ${served.path}.`
  if (served.status === 404) return `The site serves nothing at ${served.path} (HTTP 404).`
  return `The site answered ${served.path} with HTTP ${served.status}.`
}
