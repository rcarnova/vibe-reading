import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { generateNobelUtetCover } from '../utils/generateNobelUtetCover'

function NobelSpine({ book }) {
  const placeholder = generateNobelUtetCover(book.author, book.year)

  return (
    <Link to={`/book/${book.id}`} className="group flex flex-col">
      <div
        className="w-3/4 aspect-[2/3] bg-badge overflow-hidden"
        style={{ boxShadow: '2px 3px 10px rgba(0,0,0,0.12)' }}
      >
        <img
          src={placeholder}
          alt={`Premio Nobel ${book.year} — ${book.author}`}
          className="w-full h-full object-cover"
        />
      </div>

      <div className="pt-3 flex flex-col gap-1">
        <span
          className="font-sans text-[9px] uppercase tracking-[0.18em] px-1.5 py-px self-start"
          style={{ border: '1px solid #701F2E', color: '#701F2E' }}
        >
          {book.year}
        </span>
        <h3 className="font-display font-bold text-[0.92rem] leading-snug text-ink line-clamp-2 group-hover:text-[#701F2E] transition-colors duration-150">
          {book.author}
        </h3>
        {book.notes && (
          <p className="font-sans text-[10px] italic text-muted leading-snug mt-0.5">
            {book.notes}
          </p>
        )}
      </div>
    </Link>
  )
}

export default function NobelUtet() {
  const [books, setBooks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchCollection() {
      setLoading(true)
      const { data, error } = await supabase
        .from('books')
        .select('*')
        .contains('tags', ['Nobel UTET'])
        .order('year', { ascending: true })
      if (error) {
        console.error('Failed to fetch Nobel UTET collection:', error.message)
        setBooks([])
      } else {
        setBooks(data ?? [])
      }
      setLoading(false)
    }
    fetchCollection()
  }, [])

  const years = new Set(books.map((b) => b.year)).size

  return (
    <main className="max-w-[1200px] mx-auto px-6 py-12">
      <header className="mb-10">
        <h1 className="font-display italic font-black text-5xl sm:text-6xl text-ink leading-none mb-3">
          Collana Nobel UTET
        </h1>
        <p className="font-sans font-light text-sm tracking-wide text-muted">
          {loading
            ? '…'
            : `${books.length} volumi · ${years} premi Nobel per la letteratura`}
        </p>
        <hr className="mt-6 border-rule" />
      </header>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-12">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-3">
              <div className="aspect-[2/3] bg-rule animate-pulse w-3/4" />
              <div className="h-2.5 bg-rule animate-pulse w-3/4" />
              <div className="h-2.5 bg-rule animate-pulse w-1/2" />
            </div>
          ))}
        </div>
      ) : books.length === 0 ? (
        <div className="py-28 text-center">
          <p className="font-display italic text-xl text-muted">
            Nessun volume ancora in questa collana.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-12">
          {books.map((book) => (
            <NobelSpine key={book.id} book={book} />
          ))}
        </div>
      )}
    </main>
  )
}
