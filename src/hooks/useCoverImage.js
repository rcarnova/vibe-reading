import { useState, useEffect } from 'react'
import generateSynopsis from '../utils/generateSynopsis'
import { supabase } from '../lib/supabase'
import { generateCoverPlaceholder } from '../utils/generateCoverPlaceholder'

// Module-level cache. Stores { url, description, aiGenerated } once resolved.
const cache = new Map()

// ─── Cover resolution ─────────────────────────────────────────────────────────

// Returns true if the URL points to a real image (Content-Length > 1000 bytes).
// Open Library returns a 1x1 pixel GIF (~807 bytes) for missing covers.
async function isRealImage(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' })
    if (!res.ok) return false
    const len = parseInt(res.headers.get('content-length') ?? '0', 10)
    return len > 1000
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

// ─── Main resolver ────────────────────────────────────────────────────────────

async function resolve(book) {
  const { isbn, title, author } = book

  // ── Cover ──
  let url = book.cover_url || null

  if (!url) {
    // 1. Open Library by ISBN (direct URL + HEAD verify)
    if (isbn) {
      url = await openLibraryCoverByIsbn(isbn)
    }

    // 2. Open Library search by title+author → cover_i
    if (!url) {
      url = await openLibraryCoverSearch(title, author)
    }

    // 3. Placeholder — always show something
    if (!url) {
      url = generateCoverPlaceholder(title, author)
    }
  }

  // ── Synopsis (already saved) ──
  if (book.synopsis) {
    return { url, description: book.synopsis, aiGenerated: book.ai_synopsis === true }
  }

  // ── Description chain ──
  let description = await googleDescription(isbn, title, author)

  if (!description) {
    description = await openLibraryDescription(isbn, title, author)
  }

  // ── AI fallback + persist ──
  let aiGenerated = false
  if (!description) {
    try {
      description = await generateSynopsis(title, author, book.genre)
      if (description) {
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
export function useCoverImage(book) {
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

    resolve(book).then((result) => {
      if (cancelled) return
      cache.set(cacheKey, result)
      setState({ loading: false, ...result })
    })

    return () => { cancelled = true }
  }, [cacheKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return state
}
