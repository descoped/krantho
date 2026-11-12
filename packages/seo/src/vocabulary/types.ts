/** Where a Schema.org term stands in its life cycle; current terms carry none */
export type Lifecycle =
  | { readonly status: 'pending' }
  | { readonly status: 'superseded'; readonly by: string }
  | { readonly status: 'retired' }

/** A Schema.org class */
export interface VocabularyType {
  /** Direct superclasses (`rdfs:subClassOf`) */
  readonly parents: readonly string[]
  /** A data type (Text, URL, Date …) rather than a class of things */
  readonly datatype?: true | undefined
  readonly lifecycle?: Lifecycle | undefined
}

/** A Schema.org property */
export interface VocabularyProperty {
  /** Types the property may be used on (`schema:domainIncludes`) */
  readonly domain: readonly string[]
  /** Types and data types its values may have (`schema:rangeIncludes`) */
  readonly range: readonly string[]
  readonly lifecycle?: Lifecycle | undefined
}

/** A member of an enumeration, such as `InStock` of `ItemAvailability` */
export interface VocabularyMember {
  /** The enumerations it belongs to */
  readonly types: readonly string[]
  readonly lifecycle?: Lifecycle | undefined
}

/** One Schema.org release, as generated from its published vocabulary */
export interface VocabularyData {
  readonly types: Readonly<Record<string, VocabularyType>>
  readonly properties: Readonly<Record<string, VocabularyProperty>>
  readonly members: Readonly<Record<string, VocabularyMember>>
}
