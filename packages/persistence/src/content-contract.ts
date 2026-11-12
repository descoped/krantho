import { type AuthoredMetadata, authoredMetadata, canonicalJson } from '@krantho/core'

export type {
  AuthoredMetadata,
  ContentContract,
  ContractReference,
  DefaultProvenance,
  MetadataGroupContract,
} from '@krantho/core'
export { authoredMetadata } from '@krantho/core'

/** An atomic document write refused a stale revision or a duplicate create. */
export class ContentWriteConflict extends Error {
  constructor(
    readonly currentVersion: number,
    readonly expectedVersion: number,
  ) {
    super('Content has been modified by another user')
    this.name = 'ContentWriteConflict'
  }
}

/** The authored values a write names; one left undefined keeps the previous version's */
export type AuthoredWrite = {
  readonly [K in keyof AuthoredMetadata]?: AuthoredMetadata[K] | undefined
}

/** The authored values a write names; the ones it leaves out stay undefined */
export function authoredOf(write: AuthoredWrite): AuthoredWrite {
  return {
    metadata: write.metadata,
    contract: write.contract,
    defaults: write.defaults,
    repositoryBasis: write.repositoryBasis,
  }
}

/**
 * The authored values a new version stores: what the write names and, for
 * whatever it leaves out, the previous version's. A write that touches only
 * fields or the body never clears a document's metadata, contract or
 * provenance. A repository basis agreed at version zero takes the new version.
 */
export function nextAuthored(
  previous: AuthoredWrite | null,
  write: AuthoredWrite,
  version: number,
): AuthoredMetadata {
  const kept = authoredMetadata(previous ?? {})
  const basis = write.repositoryBasis !== undefined ? write.repositoryBasis : kept.repositoryBasis
  return {
    metadata: write.metadata ?? kept.metadata,
    contract: write.contract !== undefined ? write.contract : kept.contract,
    defaults: write.defaults ?? kept.defaults,
    repositoryBasis: basis?.version === 0 ? { ...basis, version } : basis,
  }
}

/** Repository agreement is bookkeeping, not an author-owned value. */
export function sameAuthoredValues(
  left: Partial<AuthoredMetadata>,
  right: Partial<AuthoredMetadata>,
): boolean {
  const semantic = (input: Partial<AuthoredMetadata>): string => {
    const { repositoryBasis: _basis, ...values } = authoredMetadata(input)
    return canonicalJson(values)
  }
  return semantic(left) === semantic(right)
}

/**
 * A `doc:<collection>/<slug>` SEO config row as the document it belongs to and
 * its config object, unwrapping a config stored as JSON text. Null when the id
 * names no document or the config is not an object, so a migration leaves the
 * row where it is.
 */
export function documentSeoRow(
  id: string,
  config: unknown,
): { collection: string; slug: string; config: Record<string, unknown> } | null {
  const match = /^doc:([^/]+)\/(.+)$/.exec(id)
  if (!match?.[1] || !match[2]) return null
  let value = config
  for (let depth = 0; typeof value === 'string' && depth < 2; depth++) {
    try {
      value = JSON.parse(value)
    } catch {
      return null
    }
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  return { collection: match[1], slug: match[2], config: value as Record<string, unknown> }
}
