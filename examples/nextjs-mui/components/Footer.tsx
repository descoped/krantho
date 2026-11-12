import Box from '@mui/material/Box'
import { CMSTextServer } from '@krantho/ui-react/server'

export default function Footer(): React.ReactElement {
  return (
    <Box component="footer" className="site-footer">
      <Box sx={{ maxWidth: 1120, mx: 'auto', px: 3, py: 6 }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
            gap: 4,
          }}
        >
          <Box>
            <CMSTextServer collection="globals" slug="footer" field="footer-title" variant="h4" component="h4" />
            <CMSTextServer collection="globals" slug="footer" field="footer-description" variant="body2" component="p" />
          </Box>
          <Box>
            <CMSTextServer collection="globals" slug="contact-info" field="phone-title" variant="h4" component="h4" />
            <CMSTextServer collection="globals" slug="contact-info" field="phone-number" variant="body2" component="p" />
            <CMSTextServer collection="globals" slug="contact-info" field="phone-subtitle" variant="caption" component="p" className="footer-caption" />
            <Box className="footer-spacer">
              <CMSTextServer collection="globals" slug="contact-info" field="email-title" variant="h4" component="h4" />
            </Box>
            <CMSTextServer collection="globals" slug="contact-info" field="email-address" variant="body2" component="p" />
          </Box>
          <Box>
            <CMSTextServer collection="globals" slug="contact-info" field="location-title" variant="h4" component="h4" />
            <CMSTextServer collection="globals" slug="contact-info" field="location-address" variant="body2" component="p" />
            <Box className="footer-spacer">
              <CMSTextServer collection="globals" slug="contact-info" field="hours-title" variant="h4" component="h4" />
            </Box>
            <CMSTextServer collection="globals" slug="contact-info" field="hours-line1" variant="body2" component="p" />
            <CMSTextServer collection="globals" slug="contact-info" field="hours-line2" variant="body2" component="p" />
          </Box>
        </Box>
        <Box className="site-footer-divider">
          &copy; <CMSTextServer collection="globals" slug="footer" field="footer-copyright-text" variant="caption" component="span" />
        </Box>
      </Box>
    </Box>
  )
}
