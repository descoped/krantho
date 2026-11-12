import {
  Activity,
  Boxes,
  Cpu,
  FolderTree,
  History,
  Image,
  Languages,
  type LucideIcon,
  Network,
  Server,
  SlidersHorizontal,
  Users,
  Webhook,
} from 'lucide-react'
import { type Role, roleAtLeast } from '../lib/auth.js'
import { isEnabled, type RuntimeCapabilities } from '../lib/capabilities.js'

/** Who is looking: their roles, and whether the site requires signing in */
export interface Viewer {
  roles: readonly Role[]
  loginRequired: boolean
}

/** Whether a destination or tab is shown — and so reachable — for this site and viewer */
export type Visibility = (caps: RuntimeCapabilities, viewer: Viewer) => boolean

export type DestinationId = 'pulse' | 'site' | 'structure' | 'media' | 'setup'

export type SetupTabId =
  | 'collections'
  | 'locales'
  | 'ai'
  | 'integrations'
  | 'checkpoints'
  | 'people'
  | 'environment'

export interface Destination<Id extends string = DestinationId> {
  id: Id
  /** The route path, relative to Studio's basename */
  path: string
  label: string
  icon: LucideIcon
  visible: Visibility
}

const always: Visibility = () => true

const capability =
  (feature: string): Visibility =>
  (caps) =>
    isEnabled(caps, feature)

/**
 * Setup's tabs, in order. Each keeps the gate its screen had before Studio
 * (behaviour freeze); only People changes, to follow the auth mode (#265).
 * Controls the API refuses a role are read-only for that role, not hidden.
 */
export const SETUP_TABS: readonly Destination<SetupTabId>[] = [
  {
    id: 'collections',
    path: '/setup/collections',
    label: 'Collections & schema',
    icon: Boxes,
    // Was the sidebar's schema links: runtime fields need an adapter that stores them, and
    // with sign-in only admins saw them
    visible: (caps, viewer) =>
      isEnabled(caps, 'runtimeSchema') &&
      (!viewer.loginRequired || roleAtLeast(viewer.roles, 'admin')),
  },
  {
    id: 'locales',
    path: '/setup/locales',
    label: 'Locales',
    icon: Languages,
    // Was Settings (every role) and Translations (with `localization`): locale settings are
    // read-only below admin, and the translation matrix shows when the site has several locales
    visible: always,
  },
  {
    id: 'ai',
    path: '/setup/ai',
    label: 'AI provider',
    icon: Cpu,
    // Was Settings, for every role: read-only below admin, as the API refuses the writes
    visible: always,
  },
  {
    id: 'integrations',
    path: '/setup/integrations',
    label: 'Integrations',
    icon: Webhook,
    visible: capability('webhookDeliveries'),
  },
  {
    id: 'checkpoints',
    path: '/setup/checkpoints',
    label: 'Checkpoints',
    icon: History,
    visible: capability('checkpoints'),
  },
  {
    id: 'people',
    path: '/setup/people',
    label: 'People',
    icon: Users,
    // Changed (#265): user accounts exist only when the site signs people in, for admins
    visible: (caps, viewer) =>
      (caps.authMode === 'token' || caps.authMode === 'oidc') && roleAtLeast(viewer.roles, 'admin'),
  },
  {
    id: 'environment',
    path: '/setup/environment',
    label: 'Environment',
    icon: Server,
    visible: always,
  },
]

/** The five destinations, in navigation order */
export const DESTINATIONS: readonly Destination[] = [
  { id: 'pulse', path: '/', label: 'Pulse', icon: Activity, visible: always },
  { id: 'site', path: '/site', label: 'Site', icon: FolderTree, visible: always },
  {
    id: 'structure',
    path: '/structure',
    label: 'Structure',
    icon: Network,
    visible: capability('seo'),
  },
  { id: 'media', path: '/media', label: 'Media', icon: Image, visible: capability('media') },
  {
    id: 'setup',
    path: '/setup',
    label: 'Setup',
    icon: SlidersHorizontal,
    visible: (caps, viewer) => SETUP_TABS.some((tab) => tab.visible(caps, viewer)),
  },
]

export type StructureTabId = 'graph' | 'scopes' | 'rich-results' | 'crawlers'

/** Structure's tabs, in order (§6); every one shows wherever Structure does */
export const STRUCTURE_TABS: readonly { id: StructureTabId; path: string; label: string }[] = [
  { id: 'graph', path: '/structure/graph', label: 'Graph' },
  { id: 'scopes', path: '/structure/scopes', label: 'Scopes & archetypes' },
  { id: 'rich-results', path: '/structure/rich-results', label: 'Rich results' },
  { id: 'crawlers', path: '/structure/crawlers', label: 'Crawlers & assistants' },
]

export function visibleDestinations(
  caps: RuntimeCapabilities,
  viewer: Viewer,
): readonly Destination[] {
  return DESTINATIONS.filter((destination) => destination.visible(caps, viewer))
}

export function visibleSetupTabs(
  caps: RuntimeCapabilities,
  viewer: Viewer,
): readonly Destination<SetupTabId>[] {
  return SETUP_TABS.filter((tab) => tab.visible(caps, viewer))
}

/** Whether a destination is shown for this site and viewer */
export function isDestinationVisible(
  id: DestinationId,
  caps: RuntimeCapabilities,
  viewer: Viewer,
): boolean {
  return DESTINATIONS.some(
    (destination) => destination.id === id && destination.visible(caps, viewer),
  )
}

/** The destination a route path belongs to, or null for an unknown path */
export function destinationOf(pathname: string): DestinationId | null {
  if (pathname === '/' || pathname === '') return 'pulse'
  const first = pathname.split('/')[1] ?? ''
  if (first === 'site' || first === 'layout' || first === 'new') return 'site'
  if (first === 'structure' || first === 'media' || first === 'setup') return first
  return null
}
