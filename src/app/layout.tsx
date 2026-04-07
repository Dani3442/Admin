import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import './globals.css'

export const metadata: Metadata = {
  title: 'Product Admin — Управление продуктами',
  description: 'Система управления продуктами, этапами и сроками',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={GeistSans.variable}>
      <body className={`${GeistSans.className} font-sans`}>{children}</body>
    </html>
  )
}
