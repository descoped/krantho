import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { GraphBrowser } from '../src/components/jsonld-graph/GraphBrowser.js'
import type { CatalogDetailResponse, CatalogType, PropertyDef } from '../src/lib/api-types.js'
import { parseGraph } from '../src/lib/jsonld-graph.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function mkCatalogType(overrides: Partial<CatalogType> & Pick<CatalogType, 'type'>): CatalogType {
  return {
    type: overrides.type,
    label: overrides.label ?? overrides.type,
    description: overrides.description ?? '',
    richResult: overrides.richResult ?? null,
    richResultStatus: overrides.richResultStatus ?? 'none',
    docsUrl: overrides.docsUrl ?? `https://schema.org/${overrides.type}`,
    category: overrides.category ?? 'content',
    siteLevel: overrides.siteLevel ?? false,
    documentLevel: overrides.documentLevel ?? true,
  }
}

function mkPropertyDef(
  overrides: Partial<PropertyDef> & Pick<PropertyDef, 'property' | 'importance'>,
): PropertyDef {
  return {
    property: overrides.property,
    label: overrides.label ?? overrides.property,
    fieldType: overrides.fieldType ?? 'text',
    importance: overrides.importance,
    source: overrides.source ?? 'manual',
  }
}

const CATALOG_TYPES: readonly CatalogType[] = [
  mkCatalogType({
    type: 'ProfessionalService',
    category: 'business',
    siteLevel: true,
    richResult: 'Business Knowledge Panel',
  }),
  mkCatalogType({ type: 'WebSite', category: 'navigation', siteLevel: true }),
  mkCatalogType({ type: 'WebPage', category: 'navigation' }),
  mkCatalogType({ type: 'Service', category: 'commerce', richResult: 'Service rich result' }),
  mkCatalogType({ type: 'Person', category: 'people' }),
]

const SERVICE_DETAIL: CatalogDetailResponse = {
  type: mkCatalogType({ type: 'Service', category: 'commerce', richResult: 'Service rich result' }),
  properties: [
    mkPropertyDef({ property: 'name', importance: 'required' }),
    mkPropertyDef({ property: 'description', importance: 'recommended' }),
    mkPropertyDef({ property: 'provider', importance: 'recommended' }),
  ],
  rules: [
    {
      reader: 'google',
      readerName: 'Google',
      type: 'Service',
      feature: 'Service rich result',
      status: 'active',
      required: ['name'],
      recommended: ['description', 'provider'],
      source: 'https://developers.google.com/search/docs/appearance/structured-data/service',
      verifiedAt: '2026-10-02',
    },
  ],
}

const PROFESSIONAL_SERVICE_DETAIL: CatalogDetailResponse = {
  type: mkCatalogType({
    type: 'ProfessionalService',
    category: 'business',
    siteLevel: true,
    richResult: 'Business Knowledge Panel',
  }),
  properties: [
    mkPropertyDef({ property: 'name', importance: 'required' }),
    mkPropertyDef({ property: 'url', importance: 'required' }),
  ],
  rules: [],
}

const CATALOG_DETAILS = new Map<string, CatalogDetailResponse>([
  ['Service', SERVICE_DETAIL],
  ['ProfessionalService', PROFESSIONAL_SERVICE_DETAIL],
])

const FULL_GRAPH = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'ProfessionalService',
      '@id': 'https://example.com/#business',
      name: 'Example Consulting',
      url: 'https://example.com',
    },
    {
      '@type': 'WebSite',
      '@id': 'https://example.com/#website',
      url: 'https://example.com',
      publisher: { '@id': 'https://example.com/#business' },
    },
    {
      '@type': 'WebPage',
      '@id': 'https://example.com/services/strategy#webpage',
      url: 'https://example.com/services/strategy',
      isPartOf: { '@id': 'https://example.com/#website' },
      mainEntity: { '@id': 'https://example.com/services/strategy#service' },
    },
    {
      '@type': 'Service',
      '@id': 'https://example.com/services/strategy#service',
      name: 'Strategic Consulting',
      description: 'High-level advisory.',
      provider: { '@id': 'https://example.com/#business' },
    },
    {
      '@type': 'Person',
      '@id': 'https://example.com/#founder',
      name: 'Ada Lovelace',
    },
  ],
}

