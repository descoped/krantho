import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactElement } from 'react'
import { Button } from '../ui/button.js'
import './media-pages.css'

/** Previous and Next, with where the page is */
export function MediaPages({
  page,
  count,
  onPage,
}: {
  page: number
  count: number
  onPage: (page: number) => void
}): ReactElement | null {
  if (count <= 1) return null
  return (
    <nav className="media-pages" aria-label="Pages">
      <Button
        size="sm"
        variant="ghost"
        icon={ChevronLeft}
        disabled={page === 0}
        onClick={() => onPage(page - 1)}
      >
        Previous
      </Button>
      <span className="media-pages-where">
        Page {page + 1} of {count}
      </span>
      <Button
        size="sm"
        variant="ghost"
        icon={ChevronRight}
        disabled={page >= count - 1}
        onClick={() => onPage(page + 1)}
      >
        Next
      </Button>
    </nav>
  )
}
