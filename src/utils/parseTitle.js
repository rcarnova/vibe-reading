const SERIES_RE = /^(.+?)\s*\((.+?),\s*#(\d+)\)$/

/**
 * Parses a book title for embedded series info.
 * Returns { title, series, volume } where series/volume are null if not present.
 *
 * "The Name of the Wind (Kingkiller Chronicle, #1)"
 *   → { title: "The Name of the Wind", series: "Kingkiller Chronicle", volume: "1" }
 *
 * "Stoner"
 *   → { title: "Stoner", series: null, volume: null }
 */
export function parseTitle(raw) {
  const m = raw.match(SERIES_RE)
  if (!m) return { title: raw, series: null, volume: null }
  return { title: m[1], series: m[2], volume: m[3] }
}
