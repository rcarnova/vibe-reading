const COLORS = [
  { bg: '#1A1A1A', text: '#FAFAF8' },
  { bg: '#2C3E50', text: '#ECF0F1' },
  { bg: '#8B3A3A', text: '#FAFAF8' },
  { bg: '#2E4057', text: '#FAFAF8' },
  { bg: '#3D3D3D', text: '#F5F4EF' },
  { bg: '#4A3728', text: '#FAFAF8' },
  { bg: '#1B3A4B', text: '#FAFAF8' },
  { bg: '#2D4A22', text: '#FAFAF8' },
]

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function splitTitle(title) {
  const MAX = 20
  if (title.length <= MAX) return [title]

  // Find the space nearest to the midpoint
  const mid = Math.floor(title.length / 2)
  let best = -1
  let bestDist = Infinity
  for (let i = 0; i < title.length; i++) {
    if (title[i] === ' ') {
      const dist = Math.abs(i - mid)
      if (dist < bestDist) { bestDist = dist; best = i }
    }
  }

  if (best === -1) {
    return [title.substring(0, MAX), title.substring(MAX)]
  }

  const line1 = title.substring(0, best).trim()
  const line2 = title.substring(best + 1).trim()
  const short2 = line2.length > 22 ? line2.substring(0, 19) + '…' : line2
  return [line1, short2]
}

export function generateCoverPlaceholder(title, author) {
  const colorIndex = (title?.charCodeAt(0) ?? 0) % COLORS.length
  const { bg, text } = COLORS[colorIndex]

  const shortTitle = title?.length > 40 ? title.substring(0, 37) + '…' : (title ?? '')
  const shortAuthor = author?.length > 30 ? author.substring(0, 27) + '…' : (author ?? '')

  const lines = splitTitle(shortTitle).map(escapeXml)
  const escapedAuthor = escapeXml(shortAuthor.toUpperCase())

  const titleSvg = lines.length === 2
    ? `<text x="104" y="148" font-family="Georgia, serif" font-style="italic" font-size="16" fill="${text}" text-anchor="middle" dominant-baseline="middle">${lines[0]}</text>
       <text x="104" y="168" font-family="Georgia, serif" font-style="italic" font-size="16" fill="${text}" text-anchor="middle" dominant-baseline="middle">${lines[1]}</text>`
    : `<text x="104" y="155" font-family="Georgia, serif" font-style="italic" font-size="16" fill="${text}" text-anchor="middle" dominant-baseline="middle">${lines[0]}</text>`

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300" viewBox="0 0 200 300">
  <rect width="200" height="300" fill="${bg}"/>
  <rect x="0" y="0" width="8" height="300" fill="rgba(255,255,255,0.15)"/>
  <rect x="16" y="24" width="168" height="1" fill="rgba(255,255,255,0.3)"/>
  <rect x="16" y="275" width="168" height="1" fill="rgba(255,255,255,0.3)"/>
  ${titleSvg}
  <text x="104" y="255" font-family="Arial, sans-serif" font-size="11" letter-spacing="1" fill="rgba(255,255,255,0.6)" text-anchor="middle">${escapedAuthor}</text>
</svg>`

  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
