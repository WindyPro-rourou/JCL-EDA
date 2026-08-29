// Dev E2E: run the real 紧急保存 pipeline against the live official bridge.
// Writes to OUT_DIR (default scratch/snap-live) — NOT the production home dir.
import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createSnapshot } from '../plugin/lib/snapshot.js'

const PORT = process.env.EDA_BRIDGE_PORT ?? '49620'

const execute = async (code, timeoutMs = 25000) => {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    const text = await res.text()
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 300)}` }
    let j; try { j = JSON.parse(text) } catch { j = null }
    if (j && j.success === false) return { ok: false, error: String(j.error ?? 'bridge error').slice(0, 300) }
    const val = j?.result !== undefined ? j.result : text
    return { ok: true, result: typeof val === 'string' ? val : JSON.stringify(val) }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

const dir = process.env.OUT_DIR ?? (await mkdtemp(join(tmpdir(), 'eda-snap-live-')))
const out = await createSnapshot({
  execute,
  activities: () => [
    { ts: new Date().toISOString(), tool: 'eda_exec', action: '读取当前工程（实测）', ok: true },
    { ts: new Date().toISOString(), tool: 'probe', action: '紧急保存 E2E 实测', ok: true },
  ],
  connected: true,
  dir,
})
console.log('OUT_DIR:', dir)
console.log(JSON.stringify(out, null, 2))
