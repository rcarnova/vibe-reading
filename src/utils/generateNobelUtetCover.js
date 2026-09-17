// Recreates the look of the physical UTET "Premio Nobel" collection:
// deep green spine, bordeaux label, gold lettering.

const GREEN = '#173B2E'
const BORDEAUX = '#701F2E'
const GOLD = '#C9A24B'
const GOLD_SOFT = 'rgba(201,162,75,0.55)'

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function surname(author) {
  const parts = (author ?? '').trim().split(/\s+/)
  return parts[parts.length - 1] || author || ''
}

function splitLabel(text, max) {
  if (text.length <= max) return [text]
  const mid = Math.floor(text.length / 2)
  let best = -1
  let bestDist = Infinity
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ' ') {
      const dist = Math.abs(i - mid)
      if (dist < bestDist) { bestDist = dist; best = i }
    }
  }
  if (best === -1) return [text.substring(0, max), text.substring(max)]
  return [text.substring(0, best), text.substring(best + 1)]
}

export function generateNobelUtetCover(author, year) {
  const label = escapeXml(surname(author).toUpperCase())
  const lines = splitLabel(label, 12)

  const labelSvg = lines.length === 2
    ? `<text x="100" y="118" font-family="Georgia, serif" font-weight="700" font-size="17" letter-spacing="1" fill="${GOLD}" text-anchor="middle" dominant-baseline="middle">${lines[0]}</text>
       <text x="100" y="140" font-family="Georgia, serif" font-weight="700" font-size="17" letter-spacing="1" fill="${GOLD}" text-anchor="middle" dominant-baseline="middle">${lines[1]}</text>`
    : `<text x="100" y="130" font-family="Georgia, serif" font-weight="700" font-size="18" letter-spacing="1" fill="${GOLD}" text-anchor="middle" dominant-baseline="middle">${lines[0]}</text>`

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300" viewBox="0 0 200 300">
  <rect width="200" height="300" fill="${GREEN}"/>
  <rect x="0" y="0" width="6" height="300" fill="rgba(255,255,255,0.06)"/>

  <!-- top gold rule -->
  <rect x="18" y="28" width="164" height="2" fill="${GOLD}"/>
  <rect x="18" y="34" width="164" height="1" fill="${GOLD_SOFT}"/>

  <!-- bordeaux label -->
  <rect x="24" y="70" width="152" height="76" fill="${BORDEAUX}" stroke="${GOLD}" stroke-width="1.5"/>
  <rect x="30" y="76" width="140" height="64" fill="none" stroke="${GOLD}" stroke-width="0.5" opacity="0.6"/>
  ${labelSvg}

  <!-- "Premio Nobel" + year -->
  <text x="100" y="178" font-family="Georgia, serif" font-style="italic" font-size="13" fill="${GOLD}" text-anchor="middle">Premio Nobel</text>
  <text x="82" y="178" font-family="Georgia, serif" font-size="10" fill="${GOLD_SOFT}" text-anchor="middle">✦</text>
  <text x="100" y="202" font-family="Georgia, serif" font-style="italic" font-weight="700" font-size="20" fill="${GOLD}" text-anchor="middle">${year}</text>

  <!-- bottom gold rule + imprint -->
  <rect x="18" y="258" width="164" height="1" fill="${GOLD_SOFT}"/>
  <rect x="18" y="264" width="164" height="2" fill="${GOLD}"/>
  <text x="100" y="284" font-family="Arial, sans-serif" font-weight="700" font-size="13" letter-spacing="2" fill="${GOLD}" text-anchor="middle">UTET</text>
</svg>`

  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
