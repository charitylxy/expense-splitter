import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(new URL(`/auth/login?error=${error}`, request.url))
  }

  if (code) {
    // Code is exchanged for a session by Supabase on the client side
    // Redirect to home after successful login
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.redirect(new URL('/auth/login', request.url))
}

