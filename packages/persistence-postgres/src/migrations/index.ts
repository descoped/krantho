import type { PostgresMigration } from '../migration-runner.js'
import { v001InitialSchema } from './v001-initial-schema.js'
import { v002AuthTables } from './v002-auth-tables.js'
import { v003UserPermissions } from './v003-user-permissions.js'
import { v004MediaHotspot } from './v004-media-hotspot.js'
import { v005ContentLocks } from './v005-content-locks.js'
import { v006WebhookDeliveries } from './v006-webhook-deliveries.js'
import { v007MediaFolders } from './v007-media-folders.js'
import { v008SiteSettings } from './v008-site-settings.js'
import { v009SeoConfig } from './v009-seo-config.js'
import { v010ContentLiveVersion } from './v010-content-live-version.js'
import { v011Media } from './v011-media.js'
import { v012PageCache } from './v012-page-cache.js'
import { v013ContentContracts } from './v013-content-contracts.js'
import { v014ContentManifestCommit } from './v014-content-manifest-commit.js'

/** All registered Postgres migrations, in version order */
export const postgresMigrations: readonly PostgresMigration[] = [
  v001InitialSchema,
  v002AuthTables,
  v003UserPermissions,
  v004MediaHotspot,
  v005ContentLocks,
  v006WebhookDeliveries,
  v007MediaFolders,
  v008SiteSettings,
  v009SeoConfig,
  v010ContentLiveVersion,
  v011Media,
  v012PageCache,
  v013ContentContracts,
  v014ContentManifestCommit,
]
