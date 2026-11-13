import { describe, expect, it } from 'vitest'
import { renderContent } from '../src/content-engine.js'

describe('renderContent', () => {
  const body = '# @title\n\nIntro.\n\n## Details\n\nMore about @title.'

  it('substitutes @-references, renders HTML and extracts h2 sections', async () => {
    const rendered = await renderContent({ title: 'Krantho' }, body)

    expect(rendered.content).toContain('# Krantho')
    expect(rendered.html).toContain('<h1>Krantho</h1>')
    expect(Object.keys(rendered.sections)).toEqual(['Details'])
    expect(rendered.sections.Details).toContain('More about Krantho.')
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

  describe('under a base path', () => {
    const links = [
      '[Guide](/docs/guide/) ![Logo](/images/logo.svg)',
      '[Site](https://example.com/x) [Other](//cdn.example.com/a.js) [Near](guide/) [Top](#top)',
      '[Already](/repo/docs/x/) [Root](/repo) [Query](/repo?q=1) [Anchor](/repo#top) [Near](/repository/)',
      '',
      '## Links',
      '',
      'See [setup](/docs/setup/).',
    ].join('\n')

    it('puts the base path in front of URLs that start at the site root', async () => {
      const { html, sections } = await renderContent({}, links, { basePath: '/repo/' })

      expect(html).toContain('href="/repo/docs/guide/"')
      expect(html).toContain('src="/repo/images/logo.svg"')
      expect(sections.Links).toContain('href="/repo/docs/setup/"')
    })

    it('leaves absolute, protocol-relative, relative and already-based URLs as written', async () => {
      const { html } = await renderContent({}, links, { basePath: '/repo' })

      expect(html).toContain('href="https://example.com/x"')
      expect(html).toContain('href="//cdn.example.com/a.js"')
      expect(html).toContain('href="guide/"')
      expect(html).toContain('href="#top"')
      expect(html).toContain('href="/repo/docs/x/"')
      expect(html).toContain('href="/repo"')
      expect(html).toContain('href="/repo?q=1"')
      expect(html).toContain('href="/repo#top"')
      expect(html).toContain('href="/repo/repository/"')
    })

    it('resolves each URL before the base path is added', async () => {
      const resolveUrl = (url: string): string => (url === 'guide/' ? '/docs/guide/' : url)
      const { html } = await renderContent({}, links, { basePath: '/repo', resolveUrl })
      const { html: unbased } = await renderContent({}, links, { resolveUrl })

      expect(html).toContain('href="/repo/docs/guide/"')
      expect(html).toContain('href="#top"')
      expect(unbased).toContain('href="/docs/guide/"')
    })

    it('rewrites the src and href of raw img and a tags as markdown links are', async () => {
      const resolveUrl = (url: string): string => (url.startsWith('images/') ? `/${url}` : url)
      const body = [
        '<p align="center"><img src="images/menu.png" width="340"></p>',
        '',
        'Inline <a href=\'/setup/\'>setup</a> and <img alt=x src="images/b.png">, <span title="images/c">no</span>.',
      ].join('\n')

      const { html } = await renderContent({}, body, { basePath: '/repo', resolveUrl })

      expect(html).toContain('<img src="/repo/images/menu.png" width="340">')
      expect(html).toContain("<a href='/repo/setup/'>")
      expect(html).toContain('src="/repo/images/b.png"')
      expect(html).toContain('<span title="images/c">')
    })

    it('leaves URLs as written without a base path, also after a render with one', async () => {
      await renderContent({}, links, { basePath: '/repo' })
      const { html } = await renderContent({}, links)

      expect(html).toContain('href="/docs/guide/"')
      expect(html).toContain('src="/images/logo.svg"')
    })
  })
})
