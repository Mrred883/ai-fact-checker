// Build a Chrome Web Store upload zip from dist/.
// Zips the CONTENTS of dist/ (manifest.json at the zip root), which is what the
// Web Store requires. Output: web-store/ai-fact-checker-v<version>.zip
import { execSync } from 'node:child_process'
import { readFileSync, mkdirSync, existsSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { platform } from 'node:os'

const root = resolve(import.meta.dirname, '..')
const dist = resolve(root, 'dist')
const outDir = resolve(root, 'web-store')

if (!existsSync(resolve(dist, 'manifest.json'))) {
  console.error('dist/manifest.json not found — run `npm run build` first.')
  process.exit(1)
}

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const zipName = `ai-fact-checker-v${pkg.version}.zip`
const outPath = resolve(outDir, zipName)

mkdirSync(outDir, { recursive: true })
if (existsSync(outPath)) rmSync(outPath)

try {
  if (platform() === 'win32') {
    // PowerShell Compress-Archive zips the contents of dist (note the \*)
    execSync(
      `powershell -NoProfile -Command "Compress-Archive -Path '${dist}\\*' -DestinationPath '${outPath}' -Force"`,
      { stdio: 'inherit' },
    )
  } else {
    // zip the contents of dist, not the dist folder itself
    execSync(`cd "${dist}" && zip -r -X "${outPath}" .`, { stdio: 'inherit', shell: '/bin/bash' })
  }
  console.log(`\nPackaged: web-store/${zipName}`)
  console.log('Upload this file in the Chrome Web Store Developer Dashboard.')
} catch (e) {
  console.error('Packaging failed:', e.message)
  process.exit(1)
}
