import { googleProfile } from '../profiles/google.js'
import { ruleFor } from '../profiles/registry.js'
import type { FeatureStatus } from '../profiles/types.js'
import type { Lifecycle } from '../vocabulary/index.js'
import { lifecycleOf } from '../vocabulary/index.js'

/** A curated Schema.org type, as written: what it is for and where it applies */
interface CatalogEntry {
  /** Schema.org @type value */
  type: string
  /** Human-readable label */
  label: string
  /** Short description of when to use this type */
  description: string
  /** Category for grouping in the type browser */
  category: CatalogCategory
  /** Whether this type applies at site level (global entity) */
  siteLevel: boolean
  /** Whether this type applies at document level */
  documentLevel: boolean
}

/** A curated Schema.org type with the Google feature it enables, taken from the Google profile */
export interface CatalogType extends CatalogEntry {
  /** The Google search feature the type makes a page eligible for, if any */
  richResult: string | null
  /** Whether Google shows that feature */
  richResultStatus: FeatureStatus
  /** Google's documentation for the type; empty when Google documents none */
  docsUrl: string
  /** Where the type stands in Schema.org; absent for a current, non-pending type */
  lifecycle?: Lifecycle | undefined
}

export type CatalogCategory =
  | 'business'
  | 'content'
  | 'commerce'
  | 'people'
  | 'navigation'
  | 'reviews'

export const CATEGORY_LABELS = {
  business: 'Business & Organization',
  content: 'Content & Media',
  commerce: 'Products & Services',
  people: 'People & Events',
  navigation: 'Navigation & Structure',
  reviews: 'Reviews & Ratings',
} satisfies Record<CatalogCategory, string>

/**
 * Curated catalog of Schema.org types relevant for SEO: types that make a page
 * eligible for a search feature, or that sites commonly describe themselves
 * and their pages with. Not the whole vocabulary — any current Schema.org
 * type can be configured.
 */
