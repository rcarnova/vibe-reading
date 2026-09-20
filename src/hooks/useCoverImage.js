import { useState, useEffect } from 'react'
import generateSynopsis from '../utils/generateSynopsis'
import { supabase } from '../lib/supabase'
import { generateCoverPlaceholder } from '../utils/generateCoverPlaceholder'

// Module-level cache. Stores { url, description, aiGenerated } once resolved.
const cache = new Map()

// ─── Cover resolution ─────────────────────────────────────────────────────────

// Returns true if the URL points to a real image. Open Library's cover CDN
// never sends Content-Length on HEAD requests (confirmed for both real and
// missing covers), so that can't be used to tell them apart. What does
// differ: a real cover redirects through archive.org and the final response
// carries a Content-Type; the 1x1 placeholder GIF is served directly with no
// Content-Type at all.
async function isRealImage(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' })
    if (!res.ok) return false
    const contentType = res.headers.get('content-type') ?? ''
    return contentType.startsWith('image/')
  } catch { return false }
}

async function openLibraryCoverByIsbn(isbn) {
  const url = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`
  return (await isRealImage(url)) ? url : null
}

async function openLibraryCoverSearch(title, author) {
  try {
    const q = author
      ? `title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}`
      : `q=${encodeURIComponent(title)}`
    const res = await fetch(`https://openlibrary.org/search.json?${q}&limit=1`)
    if (!res.ok) return null
    const data = await res.json()
    const coverId = data.docs?.[0]?.cover_i
    if (!coverId) return null
    const url = `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`
    return (await isRealImage(url)) ? url : null
  } catch { return null }
}

