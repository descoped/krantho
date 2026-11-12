// Before a production deploy: check that the edits editors made in production have
// reached the repository. GET /api/changes lists the files production's content
// differs in from the last import; every one of them must have changed in git since
// the commit that import came from, which is what merging `krantho pull`'s branch
// does. A release never loses an edit (a file and an edit that both changed are kept
// as a conflict); this keeps git the durable copy.
//
// KRANTHO_CONTENT_GATE sets what an unmerged edit does: fail (default), warn or off.
// Authenticates with the job's GitHub identity token (permissions: id-token: write);
// the site trusts it through auth.workload in krantho.config.ts.
//
// Usage: node scripts/check-content-changes.mjs <site url>
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const contentDir = join(import.meta.dirname, '..', 'content')
const siteUrl = process.argv[2]
const mode = process.env.KRANTHO_CONTENT_GATE || 'fail'
if (!siteUrl || !['fail', 'warn', 'off'].includes(mode)) {
  console.error('usage: node scripts/check-content-changes.mjs <site url> (KRANTHO_CONTENT_GATE: fail, warn or off)')
  process.exit(1)
}
if (mode === 'off') {
  console.log('KRANTHO_CONTENT_GATE=off: production edits are not checked')
  process.exit(0)
}
const origin = new URL(siteUrl).origin

/** The job's identity token for the site; needs `permissions: id-token: write` */
async function identityToken() {
  const url = process.env.ACTIONS_ID_TOKEN_REQUEST_URL
  const bearer = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN
  if (!url || !bearer) throw new Error('no identity token: the job needs permissions: id-token: write')
  const response = await fetch(`${url}&audience=${encodeURIComponent(origin)}`, {
    headers: { authorization: `bearer ${bearer}` },
  })
  if (!response.ok) throw new Error(`the identity token request answered HTTP ${response.status}`)
  return (await response.json()).value
}

/** Every change production lists, page by page; null when the site cannot say */
async function productionChanges(token) {
  const changes = []
  let baseline = null
  let cursor = null
  do {
    const query = cursor ? `?limit=200&cursor=${encodeURIComponent(cursor)}` : '?limit=200'
    const response = await fetch(`${origin}/api/changes${query}`, {
      headers: { authorization: `Bearer ${token}` },
    })
    // 401/403/404/501: a release that does not serve the endpoint or trust this
    // job yet; 409: a database with no import to compare with
    if ([401, 403, 404, 409, 501].includes(response.status)) return { unavailable: response.status }
    if (!response.ok) throw new Error(`/api/changes answered HTTP ${response.status}`)
    const page = await response.json()
    baseline = page.baseline
    changes.push(...page.changes)
    cursor = page.next
  } while (cursor)
  return { baseline, changes }
}

/** True when the file changed in git between the baseline commit and HEAD */
function touchedSince(commit, path) {
  try {
    execFileSync('git', ['-C', contentDir, 'diff', '--quiet', commit, 'HEAD', '--', path])
    return false
  } catch {
    return true
  }
}

function hasCommit(commit) {
  try {
    execFileSync('git', ['-C', contentDir, 'cat-file', '-e', `${commit}^{commit}`])
    return true
  } catch {
    return false
  }
}

const result = await productionChanges(await identityToken())
if (result.unavailable) {
  console.log(`::warning::production cannot be compared with the repository yet (HTTP ${result.unavailable})`)
  process.exit(0)
}
const commit = result.baseline.commit
if (!commit || !hasCommit(commit)) {
  console.log(`::warning::the baseline commit ${commit ?? '(none)'} is not in this checkout: production edits are not checked`)
  process.exit(0)
}

const unmerged = result.changes.filter((change) => !touchedSince(commit, change.path))
console.log(`production lists ${result.changes.length} edits since ${commit.slice(0, 12)}; ${unmerged.length} not in this release`)
if (unmerged.length === 0) process.exit(0)

for (const change of unmerged) console.log(`  ${change.action} ${change.path}`)
const fix = 'Run the "Pull production content" workflow, merge its pull request, then release again'
const level = mode === 'fail' ? 'error' : 'warning'
console.log(`::${level}::production holds ${unmerged.length} edits the repository lacks. ${fix}`)
process.exit(mode === 'fail' ? 1 : 0)
