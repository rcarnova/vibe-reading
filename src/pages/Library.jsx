import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LayoutGrid, List, Search, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import BookCard from '../components/BookCard'
import BookListRow from '../components/BookListRow'
import FilterBar from '../components/FilterBar'
import { ClassifyButton } from '../components/ClassifyButton'

// ─── persistence helpers ──────────────────────────────────────────────────────

function useViewMode() {
  const [view, setView] = useState(
    () => localStorage.getItem('library-view') || 'grid'
  )
  function set(next) {
    localStorage.setItem('library-view', next)
    setView(next)
  }
  return [view, set]
}

function useSort() {
  const [field, setField] = useState(
    () => localStorage.getItem('library-sort-field') || 'title'
  )
  const [dir, setDir] = useState(
    () => localStorage.getItem('library-sort-dir') || 'asc'
  )
  function setSort(nextField) {
    if (nextField === field) {
      const nextDir = dir === 'asc' ? 'desc' : 'asc'
      localStorage.setItem('library-sort-dir', nextDir)
      setDir(nextDir)
    } else {
      localStorage.setItem('library-sort-field', nextField)
      localStorage.setItem('library-sort-dir', 'asc')
      setField(nextField)
      setDir('asc')
    }
  }
  return [field, dir, setSort]
}

// ─── sort logic ───────────────────────────────────────────────────────────────

const SORT_OPTIONS = [
  { value: 'title',  label: 'Titolo' },
  { value: 'author', label: 'Autore' },
  { value: 'year',   label: 'Anno' },
  { value: 'rating', label: 'Voto' },
]

function sortBooks(list, field, dir) {
  const mul = dir === 'asc' ? 1 : -1
  return [...list].sort((a, b) => {
    switch (field) {
      case 'title': {
        const at = a.title ?? ''; const bt = b.title ?? ''
        return mul * at.localeCompare(bt, undefined, { sensitivity: 'base' })
      }
      case 'author': {
        const aa = a.author ?? ''; const ba = b.author ?? ''
        return mul * aa.localeCompare(ba, undefined, { sensitivity: 'base' })
      }
      case 'year': {
        const ay = (a.year != null && a.year > 0) ? a.year : (dir === 'asc' ? Infinity : -Infinity)
        const by = (b.year != null && b.year > 0) ? b.year : (dir === 'asc' ? Infinity : -Infinity)
        return mul * (ay - by)
      }
      case 'rating': {
        const ar = (a.rating != null && a.rating > 0) ? a.rating : (dir === 'asc' ? Infinity : -Infinity)
        const br = (b.rating != null && b.rating > 0) ? b.rating : (dir === 'asc' ? Infinity : -Infinity)
        return mul * (ar - br)
      }
      default:
        return (a.title ?? '').localeCompare(b.title ?? '', undefined, { sensitivity: 'base' })
    }
  })
}

// ─── pagination ───────────────────────────────────────────────────────────────

const BOOKS_PER_PAGE = 48

function pageRange(current, total) {
  // Returns an array of page numbers and '…' separators
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const delta = 2
  const left  = Math.max(2, current - delta)
  const right = Math.min(total - 1, current + delta)
  const pages = [1]
  if (left > 2) pages.push('…')
  for (let i = left; i <= right; i++) pages.push(i)
  if (right < total - 1) pages.push('…')
  pages.push(total)
  return pages
}

// ─── component ────────────────────────────────────────────────────────────────

