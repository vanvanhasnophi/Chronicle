#!/usr/bin/env node

/**
 * Chronicle Gen CLI
 *
 * Content generation entry point. Can be called standalone or from host.
 *
 * Usage:
 *   npx chronicle-gen build              Full SSG build
 *   npx chronicle-gen build --posts      Posts-only build
 *   npx chronicle-gen sync               Sync content from external sources
 *   npx chronicle-gen watch              Watch for file changes
 *
 * In the future, this will run independently as a CLI tool or be embedded
 * in the Electron desktop app.
 */

import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const command = process.argv[2] || 'help'

switch (command) {
  case 'build':
  case 'b': {
    console.log('[chronicle-gen] Starting build...')
    // Delegate to the builder module (imports build-worker logic)
    import('../src/builder/astro.js').then(({ runBuild }) => {
      runBuild(process.argv.slice(3)).catch((err) => {
        console.error('[chronicle-gen] Build failed:', err.message)
        process.exit(1)
      })
    })
    break
  }
  case 'sync':
  case 's': {
    console.log('[chronicle-gen] Sync not yet implemented (Notion, etc.)')
    break
  }
  case 'watch':
  case 'w': {
    console.log('[chronicle-gen] Watch not yet implemented')
    break
  }
  case 'help':
  case '--help':
  case '-h':
  default: {
    console.log(`Chronicle Gen — Content Generation Server

Usage: npx chronicle-gen <command> [options]

Commands:
  build, b     Run Astro SSG build
  sync, s      Sync content from external sources (Notion, etc.)
  watch, w     Watch for content changes and rebuild

Build Options:
  --posts      Posts-only build (skip full rebuild)
  --index      Index-only build
  --dir <path> Override build target directory
`)
    break
  }
}
