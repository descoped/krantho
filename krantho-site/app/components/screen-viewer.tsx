'use client'

import { useEffect, useRef, useState } from 'react'
import { Icon } from './icons'

// A page body's screenshots (`{{screen:…}}`, lib/markdown.ts) open here at full
// width, over the page, instead of navigating to the image. The link stays the
// fallback without JavaScript. Esc, the close button or a click beside the
// image closes it, and focus returns to the screenshot.

interface Shown {
  src: string
  alt: string
}

export function ScreenViewer(): React.ReactElement {
  const dialog = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const [shown, setShown] = useState<Shown | null>(null)

  useEffect(() => {
    const onClick = (event: MouseEvent): void => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return
      const link = event.target instanceof Element ? event.target.closest('a.shot__img') : null
      if (!(link instanceof HTMLAnchorElement)) return
      event.preventDefault()
      opener.current = link
      setShown({ src: link.href, alt: link.querySelector('img')?.alt ?? '' })
      dialog.current?.showModal()
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  const close = (): void => dialog.current?.close()

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Esc closes the dialog natively; the click is on its backdrop
    <dialog
      ref={dialog}
      className="screen-viewer"
      aria-label={shown?.alt || 'Screenshot'}
      onClose={() => {
        setShown(null)
        opener.current?.focus()
      }}
      onClick={(event) => {
        // A click beside the image lands on the dialog itself, which is the backdrop
        if (event.target === event.currentTarget) close()
      }}
    >
      <button type="button" className="screen-viewer__close" aria-label="Close" onClick={close}>
        <Icon name="cross" size={20} />
      </button>
      {shown && <img className="screen-viewer__img" src={shown.src} alt={shown.alt} />}
    </dialog>
  )
}
