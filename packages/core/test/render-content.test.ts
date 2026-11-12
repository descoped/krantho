import { describe, expect, it } from 'vitest'
import { renderContent } from '../src/content-engine.js'

describe('renderContent', () => {
  const body = '# @title\n\nIntro.\n\n## Details\n\nMore about @title.'

  it('substitutes @-references, renders HTML and extracts h2 sections', async () => {
    const rendered = await renderContent({ title: 'Krantho' }, body)

    expect(rendered.content).toContain('# Krantho')
    expect(rendered.html).toContain('<h1>Krantho</h1>')
    expect(Object.keys(rendered.sections)).toEqual(['Details'])
    expect(rendered.sections['Details']).toContain('More about Krantho.')
  })

  it('leaves @-references alone when at-notation is off', async () => {
    const rendered = await renderContent({ title: 'Krantho' }, body, { atNotation: false })

    expect(rendered.content).toBe(body)
    expect(rendered.html).toContain('@title')
  })

  it('keeps an @-reference to a missing field as written', async () => {
    const rendered = await renderContent({}, 'Hello @name')

    expect(rendered.content).toBe('Hello @name')
  })
})
