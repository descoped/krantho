// A section's prose and its code column: the fences and `{{sample:…}}` /
// `{{diagram:…}}` embeds at one place in it go beside the text on wide screens.

/** The prose and the code of a section whose code sits together, or undefined */
export function splitCode(markdown: string): { prose: string; code: string } | undefined {
  const lines = markdown.split('\n')
  let fenced = false
  const kinds = lines.map((line) => {
    const fence = /^(```|~~~)/.test(line.trim())
    const inCode = fenced || fence
    if (fence) fenced = !fenced
    if (inCode || /^\{\{(sample|diagram):[\w-]+\}\}$/.test(line.trim())) return 'code'
    return line.trim() ? 'text' : 'blank'
  })
  const first = kinds.indexOf('code')
  const last = kinds.lastIndexOf('code')
  if (first === -1 || kinds.slice(first, last).includes('text')) return undefined
  return {
    prose: [...lines.slice(0, first), ...lines.slice(last + 1)].join('\n').trim(),
    code: lines.slice(first, last + 1).join('\n'),
  }
}
