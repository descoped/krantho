import { collectionBasePath } from '@krantho/core/cache-tags'
import { ChevronRight, Lock, Plus } from 'lucide-react'
import { type KeyboardEvent, type ReactElement, type ReactNode, useId } from 'react'
import { Link, useLocation } from 'react-router'
import { focusableIn } from '../hooks/use-focus-trap.js'
import {
  type TreeDocument,
  type TreeGroup as TreeGroupData,
  useSiteTree,
} from '../hooks/use-site-tree.js'
import { useAuth } from '../lib/auth.js'
import { collectionLabel, singularLabel } from '../lib/format.js'
import { collectionPath, editorPath, LAYOUT_COLLECTION, newDocumentPath } from '../lib/paths.js'
import { StatusDot } from '../ui/status-dot.js'
import './site-tree.css'

export interface SiteTreeProps {
  /** Bumped when Studio changed content, so statuses refresh at once */
  revision: number
  closedGroups: readonly string[]
  onToggleGroup: (name: string) => void
}

/** Up and Down move between the tree's links and toggles */
function moveFocus(event: KeyboardEvent<HTMLElement>): void {
  const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
  if (step === 0) return
  const items = focusableIn(event.currentTarget)
  const index = items.indexOf(document.activeElement as HTMLElement)
  if (index === -1) return
  event.preventDefault()
  items[(index + step + items.length) % items.length]?.focus()
}

function TreeItem({ document: doc }: { document: TreeDocument }): ReactElement {
  const { pathname } = useLocation()
  const path = editorPath(doc.collection, doc.slug)
  const current = pathname === path || pathname.startsWith(`${path}/`)
  return (
    <li>
      <Link to={path} className="tree-item" aria-current={current ? 'page' : undefined}>
        <StatusDot status={doc.status} />
        <span className="tree-item-label">{doc.slug}</span>
        {doc.lockedBy && (
          <span className="tree-lock" role="img" aria-label={`Locked by ${doc.lockedBy}`}>
            <Lock aria-hidden="true" />
          </span>
        )}
      </Link>
    </li>
  )
}

interface TreeGroupProps {
  name: string
  label: string
  /** Where the collection's pages live on the site, when it has pages */
  urlPath?: string | null | undefined
  /** The collection view the label opens; the Layout group has none */
  path?: string | undefined
  open: boolean
  onToggle: () => void
  children: ReactNode
}

/** The group's label: a link to the collection view with the URL path, or plain text */
function GroupLabel({
  label,
  urlPath,
  path,
}: Pick<TreeGroupProps, 'label' | 'urlPath' | 'path'>): ReactElement {
  const { pathname } = useLocation()
  if (!path) return <span className="tree-group-label">{label}</span>
  return (
    <Link
      to={path}
      className="tree-group-label"
      aria-current={pathname === path ? 'page' : undefined}
    >
      {label}
      {urlPath && (
        <>
          {' '}
          <span className="tree-group-path">{urlPath}</span>
        </>
      )}
    </Link>
  )
}

function TreeGroup(props: TreeGroupProps): ReactElement {
  const { name, label, open, onToggle, children } = props
  const listId = useId()
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset groups form controls; this groups links
    <div className="tree-group" role="group" aria-label={label} data-group={name}>
      <div className="tree-group-head">
        <button
          type="button"
          className="tree-toggle"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={`${label} documents`}
          onClick={onToggle}
        >
          <ChevronRight aria-hidden="true" />
        </button>
        <GroupLabel label={label} urlPath={props.urlPath} path={props.path} />
      </div>
      <ul id={listId} className="tree-list" hidden={!open}>
        {children}
      </ul>
    </div>
  )
}

function Legend(): ReactElement {
  return (
    <ul className="tree-legend" aria-label="Status legend">
      <li>
        <StatusDot status="live" decorative />
        live
      </li>
      <li>
        <StatusDot status="ahead" decorative />
        draft ahead
      </li>
      <li>
        <StatusDot status="draft" decorative />
        draft
      </li>
    </ul>
  )
}

interface CollectionGroupProps {
  group: TreeGroupData
  canCreate: boolean
  open: boolean
  onToggle: () => void
}

/** A collection's documents, then its "New <singular>" entry for editors */
function CollectionGroup({ group, canCreate, open, onToggle }: CollectionGroupProps): ReactElement {
  const { collection, documents } = group
  return (
    <TreeGroup
      name={collection.name}
      label={collectionLabel(collection.name)}
      urlPath={collectionBasePath(collection)}
      path={collectionPath(collection.name)}
      open={open}
      onToggle={onToggle}
    >
      {documents.map((doc) => (
        <TreeItem key={doc.slug} document={doc} />
      ))}
      {canCreate && (
        <li>
          <Link to={newDocumentPath(collection.name)} className="tree-item tree-item--new">
            <Plus aria-hidden="true" />
            <span className="tree-item-label">New {singularLabel(collection.name)}</span>
          </Link>
        </li>
      )}
    </TreeGroup>
  )
}

/** The Site destination as a tree: a group per collection, then the Layout of globals */
export function SiteTree({ revision, closedGroups, onToggleGroup }: SiteTreeProps): ReactElement {
  const { user, hasRole } = useAuth()
  const tree = useSiteTree(user, revision)
  const canCreate = hasRole('editor')

  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset groups form controls; this groups links
    <div className="site-tree" role="group" aria-label="Site tree" onKeyDown={moveFocus}>
      {tree.groups.map((group) => (
        <CollectionGroup
          key={group.collection.name}
          group={group}
          canCreate={canCreate}
          open={!closedGroups.includes(group.collection.name)}
          onToggle={() => onToggleGroup(group.collection.name)}
        />
      ))}
      {tree.layout && (
        <TreeGroup
          name={LAYOUT_COLLECTION}
          label="Layout"
          open={!closedGroups.includes(LAYOUT_COLLECTION)}
          onToggle={() => onToggleGroup(LAYOUT_COLLECTION)}
        >
          {tree.layout.map((doc) => (
            <TreeItem key={doc.slug} document={doc} />
          ))}
        </TreeGroup>
      )}
      <Legend />
    </div>
  )
}
