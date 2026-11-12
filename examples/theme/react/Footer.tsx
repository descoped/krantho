interface FooterProps {
  siteFm: Record<string, string>
}

export function Footer({ siteFm }: FooterProps) {
  return (
    <footer className="site-footer">
      <div className="layout-footer-inner">
        <div className="layout-footer-grid">
          <div>
            <h4>{siteFm['footer-title'] || ''}</h4>
            <p>{siteFm['footer-description'] || ''}</p>
          </div>
          <div>
            <h4>{siteFm['phone-title'] || ''}</h4>
            <p>{siteFm['phone-number'] || ''}</p>
            <p className="footer-caption">{siteFm['phone-subtitle'] || ''}</p>
            <div className="footer-spacer">
              <h4>{siteFm['email-title'] || ''}</h4>
            </div>
            <p>{siteFm['email-address'] || ''}</p>
          </div>
          <div>
            <h4>{siteFm['location-title'] || ''}</h4>
            <p>{siteFm['location-address'] || ''}</p>
            <div className="footer-spacer">
              <h4>{siteFm['hours-title'] || ''}</h4>
            </div>
            <p>{siteFm['hours-line1'] || ''}</p>
            <p>{siteFm['hours-line2'] || ''}</p>
          </div>
        </div>
        <div className="site-footer-divider">
          &copy; {siteFm['footer-copyright-text'] || ''}
        </div>
      </div>
    </footer>
  )
}
