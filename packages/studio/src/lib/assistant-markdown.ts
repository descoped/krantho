import DOMPurify from 'dompurify'
import { Marked } from 'marked'

/**
 * Elements the assistant's text never renders: nothing that loads a resource on
 * its own (an image URL can carry data out of Studio), embeds a page, or
 * takes input.
 */
const FORBID_TAGS = [
  'img',
  'picture',
  'video',
  'audio',
  'iframe',
  'object',
  'embed',
  'form',
  'input',
  'style',
]

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** GFM without raw HTML: an HTML block or tag in the text is shown as text */
const markdown = new Marked({
  gfm: true,
  async: false,
  renderer: {
    html: ({ text }) => escapeHtml(text),
  },
})

type Purifier = ReturnType<typeof DOMPurify>

let purifier: Purifier | null = null

/**
 * Keep a link only when it is http(s) or relative to Studio's origin;
 * external links open in a new tab without an opener or a referrer.
 */
function sanitizeLink(node: Element): void {
  if (node.tagName !== 'A') return
  const href = node.getAttribute('href')
  if (href === null) return
  let url: URL
  try {
    url = new URL(href, window.location.href)
  } catch {
    node.removeAttribute('href')
    return
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    node.removeAttribute('href')
    return
  }
  if (url.origin !== window.location.origin) {
    node.setAttribute('rel', 'noopener noreferrer')
    node.setAttribute('target', '_blank')
  }
}

/** A DOMPurify instance of its own, so the link hook never touches other sanitizing in Studio */
function getPurifier(): Purifier {
  if (purifier) return purifier
  purifier = DOMPurify(window)
  purifier.addHook('afterSanitizeAttributes', sanitizeLink)
  return purifier
}

/** The assistant's markdown as sanitized HTML: no raw HTML, no images or embeds, safe links */
export function renderAssistantMarkdown(text: string): string {
  const html = markdown.parse(text) as string
  return getPurifier().sanitize(html, { FORBID_TAGS, FORBID_ATTR: ['style'] })
}
