import { randomUUID } from 'node:crypto'

/** Frames document text for the model */
export interface Framer {
  /** `text` inside an `<untrusted-content>` frame that names where it came from */
  frame(source: string, text: string): string
}

/** Any spelling of the frame's tag name; rewritten inside framed text */
const TAG_NAME = /untrusted-content/gi

/**
 * A framer for one chat request. Its frames carry a random nonce the model has
 * never seen in document text, so a document cannot close its own frame; the
 * tag name is also rewritten wherever it appears inside the text. `source` is
 * built by the server (collection, slug, version), never from document text.
 */
export function createFramer(): Framer {
  const nonce = randomUUID().replace(/-/g, '').slice(0, 16)
  return {
    frame(source, text) {
      const safeSource = source.replace(TAG_NAME, 'untrusted_content').replace(/["<>\r\n]/g, ' ')
      const safeText = text.replace(TAG_NAME, 'untrusted_content')
      return `<untrusted-content id="${nonce}" source="${safeSource}">\n${safeText}\n</untrusted-content id="${nonce}">`
    },
  }
}

/** The first `max` characters of `text`, never splitting a surrogate pair */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  const end = /[\uD800-\uDBFF]/.test(text.charAt(max - 1)) ? max - 1 : max
  return text.slice(0, Math.max(0, end))
}
