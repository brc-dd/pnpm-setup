export type RuntimeName = 'node' | 'bun' | 'deno'

const SUPPORTED_RUNTIMES: readonly RuntimeName[] = ['node', 'bun', 'deno']

export interface RuntimeInput {
  readonly name: RuntimeName
  readonly version?: string
}

/**
 * Entries are separated by whitespace, which a version range may contain as
 * well (`node@>=22 <25`). A word starts a new entry only when it names a
 * runtime, so the rest of such a range stays with the entry it belongs to.
 */
export function parseRuntimes(raw: string): RuntimeInput[] {
  const entries: string[] = []
  for (const word of raw.split(/\s+/).filter(Boolean)) {
    if (entries.length === 0 || startsEntry(word)) {
      entries.push(word)
    } else {
      entries[entries.length - 1] += ` ${word}`
    }
  }

  const runtimes = entries.map(parseRuntime)
  for (const [index, { name }] of runtimes.entries()) {
    // Only one version of a runtime can be installed globally, so a second
    // entry could only replace the first. Asking for both is a mistake to
    // report, not a choice to make on the workflow's behalf.
    if (runtimes.findIndex(runtime => runtime.name === name) !== index) {
      throw new Error(
        `Invalid \`runtime\` input: ${name} is listed more than once. Only one version of each runtime can be installed.`,
      )
    }
  }
  return runtimes
}

// Anything in front of an `@` is read as a name, supported or not, so that an
// entry this action cannot install is reported as such instead of reaching
// pnpm as part of the version before it.
function startsEntry(word: string): boolean {
  return isSupportedRuntime(word) || word.indexOf('@') > 0
}

function parseRuntime(entry: string): RuntimeInput {
  const atIndex = entry.indexOf('@')
  const name = (atIndex === -1 ? entry : entry.slice(0, atIndex)).trim()
  const version = atIndex === -1 ? undefined : entry.slice(atIndex + 1).trim()

  if (!isSupportedRuntime(name)) {
    throw new Error(
      `Invalid \`runtime\` input "${entry}". Expected \`<name>\` or \`<name>@<version>\` where name is one of: ${SUPPORTED_RUNTIMES.join(', ')}.`,
    )
  }
  if (version !== undefined && version === '') {
    throw new Error(`Invalid \`runtime\` input "${entry}". Trailing \`@\` with no version.`)
  }

  return { name, version }
}

function isSupportedRuntime(name: string): name is RuntimeName {
  return (SUPPORTED_RUNTIMES as readonly string[]).includes(name)
}
