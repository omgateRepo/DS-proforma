import bcrypt from 'bcryptjs'
import prisma from '../prisma.js'

const realm = 'DS-Proforma'
const SKIP_DB = process.env.SKIP_DB === 'true'
const envUsername = process.env.RENDER_AUTH_USER || process.env.BASIC_AUTH_USER
const envPassword = process.env.RENDER_AUTH_PASSWORD || process.env.BASIC_AUTH_PASSWORD

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

const stubUser = {
  id: 'stub-user',
  email: envUsername || 'stub@ds-proforma.local',
  displayName: 'Stub Admin',
  isSuperAdmin: true,
  synthetic: true,
}

export default function createAuthMiddleware({ enabled = true, bypass = [] } = {}) {
  if (!enabled) {
    return (_req, _res, next) => next()
  }

  const normalizedBypass = bypass.filter(Boolean).map((entry) => entry.toLowerCase())

  return async function authMiddleware(req, res, next) {
    const requestPath = (req.originalUrl || req.url || '').toLowerCase()
    
    // Debug logging for loan-application
    if (requestPath.includes('loan')) {
      console.log('AUTH DEBUG:', { requestPath, originalUrl: req.originalUrl, url: req.url })
    }
    
    // Allow loan-application endpoint without auth
    if (requestPath.includes('/loan-application')) {
      console.log('AUTH BYPASS: loan-application')
      return next()
    }
    
    if (
      requestPath.startsWith('/api/geocode/') ||
      requestPath.startsWith('/geocode/') ||
      normalizedBypass.some((prefix) => requestPath.startsWith(prefix))
    ) {
      return next()
    }

    const credentials = parseBasic(req.headers.authorization)
    if (!credentials) {
      return unauthorized(res)
    }

    const { username, password } = credentials

    // Always honor env credentials first to avoid lockouts
    if (envUsername && envPassword && username === envUsername && password === envPassword) {
      const baseUser = {
        id: 'env-super-admin',
        email: envUsername,
        displayName: envUsername,
        isSuperAdmin: true,
        synthetic: true,
      }
      if (!SKIP_DB) {
        const dbUser = await prisma.users.findUnique({
          where: { email: envUsername.toLowerCase() },
        })
        if (dbUser) {
          req.user = {
            id: dbUser.id,
            email: dbUser.email,
            displayName: dbUser.display_name || envUsername,
            isSuperAdmin: Boolean(dbUser.is_super_admin),
            synthetic: false,
          }
          return next()
        }
        const superAdmin = await prisma.users.findFirst({ where: { is_super_admin: true }, orderBy: { created_at: 'asc' } })
        if (superAdmin) {
          req.user = {
            id: superAdmin.id,
            email: superAdmin.email,
            displayName: superAdmin.display_name || envUsername,
            isSuperAdmin: true,
            synthetic: false,
          }
          return next()
        }
      }
      req.user = baseUser
      return next()
    }

    if (SKIP_DB) {
      req.user = stubUser
      return next()
    }

    try {
      const normalizedEmail = username?.toLowerCase()
      const user = await prisma.users.findUnique({
        where: { email: normalizedEmail },
      })
      if (!user) {
        return unauthorized(res)
      }

      const matches = await bcrypt.compare(password, user.password_hash)
      if (!matches) {
        return unauthorized(res)
      }

      req.user = {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        isSuperAdmin: user.is_super_admin,
        synthetic: false,
      }
      return next()
    } catch (err) {
      return next(err)
    }
  }
}

