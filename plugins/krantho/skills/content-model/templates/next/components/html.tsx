import type { KranthoMarks } from '@krantho/core/marks'

/**
 * HTML that krantho rendered from markdown — a document's body or one of its
 * `##` sections. The markdown comes from signed-in editors; keep Studio
 * behind sign-in before a site serves traffic. `marks` are a section's Live
 * marks (`kranthoSection`), present only in an editor's preview.
 */
export function Html({
  html,
  className = 'prose',
  as: Tag = 'div',
  marks = {},
}: {
  html: string | undefined
  className?: string
  as?: 'div' | 'section'
  marks?: KranthoMarks
}): React.ReactElement | null {
  if (!html) return null
  return <Tag className={className} {...marks} dangerouslySetInnerHTML={{ __html: html }} />
}
