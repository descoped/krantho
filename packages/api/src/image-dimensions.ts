/** Detected image dimensions */
export interface ImageDimensions {
  width: number
  height: number
}

/**
 * Detect image dimensions from a buffer by reading format-specific headers.
 * No external dependencies — reads binary headers directly.
 * Returns null if the format is unrecognized or the buffer is too short.
 */
export function detectDimensions(data: Uint8Array): ImageDimensions | null {
  if (data.length < 8) return null

  // PNG: 8-byte signature + IHDR chunk
  if (isPng(data)) return parsePng(data)

  // JPEG: scan for SOF marker
  if (isJpeg(data)) return parseJpeg(data)

  // GIF: logical screen descriptor
  if (isGif(data)) return parseGif(data)

  // WebP: RIFF container
  if (isWebP(data)) return parseWebP(data)

  return null
}

function isPng(d: Uint8Array): boolean {
  return d[0] === 0x89 && d[1] === 0x50 && d[2] === 0x4e && d[3] === 0x47
}

function isJpeg(d: Uint8Array): boolean {
  return d[0] === 0xff && d[1] === 0xd8
}

function isGif(d: Uint8Array): boolean {
  return d[0] === 0x47 && d[1] === 0x49 && d[2] === 0x46
}

function isWebP(d: Uint8Array): boolean {
  return (
    d[0] === 0x52 &&
    d[1] === 0x49 &&
    d[2] === 0x46 &&
    d[3] === 0x46 &&
    d[8] === 0x57 &&
    d[9] === 0x45 &&
    d[10] === 0x42 &&
    d[11] === 0x50
  )
}

function parsePng(d: Uint8Array): ImageDimensions | null {
  // IHDR starts at offset 16: 4 bytes width, 4 bytes height (big-endian)
  if (d.length < 24) return null
  const view = new DataView(d.buffer, d.byteOffset, d.byteLength)
  const width = view.getUint32(16)
  const height = view.getUint32(20)
  return { width, height }
}

function parseJpeg(d: Uint8Array): ImageDimensions | null {
  // Scan for SOF0 (0xFFC0) or SOF2 (0xFFC2) marker
  let offset = 2
  const view = new DataView(d.buffer, d.byteOffset, d.byteLength)

  while (offset < d.length - 8) {
    if (d[offset] !== 0xff) {
      offset++
      continue
    }

    const marker = d[offset + 1]
    if (marker === undefined) break

    // SOF0 or SOF2 — contains dimensions
    if (marker === 0xc0 || marker === 0xc2) {
      // Skip marker (2) + length (2) + precision (1) = offset+5 for height
      const height = view.getUint16(offset + 5)
      const width = view.getUint16(offset + 7)
      return { width, height }
    }

    // Skip this marker segment
    if (marker === 0xd8 || marker === 0xd9) {
      // SOI or EOI — no length field
      offset += 2
    } else {
      const segmentLength = view.getUint16(offset + 2)
      offset += 2 + segmentLength
    }
  }

  return null
}

function parseGif(d: Uint8Array): ImageDimensions | null {
  // Logical screen descriptor at offset 6: width (LE 16), height (LE 16)
  if (d.length < 10) return null
  const view = new DataView(d.buffer, d.byteOffset, d.byteLength)
  const width = view.getUint16(6, true)
  const height = view.getUint16(8, true)
  return { width, height }
}

function parseWebP(d: Uint8Array): ImageDimensions | null {
  if (d.length < 30) return null

  // VP8 (lossy): starts at offset 12 with 'VP8 '
  if (d[12] === 0x56 && d[13] === 0x50 && d[14] === 0x38 && d[15] === 0x20) {
    // Frame header at offset 26: width (LE 16), height (LE 16)
    // Width and height are 14-bit values in the first 4 bytes of the frame
    if (d.length < 30) return null
    const view = new DataView(d.buffer, d.byteOffset, d.byteLength)
    const width = view.getUint16(26, true) & 0x3fff
    const height = view.getUint16(28, true) & 0x3fff
    return { width, height }
  }

  // VP8L (lossless): starts at offset 12 with 'VP8L'
  if (d[12] === 0x56 && d[13] === 0x50 && d[14] === 0x38 && d[15] === 0x4c) {
    // Dimensions encoded in 4 bytes at offset 21
    if (d.length < 25) return null
    const b0 = d[21]!
    const b1 = d[22]!
    const b2 = d[23]!
    const b3 = d[24]!
    const width = 1 + (((b1 & 0x3f) << 8) | b0)
    const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 >> 6) & 0x03))
    return { width, height }
  }

  // VP8X (extended): starts at offset 12 with 'VP8X'
  if (d[12] === 0x56 && d[13] === 0x50 && d[14] === 0x38 && d[15] === 0x58) {
    if (d.length < 30) return null
    // Canvas width at offset 24 (3 bytes LE + 1), height at offset 27 (3 bytes LE + 1)
    const width = 1 + (d[24]! | (d[25]! << 8) | (d[26]! << 16))
    const height = 1 + (d[27]! | (d[28]! << 8) | (d[29]! << 16))
    return { width, height }
  }

  return null
}
