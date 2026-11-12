import { describe, expect, it } from 'vitest'
import { DEFAULT_FRONTMATTER_STATUS, splitFrontmatter } from '../src/frontmatter-utils.js'

describe('splitFrontmatter', () => {
  it('separates system fields from content fields', () => {
    const { fields, status, locale } = splitFrontmatter(
      {
        title: 'About',
        status: 'draft',
        locale: 'nb',
      },
      'sv',
    )
    expect(fields).toEqual({ title: 'About' })
    expect(status).toBe('draft')
    expect(locale).toBe('nb')
  })

  it('gives a file that declares no locale the supplied default locale', () => {
    expect(splitFrontmatter({ title: 'About' }, 'nb').locale).toBe('nb')
  })

  it('falls back to the shipped status when frontmatter declares none', () => {
    expect(splitFrontmatter({ title: 'About' }, 'nb').status).toBe(DEFAULT_FRONTMATTER_STATUS)
  })

  it('uses a caller-supplied default status instead', () => {
    expect(splitFrontmatter({ title: 'About' }, 'nb', 'draft').status).toBe('draft')
  })

  it('lets declared frontmatter win over the supplied default', () => {
    expect(splitFrontmatter({ title: 'About', status: 'published' }, 'nb', 'draft').status).toBe(
      'published',
    )
  })
})
