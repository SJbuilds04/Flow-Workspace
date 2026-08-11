import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Refuses to continue on a Node version this project does not support.
 *
 * `engines` in package.json is advisory — npm installs anyway and says nothing.
 * On an old runtime the install still "succeeds", and the first real symptom is
 * Electron's downloader exiting 0 without producing a binary, which looks like
 * a network or antivirus problem and is neither. One clear sentence here saves
 * a very long hunt.
 */

const here = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf-8'))

// First number in the range is the major we need: ">=20.0.0" -> 20. Stripping
// every non-digit instead would read that as 2000 and lock everyone out.
const required = Number.parseInt(/(\d+)/.exec(String(pkg.engines?.node ?? '>=20'))?.[1] ?? '20', 10)
const current = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10)

if (current >= required) {
  process.exit(0)
}

console.error(
  [
    '',
    `  Node ${required} or newer is required — you are running Node ${process.versions.node}.`,
    '',
    '  Install the current LTS from https://nodejs.org, reopen your terminal, then run:',
    '',
    '      node -v          (confirm it now reports v' + required + ' or higher)',
    '      npm install',
    '',
    '  Older versions appear to install fine and then fail in confusing ways —',
    "  most often Electron's binary silently never arriving.",
    ''
  ].join('\n')
)

process.exit(1)
