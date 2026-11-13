import { describe, expect, it } from 'vitest'
import { fileNameOf, slugOfFile } from '../src/content-files.js'

describe('content files', () => {
  it('names each document by its markdown file', () => {
    expect(slugOfFile({}, 'setup.md')).toBe('setup')
    expect(slugOfFile({}, 'index.md')).toBe('index')
    expect(slugOfFile({}, 'logo.png')).toBeNull()
    expect(fileNameOf({}, 'index')).toBe('index.md')
  })

  it('reads a named index file as the index document, and index.md not at all', () => {
    const readme = { indexFile: 'README.md' }

    expect(slugOfFile(readme, 'README.md')).toBe('index')
    expect(slugOfFile(readme, 'index.md')).toBeNull()
    expect(slugOfFile(readme, 'setup.md')).toBe('setup')
    expect(fileNameOf(readme, 'index')).toBe('README.md')
    expect(fileNameOf(readme, 'setup')).toBe('setup.md')
  })
})
