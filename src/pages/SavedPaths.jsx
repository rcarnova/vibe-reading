import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
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

// ─── Content renderer (reuses ReadingPath editorial style) ────────────────────

function parseResult(text) {
  const titleMatch =
    text.match(/(?:titolo[^:]*:|percorso[^:]*:)\s*[*"«]?([^\n*"»]+)[*"»]?/i) ||
    text.match(/\*\*([^*\n]{5,60})\*\*\s*$/)
  const pathTitle = titleMatch ? titleMatch[1].trim() : null

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

function PathContent({ content }) {
  const { pathTitle, sections, raw } = parseResult(content)

  return (
    <div className="mt-6">
      {pathTitle && (
        <h3 className="font-display italic font-black text-2xl text-accent leading-tight mb-6">
          {pathTitle}
        </h3>
      )}

      <div className="flex flex-col gap-6">
        {sections.map((section, i) => {
          if (!section.heading && !section.body.length) return null
          return (
            <div key={i}>
              {section.heading && (
                <p className="font-sans text-[9px] uppercase tracking-[0.18em] text-muted mb-2">
                  {section.heading.replace(/^\d+\.\s*/, '').replace(/\*\*/g, '')}
                </p>
              )}
              <p className="font-serif text-sm leading-relaxed text-ink">
                {section.body.join(' ').replace(/\*\*/g, '')}
              </p>
            </div>
          )
        })}
      </div>

      {sections.length === 0 && (
        <p className="font-serif text-sm leading-relaxed text-ink whitespace-pre-wrap">{raw}</p>
      )}
    </div>
  )
}

// ─── Path card ────────────────────────────────────────────────────────────────

function PathCard({ path }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border-b border-rule py-6">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left group"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="font-display font-bold text-xl text-ink leading-snug group-hover:text-accent transition-colors">
              {path.title}
            </h2>
            <p className="font-sans text-[10px] text-muted mt-1">
              {formatDate(path.created_at)}
            </p>
          </div>
          <span className="font-sans text-[10px] text-muted mt-1 shrink-0">
            {expanded ? '↑' : '↓'}
          </span>
        </div>

        {/* Context pills */}
        {path.contexts?.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {path.contexts.map((ctx) => (
              <span
                key={ctx}
                className="font-sans text-[9px] uppercase tracking-wide px-2 py-1 border border-rule text-muted"
              >
                {ctx}
              </span>
            ))}
          </div>
        )}
      </button>

      {expanded && <PathContent content={path.content} />}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SavedPaths() {
  const [paths, setPaths] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchPaths() {
      const { data, error } = await supabase
        .from('reading_paths')
        .select('*')
        .order('created_at', { ascending: false })
      if (!error) setPaths(data ?? [])
      setLoading(false)
    }
    fetchPaths()
  }, [])

  return (
    <main className="max-w-[800px] mx-auto px-6 py-12">
      <header className="mb-10">
        <h1 className="font-display italic font-black text-5xl sm:text-6xl text-ink leading-none mb-3">
          I miei percorsi
        </h1>
        <p className="font-sans font-light text-sm tracking-wide text-muted">
          I percorsi di lettura che hai generato e salvato
        </p>
        <hr className="mt-6 border-rule" />
      </header>

      {loading ? (
        <div className="flex flex-col gap-4 pt-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="border-b border-rule py-6">
              <div className="h-5 bg-rule animate-pulse w-2/3 mb-2" />
              <div className="h-3 bg-rule animate-pulse w-24" />
            </div>
          ))}
        </div>
      ) : paths.length === 0 ? (
        <div className="py-28 text-center">
          <p className="font-display italic text-xl text-muted mb-4">
            Nessun percorso salvato.
          </p>
          <Link
            to="/reading-path"
            className="font-sans text-xs uppercase tracking-[0.12em] text-muted hover:text-ink border-b border-transparent hover:border-ink transition-colors"
          >
            Genera il tuo primo percorso →
          </Link>
        </div>
      ) : (
        <div className="border-t border-rule">
          {paths.map((path) => (
            <PathCard key={path.id} path={path} />
          ))}
        </div>
      )}
    </main>
  )
}
