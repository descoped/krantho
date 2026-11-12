import {
  defaultValueCtx,
  Editor,
  editorViewCtx,
  editorViewOptionsCtx,
  rootCtx,
  serializerCtx,
} from '@milkdown/core'
import { history } from '@milkdown/plugin-history'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import type { EditorState } from '@milkdown/prose/state'
import type { EditorView } from '@milkdown/prose/view'
import { type RefObject, useEffect, useRef, useState } from 'react'
import { codeBlockWithMeta } from './live-code-block.js'
import { patchSection } from './live-marks.js'
import { editorLabel, type InlineEditorProps, type openSplice } from './live-overlay.js'
import { spliceBody } from './side-panel/page-sections.js'

/** The Milkdown engine mounted in the page element, and what an edit has changed so far */
export interface MarkdownEngine {
  readonly engine: RefObject<Editor | null>
  /** The section's Markdown as last serialized */
  readonly text: RefObject<string>
  readonly changed: RefObject<boolean>
  readonly ready: boolean
  readonly error: string
}

/**
 * Mount the visual editor in the section's own element: every change writes
 * the body and patches the section's other renderings; closing restores the
 * template's markup with the new text.
 */
export function useMarkdownEngine(
  props: InlineEditorProps,
  opened: ReturnType<typeof openSplice>,
  onSelection: (state: EditorState) => void,
): MarkdownEngine {
  const element = props.elements[0]
  const engine = useRef<Editor | null>(null)
  const latest = useRef(props)
  latest.current = props
  const follow = useRef(onSelection)
  follow.current = onSelection
  const text = useRef(opened?.text ?? '')
  const changed = useRef(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!element || !opened) return
    let disposed = false
    const original = element.innerHTML
    const doc = element.ownerDocument
    const root = doc.createElement('div')
    root.className = 'live-markdown-root'
    const finishOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      latest.current.onClose()
    }
    root.addEventListener('keydown', finishOnEscape)
    const style = doc.createElement('style')
    style.textContent =
      '.live-markdown-root .ProseMirror{outline:none;min-height:1em;white-space:pre-wrap;overflow-wrap:break-word}.live-markdown-root .ProseMirror-selectednode{outline:2px solid currentColor}.live-markdown-root .ProseMirror p:first-child{margin-top:0}.live-markdown-root .ProseMirror p:last-child{margin-bottom:0}'
    const heading = element.firstElementChild?.tagName === 'H2' ? element.firstElementChild : null
    element.replaceChildren(...(heading ? [heading] : []), style, root)
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root)
        ctx.set(defaultValueCtx, opened.text)
        ctx.update(editorViewOptionsCtx, (options) => ({
          ...options,
          dispatchTransaction(this: EditorView, transaction) {
            this.updateState(this.state.apply(transaction))
            if (!disposed && engine.current) follow.current(this.state)
            if (disposed || !engine.current || !transaction.docChanged) return
            changed.current = true
            text.current = ctx.get(serializerCtx)(this.state.doc).trimEnd()
            const current = latest.current
            current.onBody(spliceBody(opened, text.current))
            for (const other of current.elements) {
              if (other !== element) {
                patchSection(
                  other,
                  text.current,
                  current.target.kind === 'section' ? current.target.heading : null,
                )
              }
            }
            current.onPatched()
          },
        }))
      })
      .use(commonmark)
      .use(codeBlockWithMeta)
      .use(gfm)
      .use(history)
    void editor
      .create()
      .then(() => {
        if (disposed) {
          void editor.destroy()
          return
        }
        engine.current = editor
        editor.action((ctx) => {
          const view = ctx.get(editorViewCtx)
          view.dom.setAttribute('aria-label', editorLabel(latest.current.target))
          view.dom.setAttribute('role', 'textbox')
          view.dom.setAttribute('aria-multiline', 'true')
          follow.current(view.state)
          view.focus()
        })
        setReady(true)
        latest.current.onPatched()
      })
      .catch(() => {
        if (disposed) return
        engine.current = null
        void editor.destroy()
        element.innerHTML = original
        setError(
          'This content could not be opened visually. Use Structure mode to edit its Markdown.',
        )
      })
    return () => {
      disposed = true
      engine.current = null
      void editor.destroy()
      if (changed.current) {
        // Keep the template's section heading, even after the engine replaced its content.
        element.innerHTML = original
        patchSection(
          element,
          text.current,
          latest.current.target.kind === 'section' ? latest.current.target.heading : null,
        )
      } else element.innerHTML = original
    }
  }, [element, opened])
  return { engine, text, changed, ready, error }
}
