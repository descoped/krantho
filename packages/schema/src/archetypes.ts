import { createHash } from 'node:crypto'
import { canonicalJson } from '@krantho/core'
import type { ContentContract, MetadataGroupContract } from '@krantho/persistence'
import type { ZodObject, ZodRawShape } from 'zod'
import { portableJsonSchema } from './portable-schema.js'

export interface MetadataArchetype<T extends ZodObject<ZodRawShape> = ZodObject<ZodRawShape>> {
  readonly id: string
  readonly label: string
  readonly schema: T
}

export interface MetadataSlot {
  readonly archetype: MetadataArchetype
  readonly required?: boolean | undefined
}

export interface DocumentArchetype<T extends ZodObject<ZodRawShape> = ZodObject<ZodRawShape>> {
  readonly id: string
  readonly label: string
  readonly fields: T
  readonly metadata: Readonly<Record<string, MetadataSlot>>
  readonly body: 'none' | 'optional' | 'required'
  readonly sections: readonly string[]
}

const RESERVED = new Set([
  'meta',
  'identity',
  'basis',
  'metadata',
  'contract',
  'defaults',
  'body',
  'html',
  'sections',
  'collection',
  'slug',
  'locale',
  'liveVersion',
  'status',
  'changedBy',
  'createdAt',
  '__proto__',
  'prototype',
  'constructor',
])

export function assertAuthorProperty(name: string): void {
  if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name) || RESERVED.has(name)) {
    throw new Error(`Property "${name}" is reserved or invalid`)
  }
}

export function contentDigest(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

export function documentChecksum(value: {
  fields: Record<string, unknown>
  body: string
  metadata?: unknown
  defaults?: unknown
  contract?: { id: string; revision: string } | null | undefined
}): string {
  return contentDigest({
    fields: value.fields,
    body: value.body,
    metadata: value.metadata ?? {},
    defaults: value.defaults ?? [],
    contract: value.contract ? { id: value.contract.id, revision: value.contract.revision } : null,
  })
}

function identity(id: string, label: string): void {
  if (!/^[a-zA-Z][a-zA-Z0-9._/-]*$/.test(id) || !label.trim()) {
    throw new Error('Archetypes require a stable ID and a readable label')
  }
}

function portableSchema(schema: ZodObject<ZodRawShape>): Record<string, unknown> {
  const result = portableJsonSchema(schema)
  result.additionalProperties = false
  strictObjects(result)
  return result
}

/** Nested groups reject unknown values too, including objects inside arrays. */
function strictObjects(value: unknown): void {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    value.forEach(strictObjects)
    return
  }
  const record = value as Record<string, unknown>
  if (
    record.type === 'object' &&
    record.properties &&
    Object.keys(record.properties as object).length > 0
  )
    record.additionalProperties = false
  if (Array.isArray(record.required)) record.required.sort()
  Object.values(record).forEach(strictObjects)
}

export function defineMetadataArchetype<T extends ZodObject<ZodRawShape>>(
  definition: MetadataArchetype<T>,
): MetadataArchetype<T> {
  identity(definition.id, definition.label)
  Object.keys(definition.schema.shape).forEach(assertAuthorProperty)
  portableSchema(definition.schema)
  return Object.freeze({ ...definition })
}

export function defineDocumentArchetype<T extends ZodObject<ZodRawShape>>(
  definition: Omit<DocumentArchetype<T>, 'metadata' | 'body' | 'sections'> & {
    metadata?: Readonly<Record<string, MetadataSlot>> | undefined
    body?: DocumentArchetype['body'] | undefined
    sections?: readonly string[] | undefined
  },
): DocumentArchetype<T> {
  identity(definition.id, definition.label)
  Object.keys(definition.fields.shape).forEach(assertAuthorProperty)
  Object.keys(definition.metadata ?? {}).forEach(assertAuthorProperty)
  const sections = (definition.sections ?? []).map((section) => section.trim())
  if (
    sections.some((section) => !section) ||
    new Set(sections.map((section) => section.toLowerCase())).size !== sections.length
  ) {
    throw new Error('Archetypes require distinct, non-empty section names')
  }
  const metadata = Object.freeze(
    Object.fromEntries(
      Object.entries(definition.metadata ?? {}).map(([slot, value]) => [
        slot,
        Object.freeze({ ...value }),
      ]),
    ),
  )
  const result = {
    ...definition,
    metadata,
    body: definition.body ?? 'optional',
    sections: Object.freeze(sections),
  } satisfies DocumentArchetype<T>
  compileContentContract(result)
  return Object.freeze(result)
}

export function compileContentContract(
  archetype: DocumentArchetype,
  fields: ZodObject<ZodRawShape> = archetype.fields,
): ContentContract {
  const metadata: Record<string, MetadataGroupContract> = {}
  for (const [slot, { archetype: group, required }] of Object.entries(archetype.metadata)) {
    const schema = portableSchema(group.schema)
    metadata[slot] = {
      id: group.id,
      label: group.label,
      revision: contentDigest({ id: group.id, schema }),
      required: required ?? false,
      schema,
    }
  }
  const resolved = {
    id: archetype.id,
    label: archetype.label,
    fields: portableSchema(fields),
    metadata,
    body: archetype.body,
    sections: [...archetype.sections],
  }
  // Labels are presentation: renaming one keeps saved snapshots on the same revision
  const revision = contentDigest({
    id: resolved.id,
    fields: resolved.fields,
    metadata: Object.fromEntries(
      Object.entries(metadata).map(([slot, group]) => [
        slot,
        { id: group.id, required: group.required, schema: group.schema },
      ]),
    ),
    body: resolved.body,
    sections: resolved.sections,
  })
  return freezeContract({ ...resolved, revision })
}

/** Freeze the JSON contract only; Zod's internal caches remain usable. */
function freezeContract<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeContract)
    Object.freeze(value)
  }
  return value
}