function normalizeForMatch(s) {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

// Google's `intitle:` search is fuzzy — it can return an unrelated book that
// just shares a word (e.g. searching "Vita liquida" surfacing "La mia vita").
// Only accept a result whose title actually contains (or is contained by)
// the requested title.
function titleRoughlyMatches(requested, found) {
  const r = normalizeForMatch(requested)
  const f = normalizeForMatch(found)
  if (!r || !f) return false
  return r.includes(f) || f.includes(r) || (r.length > 15 && f.includes(r.slice(0, 15)))
}

// Searches by title/author (not ISBN — matching the exact physical edition
// isn't the goal here, getting a good-looking recognizable cover is) and
// picks the most recent Italian edition that actually has cover art. A
// single ISBN-exact lookup often pins the book to whatever edition happens
// to be on record, which can be a plain library-scan cover from an old
// printing even when a nicer modern reprint exists.
async function googleBooksBestCoverOnce(title, author) {
  const GBOOKS_KEY = import.meta.env.VITE_GOOGLE_BOOKS_API_KEY
  const keyParam = GBOOKS_KEY ? `&key=${GBOOKS_KEY}` : ''
  const q = author
    ? `intitle:${encodeURIComponent(title)}+inauthor:${encodeURIComponent(author)}`
    : `intitle:${encodeURIComponent(title)}`
  const res = await fetch(
    `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=10${keyParam}`
  )
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()

  const candidates = (data.items ?? [])
    .map((item) => ({
      thumbnail: item.volumeInfo?.imageLinks?.thumbnail,
      year: parseInt(item.volumeInfo?.publishedDate?.slice(0, 4) || '0', 10),
      isItalian: item.volumeInfo?.language === 'it',
      foundTitle: item.volumeInfo?.title,
    }))
    .filter((c) => c.thumbnail && titleRoughlyMatches(title, c.foundTitle))
    // Italian editions first (this library is Italian-language), then most
    // recent — newer printings tend to have nicer, illustrated cover art.
    .sort((a, b) => (b.isItalian - a.isItalian) || (b.year - a.year))

  if (!candidates.length) return null
  // Note: don't upgrade to zoom=3 — for some editions Google Books has no
  // high-zoom asset and serves a literal "image not available" graphic at
  // that zoom level, even though zoom=1 (the default) is a real cover.
  return candidates[0].thumbnail.replace('http:', 'https:').replace('&edge=curl', '')
}

// Google Books returns intermittent 503s — retry once before giving up.
async function googleBooksBestCover(title, author) {
  try {
    return await googleBooksBestCoverOnce(title, author)
  } catch {
    try {
      await new Promise((r) => setTimeout(r, 800))
      return await googleBooksBestCoverOnce(title, author)
    } catch {
      return null
    }
  }
}

// ─── Description resolution ───────────────────────────────────────────────────

async function googleDescription(isbn, title, author) {
  try {
    const GBOOKS_KEY = import.meta.env.VITE_GOOGLE_BOOKS_API_KEY
    const keyParam = GBOOKS_KEY ? `&key=${GBOOKS_KEY}` : ''
    const q = isbn
      ? `isbn:${isbn}`
      : `intitle:${encodeURIComponent(title)}+inauthor:${encodeURIComponent(author)}`
    const res = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=1${keyParam}`
    )
    if (!res.ok) return null
    const data = await res.json()
    return data.items?.[0]?.volumeInfo?.description || null
  } catch { return null }
}

async function openLibraryDescription(isbn, title, author) {
  try {
    const searchUrl = isbn
      ? `https://openlibrary.org/search.json?isbn=${isbn}&limit=1`
      : `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}&limit=1`

    const searchRes = await fetch(searchUrl)
    if (!searchRes.ok) return null
    const searchData = await searchRes.json()

    const workKey = searchData.docs?.[0]?.key
    if (!workKey) return null

    const workRes = await fetch(`https://openlibrary.org${workKey}.json`)
    if (!workRes.ok) return null
    const workData = await workRes.json()

    const desc = workData.description
    if (!desc) return null
    return typeof desc === 'string' ? desc : (desc.value ?? null)
  } catch { return null }
}

// ─── Refusal detection ─────────────────────────────────────────────────────────

// The AI sometimes replies with an apology instead of a synopsis when it
// doesn't recognize an obscure/regional title. Never persist or show that
// as if it were real synopsis text.
const REFUSAL_PATTERNS = [
  'mi dispiace', 'mi scuso', 'non ho informazioni', 'non riesco a trovare',
  'non riesco a fornire', 'non posso fornire', 'non dispongo di informazioni',
  'devo chiarire', 'devo segnalare', 'devo fare una precisazione',
  'non esiste un libro', 'non ho dati verificati',
]

function looksLikeRefusal(text) {
  const lower = text.toLowerCase()
  return REFUSAL_PATTERNS.some((p) => lower.includes(p))
}

// ─── Main resolver ────────────────────────────────────────────────────────────

async function resolve(book, aiEnabled = true, forceRegenerate = false) {
  const { isbn, title, author } = book

  // ── Cover ──
  let url = book.cover_url || null

  if (!url) {
    // 1. Google Books by title+author — best coverage, picks the most
    // recent edition with real cover art rather than pinning to whatever
    // edition the ISBN on record happens to be.
    url = await googleBooksBestCover(title, author)

    // 2. Open Library search by title+author → cover_i
    if (!url) {
      url = await openLibraryCoverSearch(title, author)
    }

    // 3. Open Library by ISBN, as a last resort if there's one on record
    if (!url && isbn) {
      url = await openLibraryCoverByIsbn(isbn)
    }

    // 4. Placeholder — always show something
    if (!url) {
      url = generateCoverPlaceholder(title, author)
    }
  }

  // ── Synopsis (already saved) ──
  if (book.synopsis && !forceRegenerate) {
    return { url, description: book.synopsis, aiGenerated: book.ai_synopsis === true }
  }

  // ── Description chain ──
  let description = await googleDescription(isbn, title, author)

  if (!description) {
    description = await openLibraryDescription(isbn, title, author)
  }

  // ── AI fallback + persist ──
  let aiGenerated = false
  if (!description && aiEnabled) {
    try {
      const aiText = await generateSynopsis(title, author, book.genre)
      if (aiText && !looksLikeRefusal(aiText)) {
        description = aiText
        aiGenerated = true
        supabase
          .from('books')
          .update({ synopsis: description, ai_synopsis: true })
          .eq('id', book.id)
          .then(({ error }) => {
            if (error) console.error('Failed to save synopsis:', error.message)
          })
      }
    } catch {
      description = null
    }
  }

  return { url, description, aiGenerated }
}

/**
 * Returns { loading, url, description, aiGenerated } where:
 *   loading     – true while resolution is in flight
 *   url         – resolved cover image URL (never null — falls back to placeholder)
 *   description – synopsis text, or null if unavailable from all sources
 *   aiGenerated – true when description was produced by the AI fallback
 */
export function useCoverImage(book, aiEnabled = true) {
  const cacheKey = book.isbn || `${book.title}::${book.author}`

  const [state, setState] = useState(() => {
    if (cache.has(cacheKey)) {
      return { loading: false, ...cache.get(cacheKey) }
    }
    return { loading: true, url: null, description: null, aiGenerated: false }
  })

  useEffect(() => {
    if (cache.has(cacheKey)) return

    let cancelled = false

    resolve(book, aiEnabled).then((result) => {
      if (cancelled) return
      cache.set(cacheKey, result)
      setState({ loading: false, ...result })
    })

    return () => { cancelled = true }
  }, [cacheKey]) // eslint-disable-line react-hooks/exhaustive-deps

  async function regenerate() {
    setState((s) => ({ ...s, loading: true }))
    const result = await resolve(book, aiEnabled, true)
    cache.set(cacheKey, result)
    setState({ loading: false, ...result })
  }

  return { ...state, regenerate }
}
