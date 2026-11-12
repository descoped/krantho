/**
 * A Schema.org type accepted by archetypes and config-driven composition: any
 * current type of the pinned vocabulary. Types with a registered definition
 * (`registerType`) are built by it; any other type is a node of the values
 * resolved for it.
 */
export type SchemaType = string

/** Configuration for defining an archetype */
export interface ArchetypeConfig {
  /** Schema.org types this page type includes */
  schemas: readonly SchemaType[]
  /** Optional frontmatter key → schema property mappings */
  mappings?: Readonly<Record<string, string>> | undefined
}

/** A defined archetype — immutable after creation */
export interface Archetype {
  readonly schemas: readonly SchemaType[]
  readonly mappings: Readonly<Record<string, string>>
}