function renderBrowser(data: unknown = FULL_GRAPH): ReturnType<typeof render> {
  const model = parseGraph(data)
  return render(
    <GraphBrowser
      model={model}
      catalogTypes={CATALOG_TYPES}
      catalogDetails={CATALOG_DETAILS}
      rawData={data}
    />,
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GraphBrowser', () => {
  describe('section layout', () => {
    it('renders three sections for a fully populated graph', () => {
      renderBrowser()

      expect(screen.getByText('Site Context')).toBeInTheDocument()
      expect(screen.getByText('Page')).toBeInTheDocument()
      expect(screen.getByText('Primary Entity')).toBeInTheDocument()
    })

    it('renders site context entities under the Site Context section', () => {
      renderBrowser()

      const siteSection = screen.getByText('Site Context').closest('.graph-section')! as HTMLElement
      expect(within(siteSection).getByText('ProfessionalService')).toBeInTheDocument()
      expect(within(siteSection).getByText('WebSite')).toBeInTheDocument()
    })

    it('renders the primary entity under the Primary Entity section', () => {
      renderBrowser()

      const primarySection = screen
        .getByText('Primary Entity')
        .closest('.graph-section')! as HTMLElement
      expect(within(primarySection).getByText('Service')).toBeInTheDocument()
    })

    it('renders linked entities alongside the primary', () => {
      renderBrowser()

      const primarySection = screen
        .getByText('Primary Entity')
        .closest('.graph-section')! as HTMLElement
      expect(within(primarySection).getByText('Person')).toBeInTheDocument()
    })

    it('shows an empty state when the graph has no nodes', () => {
      renderBrowser({})

      expect(screen.getByText(/no composed JSON-LD graph/i)).toBeInTheDocument()
    })
  })

  describe('entity selection', () => {
    it('defaults selection to the primary entity (Service)', () => {
      renderBrowser()

      // The property panel should show the primary entity's type
      const panel = document.querySelector<HTMLElement>('.graph-property-panel')!
      expect(within(panel).getByText('Service')).toBeInTheDocument()
    })

    it('updates the property panel when clicking a different entity', async () => {
      renderBrowser()

      // Click the ProfessionalService entity header
      const businessHeader = screen.getAllByText('ProfessionalService')[0]!
      const selectButton = businessHeader.closest<HTMLElement>('.graph-entity-header-main')!
      await userEvent.click(selectButton)

      const panel = document.querySelector<HTMLElement>('.graph-property-panel')!
      // Panel title should now show ProfessionalService
      const panelTitle = within(panel).getByRole('heading', { level: 3 })
      expect(panelTitle).toHaveTextContent('ProfessionalService')
    })
  })

  describe('entity card expand/collapse', () => {
    it('primary entity starts expanded showing properties', () => {
      renderBrowser()

      const primarySection = screen
        .getByText('Primary Entity')
        .closest('.graph-section')! as HTMLElement
      // The primary entity (Service) has initiallyExpanded=true, so its
      // property list should be visible with the 'name' property.
      expect(within(primarySection).getByText('name')).toBeInTheDocument()
    })

    it('non-primary entities start collapsed', () => {
      renderBrowser()

      const siteSection = screen.getByText('Site Context').closest('.graph-section')! as HTMLElement
      // ProfessionalService is collapsed — its property rows should NOT be visible.
      // "url" is a property of the ProfessionalService entity.
      const urlPropertyRows = siteSection.querySelectorAll('.graph-property-row')
      expect(urlPropertyRows.length).toBe(0)
    })

    it('toggles expansion when clicking the chevron button', async () => {
      renderBrowser()

      const siteSection = screen.getByText('Site Context').closest('.graph-section')! as HTMLElement
      // Find the first expand button in the site section
      const expandButtons = within(siteSection).getAllByLabelText('Expand entity')
      await userEvent.click(expandButtons[0]!)

      // After expanding, the entity body should now be visible
      expect(siteSection.querySelectorAll('.graph-property-row').length).toBeGreaterThan(0)
    })
  })

  describe('cross-reference following', () => {
    it('clicking a reference chip updates the selection to the target entity', async () => {
      vi.useFakeTimers()
      renderBrowser()

      // The primary entity (Service) is expanded and has a 'provider' property
      // that references the ProfessionalService entity via @id.
      // Find the reference chip inside the primary section.
      const primarySection = screen
        .getByText('Primary Entity')
        .closest('.graph-section')! as HTMLElement
      const refLinks = within(primarySection).getAllByRole('button', {
        name: /follow reference/i,
      })
      expect(refLinks.length).toBeGreaterThan(0)

      // Click the reference link for 'provider'
      await act(async () => {
        fireEvent.click(refLinks[0]!)
      })

      // The panel should now show the ProfessionalService entity
      const panel = document.querySelector<HTMLElement>('.graph-property-panel')!
      const panelTitle = within(panel).getByRole('heading', { level: 3 })
      expect(panelTitle).toHaveTextContent('ProfessionalService')

      // The focus highlight should be applied on the target
      const focusedElements = document.querySelectorAll('.graph-focused')
      expect(focusedElements.length).toBeGreaterThan(0)

      // After the animation window the focused class should clear
      act(() => {
        vi.advanceTimersByTime(1300)
      })
      expect(document.querySelectorAll('.graph-focused').length).toBe(0)

      vi.useRealTimers()
    })
  })

  describe('raw JSON toggle', () => {
    it('is present and reveals the raw viewer on click', async () => {
      renderBrowser()

      const toggleButton = screen.getByText('Show raw JSON-LD')
      expect(toggleButton).toBeInTheDocument()

      await userEvent.click(toggleButton)

      // After toggling, the raw JSON viewer header should be visible
      expect(screen.getByText('Raw JSON-LD')).toBeInTheDocument()
      // The button text should change
      expect(screen.getByText('Hide raw JSON-LD')).toBeInTheDocument()
    })

    it('also renders a raw toggle in the empty state', () => {
      renderBrowser({})
      expect(screen.getByText('Show raw JSON-LD')).toBeInTheDocument()
    })
  })

  describe('summary counts', () => {
    it('renders correct entity count', () => {
      renderBrowser()
      expect(screen.getByText('5')).toBeInTheDocument()
      expect(screen.getByText('entities')).toBeInTheDocument()
    })

    it('renders the number of categories present', () => {
      renderBrowser()
      // The fixture has: business, navigation, commerce, people → 4 categories
      expect(screen.getByText('4')).toBeInTheDocument()
      expect(screen.getByText('categories')).toBeInTheDocument()
    })

    it('renders the rich-result eligible count', () => {
      renderBrowser()
      // ProfessionalService + Service have richResult set → 2
      expect(screen.getByText('2')).toBeInTheDocument()
      expect(screen.getByText('rich-result eligible')).toBeInTheDocument()
    })
  })

  describe('category badges', () => {
    it('renders category badges with correct text', () => {
      renderBrowser()

      // The primary entity (Service) should have a Commerce badge
      expect(screen.getAllByText('Commerce & Services').length).toBeGreaterThan(0)
      // Site context has Business and Navigation badges
      expect(screen.getAllByText('Business & Organization').length).toBeGreaterThan(0)
    })

    it('applies category-specific CSS classes', () => {
      renderBrowser()

      const commerceBadges = screen.getAllByText('Commerce & Services')
      expect(commerceBadges[0]!.className).toContain('graph-category-commerce')

      const businessBadges = screen.getAllByText('Business & Organization')
      expect(businessBadges[0]!.className).toContain('graph-category-business')
    })
  })

  describe('property panel', () => {
    it('shows the rich result feature for eligible entities', () => {
      renderBrowser()

      // Default selection is the primary (Service) which has a rich result
      const panel = document.querySelector<HTMLElement>('.graph-property-panel')!
      expect(within(panel).getByText('Service rich result')).toBeInTheDocument()
    })

    it('shows a docs link for the rich result', () => {
      renderBrowser()

      const panel = document.querySelector<HTMLElement>('.graph-property-panel')!
      const docsLink = within(panel).getByText('Docs')
      expect(docsLink).toHaveAttribute(
        'href',
        'https://developers.google.com/search/docs/appearance/structured-data/service',
      )
    })

    it('shows the full property list (set + unset)', () => {
      renderBrowser()

      const panel = document.querySelector<HTMLElement>('.graph-property-panel')!
      const panelEl = panel as HTMLElement
      // Service has: name (set), description (set), provider (set, ref) from catalog
      expect(within(panelEl).getByText('name')).toBeInTheDocument()
      expect(within(panelEl).getByText('description')).toBeInTheDocument()
      expect(within(panelEl).getByText('provider')).toBeInTheDocument()
    })

    it('shows reverse references on the selected entity', async () => {
      renderBrowser()

      // Click the ProfessionalService entity to select it
      const businessHeader = screen.getAllByText('ProfessionalService')[0]!
      const selectButton = businessHeader.closest<HTMLElement>('.graph-entity-header-main')!
      await userEvent.click(selectButton)

      const panel = document.querySelector<HTMLElement>('.graph-property-panel')!
      const panelEl = panel as HTMLElement
      // ProfessionalService is referenced by WebSite.publisher and Service.provider
      expect(within(panelEl).getByText('.publisher')).toBeInTheDocument()
      expect(within(panelEl).getByText('.provider')).toBeInTheDocument()
    })

    it('shows a placeholder when no entity is selected and graph is empty', () => {
      const model = parseGraph({})
      render(
        <GraphBrowser
          model={model}
          catalogTypes={CATALOG_TYPES}
          catalogDetails={CATALOG_DETAILS}
          rawData={{}}
        />,
      )
      // Empty state renders its own message
      expect(screen.getByText(/no composed JSON-LD graph/i)).toBeInTheDocument()
    })
  })

  describe('ARIA semantics', () => {
    it('has role="tree" on the container', () => {
      renderBrowser()
      expect(screen.getByRole('tree')).toBeInTheDocument()
    })

    it('has role="treeitem" on entity cards', () => {
      renderBrowser()
      const treeItems = screen.getAllByRole('treeitem')
      // 5 entities in the graph
      expect(treeItems.length).toBe(5)
    })

    it('marks the default-selected entity with aria-selected', () => {
      renderBrowser()
      const treeItems = screen.getAllByRole('treeitem')
      const selected = treeItems.filter((el) => el.getAttribute('aria-selected') === 'true')
      expect(selected.length).toBe(1)
      // The default selection is the primary entity (Service)
      expect(selected[0]!.getAttribute('data-entity-id')).toBe(
        'https://example.com/services/strategy#service',
      )
    })
  })

  describe('keyboard navigation', () => {
    it('moves selection down with ArrowDown', async () => {
      renderBrowser()

      const tree = screen.getByRole('tree')
      // Focus the tree container so keyboard events are caught
      tree.focus()

      // Default selection is the primary entity (Service). In the flat list
      // order: ProfessionalService, WebSite, WebPage, Service, Person.
      // ArrowDown from Service → Person
      await userEvent.keyboard('{ArrowDown}')

      const treeItems = screen.getAllByRole('treeitem')
      const selected = treeItems.filter((el) => el.getAttribute('aria-selected') === 'true')
      expect(selected.length).toBe(1)
      expect(selected[0]!.getAttribute('data-entity-id')).toBe('https://example.com/#founder')
    })

    it('moves selection up with ArrowUp', async () => {
      renderBrowser()

      const tree = screen.getByRole('tree')
      tree.focus()

      // Default is Service (index 3 in flat list). ArrowUp → WebPage.
      await userEvent.keyboard('{ArrowUp}')

      const treeItems = screen.getAllByRole('treeitem')
      const selected = treeItems.filter((el) => el.getAttribute('aria-selected') === 'true')
      expect(selected.length).toBe(1)
      expect(selected[0]!.getAttribute('data-entity-id')).toBe(
        'https://example.com/services/strategy#webpage',
      )
    })

    it('does not move past the last entity on ArrowDown', async () => {
      renderBrowser()

      const tree = screen.getByRole('tree')
      tree.focus()

      // Move from Service → Person (last)
      await userEvent.keyboard('{ArrowDown}')
      // Try one more — should stay on Person
      await userEvent.keyboard('{ArrowDown}')

      const treeItems = screen.getAllByRole('treeitem')
      const selected = treeItems.filter((el) => el.getAttribute('aria-selected') === 'true')
      expect(selected[0]!.getAttribute('data-entity-id')).toBe('https://example.com/#founder')
    })
  })
})
