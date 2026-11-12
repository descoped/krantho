/** How serious a finding is: errors make a graph non-conformant */
export type FindingSeverity = 'error' | 'warning' | 'info'

/** What a finding is about */
export type FindingCode =
  | 'unresolved-reference'
  | 'duplicate-id'
  | 'missing-type'
  | 'unknown-type'
  | 'unknown-property'
  | 'property-not-in-domain'
  | 'value-out-of-range'
  | 'superseded-term'
  | 'retired-term'
  | 'pending-term'
  | 'profile-required'
  | 'profile-recommended'
  | 'profile-retired-feature'
  | 'profile-restricted-feature'

/** One result of validating a structured-data graph */
export interface Finding {
  severity: FindingSeverity
  code: FindingCode
  /** The rule set that raised it: `schema.org` for the vocabulary, or a reader profile id */
  profile: string
  /** The `@id` of the node the finding is about, when it has one */
  nodeId?: string | undefined
  /** The node's type */
  type?: string | undefined
  property?: string | undefined
  message: string
  /** Documentation the rule comes from */
  source?: string | undefined
}

/** A JSON-LD node: an object with `@type`, `@id` and properties */
export type GraphNode = Readonly<Record<string, unknown>>
