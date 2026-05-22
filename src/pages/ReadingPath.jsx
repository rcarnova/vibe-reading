import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const CONTEXTS = [
  'Creatività e processo creativo',
  'Leadership e organizzazione',
  'Vendita e business development',
  'Letteratura e narrativa',
  'Identità e sviluppo personale',
]

const MAX_CONTEXT_LENGTH = 300

// ─── API call ────────────────────────────────────────────────────────────────

async function generateReadingPath(selectedContexts, freeText, allBooks) {
  const readBooks = allBooks.filter((b) => b.status === 'read')
  const toReadBooks = allBooks.filter((b) => b.status === 'to-read' || b.status === 'reading')

  const stars = (r) => r > 0 ? '★'.repeat(r) : ''

  const readList = readBooks
    .map((b) => `- ${b.title} — ${b.author}${b.rating > 0 ? ` (${stars(b.rating)})` : ''}`)
    .join('\n')

  const toReadList = toReadBooks
    .map((b) => `- ${b.title} — ${b.author}`)
    .join('\n')

  const userPrompt = `Il lettore ha i seguenti obiettivi di crescita: ${selectedContexts.join(', ')}.
Contesto aggiuntivo: ${freeText.trim() || 'nessuno'}.

Libri già letti (con rating):
${readList || '(nessuno)'}

Libri da leggere in libreria:
${toReadList || '(nessuno)'}

Genera un percorso di lettura personalizzato con:
1. 3-5 libri consigliati come prossime letture, scelti PRIORITARIAMENTE dalla lista 'da leggere', con una spiegazione del perché per ciascuno
2. Un filo narrativo che collega i libri consigliati
3. Un titolo evocativo per questo percorso

Formatta la risposta in modo chiaro con sezioni separate. NON includere un'analisi generica del profilo di lettura.`

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
      max_tokens: 2000,
      system:
        'You are a personal reading advisor. You have access to a user\'s reading history and their unread books. Based on their growth goals, recommend a personalized reading path. Always respond in Italian. Be direct, insightful, and make connections between books the user has already read and what they should read next.',
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `API error ${res.status}`)
  }

  const data = await res.json()
  return data.content[0].text
}

// ─── Result renderer ─────────────────────────────────────────────────────────

