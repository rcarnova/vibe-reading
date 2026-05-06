import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// ─── Load .env manually (no dotenv dependency needed) ─────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '../.env')

const env = {}
try {
  const raw = readFileSync(envPath, 'utf-8')
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim()
    env[key] = val
  }
} catch {
  console.error('Could not read .env file at', envPath)
  process.exit(1)
}

const SUPABASE_URL = env.VITE_SUPABASE_URL
const SUPABASE_KEY = env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchJson(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

async function headOk(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' })
    return res.ok
  } catch {
    return false
  }
}

async function findCoverId(book) {
  // a. Try ISBN first
  if (book.isbn) {
    const data = await fetchJson(
      `https://openlibrary.org/search.json?isbn=${encodeURIComponent(book.isbn)}&limit=1`
    )
    const coverId = data?.docs?.[0]?.cover_i
    if (coverId) return coverId
  }

  // b. Fallback: title + author
  if (book.title) {
    const params = new URLSearchParams({ limit: '1' })
    if (book.title) params.set('title', book.title)
    if (book.author) params.set('author', book.author)
    const data = await fetchJson(`https://openlibrary.org/search.json?${params}`)
    const coverId = data?.docs?.[0]?.cover_i
    if (coverId) return coverId
  }

  return null
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const { data: books, error } = await supabase
  .from('books')
  .select('id, title, author, isbn')
  .is('cover_url', null)

if (error) {
  console.error('Failed to fetch books:', error.message)
  process.exit(1)
}

if (!books || books.length === 0) {
  console.log('No books without cover_url found.')
  process.exit(0)
}

console.log(`Found ${books.length} books without cover.\n`)

let found = 0
let missing = 0

for (const book of books) {
  const label = `"${book.title}" (${book.author ?? '—'})`

  const coverId = await findCoverId(book)

  if (!coverId) {
    console.log(`✗ ${label} → no cover`)
    missing++
    await sleep(500)
    continue
  }

  const url = `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`

  // c. Verify URL actually resolves
  const valid = await headOk(url)
  if (!valid) {
    console.log(`✗ ${label} → cover_i found but URL returned error`)
    missing++
    await sleep(500)
    continue
  }

  // d. Update Supabase
  const { error: updateError } = await supabase
    .from('books')
    .update({ cover_url: url })
    .eq('id', book.id)

  if (updateError) {
    console.log(`✗ ${label} → found cover but failed to save: ${updateError.message}`)
    missing++
  } else {
    console.log(`✓ ${label} → ${url}`)
    found++
  }

  await sleep(500)
}

console.log(`\nDone. ${found} covers found, ${missing} still missing.`)
