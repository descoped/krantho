// After a production deploy: check that the import took the repository's content.
// The first requests run the import, which keeps an editor's version where a file
// changed too and records a conflict; GET /api/migrations/conflicts lists the ones
// still open. An open conflict means a change in the repository is not on the site,
// so the job fails and names each document. The deploy is live either way: resolve
// the conflict (POST /api/migrations/conflicts/:id/resolve) or merge the edit.
//
// Authenticates with the job's GitHub identity token (permissions: id-token: write);
// the site trusts it through auth.workload in krantho.config.ts.
//
// Usage: node scripts/check-content-import.mjs <site url>

const siteUrl = process.argv[2]
if (!siteUrl) {
  console.error('usage: node scripts/check-content-import.mjs <site url>')
  process.exit(1)
}
const origin = new URL(siteUrl).origin
/** No request may stall the job: a site that does not answer fails the check */
const TIMEOUT_MS = 30_000

/** The job's identity token for the site; needs `permissions: id-token: write` */
async function identityToken() {
  const url = process.env.ACTIONS_ID_TOKEN_REQUEST_URL
  const bearer = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN
  if (!url || !bearer) throw new Error('no identity token: the job needs permissions: id-token: write')
  const response = await fetch(`${url}&audience=${encodeURIComponent(origin)}`, {
    headers: { authorization: `bearer ${bearer}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`the identity token request answered HTTP ${response.status}`)
  return (await response.json()).value
}

const response = await fetch(`${origin}/api/migrations/conflicts`, {
  headers: { authorization: `Bearer ${await identityToken()}` },
  signal: AbortSignal.timeout(TIMEOUT_MS),
})
// The check runs against the release it deployed, which trusts this job: a refused token
// is a misconfigured auth.workload, and would otherwise silence the check
if ([401, 403].includes(response.status)) {
  console.log(`::error::the site refused the job's identity token (HTTP ${response.status}): check auth.workload`)
  process.exit(1)
}
// 404/501: a site that keeps no import conflicts
if ([404, 501].includes(response.status)) {
  console.log(`::notice::import conflicts not checked: the site answered HTTP ${response.status}`)
  process.exit(0)
}
if (!response.ok) throw new Error(`/api/migrations/conflicts answered HTTP ${response.status}`)

const { conflicts } = await response.json()
if (conflicts.length === 0) {
  console.log('The import took every changed file: no open conflicts')
  process.exit(0)
}
for (const c of conflicts) {
  console.log(`::error::conflict ${c.id}: ${c.collection}/${c.slug} (${c.locale}) kept its database version`)
}
console.log(`${conflicts.length} open import conflicts: these files' changes are not on the site`)
process.exit(1)
