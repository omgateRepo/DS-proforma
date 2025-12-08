import { PrismaClient } from '@prisma/client'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
})

const adapter = new PrismaPg(pool)

const prisma = new PrismaClient({ adapter })

// Log available models for debugging (remove in production)
console.log('Prisma models available:', Object.keys(prisma).filter(k => !k.startsWith('_') && !k.startsWith('$')))

export default prisma

