import { getBooleanInput, getInput, InputOptions } from '@actions/core'
import expandTilde from 'expand-tilde'
import { existsSync } from 'fs'
import path from 'path'
import { parseRuntimes, RuntimeInput } from './runtime'

export type { RuntimeInput, RuntimeName } from './runtime'

export interface Inputs {
  readonly version?: string
  readonly dest: string
  readonly cache: boolean
  readonly cacheDependencyPath: string
  /** Where the project lives, relative to GITHUB_WORKSPACE. */
  readonly workingDirectory: string
  /** The manifest to read config from, relative to GITHUB_WORKSPACE. */
  readonly packageJsonFile: string
  /** Empty when the `runtime` input is omitted. */
  readonly runtimes: readonly RuntimeInput[]
  readonly nodeVersionFile?: string | false
  readonly install: boolean
  /** Whether a lockfile must already exist and fully describe the install. */
  readonly requireLockfile: boolean
  readonly token?: string
}

const options: InputOptions = {
  required: true,
}

const MANIFEST_NAMES = ['package.json', 'package.yaml'] as const

/**
 * `working-directory` says where the project is; `package-json-file` said
 * which file to read. The second is deprecated onto the first, because the
 * directory holding the manifest is also the only sensible place to run
 * `pnpm install` — running it at the repository root installs nothing at all
 * when the project lives one level down.
 */
function resolveProjectPaths(): {
  workingDirectory: string
  packageJsonFile: string
  cacheDependencyPath: string
} {
  const workingDirectoryInput = getInput('working-directory').trim()
  const packageJsonFileInput = getInput('package-json-file').trim()

  if (workingDirectoryInput && workingDirectoryInput !== '.' && packageJsonFileInput) {
    throw new Error(
      'Both `working-directory` and the deprecated `package-json-file` are set. ' +
      'Remove `package-json-file`: `working-directory` already covers where the manifest ' +
      'is read from and where `pnpm install` runs.',
    )
  }

  if (packageJsonFileInput) {
    const packageJsonFile = expandTilde(packageJsonFileInput)
    const workingDirectory = path.dirname(packageJsonFile)
    return { workingDirectory, packageJsonFile, cacheDependencyPath: resolveCacheDependencyPath(workingDirectory) }
  }

  const workingDirectory = expandTilde(workingDirectoryInput || '.')
  return {
    workingDirectory,
    packageJsonFile: findManifest(workingDirectory),
    cacheDependencyPath: resolveCacheDependencyPath(workingDirectory),
  }
}

/**
 * `cache-dependency-path` stays relative to the repository root, the way it
 * has always been documented — rewriting a value the workflow set would turn
 * an existing `web/pnpm-lock.yaml` into `web/web/pnpm-lock.yaml`. Only the
 * default follows the project, so a subdirectory finds its own lockfile
 * without the workflow having to name it twice.
 */
function resolveCacheDependencyPath(workingDirectory: string): string {
  const configured = getInput('cache-dependency-path').trim()
  if (configured) return expandTilde(configured)
  return path.join(workingDirectory, 'pnpm-lock.yaml')
}

/**
 * pnpm reads `package.yaml` as well as `package.json`, and without an input
 * naming the file the action has to look. Falls back to `package.json` so the
 * "no manifest" path still reports the name a user expects.
 */
function findManifest(workingDirectory: string): string {
  const { GITHUB_WORKSPACE } = process.env
  if (GITHUB_WORKSPACE) {
    for (const name of MANIFEST_NAMES) {
      const candidate = path.join(workingDirectory, name)
      if (existsSync(path.resolve(GITHUB_WORKSPACE, candidate))) return candidate
    }
  }
  return path.join(workingDirectory, MANIFEST_NAMES[0])
}

export const getInputs = (): Inputs => ({
  version: getInput('version'),
  dest: path.resolve(expandTilde(getInput('dest', options))),
  cache: getBooleanInput('cache'),
  ...resolveProjectPaths(),
  runtimes: parseRuntimes(getInput('runtime')),
  nodeVersionFile: parseNodeVersionFileInput(),
  install: getBooleanInput('install'),
  requireLockfile: getBooleanInput('require-lockfile'),
  token: getInput('token') || undefined,
})

function parseNodeVersionFileInput(): string | false | undefined {
  const value = getInput('node-version-file').trim()
  return value === 'false' ? false : value || undefined
}

export default getInputs