function parseResult(text) {
  // Extract path title — look for patterns like "**Titolo:**" or numbered section 4
  const titleMatch =
    text.match(/(?:titolo[^:]*:|percorso[^:]*:)\s*[*"«]?([^\n*"»]+)[*"»]?/i) ||
    text.match(/\*\*([^*\n]{5,60})\*\*\s*$/) // last bold line as fallback

  const pathTitle = titleMatch ? titleMatch[1].trim() : null

  // Split into sections by markdown headings or numbered items
  const sections = []
  const lines = text.split('\n')
  let current = null

  for (const line of lines) {
    const heading = line.match(/^#{1,3}\s+(.+)/) || line.match(/^\*\*(.+)\*\*\s*$/)
    const numbered = line.match(/^(\d+)\.\s+(.+)/)

    if (heading) {
      if (current) sections.push(current)
      current = { heading: heading[1].replace(/\*\*/g, '').trim(), body: [] }
    } else if (numbered && line.length < 120 && !current?.body?.length) {
      if (current) sections.push(current)
      current = { heading: numbered[2].replace(/\*\*/g, '').trim(), body: [] }
    } else if (line.trim()) {
      if (!current) current = { heading: null, body: [] }
      current.body.push(line)
    }
  }
  if (current) sections.push(current)

  return { pathTitle, sections, raw: text }
}

function BookRecommendationCard({ title, body, allBooks }) {
  // Try to find a matching book in the library (by title substring)
  const cleanTitle = title.replace(/^\d+\.\s*/, '').replace(/\*\*/g, '').trim()
  const match = allBooks.find((b) =>
    b.title.toLowerCase().includes(cleanTitle.toLowerCase().split(' — ')[0].toLowerCase()) ||
    cleanTitle.toLowerCase().includes(b.title.toLowerCase().substring(0, 15).toLowerCase())
  )

  const titleDisplay = cleanTitle.includes(' — ')
    ? cleanTitle.split(' — ')[0].trim()
    : cleanTitle
  const authorDisplay = cleanTitle.includes(' — ')
    ? cleanTitle.split(' — ').slice(1).join(' — ').trim()
    : null

  const inner = (
    <div className={`border border-rule p-5 transition-colors ${match ? 'hover:border-ink cursor-pointer' : ''}`}>
      <p className="font-display font-bold text-base leading-snug text-ink mb-1">
        {titleDisplay}
      </p>
      {authorDisplay && (
        <p className="font-sans text-[10px] uppercase tracking-[0.14em] text-muted mb-3">
          {authorDisplay}
        </p>
      )}
      {body.length > 0 && (
        <p className="font-serif text-sm leading-relaxed text-ink">
          {body.join(' ').replace(/\*\*/g, '')}
        </p>
      )}
      {match && (
        <span className="inline-block mt-3 font-sans text-[9px] uppercase tracking-[0.18em] text-accent">
          Nel tuo scaffale →
        </span>
      )}
    </div>
  )

  return match ? <Link to={`/book/${match.id}`}>{inner}</Link> : inner
}

function ResultDisplay({ result, allBooks, onRegenerate, onShare, onSave, saving, saved, isAuthenticated }) {
  const { pathTitle, sections, raw } = parseResult(result)

  // Heuristic: sections with short headings and bullet-like bodies are likely book recs
  const isBookSection = (s) =>
    s.heading &&
    (s.heading.match(/^\d+\./) ||
      /libro|lettura|consigli/i.test(s.heading) ||
      (s.heading.includes(' — ') || s.heading.includes(' - ')))

  return (
    <div className="mt-14 border-t-2 border-ink pt-10">
      {pathTitle && (
        <h2 className="font-display italic font-black text-4xl sm:text-5xl text-accent leading-tight mb-10">
          {pathTitle}
        </h2>
      )}

      <div className="flex flex-col gap-10">
        {sections.map((section, i) => {
          if (!section.heading && !section.body.length) return null

          if (isBookSection(section)) {
            return (
              <div key={i}>
                {section.heading && (
                  <p className="font-sans text-[9px] uppercase tracking-[0.18em] text-muted mb-3">
                    {section.heading.replace(/^\d+\.\s*/, '').replace(/\*\*/g, '')}
                  </p>
                )}
                <BookRecommendationCard
                  title={section.heading || ''}
                  body={section.body}
                  allBooks={allBooks}
                />
              </div>
            )
          }

          return (
            <div key={i}>
              {section.heading && (
                <p className="font-sans text-[9px] uppercase tracking-[0.18em] text-muted mb-3">
                  {section.heading.replace(/^\d+\.\s*/, '').replace(/\*\*/g, '')}
                </p>
              )}
              <p className="font-serif text-base leading-relaxed text-ink">
                {section.body.join(' ').replace(/\*\*/g, '')}
              </p>
            </div>
          )
        })}
      </div>

      {/* If parsing produced nothing useful, fall back to raw text */}
      {sections.length === 0 && (
        <p className="font-serif text-base leading-relaxed text-ink whitespace-pre-wrap">{raw}</p>
      )}

      <div className="flex flex-wrap gap-4 mt-12 pt-6 border-t border-rule">
        <button
          onClick={onRegenerate}
          className="font-sans text-xs uppercase tracking-[0.12em] text-ink border border-ink px-4 py-2 hover:bg-ink hover:text-paper transition-colors"
        >
          Rigenera percorso
        </button>
        {isAuthenticated ? (
          <button
            onClick={onSave}
            disabled={saving || saved}
            className={[
              'font-sans text-xs uppercase tracking-[0.12em] px-4 py-2 border transition-colors',
              saved
                ? 'border-rule text-muted cursor-default'
                : saving
                ? 'border-rule text-muted cursor-not-allowed'
                : 'border-ink text-ink hover:bg-ink hover:text-paper',
            ].join(' ')}
          >
            {saved ? 'Percorso salvato ✓' : saving ? 'Salvataggio…' : 'Salva percorso'}
          </button>
        ) : (
          <Link
            to="/login"
            className="font-sans text-xs uppercase tracking-[0.12em] px-4 py-2 border border-rule text-muted hover:border-ink hover:text-ink transition-colors"
          >
            Accedi per salvare il percorso
          </Link>
        )}
        <button
          onClick={onShare}
          className="font-sans text-xs uppercase tracking-[0.12em] text-muted border border-rule px-4 py-2 hover:border-ink hover:text-ink transition-colors"
        >
          Copia negli appunti
        </button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ReadingPath() {
  const { user } = useAuth()
  const [aiEnabled, setAiEnabled] = useState(() => localStorage.getItem('ai-enabled') === 'true')
  const [allBooks, setAllBooks] = useState([])
  const [loadingBooks, setLoadingBooks] = useState(true)

  const [selectedContexts, setSelectedContexts] = useState(() => {
    try {
      const saved = sessionStorage.getItem('readingPath')
      return saved ? JSON.parse(saved).selectedContexts : []
    } catch { return [] }
  })
  const [freeText, setFreeText] = useState(() => {
    try {
      const saved = sessionStorage.getItem('readingPath')
      return saved ? JSON.parse(saved).freeText : ''
    } catch { return '' }
  })

  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState(() => {
    try {
      const saved = sessionStorage.getItem('readingPath')
      return saved ? JSON.parse(saved).result : null
    } catch { return null }
  })
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function fetchBooks() {
      const { data, error } = await supabase.from('books').select('*')
      if (!error) setAllBooks(data ?? [])
      setLoadingBooks(false)
    }
    fetchBooks()
  }, [])

  function toggleContext(ctx) {
    setSelectedContexts((prev) =>
      prev.includes(ctx) ? prev.filter((c) => c !== ctx) : [...prev, ctx]
    )
    sessionStorage.removeItem('readingPath')
  }

  async function handleSavePath() {
    if (!result || saving || saved) return
    setSaving(true)
    const { pathTitle } = parseResult(result)
    const { error } = await supabase.from('reading_paths').insert({
      title: pathTitle || 'Percorso senza titolo',
      contexts: selectedContexts,
      free_text: freeText.trim() || null,
      content: result,
    })
    setSaving(false)
    if (!error) setSaved(true)
  }

  async function handleGenerate() {
    if (!aiEnabled) {
      setError('Attiva AI per generare percorsi')
      return
    }
    sessionStorage.removeItem('readingPath')
    setSaved(false)
    setGenerating(true)
    setResult(null)
    setError(null)
    try {
      const text = await generateReadingPath(selectedContexts, freeText, allBooks)
      setResult(text)
      sessionStorage.setItem('readingPath', JSON.stringify({
        selectedContexts,
        freeText,
        result: text,
      }))
    } catch (err) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  function handleShare() {
    if (!result) return
    const { pathTitle, sections } = parseResult(result)
    const bookLines = sections
      .filter((s) => s.heading?.includes(' — ') || s.heading?.includes(' - '))
      .map((s) => `• ${s.heading.replace(/^\d+\.\s*/, '').replace(/\*\*/g, '')}`)
      .join('\n')
    const text = [pathTitle ? `✦ ${pathTitle}` : 'Il mio percorso di lettura', bookLines]
      .filter(Boolean)
      .join('\n\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function toggleAI() {
    const newValue = !aiEnabled
    setAiEnabled(newValue)
    localStorage.setItem('ai-enabled', String(newValue))
  }

  const canGenerate = selectedContexts.length > 0 && !generating && !loadingBooks

  return (
    <main className="max-w-[1200px] mx-auto px-6 py-12">
      {/* Header */}
      <header className="mb-10">
        <h1 className="font-display italic font-black text-5xl sm:text-6xl text-ink leading-none mb-3">
          Il tuo percorso
        </h1>
        <p className="font-sans font-light text-sm tracking-wide text-muted">
          Lascia che l'AI guidi le tue prossime letture in base a ciò che hai già letto
        </p>
        <hr className="mt-6 border-rule" />
      </header>

      {/* Form */}
      <div className="max-w-2xl">

        {/* Context pills */}
        <div className="mb-8">
          <p className="font-sans text-[9px] uppercase tracking-[0.18em] text-muted mb-4">
            Obiettivi di crescita <span className="text-accent">*</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {CONTEXTS.map((ctx) => {
              const active = selectedContexts.includes(ctx)
              return (
                <button
                  key={ctx}
                  onClick={() => toggleContext(ctx)}
                  className={[
                    'font-sans text-xs tracking-wide px-3 py-1.5 border transition-colors',
                    active
                      ? 'bg-ink text-paper border-ink'
                      : 'bg-paper text-ink border-ink hover:bg-badge',
                  ].join(' ')}
                >
                  {ctx}
                </button>
              )
            })}
          </div>
        </div>

        {/* Free text */}
        <div className="mb-8">
          <label className="block font-sans text-[9px] uppercase tracking-[0.18em] text-muted mb-3">
            Aggiungi contesto specifico (opzionale)
          </label>
          <div className="relative">
            <textarea
              value={freeText}
              onChange={(e) => setFreeText(e.target.value.slice(0, MAX_CONTEXT_LENGTH))}
              placeholder="es. sto preparando un workshop sulla cultura aziendale..."
              rows={3}
              className={[
                'w-full bg-transparent font-sans text-sm text-ink placeholder:text-muted placeholder:italic',
                'px-0 py-2 resize-none',
                'border-0 border-b-2 border-ink outline-none',
                'focus:border-accent transition-colors duration-150',
              ].join(' ')}
            />
          </div>
          <p className="font-sans text-[10px] text-muted mt-1 text-right">
            {freeText.length}/{MAX_CONTEXT_LENGTH}
          </p>
        </div>

        {/* Generate button + AI toggle */}
        <div className="flex items-center gap-4 flex-wrap">
          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className={[
              'font-sans text-xs uppercase tracking-[0.15em] px-8 py-3 transition-colors',
              canGenerate
                ? 'bg-ink text-paper hover:bg-accent cursor-pointer'
                : 'bg-rule text-muted cursor-not-allowed',
            ].join(' ')}
          >
            Genera il mio percorso
          </button>

          <button
            onClick={toggleAI}
            className="inline-flex items-center gap-1.5 font-sans text-[11px] px-3 py-1.5 border border-rule text-muted hover:border-ink hover:text-ink transition-colors"
          >
            <Sparkles size={11} strokeWidth={1.75} className={aiEnabled ? 'text-accent' : ''} />
            {aiEnabled ? 'AI attiva' : 'AI disattivata'}
          </button>
        </div>
      </div>

      {/* Loading state */}
      {generating && (
        <div className="mt-14 border-t-2 border-ink pt-10">
          <p className="font-display italic text-2xl text-muted">
            L'AI sta analizzando la tua biblioteca…
          </p>
          <div className="mt-6 flex flex-col gap-3 max-w-lg">
            <div className="h-3 bg-rule animate-pulse w-full" />
            <div className="h-3 bg-rule animate-pulse w-11/12" />
            <div className="h-3 bg-rule animate-pulse w-4/5" />
            <div className="h-3 bg-rule animate-pulse w-11/12" />
            <div className="h-3 bg-rule animate-pulse w-3/5" />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-10 border-t border-rule pt-6">
          <p className="font-sans text-sm text-accent">Errore: {error}</p>
        </div>
      )}

      {/* Result */}
      {result && !generating && (
        <ResultDisplay
          result={result}
          allBooks={allBooks}
          onRegenerate={handleGenerate}
          onShare={handleShare}
          onSave={handleSavePath}
          saving={saving}
          saved={saved}
          isAuthenticated={!!user}
        />
      )}

      {/* Share feedback */}
      {copied && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-ink text-paper font-sans text-xs uppercase tracking-[0.12em] px-4 py-2">
          Copiato negli appunti
        </div>
      )}
    </main>
  )
}
