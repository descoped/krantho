import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  BODY,
  liveModeHooks,
  loadPage,
  renderLive,
  replaceRichText,
  richEditor,
} from './fixtures/live-mode.js'

liveModeHooks()

/** Seeded interleavings verify that editing, cancelling and outside writes never lose neighbouring sections. */
describe('Visual Markdown editing keeps the body whole', () => {
  for (let seed = 1; seed <= 60; seed++) {
    it(`seed ${seed}`, async () => {
      let state = seed >>> 0
      const random = (): number => {
        state = (state * 1664525 + 1013904223) >>> 0
        return state / 2 ** 32
      }
      const eol = random() < 0.5 ? '\r\n' : '\n'
      const original = BODY.replaceAll('\n', eol)
      const live = renderLive({}, original)
      const doc = loadPage()
      for (let step = 0; step < 10; step++) {
        const problem = doc.getElementById('problem')
        if (!problem) throw new Error('missing section')
        fireEvent.click(problem.querySelector('p') ?? problem)
        const editor = await richEditor(doc)
        const before = live.draft().body
        const next = `Text ${seed} ${step} with literal ## and fences \`\`\`.`
        await replaceRichText(editor, next)
        const roll = random()
        if (roll < 0.3) {
          fireEvent.click(screen.getByRole('button', { name: 'Cancel this element’s edit' }))
          expect(live.draft().body).toBe(before)
        } else if (roll < 0.6) {
          const restored = `${original}${eol}Outside ${step}${eol}`
          live.replaceBody(restored)
          expect(live.draft().body).toBe(restored)
        } else {
          fireEvent.click(screen.getByRole('button', { name: 'Done editing' }))
          expect(live.draft().body).toContain(`Text ${seed} ${step}`)
        }
        expect(doc.querySelector('.ProseMirror')).toBeNull()
        expect(live.draft().body).toContain(`Lead words.${eol}${eol}## Problem${eol}${eol}`)
        expect(live.draft().body).toContain(`${eol}${eol}## Notes${eol}${eol}More.`)
      }
    })
  }
})