const CATALOG_ENTRIES: readonly CatalogEntry[] = [
  // ── Business & Organization ──
  {
    type: 'LocalBusiness',
    label: 'Local Business',
    description: 'A physical business or local service with an address.',
    category: 'business',
    siteLevel: true,
    documentLevel: false,
  },
  {
    type: 'ProfessionalService',
    label: 'Professional Service',
    description: 'Consulting, legal, accounting, or other professional services.',
    category: 'business',
    siteLevel: true,
    documentLevel: false,
  },
  {
    type: 'Organization',
    label: 'Organization',
    description: 'A company or organization without a physical storefront.',
    category: 'business',
    siteLevel: true,
    documentLevel: false,
  },
  {
    type: 'Restaurant',
    label: 'Restaurant',
    description: 'A food service establishment.',
    category: 'business',
    siteLevel: true,
    documentLevel: false,
  },
  {
    type: 'MedicalBusiness',
    label: 'Medical Business',
    description: 'Clinics, dentists, hospitals, and healthcare providers.',
    category: 'business',
    siteLevel: true,
    documentLevel: false,
  },
  {
    type: 'LegalService',
    label: 'Legal Service',
    description: 'Law firms and legal service providers.',
    category: 'business',
    siteLevel: true,
    documentLevel: false,
  },
  {
    type: 'FinancialService',
    label: 'Financial Service',
    description: 'Banks, insurance companies, and financial advisors.',
    category: 'business',
    siteLevel: true,
    documentLevel: false,
  },
  {
    type: 'RealEstateAgent',
    label: 'Real Estate Agent',
    description: 'Real estate agencies and property services.',
    category: 'business',
    siteLevel: true,
    documentLevel: false,
  },
  {
    type: 'AutoDealer',
    label: 'Auto Dealer',
    description: 'Car dealerships and vehicle sales.',
    category: 'business',
    siteLevel: true,
    documentLevel: false,
  },
  {
    type: 'HealthAndBeautyBusiness',
    label: 'Health & Beauty',
    description: 'Spas, salons, and beauty services.',
    category: 'business',
    siteLevel: true,
    documentLevel: false,
  },
  {
    type: 'FoodEstablishment',
    label: 'Food Establishment',
    description: 'Cafes, bars, bakeries, and food vendors.',
    category: 'business',
    siteLevel: true,
    documentLevel: false,
  },
  {
    type: 'EntertainmentBusiness',
    label: 'Entertainment',
    description: 'Cinemas, bowling alleys, and entertainment venues.',
    category: 'business',
    siteLevel: true,
    documentLevel: false,
  },
  {
    type: 'SportsActivityLocation',
    label: 'Sports & Fitness',
    description: 'Gyms, sports clubs, and fitness centers.',
    category: 'business',
    siteLevel: true,
    documentLevel: false,
  },
  {
    type: 'LodgingBusiness',
    label: 'Lodging',
    description: 'Hotels, hostels, and bed & breakfasts.',
    category: 'business',
    siteLevel: true,
    documentLevel: false,
  },

  // ── Content ──
  {
    type: 'Article',
    label: 'Article',
    description: 'A news, blog, or editorial article.',
    category: 'content',
    siteLevel: false,
    documentLevel: true,
  },
  {
    type: 'BlogPosting',
    label: 'Blog Post',
    description: 'A blog post or journal entry.',
    category: 'content',
    siteLevel: false,
    documentLevel: true,
  },
  {
    type: 'NewsArticle',
    label: 'News Article',
    description: 'A news story with timely reporting.',
    category: 'content',
    siteLevel: false,
    documentLevel: true,
  },
  {
    type: 'HowTo',
    label: 'How-To',
    description: 'Step-by-step instructions for a task.',
    category: 'content',
    siteLevel: false,
    documentLevel: true,
  },
  {
    type: 'Recipe',
    label: 'Recipe',
    description: 'A food recipe with ingredients and steps.',
    category: 'content',
    siteLevel: false,
    documentLevel: true,
  },
  {
    type: 'Course',
    label: 'Course',
    description: 'An educational course or training program.',
    category: 'content',
    siteLevel: false,
    documentLevel: true,
  },

  // ── Commerce & Services ──
  {
    type: 'Product',
    label: 'Product',
    description: 'A product available for purchase.',
    category: 'commerce',
    siteLevel: false,
    documentLevel: true,
  },
  {
    type: 'Service',
    label: 'Service',
    description: 'A service offered by a business.',
    category: 'commerce',
    siteLevel: false,
    documentLevel: true,
  },
  {
    type: 'Offer',
    label: 'Offer',
    description: 'A pricing offer for a product or service.',
    category: 'commerce',
    siteLevel: false,
    documentLevel: true,
  },

  // ── People & Events ──
  {
    type: 'Person',
    label: 'Person',
    description: 'An individual — author, founder, team member.',
    category: 'people',
    siteLevel: true,
    documentLevel: true,
  },
  {
    type: 'Event',
    label: 'Event',
    description: 'A scheduled event — conference, workshop, webinar.',
    category: 'people',
    siteLevel: false,
    documentLevel: true,
  },
  {
    type: 'JobPosting',
    label: 'Job Posting',
    description: 'A job listing or career opportunity.',
    category: 'people',
    siteLevel: false,
    documentLevel: true,
  },

  // ── Navigation & Structure ──
  {
    type: 'WebSite',
    label: 'Website',
    description: 'The website itself — gives search engines its name, on the home page.',
    category: 'navigation',
    siteLevel: true,
    documentLevel: false,
  },
  {
    type: 'WebPage',
    label: 'Web Page',
    description: 'A standard web page. Default type for all pages.',
    category: 'navigation',
    siteLevel: false,
    documentLevel: true,
  },
  {
    type: 'BreadcrumbList',
    label: 'Breadcrumb',
    description: 'Navigation trail showing page hierarchy.',
    category: 'navigation',
    siteLevel: false,
    documentLevel: true,
  },
  {
    type: 'FAQPage',
    label: 'FAQ Page',
    description: 'A page with question and answer pairs.',
    category: 'navigation',
    siteLevel: false,
    documentLevel: true,
  },

  // ── Content (continued) ──
  {
    type: 'VideoObject',
    label: 'Video',
    description: 'A video with playback and metadata.',
    category: 'content',
    siteLevel: false,
    documentLevel: true,
  },
  {
    type: 'ImageObject',
    label: 'Image',
    description: 'An image with credits and metadata.',
    category: 'content',
    siteLevel: false,
    documentLevel: true,
  },
  {
    type: 'Dataset',
    label: 'Dataset',
    description: 'A structured dataset, for dataset search engines.',
    category: 'content',
    siteLevel: false,
    documentLevel: true,
  },
  {
    type: 'Movie',
    label: 'Movie',
    description: 'A movie with cast, crew, and release info.',
    category: 'content',
    siteLevel: false,
    documentLevel: true,
  },
  {
    type: 'DiscussionForumPosting',
    label: 'Forum Post',
    description: 'A posting in a discussion forum or community.',
    category: 'content',
    siteLevel: false,
    documentLevel: true,
  },
  {
    type: 'SpeakableSpecification',
    label: 'Speakable',
    description: 'Content sections suitable for voice assistant playback.',
    category: 'content',
    siteLevel: false,
    documentLevel: true,
  },

  // ── Commerce & Services (continued) ──
  {
    type: 'SoftwareApplication',
    label: 'Software App',
    description: 'A software application or mobile app listing.',
    category: 'commerce',
    siteLevel: false,
    documentLevel: true,
  },
  {
    type: 'VacationRental',
    label: 'Vacation Rental',
    description: 'A vacation rental property listing.',
    category: 'commerce',
    siteLevel: false,
    documentLevel: true,
  },
  {
    type: 'EmployerAggregateRating',
    label: 'Employer Rating',
    description: 'Aggregate employee rating of an employer.',
    category: 'commerce',
    siteLevel: false,
    documentLevel: true,
  },

  // ── Navigation & Structure (continued) ──
  {
    type: 'ItemList',
    label: 'Item List',
    description: 'An ordered or unordered list of items for carousel display.',
    category: 'navigation',
    siteLevel: false,
    documentLevel: true,
  },
  {
    type: 'ProfilePage',
    label: 'Profile Page',
    description: 'A page representing a person or organization profile.',
    category: 'navigation',
    siteLevel: false,
    documentLevel: true,
  },
  {
    type: 'QAPage',
    label: 'Q&A Page',
    description: 'A page with a single question and community answers.',
    category: 'navigation',
    siteLevel: false,
    documentLevel: true,
  },

  // ── Reviews & Ratings ──
  {
    type: 'Review',
    label: 'Review',
    description: 'A single review of a product, service, or business.',
    category: 'reviews',
    siteLevel: false,
    documentLevel: true,
  },
  {
    type: 'AggregateRating',
    label: 'Aggregate Rating',
    description: 'Average rating from multiple reviews.',
    category: 'reviews',
    siteLevel: false,
    documentLevel: true,
  },
]

