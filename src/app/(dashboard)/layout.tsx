import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { userProfileSelect } from '@/lib/user-profile'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const currentUser = await prisma.user.findUnique({
    where: { id: (session.user as any).id },
    select: {
      id: true,
      email: true,
      name: true,
      lastName: true,
      role: true,
      avatar: true,
      jobTitle: true,
      department: true,
      employeeType: true,
      verificationStatus: true,
      isActive: true,
    },
  })

  return (
    <DashboardShell user={(currentUser || session.user) as any}>{children}</DashboardShell>
  )
}
