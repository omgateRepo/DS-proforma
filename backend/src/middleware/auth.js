import bcrypt from 'bcryptjs'
import prisma from '../prisma.js'

const realm = 'DS-Proforma'
const SKIP_DB = process.env.SKIP_DB === 'true'
const fallbackUsername = process.env.RENDER_AUTH_USER || process.env.BASIC_AUTH_USER
const fallbackPassword = process.env.RENDER_AUTH_PASSWORD || process.env.BASIC_AUTH_PASSWORD

function parseBasic(headerValue) {
  if (!headerValue || typeof headerValue !== 'string') return null
  const [scheme, token] = headerValue.split(' ')
  if (!scheme || scheme.toLowerCase() !== 'basic' || !token) return null
  try {
    const decoded = Buffer.from(token, 'base64').toString()
    const separatorIndex = decoded.indexOf(':')
    if (separatorIndex === -1) return null
    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    }
  } catch {
    return null
  }
}

function unauthorized(res) {
  res.setHeader('WWW-Authenticate', `Basic realm="${realm}", charset="UTF-8"`)
  return res.status(401).json({ error: 'Authentication required' })
}

export default function createAuthMiddleware({ enabled = true, bypass = [] } = {}) {
  if (!enabled) {
    return (_req, _res, next) => next()
  }

  const normalizedBypass = bypass.filter(Boolean).map((item) => item.toLowerCase())

  return async function authMiddleware(req, res, next) {
    const requestPath = `${req.baseUrl || ''}${req.path || ''}`.toLowerCase()
    if (normalizedBypass.some((path) => requestPath.startsWith(path))) {
      return next()
    }

    const credentials = parseBasic(req.headers.authorization)
    if (!credentials) {
      return unauthorized(res)
    }

    try {
      if (SKIP_DB) {
        if (fallbackUsername && fallbackPassword && credentials.username === fallbackUsername && credentials.password === fallbackPassword) {
          req.user = {
            id: 'stub-super-admin',
            email: fallbackUsername,
            displayName: fallbackUsername,
            isSuperAdmin: true,
          }
          return next()
        }
        return unauthorized(res)
      }

      const email = credentials.username.toLowerCase()
      const user = await prisma.users.findUnique({
        where: { email },
      })
      if (!user) {
        return unauthorized(res)
      }
      const valid = await bcrypt.compare(credentials.password, user.password_hash)
      if (!valid) {
        return unauthorized(res)
      }

      req.user = {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        isSuperAdmin: user.is_super_admin,
      }
      return next()
    } catch (err) {
      return next(err)
    }
  }
}

