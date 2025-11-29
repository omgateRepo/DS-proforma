#!/usr/bin/env node

/**
 * Ensures Rollup always finds a native binding by creating a shim
 * for @rollup/rollup-linux-x64-gnu that proxies to the wasm build.
 * This runs after npm install. On macOS (where a native binary exists)
 * the shim is skipped.
 */

const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..')
const nodeModulesDir = path.join(projectRoot, 'node_modules')
const shimDir = path.join(nodeModulesDir, '@rollup', 'rollup-linux-x64-gnu')
const nativeFile = path.join(shimDir, 'dist', 'native.js')

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true })
}

function writeFile(filePath, contents) {
  fs.writeFileSync(filePath, contents, 'utf8')
}

try {
  // If the official native binding (or a previous shim) already exists, skip.
  if (fs.existsSync(nativeFile)) {
    console.log('[rollup-shim] Native binding found — skipping shim.')
    process.exit(0)
  }

  const wasmPackageJson = require('@rollup/wasm-node/package.json')

  ensureDir(path.dirname(nativeFile))

  const pkgJsonPath = path.join(shimDir, 'package.json')
  const shimPackageJson = {
    name: '@rollup/rollup-linux-x64-gnu',
    version: wasmPackageJson.version,
    main: 'dist/native.js',
    module: 'dist/native.js',
    types: 'dist/native.d.ts'
  }
  writeFile(pkgJsonPath, JSON.stringify(shimPackageJson, null, 2))

  const shimSource = `const wasm = require('@rollup/wasm-node/dist/native.js')
module.exports = {
  parse: wasm.parse,
  parseAsync: wasm.parseAsync || (async (...args) => wasm.parse(...args)),
  xxhashBase64Url: wasm.xxhashBase64Url,
  xxhashBase36: wasm.xxhashBase36,
  xxhashBase16: wasm.xxhashBase16,
}
`
  writeFile(nativeFile, shimSource)
  writeFile(
    path.join(shimDir, 'dist', 'native.d.ts'),
    `import type * as Wasm from '@rollup/wasm-node/dist/native.js';
export const parse: typeof Wasm.parse;
export const parseAsync: typeof Wasm.parseAsync;
export const xxhashBase64Url: typeof Wasm.xxhashBase64Url;
export const xxhashBase36: typeof Wasm.xxhashBase36;
export const xxhashBase16: typeof Wasm.xxhashBase16;
`
  )

  console.log('[rollup-shim] Created wasm shim for @rollup/rollup-linux-x64-gnu.')
} catch (error) {
  console.warn('[rollup-shim] Failed to create shim:', error)
  process.exit(0) // continue without blocking install
}

