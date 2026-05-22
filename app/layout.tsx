import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Expense Splitter',
  description: 'Track and split expenses with friends',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
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
            <div className="py-4 px-6 text-[#0b3d6e]">
              <a href="/" className="text-xl font-bold tracking-tight">
                Expense Splitter
              </a>
            </div>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  )
}
