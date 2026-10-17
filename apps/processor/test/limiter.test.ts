import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Limiter } from '../src/limiter.ts'

const later = () => { let done!: () => void; const p = new Promise<void>((r) => { done = r }); return { p, done } }

test('runs at most `max` jobs at once; the rest wait their turn', async () => {
  const lim = new Limiter(2, 10)
  let running = 0, peak = 0
  const gates = Array.from({ length: 5 }, later)
  const jobs = gates.map((g, i) => lim.run(async () => { running++; peak = Math.max(peak, running); await g.p; running--; return i }))
  await new Promise((r) => setTimeout(r, 10))
  assert.deepEqual(lim.stats, { running: 2, waiting: 3, max: 2 })
  gates.forEach((g) => g.done())
  assert.deepEqual(await Promise.all(jobs), [0, 1, 2, 3, 4])
  assert.equal(peak, 2)
  assert.deepEqual(lim.stats, { running: 0, waiting: 0, max: 2 })
})

test('answers null (busy) once the wait line is full, and frees the slot after a failure', async () => {
  const lim = new Limiter(1, 1)
  const gate = later()
  const first = lim.run(() => gate.p)
  const second = lim.run(async () => 'second')
  assert.equal(await lim.run(async () => 'third'), null)
  gate.done()
  await first
  assert.equal(await second, 'second')
  await assert.rejects(lim.run(async () => { throw new Error('boom') }))
  assert.deepEqual(lim.stats, { running: 0, waiting: 0, max: 1 })
})
