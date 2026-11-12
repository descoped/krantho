import { describe, expect, it } from 'vitest'
import { detectDimensions } from '../src/image-dimensions.js'

/**
 * Create minimal valid image buffers for testing dimension detection.
 * These are the smallest possible valid headers for each format.
 */

function createPngBuffer(width: number, height: number): Uint8Array {
  const buf = new Uint8Array(24)
  // PNG signature
  buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  // IHDR chunk length (13 bytes)
  buf.set([0x00, 0x00, 0x00, 0x0d], 8)
  // IHDR chunk type
  buf.set([0x49, 0x48, 0x44, 0x52], 12)
  // Width (4 bytes big-endian)
  const view = new DataView(buf.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return buf
}

function createGifBuffer(width: number, height: number): Uint8Array {
  const buf = new Uint8Array(10)
  // GIF89a signature
  buf.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
  // Width and height (little-endian 16-bit)
  const view = new DataView(buf.buffer)
  view.setUint16(6, width, true)
  view.setUint16(8, height, true)
  return buf
}

describe('detectDimensions', () => {
  it('detects PNG dimensions', () => {
    const buf = createPngBuffer(1920, 1080)
    const dims = detectDimensions(buf)
    expect(dims).toEqual({ width: 1920, height: 1080 })
  })

  it('detects GIF dimensions', () => {
    const buf = createGifBuffer(320, 240)
    const dims = detectDimensions(buf)
    expect(dims).toEqual({ width: 320, height: 240 })
  })

  it('returns null for empty buffer', () => {
    expect(detectDimensions(new Uint8Array(0))).toBeNull()
  })

  it('returns null for too-short buffer', () => {
    expect(detectDimensions(new Uint8Array(4))).toBeNull()
  })

  it('returns null for unrecognized format', () => {
    const buf = new Uint8Array(32)
    buf.fill(0x42)
    expect(detectDimensions(buf)).toBeNull()
  })
})
