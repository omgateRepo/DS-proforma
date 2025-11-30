import 'dotenv/config'
import { afterAll, describe, expect, it } from 'vitest'
import prisma from '../src/prisma.js'

const shouldSkip = process.env.SKIP_DB_TESTS === '1'

const suite = (shouldSkip ? describe.skip : describe)('database smoke tests', () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be set for DB smoke tests')
  }

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('can read project detail + cost items', async () => {
    const project = await prisma.projects.findFirst({
      where: { deleted_at: null },
      select: { id: true },
    })
    expect(project).toBeTruthy()
    const costs = await prisma.cost_items.findMany({ take: 1 })
    expect(Array.isArray(costs)).toBe(true)
  })
})

export default suite

