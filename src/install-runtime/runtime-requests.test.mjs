import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const { outputFiles } = await build({
  entryPoints: [fileURLToPath(new URL('./index.ts', import.meta.url))],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
})
const bundledModule = { exports: {} }
new Function('require', 'module', 'exports', outputFiles[0].text)(
  createRequire(import.meta.url), bundledModule, bundledModule.exports,
)
const { resolveRuntimeRequests } = bundledModule.exports

const node = version => ({ name: 'node', version })
const bun = { name: 'bun', version: '1.3.13' }
const deno = { name: 'deno', version: '2' }

const scenarios = [
  {
    name: 'no runtime sources leaves runtimes empty',
    files: {}, expected: [],
  },
  {
    name: 'an automatically detected file supplies Node',
    files: { '.node-version': '24' }, expected: [node('24')],
  },
  {
    name: 'an automatically detected file adds Node alongside manifest runtimes',
    manifest: [bun], files: { '.nvmrc': '24' }, expected: [node('24'), bun],
  },
  {
    name: 'the manifest takes precedence over an invalid auto-detected file',
    manifest: [bun, node('22')], files: { '.node-version': '' }, expected: [bun, node('22')],
  },
  {
    name: 'an explicit file overrides manifest Node and retains other runtimes',
    manifest: [bun, node('22')], files: { '.nvmrc': '24' },
    inputs: { nodeVersionFile: '.nvmrc' }, expected: [node('24'), bun],
  },
  {
    name: 'an explicit runtime version ignores a missing explicit file',
    manifest: [node('24')], files: {},
    inputs: { runtimes: [node('22')], nodeVersionFile: 'missing' }, expected: [node('22')],
  },
  {
    name: 'runtime node prefers the explicit file to the manifest',
    manifest: [node('22')], files: { '.nvmrc': '24' },
    inputs: { runtimes: [{ name: 'node' }], nodeVersionFile: '.nvmrc' }, expected: [node('24')],
  },
  {
    name: 'runtime node prefers the manifest to automatic detection',
    manifest: [node('22')], files: { '.node-version': '' },
    inputs: { runtimes: [{ name: 'node' }] }, expected: [node('22')],
  },
  {
    name: 'runtime node uses automatic detection before its LTS default',
    files: { '.nvmrc': '24' }, inputs: { runtimes: [{ name: 'node' }] }, expected: [node('24')],
  },
  {
    name: 'runtime node retains its LTS default when no file exists',
    files: {}, inputs: { runtimes: [{ name: 'node' }] }, expected: [node('lts')],
  },
  {
    name: 'an explicit non-Node runtime ignores detected Node files',
    files: { '.node-version': '' }, inputs: { runtimes: [bun] }, expected: [bun],
  },
  {
    name: 'an explicit non-Node runtime ignores a missing explicit Node file',
    files: {}, inputs: { runtimes: [bun], nodeVersionFile: 'missing' }, expected: [bun],
  },
  {
    name: 'opting out ignores detected files',
    files: { '.node-version': '' }, inputs: { nodeVersionFile: false }, expected: [],
  },
  {
    name: 'opting out preserves manifest runtimes',
    manifest: [bun, node('22')], files: { '.node-version': '' },
    inputs: { nodeVersionFile: false }, expected: [bun, node('22')],
  },
  {
    name: 'opting out preserves explicit runtime installation',
    files: { '.node-version': '' },
    inputs: { runtimes: [node('22')], nodeVersionFile: false }, expected: [node('22')],
  },
  {
    name: 'runtime node with detection disabled still defaults to LTS',
    files: { '.node-version': '' },
    inputs: { runtimes: [{ name: 'node' }], nodeVersionFile: false }, expected: [node('lts')],
  },
  {
    name: 'several explicit runtimes are requested in the order listed',
    manifest: [node('22')], files: {},
    inputs: { runtimes: [bun, node('24'), deno] }, expected: [bun, node('24'), deno],
  },
  {
    name: 'explicit runtimes leave out manifest runtimes that are not listed',
    manifest: [bun, node('22')], files: { '.nvmrc': '24' },
    inputs: { runtimes: [deno] }, expected: [deno],
  },
  {
    name: 'each explicit runtime without a version falls back on its own',
    manifest: [bun, node('22')], files: {},
    inputs: { runtimes: [{ name: 'deno' }, { name: 'node' }, { name: 'bun' }] },
    expected: [{ name: 'deno', version: 'latest' }, node('22'), bun],
  },
  {
    name: 'node among explicit runtimes prefers the explicit file to the manifest',
    manifest: [node('22')], files: { '.nvmrc': '24' },
    inputs: { runtimes: [bun, { name: 'node' }], nodeVersionFile: '.nvmrc' }, expected: [bun, node('24')],
  },
  {
    name: 'node among explicit runtimes uses automatic detection',
    files: { '.node-version': '24' },
    inputs: { runtimes: [{ name: 'node' }, bun] }, expected: [node('24'), bun],
  },
  {
    name: 'explicit runtimes without Node ignore detected Node files',
    files: { '.node-version': '' }, inputs: { runtimes: [bun, deno] }, expected: [bun, deno],
  },
]

