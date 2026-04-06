import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Product Admin — Управление продуктами',
  description: 'Система управления продуктами, этапами и сроками',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  )
}
