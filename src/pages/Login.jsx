import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import VibeLogo from '../components/VibeLogo'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const navigate = useNavigate()
  const location = useLocation()
  const successMessage = location.state?.message

  const inputClass = [
    'w-full bg-transparent font-sans text-sm text-ink placeholder:text-muted',
    'border-0 border-b-2 border-ink py-2 outline-none',
    'focus:border-accent transition-colors duration-150',
  ].join(' ')

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      setError('Email o password non corretti')
    } else {
      navigate('/')
    }
  }

  return (
    <main className="min-h-screen bg-paper flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex justify-center mb-10">
          <VibeLogo size="lg" theme="dark" />
        </div>

        <h1 className="font-display italic font-black text-3xl text-ink leading-tight mb-8 text-center">
          Accedi alla tua biblioteca
        </h1>

        {successMessage && (
          <p className="font-sans text-xs text-ink border border-ink px-4 py-2 mb-6 text-center">
            {successMessage}
          </p>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <div>
            <label className="block font-sans text-[9px] uppercase tracking-[0.18em] text-muted mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              className={inputClass}
              placeholder="tu@email.com"
            />
          </div>

          <div>
            <label className="block font-sans text-[9px] uppercase tracking-[0.18em] text-muted mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
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
            disabled={loading || !email || !password}
            className={[
              'font-sans text-xs uppercase tracking-[0.18em] px-8 py-3 mt-2 transition-colors',
              !loading && email && password
                ? 'bg-ink text-paper hover:bg-accent cursor-pointer'
                : 'bg-rule text-muted cursor-not-allowed',
            ].join(' ')}
          >
            {loading ? 'Accesso in corso…' : 'Accedi'}
          </button>
        </form>
      </div>
    </main>
  )
}
