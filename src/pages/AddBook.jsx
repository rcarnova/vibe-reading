import { useState, useEffect, useRef } from 'react'
import { BrowserMultiFormatReader } from '@zxing/library'
import { supabase } from '../lib/supabase'


const GENRES = [
  'Narrativa italiana',
  'Narrativa straniera',
  'Saggistica',
  'Psicologia',
  'Leadership e management',
  'Vendita e business',
  'Creatività',
  'Filosofia',
  'Storia',
  'Biografie e memorie',
  'Thriller e noir',
  'Fantascienza e distopia',
  'Poesia e teatro',
  'Comunicazione e media',
  'Crescita personale',
  'Scienza e tecnologia',
  'Arte e design',
]

const STATUS_OPTIONS = [
  { value: 'to-read', label: 'Da leggere' },
  { value: 'reading', label: 'In lettura' },
  { value: 'read',    label: 'Letto' },
]

// ─── Fetch helpers ────────────────────────────────────────────────────────────

const GBOOKS_KEY = import.meta.env.VITE_GOOGLE_BOOKS_API_KEY
const GBOOKS_KEY_PARAM = GBOOKS_KEY ? `&key=${GBOOKS_KEY}` : ''

const FETCH_TIMEOUT_MS = 8000

function fetchWithTimeout(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer))
}

async function withRetry(fn) {
  try {
    const result = await fn()
    if (result) return result
  } catch { /* fall through to retry */ }
  await new Promise((r) => setTimeout(r, 1000))
  try { return await fn() } catch { return null }
}

function extractBookData(item) {
  const info = item.volumeInfo ?? {}
  const isbn13 = info.industryIdentifiers?.find((i) => i.type === 'ISBN_13')?.identifier
  const isbn10 = info.industryIdentifiers?.find((i) => i.type === 'ISBN_10')?.identifier
  const isbn = isbn13 || isbn10 || ''
  const raw = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || ''
  const cover = raw
    ? raw.replace('http:', 'https:').replace('zoom=1', 'zoom=3').replace('&edge=curl', '')
    : ''
  return {
    googleId: item.id,
    title: info.title || '',
    author: info.authors?.[0] || info.authors?.join(', ') || '',
    year: info.publishedDate ? parseInt(info.publishedDate.substring(0, 4)) : null,
    isbn,
    cover,
    description: info.description || '',
  }
}

async function searchGoogleBooks(query) {
  const res = await fetchWithTimeout(
    `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=5${GBOOKS_KEY_PARAM}`
  )
  if (!res.ok) throw new Error('Errore nella ricerca')
  const data = await res.json()
  return (data.items ?? []).map(extractBookData)
}

async function fetchByIsbn(cleanISBN) {
  const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${cleanISBN}&maxResults=1${GBOOKS_KEY_PARAM}`
  return withRetry(async () => {
    const t0 = Date.now()
    const res = await fetchWithTimeout(url)
    if (!res.ok) return null
    const data = await res.json()
    if (!data.items?.length) return null
    const book = extractBookData(data.items[0])
    console.log(`[Google Books] found "${book.title}" in ${Date.now() - t0}ms`)
    return { ...book, source: 'Google Books' }
  })
}

async function fetchByIsbnOpenLibraryApi(cleanISBN) {
  const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${cleanISBN}&format=json&jscmd=data`
  return withRetry(async () => {
    const t0 = Date.now()
    const res = await fetchWithTimeout(url)
    if (!res.ok) return null
    const data = await res.json()
    const book = data[`ISBN:${cleanISBN}`]
    if (!book) return null
    const year = book.publish_date ? book.publish_date.slice(-4) : null
    const cover = book.cover?.large || book.cover?.medium || null
    console.log(`[OL /api/books] found "${book.title}" in ${Date.now() - t0}ms`)
    return {
      googleId: null,
      title: book.title || '',
      author: book.authors?.[0]?.name || '',
      year: year ? parseInt(year) : null,
      isbn: cleanISBN,
      cover: cover || '',
      description: '',
      source: 'Open Library API',
    }
  })
}

