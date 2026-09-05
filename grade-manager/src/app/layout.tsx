import './globals.css'
import { Manrope, IBM_Plex_Mono } from 'next/font/google'

// Кирилицата е задължителна — целият интерфейс е на български.
const manrope = Manrope({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ui-next',
  display: 'swap',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500'],
  variable: '--font-mono-next',
  display: 'swap',
})

export const metadata = {
  title: 'Grade Manager',
  description: 'GitHub Classroom Grade Management System',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="bg">
      <body className={`${manrope.variable} ${plexMono.variable}`}>{children}</body>
    </html>
  )
}
