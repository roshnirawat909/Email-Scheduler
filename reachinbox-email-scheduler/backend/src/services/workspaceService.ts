import { randomBytes } from 'node:crypto'
import { prisma } from '../config/prisma.js'

function createSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)

  return `${base || 'workspace'}-${randomBytes(4).toString('hex')}`
}

export async function getOrCreateDefaultWorkspace(
  userId: string,
  userName: string,
) {
  const existingMembership = await prisma.workspaceMember.findFirst({
    where: { userId },
    include: { workspace: true },
    orderBy: { createdAt: 'asc' },
  })

  if (existingMembership) return existingMembership

  return prisma.$transaction(async (transaction) => {
    const membership = await transaction.workspaceMember.findFirst({
      where: { userId },
      include: { workspace: true },
      orderBy: { createdAt: 'asc' },
    })

    if (membership) return membership

    const workspace = await transaction.workspace.create({
      data: {
        name: `${userName}'s Workspace`,
        slug: createSlug(userName),
      },
    })

    return transaction.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId,
        role: 'ADMIN',
      },
      include: { workspace: true },
    })
  })
}
