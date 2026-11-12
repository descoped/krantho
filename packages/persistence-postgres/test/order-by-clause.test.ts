import { describe, expect, it } from 'vitest'
import { orderByClause } from '../src/content-query.js'

const TIE_BREAK = 'collection, slug, locale'

/** The sort keys the clause writes for a field */
function fieldKeys(field: string, dir: string): string {
  const isNumber = `jsonb_typeof(fields->'${field}') = 'number'`
  return [
    `fields->>'${field}' IS NOT NULL ${dir}`,
    `NOT ${isNumber} ${dir}`,
    `CASE WHEN ${isNumber} THEN (fields->>'${field}')::numeric END ${dir}`,
    `fields->>'${field}' ${dir}`,
  ].join(', ')
}

describe('orderByClause', () => {
  it('orders by the tie-break alone when no sort option is provided', () => {
    expect(orderByClause(undefined)).toBe(` ORDER BY ${TIE_BREAK}`)
    expect(orderByClause('')).toBe(` ORDER BY ${TIE_BREAK}`)
  })

  it('builds ASC ORDER BY for a direct column with the default direction', () => {
    expect(orderByClause('slug')).toBe(` ORDER BY slug ASC, ${TIE_BREAK}`)
  })

  it('builds DESC ORDER BY for a direct column when the direction is desc', () => {
    expect(orderByClause('created_at:desc')).toBe(` ORDER BY created_at DESC, ${TIE_BREAK}`)
  })

  it('orders a field missing values first, then numbers numerically, then text', () => {
    expect(orderByClause('rank:desc')).toBe(` ORDER BY ${fieldKeys('rank', 'DESC')}, ${TIE_BREAK}`)
    expect(orderByClause('author-name')).toBe(
      ` ORDER BY ${fieldKeys('author-name', 'ASC')}, ${TIE_BREAK}`,
    )
  })

  it('rejects sort fields with invalid characters to prevent injection', () => {
    expect(orderByClause("title'; DROP TABLE content; --")).toBe(` ORDER BY ${TIE_BREAK}`)
    expect(orderByClause('title;drop')).toBe(` ORDER BY ${TIE_BREAK}`)
    expect(orderByClause('title.field')).toBe(` ORDER BY ${TIE_BREAK}`)
  })

  it('allows word characters and hyphens in field names', () => {
    expect(orderByClause('display_name')).toBe(
      ` ORDER BY ${fieldKeys('display_name', 'ASC')}, ${TIE_BREAK}`,
    )
  })

  it('accepts all direct sort columns', () => {
    for (const column of ['slug', 'status', 'locale', 'created_at']) {
      expect(orderByClause(column)).toBe(` ORDER BY ${column} ASC, ${TIE_BREAK}`)
    }
  })
})
