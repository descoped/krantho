import { type KranthoMarks, type MarkedDocument, markBodySections } from '@krantho/core/marks'
import { type Rendered, renderMarkdown } from '../../lib/markdown'

// Rendered markdown from a document body. Server-only: highlighting and sample
// embeds happen at render time and land in the cached page. In an editor's
// preview the element carries its Live marks (`marks`), and a whole body
// (`body`) marks its lead and each `##` section; visitors get the plain markup.

export async function Markdown({
  source,
  className = 'prose',
  marks,
  body,
}: {
  source: string
  className?: string
  /** The Live marks of the element: the field or section it renders */
  marks?: KranthoMarks | undefined
  /** The document whose whole body `source` is: its lead and sections get marked */
  body?: MarkedDocument | undefined
}): Promise<React.ReactElement> {
  const { html } = await renderMarkdown(source)
  return <Html html={body ? markBodySections(html, source, body) : html} className={className} marks={marks} />
}

/** Render once, use the HTML and the table of contents separately */
export function render(source: string): Promise<Rendered> {
  return renderMarkdown(source)
}

export function Html({
  html,
  className = 'prose',
  marks,
}: {
  html: string
  className?: string
  /** The Live marks of the element: the field or section it renders */
  marks?: KranthoMarks | undefined
}): React.ReactElement {
  // biome-ignore lint/security/noDangerouslySetInnerHtml: content authored in /studio, rendered on the server
  return <div className={className} {...marks} dangerouslySetInnerHTML={{ __html: html }} />
}
