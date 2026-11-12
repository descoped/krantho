/** Whether a reader shows a feature: available, shown only under conditions, retired, or no feature at all */
export type FeatureStatus = 'active' | 'restricted' | 'retired' | 'none'

/** One reader's rule for a Schema.org type, with the documentation it comes from */
export interface ProfileRule {
  /** The Schema.org type the rule applies to — and its subtypes, unless a subtype has its own rule */
  readonly type: string
  /** The search feature the rule makes a page eligible for, as the reader names it */
  readonly feature?: string | undefined
  readonly status: FeatureStatus
  /** Properties the feature needs */
  readonly required?: readonly string[] | undefined
  /** Groups of properties of which the feature needs at least one each */
  readonly oneOf?: ReadonlyArray<readonly string[]> | undefined
  /** Properties the reader recommends */
  readonly recommended?: readonly string[] | undefined
  /** Conditions the reader states in words, e.g. who a restricted feature is shown for */
  readonly conditions?: readonly string[] | undefined
  /** The documentation the rule comes from */
  readonly source: string
  /** The date the rule was last checked against its source, ISO 8601 */
  readonly verifiedAt: string
}

/** A reader's published rules — a search engine's or an assistant's — on top of the Schema.org baseline */
export interface ReaderProfile {
  readonly id: string
  readonly name: string
  readonly rules: readonly ProfileRule[]
}
