/** A Schema.org entity with standard properties and an open index signature */
export interface SchemaEntity {
  '@type': string
  '@id'?: string | undefined
  name?: string | undefined
  description?: string | undefined
  url?: string | undefined
  [key: string]: unknown
}

/** Site identity and address for SEO graph generation — the `site` section of the configuration */
export interface SeoGraphConfig {
  /** Domain name, e.g., 'acme-consulting.example.com' */
  domain: string
  /** Site name, e.g., 'Acme Consulting' */
  name: string
  /** Primary language, e.g., 'en' */
  language: string
  /** Full base URL, e.g., 'https://acme-consulting.example.com' */
  baseUrl: string
  /** The site's logo, an absolute URL */
  logo?: string | undefined
  /** What the site or its organization is, in a sentence */
  description?: string | undefined
  /** Another name the site or organization is known by */
  alternateName?: string | undefined
  /** Profile pages that identify the organization (social, registry, code hosting) */
  sameAs?: readonly string[] | undefined
}

/** The composed JSON-LD graph output */
export interface JsonLdGraph {
  '@context': 'https://schema.org'
  '@graph': SchemaEntity[]
}
