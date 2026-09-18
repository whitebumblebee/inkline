import { build } from 'esbuild'

await build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  minify: process.env.NODE_ENV === 'production',
  sourcemap: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'dist/extension.js',
  external: ['vscode'],
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'development'),
  },
})
