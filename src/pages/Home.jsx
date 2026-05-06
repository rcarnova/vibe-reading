import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Copy, ExternalLink } from 'lucide-react'
import VibeLogo from '../components/VibeLogo'
import { supabase } from '../lib/supabase'
import { useCoverImage } from '../hooks/useCoverImage'
import { generateCoverPlaceholder } from '../utils/generateCoverPlaceholder'

// ─── Recommendations API ──────────────────────────────────────────────────────

async function getRecommendations(userInput, toReadBooks, agenda) {
  const bookList = toReadBooks
    .map((b) => `${b.owned === false ? '○' : '✓'} ${b.title} — ${b.author ?? ''}`)
    .join('\n')

  const agendaLine = agenda?.trim()
    ? `Questa settimana ha in agenda: ${agenda.trim()}\n\n`
    : ''

  const agendaSuffix = agenda?.trim()
    ? ' e che siano utili anche rispetto a quello che ha in agenda'
    : ''

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system: 'Sei un consulente di lettura personale. Rispondi sempre in italiano. Sii diretto e coinvolgente. Preferisci suggerire libri già posseduti dall\'utente (✓) rispetto a quelli in wishlist (○), a meno che non sia chiaramente più pertinente.',
      messages: [{
        role: 'user',
        content: `Il lettore è curioso di: '${userInput}'

${agendaLine}Libri da leggere (✓ = posseduto, ○ = wishlist):
${bookList}

Scegli esattamente 3 libri da questa lista che rispondono alla sua curiosità${agendaSuffix}. Per ognuno scrivi:
- Titolo esatto (deve corrispondere alla lista)
- Una sola frase (max 20 parole) che spiega perché questo libro risponde alla sua curiosità specifica

Se nessun libro della lista è adatto, suggerisci 1 libro esterno chiaramente marcato come [Nuovo] e spiega brevemente.

Formato risposta (JSON):
{
  "books": [
    {
      "title": "titolo esatto",
      "reason": "una frase breve",
      "isExternal": false
    }
  ]
}
Rispondi SOLO con il JSON, niente altro.`,
      }],
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Errore API ${res.status}`)
  }

  const data = await res.json()
  const text = data.content[0].text.trim()
  const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  return JSON.parse(clean)
}

// ─── Reality bridge API ───────────────────────────────────────────────────────

const RSS_FEEDS = [
  { url: 'https://api.rss2json.com/v1/api.json?rss_url=https://www.repubblica.it/rss/homepage/rss2.0.xml',      source: 'Repubblica' },
  { url: 'https://api.rss2json.com/v1/api.json?rss_url=https://www.ilsole24ore.com/rss/italia--and--mondo.xml', source: 'Il Sole 24 Ore' },
  { url: 'https://api.rss2json.com/v1/api.json?rss_url=https://feeds.feedburner.com/corriere-della-sera',       source: 'Corriere della Sera' },
]

async function fetchNews() {
  const results = await Promise.allSettled(
    RSS_FEEDS.map(({ url, source }) =>
      fetch(url)
        .then((r) => r.json())
        .then((data) =>
          (data.items ?? []).slice(0, 5).map((item) => ({
            title:       (item.title ?? '').trim(),
            description: (item.description ?? '').replace(/<[^>]+>/g, '').slice(0, 200).trim(),
            link:        item.link ?? '',
            pubDate:     item.pubDate ?? '',
            source,
          }))
        )
    )
  )

  const allItems = results
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value)

  const seen = new Set()
  return allItems.filter((item) => {
    if (!item.title || seen.has(item.title)) return false
    seen.add(item.title)
    return true
  })
}

async function generateConnection(news, books, agenda) {
  const agendaLine = agenda?.trim()
    ? `L'utente questa settimana ha in agenda: ${agenda.trim()}.\n\n`
    : ''

  const agendaSuffix = agenda?.trim()
    ? ', tenendo conto del suo contesto settimanale'
    : ''

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: 'Sei un consulente culturale. Rispondi sempre in italiano.',
      messages: [{
        role: 'user',
        content: `${agendaLine}Queste sono le notizie di oggi:
${news.map((n) => `- ${n.title}: ${n.description}`).join('\n')}

Questi sono i libri nella biblioteca dell'utente (tutti gli stati):
${books.map((b) => `- ${b.title} (${b.author ?? ''}) [${b.status}]`).join('\n')}

Trova UN SOLO collegamento interessante tra una notizia attuale e un libro in biblioteca${agendaSuffix}. Scegli il collegamento più sorprendente e non ovvio.

Rispondi in JSON:
{
  "news_title": "titolo della notizia",
  "news_url": "url della notizia",
  "book_title": "titolo esatto del libro in biblioteca",
  "connection": "una frase di max 30 parole che spiega il collegamento inaspettato",
  "spark": "una domanda provocatoria di max 15 parole che collega i due"
}
Solo JSON.`,
      }],
    }),
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  const data = await res.json()
  const text = data.content[0].text.trim()
  const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  return JSON.parse(clean)
}

