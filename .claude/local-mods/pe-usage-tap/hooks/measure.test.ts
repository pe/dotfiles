import { expect, test } from 'claude-code/testing'

declare const setTimeout: (fn: (v?: any) => void, ms: number) => unknown

test('session.measure sets the terminal labels', async ($, on) => {
  const runs: string[][] = []
  on('process.run', (_, e) => {
    runs.push([...e.argv])
    return { value: { exitCode: 0, stdout: '', stderr: '' } as any }
  })
  on('env.get', (_, e) => ({ value: e.name === 'HC_TERMINAL_ID' ? 't1' : '/h' }))
  on('clock.now', () => ({ value: 1000 }) as any)
  on('session.id', () => ({ value: 's1' }) as any)
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }) as any)

  on('session.measure', (_, e) => ({ changed: e.changed }))

  await $.session.measure({
    context: { window: 1000000, tokens: 90000, percent: 9 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 24, resetsAt: '2026-11-27T16:50:00.000Z' }],
    changed: ['context', 'rateLimits'],
  } as any)
  await new Promise((r) => setTimeout(r, 100))


  const limits = JSON.stringify({ five_hour: { used_percentage: 24, resets_at: 1795798200 }, seven_day: null, at: 1000 })
  expect(runs).toEqual([['hc', 'label', 't1', 'pe_session=s1', 'pe_ctx=9', 'pe_model=Sonnet 5.5', 'pe_effort=', `pe_limits=${limits}`]])

  // Nothing changed: no second call.
  await $.session.measure({ context: { window: 1000000, tokens: 90000, percent: 9 }, rateLimits: [], changed: ['context'] } as any)
  await new Promise((r) => setTimeout(r, 100))
  expect(runs.length).toBe(1)
  expect(runs[0]![0]).toBe('hc')
})
