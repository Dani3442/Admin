import dynamic from 'next/dynamic'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

const UsersClient = dynamic(
  () => import('@/components/UsersClient').then((mod) => mod.UsersClient),
  {
    loading: () => <div className="surface-panel min-h-[540px] animate-pulse bg-muted/30" />,
  }
)

export default async function UsersPage() {
  const session = await auth()
  const role = (session?.user as any)?.role
  if (!['ADMIN', 'DIRECTOR'].includes(role)) redirect('/dashboard')

  const users = await prisma.user.findMany({
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
      createdAt: true,
      _count: { select: { assignedProducts: true } },
    },
    orderBy: { name: 'asc' },
  })

  return <UsersClient users={users as any} currentUserRole={role} />
}
