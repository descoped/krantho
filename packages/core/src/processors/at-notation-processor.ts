export interface AtNotationConfig {
  imagePath?: string | undefined
  assetPath?: string | undefined
  linkPath?: string | undefined
}

// Single-pass processor (Gemini suggestion for efficiency)
export function processAtNotation(content: string, config?: AtNotationConfig): string {
  const { imagePath = '/images', assetPath = '/assets', linkPath = '/' } = config ?? {}
  const atNotationRegex = /@([\w-]+(?:\.(jpg|jpeg|png|gif|webp|pdf|doc|docx))?)/gi

  return content.replace(atNotationRegex, (_match, target, extension) => {
    if (extension) {
      // Has file extension
      if (isImageExtension(extension)) {
        // Images: @profile-photo.jpg → ![Profile Photo](/images/profile-photo.jpg)
        const name = target.replace(/\.[^.]+$/, '').replace(/-/g, ' ')
        const alt = name
          .split(' ')
          .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ')
        return `![${alt}](${imagePath}/${target})`
      } else {
        // Assets: @document.pdf → [document.pdf](/assets/document.pdf)
        return `[${target}](${assetPath}/${target})`
      }
    } else {
      // Page links: @services → [services](/services)
      return `[${target}](${linkPath}${target})`
    }
  })
}

function isImageExtension(extension: string): boolean {
  return /^(jpg|jpeg|png|gif|webp)$/i.test(extension)
}
