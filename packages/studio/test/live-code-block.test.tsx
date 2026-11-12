import { Editor, rootCtx, schemaCtx, serializerCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { DOMParser, DOMSerializer } from '@milkdown/prose/model'
import { act, fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { codeBlockWithMeta } from '../src/editor/live-code-block.js'
import { byId, liveModeHooks, loadPage, renderLive, richEditor } from './fixtures/live-mode.js'

liveModeHooks()

/** Opens the Problem section, bolds the first word of its paragraph and returns the draft body */
async function boldFirstWord(body: string): Promise<string> {
  const live = renderLive({}, body)
  const doc = loadPage()
  fireEvent.click(byId(doc, 'problem-p'))
  const editor = await richEditor(doc)
  const text = editor.querySelector('p')?.firstChild
  if (!text) throw new Error('missing paragraph')
  await act(async () => {
    const range = doc.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 4)
    doc.getSelection()?.removeAllRanges()
    doc.getSelection()?.addRange(range)
    doc.dispatchEvent(new Event('selectionchange'))
    await new Promise((resolve) => setTimeout(resolve, 30))
  })
  fireEvent.click(screen.getByRole('button', { name: 'Bold' }))
  return live.draft().body
}

describe('Code blocks in the visual editor', () => {
  it('keeps what follows the language on a fence when text in its section is bolded', async () => {
    const body = await boldFirstWord(
      'Lead.\n\n## Problem\n\nWhat hurts.\n\n```ts title="app.ts" stack="next"\nconst a = 1\n```\n\n## Notes\n\nMore.',
    )
    expect(body).toContain('**What** hurts.')
    expect(body).toContain('```ts title="app.ts" stack="next"\nconst a = 1\n```')
  })

  it('writes a fence with only a language, or none, as it was', async () => {
    const body = await boldFirstWord(
      'Lead.\n\n## Problem\n\nWhat hurts.\n\n```ts\nconst a = 1\n```\n\n```\nplain\n```\n\n## Notes\n\nMore.',
    )
    expect(body).toContain('```ts\nconst a = 1\n```\n\n```\nplain\n```')
  })

  it('carries the info string through HTML, as a copy and paste does', async () => {
    const root = document.createElement('div')
    const editor = await Editor.make()
      .config((ctx) => ctx.set(rootCtx, root))
      .use(commonmark)
      .use(codeBlockWithMeta)
      .create()
    const markdown = editor.action((ctx) => {
      const schema = ctx.get(schemaCtx)
      const pre = document.createElement('pre')
      pre.dataset['language'] = 'ts'
      pre.dataset['meta'] = 'title="app.ts" stack="next"'
      pre.innerHTML = '<code>const a = 1</code>'
      const clipboard = document.createElement('div')
      clipboard.append(pre)
      const pasted = DOMParser.fromSchema(schema).parse(clipboard)
      const html = DOMSerializer.fromSchema(schema).serializeFragment(pasted.content)
      const wrapper = document.createElement('div')
      wrapper.append(html)
      expect(wrapper.querySelector('pre')?.dataset['meta']).toBe('title="app.ts" stack="next"')
      return ctx.get(serializerCtx)(DOMParser.fromSchema(schema).parse(wrapper))
    })
    await editor.destroy()
    expect(markdown.trim()).toBe('```ts title="app.ts" stack="next"\nconst a = 1\n```')
  })
})
