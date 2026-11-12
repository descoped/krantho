import { describe, expect, it } from 'vitest'
import { mediaMarkdown, mediaPreviewUrl } from '../src/lib/media-urls.js'

describe('mediaMarkdown', () => {
  it('should embed the stable xl image URL with the alt text', () => {
    expect(mediaMarkdown({ id: 'abc123', altText: 'A red door' })).toBe(
      '![A red door](/api/media/abc123/image?preset=xl)',
    )
  })

  it('should keep an empty alt text empty', () => {
    expect(mediaMarkdown({ id: 'abc123', altText: '' })).toBe(
      '![](/api/media/abc123/image?preset=xl)',
    )
  })

  it('should escape brackets and collapse line breaks in the alt text', () => {
    expect(mediaMarkdown({ id: 'x', altText: 'Plan [draft]\nv2\\final' })).toBe(
      '![Plan \\[draft\\] v2\\\\final](/api/media/x/image?preset=xl)',
    )
  })
})

describe('mediaPreviewUrl', () => {
  const item = { id: 'abc123', url: '/uploads/1-a-photo.png', crop: null, hotspot: null }

  it('should point at the stable image URL with the preset', () => {
    expect(mediaPreviewUrl(item, 'sm')).toMatch(
      /^\/api\/media\/abc123\/image\?preset=sm&v=[0-9a-z]+$/,
    )
  })

  it('should be the same for an unchanged item', () => {
    expect(mediaPreviewUrl({ ...item }, 'md')).toBe(mediaPreviewUrl(item, 'md'))
  })

  it('should change when a replace gives the item a new url', () => {
    expect(mediaPreviewUrl({ ...item, url: '/uploads/2-b-photo.png' }, 'md')).not.toBe(
      mediaPreviewUrl(item, 'md'),
    )
  })

  it('should change when the crop or hotspot changes', () => {
    const cropped = { ...item, crop: { x: 0, y: 0, width: 0.5, height: 0.5 } }
    const focused = { ...item, hotspot: { x: 0.3, y: 0.7, width: 0.2, height: 0.2 } }
    expect(mediaPreviewUrl(cropped, 'md')).not.toBe(mediaPreviewUrl(item, 'md'))
    expect(mediaPreviewUrl(focused, 'md')).not.toBe(mediaPreviewUrl(item, 'md'))
  })
})
