import { useState, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// ─── CSV parser (RFC 4180) ────────────────────────────────────────────────────

function parseCSV(text) {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const rows = []
  let fields = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i]
    if (inQuotes) {
      if (ch === '"' && normalized[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        field += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        fields.push(field); field = ''
      } else if (ch === '\n') {
        fields.push(field); field = ''
        rows.push(fields); fields = []
      } else {
        field += ch
      }
    }
  }
  if (field || fields.length > 0) { fields.push(field); rows.push(fields) }

  if (rows.length < 2) return { headers: [], rows: [] }
  const headers = rows[0].map((h) => h.trim())
  const data = rows
    .slice(1)
    .filter((row) => row.some((f) => f.trim()))
    .map((row) => {
      const obj = {}
      headers.forEach((h, i) => { obj[h] = (row[i] ?? '').trim() })
      return obj
    })
  return { headers, rows: data }
}

// ─── Format detection ─────────────────────────────────────────────────────────

function detectFormat(headers) {
  const h = new Set(headers.map((x) => x.toLowerCase()))
  if (h.has('book id') || h.has('exclusive shelf')) return 'goodreads'
  if (h.has('reading status')) return 'kobo'
  if (h.has('titolo') && h.has('autore') && h.has('stato di lettura') && h.has('voto')) return 'anobii'
  return 'unknown'
}

const FORMAT_LABELS = {
  goodreads: 'Goodreads',
  anobii:    'Anobii',
  kobo:      'Kobo',
  unknown:   'Formato sconosciuto',
}

// ─── Status mapping ───────────────────────────────────────────────────────────

function goodreadsStatus(shelf) {
  const s = (shelf ?? '').toLowerCase().trim()
  if (s === 'read') return 'read'
  if (s === 'currently-reading') return 'reading'
  return 'to-read'
}

function anobiiStatus(status) {
  const s = (status ?? '').toLowerCase().trim()
  if (s === 'letto') return 'read'
  if (s === 'in corso') return 'reading'
  return 'to-read'
}

function koboStatus(status) {
  const s = (status ?? '').toLowerCase().trim()
  if (s === 'finished' || s === 'read') return 'read'
  if (s === 'in progress' || s === 'reading') return 'reading'
  return 'to-read'
}

// ─── ISBN cleaning ────────────────────────────────────────────────────────────

function cleanIsbn(raw) {
  // Goodreads wraps in ="..." e.g. ="9780735224292"
  return (raw ?? '').replace(/^=?"?/, '').replace(/"?$/, '').replace(/[^0-9X]/gi, '').trim() || null
}

// ─── Bookshelves → genre ──────────────────────────────────────────────────────

const STATUS_SHELVES = new Set(['read', 'currently-reading', 'to-read'])

function goodreadsGenre(bookshelves) {
  if (!bookshelves) return null
  const shelves = bookshelves.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  const genre = shelves.find((s) => !STATUS_SHELVES.has(s))
  return genre || null
}

// ─── Row mappers ──────────────────────────────────────────────────────────────

function mapGoodreads(row) {
  const rating = parseInt(row['My Rating'] ?? '0', 10)
  const status = goodreadsStatus(row['Exclusive Shelf'])
  const year = parseInt(row['Original Publication Year'] || row['Year Published'] || '0', 10) || null
  return {
    title:   row['Title'] || null,
    author:  row['Author'] || null,
    isbn:    cleanIsbn(row['ISBN13'] || row['ISBN']),
    rating:  status === 'read' && rating > 0 ? rating : null,
    status,
    review:  row['My Review'] || null,
    genre:   goodreadsGenre(row['Bookshelves']),
    year,
  }
}

