import { Link } from 'react-router-dom'
import StarRating from './StarRating'

const statusBadge = {
  read:     'border-[#2D6A4F] text-[#2D6A4F]',
  reading:  'border-[#1D4E89] text-[#1D4E89]',
  'to-read':'border-muted text-muted',
  'in-consultazione': 'border-accent text-accent',
}

const statusLabels = {
  read:     'Letto',
  reading:  'In lettura',
  'to-read':'Da leggere',
  'in-consultazione': 'In consultazione',
}

export default function BookListRow({ book }) {
  return (
    <Link
      to={`/book/${book.id}`}
      className="group flex items-baseline justify-between gap-6 py-4 border-b border-rule hover:bg-[#F5F4EF] px-2 -mx-2 transition-colors duration-150"
    >
      {/* Left: title + author */}
      <div className="flex items-baseline gap-3 min-w-0 flex-1">
        <span className="font-display font-bold text-lg leading-snug text-ink group-hover:text-accent transition-colors duration-150 shrink-0">
          {book.year > 0 ? book.year : '—'}
        </span>
        <div className="min-w-0">
          <span className="font-display font-bold text-lg leading-snug text-ink group-hover:text-accent transition-colors duration-150 mr-2">
            {book.title}
          </span>
          <span className="font-sans text-[10px] uppercase tracking-[0.14em] text-muted whitespace-nowrap">
            {book.author}
          </span>
        </div>
      </div>

      {/* Right: genre + status + rating */}
      <div className="flex items-center gap-4 shrink-0">
        {book.genre && (
          <span className="hidden sm:inline font-sans text-[9px] uppercase tracking-[0.14em] text-muted">
            {book.genre}
          </span>
        )}
        <span className={`font-sans text-[9px] uppercase tracking-[0.18em] border px-1.5 py-px ${statusBadge[book.status]}`}>
          {statusLabels[book.status]}
        </span>
        {book.rating > 0 && <StarRating rating={book.rating} />}
      </div>
    </Link>
  )
}