// ─── Recommended card ─────────────────────────────────────────────────────────

function RecommendedCard({ rec, libraryBook, index, onNavigate }) {
  const bookForCover = libraryBook ?? {
    title: rec.title,
    author: rec.author ?? '',
    isbn: null,
    genre: null,
    cover_url: null,
  }
  const { loading, url } = useCoverImage(bookForCover)
  const [imgError, setImgError] = useState(false)

  const inner = (
    <div
      className="fade-in flex flex-col h-full rounded-sm overflow-hidden"
      style={{
        animationDelay: `${index * 0.12}s`,
        background: 'rgba(255,255,255,0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
      }}
    >
      <div className="w-full aspect-[2/3] overflow-hidden flex-shrink-0">
        {loading ? (
          <div className="w-full h-full animate-pulse bg-rule" />
        ) : url && !imgError ? (
          <img
            src={url}
            alt={rec.title}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-badge">
            <svg className="w-8 h-8 text-rule" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5 p-4">
        {rec.isExternal && (
          <span className="self-start font-sans text-[9px] uppercase tracking-[0.18em] border border-accent text-accent px-1.5 py-px">
            Nuovo
          </span>
        )}
        <h3 className="font-display font-bold text-[0.92rem] leading-snug text-ink line-clamp-2">
          {rec.title}
        </h3>
        {(libraryBook?.author || rec.author) && (
          <p className="font-sans text-[10px] uppercase tracking-[0.14em] text-muted">
            {libraryBook?.author ?? rec.author}
          </p>
        )}
        <p className="font-serif text-[0.78rem] leading-relaxed text-muted italic mt-1">
          {rec.reason}
        </p>
      </div>
    </div>
  )

  if (libraryBook && !rec.isExternal) {
    return (
      <Link to={`/book/${libraryBook.id}`} onClick={onNavigate} className="flex flex-col hover:opacity-90 transition-opacity">
        {inner}
      </Link>
    )
  }

  return <div className="flex flex-col">{inner}</div>
}

// ─── Reality bridge components ────────────────────────────────────────────────

function BookThumbnail({ book }) {
  const { loading, url } = useCoverImage(book)
  const placeholder = generateCoverPlaceholder(book.title ?? '', book.author ?? '')
  return (
    <div className="flex-shrink-0 overflow-hidden" style={{ width: '40px', aspectRatio: '2/3' }}>
      {loading ? (
        <div className="w-full h-full animate-pulse" style={{ background: 'rgba(255,255,255,0.2)' }} />
      ) : (
        <img
          src={url || placeholder}
          alt={book.title}
          className="w-full h-full object-cover"
          onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = placeholder }}
        />
      )}
    </div>
  )
}

