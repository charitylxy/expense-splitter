import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from './providers'
import { Header } from '@/components/header'

export const metadata: Metadata = {
  title: 'Expense Splitter',
  description: 'Track and split expenses with friends',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <AuthProvider>
          <Header />
          <main className="max-w-2xl mx-auto px-4 py-8">{children}</main>
        </AuthProvider>
      </body>
    </html>
  )
}
