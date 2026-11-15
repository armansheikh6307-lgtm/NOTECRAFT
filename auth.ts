import './env.js'
import type { Request, Response, NextFunction } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const FALLBACK_SECRET = 'notecraft_fallback_secret_key_change_in_production'
const rawSecret = process.env.JWT_SECRET?.trim()

if (process.env.NODE_ENV === 'production' && (!rawSecret || rawSecret === FALLBACK_SECRET)) {
  throw new Error('FATAL SECURITY ERROR: JWT_SECRET must be set to a secure unique secret in production.')
}

export const JWT_SECRET = rawSecret || FALLBACK_SECRET

export interface AuthUser {
  userId: string
  email: string
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser
}

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10)
  return bcrypt.hash(password, salt)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function generateToken(user: AuthUser): string {
  return jwt.sign({ userId: user.userId, email: user.email }, JWT_SECRET, {
    expiresIn: '7d',
  })
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Missing Bearer token.' })
    return
  }

  const token = authHeader.split(' ')[1]
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload
    if (!payload.userId || !payload.email) {
      res.status(401).json({ error: 'Invalid token payload.' })
      return
    }
    req.user = {
      userId: String(payload.userId),
      email: String(payload.email),
    }
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired session token.' })
  }
}
