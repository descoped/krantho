<script lang="ts">
  let { footer, contactInfo }: { footer: Record<string, string>; contactInfo: Record<string, string> } = $props()
</script>

<footer class="site-footer">
  <div class="max-w-[1120px] mx-auto px-6 py-12">
    <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
      <div>
        <h4>{footer['footer-title']}</h4>
        <p>{footer['footer-description']}</p>
      </div>
      <div>
        <h4>{contactInfo['phone-title']}</h4>
        <p>{contactInfo['phone-number']}</p>
        <p class="footer-caption">{contactInfo['phone-subtitle']}</p>
        <div class="footer-spacer">
          <h4>{contactInfo['email-title']}</h4>
        </div>
        <p>{contactInfo['email-address']}</p>
      </div>
      <div>
        <h4>{contactInfo['location-title']}</h4>
        <p>{contactInfo['location-address']}</p>
        <div class="footer-spacer">
          <h4>{contactInfo['hours-title']}</h4>
        </div>
        <p>{contactInfo['hours-line1']}</p>
        <p>{contactInfo['hours-line2']}</p>
      </div>
    </div>
    <div class="site-footer-divider">
      &copy; {footer['footer-copyright-text']}
    </div>
  </div>
</footer>
