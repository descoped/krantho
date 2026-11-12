import { CMSTextServer } from '@krantho/ui-react/server'

export default function Footer(): React.ReactElement {
  return (
    <footer className="site-footer">
      <div className="mx-auto max-w-[1120px] px-6 py-12">
        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <CMSTextServer collection="globals" slug="footer" field="footer-title" variant="h4" />
            <CMSTextServer collection="globals" slug="footer" field="footer-description" variant="body2" component="p" />
          </div>
          <div>
            <CMSTextServer collection="globals" slug="contact-info" field="phone-title" variant="h4" />
            <CMSTextServer collection="globals" slug="contact-info" field="phone-number" variant="body2" component="p" />
            <CMSTextServer collection="globals" slug="contact-info" field="phone-subtitle" variant="caption" component="p" className="footer-caption" />
            <div className="footer-spacer">
              <CMSTextServer collection="globals" slug="contact-info" field="email-title" variant="h4" />
            </div>
            <CMSTextServer collection="globals" slug="contact-info" field="email-address" variant="body2" component="p" />
          </div>
          <div>
            <CMSTextServer collection="globals" slug="contact-info" field="location-title" variant="h4" />
            <CMSTextServer collection="globals" slug="contact-info" field="location-address" variant="body2" component="p" />
            <div className="footer-spacer">
              <CMSTextServer collection="globals" slug="contact-info" field="hours-title" variant="h4" />
            </div>
            <CMSTextServer collection="globals" slug="contact-info" field="hours-line1" variant="body2" component="p" />
            <CMSTextServer collection="globals" slug="contact-info" field="hours-line2" variant="body2" component="p" />
          </div>
        </div>
        <div className="site-footer-divider">
          &copy; <CMSTextServer collection="globals" slug="footer" field="footer-copyright-text" variant="caption" component="span" />
        </div>
      </div>
    </footer>
  )
}
