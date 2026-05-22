'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function VerifyEmailPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')

  useEffect(() => {
    // Get email from URL params if available
    const params = new URLSearchParams(window.location.search)
    const emailParam = params.get('email')
    if (emailParam) {
      setEmail(emailParam)
    }
  }, [])

  return (
    <div className="min-h-[72vh] flex items-start sm:items-center justify-center bg-white px-4 pt-6 sm:pt-0">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 sm:p-8 text-center">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-navy-900 mb-2">Check Your Email</h1>
          <p className="text-slate-600 mb-4">
            We've sent a confirmation link to <span className="font-semibold">{email || 'your email'}</span>
          </p>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-sm text-blue-800">
            <p>Click the link in the email to confirm your account. Once confirmed, you can sign in.</p>
          </div>

          <p className="text-slate-600 text-sm mb-6">
            Didn't receive the email? Check your spam folder or try signing up again.
          </p>

          <Link
            href="/auth/login"
            className="inline-block bg-blue-600 text-white font-semibold py-2 px-6 rounded-lg hover:bg-blue-700 transition"
          >
            Go to Sign In
          </Link>
        </div>
      </div>
    </div>
  )
}
