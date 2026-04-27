#!/usr/bin/env node
import * as esbuild from 'esbuild'
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const outDir = join(root, 'public', 'assets')

mkdirSync(outDir, { recursive: true })

const min = process.env.MINIFY === '0' ? false : true

await esbuild.build({
  entryPoints: [join(root, 'client', 'src', 'main.tsx')],
  bundle: true,
  outfile: join(outDir, 'app.js'),
  format: 'esm',
  minify: min,
  sourcemap: true,
  jsx: 'automatic',
  jsxImportSource: 'preact',
  target: 'es2022',
  treeShaking: true,
  legalComments: 'none',
})

copyFileSync(join(root, 'client', 'src', 'app.css'), join(outDir, 'app.css'))
console.log('build-client → public/assets/app.js, app.css')
