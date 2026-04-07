import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  canDeleteUser,
  canEditOperationalProfileFields,
  canEditSensitiveProfileFields,
  canViewUserProfile,
  userProfileSelect,
} from '@/lib/user-profile'
import { UserProfileClient } from '@/components/users/UserProfileClient'

export default async function UserProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const viewer = session?.user as any
  const { id } = await params

  if (!viewer?.id) {
    redirect('/login')
  }

  if (viewer.id === id) {
    redirect('/profile')
  }

  const profile = await prisma.user.findUnique({
    where: { id },
    select: userProfileSelect,
  })

  if (!profile) {
    notFound()
  }

  if (!canViewUserProfile(viewer.role, viewer.id, profile.id)) {
    redirect('/dashboard')
  }

  return (
    <UserProfileClient
      profile={profile as any}
      viewer={{ id: viewer.id, role: viewer.role }}
      permissions={{
        canEditPersonal: canEditOperationalProfileFields(viewer.role, viewer.id, profile.id, profile.role),
        canEditOperational: canEditOperationalProfileFields(viewer.role, viewer.id, profile.id, profile.role),
        canEditSensitive: canEditSensitiveProfileFields(viewer.role, viewer.id, profile.id),
        canDeleteUser: canDeleteUser(viewer.role, viewer.id, profile.id, profile.role),
      }}
    />
  )
}