function mapAnobii(row) {
  const rating = parseInt(row['Voto'] ?? '0', 10)
  const status = anobiiStatus(row['Stato di lettura'])
  const rawYear = (row['Data di pubblicazione'] ?? '').trim()
  const year = rawYear.length >= 4 ? parseInt(rawYear.slice(0, 4), 10) || null : null
  const rawTags = (row['Tags'] ?? '').trim()
  const genre = rawTags ? rawTags.split(/[,;|]/).map((t) => t.trim()).find(Boolean) || null : null
  return {
    title:   row['Titolo'] || null,
    author:  row['Autore'] || null,
    isbn:    cleanIsbn(row['ISBN']),
    rating:  status === 'read' && rating > 0 ? rating : null,
    status,
    review:  row['Contenuto Commento'] || null,
    notes:   row['Note private'] || null,
    genre,
    year,
  }
}

function mapKobo(row) {
  const rating = parseInt(row['Rating'] ?? '0', 10)
  const status = koboStatus(row['Reading Status'])
  return {
    title:   row['Title'] || null,
    author:  row['Author'] || null,
    isbn:    cleanIsbn(row['ISBN']),
    rating:  status === 'read' && rating > 0 ? rating : null,
    status,
    review:  null,
    genre:   null,
    year:    null,
  }
}

function mapRow(row, format) {
  if (format === 'goodreads') return mapGoodreads(row)
  if (format === 'anobii')    return mapAnobii(row)
  if (format === 'kobo')      return mapKobo(row)
  return null
}

// ─── Status labels ────────────────────────────────────────────────────────────

