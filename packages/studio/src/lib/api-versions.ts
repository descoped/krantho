import { localeQuery, request } from './api-client.js'
import type { ContentItem, DocumentMeta, VersionInfo } from './api-types.js'

/** A locale version's history, newest first: each version's metadata, without its fields or body */
export async function fetchVersions(
  collection: string,
  slug: string,
  locale?: string | undefined,
): Promise<{ versions: DocumentMeta[] }> {
  return request<{ versions: DocumentMeta[] }>(
    `/content/${collection}/${slug}/versions${localeQuery(locale)}`,
  )
}

/** Fetch specific version */
export async function fetchVersion(
  collection: string,
  slug: string,
  version: number,
  locale?: string | undefined,
): Promise<VersionInfo> {
  const doc = await request<ContentItem>(
    `/content/${collection}/${slug}/versions/${version}${localeQuery(locale)}`,
  )
  return {
    version: doc.meta.version,
    metadata: doc.metadata,
    contract: doc.contract,
    defaults: doc.defaults,
    repositoryBasis: doc.repositoryBasis,
    fields: doc.fields,
    body: doc.body,
    changedBy: doc.meta.changedBy,
    createdAt: doc.meta.createdAt,
  }
}

/** What a restore answers: the restored version saved again as the newest, the live one unchanged */
export interface RestoredVersion {
  restoredVersion: number
  /** The new current version */
  version: number
  liveVersion: number | null
}

/** Restore a version: it is saved again as the newest version of the locale version */
export async function restoreVersion(
  collection: string,
  slug: string,
  version: number,
  locale?: string | undefined,
): Promise<RestoredVersion> {
  return request(`/content/${collection}/${slug}/restore/${version}${localeQuery(locale)}`, {
    method: 'POST',
  })
}
