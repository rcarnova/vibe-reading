import { useState, useEffect } from 'react'
import { Sparkles } from 'lucide-react'
import { supabase } from '../lib/supabase'

// ─── Date formatting ──────────────────────────────────────────────────────────

const MONTHS = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
]

function formatDate(iso) {
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

// ─── API call ─────────────────────────────────────────────────────────────────

async function generateProfile(readBooks) {
  const stars = (r) => r > 0 ? '★'.repeat(r) : ''

  const bookList = readBooks
    .map((b) => `- ${b.title} — ${b.author}${b.rating > 0 ? ` (${stars(b.rating)})` : ''}`)
    .join('\n')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 1500,
      system: 'Sei un critico letterario e analista culturale. Rispondi sempre in italiano.',
      messages: [{
        role: 'user',
        content: `Analizza il profilo di lettura di questa persona basandoti sui libri che ha letto e i relativi rating.

Libri letti (con rating da 1 a 5):
${bookList || '(nessuno)'}

Genera un'analisi approfondita che includa:
1. **Identità culturale** — chi è questo lettore, quali mondi frequenta
2. **Tensioni creative** — le polarità e contraddizioni nei suoi gusti
3. **Punti ciechi** — cosa manca o è poco esplorato
4. **Filo nascosto** — il tema profondo che attraversa tutta la biblioteca
5. **Una frase che lo definisce** — sintetica e evocativa

Sii diretto, specifico, usa i titoli reali. Evita generalizzazioni. Lunghezza: 400-500 parole.`,
      }],
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Errore API ${res.status}`)
  }

  const data = await res.json()
  return data.content[0].text
}

// ─── Content renderer ─────────────────────────────────────────────────────────

function ProfileContent({ content }) {
  // Render **bold** markers as <strong> and split into paragraphs
  const paragraphs = content.split(/\n+/).filter(Boolean)

  return (
    <div className="flex flex-col gap-5">
      {paragraphs.map((para, i) => {
        // Replace **text** with bold spans
        const parts = para.split(/\*\*([^*]+)\*\*/g)
        return (
          <p key={i} className="font-serif text-base leading-relaxed text-ink">
            {parts.map((part, j) =>
              j % 2 === 1
                ? <strong key={j} className="font-bold">{part}</strong>
                : part
            )}
          </p>
        )
      })}
    </div>
  )
}

// ─── Confirm dialog ───────────────────────────────────────────────────────────

function ConfirmDialog({ onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-6">
      <div className="bg-paper border border-ink max-w-sm w-full p-8">
        <p className="font-serif text-base text-ink mb-6">
          Vuoi rigenerare il profilo? Quello attuale verrà sostituito.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            className="font-sans text-xs uppercase tracking-[0.12em] bg-ink text-paper px-5 py-2 hover:bg-accent transition-colors"
          >
            Sì, rigenera
          </button>
          <button
            onClick={onCancel}
            className="font-sans text-xs uppercase tracking-[0.12em] text-muted border border-rule px-5 py-2 hover:border-ink hover:text-ink transition-colors"
          >
            Annulla
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ReaderProfile() {
  const [profile, setProfile] = useState(null)   // { id, content, generated_at }
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)
  const [showConfirm, setShowConfirm] = useState(false)

  const [aiEnabled, setAiEnabled] = useState(() => localStorage.getItem('ai-enabled') === 'true')
  function toggleAI() {
    const newValue = !aiEnabled
    setAiEnabled(newValue)
    localStorage.setItem('ai-enabled', String(newValue))
  }

  useEffect(() => {
    fetchProfile()
  }, [])

  async function fetchProfile() {
    setLoading(true)
    const { data } = await supabase
      .from('reader_profile')
      .select('*')
      .order('generated_at', { ascending: false })
      .limit(1)
    setProfile(data?.[0] ?? null)
    setLoading(false)
  }

  async function handleGenerate() {
    setShowConfirm(false)
    setGenerating(true)
    setError(null)

    try {
      const { data: books, error: booksError } = await supabase
        .from('books')
        .select('title, author, rating')
        .eq('status', 'read')

      if (booksError) throw new Error(booksError.message)

      const content = await generateProfile(books ?? [])
      const now = new Date().toISOString()

      if (profile) {
        // Overwrite existing row
        const { error: updateError } = await supabase
          .from('reader_profile')
          .update({ content, generated_at: now })
          .eq('id', profile.id)
        if (updateError) throw new Error(updateError.message)
        setProfile({ ...profile, content, generated_at: now })
      } else {
        // Insert first row
        const { data: inserted, error: insertError } = await supabase
          .from('reader_profile')
          .insert({ content, generated_at: now })
          .select()
          .single()
        if (insertError) throw new Error(insertError.message)
        setProfile(inserted)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  function handleRegenerateClick() {
    if (profile) {
      setShowConfirm(true)
    } else {
      handleGenerate()
    }
  }

  return (
    <main className="max-w-[800px] mx-auto px-6 py-12">
      {showConfirm && (
        <ConfirmDialog
          onConfirm={handleGenerate}
          onCancel={() => setShowConfirm(false)}
        />
      )}

      <header className="mb-10">
        <h1 className="font-display italic font-black text-5xl sm:text-6xl text-ink leading-none mb-3">
          Il mio profilo di lettore
        </h1>
        <p className="font-sans font-light text-sm tracking-wide text-muted">
          Un'analisi della tua identità culturale attraverso i libri che hai letto
        </p>
        <hr className="mt-6 border-rule" />
      </header>

      {loading ? (
        <div className="flex flex-col gap-4 pt-4">
          <div className="h-3 bg-rule animate-pulse w-full" />
          <div className="h-3 bg-rule animate-pulse w-11/12" />
          <div className="h-3 bg-rule animate-pulse w-4/5" />
          <div className="h-3 bg-rule animate-pulse w-11/12" />
          <div className="h-3 bg-rule animate-pulse w-3/5" />
        </div>
      ) : generating ? (
        <div>
          <p className="font-display italic text-2xl text-muted mb-6">
            L'AI sta analizzando la tua biblioteca…
          </p>
          <div className="flex flex-col gap-3 max-w-lg">
            <div className="h-3 bg-rule animate-pulse w-full" />
            <div className="h-3 bg-rule animate-pulse w-11/12" />
            <div className="h-3 bg-rule animate-pulse w-4/5" />
            <div className="h-3 bg-rule animate-pulse w-11/12" />
            <div className="h-3 bg-rule animate-pulse w-3/5" />
          </div>
        </div>
      ) : profile ? (
        <div>
          <p className="font-sans text-xs italic mb-8" style={{ color: '#6B6B6B' }}>
            Aggiornato il {formatDate(profile.generated_at)}
          </p>

          <ProfileContent content={profile.content} />

          <div className="mt-12 pt-6 border-t border-rule flex items-center gap-4 flex-wrap">
            {aiEnabled && (
              <button
                onClick={handleRegenerateClick}
                className="font-sans text-xs uppercase tracking-[0.12em] text-ink border border-ink px-4 py-2 hover:bg-ink hover:text-paper transition-colors"
              >
                Rigenera profilo
              </button>
            )}
            <button
              onClick={toggleAI}
              className="inline-flex items-center gap-1.5 font-sans text-[11px] px-3 py-1.5 border border-rule text-muted hover:border-ink hover:text-ink transition-colors"
            >
              <Sparkles size={11} strokeWidth={1.75} className={aiEnabled ? 'text-accent' : ''} />
              {aiEnabled ? 'AI attiva' : 'AI disattivata'}
            </button>
          </div>
        </div>
      ) : (
        <div className="py-12">
          <p className="font-display italic text-xl text-muted mb-8">
            Non hai ancora un profilo di lettore.
          </p>
          <div className="flex items-center gap-4 flex-wrap">
            {aiEnabled && (
              <button
                onClick={handleRegenerateClick}
                className="font-sans text-xs uppercase tracking-[0.15em] bg-ink text-paper px-8 py-3 hover:bg-accent transition-colors"
              >
                Genera il mio profilo
              </button>
            )}
            <button
              onClick={toggleAI}
              className="inline-flex items-center gap-1.5 font-sans text-[11px] px-3 py-1.5 border border-rule text-muted hover:border-ink hover:text-ink transition-colors"
            >
              <Sparkles size={11} strokeWidth={1.75} className={aiEnabled ? 'text-accent' : ''} />
              {aiEnabled ? 'AI attiva' : 'AI disattivata'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="font-sans text-xs text-accent mt-6">Errore: {error}</p>
      )}
    </main>
  )
}
