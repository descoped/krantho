import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GraphEditor } from '../src/editor/data-mode/graph-editor.js'
import { useEnrichment } from '../src/editor/data-mode/use-enrichment.js'
import { saveSeoConfig } from '../src/lib/api.js'
import type { SeoConfigData } from '../src/lib/api-types.js'
import { runEnrichmentJob } from '../src/lib/enrichment-job.js'
import { parseGraph } from '../src/lib/jsonld-graph.js'
import { ToastProvider } from '../src/ui/toast.js'

vi.mock('../src/lib/api.js', async (original) => ({
  ...(await original<typeof import('../src/lib/api.js')>()),
  saveSeoConfig: vi.fn(async () => ({})),
}))

vi.mock('../src/lib/enrichment-job.js', async (original) => ({
  ...(await original<typeof import('../src/lib/enrichment-job.js')>()),
  runEnrichmentJob: vi.fn(),
}))

const TARGET = { collection: 'pages', slug: 'pricing' }

/** A finished job that filled the target */
function filled(alive: () => boolean) {
  if (!alive()) return Promise.resolve(null)
  return Promise.resolve({
    state: 'finished' as const,
    status: {
      jobId: 'j',
      state: 'complete',
      items: [{ ...TARGET, status: 'complete', result: 'Filled' }],
    },
  })
}

afterEach(() => {
  vi.mocked(runEnrichmentJob).mockReset()
})

describe('enriching the open document', () => {
  it('finishes under StrictMode: its simulated unmount and remount leave the run alive', async () => {
    vi.mocked(runEnrichmentJob).mockImplementation(
      (_step, _target, alive) => filled(alive) as ReturnType<typeof runEnrichmentJob>,
    )
    const onFinished = vi.fn()
    const { result } = renderHook(() => useEnrichment(TARGET, onFinished), {
      reactStrictMode: true,
    })
    act(() => result.current.start(['meta-descriptions']))
    await waitFor(() => expect(result.current.run.state).toBe('done'))
    expect(onFinished).toHaveBeenCalledTimes(1)
  })

  it('starts one run at a time: a second start while one runs starts nothing', async () => {
    let answer: () => void = () => {}
    vi.mocked(runEnrichmentJob).mockImplementation(
      (_step, _target, alive) =>
        new Promise((resolve) => {
          answer = () => resolve(filled(alive) as never)
        }),
    )
    const { result } = renderHook(() => useEnrichment(TARGET, () => {}))
    act(() => result.current.start(['meta-descriptions']))
    act(() => result.current.start(['meta-descriptions']))
    expect(runEnrichmentJob).toHaveBeenCalledTimes(1)
    await act(async () => answer())
    await waitFor(() => expect(result.current.run.state).toBe('done'))
  })
})

vi.mock('../src/components/jsonld-graph/GraphBrowser.js', () => ({
  GraphBrowser: ({ onSave }: { onSave?: (config: SeoConfigData) => Promise<void> }) => (
    <button
      type="button"
      onClick={() => {
        void onSave?.({ entities: [{ '@type': 'Article', properties: { headline: 'Prices' } }] })
      }}
    >
      Apply graph
    </button>
  ),
}))

describe('staging the document graph', () => {
  it('adds changes to the content draft without writing the live SEO store', async () => {
    const onStage = vi.fn()
    const emitted = { '@graph': [] }
    render(
      <ToastProvider>
        <GraphEditor
          source={{
            emitted,
            nodes: [],
            model: parseGraph(emitted),
            editable: { entities: [] },
            configs: { document: null, collection: null, site: null },
            catalogTypes: [],
            catalogDetails: new Map(),
          }}
          collection="pages"
          slug="pricing"
          readOnly={null}
          onStage={onStage}
          draftConfig={undefined}
        />
      </ToastProvider>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Apply graph' }))
    expect(onStage).toHaveBeenCalledWith({
      entities: [{ '@type': 'Article', properties: { headline: 'Prices' } }],
    })
    expect(saveSeoConfig).not.toHaveBeenCalled()
    expect(
      await screen.findByText('Graph added to your draft. Save draft, then publish when ready.'),
    ).toBeVisible()
  })
})
