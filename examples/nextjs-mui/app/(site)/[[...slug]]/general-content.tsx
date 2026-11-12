import Box from '@mui/material/Box'
import { CMSTextServer, CMSMarkdownServer } from '@krantho/ui-react/server'

/** A page's title, its description as the lead, and its body */
export default function GeneralContent({ slug }: { slug: string }): React.ReactElement {
  return (
    <Box>
      <Box component="section" className="section-white">
        <Box className="section-container">
          <CMSTextServer collection="pages" slug={slug} field="title" variant="h1" component="h1" className="page-title" />
          <CMSTextServer collection="pages" slug={slug} field="description" variant="body1" component="p" className="page-subtitle" />
        </Box>
      </Box>

      <Box component="section" className="section-muted">
        <Box className="section-container">
          <CMSMarkdownServer collection="pages" slug={slug} className="prose max-w-none" />
        </Box>
      </Box>
    </Box>
  )
}
