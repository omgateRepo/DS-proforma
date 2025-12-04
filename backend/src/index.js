import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'
import routes from './routes.js'
import createAuthMiddleware from './middleware/auth.js'

const app = express()
const port = process.env.PORT || 8080
const allowedOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173'
const mode = process.env.SKIP_DB === 'true' ? 'stub' : 'db'
const isProduction = process.env.NODE_ENV === 'production'
const jsonBodyLimit = process.env.JSON_BODY_LIMIT || '1mb'
const rateLimitWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000)
const rateLimitMax = Number(process.env.RATE_LIMIT_MAX || 300)
const skipRateLimit = process.env.SKIP_RATE_LIMIT === 'true'
const skipAuth = process.env.SKIP_AUTH === 'true'

app.disable('x-powered-by')
app.set('trust proxy', 1)

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
)
app.use(cors({ origin: allowedOrigin, credentials: true }))
app.use(morgan(isProduction ? 'combined' : 'dev'))
app.use(express.json({ limit: jsonBodyLimit }))

const apiLimiter = rateLimit({
  windowMs: rateLimitWindowMs,
  max: rateLimitMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => skipRateLimit,
  handler: (req, res) => {
    res.status(429).json({ error: 'Too many requests, please slow down.' })
  },
})

const authMiddleware = createAuthMiddleware({
  enabled: !skipAuth,
  bypass: [
    '/api/geocode/satellite',
    '/geocode/satellite',
    '/api/geocode/front',
    '/geocode/front',
    '/api/geocode/search',
    '/geocode/search',
  ],
})

app.use('/api', authMiddleware, apiLimiter, routes)

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' })
})

app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500
  const message = err.message || 'Unexpected error'
  const response = { error: message }
  if (!isProduction) {
    response.details = err.stack
  }
  console.error('Request error:', message, err.stack)
  res.status(status).json(response)
})

async function startServer() {
  if (mode !== 'db') {
    console.log('SKIP_DB=true -> running in stub mode')
  }

  app.listen(port, () => {
    console.log(`DS Proforma backend running on port ${port} (${mode} mode)`)
  })
}

startServer()
