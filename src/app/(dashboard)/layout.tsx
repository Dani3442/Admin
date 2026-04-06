import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
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
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar user={(currentUser || session.user) as any} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header user={(currentUser || session.user) as any} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