/** The Google feature of an entry, from the Google profile's rule for its type */
function withFeature(entry: CatalogEntry): CatalogType {
  const rule = ruleFor(googleProfile, entry.type)
  const lifecycle = lifecycleOf(entry.type)
  return {
    ...entry,
    richResult: rule?.feature ?? null,
    richResultStatus: rule?.status ?? 'none',
    docsUrl: rule?.source ?? '',
    ...(lifecycle ? { lifecycle } : {}),
  }
}

/**
 * The catalog. Each type's Google feature, status and documentation come from
 * the Google profile, so the catalog cannot disagree with the rules findings
 * are checked against.
 */
export const SCHEMA_CATALOG: readonly CatalogType[] = CATALOG_ENTRIES.map(withFeature)

// Pre-built indexes for O(1) lookups on the static catalog
const catalogByType = new Map<string, CatalogType>(SCHEMA_CATALOG.map((t) => [t.type, t]))

const catalogByCategory = new Map<CatalogCategory, readonly CatalogType[]>(
  (Object.keys(CATEGORY_LABELS) as CatalogCategory[]).map((cat) => [
    cat,
    SCHEMA_CATALOG.filter((t) => t.category === cat),
  ]),
)

const siteLevelTypes: readonly CatalogType[] = SCHEMA_CATALOG.filter((t) => t.siteLevel)
const documentLevelTypes: readonly CatalogType[] = SCHEMA_CATALOG.filter((t) => t.documentLevel)

/** Look up a catalog type by its Schema.org @type value */
export function getCatalogType(type: string): CatalogType | undefined {
  return catalogByType.get(type)
}

/** Get catalog types filtered by category */
export function getCatalogByCategory(category: CatalogCategory): readonly CatalogType[] {
  return catalogByCategory.get(category) ?? []
}

/** Get catalog types that can be used at site level */
export function getSiteLevelTypes(): readonly CatalogType[] {
  return siteLevelTypes
}

/** Get catalog types that can be used at document level */
export function getDocumentLevelTypes(): readonly CatalogType[] {
  return documentLevelTypes
}
