/** Portable definitions stored with authored values, independent of application code. */
export interface ContractReference {
  readonly id: string
  readonly revision: string
}

export interface MetadataGroupContract extends ContractReference {
  readonly label: string
  readonly required: boolean
  readonly schema: Record<string, unknown>
}

export interface ContentContract extends ContractReference {
  readonly label: string
  readonly fields: Record<string, unknown>
  readonly metadata: Readonly<Record<string, MetadataGroupContract>>
  readonly body: 'none' | 'optional' | 'required'
  readonly sections: readonly string[]
}

export interface DefaultProvenance {
  readonly collection: string
  readonly slug: string
  readonly locale: string
  readonly version: number
  readonly paths: readonly string[]
  readonly values: Readonly<Record<string, unknown>>
}

/** All author-owned structured values participate in the same revision. */
export interface AuthoredMetadata {
  readonly metadata: Record<string, Record<string, unknown>>
  readonly contract: ContentContract | null
  readonly defaults: readonly DefaultProvenance[]
  /** Agreed repository/database basis, carried unchanged by ordinary editing. */
  readonly repositoryBasis: { readonly checksum: string; readonly version: number } | null
}

/** A low-level adapter can store untyped content; CMS writes supply a contract. */
export function authoredMetadata(
  input: {
    readonly [K in keyof AuthoredMetadata]?: AuthoredMetadata[K] | undefined
  },
): AuthoredMetadata {
  return {
    metadata: input.metadata ?? {},
    contract: input.contract ?? null,
    defaults: input.defaults ?? [],
    repositoryBasis: input.repositoryBasis ?? null,
  }
}

/** The agreed repository/database revision a file was exported from */
export interface RepositoryBasis {
  readonly version: number
  readonly checksum: string
}

export interface RepositoryDocument {
  readonly identity: { collection: string; slug: string; locale: string }
  readonly contract: ContentContract | null
  readonly fields: Record<string, unknown>
  readonly metadata: AuthoredMetadata['metadata']
  readonly defaults: AuthoredMetadata['defaults']
  readonly body: string
  readonly basis?: RepositoryBasis | undefined
}