const STATUS_LABELS = { read: 'Letto', reading: 'In lettura', 'to-read': 'Da leggere' }
const STATUS_COLORS = {
  read:     'text-[#2D6A4F] border-[#2D6A4F]',
  reading:  'text-[#1D4E89] border-[#1D4E89]',
  'to-read':'text-muted border-muted',
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Import() {
  const fileRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)

  // Parsed state
  const [format, setFormat]   = useState(null)     // 'goodreads' | 'anobii' | 'kobo' | 'unknown'
  const [books, setBooks]     = useState([])        // mapped books

  // Options
  const [skipDupes, setSkipDupes]   = useState(true)
  const [overwrite, setOverwrite]   = useState(false)
  const [importOwned, setImportOwned] = useState(true)

  // Import progress
  const [step, setStep]             = useState('upload') // 'upload' | 'preview' | 'importing' | 'done'
  const [progress, setProgress]     = useState({ done: 0, total: 0, skipped: 0, skippedByIsbn: 0, skippedByTitle: 0, errors: [] })

  // ── File processing ──

  function processFile(file) {
    if (!file || !file.name.endsWith('.csv')) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target.result
      const { headers, rows } = parseCSV(text)
      const fmt = detectFormat(headers)
      setFormat(fmt)
      if (fmt === 'unknown') {
        setBooks([])
        setStep('preview')
        return
      }
      const mapped = rows
        .map((row) => mapRow(row, fmt))
        .filter((b) => b && b.title)
      setBooks(mapped)
      setStep('preview')
    }
    reader.readAsText(file, 'UTF-8')
  }

  function handleFileInput(e) {
    processFile(e.target.files?.[0])
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    processFile(e.dataTransfer.files?.[0])
  }, [])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => setDragOver(false), [])

  // ── Import logic ──

  async function handleImport() {
    setStep('importing')
    const total = books.length
    let done = 0; let skipped = 0; let skippedByIsbn = 0; let skippedByTitle = 0
    const errors = []

    // Pre-fetch all existing books to enable both ISBN and title+author matching locally
    const isbnMap  = new Map() // isbn → { id, title, author }
    const titleMap = new Map() // normalized title → { id, title, author }

    if (skipDupes || overwrite) {
      const { data } = await supabase.from('books').select('id, isbn, title, author')
      for (const b of (data ?? [])) {
        if (b.isbn) isbnMap.set(b.isbn, b)
        if (b.title) titleMap.set(b.title.trim().toLowerCase(), b)
      }
    }

    function findDuplicate(book) {
      // 1. ISBN match
      if (book.isbn && isbnMap.has(book.isbn)) {
        return { existing: isbnMap.get(book.isbn), matchedBy: 'isbn' }
      }
      // 2. Title + author fallback (for books without ISBN)
      if (book.title) {
        const normTitle = book.title.trim().toLowerCase()
        const existing = titleMap.get(normTitle)
        if (existing) {
          const authorMatch =
            !book.author ||
            !existing.author ||
            existing.author.toLowerCase().includes(book.author.toLowerCase().split(' ')[0])
          if (authorMatch) return { existing, matchedBy: 'titolo' }
        }
      }
      return null
    }

    const BATCH = 20
    for (let i = 0; i < books.length; i += BATCH) {
      const batch = books.slice(i, i + BATCH)

      for (const book of batch) {
        try {
          const dup = findDuplicate(book)

          if (skipDupes && dup) {
            skipped++
            if (dup.matchedBy === 'isbn') skippedByIsbn++
            else skippedByTitle++
            done++
            setProgress({ done, total, skipped, skippedByIsbn, skippedByTitle, errors: [...errors] })
            continue
          }

          if (overwrite && dup) {
            const filter = dup.matchedBy === 'isbn'
              ? supabase.from('books').update({
                  title: book.title, author: book.author, year: book.year, genre: book.genre,
                  status: book.status, rating: book.rating, review: book.review, owned: importOwned,
                }).eq('isbn', book.isbn)
              : supabase.from('books').update({
                  title: book.title, author: book.author, year: book.year, genre: book.genre,
                  status: book.status, rating: book.rating, review: book.review, owned: importOwned,
                }).eq('id', dup.existing.id)
            const { error } = await filter
            if (error) errors.push(`${book.title}: ${error.message}`)
          } else {
            const { error } = await supabase.from('books').insert({
              id:     crypto.randomUUID(),
              title:  book.title,
              author: book.author,
              isbn:   book.isbn,
              year:   book.year,
              genre:  book.genre,
              status: book.status,
              rating: book.rating,
              review: book.review,
              owned:  importOwned,
            })
            if (error && error.code === '23505') {
              skipped++; skippedByIsbn++ // duplicate caught at DB level (ISBN unique constraint)
            } else if (error) {
              errors.push(`${book.title}: ${error.message}`)
            } else {
              if (book.isbn) isbnMap.set(book.isbn, { id: '', title: book.title, author: book.author })
              if (book.title) titleMap.set(book.title.trim().toLowerCase(), { id: '', title: book.title, author: book.author })
            }
          }
        } catch (err) {
          errors.push(`${book.title}: ${err.message}`)
        }
        done++
        setProgress({ done, total, skipped, skippedByIsbn, skippedByTitle, errors: [...errors] })
      }

      // 100ms pause between batches
      if (i + BATCH < books.length) {
        await new Promise((r) => setTimeout(r, 100))
      }
    }

    setStep('done')
    setProgress({ done, total, skipped, skippedByIsbn, skippedByTitle, errors })
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const inputClass = 'appearance-none bg-transparent border-0 border-b-2 border-ink py-1.5 outline-none font-sans text-sm text-ink'

  return (
    <main className="max-w-[900px] mx-auto px-6 py-12">
      <header className="mb-10">
        <h1 className="font-display italic font-black text-5xl sm:text-6xl text-ink leading-none mb-3">
          Importa la tua biblioteca
        </h1>
        <p className="font-sans font-light text-sm tracking-wide text-muted">
          Carica un file CSV da Goodreads, Anobii o Kobo
        </p>
        <hr className="mt-6 border-rule" />
      </header>

      {/* ── Step 1: Upload ── */}
      {step === 'upload' && (
        <div>
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileRef.current?.click()}
            className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed cursor-pointer transition-colors py-20 px-8 text-center ${
              dragOver ? 'border-ink bg-badge' : 'border-rule hover:border-ink'
            }`}
          >
            <svg className="w-10 h-10 text-rule" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="font-display italic text-xl text-ink">Trascina il tuo CSV qui</p>
            <p className="font-sans text-xs uppercase tracking-[0.18em] text-muted">o clicca per selezionare</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            onChange={handleFileInput}
            className="hidden"
          />
          <p className="font-sans text-[10px] text-muted mt-4">
            Formati supportati: Goodreads, Anobii, Kobo
          </p>
        </div>
      )}

      {/* ── Step 2: Preview ── */}
      {step === 'preview' && (
        <div>
          {/* Format badge */}
          <div className="flex items-center gap-4 mb-8">
            <span className={`font-sans text-[9px] uppercase tracking-[0.18em] border px-2 py-1 ${
              format === 'unknown' ? 'border-accent text-accent' : 'border-[#2D6A4F] text-[#2D6A4F]'
            }`}>
              {format === 'unknown' ? 'Formato non riconosciuto' : `Rilevato: ${FORMAT_LABELS[format]} ✓`}
            </span>
            <button
              onClick={() => { setStep('upload'); setBooks([]); setFormat(null) }}
              className="font-sans text-[10px] uppercase tracking-[0.14em] text-muted hover:text-ink border-b border-transparent hover:border-ink transition-colors"
            >
              Cambia file
            </button>
          </div>

          {format === 'unknown' ? (
            <p className="font-serif text-base text-muted">
              Formato non riconosciuto. Verifica che sia un CSV Goodreads, Anobii o Kobo.
            </p>
          ) : (
            <>
              {/* Book count */}
              <p className="font-sans text-sm text-muted mb-6">
                <span className="font-display font-bold text-3xl text-ink mr-2">{books.length}</span>
                libri trovati
              </p>

              {/* Preview table */}
              <div className="overflow-x-auto mb-8">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b-2 border-ink">
                      {['Titolo', 'Autore', 'ISBN', 'Stato', 'Rating'].map((h) => (
                        <th key={h} className="font-sans text-[9px] uppercase tracking-[0.18em] text-muted text-left py-2 pr-6">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {books.slice(0, 10).map((book, i) => (
                      <tr key={i} className="border-b border-rule">
                        <td className="font-display font-bold text-sm text-ink py-3 pr-6 max-w-[200px]">
                          <span className="line-clamp-1">{book.title}</span>
                        </td>
                        <td className="font-sans text-xs text-muted py-3 pr-6 max-w-[150px]">
                          <span className="line-clamp-1">{book.author || '—'}</span>
                        </td>
                        <td className="font-sans text-xs text-muted py-3 pr-6 tabular-nums whitespace-nowrap">
                          {book.isbn || '—'}
                        </td>
                        <td className="py-3 pr-6">
                          <span className={`font-sans text-[9px] uppercase tracking-[0.14em] border px-1.5 py-px ${STATUS_COLORS[book.status]}`}>
                            {STATUS_LABELS[book.status]}
                          </span>
                        </td>
                        <td className="font-sans text-xs text-muted py-3">
                          {book.rating > 0 ? `${book.rating}/5` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {books.length > 10 && (
                  <p className="font-sans text-[10px] text-muted mt-2">
                    … e altri {books.length - 10} libri
                  </p>
                )}
              </div>

              {/* Import options */}
              <div className="border-t border-rule pt-6 mb-8 flex flex-col gap-3">
                <p className="font-sans text-[9px] uppercase tracking-[0.18em] text-muted mb-1">
                  Opzioni di importazione
                </p>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={skipDupes}
                    onChange={(e) => setSkipDupes(e.target.checked)}
                    className={inputClass + ' w-4 h-4 cursor-pointer'}
                  />
                  <span className="font-sans text-sm text-ink">
                    Salta libri già presenti (stesso ISBN)
                  </span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={overwrite}
                    onChange={(e) => setOverwrite(e.target.checked)}
                    className={inputClass + ' w-4 h-4 cursor-pointer'}
                  />
                  <span className="font-sans text-sm text-ink">
                    Sovrascrivi libri esistenti con nuovi dati
                  </span>
                </label>
              </div>

              {/* Owned toggle */}
              <div className="border-t border-rule pt-6 mb-8">
                <p className="font-sans text-[9px] uppercase tracking-[0.18em] text-muted mb-4">
                  Questi libri li possiedi?
                </p>
                <div className="flex gap-4">
                  {[
                    { value: true,  label: 'Sì, li ho tutti' },
                    { value: false, label: 'No, sono wishlist' },
                  ].map((o) => (
                    <button
                      key={String(o.value)}
                      onClick={() => setImportOwned(o.value)}
                      className={`font-sans text-xs uppercase tracking-[0.14em] border px-4 py-2 transition-colors ${
                        importOwned === o.value
                          ? 'bg-ink text-paper border-ink'
                          : 'bg-transparent text-ink border-ink hover:border-accent hover:text-accent'
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleImport}
                className="font-sans text-xs uppercase tracking-[0.18em] bg-ink text-paper hover:bg-accent transition-colors px-8 py-3 cursor-pointer"
              >
                Importa {books.length} libri
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Step 3: Importing ── */}
      {step === 'importing' && (
        <div>
          <p className="font-display italic text-2xl text-muted mb-8">
            Importazione in corso…
          </p>
          <div className="mb-6">
            {/* Progress bar */}
            <div className="h-1 bg-rule w-full mb-3">
              <div
                className="h-1 bg-ink transition-all duration-150"
                style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
            <p className="font-sans text-sm text-ink">
              Importati <span className="font-bold">{progress.done}</span>/{progress.total}
              {progress.skipped > 0 && (
                <span className="text-muted ml-3">({progress.skipped} già presenti)</span>
              )}
            </p>
            {progress.skipped > 0 && (progress.skippedByIsbn > 0 || progress.skippedByTitle > 0) && (
              <p className="font-sans text-[11px] text-muted mt-1">
                {[
                  progress.skippedByIsbn > 0 && `${progress.skippedByIsbn} per ISBN`,
                  progress.skippedByTitle > 0 && `${progress.skippedByTitle} per titolo`,
                ].filter(Boolean).join(', ')}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2 max-w-lg">
            <div className="h-2.5 bg-rule animate-pulse w-full" />
            <div className="h-2.5 bg-rule animate-pulse w-5/6" />
            <div className="h-2.5 bg-rule animate-pulse w-4/6" />
          </div>
        </div>
      )}

      {/* ── Step 4: Done ── */}
      {step === 'done' && (
        <div>
          <p className="font-display italic text-3xl text-ink mb-2">
            Importazione completata
          </p>
          <hr className="border-rule my-6" />

          <div className="flex flex-col gap-2 mb-8">
            <p className="font-sans text-sm text-ink">
              <span className="font-bold text-[#2D6A4F]">{progress.total - progress.skipped - progress.errors.length}</span>
              {' '}aggiunti
            </p>
            {progress.skipped > 0 && (
              <p className="font-sans text-sm text-muted">
                <span className="font-bold">{progress.skipped}</span> già presenti, saltati
                {(progress.skippedByIsbn > 0 || progress.skippedByTitle > 0) && (
                  <span className="text-[11px] ml-2">
                    ({[
                      progress.skippedByIsbn > 0 && `${progress.skippedByIsbn} per ISBN`,
                      progress.skippedByTitle > 0 && `${progress.skippedByTitle} per titolo`,
                    ].filter(Boolean).join(', ')})
                  </span>
                )}
              </p>
            )}
            {progress.errors.length > 0 && (
              <div>
                <p className="font-sans text-sm text-accent mb-2">
                  <span className="font-bold">{progress.errors.length}</span> errori
                </p>
                <div className="border border-rule p-4 max-h-40 overflow-y-auto">
                  {progress.errors.map((err, i) => (
                    <p key={i} className="font-sans text-[11px] text-muted leading-relaxed">{err}</p>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-6">
            <Link
              to="/biblioteca"
              className="font-sans text-xs uppercase tracking-[0.18em] bg-ink text-paper hover:bg-accent transition-colors px-8 py-3"
            >
              Vai alla biblioteca →
            </Link>
            <button
              onClick={() => { setStep('upload'); setBooks([]); setFormat(null) }}
              className="font-sans text-[10px] uppercase tracking-[0.14em] text-muted hover:text-ink border-b border-transparent hover:border-ink transition-colors"
            >
              Nuova importazione
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