async function fetchByIsbnOpenLibrarySearch(cleanISBN) {
  const url = `https://openlibrary.org/search.json?isbn=${cleanISBN}&limit=1&fields=title,author_name,first_publish_year,isbn,cover_i`
  return withRetry(async () => {
    const t0 = Date.now()
    const res = await fetchWithTimeout(url)
    if (!res.ok) return null
    const data = await res.json()
    const doc = data.docs?.[0]
    if (!doc?.title) return null
    const cover = doc.cover_i
      ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
      : ''
    console.log(`[OL search.json] found "${doc.title}" in ${Date.now() - t0}ms`)
    return {
      googleId: null,
      title: doc.title || '',
      author: doc.author_name?.[0] || '',
      year: doc.first_publish_year ?? null,
      isbn: cleanISBN,
      cover,
      description: '',
      source: 'Open Library Search',
    }
  })
}

// ─── Star picker ──────────────────────────────────────────────────────────────

function StarPicker({ value, onChange }) {
  const [hover, setHover] = useState(0)
  return (
    <div className="flex gap-1">
      {Array.from({ length: 5 }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n === value ? 0 : n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          className="p-0.5"
        >
          <svg
            className={`w-5 h-5 transition-colors ${(hover || value) >= n ? 'text-accent' : 'text-rule'}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </button>
      ))}
    </div>
  )
}

// ─── Barcode scanner ──────────────────────────────────────────────────────────

function BarcodeScanner({ onDetected }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const readerRef = useRef(null)
  const [isScanning, setIsScanning] = useState(false)
  const [detectedIsbn, setDetectedIsbn] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    return () => {
      readerRef.current?.reset()
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  function stopCamera() {
    readerRef.current?.reset()
    readerRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setIsScanning(false)
  }

  async function startCamera() {
    setError(null)
    setDetectedIsbn(null)

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Fotocamera non supportata da questo browser. Prova Safari aggiornato.')
      return
    }

    // Show video element first, then wait a frame for the DOM to update
    setIsScanning(true)
    await new Promise((resolve) => setTimeout(resolve, 100))

    if (!videoRef.current) {
      console.error('[BarcodeScanner] videoRef not available after mount')
      setIsScanning(false)
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })
      streamRef.current = stream

      const video = videoRef.current
      video.srcObject = stream
      video.setAttribute('playsinline', 'true')
      video.setAttribute('muted', 'true')
      await video.play()

      const reader = new BrowserMultiFormatReader()
      readerRef.current = reader

      reader.decodeFromStream(stream, video, (result) => {
        if (result) {
          const isbn = result.getText()
          stopCamera()
          setDetectedIsbn(isbn)
          onDetected(isbn)
        }
        // NotFoundException fires on every empty frame — ignore
      })
    } catch (err) {
      stopCamera()
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError("Permesso fotocamera negato. Vai in Impostazioni → Safari → Fotocamera e consenti l'accesso.")
      } else if (err.name === 'NotFoundError') {
        setError('Nessuna fotocamera trovata su questo dispositivo.')
      } else {
        setError(`Impossibile avviare la fotocamera: ${err.message}`)
      }
    }
  }

  return (
    <div>
      {!isScanning && (
        <button
          onClick={startCamera}
          className="font-sans text-xs uppercase tracking-[0.12em] bg-ink text-paper px-4 py-2 hover:bg-accent transition-colors"
        >
          Scansiona barcode
        </button>
      )}

      {/* Video always in DOM — shown/hidden via CSS so ref is always available */}
      <div style={{ display: isScanning ? 'block' : 'none' }}>
        <div className="flex flex-col gap-3">
          <div className="relative w-full max-w-[320px] overflow-hidden bg-ink">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              style={{
                display: 'block',
                width: '100%',
                height: '300px',
                objectFit: 'cover',
                background: '#000',
              }}
            />

            {/* Semi-transparent overlay with clear rectangle cutout */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div
                className="w-48 h-24 border-2 border-white"
                style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)' }}
              />
            </div>

            {/* Corner accents */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative w-48 h-24">
                <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-accent" />
                <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-accent" />
                <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-accent" />
                <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-accent" />
              </div>
            </div>
          </div>

          <p className="font-sans text-xs text-muted italic">
            Punta la fotocamera sul barcode
          </p>

          <button
            onClick={stopCamera}
            className="font-sans text-xs uppercase tracking-[0.12em] text-muted hover:text-ink transition-colors self-start border-b border-transparent hover:border-ink"
          >
            Annulla
          </button>
        </div>
      </div>

      {detectedIsbn && (
        <p className="font-sans text-xs text-muted mt-3">
          ISBN rilevato: <span className="tabular-nums text-ink">{detectedIsbn}</span>
        </p>
      )}

      {error && <p className="font-sans text-xs text-accent mt-2">{error}</p>}
    </div>
  )
}

// ─── Search results list ──────────────────────────────────────────────────────

function SearchResult({ book, onSelect }) {
  const [imgError, setImgError] = useState(false)
  return (
    <button
      onClick={() => onSelect(book)}
      className="flex gap-4 items-start py-3 border-b border-rule hover:bg-badge transition-colors -mx-2 px-2 text-left w-full"
    >
      <div className="flex-shrink-0 w-10 h-14 bg-badge overflow-hidden">
        {book.cover && !imgError ? (
          <img src={book.cover} alt="" className="w-full h-full object-cover" onError={() => setImgError(true)} />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-5 h-5 text-rule" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-display font-bold text-sm text-ink leading-snug line-clamp-2">{book.title}</p>
        {book.author && <p className="font-sans text-[10px] uppercase tracking-[0.12em] text-muted mt-0.5">{book.author}</p>}
        {book.year && <p className="font-sans text-[10px] text-muted mt-0.5">{book.year}</p>}
      </div>
    </button>
  )
}

// ─── Shared constants ─────────────────────────────────────────────────────────

const EMPTY_FORM = {
  title: '', author: '', year: '', genre: '', status: 'to-read', rating: 0,
  notes: '', cover: '', isbn: '', owned: true,
}

function BookForm({ initial, onSaved }) {
  const [form, setForm] = useState({ ...EMPTY_FORM, ...initial })
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState(null)
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    setForm({ ...EMPTY_FORM, ...initial })
    setImgError(false)
  }, [initial])

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const selectClass = [
    'w-full bg-transparent appearance-none cursor-pointer',
    'font-sans text-sm text-ink',
    'border-0 border-b-2 border-ink',
    'py-2 pr-6 pl-0',
    'focus:outline-none focus:border-accent transition-colors',
  ].join(' ')

  const inputClass = [
    'w-full bg-transparent font-sans text-sm text-ink placeholder:text-muted',
    'border-0 border-b-2 border-ink py-2 outline-none',
    'focus:border-accent transition-colors duration-150',
  ].join(' ')

  async function handleSave() {
    if (!form.title.trim()) return
    setSaving(true)
    const { error } = await supabase.from('books').insert({
      id: crypto.randomUUID(),
      title: form.title.trim(),
      author: form.author.trim() || null,
      year: form.year ? parseInt(form.year) : null,
      genre: form.genre || null,
      status: form.status,
      rating: form.status === 'read' && form.rating > 0 ? form.rating : null,
      review: form.notes.trim() || null,
      isbn: form.isbn.trim() || null,
      cover_url: form.cover.trim() || null,
      owned: form.owned,
    })
    setSaving(false)
    if (error) {
      if (error.code === '23505') {
        setSaveMessage('Questo libro è già presente nella tua biblioteca.')
      } else {
        setSaveMessage('Errore durante il salvataggio. Riprova.')
        console.error('Errore salvataggio:', error.message)
      }
    } else {
      setSaveMessage(null)
      onSaved()
    }
  }

  return (
    <div className="mt-8 border-t border-rule pt-8">
      <p className="font-sans text-[9px] uppercase tracking-[0.18em] text-muted mb-6">
        Dettagli libro
      </p>

      <div className="flex gap-6 mb-8">
        {/* Cover preview */}
        <div className="flex-shrink-0 w-20 aspect-[2/3] bg-badge overflow-hidden" style={{ boxShadow: '2px 3px 10px rgba(0,0,0,0.12)' }}>
          {form.cover && !imgError ? (
            <img src={form.cover} alt="" className="w-full h-full object-cover" onError={() => setImgError(true)} />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <svg className="w-6 h-6 text-rule" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col gap-5 min-w-0">
          {/* Title */}
          <div>
            <label className="block font-sans text-[9px] uppercase tracking-[0.18em] text-muted mb-1">Titolo *</label>
            <input type="text" value={form.title} onChange={(e) => set('title', e.target.value)} className={inputClass} placeholder="Titolo del libro" />
          </div>

          {/* Author */}
          <div>
            <label className="block font-sans text-[9px] uppercase tracking-[0.18em] text-muted mb-1">Autore</label>
            <input type="text" value={form.author} onChange={(e) => set('author', e.target.value)} className={inputClass} placeholder="Nome autore" />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {/* Year + Genre row */}
        <div className="flex gap-6">
          <div className="flex-1">
            <label className="block font-sans text-[9px] uppercase tracking-[0.18em] text-muted mb-1">Anno</label>
            <input type="number" value={form.year} onChange={(e) => set('year', e.target.value)} className={inputClass} placeholder="es. 2024" />
          </div>
          <div className="flex-1">
            <label className="block font-sans text-[9px] uppercase tracking-[0.18em] text-muted mb-1">Genere</label>
            <div className="relative">
              <select value={form.genre} onChange={(e) => set('genre', e.target.value)} className={selectClass}>
                <option value="">— seleziona —</option>
                {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
              <svg className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>

        {/* Status pills */}
        <div>
          <label className="block font-sans text-[9px] uppercase tracking-[0.18em] text-muted mb-2">Stato</label>
          <div className="flex gap-2">
            {STATUS_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => set('status', o.value)}
                className={[
                  'font-sans text-xs tracking-wide px-3 py-1.5 border transition-colors',
                  form.status === o.value ? 'bg-ink text-paper border-ink' : 'bg-paper text-ink border-ink hover:bg-badge',
                ].join(' ')}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Rating — only when read */}
        {form.status === 'read' && (
          <div>
            <label className="block font-sans text-[9px] uppercase tracking-[0.18em] text-muted mb-2">Voto</label>
            <StarPicker value={form.rating} onChange={(v) => set('rating', v)} />
          </div>
        )}

        {/* Owned toggle */}
        <div>
          <label className="block font-sans text-[9px] uppercase tracking-[0.18em] text-muted mb-2">Possiedi questo libro?</label>
          <div className="flex gap-2">
            {[{ value: true, label: 'Sì, ce l\'ho' }, { value: false, label: 'No, wishlist' }].map((o) => (
              <button
                key={String(o.value)}
                type="button"
                onClick={() => set('owned', o.value)}
                className={[
                  'font-sans text-xs tracking-wide px-3 py-1.5 border transition-colors',
                  form.owned === o.value ? 'bg-ink text-paper border-ink' : 'bg-paper text-ink border-ink hover:bg-badge',
                ].join(' ')}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block font-sans text-[9px] uppercase tracking-[0.18em] text-muted mb-1">Note (opzionale)</label>
          <textarea
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            rows={3}
            placeholder="Pensieri, citazioni, impressioni..."
            className={[inputClass, 'resize-none'].join(' ')}
          />
        </div>

        {/* Cover URL (editable) */}
        <div>
          <label className="block font-sans text-[9px] uppercase tracking-[0.18em] text-muted mb-1">URL copertina (opzionale)</label>
          <input
            type="url"
            value={form.cover}
            onChange={(e) => { set('cover', e.target.value); setImgError(false) }}
            className={inputClass}
            placeholder="https://..."
          />
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={!form.title.trim() || saving}
          className={[
            'font-sans text-xs uppercase tracking-[0.15em] px-8 py-3 mt-2 transition-colors self-start',
            form.title.trim() && !saving
              ? 'bg-ink text-paper hover:bg-accent cursor-pointer'
              : 'bg-rule text-muted cursor-not-allowed',
          ].join(' ')}
        >
          {saving ? 'Salvataggio…' : 'Aggiungi alla biblioteca'}
        </button>

        {saveMessage && (
          <p className={`font-sans text-xs mt-3 ${saveMessage.includes('già presente') ? 'text-muted' : 'text-accent'}`}>
            {saveMessage}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AddBook() {
  console.log('[AddBook] rendered')
  const [mode, setMode] = useState('barcode') // 'barcode' | 'search'
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(null)
  const [prefill, setPrefill] = useState(null)
  const [success, setSuccess] = useState(false)
  const [isbnFetching, setIsbnFetching] = useState(false)
  const [isbnError, setIsbnError] = useState(null)
  const [isbnSource, setIsbnSource] = useState(null)

  async function handleIsbnDetected(rawIsbn) {
    const cleanISBN = rawIsbn.replace(/[^0-9]/g, '').trim()
    console.log('[handleIsbnDetected] raw:', rawIsbn, '→ clean:', cleanISBN)

    setIsbnError(null)
    setIsbnSource(null)
    setIsbnFetching(true)
    setPrefill(null)

    let book = await fetchByIsbn(cleanISBN)

    if (!book?.title) {
      book = await fetchByIsbnOpenLibraryApi(cleanISBN)
    }

    if (!book?.title) {
      book = await fetchByIsbnOpenLibrarySearch(cleanISBN)
    }

    setIsbnFetching(false)

    if (book?.title) {
      setIsbnSource(book.source)
      setPrefill({
        title:  book.title,
        author: book.author,
        year:   book.year || '',
        isbn:   book.isbn || cleanISBN,
        cover:  book.cover,
      })
    } else {
      setIsbnError('Libro non trovato. Inserisci i dati manualmente.')
      setPrefill({ isbn: cleanISBN, title: '', author: '', year: '', cover: '' })
    }
  }

  async function handleSearch() {
    if (!searchQuery.trim()) return
    setSearching(true)
    setSearchError(null)
    setSearchResults([])
    try {
      const results = await searchGoogleBooks(searchQuery)
      setSearchResults(results)
    } catch (err) {
      setSearchError(err.message)
    } finally {
      setSearching(false)
    }
  }

  function handleSelectResult(book) {
    setPrefill({ title: book.title, author: book.author, year: book.year || '', isbn: book.isbn, cover: book.cover })
    setSearchResults([])
  }

  function handleSaved() {
    setSuccess(true)
    setPrefill(null)
    setSearchQuery('')
    setSearchResults([])
    setTimeout(() => setSuccess(false), 3000)
  }

  return (
    <main className="max-w-[800px] mx-auto px-6 py-12">
      <header className="mb-10">
        <h1 className="font-display italic font-black text-5xl sm:text-6xl text-ink leading-none mb-3">
          Aggiungi un libro
        </h1>
        <p className="font-sans font-light text-sm tracking-wide text-muted">
          Scansiona il barcode o cerca per titolo
        </p>
        <hr className="mt-6 border-rule" />
      </header>

      {/* Success toast */}
      {success && (
        <div className="mb-6 px-4 py-3 bg-ink text-paper font-sans text-xs uppercase tracking-[0.12em]">
          Libro aggiunto alla biblioteca
        </div>
      )}

      {/* Mode toggle */}
      <div className="flex gap-0 mb-8 border-b border-rule">
        {[
          { key: 'barcode', label: 'Barcode / ISBN' },
          { key: 'search', label: 'Cerca per titolo' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => { setMode(key); setPrefill(null); setSearchResults([]) }}
            className={[
              'font-sans text-xs uppercase tracking-[0.12em] px-4 py-2 border-b-2 -mb-px transition-colors',
              mode === key ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Mode A — Barcode */}
      {mode === 'barcode' && (
        <div>
          <BarcodeScanner onDetected={handleIsbnDetected} />
          {isbnFetching && (
            <p className="font-sans text-xs text-muted mt-4 animate-pulse">
              Ricerca in corso…
            </p>
          )}
          {isbnSource && !isbnFetching && (
            <p className="font-sans text-[10px] text-muted mt-2">
              Trovato su <span className="text-ink">{isbnSource}</span>
            </p>
          )}
          {isbnError && (
            <p className="font-sans text-xs text-accent mt-4">{isbnError}</p>
          )}

        </div>
      )}

      {/* Mode B — Search */}
      {mode === 'search' && (
        <div>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Titolo, autore o ISBN..."
                className={[
                  'w-full bg-transparent font-sans text-sm text-ink placeholder:text-muted placeholder:italic',
                  'border-0 border-b-2 border-ink py-2 outline-none',
                  'focus:border-accent transition-colors duration-150',
                ].join(' ')}
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={searching || !searchQuery.trim()}
              className={[
                'font-sans text-xs uppercase tracking-[0.12em] px-4 py-2 border transition-colors',
                searchQuery.trim() && !searching
                  ? 'border-ink text-ink hover:bg-ink hover:text-paper'
                  : 'border-rule text-muted cursor-not-allowed',
              ].join(' ')}
            >
              {searching ? '…' : 'Cerca'}
            </button>
          </div>

          {searchError && (
            <p className="font-sans text-xs text-accent mt-3">{searchError}</p>
          )}

          {searchResults.length > 0 && (
            <div className="mt-4 border-t border-rule">
              {searchResults.map((book) => (
                <SearchResult key={book.googleId} book={book} onSelect={handleSelectResult} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Book form */}
      {prefill && (
        <BookForm initial={prefill} onSaved={handleSaved} />
      )}

      {/* Manual form if no prefill yet */}
      {!prefill && mode === 'barcode' && (
        <div className="mt-6">
          <button
            onClick={() => setPrefill(EMPTY_FORM)}
            className="font-sans text-xs uppercase tracking-[0.12em] text-muted hover:text-ink border-b border-transparent hover:border-ink transition-colors"
          >
            Inserisci manualmente senza barcode →
          </button>
        </div>
      )}
    </main>
  )
}
