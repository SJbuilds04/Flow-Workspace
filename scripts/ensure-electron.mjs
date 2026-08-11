import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

/**
 * Makes sure Electron's binary actually landed.
 *
 * The `electron` npm package is only a downloader: installing it fetches a
 * ~180 MB binary from GitHub Releases and writes `path.txt` pointing at it. If
 * that download is interrupted — flaky wifi, antivirus, a proxy — npm still
 * reports success, and the only symptom appears much later as the decidedly
 * unhelpful `Error: Electron uninstall` when you try to run the app.
 *
 * So we check, and re-run just that download if it is missing.
 */

const require = createRequire(import.meta.url)

function electronDirectory() {
  try {
    return dirname(require.resolve('electron/package.json'))
  } catch {
    return null
  }
}

function binaryPath(directory) {
  const pointer = join(directory, 'path.txt')
  if (!existsSync(pointer)) return null

  const relative = readFileSync(pointer, 'utf-8').trim()
  if (!relative) return null

  return join(directory, 'dist', relative)
}

const directory = electronDirectory()

// Electron is a devDependency, so a production-only install legitimately has no
// copy of it. That is not an error.
if (!directory) {
  process.exit(0)
}

const binary = binaryPath(directory)

if (binary && existsSync(binary)) {
  process.exit(0)
}

console.log("[ensure-electron] Electron's binary is missing — downloading it now (~110 MB).")

try {
  execFileSync(process.execPath, [join(directory, 'install.js')], {
    cwd: directory,
    stdio: 'inherit'
  })
} catch {
  console.error(
    [
      '',
      '[ensure-electron] The download failed, so the app cannot start yet.',
      '',
      'This is almost always something blocking the fetch from GitHub Releases:',
      '  - antivirus or endpoint protection',
      '  - a corporate network or proxy (try setting ELECTRON_GET_USE_PROXY=true)',
      '  - an unstable connection',
      '',
      'Once that is sorted, run:  npm install',
      ''
    ].join('\n')
  )
  process.exit(1)
}

const repaired = binaryPath(directory)

if (!repaired || !existsSync(repaired)) {
  // Reaching here means Electron's installer exited cleanly having produced
  // nothing. `npm install --force` cannot help — it runs the same installer.
  // By far the most common cause is an unsupported Node, which passes the
  // check above only if package.json's engines range is wrong.
  console.error(
    [
      '',
      "[ensure-electron] Electron's installer finished without producing a binary.",
      '',
      `  Node in use: ${process.versions.node}`,
      '',
      '  Most likely an unsupported Node version. Install the current LTS from',
      '  https://nodejs.org, reopen your terminal, and run `npm install` again.',
      '',
      '  If Node is current, extract it by hand — this always works:',
      '',
      '      $zip = Get-ChildItem "$env:LOCALAPPDATA\\electron\\Cache" -Recurse -Filter *.zip | Select-Object -First 1',
      '      Expand-Archive $zip.FullName node_modules\\electron\\dist -Force',
      '      "electron.exe" | Out-File node_modules\\electron\\path.txt -Encoding ascii -NoNewline',
      ''
    ].join('\n')
  )
  process.exit(1)
}

console.log('[ensure-electron] Electron is ready.')
