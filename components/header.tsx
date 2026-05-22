'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/app/providers'
import { useState } from 'react'

export function Header() {
  const { session, loading, signOut } = useAuth()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleLogout = async () => {
    try {
      await signOut()
      router.push('/auth/login')
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  return (
    <header className="px-4 pt-4">
      <div className="max-w-2xl mx-auto rounded-2xl overflow-hidden shadow bg-white/70 border border-white/60">
        <div className="h-2 w-full flex">
          <span className="w-1/6 bg-[#0b3d6e]" />
          <span className="w-1/6 bg-[#6794c1]" />
          <span className="w-1/6 bg-[#ff6a00]" />
          <span className="w-1/6 bg-[#f1ad63]" />
          <span className="w-1/6 bg-[#3a4f64]" />
          <span className="w-1/6 bg-[#e6d1b7]" />
        </div>
        <div className="py-4 px-6 text-[#0b3d6e] flex items-center justify-between">
          <Link href="/" className="text-xl font-bold tracking-tight">
            Expense Splitter
          </Link>

          {!loading && (
            <div className="flex items-center gap-4">
              {session ? (
                <div className="relative">
                  <button
                    onClick={() => setMenuOpen(!menuOpen)}
                    className="flex items-center gap-2 px-3 py-1 rounded-lg hover:bg-slate-100 transition text-sm"
                  >
                    <span className="text-slate-600">{session.user?.email}</span>
                    <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {menuOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-slate-200 z-10">
                      <div className="p-2">
                        <button
                          onClick={handleLogout}
                          className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition"
                        >
                          Sign Out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex gap-2">
                  <Link
                    href="/auth/login"
                    className="px-4 py-1 text-sm font-medium text-blue-600 hover:text-blue-700"
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/auth/signup"
                    className="px-4 py-1 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                  >
                    Sign Up
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
