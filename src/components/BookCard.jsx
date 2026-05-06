import { useState } from 'react'
import { Link } from 'react-router-dom'
import StarRating from './StarRating'
import { useCoverImage } from '../hooks/useCoverImage'
import { parseTitle } from '../utils/parseTitle'
import { generateCoverPlaceholder } from '../utils/generateCoverPlaceholder'

const statusBadge = {
  read:     'border-[#2D6A4F] text-[#2D6A4F]',
  reading:  'border-[#1D4E89] text-[#1D4E89]',
  'to-read':'border-muted text-muted',
}

const statusLabels = {
  read:     'Letto',
  reading:  'In lettura',
  'to-read':'Da leggere',
}

function BookCover({ book, loading, url }) {
  const placeholder = generateCoverPlaceholder(book.title, book.author)
  const imgSrc = loading ? null : (url || placeholder)

  return (
    <div
      className="relative bg-badge aspect-[2/3] overflow-hidden"
      style={{ boxShadow: '2px 3px 10px rgba(0,0,0,0.12)' }}
    >
      {loading && (
        <div className="absolute inset-0 animate-pulse bg-rule" />
      )}
      {!loading && (
        <img
          src={imgSrc}
          alt={`Cover of ${book.title}`}
          className="w-full h-full object-cover transition-opacity duration-300"
          onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = placeholder }}
        />
      )}
    </div>
  )
}

export default function BookCard({ book }) {
  const { loading, url, description, aiGenerated } = useCoverImage(book)
  const { title, series, volume } = parseTitle(book.title)

  const synopsis = description
    ? (description.length > 300 ? description.slice(0, 300) + '…' : description)
    : null

  return (
    <Link to={`/book/${book.id}`} className="group flex flex-col">
      <div className="w-3/4">
        <BookCover book={book} loading={loading} url={url} />
      </div>

      <div className="pt-3 flex flex-col gap-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`font-sans text-[9px] uppercase tracking-[0.18em] border px-1.5 py-px ${statusBadge[book.status]}`}>
            {statusLabels[book.status]}
          </span>
          {book.owned === false && book.status === 'to-read' && (
            <span className="font-sans text-[10px] border px-1.5 py-px" style={{ borderColor: '#6B6B6B', color: '#6B6B6B' }}>
              Wishlist
            </span>
          )}
        </div>

        <h3 className="font-display font-bold text-[0.92rem] leading-snug text-ink line-clamp-2 group-hover:text-accent transition-colors duration-150">
          {title}
        </h3>

        {series && (
          <p className="font-sans text-[9px] italic text-muted -mt-0.5">
            {series} · Vol. {volume}
          </p>
        )}

        <p className="font-sans text-[10px] uppercase tracking-[0.14em] text-muted">
          {book.author}
        </p>

        {loading ? (
          <div className="flex flex-col gap-1.5 mt-0.5">
            <div className="h-2 bg-rule animate-pulse w-full" />
            <div className="h-2 bg-rule animate-pulse w-5/6" />
            <div className="h-2 bg-rule animate-pulse w-4/6" />
          </div>
        ) : synopsis ? (
          <div>
            <p className="font-serif text-[0.78rem] leading-relaxed text-muted line-clamp-3">
              {synopsis}
            </p>
            {aiGenerated && (
              <span className="font-sans text-[9px] italic text-muted mt-1 inline-block">
                ✦ Generata dall'AI
              </span>
            )}
          </div>
        ) : null}

        {book.rating > 0 && (
          <div className="mt-0.5">
            <StarRating rating={book.rating} />
          </div>
        )}
      </div>
    </Link>
  )
}
