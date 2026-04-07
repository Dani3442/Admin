import type { NextAuthConfig } from 'next-auth'

function normalizeSessionAvatar(avatar: unknown) {
  if (typeof avatar !== 'string') return null

  const trimmed = avatar.trim()
  if (!trimmed) return null

  // Do not store large data URLs inside JWT cookies.
  if (trimmed.startsWith('data:image/')) return null
  if (trimmed.length > 1024) return null

  return trimmed
}

export const authConfig = {
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role
        token.id = user.id
        token.lastName = (user as any).lastName
        token.avatar = normalizeSessionAvatar((user as any).avatar)
      }

      return token
    },
    async session({ session, token }) {
      if (session.user) {
        ;(session.user as any).role = token.role
        ;(session.user as any).id = token.id
        ;(session.user as any).lastName = token.lastName
        ;(session.user as any).avatar = normalizeSessionAvatar(token.avatar)
      }

      return session
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: { strategy: 'jwt' },
  secret: process.env.AUTH_SECRET,
  providers: [],
} satisfies NextAuthConfig
