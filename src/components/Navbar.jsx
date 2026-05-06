import { useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import VibeLogo from './VibeLogo'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

const NAV_LINKS = [
  { to: '/biblioteca', label: 'Biblioteca' },
  { to: '/reading-path', label: 'Percorso di lettura' },
  { to: '/percorsi-salvati', label: 'Percorsi salvati' },
  { to: '/profilo', label: 'Profilo' },
  { to: '/add-book', label: 'Aggiungi libro' },
  { to: '/importa', label: 'Importa' },
]

export default function Navbar() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const isHome = pathname === '/'
  const { user } = useAuth()

  return (
    <>
      <nav
        className={`z-20 transition-colors duration-300 ${
          isHome
            ? 'fixed top-0 left-0 right-0 bg-transparent'
            : 'sticky top-0 bg-paper border-b-2 border-ink'
        }`}
      >
        <div className="max-w-[1200px] mx-auto px-6 py-4">
          <div
            className={`relative flex items-center py-3 ${
              isHome ? 'justify-start' : 'justify-center border-t border-b border-ink'
            }`}
          >
            {/* Burger — left */}
            <button
              onClick={() => setOpen(true)}
              aria-label="Apri menu"
              className={`p-1 transition-colors ${
                isHome ? 'text-white hover:text-white/70' : 'absolute left-0 text-ink hover:text-muted'
              }`}
            >
              <Menu size={20} strokeWidth={1.75} />
            </button>

            {/* Logo — center, hidden on home */}
            {!isHome && (
              <Link to="/" className="inline-block">
                <VibeLogo size="sm" theme="dark" />
              </Link>
            )}

            {/* Auth control — right */}
            <div className="absolute right-0">
              {user ? (
                <button
                  onClick={() => supabase.auth.signOut()}
                  className={`font-sans text-[10px] uppercase tracking-[0.15em] transition-colors ${
                    isHome ? 'text-white/70 hover:text-white' : 'text-muted hover:text-ink'
                  }`}
                >
                  Esci
                </button>
              ) : (
                <Link
                  to="/login"
                  className={`font-sans text-[10px] uppercase tracking-[0.15em] transition-colors ${
                    isHome ? 'text-white/70 hover:text-white' : 'text-muted hover:text-ink'
                  }`}
                >
                  Accedi
                </Link>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Overlay */}
      <div
        className={`fixed inset-0 z-30 bg-black/40 transition-opacity duration-300 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* Slide-in drawer */}
      <div
        className={`fixed top-0 left-0 z-40 h-full w-72 bg-paper shadow-2xl transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b-2 border-ink">
          <span className="font-display font-black text-2xl text-ink leading-none">Vibe Reading</span>
          <button
            onClick={() => setOpen(false)}
            aria-label="Chiudi menu"
            className="text-ink hover:text-muted transition-colors p-1"
          >
            <X size={20} strokeWidth={1.75} />
          </button>
        </div>

        <nav className="flex flex-col px-6 pt-4">
          {NAV_LINKS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `font-sans text-xs uppercase tracking-[0.18em] py-4 border-b border-rule transition-colors ${
                  isActive ? 'text-ink' : 'text-muted hover:text-ink'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </>
  )
}
