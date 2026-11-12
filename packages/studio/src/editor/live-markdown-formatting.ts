import type { EditorState } from '@milkdown/prose/state'

export interface Formatting {
  bold: boolean | 'mixed'
  italic: boolean | 'mixed'
  strike: boolean | 'mixed'
  link: boolean | 'mixed'
  bullet: boolean | 'mixed'
  ordered: boolean | 'mixed'
  quote: boolean | 'mixed'
  style: string
}

/** Read formatting from the selection, or the marks a caret will type with. */
export function formattingOf(state: EditorState): Formatting {
  const { from, to, empty, $from } = state.selection
  const portions: {
    bold: boolean
    italic: boolean
    strike: boolean
    link: boolean
    bullet: boolean
    ordered: boolean
    quote: boolean
    style: string
  }[] = []
  const portion = (position: number, marks: readonly { type: { name: string } }[]): void => {
    const at = state.doc.resolve(position)
    const ancestors = Array.from({ length: at.depth }, (_, index) => at.node(index + 1).type.name)
    portions.push({
      bold: marks.some((mark) => mark.type.name === 'strong'),
      italic: marks.some((mark) => mark.type.name === 'emphasis'),
      strike: marks.some((mark) => mark.type.name === 'strike_through'),
      link: marks.some((mark) => mark.type.name === 'link'),
      bullet: ancestors.includes('bullet_list'),
      ordered: ancestors.includes('ordered_list'),
      quote: ancestors.includes('blockquote'),
      style:
        at.parent.type.name === 'heading'
          ? String(at.parent.attrs.level)
          : at.parent.type.name === 'paragraph'
            ? '0'
            : at.parent.type.name,
    })
  }
  if (empty) portion(from, state.storedMarks ?? $from.marks())
  else
    state.doc.nodesBetween(from, to, (node, position) => {
      if (node.isText) portion(Math.max(from, position), node.marks)
    })
  if (portions.length === 0) portion(from, $from.marks())
  const pressed = (
    key: 'bold' | 'italic' | 'strike' | 'link' | 'bullet' | 'ordered' | 'quote',
  ): boolean | 'mixed' => {
    if (portions.every((part) => part[key])) return true
    return portions.some((part) => part[key]) ? 'mixed' : false
  }
  const style = portions[0]?.style ?? '0'
  return {
    bold: pressed('bold'),
    italic: pressed('italic'),
    strike: pressed('strike'),
    link: pressed('link'),
    bullet: pressed('bullet'),
    ordered: pressed('ordered'),
    quote: pressed('quote'),
    style: portions.every((part) => part.style === style) ? style : 'mixed',
  }
}
