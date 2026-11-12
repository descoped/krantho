import Box from '@mui/material/Box'
import { CMSTextServer, CMSMarkdownServer } from '@krantho/ui-react/server'

export default function AboutContent(): React.ReactElement {
  return (
    <Box>
      <Box component="section" className="section-white">
        <Box className="section-container">
          <CMSTextServer collection="pages" slug="about" field="title" variant="h1" component="h1" className="page-title" />
          <CMSTextServer collection="pages" slug="about" field="description" variant="body1" component="p" className="page-subtitle" />
        </Box>
      </Box>

      <Box component="section" className="section-muted">
        <Box className="section-container">
          <CMSMarkdownServer collection="pages" slug="about" section="Our Team" className="prose max-w-none" />
        </Box>
      </Box>

      <Box component="section" className="section-white">
        <Box className="section-container">
          <CMSMarkdownServer collection="pages" slug="about" section="Our Approach" className="prose max-w-none" />
        </Box>
      </Box>
    </Box>
  )
}
