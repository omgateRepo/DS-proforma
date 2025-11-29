const realm = 'DS-Proforma'

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

export default function createBasicAuthMiddleware({
  username,
  password,
  enabled = true,
  bypass = [],
}) {
  if (!enabled || !username || !password) {
    return (_req, _res, next) => next()
  }

  const normalizedBypass = bypass
    .filter(Boolean)
    .map((item) => item.toLowerCase())

  return function basicAuth(req, res, next) {
    const requestPath = `${req.baseUrl || ''}${req.path || ''}`.toLowerCase()
    if (normalizedBypass.some((path) => requestPath.startsWith(path))) {
      return next()
    }

    const credentials = parseBasic(req.headers.authorization)
    if (!credentials || credentials.username !== username || credentials.password !== password) {
      res.setHeader('WWW-Authenticate', `Basic realm="${realm}", charset="UTF-8"`)
      return res.status(401).json({ error: 'Authentication required' })
    }
    return next()
  }
}

