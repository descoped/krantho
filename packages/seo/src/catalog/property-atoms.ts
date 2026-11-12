/** How a property value is obtained */
export type PropertySource = 'auto' | 'manual' | 'computed' | 'site'

/** How much Google's rule for the type needs the property */
export type PropertyImportance = 'required' | 'recommended' | 'optional'

/** A Schema.org property of a catalog type, as written: how it is edited and where its value comes from */
export interface PropertySpec {
  /** Schema.org property name (e.g., 'name', 'description', 'telephone') */
  property: string
  /** Human-readable label */
  label: string
  /** Field type for the Studio form */
  fieldType: 'text' | 'textarea' | 'url' | 'email' | 'tel' | 'date' | 'number' | 'select' | 'array'
  /** How the value is typically obtained */
  source: PropertySource
  /** CMS field name this auto-maps from (if source is 'auto') */
  autoMapField?: string | undefined
  /** Description shown in the Studio form */
  hint?: string | undefined
}

/** A catalog property with its importance, taken from Google's rule for the type */
export interface PropertyDef extends PropertySpec {
  importance: PropertyImportance
}

// ---------------------------------------------------------------------------
// Shared property atoms — single properties reused across multiple types
// ---------------------------------------------------------------------------

export const SITE_NAME: PropertySpec = {
  property: 'name',
  label: 'Name',
  fieldType: 'text',
  source: 'site',
}

export const SITE_DESCRIPTION: PropertySpec = {
  property: 'description',
  label: 'Description',
  fieldType: 'textarea',
  source: 'site',
}

export const SITE_URL: PropertySpec = {
  property: 'url',
  label: 'Website URL',
  fieldType: 'url',
  source: 'site',
}

export const SITE_PHONE: PropertySpec = {
  property: 'telephone',
  label: 'Phone',
  fieldType: 'tel',
  source: 'site',
}

export const SITE_EMAIL: PropertySpec = {
  property: 'email',
  label: 'Email',
  fieldType: 'email',
  source: 'site',
}

export const SITE_ADDRESS: PropertySpec = {
  property: 'address',
  label: 'Address',
  fieldType: 'text',
  source: 'site',
  hint: 'Street, City, State, ZIP',
}

export const OPENING_HOURS: PropertySpec = {
  property: 'openingHours',
  label: 'Opening Hours',
  fieldType: 'text',
  source: 'site',
  hint: 'e.g., Mo-Fr 09:00-17:00',
}

export const AREA_SERVED: PropertySpec = {
  property: 'areaServed',
  label: 'Area Served',
  fieldType: 'text',
  source: 'site',
}

export const IMAGE_MANUAL: PropertySpec = {
  property: 'image',
  label: 'Image',
  fieldType: 'url',
  source: 'manual',
}

export const IMAGE_AUTO: PropertySpec = {
  property: 'image',
  label: 'Image',
  fieldType: 'url',
  source: 'auto',
  autoMapField: 'image',
}

export const PRICE_RANGE: PropertySpec = {
  property: 'priceRange',
  label: 'Price Range',
  fieldType: 'text',
  source: 'manual',
  hint: 'e.g., $$ or $50-$200',
}

// ---------------------------------------------------------------------------
// Shared property groups — common combinations used by multiple types
// ---------------------------------------------------------------------------

/** Core properties for business/organization site-level types */
export const BUSINESS_CORE: readonly PropertySpec[] = [
  SITE_NAME,
  SITE_DESCRIPTION,
  SITE_URL,
  SITE_PHONE,
  SITE_EMAIL,
  SITE_ADDRESS,
]

/** Document name auto-mapped from title field */
export const DOC_NAME_FROM_TITLE: PropertySpec = {
  property: 'name',
  label: 'Name',
  fieldType: 'text',
  source: 'auto',
  autoMapField: 'title',
}

/** Document description auto-mapped from description field */
export const DOC_DESC_FROM_DESC: PropertySpec = {
  property: 'description',
  label: 'Description',
  fieldType: 'textarea',
  source: 'auto',
  autoMapField: 'description',
}

/** Article headline auto-mapped from title */
export const ARTICLE_HEADLINE: PropertySpec = {
  property: 'headline',
  label: 'Headline',
  fieldType: 'text',
  source: 'auto',
  autoMapField: 'title',
}

/** Article description auto-mapped from meta-description */
export const ARTICLE_DESCRIPTION: PropertySpec = {
  property: 'description',
  label: 'Description',
  fieldType: 'textarea',
  source: 'auto',
  autoMapField: 'meta-description',
}

/** Date published auto-mapped from date field */
export const DATE_PUBLISHED: PropertySpec = {
  property: 'datePublished',
  label: 'Date Published',
  fieldType: 'date',
  source: 'auto',
  autoMapField: 'date',
}

/** Author auto-mapped from author field */
export const AUTHOR_AUTO: PropertySpec = {
  property: 'author',
  label: 'Author',
  fieldType: 'text',
  source: 'auto',
  autoMapField: 'author',
}

/** Provider from site config */
export const PROVIDER_SITE: PropertySpec = {
  property: 'provider',
  label: 'Provider',
  fieldType: 'text',
  source: 'site',
}

/** Shared rating properties for AggregateRating and EmployerAggregateRating */
export const RATING_PROPERTIES: readonly PropertySpec[] = [
  {
    property: 'ratingValue',
    label: 'Average Rating',
    fieldType: 'number',
    source: 'manual',
  },
  {
    property: 'reviewCount',
    label: 'Review Count',
    fieldType: 'number',
    source: 'manual',
  },
  {
    property: 'bestRating',
    label: 'Best Rating',
    fieldType: 'number',
    source: 'manual',
    hint: 'Default: 5',
  },
  {
    property: 'worstRating',
    label: 'Worst Rating',
    fieldType: 'number',
    source: 'manual',
    hint: 'Default: 1',
  },
]
