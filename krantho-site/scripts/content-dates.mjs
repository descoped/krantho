// Write content/dates.json and content/manifest.json before `next build`.
// dates.json: when each content file last changed in git. The import dates
// every page by its file instead of by the import, so the sitemap's lastmod is
// the page's own date. manifest.json: the content's version, the time of the
// last commit that touched it. A deployment with a newer version imports the
// new and changed files into the database, so content reaches production
// without a reset. Without the full history (a shallow CI checkout) neither is
// written; the production deploy checks that both exist.
import { join } from 'node:path'
import {
  contentCommit,
  contentVersion,
  generateContentDates,
  generateManifest,
} from '@krantho/server'

const contentDir = join(import.meta.dirname, '..', 'content')
const dates = await generateContentDates(contentDir)
const version = await contentVersion(contentDir)
if (dates && version) {
  const commit = await contentCommit(contentDir)
  const manifest = await generateManifest(contentDir, version, commit ?? undefined)
  console.log(`[content-dates] ${Object.keys(dates).length} content files dated from git`)
  console.log(
    `[content-dates] content version ${version} at ${commit ?? 'no commit'}, ${Object.keys(manifest.files).length} files`,
  )
} else {
  console.warn('[content-dates] No full git history: content/dates.json and manifest.json not written')
}
