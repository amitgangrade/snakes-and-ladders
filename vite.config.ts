import { defineConfig } from 'vite'

// base './' so the site works at https://<user>.github.io/<repo>/ without config
export default defineConfig({
  base: './',
  server: { port: Number(process.env.PORT) || 5173 },
  build: { target: 'es2020' },
})
