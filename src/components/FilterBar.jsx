const statusOptions = [
  { value: '', label: 'Tutti gli stati' },
  { value: 'read', label: 'Letto' },
  { value: 'reading', label: 'In lettura' },
  { value: 'to-read', label: 'Da leggere' },
]

const ownershipOptions = [
  { value: '', label: 'Tutti' },
  { value: 'owned', label: 'Posseduti' },
  { value: 'wishlist', label: 'Wishlist' },
]

const ratingOptions = [
  { value: '', label: 'Qualsiasi voto' },
  { value: '5', label: '5 stelle' },
  { value: '4', label: '4+ stelle' },
  { value: '3', label: '3+ stelle' },
]

export default function FilterBar({ books, filters, onChange }) {
  const genres = [...new Set(books.map((b) => b.genre))].filter(Boolean).sort()

  const selectClass = [
    'bg-transparent appearance-none cursor-pointer',
    'font-sans text-xs uppercase tracking-[0.12em]',
    'text-ink',
    'border-0 border-b border-ink',
    'py-1 pr-6 pl-0',
    'focus:outline-none focus:border-accent',
    'transition-colors',
  ].join(' ')

  return (
    <div className="flex flex-wrap gap-6 items-end">
      <div className="relative">
        <select
          value={filters.genre}
          onChange={(e) => onChange({ ...filters, genre: e.target.value })}
          className={selectClass}
        >
          <option value="">Tutti i generi</option>
          {genres.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        <ChevronIcon />
      </div>

      <div className="relative">
        <select
          value={filters.status}
          onChange={(e) => onChange({ ...filters, status: e.target.value })}
          className={selectClass}
        >
          {statusOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <ChevronIcon />
      </div>

      <div className="relative">
        <select
          value={filters.rating}
          onChange={(e) => onChange({ ...filters, rating: e.target.value })}
          className={selectClass}
        >
          {ratingOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <ChevronIcon />
      </div>

      <div className="relative">
        <select
          value={filters.ownership}
          onChange={(e) => onChange({ ...filters, ownership: e.target.value })}
          className={selectClass}
        >
          {ownershipOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <ChevronIcon />
      </div>

      {(filters.genre || filters.status || filters.rating || filters.ownership) && (
        <button
          onClick={() => onChange({ genre: '', status: '', rating: '', ownership: '' })}
          className="font-sans text-xs uppercase tracking-[0.12em] text-muted hover:text-accent transition-colors pb-1 border-b border-transparent hover:border-accent"
        >
          Cancella filtri
        </button>
      )}
    </div>
  )
}

function ChevronIcon() {
  return (
    <svg
      className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  )
}
