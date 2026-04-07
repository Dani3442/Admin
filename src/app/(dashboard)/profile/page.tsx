import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canEditOperationalProfileFields, userProfileSelect } from '@/lib/user-profile'
import { UserProfileClient } from '@/components/users/UserProfileClient'

export default async function ProfilePage() {
  const session = await auth()
  const viewer = session?.user as any

  if (!viewer?.id) {
    redirect('/login')
  }

  const profile = await prisma.user.findUnique({
    where: { id: viewer.id },
    select: userProfileSelect,
  })

  if (!profile) {
    redirect('/dashboard')
  }

  return (
    <UserProfileClient
      profile={profile as any}
      viewer={{ id: viewer.id, role: viewer.role }}
      permissions={{
        canEditPersonal: true,
        canEditOperational: canEditOperationalProfileFields(viewer.role, viewer.id, profile.id, profile.role),
        canEditSensitive: false,
        canDeleteUser: false,
      }}
    />
  )
}
