import { writeFileSync } from 'fs'
import { join } from 'path'
import { readCMSContent, readYAML } from '../shared/cms-reader'
import type { SiteConfig } from '../shared/site-config'
import { loadSiteConfig } from '../shared/site-config'
import { toolPaths } from '../shared/tool-paths'
import type { BusinessMetadata, OpeningHoursSpec, ServiceOffer, StructuredData } from './types'

/**
 * Parse opening hours from CMS format "Monday 09:00 - 17:00" to Schema.org spec.
 * Day names are resolved via `dayNameMapping` in site-config.json, supporting any locale.
 */
export function parseOpeningHours(line: string): OpeningHoursSpec | null {
  const match = line.match(/^(\w+)\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/)
  if (!match) return null

  const day = match[1]
  const opens = match[2]
  const closes = match[3]
  if (!day || !opens || !closes) return null

  const dayMapping = loadSiteConfig().dayNameMapping
  const englishDay = dayMapping[day]
  if (!englishDay) return null

  return {
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: englishDay,
    opens,
    closes,
  }
}

/**
 * Parse address from CMS format "94105 San Francisco" into postalCode and addressLocality.
 * Supports postal codes of any length (US 5-digit, Norwegian 4-digit, UK alphanumeric, etc.).
 */
export function parseAddress(locationAddress: string): {
  postalCode: string
  addressLocality: string
} {
  const match = locationAddress.match(/^(\d+)\s+(.+)$/)
  if (!match) {
    return { postalCode: '', addressLocality: locationAddress }
  }
  return { postalCode: match[1] ?? '', addressLocality: match[2] ?? '' }
}

/** Extract starting price for a service from fees.md frontmatter */
function getStartingPrice(
  config: SiteConfig,
  feesFM: Record<string, unknown>,
  serviceId: string,
): { price: string; duration: string } | null {
  const feeNum = config.serviceFeeMapping[serviceId]
  if (!feeNum) return null

  const priceStr = String(feesFM[`service-${feeNum}-price-1`] ?? '')
  const durationStr = String(feesFM[`service-${feeNum}-duration-1`] ?? '')

  if (!priceStr) return null

  // Parse "1700" or "$1,700" → "1700"
  const numericPrice = priceStr.replace(/[^\d]/g, '')
  if (!numericPrice) return null

  return { price: numericPrice, duration: durationStr }
}

/**
 * Build service offers from business.yaml services array with pricing from fees.md.
 * Falls back to services page frontmatter if services array is missing.
 */
function buildServiceOffers(
  config: SiteConfig,
  business: BusinessMetadata,
  servicesFM: Record<string, unknown>,
  feesFM: Record<string, unknown>,
): ServiceOffer[] {
  const services = business.services

  const buildOffer = (id: string, name: string, description: string): ServiceOffer => {
    const pricing = getStartingPrice(config, feesFM, id)
    const offer: ServiceOffer = {
      '@type': 'Offer',
      itemOffered: {
        '@type': 'Service',
        name,
        description,
      },
    }

    if (pricing) {
      offer.priceSpecification = {
        '@type': 'PriceSpecification',
        price: pricing.price,
        priceCurrency: config.priceCurrency,
        unitText: pricing.duration,
      }
    }

    return offer
  }

  if (services && services.length > 0) {
    return services.map((s) => buildOffer(s.id, s.name, s.description))
  }

  // Fallback: derive from services page frontmatter
  return config.serviceIds.map((id) =>
    buildOffer(
      id,
      String(servicesFM[`${id}-title`] ?? ''),
      String(servicesFM[`${id}-ingress`] ?? ''),
    ),
  )
}

export function mapBusiness(): StructuredData {
  const config = loadSiteConfig()
  const business = readYAML<BusinessMetadata>('business.yaml')
  const { frontmatter: contactFM } = readCMSContent('contact')
  const { frontmatter: servicesFM } = readCMSContent(config.servicesSlug)
  const { frontmatter: feesFM } = readCMSContent('fees')

  const { postalCode, addressLocality } = parseAddress(String(contactFM['location-address'] ?? ''))

  const openingHours: OpeningHoursSpec[] = []
  const line1 = parseOpeningHours(String(contactFM['hours-line1'] ?? ''))
  if (line1) openingHours.push(line1)
  const line2 = parseOpeningHours(String(contactFM['hours-line2'] ?? ''))
  if (line2) openingHours.push(line2)

  return {
    localBusiness: {
      '@context': 'https://schema.org',
      '@type': 'ProfessionalService',
      '@id': business.url,
      name: String(contactFM['footer-title'] ?? ''),
      description: business.prose.summary.trim(),
      url: business.url,
      telephone: String(contactFM['phone-number'] ?? ''),
      email: String(contactFM['email-address'] ?? ''),
      address: {
        '@type': 'PostalAddress',
        streetAddress: String(contactFM['location-title'] ?? ''),
        addressLocality,
        postalCode,
        addressCountry: config.addressCountry,
      },
      geo: {
        '@type': 'GeoCoordinates',
        latitude: business.geo.latitude,
        longitude: business.geo.longitude,
      },
      image: business.image,
      openingHoursSpecification: openingHours,
      areaServed: {
        '@type': 'City',
        name: business['area-served'],
      },
      hasOfferCatalog: {
        '@type': 'OfferCatalog',
        name: config.siteName,
        itemListElement: buildServiceOffers(
          config,
          business,
          servicesFM as Record<string, unknown>,
          feesFM as Record<string, unknown>,
        ),
      },
    },
    person: {
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: business['legal-name'],
      jobTitle: business['job-title'],
      worksFor: {
        '@type': 'ProfessionalService',
        name: String(contactFM['footer-title'] ?? ''),
      },
      description: business['person-description'],
      image: business.image,
      url: `${business.url}/about`,
      address: {
        '@type': 'PostalAddress',
        addressLocality,
        addressCountry: config.addressCountry,
      },
      alumniOf: {
        '@type': 'EducationalOrganization',
        name: business['alumni-of'],
      },
      knowsAbout: business['knows-about'],
    },
  }
}

export function generateBusinessData(dryRun: boolean = false): void {
  const data = mapBusiness()
  const json = JSON.stringify(data, null, 2) + '\n'

  if (dryRun) {
    console.log('[dry-run] structured-data.json:')
    console.log(json)
    return
  }

  const outputPath = join(toolPaths().generatedDir, 'structured-data.json')
  writeFileSync(outputPath, json, 'utf-8')
  console.log(`wrote ${outputPath}`)
}
