import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Three independent build targets:
 *  - main    : Node context, CommonJS output, externalises node/electron built-ins
 *  - preload : must stay CommonJS because the renderer runs with sandbox: true
 *  - renderer: normal Vite React SPA, bundled (nothing is externalised)
 *
 * NOTE: package.json intentionally has no `"type": "module"`. A sandboxed preload
 * script cannot be an ES module, so keeping the whole project CJS is the only
 * configuration where `sandbox: true` and `contextIsolation: true` both hold.
 */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': resolve(__dirname, 'src/shared') }
    },
    build: {
      outDir: 'out/main',
      rollupOptions: { input: { index: resolve(__dirname, 'src/main/index.ts') } }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': resolve(__dirname, 'src/shared') }
    },
    build: {
      outDir: 'out/preload',
      rollupOptions: { input: { index: resolve(__dirname, 'src/preload/index.ts') } }
    }
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src'),
        '@shared': resolve(__dirname, 'src/shared')
      }
    },
    build: {
      outDir: 'out/renderer',
      chunkSizeWarningLimit: 2048,
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') }
      }
    }
  }
})
