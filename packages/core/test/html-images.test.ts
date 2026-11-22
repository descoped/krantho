import { describe, expect, it } from 'vitest'
import { renderContent } from '../src/content-engine.js'
import { type ImageLookup, pictureImages, type ResponsiveImage } from '../src/html-images.js'

const diagram: ResponsiveImage = {
  width: 1000,
  height: 500,
  sources: [
    { type: 'image/avif', srcset: '/c/diagram-256.avif 256w, /c/diagram-1000.avif 1000w' },
    { type: 'image/webp', srcset: '/c/diagram-256.webp 256w, /c/diagram-1000.webp 1000w' },
  ],
  sizes: '100vw',
}

const lookup: ImageLookup = (src) => (src === '/images/diagram.png' ? diagram : undefined)

describe('pictureImages', () => {
  it('turns an image with copies into a picture with a source per format', () => {
    const html = pictureImages('<p><img src="/images/diagram.png" alt="Flow"></p>', lookup)

    expect(html).toBe(
      '<p><picture>' +
        '<source type="image/avif" srcset="/c/diagram-256.avif 256w, /c/diagram-1000.avif 1000w" sizes="100vw">' +
        '<source type="image/webp" srcset="/c/diagram-256.webp 256w, /c/diagram-1000.webp 1000w" sizes="100vw">' +
        '<img src="/images/diagram.png" alt="Flow" width="1000" height="500" decoding="async">' +
        '</picture></p>',
    )
  })

  it('keeps a width the markdown gives, derives the height, and shows it at that width', () => {
    const html = pictureImages('<img src="/images/diagram.png" width="340">', lookup)

    expect(html).toContain('sizes="340px"')
    expect(html).not.toContain('sizes="100vw"')

    expect(html).toContain(
      '<img src="/images/diagram.png" width="340" height="170" decoding="async">',
    )
  })

  it('keeps the column sizes and the height for a width that is not in pixels', () => {
    const html = pictureImages('<img src="/images/diagram.png" width="50%">', lookup)

    expect(html).toContain('sizes="100vw"')
    expect(html).not.toContain('sizes="50px"')
    expect(html).toContain('<img src="/images/diagram.png" width="50%" decoding="async">')
  })

  it('loads every image after the first lazily, with or without copies', () => {
    const html = pictureImages(
      '<img src="/other.png"><img src="/images/diagram.png"><img src="/images/diagram.png" loading="eager">',
      lookup,
    )

    expect(html).toContain(
      '<img src="/images/diagram.png" width="1000" height="500" decoding="async" loading="lazy">',
    )
    expect(html).toContain('loading="eager" width="1000" height="500" decoding="async">')
    expect(html).not.toContain('loading="eager" width="1000" height="500" decoding="async" loading')
  })

  it('leaves an image without copies as written', () => {
    const html = '<p><img src="/photo.gif" alt="A"></p>'

    expect(pictureImages(html, lookup)).toBe(html)
  })

  it('reads src as an attribute, not from another attribute that mentions it', () => {
    const html = '<img alt="src=/images/diagram.png" src="/other.png">'

    expect(pictureImages(html, lookup)).toBe(html)
  })
})

describe('pictureImages on unusual HTML', () => {
  it('leaves an image inside a picture the markdown writes itself', () => {
    const html =
      '<picture><source srcset="/a.avif"><img src="/images/diagram.png"></picture><img src="/images/diagram.png">'

    const out = pictureImages(html, lookup)

    expect(
      out.startsWith('<picture><source srcset="/a.avif"><img src="/images/diagram.png"></picture>'),
    ).toBe(true)
    expect(out.match(/<picture>/g)).toHaveLength(2)
  })

  it('looks an image up by its src as the browser reads it, entities decoded', () => {
    const seen: string[] = []
    pictureImages('<img src="/a&amp;b.png"><img src="/c&#39;d.png">', (src) => {
      seen.push(src)
      return undefined
    })

    expect(seen).toEqual(['/a&b.png', "/c'd.png"])
  })

  it('reads a tag whose quoted value holds a >, and stops at a tag that never ends', () => {
    const quoted = pictureImages('<img alt="a > b" src="/images/diagram.png">', lookup)
    expect(quoted).toContain('<picture>')

    const open = `${'<img "'.repeat(20000)}`
    const started = performance.now()
    expect(pictureImages(open, lookup)).toBe(open)
    expect(performance.now() - started).toBeLessThan(500)
  })
})

describe('pictureImages on the forms an img tag takes', () => {
  it('reads single-quoted and unquoted src values', () => {
    expect(pictureImages("<img src='/images/diagram.png'>", lookup)).toContain('<picture>')
    expect(pictureImages('<img src=/images/diagram.png>', lookup)).toContain('<picture>')
  })

  it('keeps an attribute without a value, such as hidden', () => {
    expect(pictureImages('<img hidden src="/images/diagram.png">', lookup)).toContain(
      '<img hidden src="/images/diagram.png" width="1000"',
    )
  })

  it('keeps a self-closing tag self-closing', () => {
    expect(pictureImages('<img src="/images/diagram.png" />', lookup)).toContain(
      '<img src="/images/diagram.png" width="1000" height="500" decoding="async"/>',
    )
  })

  it('reads an upper-case tag', () => {
    expect(pictureImages('<IMG SRC="/images/diagram.png">', lookup)).toContain('<picture>')
  })

  it('skips a tag that only starts like img', () => {
    const html = '<image src="/images/diagram.png"><imgx>'

    expect(pictureImages(html, lookup)).toBe(html)
  })

  it('keeps a height the markdown gives, and the image width for a zero width', () => {
    expect(pictureImages('<img src="/images/diagram.png" height="90">', lookup)).toContain(
      '<img src="/images/diagram.png" height="90" decoding="async">',
    )
    const zero = pictureImages('<img src="/images/diagram.png" width="0">', lookup)
    expect(zero).toContain('sizes="100vw"')
    expect(zero).toContain('width="0" decoding="async">')
  })

  it('decodes hex references and leaves unknown entities as written', () => {
    const seen: string[] = []
    pictureImages('<img src="/a&#x27;b.png"><img src="/c&nbsp;d.png">', (src) => {
      seen.push(src)
      return undefined
    })

    expect(seen).toEqual(["/a'b.png", '/c&nbsp;d.png'])
  })
})

describe('renderContent with image copies', () => {
  it('renders a markdown image with copies as a picture, after the base path is added', async () => {
    const atBase: ImageLookup = (src) => (src === '/docs/images/diagram.png' ? diagram : undefined)
    const rendered = await renderContent({}, '![Flow](/images/diagram.png)', {
      basePath: '/docs',
      images: atBase,
    })

    expect(rendered.html).toContain('<picture><source type="image/avif"')
    expect(rendered.html).toContain('<img src="/docs/images/diagram.png" alt="Flow" width="1000"')
  })
})
