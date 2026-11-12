import { useEffect, useState } from 'react'

export interface SpaContentData {
  fields: Record<string, string>
  html: string
  sections: Record<string, string>
  loading: boolean
}

const cache = new Map<string, SpaContentData>()

export function useContent(slug: string): SpaContentData {
  const [data, setData] = useState<SpaContentData>(() => {
    const cached = cache.get(slug)
    if (cached) return cached
    return { fields: {}, html: '', sections: {}, loading: true }
  })

  useEffect(() => {
    if (cache.has(slug)) return

    fetch(`/content/json/${slug}.json`)
      .then((res) => res.json())
      .then((json) => {
        const result: SpaContentData = {
          fields: json.fields ?? {},
          html: json.html ?? '',
          sections: json.sections ?? {},
          loading: false,
        }
        cache.set(slug, result)
        setData(result)
      })
      .catch(() => {
        setData({ fields: {}, html: '', sections: {}, loading: false })
      })
  }, [slug])

  return data
}
