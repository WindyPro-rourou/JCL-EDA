/**
 * dsh-lichuang-eda — 活动日志（记录式时间线）。
 *
 * 参考 DSH 会话轨迹：每一步 = 一条记录（序号/时间/动作/耗时/结果/会话），
 * 持久化到 ~/.dsh/eda/activity.jsonl（重启面板不空、历史可回溯）；
 * 每步可携带 revoke 数据（该步创建的图元 id），实现"撤回上一步"。
 *
 * 性能：内存 ring buffer（cap）+ 串行落盘（写全量 JSONL，200 条为上限）。
 */
import { promises as fsp, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const ACTIVITY_CAP = 200
export function defaultActivityFile() {
  return join(homedir(), '.dsh', 'eda', 'activity.jsonl')
}

export class ActivityLog {
  constructor({ file = defaultActivityFile(), cap = ACTIVITY_CAP } = {}) {
    this.file = file
    this.cap = cap
    this.entries = []
    this.seq = 0
    this._writeChain = Promise.resolve()
  }

  /** Synchronous load (apply-time — the log is readable instantly). */
  loadSync() {
    try {
      const text = readFileSync(this.file, 'utf8')
      const lines = text.split('\n').filter((l) => l.trim() !== '')
      const parsed = []
      for (const line of lines) {
        try {
          const e = JSON.parse(line)
          if (e && typeof e.id === 'number') parsed.push(e)
        } catch { /* skip corrupt line */ }
      }
      this.entries = parsed.slice(-this.cap)
      this.seq = this.entries.reduce((m, e) => Math.max(m, e.id), 0)
    } catch { /* first run / missing file */ }
    return this
  }

  /** Asynchronous load (still available for tests/tools). */
  async load() {
    try {
      const text = await fsp.readFile(this.file, 'utf8')
      const lines = text.split('\n').filter((l) => l.trim() !== '')
      const parsed = []
      for (const line of lines) {
        try {
          const e = JSON.parse(line)
          if (e && typeof e.id === 'number') parsed.push(e)
        } catch { /* skip corrupt line */ }
      }
      this.entries = parsed.slice(-this.cap)
      this.seq = this.entries.reduce((m, e) => Math.max(m, e.id), 0)
    } catch { /* first run / missing file */ }
    return this
  }

  /** Append one entry; fire-and-forget persist (serialized). */
  push(entry) {
    const id = ++this.seq
    const e = {
      id,
      ts: new Date().toISOString(),
      status: entry.status ?? 'done',
      sid: entry.sid ?? '',
      ...entry,
      error: String(entry.error ?? '').slice(0, 4000),
      code: String(entry.code ?? '').slice(0, 4000),
      result: String(entry.result ?? '').slice(0, 4000),
      durationMs: entry.durationMs ?? 0,
    }
    this.entries.push(e)
    this._trim()
    void this._persist()
    return id
  }

  /** Patch an entry in place (pending → done/error). */
  update(id, patch) {
    const e = this.entries.find((x) => x.id === id)
    if (!e) return
    if (patch.status !== undefined) e.status = patch.status
    if (patch.ok !== undefined) e.ok = patch.ok
    if (patch.action !== undefined) e.action = patch.action
    if (patch.result !== undefined) e.result = String(patch.result ?? '').slice(0, 4000)
    if (patch.error !== undefined) e.error = String(patch.error ?? '').slice(0, 4000)
    if (patch.durationMs !== undefined) e.durationMs = patch.durationMs
    void this._persist()
  }

  get(id) {
    return this.entries.find((x) => x.id === id)
  }

  /** Clear everything (memory + disk). */
  async clear() {
    this.entries = []
    await this._writeChain.catch(() => {}) // let queued writes settle first
    try { await fsp.writeFile(this.file, '', 'utf8') } catch { /* best-effort */ }
  }

  /**
   * Feed for the panel: newest-first entries (optionally pinned to one
   * session via `sid`), plus a session summary.
   */
  feed({ sid = '', limit = 50 } = {}) {
    const list = this.entries.slice().reverse().slice(0, limit)
    const sessions = []
    const seen = new Set()
    for (const a of list) {
      const key = a.sid || '(platform)'
      const existing = sessions.find((s) => (s.sid || '(platform)') === key)
      if (existing !== undefined) existing.count += 1
      else sessions.push({ sid: a.sid || '', label: a.sid ? a.sid.slice(0, 8) + '…' : '平台操作', count: 1, lastTs: a.ts })
    }
    const wantSid = sid !== '' ? sid : (list[0]?.sid ?? '')
    return {
      currentSid: wantSid,
      sessions,
      activities: wantSid === '' ? list : list.filter((a) => a.sid === wantSid),
    }
  }

  _trim() {
    if (this.entries.length > this.cap) this.entries.splice(0, this.entries.length - this.cap)
  }

  _persist() {
    const snapshot = this.entries.map((e) => JSON.stringify(e)).join('\n') + '\n'
    this._writeChain = this._writeChain.then(async () => {
      try {
        await fsp.mkdir(dirname(this.file), { recursive: true })
        await fsp.writeFile(this.file, snapshot, 'utf8')
      } catch { /* disk write is best-effort */ }
    }).catch(() => {})
    return this._writeChain
  }
}
