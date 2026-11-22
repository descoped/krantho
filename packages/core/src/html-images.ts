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

/** An `<img>` start tag; a `>` inside a quoted value does not end it */
const IMG_TAG = /<img\s(?:"[^"]*"|'[^']*'|[^>"'])*>/gi

/** One attribute of a tag: its name and its value, quoted or not */
const ATTRIBUTE = /\s([^\s=>"'/]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>"']+))?/g

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

/**
 * Turn each `<img>` that has smaller copies into a `<picture>`: one `<source>`
 * per format with its `srcset` and `sizes`, and the image itself as the
 * fallback, sized so the page does not shift as it loads. Images decode off the
 * main thread, and every image after the first loads lazily. An `<img>` with
 * no copies is left as written.
 */
export function pictureImages(html: string, lookup: ImageLookup): string {
  let first = true
  return html.replace(IMG_TAG, (tag) => {
    const attributes = attributesOf(tag)
    const image = attributes.has('src') ? lookup(attributes.get('src') ?? '') : undefined
    const lazy = !first
    first = false
    if (!image) return tag
    let img = sized(tag, attributes, image)
    img = withAttribute(img, attributes, 'decoding', 'async')
    if (lazy) img = withAttribute(img, attributes, 'loading', 'lazy')
    const sources = image.sources
      .map(
        (source) =>
          `<source type="${source.type}" srcset="${source.srcset}" sizes="${image.sizes}">`,
      )
      .join('')
    return `<picture>${sources}${img}</picture>`
  })
}
