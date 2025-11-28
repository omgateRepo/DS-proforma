import pkg from '@prisma/client'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'

const { PrismaClient } = pkg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
})

const adapter = new PrismaPg(pool)

const prisma = new PrismaClient({ adapter })

export default prisma

