// Shared graph fixtures for Studio test suites.

/**
 * Set of Schema.org types considered site-level (not document-level).
 * Used by classifyGraphLayout to partition nodes into siteContext vs remaining.
 */
export const SITE_LEVEL_TYPES = new Set([
  'Organization',
  'ProfessionalService',
  'LocalBusiness',
  'WebSite',
])

/**
 * A fully populated @graph representative of what composeFromConfig produces
 * for a professional services document.
 */
export const FULL_GRAPH = {
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
      offers: {
        '@type': 'Offer',
        price: '5000',
        priceCurrency: 'USD',
      },
    },
    {
      '@type': 'Person',
      '@id': 'https://example.com/#founder',
      name: 'Ada Lovelace',
    },
  ],
}
