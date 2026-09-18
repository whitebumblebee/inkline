import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: resolve(__dirname, 'webview'),
  base: './',
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'dist/webview'),
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      output: {
        format: 'iife',
        name: 'inklineWebview',
        inlineDynamicImports: true,
        entryFileNames: 'assets/index.js',
        assetFileNames: (asset) => asset.name?.endsWith('.css') ? 'assets/index.css' : 'assets/[name][extname]',
      },
    },
  },
})
