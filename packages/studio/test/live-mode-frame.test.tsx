import { act, fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { livePreview } from '../src/editor/live-preview.js'
import { LOAD_TIMEOUT_MS } from '../src/editor/use-live-frame.js'
import {
  byId,
  frame,
  frameWindow,
  liveModeHooks,
  loadPage,
  PATH,
  renderLive,
  SRC,
  TITLE,
  tags,
} from './fixtures/live-mode.js'

liveModeHooks()

describe('Live mode reloading the preview', () => {
  it('a new saved version reloads the preview from its entry', () => {
    const view = renderLive()
    loadPage()
    const before = frame()
    view.rerender({ savedVersion: 4 })
    expect(frame()).not.toBe(before)
    expect(frame()).toHaveAttribute('src', SRC)
    expect(screen.getByText('Loading the draft preview…')).toBeVisible()
  })
})

describe('Live mode when the frame does not show the page', () => {
  it('shows the URL it tried, Reload the preview and a Structure mode button when the frame cannot be read', async () => {
    const spies = renderLive()
    Object.defineProperty(frame(), 'contentDocument', { get: () => null })
    fireEvent.load(frame())
    expect(screen.getByText('The page preview did not load')).toBeVisible()
    expect(screen.getByText(SRC)).toBeVisible()
    const before = screen.queryByTitle(TITLE)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Reload the preview' }))
    expect(screen.getByTitle(TITLE)).not.toBe(before)
    Object.defineProperty(frame(), 'contentDocument', { get: () => null })
    fireEvent.load(frame())
    await user.click(screen.getByRole('button', { name: 'Switch to Structure mode' }))
    expect(spies.onStructure).toHaveBeenCalled()
  })

  it('shows the empty state, with Reload the preview, when the preview does not load in time', () => {
    vi.useFakeTimers()
    renderLive()
    act(() => {
      vi.advanceTimersByTime(LOAD_TIMEOUT_MS)
    })
    expect(screen.getByText('The preview took too long to load.')).toBeVisible()
    expect(screen.getByText(SRC)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Reload the preview' })).toBeVisible()
  })

  it('does not count an answer at another path — a refused preview — as the page', () => {
    renderLive()
    loadPage('<pre>{"error":"Authentication required"}</pre>', '/api/preview')
    expect(screen.getByText('The page preview did not load')).toBeVisible()
    expect(
      screen.getByText(
        'The preview answered with an error — for example, your sign-in expired. Reload Studio and try again.',
      ),
    ).toBeVisible()
    expect(screen.getByText(SRC)).toBeVisible()
  })

  it('says the site has no page for the document when its page answers 404, naming the path', () => {
    renderLive()
    loadPage('<h1>Not found</h1>', PATH, 404)
    const alert = screen.getByRole('alert')
    expect(
      within(alert).getByRole('heading', { name: 'The site has no page for this document' }),
    ).toBeVisible()
    expect(alert).toHaveTextContent(
      `${PATH} answered 404: the site’s page templates do not render this document.`,
    )
    expect(screen.queryByText('The page preview did not load')).toBeNull()
    expect(alert).not.toHaveTextContent('sign-in')
    // Structure mode edits every field and section, and the preview can be tried again
    expect(alert).toHaveTextContent(
      'Every field and section can still be edited in Structure mode.',
    )
    expect(within(alert).getByRole('button', { name: 'Switch to Structure mode' })).toBeVisible()
    expect(within(alert).getByRole('button', { name: 'Reload the preview' })).toBeVisible()
    expect(within(alert).getByText(SRC)).toBeVisible()
  })

  it.each([401, 403])('keeps the sign-in wording for a %i answer', (status) => {
    renderLive()
    loadPage('<pre>{"error":"Authentication required"}</pre>', '/api/preview', status)
    expect(screen.getByText('The page preview did not load')).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The preview answered with an error — for example, your sign-in expired. Reload Studio and try again.',
    )
  })

  it('says the status of any other error answer, with the path that gave it', () => {
    renderLive()
    loadPage('<h1>Oops</h1>', PATH, 500)
    expect(screen.getByText('The page preview did not load')).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent(`${PATH} answered 500.`)
    expect(screen.getByRole('alert')).not.toHaveTextContent('sign-in')
  })

  it('says the status of a 404 from another path the same way', () => {
    renderLive()
    loadPage('<h1>Not found</h1>', '/contact', 404)
    expect(screen.getByRole('alert')).toHaveTextContent('/contact answered 404')
  })

  it('says the preview moved when the frame goes to another page, and stops reading its marks', async () => {
    const spies = renderLive()
    const doc = loadPage()
    expect(spies.onFound.mock.lastCall?.[0]).not.toBeNull()
    // A client-side navigation: no load, only a new address
    act(() => {
      frameWindow().history.pushState(null, '', '/about')
    })
    fireEvent.mouseOver(byId(doc, 'title-link'))
    expect(await screen.findByText('/about')).toBeVisible()
    expect(screen.getByText(/The preview moved to/)).toHaveTextContent(
      'The preview moved to /about',
    )
    expect(spies.onFound).toHaveBeenLastCalledWith(null)
    expect(tags()).toEqual([])
    const before = frame()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Back to the page' }))
    expect(frame()).not.toBe(before)
  })

  it('shows the page again when a client-side navigation returns to it', async () => {
    const spies = renderLive()
    const doc = loadPage()
    act(() => {
      frameWindow().history.pushState(null, '', '/about')
    })
    fireEvent.mouseOver(byId(doc, 'title-link'))
    expect(await screen.findByText('/about')).toBeVisible()
    act(() => {
      frameWindow().history.pushState(null, '', PATH)
    })
    // No load fires: the poll and popstate keep looking while the frame is elsewhere
    expect(await screen.findByText(/Click text on the page to edit it/)).toBeVisible()
    expect(spies.onFound.mock.lastCall?.[0]).not.toBeNull()
  })

  it('survives the frame leaving for another origin after it attached, and offers to reload', async () => {
    const removed = vi.spyOn(window, 'removeEventListener')
    renderLive()
    const doc = loadPage()
    const refuse = (): never => {
      throw new DOMException('Blocked a frame with origin', 'SecurityError')
    }
    const win = frameWindow()
    win.removeEventListener = refuse
    doc.removeEventListener = refuse
    Object.defineProperty(frame(), 'contentDocument', { get: refuse })
    fireEvent.load(frame())
    // Said as an alert, its heading taking the focus that was in the frame
    const alert = screen.getByRole('alert')
    const heading = within(alert).getByRole('heading', { name: 'The preview left the page' })
    expect(heading).toHaveFocus()
    expect(screen.queryByText('The page preview did not load')).toBeNull()
    expect(alert).toHaveTextContent('It went to a page Studio cannot read')
    expect(removed).toHaveBeenCalledWith('resize', expect.any(Function), expect.anything())
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reload the preview' }))
    expect(screen.getByTitle(TITLE)).toBeVisible()
  })
})

describe('Live mode with no preview to load', () => {
  const pages = {
    name: 'pages',
    source: 'database',
    directory: undefined,
    pages: true,
    sections: [],
  } as const
  const input = {
    collection: pages,
    slug: 'pricing',
    locale: 'en',
    defaultLocale: 'en',
    sitePreview: true,
    canEdit: true,
  }

  it('has a preview only for a saved default-locale document of a page-rendering collection, for an editor', () => {
    expect(livePreview(input)).toEqual({ src: SRC, path: PATH })
    expect(livePreview({ ...input, slug: null }).src).toBeNull()
    expect(livePreview({ ...input, canEdit: false }).src).toBeNull()
    expect(livePreview({ ...input, locale: 'no' }).src).toBeNull()
    expect(livePreview({ ...input, defaultLocale: null }).src).toBeNull()
    const noPages = { ...pages, pages: false, path: false } as const
    expect(livePreview({ ...input, collection: noPages }).src).toBeNull()
  })

  it('says why, without "did not load" or a URL, and offers Structure mode', () => {
    renderLive({ preview: livePreview({ ...input, sitePreview: false }) })
    expect(screen.queryByTitle(TITLE)).toBeNull()
    expect(screen.getByText('The site does not render drafts for editors')).toBeVisible()
    expect(screen.queryByText('The page preview did not load')).toBeNull()
    expect(screen.queryByText(SRC)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reload the preview' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Switch to Structure mode' })).toBeVisible()
  })

  it('never previews another locale’s version on the default-locale page', () => {
    renderLive({ preview: livePreview({ ...input, locale: 'no' }) })
    expect(screen.queryByTitle(TITLE)).toBeNull()
    expect(
      screen.getByText(
        'Live mode previews the site’s default-locale page; the site’s preview has no locale. Edit no in Structure mode.',
      ),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Switch to Structure mode' })).toBeVisible()
  })

  it('tells a role that cannot edit it cannot open the preview', () => {
    renderLive({ preview: livePreview({ ...input, canEdit: false }) })
    expect(screen.getByText('Your role cannot open the draft preview.')).toBeVisible()
  })
})