function RealityBridgeSkeleton() {
  return (
    <div
      className="rounded-sm overflow-hidden"
      style={{
        background: 'rgba(255,255,255,0.12)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.2)',
        padding: '24px',
      }}
    >
      <div className="flex gap-6">
        <div className="flex-1 flex flex-col gap-2">
          <div className="h-2 rounded animate-pulse w-1/4" style={{ background: 'rgba(255,255,255,0.25)' }} />
          <div className="h-3 rounded animate-pulse w-full" style={{ background: 'rgba(255,255,255,0.2)' }} />
          <div className="h-3 rounded animate-pulse w-3/4" style={{ background: 'rgba(255,255,255,0.15)' }} />
        </div>
        <div className="w-px self-stretch" style={{ background: 'rgba(255,255,255,0.2)' }} />
        <div className="flex gap-3 items-start w-48 flex-shrink-0">
          <div className="flex-shrink-0 animate-pulse rounded-sm" style={{ width: '40px', height: '60px', background: 'rgba(255,255,255,0.2)' }} />
          <div className="flex flex-col gap-2 flex-1">
            <div className="h-3 rounded animate-pulse w-full" style={{ background: 'rgba(255,255,255,0.2)' }} />
            <div className="h-3 rounded animate-pulse w-2/3" style={{ background: 'rgba(255,255,255,0.15)' }} />
          </div>
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-2">
        <div className="h-2.5 rounded animate-pulse w-full" style={{ background: 'rgba(255,255,255,0.15)' }} />
        <div className="h-2.5 rounded animate-pulse w-5/6" style={{ background: 'rgba(255,255,255,0.12)' }} />
        <div className="h-2 rounded animate-pulse w-1/2 mt-1" style={{ background: 'rgba(255,255,255,0.1)' }} />
      </div>
    </div>
  )
}

