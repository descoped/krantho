export type { PropertyDef, PropertyImportance, PropertySource } from './property-atoms.js'

import { googleProfile } from '../profiles/google.js'
import { ruleFor } from '../profiles/registry.js'
import type { PropertyDef, PropertyImportance, PropertySpec } from './property-atoms.js'
import {
  AREA_SERVED,
  ARTICLE_DESCRIPTION,
  ARTICLE_HEADLINE,
  AUTHOR_AUTO,
  BUSINESS_CORE,
  DATE_PUBLISHED,
  DOC_DESC_FROM_DESC,
  DOC_NAME_FROM_TITLE,
  IMAGE_AUTO,
  IMAGE_MANUAL,
  OPENING_HOURS,
  PRICE_RANGE,
  PROVIDER_SITE,
  RATING_PROPERTIES,
  SITE_ADDRESS,
  SITE_DESCRIPTION,
  SITE_EMAIL,
  SITE_NAME,
  SITE_PHONE,
  SITE_URL,
} from './property-atoms.js'

// ---------------------------------------------------------------------------
// TYPE_PROPERTIES — property definitions per Schema.org type
// ---------------------------------------------------------------------------

/**
 * Property definitions per Schema.org type: the properties Studio offers
 * for it, how each is edited and where its value comes from.
 */
