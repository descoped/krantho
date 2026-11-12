import { type ReactElement, useCallback, useId } from 'react'
import type { Destination, SetupTabId } from '../shell/destinations.js'
import { RouteTabs } from '../ui/tabs.js'
import { AiTab } from './ai-tab.js'
import { CheckpointsTab } from './checkpoints-tab.js'
import { CollectionsTab } from './collections-tab.js'
import { EnvironmentTab } from './environment-tab.js'
import { IntegrationsTab } from './integrations-tab.js'
import { LocalesTab } from './locales-tab.js'
import { PeopleTab } from './people-tab.js'
import './setup.css'

function TabContent({ tab }: { tab: SetupTabId }): ReactElement {
  switch (tab) {
    case 'collections':
      return <CollectionsTab />
    case 'locales':
      return <LocalesTab />
    case 'ai':
      return <AiTab />
    case 'integrations':
      return <IntegrationsTab />
    case 'checkpoints':
      return <CheckpointsTab />
    case 'people':
      return <PeopleTab />
    case 'environment':
      return <EnvironmentTab />
  }
}

export interface SetupPageProps {
  /** The open tab */
  tab: SetupTabId
  /** The tabs this site and viewer have; a hidden one is not registered at all */
  tabs: readonly Destination<SetupTabId>[]
}

/**
 * Setup: how the site is configured, a tab per area. Each tab says where its
 * values come from — the configuration (read-only here), the site's database
 * (changed here) or what the running server reports.
 */
export function SetupPage({ tab, tabs }: SetupPageProps): ReactElement {
  const ids = useId()
  const tabId = useCallback((id: string) => `${ids}-tab-${id}`, [ids])
  return (
    <div className="setup">
      <header className="setup-header">
        <h1 className="setup-title">Setup</h1>
        <p className="setup-lead">
          How the site is configured. Each tab says where its values come from: the configuration —{' '}
          <code>krantho.config.ts</code>, <code>krantho.collections.ts</code> and the environment,
          read-only here — the site's database, changed here, or what the running server reports.
        </p>
      </header>
      <RouteTabs label="Setup" tabs={tabs} current={tab} tabId={tabId} panelId={`${ids}-panel`} />
      <div id={`${ids}-panel`} role="tabpanel" aria-labelledby={tabId(tab)} className="setup-panel">
        <TabContent tab={tab} />
      </div>
    </div>
  )
}
