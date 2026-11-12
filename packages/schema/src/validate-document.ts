import { normalizeTimestamps, type TimestampSchema } from '@krantho/core'
import type { ContentContract } from '@krantho/persistence'
import { fromJSONSchema, type ZodType, z } from 'zod'

export interface DocumentValues {
  fields: Record<string, unknown>
  metadata: Record<string, Record<string, unknown>>
  body: string
}

/** Writes and historic previews use the same portable contract representation. */
export function documentSchema(contract: ContentContract): ZodType<DocumentValues> {
  const groups: Record<string, ZodType> = {}
  for (const [slot, group] of Object.entries(contract.metadata)) {
    const schema = fromJSONSchema(group.schema)
    groups[slot] = group.required ? schema : schema.optional()
  }
  let body = z.string()
  if (contract.body === 'none') body = body.max(0, 'This document has no body')
  if (contract.body === 'required')
    body = body.refine((value) => value.trim().length > 0, 'Content is required')
  return z
    .object({
      fields: fromJSONSchema(contract.fields),
      metadata: z.object(groups).strict(),
      body,
    })
    .strict() as ZodType<DocumentValues>
}

export function validateDocument(
  contract: ContentContract,
  values: DocumentValues,
): ReturnType<ZodType<DocumentValues>['safeParse']> {
  return documentSchema(contract).safeParse(withUtcTimestamps(contract, values))
}

/** A date written alone is midnight UTC, and a time with an offset is the same moment in UTC */
function withUtcTimestamps(contract: ContentContract, values: DocumentValues): DocumentValues {
  const metadata = Object.fromEntries(
    Object.entries(values.metadata).map(([slot, group]) => {
      const declared = contract.metadata[slot]
      return [
        slot,
        declared ? normalizeTimestamps(declared.schema as TimestampSchema, group) : group,
      ]
    }),
  ) as DocumentValues['metadata']
  return {
    ...values,
    fields: normalizeTimestamps(
      contract.fields as TimestampSchema,
      values.fields,
    ) as DocumentValues['fields'],
    metadata,
  }
}
