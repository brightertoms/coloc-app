import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './', // chemins relatifs, indispensable pour GitHub Pages (sous-dossier de repo)
})
