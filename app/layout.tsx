import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'VibeQuiz — Real-Time Multiplayer Quizzes',
  description:
    'Host live, multiplayer quiz games for up to 300 players. Create quizzes, share a room code, and compete in real time.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  )
}
