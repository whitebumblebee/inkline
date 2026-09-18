import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  css: { postcss: {} },
  resolve: {
    alias: {
      vscode: resolve(__dirname, 'test/vscode.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