export default function Library() {
  const [allBooks, setAllBooks] = useState([])
  const [loadingBooks, setLoadingBooks] = useState(true)
  const [filters, setFilters] = useState({ genre: '', status: '', rating: '', ownership: '' })
  const [searchType, setSearchType] = useState('all') // 'all' | 'title' | 'author' | 'genre'
  const [view, setView] = useViewMode()
  const [sortField, sortDir, setSort] = useSort()

  // Both ?q= and ?page= live in the URL
  const [searchParams, setSearchParams] = useSearchParams()
  const query       = searchParams.get('q')    || ''
  const currentPage = Math.max(1, parseInt(searchParams.get('page') || '1', 10))

  function setQuery(value) {
    const params = new URLSearchParams(searchParams)
    if (value) { params.set('q', value) } else { params.delete('q') }
    params.delete('page') // reset to page 1 on new search
    setSearchParams(params, { replace: true })
  }

  function setPage(n) {
    const params = new URLSearchParams(searchParams)
    if (n === 1) { params.delete('page') } else { params.set('page', String(n)) }
    setSearchParams(params, { replace: false })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleSearchTypeChange(type) {
    setSearchType(type)
    const params = new URLSearchParams(searchParams)
    params.delete('page')
    setSearchParams(params, { replace: true })
  }

  // Reset to page 1 when filters or sort change
  useEffect(() => {
    const params = new URLSearchParams(searchParams)
    if (params.has('page')) {
      params.delete('page')
      setSearchParams(params, { replace: true })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, sortField, sortDir, searchType])

  useEffect(() => {
    async function fetchBooks() {
      setLoadingBooks(true)
      const { data, error } = await supabase
        .from('books')
        .select('*')
      if (error) {
        console.error('Failed to fetch books:', error.message)
        setAllBooks([])
      } else {
        // The Nobel UTET collection has its own dedicated page — keep it out
        // of the general library view.
        setAllBooks((data ?? []).filter((b) => !b.tags?.includes('Nobel UTET')))
      }
      setLoadingBooks(false)
    }
    fetchBooks()
  }, [])

  // Pipeline: search → filter → sort
  const q = query.trim().toLowerCase()

  function filterBySearch(book) {
    if (!q) return true
    try {
      switch (searchType) {
        case 'title':  return (book.title?.toLowerCase()  ?? '').includes(q)
        case 'author': return (book.author?.toLowerCase() ?? '').includes(q)
        case 'genre':  return (book.genre?.toLowerCase()  ?? '').includes(q)
        case 'all':
        default:
          return (
            (book.title?.toLowerCase()  ?? '').includes(q) ||
            (book.author?.toLowerCase() ?? '').includes(q) ||
            (book.genre?.toLowerCase()  ?? '').includes(q)
          )
      }
    } catch (err) {
      console.error('Search filter error:', err)
      return true
    }
  }

  const searched = q ? allBooks.filter(filterBySearch) : allBooks

  const filtered = searched.filter((b) => {
    if (filters.genre && b.genre !== filters.genre) return false
    if (filters.status && b.status !== filters.status) return false
    if (filters.rating && b.rating < Number(filters.rating)) return false
    if (filters.ownership === 'owned' && b.owned !== true) return false
    if (filters.ownership === 'wishlist' && !(b.owned === false && b.status === 'to-read')) return false
    return true
  })

  const sorted = sortBooks(filtered, sortField, sortDir)

  // Pagination
  const totalPages   = Math.max(1, Math.ceil(sorted.length / BOOKS_PER_PAGE))
  const safePage     = Math.min(currentPage, totalPages)
  const paginated    = sorted.slice((safePage - 1) * BOOKS_PER_PAGE, safePage * BOOKS_PER_PAGE)

  const isFiltered = q || filters.genre || filters.status || filters.rating || filters.ownership

  const selectClass = [
    'bg-transparent appearance-none cursor-pointer',
    'font-sans text-xs uppercase tracking-[0.12em] text-ink',
    'border-0 border-b border-ink',
    'py-1 pr-6 pl-0',
    'focus:outline-none focus:border-accent transition-colors',
  ].join(' ')

  const btnBase = 'font-sans text-xs min-w-[32px] h-8 px-2.5 border border-ink transition-colors'

  return (
    <main className="max-w-[1200px] mx-auto px-6 py-12">
      <header className="mb-10">
        <h1 className="font-display italic font-black text-5xl sm:text-6xl text-ink leading-none mb-3">
          Biblioteca
        </h1>
        <p className="font-sans font-light text-sm tracking-wide text-muted">
          {loadingBooks ? '…' : `${allBooks.length} volumi in collezione`}
        </p>
        <hr className="mt-6 border-rule" />
      </header>

      {/* Search bar */}
      <div className="mb-6 group/search">
        <div className="relative flex items-center">
          <Search
            size={15}
            className="absolute left-0 text-muted pointer-events-none transition-colors group-focus-within/search:text-accent"
            strokeWidth={1.75}
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca per titolo, autore, genere..."
            className={[
              'w-full bg-transparent font-sans text-sm text-ink placeholder:text-muted placeholder:italic',
              'pl-6 pr-8 py-2',
              'border-0 border-b-2 border-ink outline-none',
              'focus:border-accent transition-colors duration-150',
            ].join(' ')}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label="Cancella ricerca"
              className="absolute right-0 text-muted hover:text-ink transition-colors"
            >
              <X size={15} strokeWidth={1.75} />
            </button>
          )}
        </div>
        {/* Search type + result count */}
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-3">
            {[
              { value: 'all',    label: 'Tutti' },
              { value: 'title',  label: 'Titolo' },
              { value: 'author', label: 'Autore' },
              { value: 'genre',  label: 'Genere' },
            ].map((o) => (
              <button
                key={o.value}
                onClick={() => handleSearchTypeChange(o.value)}
                className={`font-sans text-[9px] uppercase tracking-[0.16em] transition-colors pb-0.5 ${
                  searchType === o.value
                    ? 'text-ink border-b border-ink'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="font-sans text-xs text-muted">
            {loadingBooks ? 'Caricamento…' : `${sorted.length} ${sorted.length === 1 ? 'libro' : 'libri'}`}
          </p>
        </div>
      </div>

      {/* FilterBar + sort + view toggle */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
        <FilterBar books={allBooks} filters={filters} onChange={setFilters} />

        <div className="flex items-end gap-5 shrink-0">
          {/* Sort control */}
          <div className="flex items-end gap-2">
            <span className="font-sans text-[9px] uppercase tracking-[0.18em] text-muted pb-1.5">
              Ordina per
            </span>
            <div className="relative">
              <select
                value={sortField}
                onChange={(e) => setSort(e.target.value)}
                className={selectClass}
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <svg
                className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink"
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            <button
              onClick={() => setSort(sortField)}
              aria-label={`Inverti ordinamento (attuale: ${sortDir === 'asc' ? 'crescente' : 'decrescente'})`}
              className="font-sans text-sm text-ink hover:text-accent transition-colors pb-1 border-b border-ink leading-none"
            >
              {sortDir === 'asc' ? '↑' : '↓'}
            </button>
          </div>

          {/* View toggle */}
          <div className="flex items-center gap-1 pb-1">
            <button onClick={() => setView('grid')} aria-label="Vista griglia" className="p-1 transition-colors">
              <LayoutGrid size={17} className={view === 'grid' ? 'text-ink' : 'text-rule'} strokeWidth={view === 'grid' ? 2.5 : 1.5} />
            </button>
            <button onClick={() => setView('list')} aria-label="Vista lista" className="p-1 transition-colors">
              <List size={17} className={view === 'list' ? 'text-ink' : 'text-rule'} strokeWidth={view === 'list' ? 2.5 : 1.5} />
            </button>
          </div>
        </div>
      </div>

      {loadingBooks ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-12">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-3">
              <div className="aspect-[2/3] bg-rule animate-pulse w-3/4" />
              <div className="h-2.5 bg-rule animate-pulse w-3/4" />
              <div className="h-2.5 bg-rule animate-pulse w-1/2" />
            </div>
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="py-28 text-center">
          <p className="font-display italic text-xl text-muted">
            {isFiltered ? 'Nessun libro corrisponde alla ricerca.' : 'Nessun libro corrisponde ai filtri.'}
          </p>
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-12">
          {paginated.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </div>
      ) : (
        <div className="border-t border-rule">
          {paginated.map((book) => (
            <BookListRow key={book.id} book={book} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loadingBooks && totalPages > 1 && (
        <div className="mt-16 flex flex-col items-center gap-5">
          <p className="font-sans text-[11px] uppercase tracking-[0.16em] text-muted">
            Pagina {safePage} di {totalPages} — {sorted.length} libri
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(safePage - 1)}
              disabled={safePage === 1}
              className={`${btnBase} hover:bg-ink hover:text-paper disabled:opacity-30 disabled:cursor-not-allowed`}
            >
              ←
            </button>

            {pageRange(safePage, totalPages).map((p, i) =>
              p === '…' ? (
                <span key={`ellipsis-${i}`} className="font-sans text-xs text-muted px-1">…</span>
              ) : (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`${btnBase} ${
                    p === safePage
                      ? 'bg-ink text-paper'
                      : 'hover:bg-ink hover:text-paper'
                  }`}
                >
                  {p}
                </button>
              )
            )}

            <button
              onClick={() => setPage(safePage + 1)}
              disabled={safePage === totalPages}
              className={`${btnBase} hover:bg-ink hover:text-paper disabled:opacity-30 disabled:cursor-not-allowed`}
            >
              →
            </button>
          </div>
        </div>
      )}

      <ClassifyButton />
    </main>
  )
}
