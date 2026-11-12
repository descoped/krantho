// Route group from guardrails.yaml
export interface RouteGroup {
  target: string
  inherit: boolean
  questions: FAQQuestion[]
}

export interface FAQQuestion {
  question: string
  answer: string
}

// Business metadata from business.yaml
export interface BusinessMetadata {
  url: string
  geo: { latitude: number; longitude: number }
  'area-served': string
  'founding-year': number
  image: string
  'legal-name': string
  'job-title': string
  'alumni-of': string
  'person-description': string
  'knows-about': string[]
  prose: { summary: string; description: string }
  'llms-sections': LlmsSection[]
  'llms-optional': LlmsSection[]
  services?: ServiceCatalogEntry[]
  credentials?: string[]
}

export interface ServiceCatalogEntry {
  id: string
  name: string
  description: string
}

export interface LlmsSection {
  heading: string
  links: LlmsLink[]
}

export interface LlmsLink {
  title: string
  path: string
  description: string
}

// Schema.org structured data output
export interface StructuredData {
  localBusiness: LocalBusiness
  person: Person
}

export interface LocalBusiness {
  '@context': string
  '@type': string
  '@id': string
  name: string
  description: string
  url: string
  telephone: string
  email: string
  address: PostalAddress
  geo: GeoCoordinates
  image: string
  openingHoursSpecification: OpeningHoursSpec[]
  areaServed: AreaServed
  hasOfferCatalog: OfferCatalog
}

export interface Person {
  '@context': string
  '@type': string
  name: string
  jobTitle: string
  worksFor: { '@type': string; name: string }
  description: string
  image: string
  url: string
  address: { '@type': string; addressLocality: string; addressCountry: string }
  alumniOf: { '@type': string; name: string }
  knowsAbout: string[]
}

export interface PostalAddress {
  '@type': string
  streetAddress: string
  addressLocality: string
  postalCode: string
  addressCountry: string
}

export interface GeoCoordinates {
  '@type': string
  latitude: number
  longitude: number
}

export interface OpeningHoursSpec {
  '@type': string
  dayOfWeek: string
  opens: string
  closes: string
}

export interface AreaServed {
  '@type': string
  name: string
}

export interface OfferCatalog {
  '@type': string
  name: string
  itemListElement: ServiceOffer[]
}

export interface ServiceOffer {
  '@type': string
  itemOffered: {
    '@type': string
    name: string
    description: string
  }
  priceSpecification?: {
    '@type': string
    price: string
    priceCurrency: string
    unitText: string
  }
}

// FAQ output format (Schema.org Question/Answer)
export interface FAQEntry {
  '@type': 'Question'
  name: string
  acceptedAnswer: {
    '@type': 'Answer'
    text: string
  }
}
