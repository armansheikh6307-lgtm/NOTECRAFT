import './env.js'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  console.warn('[db] Warning: DATABASE_URL environment variable is not defined.')
}

const adapter = connectionString ? new PrismaPg({ connectionString }) : undefined
export const prisma = new PrismaClient(adapter ? { adapter } : undefined)
