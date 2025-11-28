import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import routes from './routes.js'

const app = express()
const port = process.env.PORT || 8080
const allowedOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173'
const mode = process.env.SKIP_DB === 'true' ? 'stub' : 'db'

app.use(cors({ origin: allowedOrigin, credentials: true }))
app.use(express.json())

app.use('/api', routes)

async function startServer() {
  if (mode !== 'db') {
    console.log('SKIP_DB=true -> running in stub mode')
  }

  app.listen(port, () => {
    console.log(`DS Proforma backend running on port ${port} (${mode} mode)`)
  })
}

startServer()
