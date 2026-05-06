import { useState } from 'react'
import { supabase } from '../lib/supabase'

const GENRES = [
  'Narrativa italiana', 'Narrativa straniera', 'Saggistica',
  'Psicologia', 'Leadership e management', 'Vendita e business',
  'Creatività', 'Filosofia', 'Storia', 'Biografie e memorie',
  'Thriller e noir', 'Fantascienza e distopia', 'Poesia e teatro',
  'Comunicazione e media', 'Crescita personale', 'Scienza e tecnologia',
  'Arte e design',
]

export function ClassifyButton() {
  const [status, setStatus] = useState('idle')
  const [progress, setProgress] = useState({ current: 0, total: 0 })

  const classify = async () => {
    setStatus('running')

    const { data: books } = await supabase
      .from('books')
      .select('id, title, author, genre')
      .is('genre', null)

    if (!books?.length) {
      setStatus('done')
      return
    }

    setProgress({ current: 0, total: books.length })

    for (let i = 0; i < books.length; i += 3) {
      const batch = books.slice(i, i + 3)

      await Promise.all(batch.map(async (book) => {
        try {
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
              max_tokens: 20,
              messages: [{
                role: 'user',
                content: `Classify "${book.title}" by ${book.author} into exactly ONE genre from: ${GENRES.join(', ')}. Reply with ONLY the genre name.`,
              }],
            }),
          })
          const data = await res.json()
          const genre = data.content?.[0]?.text?.trim()

          if (genre && GENRES.includes(genre)) {
            await supabase.from('books').update({ genre }).eq('id', book.id)
          }
        } catch (err) {
          console.error('Failed:', book.title, err)
        }
      }))

      setProgress({ current: Math.min(i + 3, books.length), total: books.length })
      await new Promise((r) => setTimeout(r, 3000))
    }

    setStatus('done')
  }

  if (!import.meta.env.DEV) return null

  return (
    <div className="flex items-center justify-center gap-4 py-4 border-t border-rule mt-8">
      {status === 'idle' && (
        <button
          onClick={classify}
          className="font-sans text-xs uppercase tracking-[0.14em] border border-ink text-ink hover:bg-ink hover:text-paper transition-colors px-4 py-2"
        >
          Classifica generi mancanti
        </button>
      )}
      {status === 'running' && (
        <p className="font-sans text-xs text-muted">
          Classificando… <span className="font-bold text-ink">{progress.current}/{progress.total}</span>
        </p>
      )}
      {status === 'done' && (
        <p className="font-sans text-xs text-[#2D6A4F]">Classificazione completata ✓</p>
      )}
    </div>
  )
}
