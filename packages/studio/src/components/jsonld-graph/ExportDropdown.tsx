import { Download } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  downloadFile,
  exportAsJsonLd,
  exportAsScriptTag,
  generateFilename,
} from '../../lib/export-helpers.js'

interface ExportDropdownProps {
  data: unknown
  collection?: string | undefined
  slug?: string | undefined
}

/** Export dropdown: download .jsonld or copy script tag. */
export function ExportDropdown({
  data,
  collection,
  slug,
}: ExportDropdownProps): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState<'success' | 'error' | false>(false)
  const ref = useRef<HTMLDivElement>(null)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clean up copy timer on unmount
  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current)
    }
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleDownload = (): void => {
    const content = exportAsJsonLd(data)
    const filename = generateFilename(collection, slug)
    downloadFile(content, filename, 'application/ld+json')
    setOpen(false)
  }

  const handleCopyScriptTag = (): void => {
    const content = exportAsScriptTag(data)
    void navigator.clipboard
      .writeText(content)
      .then(() => {
        setCopied('success')
        if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current)
        copyTimerRef.current = setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => {
        setCopied('error')
        if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current)
        copyTimerRef.current = setTimeout(() => setCopied(false), 2000)
      })
    setOpen(false)
  }

  return (
    <div className="graph-export-dropdown" ref={ref}>
      <button
        type="button"
        className="graph-export-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Download size={14} /> Export
      </button>

      {open && (
        <div className="graph-export-menu" role="menu">
          <button
            type="button"
            className="graph-export-menu-item"
            role="menuitem"
            onClick={handleDownload}
          >
            Download .jsonld
          </button>
          <button
            type="button"
            className="graph-export-menu-item"
            role="menuitem"
            onClick={handleCopyScriptTag}
          >
            {copied === 'success'
              ? 'Copied!'
              : copied === 'error'
                ? 'Copy failed'
                : 'Copy as <script> tag'}
          </button>
        </div>
      )}
    </div>
  )
}
