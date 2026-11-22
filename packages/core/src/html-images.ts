/** One format of a responsive image: its MIME type and the `srcset` of its widths */
export interface ImageSource {
  readonly type: string
  readonly srcset: string
}

/** The smaller copies of an image, and its own size */
export interface ResponsiveImage {
  /** The image's own width and height, in pixels */
  readonly width: number
  readonly height: number
  /** One entry per format, in the order the browser should try them */
  readonly sources: readonly ImageSource[]
  /** The `sizes` of each `<source>`: how wide the image is shown */
  readonly sizes: string
}

/** The copies of an image by its `src` as rendered, or undefined when it has none */
export type ImageLookup = (src: string) => ResponsiveImage | undefined

/** One `<img>` start tag in a piece of HTML, and where it starts */
interface ImgTag {
  start: number
  tag: string
}

/** One attribute of a tag: its name and its value, quoted or not */
const ATTRIBUTE = /\s([^\s=>"'/]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>"']+))?/g

const ENTITIES: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' }

/** The index of the `>` that ends a start tag, skipping quoted values, or -1 */
function tagEnd(html: string, from: number): number {
  let quote = ''
  for (let i = from; i < html.length; i++) {
    const char = html.charAt(i)
    if (quote) {
      if (char === quote) quote = ''
    } else if (char === '"' || char === "'") {
      quote = char
    } else if (char === '>') {
      return i
    }
  }
  return -1
}

/**
 * The `<img>` start tags of a piece of HTML, in order, read in one pass: a `>`
 * inside a quoted value does not end a tag, and a tag that never ends ends the
 * scan, so the time grows with the length of the HTML alone.
 */
function imgTags(html: string, lower: string): ImgTag[] {
  const tags: ImgTag[] = []
  let from = 0
  while (from < html.length) {
    const start = lower.indexOf('<img', from)
    if (start < 0) break
    if (!/\s/.test(html.charAt(start + 4))) {
      from = start + 4
      continue
    }
    const end = tagEnd(html, start + 4)
    if (end < 0) break
    tags.push({ start, tag: html.slice(start, end + 1) })
    from = end + 1
  }
  return tags
}

/** Whether a position in the HTML is inside a `<picture>` the markdown writes itself */
function insidePicture(lower: string, position: number): boolean {
  return lower.lastIndexOf('<picture', position) > lower.lastIndexOf('</picture', position)
}

/** An attribute value as the browser reads it: `&amp;` is `&`, `&#39;` is `'` */
function decodeEntities(value: string): string {
  return value.replace(/&(#\d{1,7}|#x[\da-f]{1,6}|[a-z]{2,4});/gi, (entity, code: string) => {
    if (code.startsWith('#x') || code.startsWith('#X')) {
      return String.fromCodePoint(Number.parseInt(code.slice(2), 16))
    }
    if (code.startsWith('#')) return String.fromCodePoint(Number.parseInt(code.slice(1), 10))
    return ENTITIES[code.toLowerCase()] ?? entity
  })
}

/** The attributes of a start tag, by lower-case name, with quotes removed */
function attributesOf(tag: string): Map<string, string> {
  const attributes = new Map<string, string>()
  for (const match of tag.matchAll(ATTRIBUTE)) {
    const name = match[1]?.toLowerCase()
    if (!name || name === 'img') continue
    const raw = match[2] ?? ''
    const quoted = raw.startsWith('"') || raw.startsWith("'")
    attributes.set(name, quoted ? raw.slice(1, -1) : raw)
  }
  return attributes
}

/** A tag with an attribute added before its end, unless it already has one by that name */
function withAttribute(
  tag: string,
  attributes: Map<string, string>,
  name: string,
  value: string,
): string {
  if (attributes.has(name)) return tag
  attributes.set(name, value)
  const end = tag.endsWith('/>') ? tag.length - 2 : tag.length - 1
  return `${tag.slice(0, end).trimEnd()} ${name}="${value}"${tag.slice(end)}`
}

/**
 * The `<img>` with the size the page reserves for it: its own width and height,
 * or, when the markdown gives a width (`<img width="340">`), that width and the
 * height that keeps the image's proportions.
 */
function sized(tag: string, attributes: Map<string, string>, image: ResponsiveImage): string {
  if (attributes.has('height')) return tag
  const width = Number.parseInt(attributes.get('width') ?? '', 10)
  if (Number.isFinite(width) && width > 0) {
    return withAttribute(
      tag,
      attributes,
      'height',
      String(Math.round((width * image.height) / image.width)),
    )
  }
  if (attributes.has('width')) return tag
  const withWidth = withAttribute(tag, attributes, 'width', String(image.width))
  return withAttribute(withWidth, attributes, 'height', String(image.height))
}

/** One `<img>` as a `<picture>` when it has copies, or as written */
function pictureOf(tag: string, lazy: boolean, inPicture: boolean, lookup: ImageLookup): string {
  const attributes = attributesOf(tag)
  // An image the markdown sizes is shown at that width, whatever the column's
  const width = Number.parseInt(attributes.get('width') ?? '', 10)
  const src = attributes.get('src')
  const image = src && !inPicture ? lookup(decodeEntities(src)) : undefined
  if (!image) return tag
  let img = sized(tag, attributes, image)
  img = withAttribute(img, attributes, 'decoding', 'async')
  if (lazy) img = withAttribute(img, attributes, 'loading', 'lazy')
  const sizes = Number.isFinite(width) && width > 0 ? `${width}px` : image.sizes
  const sources = image.sources
    .map((source) => `<source type="${source.type}" srcset="${source.srcset}" sizes="${sizes}">`)
    .join('')
  return `<picture>${sources}${img}</picture>`
}

/**
 * Turn each `<img>` that has smaller copies into a `<picture>`: one `<source>`
 * per format with its `srcset` and `sizes`, and the image itself as the
 * fallback, sized so the page does not shift as it loads. Images decode off the
 * main thread, and every image after the first loads lazily. An image whose
 * width the markdown gives is shown at that width (`sizes="340px"`). An `<img>` with
 * no copies, or one inside a `<picture>` the markdown writes itself, is left
 * as written.
 */
export function pictureImages(html: string, lookup: ImageLookup): string {
  const lower = html.toLowerCase()
  let out = ''
  let copied = 0
  imgTags(html, lower).forEach(({ start, tag }, index) => {
    out += html.slice(copied, start)
    out += pictureOf(tag, index > 0, insidePicture(lower, start), lookup)
    copied = start + tag.length
  })
  return out + html.slice(copied)
}
