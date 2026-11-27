import type { Register } from 'claude-code'

// Tells Herdr what the status lines used to: plan limits, context fill, model, effort and
// each subagent's usage, as labels on this terminal (`hc label <terminal> k=v`; `k=` removes).
let effort: string | undefined
const labelled = new Map<string, string>()

type Measure = {
  context: { percent?: number }
  rateLimits: { kind: string; percentUsed: number; resetsAt?: string }[]
}

// The status line's display name: "claude-sonnet-5-5" -> "Sonnet 5.5".
function displayName(id: string) {
  const name = id.replace(/\[.*\]$/, '').replace(/^claude-/, '').replace(/^([a-z]+)-(\d+)-(\d+)$/, '$1 $2.$3')
  return name.charAt(0).toUpperCase() + name.slice(1)
}

async function setLabels($: any, term: string, values: Record<string, string | null>) {
  const keys = Object.keys(values).filter((k) => labelled.get(k) !== (values[k] ?? ''))
  if (!keys.length) return
  for (const k of keys) labelled.set(k, values[k] ?? '')
  try {
    await $.process.run(['hc', 'label', term, ...keys.map((k) => `${k}=${values[k] ?? ''}`)])
  } catch {
    for (const k of keys) labelled.delete(k)
  }
}

// The terminal Herdr runs this session in; none outside Herdr.
async function terminal($: any) {
  const term = (await $.env.get('HC_TERMINAL_ID')) ?? ''
  return /^[A-Za-z0-9_.-]+$/.test(term) ? term : null
}

async function writeMain($: any, e: Measure) {
  const term = await terminal($)
  if (!term) return
  const window = (kind: string) => {
    const w = e.rateLimits.find((r) => r.kind === kind)
    return w ? { used_percentage: w.percentUsed, resets_at: w.resetsAt ? Date.parse(w.resetsAt) / 1000 : null } : null
  }
  await setLabels($, term, {
    pe_session: await $.session.id(),
    pe_ctx: e.context.percent === undefined ? null : String(e.context.percent),
    pe_model: displayName(await $.session.model()),
    pe_effort: effort ?? null,
    // The account's limits on every terminal; a reader takes the newest `at`.
    ...(e.rateLimits.length
      ? { pe_limits: JSON.stringify({ five_hour: window('five_hour'), seven_day: window('seven_day'), at: await $.clock.now() }) }
      : {}),
  })
}

async function writeAgents($: any) {
  const term = await terminal($)
  if (!term) return
  const out: Record<string, unknown> = {}
  for (const a of await $.agent.list()) {
    const size = a.contextWindowSize
    const ok = typeof size === 'number' && size > 0
    out[a.id] = {
      model: a.model ?? null,
      effort: a.effort === undefined ? null : String(a.effort),
      used: ok ? (a.tokenCount / size) * 100 : null,
      tokens: ok ? a.tokenCount : null,
      size: ok ? size : null,
    }
  }
  await setLabels($, term, { pe_agents: Object.keys(out).length ? JSON.stringify(out) : null })
}

export const register: Register = (on) => {
  on('session.measure', async ($, e, next) => {
    await writeMain($, e).catch(() => {})
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined && typeof e.effort === 'string') effort = e.effort
    return yield* next(e)
  })

  // A new session in the terminal must not show what this one left.
  on('session.end', async ($, e, next) => {
    const term = await terminal($)
    if (term) await setLabels($, term, { pe_session: null, pe_ctx: null, pe_model: null, pe_effort: null, pe_agents: null }).catch(() => {})
    return next(e)
  })

  on('session.start', async ($, e, next) => {
    $.clock.every(5000, () => void writeAgents($).catch(() => {}))
    return next(e)
  })
}
