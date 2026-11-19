#!/usr/bin/env node
/**
 * Bundles the core test suite with esbuild and runs it in Node.
 *
 * The suite lives in TypeScript and imports through the renderer's `@/` alias,
 * so it needs the same bundling step the app uses. esbuild is already a
 * transitive dependency of Vite, so this adds nothing to the dependency tree.
 *
 *   npm test
 */
import { build } from 'esbuild'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const outfile = resolve('.test-out/core.test.mjs')
mkdirSync(resolve('.test-out'), { recursive: true })

await build({
  entryPoints: [resolve('test/core.test.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile,
  logLevel: 'warning',
  alias: {
    '@': resolve('src/renderer/src'),
    '@shared': resolve('src/shared')
  }
})

await import(pathToFileURL(outfile).href)