const TYPE_PROPERTIES: Record<string, readonly PropertySpec[]> = {
  LocalBusiness: [...BUSINESS_CORE, OPENING_HOURS, IMAGE_MANUAL, PRICE_RANGE, AREA_SERVED],

  ProfessionalService: [
    SITE_NAME,
    SITE_DESCRIPTION,
    SITE_URL,
    SITE_PHONE,
    SITE_EMAIL,
    { ...SITE_ADDRESS, hint: undefined },
    { ...OPENING_HOURS, hint: undefined },
    AREA_SERVED,
  ],

  Organization: [
    SITE_NAME,
    SITE_DESCRIPTION,
    SITE_URL,
    {
      property: 'logo',
      label: 'Logo URL',
      fieldType: 'url',
      source: 'site',
    },
    { ...SITE_EMAIL, label: 'Contact Email' },
  ],

  Restaurant: [
    SITE_NAME,
    SITE_DESCRIPTION,
    SITE_URL,
    SITE_PHONE,
    { ...SITE_ADDRESS, hint: undefined },
    {
      property: 'servesCuisine',
      label: 'Cuisine Type',
      fieldType: 'text',
      source: 'manual',
    },
    { ...OPENING_HOURS, hint: undefined },
    { ...PRICE_RANGE, hint: undefined },
    {
      property: 'hasMenu',
      label: 'Menu URL',
      fieldType: 'url',
      source: 'manual',
    },
  ],

  // Business subtypes — inherit LocalBusiness properties
  MedicalBusiness: [...BUSINESS_CORE, OPENING_HOURS, IMAGE_MANUAL, AREA_SERVED],
  LegalService: [...BUSINESS_CORE, OPENING_HOURS, AREA_SERVED],
  FinancialService: [...BUSINESS_CORE, OPENING_HOURS, AREA_SERVED],
  RealEstateAgent: [...BUSINESS_CORE, OPENING_HOURS, AREA_SERVED],
  AutoDealer: [...BUSINESS_CORE, OPENING_HOURS, IMAGE_MANUAL, AREA_SERVED],
  HealthAndBeautyBusiness: [
    ...BUSINESS_CORE,
    OPENING_HOURS,
    IMAGE_MANUAL,
    PRICE_RANGE,
    AREA_SERVED,
  ],
  FoodEstablishment: [...BUSINESS_CORE, OPENING_HOURS, IMAGE_MANUAL, PRICE_RANGE, AREA_SERVED],
  EntertainmentBusiness: [...BUSINESS_CORE, OPENING_HOURS, IMAGE_MANUAL, PRICE_RANGE, AREA_SERVED],
  SportsActivityLocation: [...BUSINESS_CORE, OPENING_HOURS, IMAGE_MANUAL, AREA_SERVED],
  LodgingBusiness: [...BUSINESS_CORE, OPENING_HOURS, IMAGE_MANUAL, PRICE_RANGE, AREA_SERVED],

  Article: [
    ARTICLE_HEADLINE,
    ARTICLE_DESCRIPTION,
    DATE_PUBLISHED,
    {
      property: 'dateModified',
      label: 'Date Modified',
      fieldType: 'date',
      source: 'computed',
    },
    AUTHOR_AUTO,
    IMAGE_AUTO,
  ],

  BlogPosting: [ARTICLE_HEADLINE, ARTICLE_DESCRIPTION, DATE_PUBLISHED, AUTHOR_AUTO, IMAGE_AUTO],

  NewsArticle: [
    ARTICLE_HEADLINE,
    DATE_PUBLISHED,
    AUTHOR_AUTO,
    IMAGE_AUTO,
    {
      property: 'dateline',
      label: 'Dateline',
      fieldType: 'text',
      source: 'manual',
    },
  ],

  HowTo: [
    { ...DOC_NAME_FROM_TITLE, label: 'Title' },
    DOC_DESC_FROM_DESC,
    {
      property: 'totalTime',
      label: 'Total Time',
      fieldType: 'text',
      source: 'manual',
      hint: 'ISO 8601 duration, e.g., PT30M',
    },
    {
      property: 'estimatedCost',
      label: 'Estimated Cost',
      fieldType: 'text',
      source: 'manual',
    },
    {
      property: 'step',
      label: 'Steps',
      fieldType: 'array',
      source: 'computed',
      hint: 'Auto-extracted from ## headings in body',
    },
  ],

  Recipe: [
    { ...DOC_NAME_FROM_TITLE, label: 'Recipe Name' },
    DOC_DESC_FROM_DESC,
    IMAGE_AUTO,
    {
      property: 'prepTime',
      label: 'Prep Time',
      fieldType: 'text',
      source: 'manual',
      hint: 'ISO 8601, e.g., PT15M',
    },
    {
      property: 'cookTime',
      label: 'Cook Time',
      fieldType: 'text',
      source: 'manual',
      hint: 'ISO 8601, e.g., PT45M',
    },
    {
      property: 'recipeYield',
      label: 'Yield',
      fieldType: 'text',
      source: 'manual',
      hint: 'e.g., 4 servings',
    },
    {
      property: 'recipeIngredient',
      label: 'Ingredients',
      fieldType: 'array',
      source: 'manual',
    },
    {
      property: 'recipeInstructions',
      label: 'Instructions',
      fieldType: 'array',
      source: 'computed',
      hint: 'Auto-extracted from body',
    },
  ],

  Course: [{ ...DOC_NAME_FROM_TITLE, label: 'Course Name' }, DOC_DESC_FROM_DESC, PROVIDER_SITE],

  Product: [
    { ...DOC_NAME_FROM_TITLE, label: 'Product Name' },
    DOC_DESC_FROM_DESC,
    IMAGE_AUTO,
    {
      property: 'brand',
      label: 'Brand',
      fieldType: 'text',
      source: 'site',
    },
    {
      property: 'sku',
      label: 'SKU',
      fieldType: 'text',
      source: 'manual',
    },
    {
      property: 'offers',
      label: 'Price',
      fieldType: 'text',
      source: 'manual',
      hint: 'Price with currency',
    },
  ],

  Service: [
    { ...DOC_NAME_FROM_TITLE, label: 'Service Name' },
    DOC_DESC_FROM_DESC,
    PROVIDER_SITE,
    AREA_SERVED,
    {
      property: 'offers',
      label: 'Pricing',
      fieldType: 'text',
      source: 'manual',
    },
  ],

  Offer: [
    {
      property: 'price',
      label: 'Price',
      fieldType: 'number',
      source: 'manual',
    },
    {
      property: 'priceCurrency',
      label: 'Currency',
      fieldType: 'text',
      source: 'site',
      hint: 'ISO 4217, e.g., USD, EUR',
    },
    {
      property: 'availability',
      label: 'Availability',
      fieldType: 'select',
      source: 'manual',
    },
    {
      property: 'url',
      label: 'URL',
      fieldType: 'url',
      source: 'computed',
    },
  ],

  Person: [
    { ...SITE_NAME, label: 'Full Name' },
    {
      property: 'jobTitle',
      label: 'Job Title',
      fieldType: 'text',
      source: 'site',
    },
    {
      property: 'url',
      label: 'Profile URL',
      fieldType: 'url',
      source: 'site',
    },
    { ...IMAGE_MANUAL, label: 'Photo' },
    {
      property: 'alumniOf',
      label: 'Education',
      fieldType: 'text',
      source: 'site',
    },
    {
      property: 'worksFor',
      label: 'Works For',
      fieldType: 'text',
      source: 'site',
    },
  ],

  Event: [
    { ...DOC_NAME_FROM_TITLE, label: 'Event Name' },
    DOC_DESC_FROM_DESC,
    {
      property: 'startDate',
      label: 'Start Date',
      fieldType: 'date',
      source: 'manual',
    },
    {
      property: 'endDate',
      label: 'End Date',
      fieldType: 'date',
      source: 'manual',
    },
    {
      property: 'location',
      label: 'Location',
      fieldType: 'text',
      source: 'manual',
    },
    {
      property: 'organizer',
      label: 'Organizer',
      fieldType: 'text',
      source: 'site',
    },
    {
      property: 'offers',
      label: 'Ticket Price',
      fieldType: 'text',
      source: 'manual',
    },
    {
      property: 'eventStatus',
      label: 'Status',
      fieldType: 'select',
      source: 'manual',
    },
    {
      property: 'eventAttendanceMode',
      label: 'Attendance Mode',
      fieldType: 'select',
      source: 'manual',
    },
  ],

  JobPosting: [
    {
      property: 'title',
      label: 'Job Title',
      fieldType: 'text',
      source: 'auto',
      autoMapField: 'title',
    },
    DOC_DESC_FROM_DESC,
    {
      property: 'datePosted',
      label: 'Date Posted',
      fieldType: 'date',
      source: 'auto',
      autoMapField: 'date',
    },
    {
      property: 'validThrough',
      label: 'Valid Through',
      fieldType: 'date',
      source: 'manual',
    },
    {
      property: 'hiringOrganization',
      label: 'Hiring Organization',
      fieldType: 'text',
      source: 'site',
    },
    {
      property: 'jobLocation',
      label: 'Location',
      fieldType: 'text',
      source: 'manual',
    },
    {
      property: 'employmentType',
      label: 'Employment Type',
      fieldType: 'select',
      source: 'manual',
    },
    {
      property: 'baseSalary',
      label: 'Salary',
      fieldType: 'text',
      source: 'manual',
    },
  ],

  WebSite: [
    { ...SITE_NAME, label: 'Site Name' },
    { property: 'url', label: 'URL', fieldType: 'url', source: 'site' },
    {
      property: 'inLanguage',
      label: 'Language',
      fieldType: 'text',
      source: 'site',
    },
  ],

  WebPage: [
    {
      property: 'name',
      label: 'Page Title',
      fieldType: 'text',
      source: 'auto',
      autoMapField: 'title',
    },
    { ...ARTICLE_DESCRIPTION, label: 'Description' },
    { property: 'url', label: 'URL', fieldType: 'url', source: 'computed' },
  ],

  BreadcrumbList: [
    {
      property: 'itemListElement',
      label: 'Breadcrumb Items',
      fieldType: 'array',
      source: 'computed',
      hint: 'Auto-generated from URL path',
    },
  ],

  FAQPage: [
    {
      property: 'mainEntity',
      label: 'Questions',
      fieldType: 'array',
      source: 'computed',
      hint: 'Q&A pairs from content or manual input',
    },
  ],

  Review: [
    {
      property: 'itemReviewed',
      label: 'Reviewed Item',
      fieldType: 'text',
      source: 'manual',
    },
    {
      property: 'reviewRating',
      label: 'Rating',
      fieldType: 'number',
      source: 'manual',
      hint: '1-5 stars',
    },
    {
      property: 'author',
      label: 'Reviewer',
      fieldType: 'text',
      source: 'manual',
    },
    {
      property: 'reviewBody',
      label: 'Review Text',
      fieldType: 'textarea',
      source: 'manual',
    },
  ],

  VideoObject: [
    DOC_NAME_FROM_TITLE,
    DOC_DESC_FROM_DESC,
    {
      property: 'contentUrl',
      label: 'Content URL',
      fieldType: 'url',
      source: 'manual',
    },
    {
      property: 'thumbnailUrl',
      label: 'Thumbnail URL',
      fieldType: 'url',
      source: 'manual',
    },
    {
      ...DATE_PUBLISHED,
      label: 'Upload Date',
      property: 'uploadDate',
    },
    {
      property: 'duration',
      label: 'Duration',
      fieldType: 'text',
      source: 'manual',
      hint: 'ISO 8601 duration, e.g., PT1H30M',
    },
    {
      property: 'embedUrl',
      label: 'Embed URL',
      fieldType: 'url',
      source: 'manual',
    },
  ],

  ImageObject: [
    DOC_NAME_FROM_TITLE,
    {
      property: 'contentUrl',
      label: 'Content URL',
      fieldType: 'url',
      source: 'manual',
    },
    {
      property: 'creditText',
      label: 'Credit Text',
      fieldType: 'text',
      source: 'manual',
    },
    {
      property: 'creator',
      label: 'Creator',
      fieldType: 'text',
      source: 'manual',
    },
    {
      property: 'copyrightNotice',
      label: 'Copyright Notice',
      fieldType: 'text',
      source: 'manual',
    },
  ],

  SoftwareApplication: [
    DOC_NAME_FROM_TITLE,
    DOC_DESC_FROM_DESC,
    {
      property: 'applicationCategory',
      label: 'Application Category',
      fieldType: 'text',
      source: 'manual',
    },
    {
      property: 'operatingSystem',
      label: 'Operating System',
      fieldType: 'text',
      source: 'manual',
    },
    {
      property: 'offers',
      label: 'Offers',
      fieldType: 'text',
      source: 'manual',
      hint: 'Price with currency',
    },
  ],

  ItemList: [
    DOC_NAME_FROM_TITLE,
    DOC_DESC_FROM_DESC,
    {
      property: 'numberOfItems',
      label: 'Number of Items',
      fieldType: 'number',
      source: 'manual',
    },
  ],

  ProfilePage: [
    DOC_NAME_FROM_TITLE,
    DOC_DESC_FROM_DESC,
    {
      property: 'mainEntity',
      label: 'Main Entity',
      fieldType: 'text',
      source: 'manual',
      hint: 'Person or Organization this profile represents',
    },
  ],

  QAPage: [DOC_NAME_FROM_TITLE, DOC_DESC_FROM_DESC],

  Dataset: [
    DOC_NAME_FROM_TITLE,
    DOC_DESC_FROM_DESC,
    {
      property: 'license',
      label: 'License',
      fieldType: 'url',
      source: 'manual',
    },
    {
      property: 'creator',
      label: 'Creator',
      fieldType: 'text',
      source: 'manual',
    },
  ],

  Movie: [
    DOC_NAME_FROM_TITLE,
    DOC_DESC_FROM_DESC,
    {
      property: 'director',
      label: 'Director',
      fieldType: 'text',
      source: 'manual',
    },
    {
      property: 'dateCreated',
      label: 'Date Created',
      fieldType: 'date',
      source: 'manual',
    },
    {
      property: 'duration',
      label: 'Duration',
      fieldType: 'text',
      source: 'manual',
      hint: 'ISO 8601 duration, e.g., PT2H',
    },
    {
      property: 'image',
      label: 'Image',
      fieldType: 'url',
      source: 'manual',
    },
  ],

  DiscussionForumPosting: [
    ARTICLE_HEADLINE,
    {
      property: 'articleBody',
      label: 'Article Body',
      fieldType: 'textarea',
      source: 'auto',
      autoMapField: 'description',
    },
    AUTHOR_AUTO,
    DATE_PUBLISHED,
  ],

  VacationRental: [
    DOC_NAME_FROM_TITLE,
    DOC_DESC_FROM_DESC,
    {
      property: 'address',
      label: 'Address',
      fieldType: 'text',
      source: 'manual',
      hint: 'Street, City, State, ZIP',
    },
    {
      property: 'image',
      label: 'Image',
      fieldType: 'url',
      source: 'manual',
    },
  ],

  EmployerAggregateRating: [...RATING_PROPERTIES],

  SpeakableSpecification: [
    {
      property: 'cssSelector',
      label: 'CSS Selector',
      fieldType: 'text',
      source: 'manual',
      hint: 'CSS selector for speakable content sections',
    },
  ],

  AggregateRating: [...RATING_PROPERTIES],
}

/** How much Google's rule for the type (or its nearest ancestor's) needs the property */
function importanceOf(type: string, property: string): PropertyImportance {
  const rule = ruleFor(googleProfile, type)
  if (!rule || rule.status === 'none' || rule.status === 'retired') return 'optional'
  if (rule.required?.includes(property)) return 'required'
  const recommended =
    rule.recommended?.includes(property) || rule.oneOf?.some((group) => group.includes(property))
  return recommended ? 'recommended' : 'optional'
}

/** Get properties for a Schema.org type, with the importance Google's rule gives each */
export function getTypeProperties(type: string): readonly PropertyDef[] {
  return (TYPE_PROPERTIES[type] ?? []).map((spec) => ({
    ...spec,
    importance: importanceOf(type, spec.property),
  }))
}

/** Get required properties for a type */
export function getRequiredProperties(type: string): readonly PropertyDef[] {
  return getTypeProperties(type).filter((p) => p.importance === 'required')
}

/** Get auto-mappable properties for a type */
export function getAutoMappableProperties(type: string): readonly PropertyDef[] {
  return getTypeProperties(type).filter((p) => p.source === 'auto' && p.autoMapField)
}
