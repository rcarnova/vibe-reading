import { useState, useEffect } from 'react'
import { useParams, Link, Navigate, useNavigate } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { supabase } from '../lib/supabase'
import StarRating from '../components/StarRating'
import { useCoverImage } from '../hooks/useCoverImage'
import { parseTitle } from '../utils/parseTitle'
import { useAuth } from '../context/AuthContext'
import { generateCoverPlaceholder } from '../utils/generateCoverPlaceholder'

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

const GENRES = [
  'Narrativa italiana', 'Narrativa straniera', 'Saggistica', 'Psicologia',
  'Leadership e management', 'Vendita e business', 'Creatività', 'Filosofia',
  'Storia', 'Biografie e memorie', 'Thriller e noir', 'Fantascienza e distopia',
  'Poesia e teatro', 'Comunicazione e media', 'Crescita personale',
  'Scienza e tecnologia', 'Arte e design',
]

const STATUS_OPTIONS = [
  { value: 'to-read', label: 'Da leggere' },
  { value: 'reading', label: 'In lettura' },
  { value: 'read',    label: 'Letto' },
  { value: 'in-consultazione', label: 'In consultazione' },
]

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

// ─── Edit modal ───────────────────────────────────────────────────────────────

function EditModal({ book, onClose, onSaved, onDeleted }) {
  const [form, setForm] = useState({
    title:          book.title ?? '',
    author:         book.author ?? '',
    year:           book.year > 0 ? String(book.year) : '',
    genre:          book.genre ?? '',
    status:         book.status ?? 'to-read',
    rating:         book.rating ?? 0,
    review:         book.review ?? '',
    favorite_quote: book.favorite_quote ?? '',
    notes:          book.notes ?? '',
    cover_url:      book.cover_url ?? '',
    owned:          book.owned !== false, // default true if null/undefined
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const inputClass = [
    'w-full bg-transparent font-sans text-sm text-ink placeholder:text-muted',
    'border-0 border-b-2 border-ink py-2 outline-none',
    'focus:border-accent transition-colors duration-150',
  ].join(' ')

  const selectClass = [
    'w-full bg-transparent appearance-none cursor-pointer',
    'font-sans text-sm text-ink',
    'border-0 border-b-2 border-ink',
    'py-2 pr-6 pl-0',
    'focus:outline-none focus:border-accent transition-colors',
  ].join(' ')

  async function handleSave() {
    if (!form.title.trim()) return
    setSaving(true)
    setError(null)
    const { error } = await supabase
      .from('books')
      .update({
        title:          form.title.trim(),
        author:         form.author.trim() || null,
        year:           form.year ? parseInt(form.year) : null,
        genre:          form.genre || null,
        status:         form.status,
        rating:         form.status === 'read' && form.rating > 0 ? form.rating : null,
        review:         form.review.trim() || null,
        favorite_quote: form.favorite_quote.trim() || null,
        cover_url:      form.cover_url.trim() || null,
        owned:          form.owned,
      })
      .eq('id', book.id)
    setSaving(false)
    if (error) {
      setError('Errore durante il salvataggio. Riprova.')
    } else {
      onSaved()
    }
  }

  async function handleDelete() {
    setDeleting(true)
    setDeleteError(null)
    const { error } = await supabase.from('books').delete().eq('id', book.id)
    setDeleting(false)
    if (error) {
      setDeleteError('Errore durante l\'eliminazione. Riprova.')
    } else {
      onDeleted()
    }
  }

  // Close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="bg-paper w-full overflow-y-auto"
        style={{ maxWidth: '600px', maxHeight: '90vh' }}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-8 pt-8 pb-4 border-b border-rule">
          <h2 className="font-display italic font-black text-2xl text-ink leading-tight">
            Modifica libro
          </h2>
          <button
            onClick={onClose}
            aria-label="Chiudi"
            className="text-muted hover:text-ink transition-colors p-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <div className="px-8 py-6 flex flex-col gap-5">
          {/* Title */}
          <div>
            <label className="block font-sans text-[9px] uppercase tracking-[0.18em] text-muted mb-1">
              Titolo <span className="text-accent">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              className={inputClass}
            />
          </div>

          {/* Author */}
          <div>
            <label className="block font-sans text-[9px] uppercase tracking-[0.18em] text-muted mb-1">
              Autore
            </label>
            <input
              type="text"
              value={form.author}
              onChange={(e) => set('author', e.target.value)}
              className={inputClass}
            />
          </div>

          {/* Year + Genre */}
          <div className="flex gap-6">
            <div className="flex-1">
              <label className="block font-sans text-[9px] uppercase tracking-[0.18em] text-muted mb-1">
                Anno
              </label>
              <input
                type="number"
                value={form.year}
                onChange={(e) => set('year', e.target.value)}
                className={inputClass}
                placeholder="es. 2024"
              />
            </div>
            <div className="flex-1">
              <label className="block font-sans text-[9px] uppercase tracking-[0.18em] text-muted mb-1">
                Genere
              </label>
              <div className="relative">
                <select
                  value={form.genre}
                  onChange={(e) => set('genre', e.target.value)}
                  className={selectClass}
                >
                  <option value="">— seleziona —</option>
                  {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
                <svg className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block font-sans text-[9px] uppercase tracking-[0.18em] text-muted mb-2">
              Stato
            </label>
            <div className="flex gap-2">
              {STATUS_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => set('status', o.value)}
                  className={[
                    'font-sans text-xs tracking-wide px-3 py-1.5 border transition-colors',
                    form.status === o.value
                      ? 'bg-ink text-paper border-ink'
                      : 'bg-paper text-ink border-ink hover:bg-badge',
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
              <label className="block font-sans text-[9px] uppercase tracking-[0.18em] text-muted mb-2">
                Voto
              </label>
              <StarPicker value={form.rating} onChange={(v) => set('rating', v)} />
            </div>
          )}

          {/* Owned toggle */}
          <div>
            <label className="block font-sans text-[9px] uppercase tracking-[0.18em] text-muted mb-2">
              Possiedi questo libro?
            </label>
            <div className="flex gap-2">
              {[{ value: true, label: "Sì, ce l'ho" }, { value: false, label: 'No, wishlist' }].map((o) => (
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

          {/* Review */}
          <div>
            <label className="block font-sans text-[9px] uppercase tracking-[0.18em] text-muted mb-1">
              Recensione (opzionale)
            </label>
            <textarea
              value={form.review}
              onChange={(e) => set('review', e.target.value)}
              rows={3}
              placeholder="Le tue impressioni sul libro..."
              className={[inputClass, 'resize-none'].join(' ')}
            />
          </div>

          {/* Favorite quote */}
          <div>
            <label className="block font-sans text-[9px] uppercase tracking-[0.18em] text-muted mb-1">
              Citazione preferita (opzionale)
            </label>
            <textarea
              value={form.favorite_quote}
              onChange={(e) => set('favorite_quote', e.target.value)}
              rows={2}
              placeholder="Una frase che ti ha colpito..."
              className={[inputClass, 'resize-none'].join(' ')}
            />
          </div>

          {/* Cover URL */}
          <div>
            <label className="block font-sans text-[9px] uppercase tracking-[0.18em] text-muted mb-1">
              URL copertina (opzionale)
            </label>
            <input
              type="url"
              value={form.cover_url}
              onChange={(e) => set('cover_url', e.target.value)}
              className={inputClass}
              placeholder="https://..."
            />
          </div>

          {error && (
            <p className="font-sans text-xs text-accent">{error}</p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-4 pt-2 border-t border-rule mt-2">
            <button
              onClick={handleSave}
              disabled={!form.title.trim() || saving}
              className={[
                'font-sans text-xs uppercase tracking-[0.15em] px-8 py-3 transition-colors',
                form.title.trim() && !saving
                  ? 'bg-ink text-paper hover:bg-accent cursor-pointer'
                  : 'bg-rule text-muted cursor-not-allowed',
              ].join(' ')}
            >
              {saving ? 'Salvataggio…' : 'Salva modifiche'}
            </button>
            <button
              onClick={onClose}
              className="font-sans text-xs uppercase tracking-[0.15em] text-muted hover:text-ink transition-colors"
            >
              Annulla
            </button>
          </div>

          {/* Danger zone */}
          <div className="pt-6 mt-2 border-t border-rule">
            {!confirmingDelete ? (
              <button
                onClick={() => setConfirmingDelete(true)}
                className="font-sans text-xs uppercase tracking-[0.15em] px-8 py-3 border transition-colors"
                style={{ borderColor: '#C41E3A', color: '#C41E3A' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#C41E3A'; e.currentTarget.style.color = '#FFF' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#C41E3A' }}
              >
                Elimina libro
              </button>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="font-sans text-sm text-ink">
                  Sei sicuro di volerlo eliminare?
                </p>
                <div className="flex items-center gap-4">
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="font-sans text-xs uppercase tracking-[0.15em] px-8 py-3 text-paper transition-colors disabled:opacity-60"
                    style={{ background: '#C41E3A' }}
                  >
                    {deleting ? 'Eliminazione…' : 'Sì, elimina'}
                  </button>
                  <button
                    onClick={() => setConfirmingDelete(false)}
                    disabled={deleting}
                    className="font-sans text-xs uppercase tracking-[0.15em] text-muted hover:text-ink transition-colors"
                  >
                    Annulla
                  </button>
                </div>
                {deleteError && (
                  <p className="font-sans text-xs text-accent">{deleteError}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Cover ────────────────────────────────────────────────────────────────────

function DetailCover({ loading, url, book }) {
  const placeholder = generateCoverPlaceholder(book.title, book.author)

  return (
    <div
      className="w-full aspect-[2/3] bg-badge overflow-hidden"
      style={{ boxShadow: '4px 6px 20px rgba(0,0,0,0.15)' }}
    >
      {loading ? (
        <div className="w-full h-full animate-pulse bg-rule" />
      ) : (
        <img
          src={url || placeholder}
          alt={`Cover of ${book.title}`}
          className="w-full h-full object-cover"
          onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = placeholder }}
        />
      )}
    </div>
  )
}

// ─── Next step card ───────────────────────────────────────────────────────────

function NextStepCard({ suggestion, loading }) {

  if (loading) {
    return (
      <section className="mt-8">
        <hr className="border-rule mb-5" />
        <h2 className="font-sans text-[9px] uppercase tracking-[0.18em] text-muted mb-4">
          Prossimo passo
        </h2>
        <div className="flex gap-4 items-start">
          <div className="flex-shrink-0 w-[60px] aspect-[2/3] bg-rule animate-pulse" />
          <div className="flex flex-col gap-2 flex-1 pt-1">
            <div className="h-3 bg-rule animate-pulse w-3/4" />
            <div className="h-2.5 bg-rule animate-pulse w-1/3" />
            <div className="h-2.5 bg-rule animate-pulse w-full mt-1" />
            <div className="h-2.5 bg-rule animate-pulse w-4/5" />
          </div>
        </div>
      </section>
    )
  }

  if (!suggestion) return null

  const { title, author, reason, id, cover_url } = suggestion
  const placeholder = generateCoverPlaceholder(title, author)

  return (
    <section className="mt-8">
      <hr className="border-rule mb-5" />
      <h2 className="font-sans text-[9px] uppercase tracking-[0.18em] text-muted mb-4">
        Prossimo passo
      </h2>
      <Link to={`/book/${id}`} className="flex gap-4 items-start group">
        <div className="flex-shrink-0 w-[60px] aspect-[2/3] bg-badge overflow-hidden">
          <img
            src={cover_url || placeholder}
            alt={title}
            className="w-full h-full object-cover"
            onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = placeholder }}
          />
        </div>
        <div className="flex flex-col gap-1 min-w-0">
          <p className="font-display font-semibold text-sm leading-snug text-ink group-hover:text-accent transition-colors">
            {title}
          </p>
          {author && (
            <p className="font-sans text-[10px] uppercase tracking-[0.14em] text-muted">
              {author}
            </p>
          )}
          <p className="font-serif text-xs italic leading-relaxed text-muted mt-0.5">
            {reason}
          </p>
          <span className="font-sans text-[10px] uppercase tracking-[0.14em] text-accent mt-1">
            Vai al libro →
          </span>
        </div>
      </Link>
    </section>
  )
}

// ─── Similar books ─────────────────────────────────────────────────────────────

function SimilarBooksSection({ books, loading, user, onRegenerate }) {
  if (!loading && !books) return null

  return (
    <section className="mt-8">
      <hr className="border-rule mb-5" />
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-sans text-[9px] uppercase tracking-[0.18em] text-muted">
          Libri vicini
        </h2>
        {user && !loading && (
          <button
            onClick={onRegenerate}
            className="font-sans text-[9px] uppercase tracking-[0.18em] text-muted hover:text-ink border-b border-transparent hover:border-ink transition-colors"
          >
            Rigenera
          </button>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <div className="aspect-[2/3] bg-rule animate-pulse" />
              <div className="h-2.5 bg-rule animate-pulse w-3/4" />
              <div className="h-2 bg-rule animate-pulse w-1/2" />
            </div>
          ))}
        </div>
      ) : books.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          {books.map((b) => {
            const placeholder = generateCoverPlaceholder(b.title, b.author)
            return (
              <Link key={b.id} to={`/book/${b.id}`} className="group flex flex-col gap-2">
                <div
                  className="aspect-[2/3] bg-badge overflow-hidden"
                  style={{ boxShadow: '2px 3px 10px rgba(0,0,0,0.12)' }}
                >
                  <img
                    src={b.cover_url || placeholder}
                    alt={b.title}
                    className="w-full h-full object-cover"
                    onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = placeholder }}
                  />
                </div>
                <p className="font-display font-bold text-[0.8rem] leading-snug text-ink line-clamp-2 group-hover:text-accent transition-colors">
                  {b.title}
                </p>
                {b.author && (
                  <p className="font-sans text-[9px] uppercase tracking-[0.12em] text-muted -mt-1">
                    {b.author}
                  </p>
                )}
                <p className="font-serif text-[0.72rem] italic leading-snug text-muted">
                  {b.reason}
                </p>
              </Link>
            )
          })}
        </div>
      ) : (
        <p className="font-sans text-sm text-muted italic">Nessun libro vicino trovato nella tua biblioteca.</p>
      )}
    </section>
  )
}

// ─── Critical context ─────────────────────────────────────────────────────────

const REVIEW_LINKS = [
  {
    label: 'NYT Book Review',
    href: (book) =>
      `https://www.nytimes.com/search?query=${encodeURIComponent(book.title + ' ' + (book.author ?? ''))}`,
  },
  {
    label: 'doppiozero',
    href: (book) =>
      `https://www.doppiozero.com/?s=${encodeURIComponent(book.title)}`,
  },
  {
    label: 'Rivista Studio',
    href: (book) =>
      `https://www.rivistastudio.com/?s=${encodeURIComponent(book.title)}`,
  },
]

function CriticalContext({ book, context, loading }) {
  return (
    <section className="mt-8">
      <hr className="border-rule mb-5" />
      <h2 className="font-sans text-[9px] uppercase tracking-[0.18em] text-muted mb-4">
        Contesto critico
      </h2>

      {/* AI text */}
      {loading ? (
        <div className="flex flex-col gap-2.5 mb-6">
          <div className="h-3 bg-rule animate-pulse w-full" />
          <div className="h-3 bg-rule animate-pulse w-11/12" />
          <div className="h-3 bg-rule animate-pulse w-10/12" />
          <div className="h-3 bg-rule animate-pulse w-11/12" />
        </div>
      ) : context ? (
        <div className="mb-6">
          <p className="font-serif text-[0.95rem] leading-relaxed" style={{ color: '#444' }}>
            {context}
          </p>
          <span className="font-sans text-[10px] italic mt-2 inline-block" style={{ color: '#9B9B9B' }}>
            ✦ Generato da AI
          </span>
        </div>
      ) : null}

      {/* Review links */}
      <div>
        <p className="font-sans text-[9px] uppercase tracking-[0.18em] text-muted mb-3">
          Cerca recensioni su
        </p>
        <div className="flex flex-wrap gap-2">
          {REVIEW_LINKS.map(({ label, href }) => (
            <a
              key={label}
              href={href(book)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-sans text-[11px] px-3 py-1.5 transition-colors"
              style={{
                border: '1px solid #E8E8E4',
                borderRadius: '2px',
                color: '#6B6B6B',
                background: 'transparent',
                textDecoration: 'none',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F4EF' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              {label}
              <ExternalLink size={10} strokeWidth={1.75} />
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Content — separate component so hooks are always called in stable order ──

function BookDetailContent({ book, onEdit, nextStep, loadingNextStep, criticalContext, loadingCritical, similarBooks, loadingSimilar, onRegenerateSimilar, aiEnabled }) {
  const { loading, url, description, aiGenerated, regenerate } = useCoverImage(book, aiEnabled)
  const { title, series, volume } = parseTitle(book.title)
  const { user } = useAuth()

  async function handleRegenerateSynopsis() {
    await supabase.from('books').update({ synopsis: null, ai_synopsis: false }).eq('id', book.id)
    regenerate()
  }

  return (
    <div className="flex flex-col sm:flex-row gap-12 lg:gap-16">
      <div className="flex-shrink-0 w-full sm:w-[280px]">
        <DetailCover loading={loading} url={url} book={book} />
      </div>

      <div className="flex-1 min-w-0 pt-1">
        <div className="flex items-center justify-between mb-5">
          <span className={`inline-block font-sans text-[9px] uppercase tracking-[0.18em] border px-1.5 py-px ${statusBadge[book.status]}`}>
            {statusLabels[book.status]}
          </span>
          {user && (
            <button
              onClick={onEdit}
              className="font-sans text-[9px] uppercase tracking-[0.18em] text-muted hover:text-ink border-b border-transparent hover:border-ink transition-colors"
            >
              Modifica
            </button>
          )}
        </div>

        <h1 className="font-display font-bold text-4xl sm:text-5xl leading-[1.08] text-ink mb-2">
          {title}
        </h1>

        {series && (
          <p className="font-sans text-sm italic text-muted mb-3">
            {series} · Vol. {volume}
          </p>
        )}

        <p className="font-sans text-xs uppercase tracking-[0.2em] text-muted mb-1">
          {book.author}
        </p>

        <hr className="border-rule mb-5" />

        {book.rating > 0 && (
          <div className="flex items-center gap-3 mb-6">
            <StarRating rating={book.rating} />
            <span className="font-sans text-xs uppercase tracking-[0.12em] text-muted">
              {book.rating} su 5
            </span>
          </div>
        )}

        <div className="flex gap-8 mb-8 pb-6 border-b border-rule">
          <div>
            <dt className="font-sans text-[9px] uppercase tracking-[0.18em] text-muted mb-1">Anno</dt>
            <dd className="font-sans text-sm text-ink">{book.year > 0 ? book.year : '—'}</dd>
          </div>
          <div>
            <dt className="font-sans text-[9px] uppercase tracking-[0.18em] text-muted mb-1">Genere</dt>
            <dd className="font-sans text-sm text-ink">{book.genre || '—'}</dd>
          </div>
          <div>
            <dt className="font-sans text-[9px] uppercase tracking-[0.18em] text-muted mb-1">ISBN</dt>
            <dd className="font-sans text-sm text-ink tabular-nums">{book.isbn || '—'}</dd>
          </div>
        </div>

        {(loading || description || user) && (
          <section className="mb-8">
            <hr className="border-rule mb-5" />
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-sans text-[9px] uppercase tracking-[0.18em] text-muted">
                Sinossi
              </h2>
              {user && !loading && (
                <button
                  onClick={handleRegenerateSynopsis}
                  className="font-sans text-[9px] uppercase tracking-[0.18em] text-muted hover:text-ink border-b border-transparent hover:border-ink transition-colors"
                >
                  Rigenera sinossi
                </button>
              )}
            </div>
            {loading ? (
              <div className="flex flex-col gap-2.5">
                <div className="h-3 bg-rule animate-pulse w-full" />
                <div className="h-3 bg-rule animate-pulse w-11/12" />
                <div className="h-3 bg-rule animate-pulse w-10/12" />
                <div className="h-3 bg-rule animate-pulse w-11/12" />
                <div className="h-3 bg-rule animate-pulse w-8/12" />
              </div>
            ) : description ? (
              <div>
                <p className="font-serif text-base leading-relaxed text-ink">{description}</p>
                {aiGenerated && (
                  <span className="font-sans text-[10px] italic text-muted mt-3 inline-block">
                    ✦ Generata dall'AI
                  </span>
                )}
              </div>
            ) : (
              <p className="font-sans text-sm text-muted italic">Nessuna sinossi disponibile.</p>
            )}
          </section>
        )}

        {book.review && (
          <section className="mb-8">
            <h2 className="font-sans text-[9px] uppercase tracking-[0.18em] text-muted mb-4">
              La mia recensione
            </h2>
            <p className="font-serif text-base leading-relaxed text-ink">{book.review}</p>
          </section>
        )}

        {book.favorite_quote && (
          <section className="mb-0">
            <h2 className="font-sans text-[9px] uppercase tracking-[0.18em] text-muted mb-4">
              Citazione preferita
            </h2>
            <blockquote
              className="font-display italic text-xl sm:text-2xl leading-relaxed text-ink pl-5"
              style={{ borderLeft: '3px solid #C41E3A' }}
            >
              &ldquo;{book.favorite_quote}&rdquo;
            </blockquote>
          </section>
        )}

        <CriticalContext book={book} context={criticalContext} loading={loadingCritical} />

        <SimilarBooksSection
          books={similarBooks}
          loading={loadingSimilar}
          user={user}
          onRegenerate={onRegenerateSimilar}
        />

        {book.status === 'read' && (
          <NextStepCard suggestion={nextStep} loading={loadingNextStep} />
        )}
      </div>
    </div>
  )
}

// ─── Critical context fetch ───────────────────────────────────────────────────

async function fetchCriticalContext(book) {
  // Already in DB — return immediately
  if (book.critical_context_generated && book.critical_context) {
    return book.critical_context
  }

  const res = await fetch('/api/anthropic', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: 'Sei un critico letterario. Rispondi sempre in italiano. Sii colto, diretto, mai banale.',
      messages: [{
        role: 'user',
        content: `In massimo 4 frasi complete descrivi il contesto critico e culturale di '${book.title}' di ${book.author}.
Cosa ha detto la critica internazionale?
Qual è il posto di questo libro nella storia letteraria o culturale?
Sii specifico. Concludi sempre con una frase completa.
Niente spoiler sulla trama.`,
      }],
    }),
  })

  if (!res.ok) return null

  const data = await res.json()
  const text = data.content[0].text.trim()

  // Persist to DB
  await supabase
    .from('books')
    .update({ critical_context: text, critical_context_generated: true })
    .eq('id', book.id)

  return text
}

// ─── Similar books fetch ───────────────────────────────────────────────────────

async function fetchSimilarBooks(book, force = false) {
  if (book.similar_books && !force) return book.similar_books
  if (!book.genre) return []

  const { data: candidates } = await supabase
    .from('books')
    .select('id, title, author, synopsis, cover_url')
    .eq('genre', book.genre)
    .neq('id', book.id)
    .not('synopsis', 'is', null)
    .limit(40)

  if (!candidates?.length) return []

  const list = candidates
    .map((c, i) => `${i}. "${c.title}" — ${c.author ?? 'autore sconosciuto'}. ${(c.synopsis ?? '').slice(0, 150)}`)
    .join('\n')

  const targetSynopsis = book.synopsis
    ? book.synopsis.slice(0, 300)
    : '(sinossi non disponibile: basati solo su titolo, autore e genere)'

  const res = await fetch('/api/anthropic', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: 'Sei un bibliotecario esperto di letteratura. Rispondi sempre in italiano.',
      messages: [{
        role: 'user',
        content: `Libro di riferimento: "${book.title}" di ${book.author ?? ''}. Genere: ${book.genre}.
${targetSynopsis}

Ecco un elenco di altri libri della stessa biblioteca, numerati:
${list}

Scegli fino a 4 libri da questo elenco che sono più vicini dal punto di vista letterario al libro di riferimento — per temi, stile, tono o approccio, non solo per genere condiviso. Motiva ogni scelta con una frase breve (max 20 parole).

Rispondi in questo formato JSON:
{
  "picks": [
    { "index": 0, "reason": "una frase breve" }
  ]
}
Solo JSON, nient'altro. Se nessun libro è davvero vicino, restituisci una lista vuota.`,
      }],
    }),
  })

  if (!res.ok) return []

  const data = await res.json()
  const text = data.content[0].text.trim()
  const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')

  let parsed
  try { parsed = JSON.parse(clean) } catch { return [] }

  const seen = new Set()
  const picks = (parsed.picks ?? [])
    .map((p) => {
      const c = candidates[p.index]
      if (!c) return null
      return { id: c.id, title: c.title, author: c.author, cover_url: c.cover_url, reason: p.reason }
    })
    .filter(Boolean)
    .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
    .slice(0, 4)

  await supabase.from('books').update({ similar_books: picks }).eq('id', book.id)

  return picks
}

// ─── Page ─────────────────────────────────────────────────────────────────────

async function fetchNextStep(book) {
  const { data: toReadBooks } = await supabase
    .from('books')
    .select('id, title, author, cover_url')
    .eq('status', 'to-read')
    .limit(50)

  if (!toReadBooks?.length) return null

  const bookList = toReadBooks
    .map((b) => `- ${b.title} (${b.author ?? ''})`)
    .join('\n')

  const res = await fetch('/api/anthropic', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: 'Sei un consulente di lettura personale. Rispondi sempre in italiano. Sii diretto e conciso.',
      messages: [{
        role: 'user',
        content: `Ho appena finito di leggere '${book.title}' di ${book.author}.
Genere: ${book.genre ?? 'non specificato'}.
${book.review ? 'La mia recensione: ' + book.review : ''}
${book.rating ? 'Rating: ' + book.rating + '/5' : ''}

Questi sono i libri che ho da leggere:
${bookList}

Suggerisci UN SOLO libro dalla lista che sarebbe il prossimo passo naturale dopo questa lettura.
Rispondi in questo formato JSON:
{
  "title": "titolo esatto dalla lista",
  "reason": "una frase di max 25 parole che spiega il collegamento"
}
Solo JSON, nient'altro.`,
      }],
    }),
  })

  if (!res.ok) return null

  const data = await res.json()
  const text = data.content[0].text.trim()
  const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  const parsed = JSON.parse(clean)

  const match = toReadBooks.find(
    (b) => b.title.toLowerCase() === parsed.title.toLowerCase()
      || b.title.toLowerCase().includes(parsed.title.toLowerCase().substring(0, 20))
  )
  if (!match) return null

  return {
    id:       match.id,
    title:    match.title,
    author:   match.author,
    cover_url: match.cover_url,
    reason:   parsed.reason,
  }
}

export default function BookDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [book, setBook] = useState(undefined)
  const [loadingBook, setLoadingBook] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [nextStep, setNextStep] = useState(null)
  const [loadingNextStep, setLoadingNextStep] = useState(false)
  const [criticalContext, setCriticalContext] = useState(null)
  const [loadingCritical, setLoadingCritical] = useState(false)
  const [similarBooks, setSimilarBooks] = useState(null)
  const [loadingSimilar, setLoadingSimilar] = useState(false)

  const aiEnabled = localStorage.getItem('ai-enabled') === 'true'

  async function fetchBook() {
    setLoadingBook(true)
    const { data, error } = await supabase
      .from('books')
      .select('*')
      .eq('id', id)
      .single()
    if (error || !data) {
      setBook(null)
    } else {
      setBook(data)
    }
    setLoadingBook(false)
  }

  useEffect(() => { fetchBook() }, [id])

  // Trigger critical context once book loads
  useEffect(() => {
    if (!book) return
    // If already in book data, use it directly without showing loading
    if (book.critical_context_generated && book.critical_context) {
      setCriticalContext(book.critical_context)
      return
    }
    if (!aiEnabled) return
    setLoadingCritical(true)
    setCriticalContext(null)
    fetchCriticalContext(book)
      .then((text) => setCriticalContext(text ?? null))
      .catch(() => setCriticalContext(null))
      .finally(() => setLoadingCritical(false))
  }, [book?.id])

  // Trigger next step suggestion once book loads and is 'read'
  useEffect(() => {
    if (!book || book.status !== 'read' || !aiEnabled) return
    setLoadingNextStep(true)
    setNextStep(null)
    fetchNextStep(book)
      .then((result) => setNextStep(result ?? null))
      .catch(() => setNextStep(null))
      .finally(() => setLoadingNextStep(false))
  }, [book?.id])

  // Trigger similar-books suggestion once book loads
  useEffect(() => {
    if (!book) return
    if (book.similar_books) {
      setSimilarBooks(book.similar_books)
      return
    }
    if (!aiEnabled || !book.genre) return
    setLoadingSimilar(true)
    setSimilarBooks(null)
    fetchSimilarBooks(book)
      .then((result) => setSimilarBooks(result ?? []))
      .catch(() => setSimilarBooks([]))
      .finally(() => setLoadingSimilar(false))
  }, [book?.id])

  async function handleRegenerateSimilar() {
    setLoadingSimilar(true)
    setSimilarBooks(null)
    const result = await fetchSimilarBooks(book, true).catch(() => [])
    setSimilarBooks(result ?? [])
    setLoadingSimilar(false)
  }

  function handleSaved() {
    setIsEditing(false)
    fetchBook()
  }

  function handleDeleted() {
    navigate('/biblioteca')
  }

  return (
    <main className="max-w-[1200px] mx-auto px-6 py-12">
      <Link
        to="/biblioteca"
        className="inline-flex items-center gap-2 font-sans text-xs uppercase tracking-[0.12em] text-muted hover:text-accent transition-colors mb-12"
      >
        <span>←</span>
        <span>Torna alla biblioteca</span>
      </Link>

      {loadingBook ? (
        <div className="flex flex-col sm:flex-row gap-12 lg:gap-16">
          <div className="flex-shrink-0 w-full sm:w-[280px]">
            <div className="w-full aspect-[2/3] bg-rule animate-pulse" />
          </div>
          <div className="flex-1 min-w-0 pt-1 flex flex-col gap-4">
            <div className="h-3 bg-rule animate-pulse w-16" />
            <div className="h-8 bg-rule animate-pulse w-3/4" />
            <div className="h-3 bg-rule animate-pulse w-1/3" />
          </div>
        </div>
      ) : !book ? (
        <Navigate to="/biblioteca" replace />
      ) : (
        <>
          <BookDetailContent
            book={book}
            onEdit={() => setIsEditing(true)}
            nextStep={nextStep}
            loadingNextStep={loadingNextStep}
            criticalContext={criticalContext}
            loadingCritical={loadingCritical}
            similarBooks={similarBooks}
            loadingSimilar={loadingSimilar}
            onRegenerateSimilar={handleRegenerateSimilar}
            aiEnabled={aiEnabled}
          />
          {isEditing && (
            <EditModal
              book={book}
              onClose={() => setIsEditing(false)}
              onSaved={handleSaved}
              onDeleted={handleDeleted}
            />
          )}
        </>
      )}
    </main>
  )
}
