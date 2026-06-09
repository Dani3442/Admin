const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const roleOverrides = [
  {
    email: 'shaykhutdinovaar@11i.pro',
    role: 'PRODUCT_MANAGER',
  },
]

async function main() {
  for (const override of roleOverrides) {
    const result = await prisma.user.updateMany({
      where: { email: override.email },
      data: { role: override.role },
    })

    if (result.count === 0) {
      console.warn(`Access override skipped: user ${override.email} was not found`)
      continue
    }

    console.log(`Access override applied: ${override.email} -> ${override.role}`)
  }
}

main()
  .catch((error) => {
    console.error('Failed to apply access overrides', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
