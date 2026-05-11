import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import VibeLogo from '../components/VibeLogo'

export default function ResetPassword() {
  const [showForm, setShowForm] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setShowForm(true)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const inputClass = [
    'w-full bg-transparent font-sans text-sm text-ink placeholder:text-muted',
    'border-0 border-b-2 border-ink py-2 outline-none',
    'focus:border-accent transition-colors duration-150',
  ].join(' ')

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (newPassword !== confirmPassword) {
      setError('Le password non coincidono')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setLoading(false)
    if (error) {
      setError('Errore durante il salvataggio. Riprova.')
    } else {
      navigate('/login', { state: { message: 'Password aggiornata' } })
    }
  }

  return (
    <main className="min-h-screen bg-paper flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-10">
          <VibeLogo size="lg" theme="dark" />
        </div>

        <h1 className="font-display italic font-black text-3xl text-ink leading-tight mb-8 text-center">
          Reimposta password
        </h1>

        {!showForm ? (
          <p className="font-sans text-sm text-muted text-center">
            Verifica del link in corso…
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div>
              <label className="block font-sans text-[9px] uppercase tracking-[0.18em] text-muted mb-1">
                Nuova password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
                className={inputClass}
                placeholder="••••••••"
              />
            </div>

            <div>
              <label className="block font-sans text-[9px] uppercase tracking-[0.18em] text-muted mb-1">
                Conferma password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
                className={inputClass}
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="font-sans text-xs text-accent">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !newPassword || !confirmPassword}
              className={[
                'font-sans text-xs uppercase tracking-[0.18em] px-8 py-3 mt-2 transition-colors',
                !loading && newPassword && confirmPassword
                  ? 'bg-ink text-paper hover:bg-accent cursor-pointer'
                  : 'bg-rule text-muted cursor-not-allowed',
              ].join(' ')}
            >
              {loading ? 'Salvataggio…' : 'Salva nuova password'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