function RealityBridgeCard({ connection, newsUrl, book, onRefresh, loadingRefresh, onNavigate }) {
  return (
    <div
      className="rounded-sm overflow-hidden fade-in"
      style={{
        background: 'rgba(255,255,255,0.12)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.2)',
        padding: '24px',
      }}
    >
      {/* Top row: news + divider + book */}
      <div className="flex gap-6 items-start">
        {/* News side */}
        <div className="flex-1 min-w-0">
          <span
            className="inline-block font-sans text-[8px] uppercase tracking-[0.2em] px-1.5 py-px mb-2"
            style={{ background: '#FF3D5A', color: 'white' }}
          >
            Oggi
          </span>
          <p className="font-sans text-sm font-medium leading-snug" style={{ color: 'white' }}>
            {connection.news_title}
          </p>
        </div>

        {/* Divider */}
        <div className="w-px self-stretch flex-shrink-0" style={{ background: 'rgba(255,255,255,0.25)' }} />

        {/* Book side */}
        <div className="flex gap-3 items-start flex-shrink-0" style={{ width: '180px' }}>
          {book && <BookThumbnail book={book} />}
          <div className="min-w-0">
            <p className="font-display font-semibold text-sm leading-snug line-clamp-3" style={{ color: 'white' }}>
              {connection.book_title}
            </p>
            {book?.author && (
              <p className="font-sans text-[10px] uppercase tracking-[0.12em] mt-1" style={{ color: 'rgba(255,255,255,0.6)' }}>
                {book.author}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Connection text */}
      <div className="mt-5 pt-5" style={{ borderTop: '1px solid rgba(255,255,255,0.15)' }}>
        <p className="font-serif text-[0.88rem] leading-relaxed italic" style={{ color: 'rgba(255,255,255,0.9)' }}>
          {connection.connection}
        </p>
        <p className="font-sans text-xs mt-3" style={{ color: 'rgba(255,255,255,0.6)' }}>
          → {connection.spark}
        </p>
      </div>

      {/* Action links + refresh */}
      <div className="mt-5 flex flex-wrap items-center gap-4 justify-between">
        <div className="flex items-center gap-4">
          {newsUrl && (
            <a
              href={newsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-sans text-[10px] uppercase tracking-[0.16em] transition-opacity hover:opacity-70"
              style={{ color: 'rgba(255,255,255,0.75)' }}
            >
              <ExternalLink size={10} strokeWidth={1.75} />
              Leggi la notizia
            </a>
          )}
          {book?.id && (
            <Link
              to={`/book/${book.id}`}
              onClick={onNavigate}
              className="font-sans text-[10px] uppercase tracking-[0.16em] transition-opacity hover:opacity-70"
              style={{ color: 'rgba(255,255,255,0.75)' }}
            >
              Vai al libro →
            </Link>
          )}
        </div>
        <button
          onClick={onRefresh}
          disabled={loadingRefresh}
          className="font-sans text-[10px] uppercase tracking-[0.16em] transition-opacity disabled:opacity-40"
          style={{ color: 'rgba(255,255,255,0.5)', background: 'none', border: 'none', cursor: loadingRefresh ? 'not-allowed' : 'pointer' }}
        >
          {loadingRefresh ? 'Cercando…' : 'Trova un altro collegamento'}
        </button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

function ss(key) { try { return JSON.parse(sessionStorage.getItem(key)) } catch { return null } }

export default function Home() {
  const [input, setInput] = useState(() => ss('home-query') ?? '')
  const [agenda, setAgenda] = useState(() => sessionStorage.getItem('home-agenda') ?? '')
  const [loading, setLoading] = useState(false)
  const [recommendations, setRecommendations] = useState(() => ss('home-recommendations'))
  const [allToRead, setAllToRead] = useState(null)
  const [error, setError] = useState(null)
  const textareaRef = useRef(null)
  const resultsRef = useRef(null)

  // Reality bridge state
  const [bridgeBooks, setBridgeBooks] = useState([])
  const [bridgeNews, setBridgeNews] = useState(null)
  const [connection, setConnection] = useState(() => ss('reality-bridge'))
  const [loadingConnection, setLoadingConnection] = useState(false)
  const [loadingRefresh, setLoadingRefresh] = useState(false)

  // Restore scroll position after state is hydrated
  useEffect(() => {
    const saved = sessionStorage.getItem('home-scroll')
    if (saved) {
      setTimeout(() => window.scrollTo(0, parseInt(saved, 10)), 100)
      sessionStorage.removeItem('home-scroll')
    }
  }, [])

  function saveScroll() {
    sessionStorage.setItem('home-scroll', String(window.scrollY))
  }

  // Fetch books + news + generate connection on mount
  useEffect(() => {
    // Connection already hydrated from sessionStorage in useState initializer
    const alreadyCached = !!ss('reality-bridge')
    if (alreadyCached) {
      // Still fetch books so bridgeBooks is populated for URL resolution + refresh
    }

    async function init() {
      setLoadingConnection(true)
      try {
        const [newsItems, { data: books }] = await Promise.all([
          fetchNews(),
          supabase.from('books').select('id, title, author, status, isbn, cover_url, owned'),
        ])

        if (!newsItems.length || !books?.length) return

        setBridgeNews(newsItems)
        setBridgeBooks(books)

        // Only generate if not already cached
        const cached = (() => {
          try { return JSON.parse(sessionStorage.getItem('reality-bridge')) } catch { return null }
        })()
        if (cached?.news_title) return

        const conn = await generateConnection(newsItems, books, sessionStorage.getItem('home-agenda') ?? '')
        sessionStorage.setItem('reality-bridge', JSON.stringify(conn))
        setConnection(conn)
      } catch (err) {
        console.error('Reality bridge init error:', err)
        // Fail silently — section hidden
      } finally {
        setLoadingConnection(false)
      }
    }

    init()
  }, [])

  async function handleRefreshConnection() {
    if (!bridgeNews?.length || !bridgeBooks.length) return
    setLoadingRefresh(true)
    setConnection(null)
    try {
      const conn = await generateConnection(bridgeNews, bridgeBooks, agenda)
      sessionStorage.setItem('reality-bridge', JSON.stringify(conn))
      setConnection(conn)
    } catch (err) {
      console.error('Reality bridge refresh error:', err)
    } finally {
      setLoadingRefresh(false)
    }
  }

  // Find the matched book in library
  const bridgeBook = connection
    ? bridgeBooks.find((b) => b.title?.toLowerCase() === connection.book_title?.toLowerCase())
      ?? (connection.book_title ? { id: null, title: connection.book_title, author: '', isbn: null, cover_url: null } : null)
    : null

  // Resolve the actual news URL from fetched items (AI often returns garbled/missing URLs)
  const resolvedNewsUrl = (() => {
    if (!connection || !bridgeNews) return null
    const matched = bridgeNews.find(
      (n) => n.title?.toLowerCase().includes(connection.news_title?.toLowerCase()?.slice(0, 30))
        || connection.news_title?.toLowerCase().includes(n.title?.toLowerCase()?.slice(0, 30))
    )
    const url = matched?.link || connection.news_url || ''
    return url.startsWith('http') ? url : null
  })()

  // Determine whether to show the bridge section at all
  const showBridge = loadingConnection || connection

  function handleInput(e) {
    const value = e.target.value
    setInput(value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
    // Clear saved recommendations if query changed
    const savedQuery = sessionStorage.getItem('home-query') ?? ''
    if (value.trim() !== savedQuery.trim()) {
      setRecommendations(null)
      sessionStorage.removeItem('home-recommendations')
      sessionStorage.removeItem('home-query')
    }
  }

  async function handleDiscover() {
    setLoading(true)
    setError(null)
    setRecommendations(null)

    try {
      let toRead = allToRead
      if (!toRead) {
        const { data, error: dbErr } = await supabase
          .from('books')
          .select('*')
          .eq('status', 'to-read')
        if (dbErr) throw new Error(dbErr.message)
        toRead = data ?? []
        setAllToRead(toRead)
      }

      const result = await getRecommendations(input.trim(), toRead, agenda)

      const enriched = result.books.map((rec) => {
        const match = toRead.find(
          (b) => b.title.toLowerCase() === rec.title.toLowerCase()
            || b.title.toLowerCase().includes(rec.title.toLowerCase().substring(0, 20))
        )
        return { rec, libraryBook: match ?? null }
      })

      setRecommendations(enriched)
      sessionStorage.setItem('home-recommendations', JSON.stringify(enriched))
      sessionStorage.setItem('home-query', input.trim())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (recommendations && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [recommendations])

  const [copied, setCopied] = useState(false)

  function handleCopy() {
    const lines = recommendations.map(({ rec, libraryBook }, i) => {
      const title = rec.title
      const author = libraryBook?.author ?? rec.author ?? ''
      const authorPart = author ? ` — ${author}` : ''
      return `${i + 1}. ${title}${authorPart}\n   ${rec.reason}`
    }).join('\n\n')

    const text = `📚 I miei prossimi 3 libri\n${input.trim()}\n\n${lines}\n\n— Vibe Reading`
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const canSubmit = input.trim().length >= 20 && !loading

  return (
    <div style={{ backgroundColor: '#C8D8E8', position: 'relative', minHeight: '100vh' }}>
      {/* Animated gradient orbs */}
      <div
        aria-hidden="true"
        style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}
      >
        <div
          className="orb-breathe"
          style={{
            position: 'absolute', borderRadius: '50%', filter: 'blur(80px)',
            width: '500px', height: '500px',
            background: 'radial-gradient(circle, #FF8C42, #FF3D5A)',
            top: '20%', left: '35%',
          }}
        />
        <div
          className="orb-breathe-delayed"
          style={{
            position: 'absolute', borderRadius: '50%', filter: 'blur(80px)',
            width: '300px', height: '300px',
            background: 'radial-gradient(circle, #FFB347, #FF6B2B)',
            top: '30%', left: '25%',
          }}
        />
      </div>

      {/* Hero */}
      <section
        style={{ position: 'relative', zIndex: 1, minHeight: '100dvh' }}
        className="flex flex-col items-center justify-center px-6 py-20"
      >
        <h1 className="mb-4">
          <VibeLogo size="lg" theme="light" />
        </h1>

        <p
          className="font-sans font-light text-xs uppercase tracking-[0.28em] mb-10 text-center"
          style={{ color: 'rgba(255,255,255,0.85)' }}
        >
          Cosa ti incuriosisce oggi?
        </p>

        <div style={{ width: 'min(600px, 90vw)' }} className="flex flex-col gap-4">
          <textarea
            ref={textareaRef}
            value={input}
            onInput={handleInput}
            onChange={handleInput}
            placeholder="Descrivi quello che hai in mente..."
            rows={4}
            style={{
              minHeight: '100px', resize: 'none', overflow: 'hidden',
              background: 'rgba(255,255,255,0.15)',
              backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,255,255,0.3)', borderRadius: '2px',
              padding: '20px 24px', color: 'white',
              fontSize: '16px', fontFamily: 'Inter, system-ui, sans-serif',
              outline: 'none', width: '100%', boxSizing: 'border-box',
            }}
            onFocus={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.6)' }}
            onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.3)' }}
            className="placeholder:text-white/60 transition-colors"
          />

          {/* Agenda input */}
          <div className="flex flex-col gap-1.5">
            <label
              className="font-sans uppercase tracking-[0.18em]"
              style={{ fontSize: '11px', color: '#6B6B6B' }}
            >
              Cosa hai in agenda?
            </label>
            <input
              type="text"
              value={agenda}
              maxLength={150}
              onChange={(e) => {
                const v = e.target.value
                setAgenda(v)
                sessionStorage.setItem('home-agenda', v)
              }}
              placeholder="es. workshop creatività, meeting con cliente, presentazione strategia..."
              style={{
                background: 'rgba(255,255,255,0.12)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.25)',
                borderRadius: '2px',
                padding: '10px 16px',
                color: 'white',
                fontSize: '14px',
                fontFamily: 'Inter, system-ui, sans-serif',
                outline: 'none',
                width: '100%',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.5)' }}
              onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.25)' }}
              className="placeholder:text-white/40 transition-colors"
            />
          </div>

          <button
            onClick={handleDiscover}
            disabled={!canSubmit}
            className="w-full sm:w-auto sm:self-center font-sans font-medium text-xs uppercase tracking-[0.18em] transition-colors"
            style={{
              background: canSubmit ? 'white' : 'rgba(255,255,255,0.4)',
              color: canSubmit ? '#1A1A1A' : 'rgba(255,255,255,0.7)',
              border: 'none', padding: '12px 32px', borderRadius: 0,
              cursor: canSubmit ? 'pointer' : 'not-allowed', letterSpacing: '0.12em',
            }}
            onMouseEnter={(e) => { if (canSubmit) e.currentTarget.style.background = '#F0EFE9' }}
            onMouseLeave={(e) => { if (canSubmit) e.currentTarget.style.background = 'white' }}
          >
            {loading ? 'Sto cercando…' : 'Scopri i tuoi prossimi libri'}
          </button>

          {error && (
            <p className="font-sans text-xs text-center" style={{ color: 'rgba(255,255,255,0.9)' }}>
              {error}
            </p>
          )}
        </div>
      </section>

      {/* Recommendations results */}
      {recommendations && (
        <section
          ref={resultsRef}
          style={{ position: 'relative', zIndex: 1 }}
          className="px-6 pb-16"
        >
          <div style={{ width: 'min(960px, 100%)', margin: '0 auto' }}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10">
              {recommendations.map(({ rec, libraryBook }, i) => (
                <RecommendedCard key={i} rec={rec} libraryBook={libraryBook} index={i} onNavigate={saveScroll} />
              ))}
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
              <button
                onClick={handleCopy}
                className="inline-flex items-center gap-2 font-sans text-xs uppercase tracking-[0.18em] transition-colors"
                style={{
                  background: 'transparent', border: '1px solid white', color: 'white',
                  padding: '10px 24px', cursor: 'pointer', borderRadius: 0,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <Copy size={13} strokeWidth={1.75} />
                {copied ? 'Copiato ✓' : 'Copia lista libri'}
              </button>

              <Link
                to="/biblioteca"
                onClick={saveScroll}
                className="font-sans text-xs uppercase tracking-[0.18em] transition-colors"
                style={{ color: 'rgba(255,255,255,0.75)' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'white' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.75)' }}
              >
                Esplora tutta la biblioteca →
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Reality bridge section */}
      {showBridge && (
        <section
          style={{ position: 'relative', zIndex: 1 }}
          className="px-6 pb-24"
        >
          <div style={{ width: 'min(960px, 100%)', margin: '0 auto' }}>
            {/* Separator */}
            <div
              className="mb-8"
              style={{ borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: '40px' }}
            >
              <p
                className="font-sans text-[9px] uppercase tracking-[0.22em] mb-6"
                style={{ color: '#6B6B6B' }}
              >
                Il mondo oggi, la tua biblioteca sempre
              </p>

              {loadingConnection || (connection && !bridgeBook && loadingRefresh) ? (
                <RealityBridgeSkeleton />
              ) : connection ? (
                <RealityBridgeCard
                  connection={connection}
                  newsUrl={resolvedNewsUrl}
                  book={bridgeBook}
                  onRefresh={handleRefreshConnection}
                  loadingRefresh={loadingRefresh}
                  onNavigate={saveScroll}
                />
              ) : loadingRefresh ? (
                <RealityBridgeSkeleton />
              ) : null}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
