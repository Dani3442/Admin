import NextAuth from 'next-auth'
import bcrypt from 'bcryptjs'
import Credentials from 'next-auth/providers/credentials'
import { authConfig } from './auth.config'
import { prisma } from './prisma'

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        })

        if (!user || !user.isActive) return null

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.password
        )

        if (!isValid) return null

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        }
      },
    }),
  ],
})

// Permission system (string-based roles for SQLite)
export enum Permission {
  VIEW_ALL_PRODUCTS = 'VIEW_ALL_PRODUCTS',
  VIEW_OWN_PRODUCTS = 'VIEW_OWN_PRODUCTS',
  EDIT_STAGES = 'EDIT_STAGES',
  EDIT_DATES = 'EDIT_DATES',
  MANAGE_AUTOMATIONS = 'MANAGE_AUTOMATIONS',
  ADD_COMMENTS = 'ADD_COMMENTS',
  MANAGE_USERS = 'MANAGE_USERS',
  VIEW_ANALYTICS = 'VIEW_ANALYTICS',
  ACCESS_SETTINGS = 'ACCESS_SETTINGS',
  DELETE_PRODUCTS = 'DELETE_PRODUCTS',
  IMPORT_DATA = 'IMPORT_DATA',
}

export function hasPermission(role: string, permission: Permission): boolean {
  const permissions: Record<string, Permission[]> = {
    ADMIN: Object.values(Permission),
    DIRECTOR: [
      Permission.VIEW_ALL_PRODUCTS, Permission.EDIT_STAGES, Permission.EDIT_DATES,
      Permission.VIEW_ANALYTICS, Permission.ADD_COMMENTS, Permission.MANAGE_AUTOMATIONS,
    ],
    PRODUCT_MANAGER: [
      Permission.VIEW_ALL_PRODUCTS, Permission.EDIT_STAGES, Permission.EDIT_DATES,
      Permission.ADD_COMMENTS, Permission.VIEW_ANALYTICS,
    ],
    EMPLOYEE: [Permission.VIEW_ALL_PRODUCTS, Permission.ADD_COMMENTS, Permission.EDIT_STAGES],
    VIEWER: [Permission.VIEW_ALL_PRODUCTS, Permission.VIEW_ANALYTICS],
  }
  return permissions[role]?.includes(permission) ?? false
}
