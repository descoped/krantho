import { codeBlockAttr, codeBlockSchema } from '@milkdown/preset-commonmark'

/**
 * The code block, keeping the whole info string of its fence: the language and
 * what follows it (`title="app.ts"`, `stack="next"`). Milkdown's own keeps only
 * the language, so an edit anywhere in a section rewrote its fences without
 * the rest of their opening line. The info string also travels through the
 * clipboard, as `data-meta` on the `pre`.
 */
export const codeBlockWithMeta = codeBlockSchema.extendSchema((prev) => (ctx) => {
  const base = prev(ctx)
  return {
    ...base,
    attrs: { ...base.attrs, meta: { default: '', validate: 'string' } },
    parseDOM: [
      {
        tag: 'pre',
        preserveWhitespace: 'full',
        getAttrs: (dom) => ({
          language: dom instanceof HTMLElement ? (dom.dataset['language'] ?? '') : '',
          meta: dom instanceof HTMLElement ? (dom.dataset['meta'] ?? '') : '',
        }),
      },
    ],
    toDOM: (node) => {
      const attr = ctx.get(codeBlockAttr.key)(node)
      const language: string = node.attrs['language']
      const meta: string = node.attrs['meta']
      return [
        'pre',
        {
          ...attr['pre'],
          ...(language ? { 'data-language': language } : {}),
          ...(meta ? { 'data-meta': meta } : {}),
        },
        ['code', attr['code'], 0],
      ]
    },
    parseMarkdown: {
      match: ({ type }) => type === 'code',
      runner: (state, node, type) => {
        state.openNode(type, {
          language: typeof node['lang'] === 'string' ? node['lang'] : '',
          meta: typeof node['meta'] === 'string' ? node['meta'] : '',
        })
        if (typeof node['value'] === 'string' && node['value']) state.addText(node['value'])
        state.closeNode()
      },
    },
    toMarkdown: {
      match: (node) => node.type.name === 'code_block',
      runner: (state, node) => {
        state.addNode('code', undefined, node.content.firstChild?.text ?? '', {
          lang: node.attrs['language'],
          meta: node.attrs['meta'] || null,
        })
      },
    },
  }
})
