import assert from 'node:assert/strict'
import test from 'node:test'
import { parseRuntimes } from './runtime.ts'

const runtime = (name, version) => ({ name, version })

test('an omitted input requests no runtimes', () => {
  assert.deepEqual(parseRuntimes(''), [])
  assert.deepEqual(parseRuntimes(' \n\t '), [])
})

test('a single runtime is read with or without a version', () => {
  assert.deepEqual(parseRuntimes('node@22'), [runtime('node', '22')])
  assert.deepEqual(parseRuntimes('  bun  '), [runtime('bun')])
  assert.deepEqual(parseRuntimes('deno@latest\n'), [runtime('deno', 'latest')])
})

test('runtimes are separated by spaces or newlines and keep the order listed', () => {
  assert.deepEqual(
    parseRuntimes('node@22 bun@latest deno'),
    [runtime('node', '22'), runtime('bun', 'latest'), runtime('deno')],
  )
  assert.deepEqual(
    parseRuntimes('\n  deno@2\n  node\r\n\tbun@1.3.13\n'),
    [runtime('deno', '2'), runtime('node'), runtime('bun', '1.3.13')],
  )
})

test('a range containing spaces stays within its entry', () => {
  assert.deepEqual(parseRuntimes('node@>=22 <25'), [runtime('node', '>=22 <25')])
  assert.deepEqual(
    parseRuntimes('node@^22 || ^24 bun@1'),
    [runtime('node', '^22 || ^24'), runtime('bun', '1')],
  )
  assert.deepEqual(
    parseRuntimes('bun node@v22 - v24 deno@>= 2'),
    [runtime('bun'), runtime('node', 'v22 - v24'), runtime('deno', '>= 2')],
  )
})

test('whitespace around the @ is tolerated', () => {
  assert.deepEqual(parseRuntimes('node @ 22'), [runtime('node', '22')])
  assert.deepEqual(parseRuntimes('node@ 22 bun'), [runtime('node', '22'), runtime('bun')])
})

test('an unsupported or malformed entry is reported on its own', () => {
  assert.throws(() => parseRuntimes('python'), /Invalid `runtime` input "python"\./)
  assert.throws(() => parseRuntimes('Node@22'), /Invalid `runtime` input "Node@22"\./)
  assert.throws(() => parseRuntimes('@22'), /Invalid `runtime` input "@22"\./)
  assert.throws(() => parseRuntimes('node 22'), /Invalid `runtime` input "node 22"\./)
  assert.throws(() => parseRuntimes('node@22 python@3 bun'), /Invalid `runtime` input "python@3"\./)
  assert.throws(() => parseRuntimes('node@'), /Invalid `runtime` input "node@"\. Trailing `@`/)
  assert.throws(() => parseRuntimes('node@ bun@1'), /Invalid `runtime` input "node@"\. Trailing `@`/)
})

test('a runtime listed more than once is rejected', () => {
  assert.throws(() => parseRuntimes('node@22 node@24'), /node is listed more than once/)
  assert.throws(() => parseRuntimes('bun node bun@1'), /bun is listed more than once/)
})
