import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  // passWithNoTests is removed in P3, when the first tests land
  test: { environment: 'node', include: ['src/**/*.test.ts'], passWithNoTests: true },
})
