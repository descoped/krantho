import { canGetContent, canWriteContent, hasVersioning } from '@krantho/persistence'
import { z } from 'zod'
import type { ApiContext } from '../../types.js'
import { replaceSections } from '../document-change.js'
import { type AssistantTool, defineTool } from './define-tool.js'
import { writeDraft } from './draft-write.js'
import { documentView } from './read-tools.js'
import { exactDocument, failure, localeOf, pathOf } from './support.js'

/** Draft writes land in version history, so they need a versioned adapter that can write and read */
export function canWriteDrafts(ctx: ApiContext): boolean {
  return canWriteContent(ctx.adapter) && hasVersioning(ctx.adapter) && canGetContent(ctx.adapter)
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const createDraftTool = defineTool({
  name: 'create_draft',
  label: 'Create a draft',
  description:
    'Create a new document as a draft. Use get_schema first so the fields are valid. The slug is kebab-case.',
  input: z.object({
    collection: z.string().min(1),
    slug: z.string().min(1).max(80).regex(SLUG).describe('kebab-case, for example opening-hours'),
    fields: z.record(z.string(), z.unknown()).describe('Field values keyed by field name'),
    body: z.string().optional().describe('Markdown body'),
    locale: z.string().min(1).optional(),
  }),
  role: 'editor',
  available: canWriteDrafts,
  describe: (input) => `Creating draft ${pathOf(input)}`,
  async run(input, run) {
    const locale = localeOf(run.ctx, input.locale)
    const existing = await exactDocument(run.ctx, input.collection, input.slug, locale)
    if (existing) {
      return failure(
        `${pathOf(input)} already exists (v${existing.meta.version}); read it and use update_draft`,
      )
    }
    return writeDraft(run, {
      ref: { collection: input.collection, slug: input.slug, locale },
      current: null,
      fields: input.fields,
      body: input.body ?? '',
    })
  },
})

/** The current fields with the given values merged in; `null` removes a key */
function mergeFields(
  current: Record<string, unknown>,
  changes: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const merged = { ...current }
  for (const [key, value] of Object.entries(changes ?? {})) {
    if (value === null) delete merged[key]
    else merged[key] = value
  }
  return merged
}

const updateDraftTool = defineTool({
  name: 'update_draft',
  label: 'Update a draft',
  description:
    'Change an existing document and save it as a draft. Pass the version you read with get_document as basedOnVersion. Change fields, replace the whole body, or replace the content under chosen ## section headings (body and sections exclusive). Filling empty fields is saved at once; replacing text is proposed to the user with the difference.',
  input: z.object({
    collection: z.string().min(1),
    slug: z.string().min(1),
    locale: z.string().min(1).optional(),
    basedOnVersion: z.int().positive(),
    fields: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('Field values to set; null removes a field'),
    body: z.string().optional().describe('The whole new markdown body'),
    sections: z
      .array(z.object({ heading: z.string().min(1), content: z.string() }))
      .min(1)
      .optional()
      .describe('New content under existing ## headings'),
  }),
  role: 'editor',
  available: canWriteDrafts,
  describe: (input) => `Updating ${pathOf(input)}`,
  async run(input, run) {
    if (input.body !== undefined && input.sections) {
      return failure('Pass either body or sections, not both')
    }
    if (!input.fields && input.body === undefined && !input.sections) {
      return failure('Nothing to change: pass fields, body or sections')
    }

    const locale = localeOf(run.ctx, input.locale)
    const current = await exactDocument(run.ctx, input.collection, input.slug, locale)
    if (!current) return failure(`${pathOf(input)} does not exist in locale ${locale}`)
    if (current.meta.version !== input.basedOnVersion) {
      return failure(
        `${pathOf(input)} is at v${current.meta.version}, not v${input.basedOnVersion}; read it again`,
      )
    }
    if (input.body !== undefined && documentView(run, current).bodyTruncated) {
      return failure(
        `The body of ${pathOf(input)} is longer than you could read; change it with sections instead`,
      )
    }

    const body = input.sections
      ? replaceSections(current.body, input.sections)
      : (input.body ?? current.body)
    return writeDraft(run, {
      ref: { collection: input.collection, slug: input.slug, locale },
      current,
      fields: mergeFields(current.fields, input.fields),
      body,
    })
  },
})

/** Tools that write drafts */
export const DRAFT_TOOLS: readonly AssistantTool[] = [createDraftTool, updateDraftTool]
