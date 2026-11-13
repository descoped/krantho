import {
  type AuthoredMetadata,
  type ContentContract,
  contractReferenceMatches,
  repositoryFrontmatter,
} from '@krantho/persistence'
import { type ZodError, type ZodObject, type ZodRawShape, z } from 'zod'
import { compileContentContract, documentChecksum } from './archetypes.js'
import type { Collection } from './collection.js'
import { validateDocument } from './validate-document.js'

export interface ParsedRepositoryContent extends AuthoredMetadata {
  fields: Record<string, unknown>
  body: string
  locale: string | undefined
}

const provenance = z.array(
  z
    .object({
      collection: z.string(),
      slug: z.string(),
      locale: z.string(),
      version: z.number().int().positive(),
      paths: z.array(z.string()),
      values: z.record(z.string(), z.json()),
    })
    .strict(),
)

/** File and HTTP transfers share exactly the contract used by the editor. */
export function parseRepositoryContent(
  collection: Collection,
  slug: string,
  data: Record<string, unknown>,
  body: string,
  fields: ZodObject<ZodRawShape> = collection.schema,
  activeContract?: ContentContract | undefined,
): { success: true; data: ParsedRepositoryContent } | { success: false; error: ZodError } {
  const envelope = repositoryFrontmatter(data)
  const contract = activeContract ?? compileContentContract(collection.archetype, fields)
  if (!contractReferenceMatches(envelope.contract, contract))
    return invalid(
      ['contract'],
      'The file contract differs from the active contract. Review and adopt the active definition explicitly.',
    )
  const id = envelope.identity
  let locale = typeof data.locale === 'string' ? data.locale : undefined
  if (id !== undefined) {
    const identity = z
      .object({
        collection: z.literal(collection.name),
        slug: z.literal(slug),
        locale: z.string().min(2),
      })
      .strict()
      .safeParse(id)
    if (!identity.success)
      return invalid(['identity'], 'The file identity must match its collection and filename')
    if (locale !== undefined && locale !== identity.data.locale)
      return invalid(['locale'], 'Locale must agree with the document identity')
    locale = identity.data.locale
  }
  const parsed = validateDocument(contract, {
    fields: envelope.fields,
    body,
    metadata: envelope.metadata as Record<string, Record<string, unknown>>,
  })
  if (!parsed.success) return parsed
  const defaults = provenance.safeParse(envelope.defaults)
  if (!defaults.success) return defaults
  return {
    success: true,
    data: {
      ...parsed.data,
      contract,
      defaults: defaults.data,
      locale,
      repositoryBasis: {
        checksum: documentChecksum({ ...parsed.data, contract, defaults: defaults.data }),
        version: 0,
      },
    },
  }
}

function invalid(path: string[], message: string): { success: false; error: ZodError } {
  return { success: false, error: new z.ZodError([{ code: 'custom', path, message }]) }
}
