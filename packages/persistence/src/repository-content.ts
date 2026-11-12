import type { ContentContract, RepositoryDocument } from '@krantho/core'
import { Document, type DocumentOptions, type ToStringOptions, visit } from 'yaml'
import type { ContentDocument } from './index.js'

export type { RepositoryBasis, RepositoryDocument } from '@krantho/core'

/** Current-content export is not a history archive or an impersonation of its author. */
export function repositoryDocument(
  document: ContentDocument,
  checksum: string,
): RepositoryDocument {
  return {
    identity: {
      collection: document.meta.collection,
      slug: document.meta.slug,
      locale: document.meta.locale,
    },
    contract: document.contract,
    fields: document.fields,
    metadata: document.metadata,
    defaults: document.defaults,
    body: document.body,
    basis: { version: document.meta.version, checksum },
  }
}

/** YAML frontmatter in block style, multi-line strings as block literals, `undefined` values left out */
function frontmatterYaml(
  data: Record<string, unknown>,
  parse: DocumentOptions,
  write: ToStringOptions,
): string {
  const yaml = new Document(
    Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)),
    parse,
  )
  visit(yaml, {
    Scalar(_, node) {
      if (typeof node.value === 'string' && node.value.includes('\n')) node.type = 'BLOCK_LITERAL'
    },
  })
  return yaml.toString({ defaultKeyType: 'PLAIN', lineWidth: 0, ...write })
}

/**
 * Markdown with YAML frontmatter, readable and diffable: block style, plain
 * keys (quoted when YAML would read them as something else), every one-line
 * string double-quoted so a date, a number-like slug or "no" reads back as the
 * string it was, and multi-line text as a block literal.
 */
export function repositoryMarkdown(document: RepositoryDocument): string {
  const { fields, body, ...envelope } = document
  const frontmatter = frontmatterYaml(
    { ...fields, ...envelope },
    {},
    { defaultStringType: 'QUOTE_DOUBLE' },
  )
  return `---\n${frontmatter}---\n${body}`
}

/** What a repository file holds for a document */
export interface RepositoryFileInput {
  fields: Record<string, unknown>
  body: string
  metadata: Record<string, unknown>
  defaults: readonly unknown[]
  /** Written as the file's `status`, which the import reads: published, draft or archived */
  status: string
  /** Written only for a locale other than the site's default */
  locale?: string | undefined
  /** The order of the author fields in the frontmatter (the schema's declared order); others follow */
  fieldOrder?: readonly string[] | undefined
}

/**
 * A document as a content file in a project's repository: the fields the author wrote, in the
 * schema's order, then `status`, `locale` when it is not the default, and the metadata and
 * defaults blocks when there are any. It leaves out what the file's place and the active contract
 * already say (identity, contract, basis), so a diff against the file an editor changed shows
 * the change, not a new layout. Strings are plain where YAML reads them back as strings and
 * single-quoted where it would not, the way people write them.
 */
export function repositoryFile(input: RepositoryFileInput): string {
  const order = input.fieldOrder ?? []
  const names = [
    ...order.filter((name) => name in input.fields),
    ...Object.keys(input.fields).filter((name) => !order.includes(name)),
  ]
  const data: Record<string, unknown> = Object.fromEntries(
    names.map((name) => [name, input.fields[name]]),
  )
  data['status'] = input.status
  if (input.locale !== undefined) data['locale'] = input.locale
  if (Object.keys(input.metadata).length > 0) data['metadata'] = input.metadata
  if (input.defaults.length > 0) data['defaults'] = input.defaults
  // YAML 1.1 rules: gray-matter reads files with them, so a date or `yes` is quoted to stay a string
  const frontmatter = frontmatterYaml(
    data,
    { version: '1.1' },
    { defaultStringType: 'PLAIN', singleQuote: true },
  )
  return `---\n${frontmatter}---\n${input.body}`
}

const ENVELOPE_KEYS = new Set([
  'identity',
  'contract',
  'metadata',
  'defaults',
  'basis',
  'locale',
  'status',
])

/** Files keep ordinary author fields in frontmatter; reserved keys carry the envelope. */
export function repositoryFrontmatter(data: Record<string, unknown>): {
  fields: Record<string, unknown>
  metadata: unknown
  contract: unknown
  defaults: unknown
  identity: unknown
  basis: unknown
} {
  return {
    fields: Object.fromEntries(Object.entries(data).filter(([key]) => !ENVELOPE_KEYS.has(key))),
    metadata: data['metadata'] === undefined ? {} : data['metadata'],
    contract: data['contract'],
    defaults: data['defaults'] ?? [],
    identity: data['identity'],
    basis: data['basis'],
  }
}

export function contractReferenceMatches(reference: unknown, contract: ContentContract): boolean {
  if (reference === undefined || reference === null) return true
  if (typeof reference !== 'object' || Array.isArray(reference)) return false
  const ref = reference as Record<string, unknown>
  return ref['id'] === contract.id && ref['revision'] === contract.revision
}