for (const scenario of scenarios) {
  test(scenario.name, t => {
    assert.deepEqual(resolve(t, scenario).requests, scenario.expected)
  })
}

test('a duplicate manifest declaration is reported once for several explicit runtimes', t => {
  const { requests, warnings } = resolve(t, {
    manifest: [node('22'), { name: 'bun', version: '1.3.12' }, node('24'), bun],
    files: {},
    inputs: { runtimes: [{ name: 'node' }, { name: 'bun' }, { name: 'deno' }] },
  })
  assert.deepEqual(requests, [node('24'), bun, { name: 'deno', version: 'latest' }])
  assert.equal(warnings.length, 2)
  assert.match(warnings[0], /Duplicate node runtime versions/)
  assert.match(warnings[1], /Duplicate bun runtime versions/)
})

test('a version file is reported as ignored when explicit runtimes cannot use it', t => {
  const withoutNode = resolve(t, {
    files: {}, inputs: { runtimes: [bun, deno], nodeVersionFile: 'missing' },
  })
  assert.deepEqual(withoutNode.requests, [bun, deno])
  assert.equal(withoutNode.warnings.length, 1)
  assert.match(withoutNode.warnings[0], /`runtime` explicitly selects bun and deno\./)

  const withNodeVersion = resolve(t, {
    files: {}, inputs: { runtimes: [bun, node('22')], nodeVersionFile: 'missing' },
  })
  assert.deepEqual(withNodeVersion.requests, [bun, node('22')])
  assert.equal(withNodeVersion.warnings.length, 1)
  assert.match(withNodeVersion.warnings[0], /`runtime` already includes a Node\.js version\./)
})

test('a version file that supplies the Node version of explicit runtimes is not reported', t => {
  const { requests, warnings } = resolve(t, {
    files: { '.nvmrc': '24' }, inputs: { runtimes: [bun, { name: 'node' }], nodeVersionFile: '.nvmrc' },
  })
  assert.deepEqual(requests, [bun, node('24')])
  assert.deepEqual(warnings, [])
})

function resolve(t, scenario) {
  const workspace = mkdtempSync(path.join(tmpdir(), 'pnpm-runtime-requests-'))
  const previous = process.env.GITHUB_WORKSPACE
  process.env.GITHUB_WORKSPACE = workspace
  const output = []
  const write = process.stdout.write.bind(process.stdout)
  const stdout = t.mock.method(process.stdout, 'write', (chunk, ...args) => {
    output.push(String(chunk))
    return write(chunk, ...args)
  })
  try {
    if (scenario.manifest) {
      writeFileSync(path.join(workspace, 'package.json'), JSON.stringify({ devEngines: { runtime: scenario.manifest } }))
    }
    for (const [file, contents] of Object.entries(scenario.files)) {
      writeFileSync(path.join(workspace, file), contents)
    }
    const requests = resolveRuntimeRequests({
      workingDirectory: '.', packageJsonFile: 'package.json', runtimes: [], ...scenario.inputs,
    })
    const warnings = output.join('').split(/\r?\n/).filter(line => line.startsWith('::warning::'))
    return { requests, warnings }
  } finally {
    stdout.mock.restore()
    if (previous === undefined) delete process.env.GITHUB_WORKSPACE
    else process.env.GITHUB_WORKSPACE = previous
    rmSync(workspace, { recursive: true, force: true })
  }
}
