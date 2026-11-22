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

  it('keeps a width the markdown gives and derives the height from the proportions', () => {
    const html = pictureImages('<img src="/images/diagram.png" width="340">', lookup)

    expect(html).toContain(
      '<img src="/images/diagram.png" width="340" height="170" decoding="async">',
    )
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
