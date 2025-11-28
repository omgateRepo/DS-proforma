import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Force Rollup to skip native bindings when building in environments
// (like Render) where optional deps may be trimmed.
if (!process.env.ROLLUP_SKIP_NATIVE) {
  process.env.ROLLUP_SKIP_NATIVE = '1'
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
})
