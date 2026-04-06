import type { NextAuthConfig } from 'next-auth'

export const authConfig = {
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role
        token.id = user.id
        token.lastName = (user as any).lastName
        token.avatar = (user as any).avatar
      }

      return token
    },
    async session({ session, token }) {
      if (session.user) {
        ;(session.user as any).role = token.role
        ;(session.user as any).id = token.id
        ;(session.user as any).lastName = token.lastName
        ;(session.user as any).avatar = token.avatar
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
