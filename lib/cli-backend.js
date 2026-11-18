/**
 * dsh-lichuang-eda — OFFICIAL CLI backend (EasyEDA Pro client CLI) + unified facade.
 *
 * Official docs (verified 2026-10-28 against a live client):
 *   - https://prodocs.easyeda.com/cn/api/guide/cli.html                       (命令行客户端 CLI)
 *   - https://prodocs.lceda.cn/public/storage/texts/api/guide/cli-for-ai.html (For AI)
 *   - https://github.com/easyeda/easyeda-client-cli                           (官方仓库)
 *
 * The desktop client (v4.1.60+) ships `lceda-pro` (CN) / `easyeda-pro` (intl):
 *   lceda-pro doctor                              → {ok,value:{connected,endpoint,bridgeVersion,versionMatch,resultChannel}}
 *   lceda-pro open [--path <proj>] [--headless]   → {ok,value:{sessionId,renderId,path}}
 *   lceda-pro session list|close|abort            → session management
 *   lceda-pro invoke --session <id> --ext-uuid eda --code <js> [--timeout ms]
 *   lceda-pro doc api|external|format             → API / format reference
 *   lceda-pro --mcp stdio|http --port P --token T → MCP server mode
 * Every command returns ONE envelope: {ok, value, logs, durationMs} | {ok:false,error:{code,message}}
 *
 * MEASURED on 4.1.78 (2026-10-28): `session list` ≈ 15 ms, `invoke` ≈ 355 ms,
 * but `doctor` ≈ 7.6 s — so status polling MUST use the session list, and
 * `doctor` is called only on start/connect (result cached).
 *
 * IMPORTANT: the CLI only works with the DESKTOP client — the browser/online
 * edition has no sessions/built-in bridge. This backend auto-detects the
 * executable (PATH → env → per-drive scan → registry) and the unified facade
 * falls back to the official Bridge Server path (browser + Run API Gateway)
 * with zero behaviour change when the client is absent.
 */

import { spawn, execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { EdaBackend, STATE } from './backend.js'

export const CLI_NAMES = ['lceda-pro', 'easyeda-pro']

/**
 * Are we inside a test run? `NODE_TEST_CONTEXT` is NOT set when node runs with
 * `--experimental-test-isolation=none` (our suite's mode), so also sniff argv.
 * Used to keep tests deterministic and to never spawn an Electron MCP server
 * (or touch a real board) from a test.
 */
export function isTestRunner(env = process.env, execArgv = process.execArgv) {
  if (env.NODE_TEST_CONTEXT !== undefined) return true
  if (env.DSH_EDA_NO_AUTOSTART === '1') return true
  // NOTE: `process.argv` has node's own flags stripped; `execArgv` keeps them
  // (`--test`, `--test-timeout=…`, `--experimental-test-isolation=…`).
  const flags = [...execArgv, ...process.argv]
  return flags.some((a) => a === '--test' || a.startsWith('--test-') || a.includes('--experimental-test'))
}

/** Plugin version reported to the MCP server's clientInfo. */
const OWN_VERSION = '0.1.17'

/** Directory patterns the official installer (or a manual unzip) produces. */
const RELATIVE_LAYOUTS = [
  'lichuang_eda/lceda-pro',   // 本机实测的便携布局
  'lceda-pro',
  'LCEDA-Pro',
  'EasyEDA-Pro',
  'easyeda-pro',
  'Program Files/lceda-pro',
  'Program Files/EasyEDA-Pro',
  'Program Files (x86)/lceda-pro',
  'Programs/lceda-pro',
  'Programs/EasyEDA-Pro',
]

/**
 * Candidates: fixed Program Files/LocalAppData spots + a per-drive scan of the
 * common layouts (so custom install drives such as F:\lichuang_eda are found).
 */
export function defaultCliCandidates() {
  const out = []
  const root = process.env['ProgramFiles'] ?? 'C:\\Program Files'
  const root86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
  const local = process.env['LOCALAPPDATA'] ?? ''
  for (const name of CLI_NAMES) {
    out.push(join(root, name, `${name}.exe`))
    out.push(join(root86, name, `${name}.exe`))
    if (local) out.push(join(local, 'Programs', name, `${name}.exe`))
  }
  // Per-drive scan (A:\ … Z:\) × common layouts.
  for (let c = 65; c <= 90; c++) {
    const drive = `${String.fromCharCode(c)}:\\`
    try { if (!existsSync(drive)) continue } catch { continue }
    for (const rel of RELATIVE_LAYOUTS) {
      for (const name of CLI_NAMES) {
        out.push(join(drive, rel.replace(/\//g, '\\'), `${name}.exe`))
        out.push(join(drive, rel.replace(/\//g, '\\'), name, `${name}.exe`))
      }
    }
  }
  return out
}

/** Registry lookup (Windows): uninstall entries whose name mentions EDA. */
function registryCandidates() {
  if (process.platform !== 'win32') return []
  const out = []
  const keys = [
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  ]
  for (const key of keys) {
    try {
      const text = execFileSync('reg', ['query', key, '/s', '/f', 'EDA', '/d'], { encoding: 'utf8', timeout: 8000 })
      for (const m of text.matchAll(/InstallLocation\s+REG_SZ\s+(.+)/g)) {
        const loc = m[1].trim().replace(/\\+$/, '')
        for (const name of CLI_NAMES) out.push(join(loc, `${name}.exe`))
      }
    } catch { /* key missing or reg unavailable */ }
  }
  return out
}

/**
 * Find the official CLI executable. Injectable for tests.
 * @param {object} opts { env, pathDirs, candidates, exists, useRegistry }
 * @returns {string|null} absolute path or null
 */
export function findCliExecutable(opts = {}) {
  const env = opts.env ?? process.env
  const exists = opts.exists ?? existsSync
  const explicit = env.DSH_EDA_CLI || env.LCEDA_PRO_BIN || env.EASYEDA_PRO_BIN
  if (typeof explicit === 'string' && explicit !== '' && exists(explicit)) return explicit

  const dirs = opts.pathDirs ?? String(env.PATH ?? '').split(delimiter).filter((d) => d !== '')
  const names = process.platform === 'win32' ? CLI_NAMES.map((n) => `${n}.exe`) : CLI_NAMES
  for (const dir of dirs) {
    for (const n of names) {
      const p = join(dir, n)
      try { if (exists(p)) return p } catch { /* ignore */ }
    }
  }
  const candidates = opts.candidates ?? defaultCliCandidates()
  for (const c of candidates) {
    try { if (exists(c)) return c } catch { /* ignore */ }
  }
  if (opts.useRegistry !== false) {
    for (const c of registryCandidates()) {
      try { if (exists(c)) return c } catch { /* ignore */ }
    }
  }
  return null
}

/** Parse the CLI envelope out of stdout (tolerates stray log lines). */
export function parseEnvelope(stdout) {
  const text = String(stdout ?? '').trim()
  if (text === '') return null
  try { return JSON.parse(text) } catch { /* not pure JSON */ }
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first >= 0 && last > first) {
    try { return JSON.parse(text.slice(first, last + 1)) } catch { /* give up */ }
  }
  return null
}

/** One shot of `<exe> …` → {code, stdout, stderr, timedOut}. */
function runCli(exe, args, { timeoutMs = 60000, env, cwd } = {}) {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(exe, args, { windowsHide: true, env, cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (error) {
      resolve({ code: -1, stdout: '', stderr: error instanceof Error ? error.message : String(error), timedOut: false })
      return
    }
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      try { child.kill() } catch { /* gone */ }
    }, Math.max(1000, timeoutMs))
    child.stdout?.on('data', (d) => { stdout += String(d) })
    child.stderr?.on('data', (d) => { stderr += String(d) })
    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({ code: -1, stdout, stderr: stderr + String(error?.message ?? error), timedOut })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? -1, stdout, stderr, timedOut })
    })
  })
}

/**
 * Official CLI backend: drives the running (or freshly opened) client editor
 * through `invoke`. Shape-compatible with EdaBackend so every tool and the
 * panel keep working unchanged.
 */
export class EdaCliBackend {
  constructor(cfg = {}) {
    this.cfg = cfg
    this.exe = cfg.cliExe ?? findCliExecutable(cfg.discovery ?? {})
    this.timeouts = cfg.timeouts ?? { startMs: 25000, callMs: 60000 }
    this.state = STATE.idle
    this.error = ''
    this.sessionId = cfg.sessionId ?? null
    this.detail = null // last doctor payload (cached: doctor is ~7.6 s)
    this.detailAt = 0
    this.sessions = null // last session-list snapshot (fast: ~15 ms)
    this.sessionsAt = 0
    this.tasks = new Map() // local async tasks (invoke is synchronous in the CLI)
    this.extraArgs = cfg.cliPrefixArgs ?? [] // test seam: prefix args before the real ones
  }

  available() { return typeof this.exe === 'string' && this.exe !== '' }

  /** `<exe> <args…>` with the optional test-seam prefix. */
  async #run(args, opts = {}) {
    // Single choke point for every CLI spawn: keep the test runner clean
    // (the client binary is Electron; one spawn costs seconds).
    if (this.cfg.allowSpawn !== true && isTestRunner()) {
      return { code: -1, stdout: '', stderr: '测试环境不启动官方 CLI（allowSpawn≠true）', timedOut: false }
    }
    const full = [...this.extraArgs, ...args]
    return runCli(this.exe, full, { env: this.cfg.env, cwd: this.cfg.cwd, ...opts })
  }

  /** `doctor` (cached for ttlMs — it costs ~7.6 s on a live client). */
  async doctor({ ttlMs = 20000, force = false } = {}) {
    if (!this.available()) return { ok: false, error: '未找到官方 CLI（lceda-pro / easyeda-pro）' }
    if (!force && this.detail !== null && Date.now() - this.detailAt < ttlMs) {
      return { ok: true, connected: this.detail.connected === true, value: this.detail, cached: true }
    }
    const r = await this.#run(['doctor'], { timeoutMs: 30000 })
    if (r.timedOut) return { ok: false, error: 'lceda-pro doctor 超时' }
    const env = parseEnvelope(r.stdout)
    if (env === null) return { ok: false, error: (r.stderr || 'doctor 无 JSON 输出').slice(0, 200) }
    this.detail = env.value ?? null
    this.detailAt = Date.now()
    return { ok: true, connected: this.detail?.connected === true, value: this.detail }
  }

  /** `session list` (very fast) with a short cache. */
  async listSessions({ ttlMs = 1000, force = false } = {}) {
    if (!this.available()) return []
    if (!force && this.sessions !== null && Date.now() - this.sessionsAt < ttlMs) return this.sessions
    const r = await this.#run(['session', 'list'], { timeoutMs: 20000 })
    const env = parseEnvelope(r.stdout)
    const list = Array.isArray(env?.value) ? env.value : []
    this.sessions = list
    this.sessionsAt = Date.now()
    return list
  }

  /** Reuse a live session (user's window preferred), else open one. */
  async ensureSession({ open = true } = {}) {
    if (!this.available()) return { ok: false, error: '未找到官方 CLI' }
    const list = await this.listSessions({ force: true })
    if (this.sessionId !== null) {
      const hit = list.find((s) => s?.sessionId === this.sessionId && s?.status === 'alive')
      if (hit) return { ok: true, sessionId: this.sessionId, reused: true }
      this.sessionId = null
    }
    const alive = list.find((s) => s?.status === 'alive')
    if (alive?.sessionId) {
      this.sessionId = String(alive.sessionId)
      return { ok: true, sessionId: this.sessionId, reused: true }
    }
    if (!open) return { ok: false, error: '没有可用的编辑器会话（可用 eda_backend_connect 打开一个）' }
    const args = ['open']
    if (this.cfg.headless === true) args.push('--headless', 'true')
    if (typeof this.cfg.projectPath === 'string' && this.cfg.projectPath !== '') args.push('--path', this.cfg.projectPath)
    const o = await this.#run(args, { timeoutMs: 90000 })
    const oenv = parseEnvelope(o.stdout)
    const sid = oenv?.value?.sessionId
    if (oenv?.ok !== true || typeof sid !== 'string') {
      return { ok: false, error: String(oenv?.error?.message ?? o.stderr ?? 'open 失败').slice(0, 200) }
    }
    this.sessionId = sid
    this.sessions = null
    this.sessionsAt = 0
    return { ok: true, sessionId: sid, reused: false, opened: true }
  }

  /** Execute official `eda.*` code in the editor (the CLI's core capability). */
  async execute(code, timeoutMs = this.timeouts.callMs) {
    if (!this.available()) return { ok: false, error: '未找到官方 CLI（lceda-pro / easyeda-pro）' }
    if (typeof code !== 'string' || code.trim() === '') return { ok: false, error: 'code 不能为空' }
    if (code.length > 20000) return { ok: false, error: `code 过长（${code.length} 字符）：请拆分为多次 invoke。` }

    let sess = await this.ensureSession({ open: true })
    if (!sess.ok) return { ok: false, error: sess.error }

    const budget = Math.max(1000, Math.min(1800000, Math.round(timeoutMs)))
    let r = await this.invokeOnce(sess.sessionId, code, budget)
    // Session died between list and invoke → open a fresh one and retry once.
    if (!r.ok && r.retryable === true) {
      this.sessionId = null
      this.sessions = null
      sess = await this.ensureSession({ open: true })
      if (sess.ok) r = await this.invokeOnce(sess.sessionId, code, budget)
    }
    return r
  }

  async invokeOnce(sessionId, code, budgetMs) {
    const r = await this.#run(
      ['invoke', '--session', String(sessionId), '--ext-uuid', 'eda', '--code', code, '--timeout', String(budgetMs)],
      { timeoutMs: budgetMs + 15000 }, // outer guard: the CLI enforces its own budget first
    )
    if (r.timedOut) {
      return { ok: false, error: `invoke 超时（>${Math.round((budgetMs + 15000) / 1000)}s，进程已终止）` }
    }
    const env = parseEnvelope(r.stdout)
    if (env === null) {
      const hint = (r.stderr || r.stdout || '').trim().slice(0, 300)
      return { ok: false, error: hint === '' ? `invoke 无 JSON 输出（退出码 ${r.code}）` : hint }
    }
    if (env.ok !== true) {
      const msg = env.error?.message ?? env.error ?? 'invoke 失败'
      const errCode = env.error?.code ?? ''
      return {
        ok: false,
        error: String(msg).slice(0, 400),
        errorCode: typeof errCode === 'string' ? errCode : '',
        retryable: /session|会话|not\s*found/i.test(String(msg)) ? true : false,
      }
    }
    const val = env.value
    return {
      ok: true,
      result: typeof val === 'string' ? val : JSON.stringify(val === undefined ? null : val),
      durationMs: env.durationMs ?? null,
      logs: Array.isArray(env.logs) ? env.logs.slice(0, 50) : [],
    }
  }

  /** Local background task (CLI invoke is synchronous; we run it off-thread). */
  async submitTask(code) {
    if (!this.available()) return { ok: false, error: '未找到官方 CLI（lceda-pro / easyeda-pro）' }
    const taskId = randomUUID()
    const rec = { id: taskId, status: 'running', phase: 'invoke', createdAt: Date.now(), result: null, error: null, finishedAt: undefined }
    this.tasks.set(taskId, rec)
    void (async () => {
      const r = await this.execute(code, 1800000)
      rec.finishedAt = Date.now()
      if (r.ok) { rec.status = 'completed'; rec.result = r.result }
      else { rec.status = 'failed'; rec.error = r.error }
    })()
    return { ok: true, taskId, statusUrl: `/tasks/${taskId}` }
  }

  async getTask(taskId) {
    const rec = this.tasks.get(String(taskId))
    if (!rec) return { ok: false, error: `未知 taskId：${taskId}` }
    const out = {
      id: rec.id, operation: 'invoke', status: rec.status, phase: rec.phase,
      createdAt: rec.createdAt, updatedAt: rec.finishedAt ?? Date.now(),
      elapsedMs: (rec.finishedAt ?? Date.now()) - rec.createdAt,
    }
    if (rec.result !== null) out.result = rec.result
    if (rec.error !== null) out.error = rec.error
    if (rec.finishedAt !== undefined) out.finishedAt = rec.finishedAt
    return { ok: true, task: out }
  }

  async listTasks() {
    const tasks = []
    for (const id of this.tasks.keys()) {
      const r = await this.getTask(id)
      if (r.ok) tasks.push(r.task)
    }
    return { ok: true, tasks }
  }

  /**
   * Health snapshot — uses the FAST path (`session list`) so the 3-4 s status
   * polling stays cheap; `doctor` runs only when we have no session yet.
   */
  async refresh() {
    if (!this.available()) {
      this.state = STATE.error
      this.error = '未找到官方 CLI（需要客户端版 EasyEDA Pro v4.1.60+）'
      return this.status()
    }
    const list = await this.listSessions({ ttlMs: 1000 })
    const alive = list.filter((s) => s?.status === 'alive')
    if (alive.length > 0) {
      const current = alive.find((s) => s.sessionId === this.sessionId) ?? alive[0]
      if (this.sessionId === null) this.sessionId = String(current.sessionId)
      this.state = STATE.connected
      this.error = ''
      return this.status()
    }
    // No session: only now pay for doctor (cached) to distinguish
    // "client not running" from "editor running but no window".
    const d = await this.doctor({ ttlMs: 15000 })
    this.state = d.ok && d.connected ? STATE.idle : STATE.error
    this.error = d.ok ? '' : d.error
    return this.status()
  }

  /** Ensure a session exists (eda_backend_connect). */
  async start() {
    this.state = STATE.starting
    this.error = ''
    if (!this.available()) {
      this.state = STATE.error
      this.error = '未找到官方 CLI（lceda-pro / easyeda-pro）：请安装客户端版 EasyEDA Pro v4.1.60+'
      return this.status()
    }
    const d = await this.doctor({ force: true })
    if (!d.ok) { this.state = STATE.error; this.error = d.error; return this.status() }
    const s = await this.ensureSession({ open: true })
    if (!s.ok) { this.state = STATE.error; this.error = s.error; return this.status() }
    this.state = STATE.connected
    return this.status()
  }

  async callTool(name, params = {}) {
    const code = typeof params?.code === 'string' && params.code.trim() !== '' ? params.code : null
    if (code === null) return { ok: false, error: `CLI 后端请直接传官方 eda.* 代码（code 参数）：${name}` }
    return this.execute(code)
  }

  status() {
    const connected = this.state === STATE.connected
    const sessions = Array.isArray(this.sessions) ? this.sessions.length : null
    return {
      backend: 'official-cli',
      state: this.state,
      running: this.available(),
      connected,
      port: null,
      health: this.detail === null ? '' : `endpoint:${this.detail.endpoint ?? ''} bridge:${this.detail.bridgeVersion ?? ''} versionMatch:${this.detail.versionMatch ?? ''} sessions:${sessions ?? ''}`,
      error: this.error ?? '',
      ports: [],
      cli: this.available() ? this.exe : '',
      sessionId: this.sessionId,
      sessions,
    }
  }

  dispose() {
    this.sessionId = null
    if (this.state !== STATE.error) this.state = STATE.idle
  }
}

/**
 * Official MCP-HTTP backend: starts ONE long-lived \`lceda-pro --mcp http\`
 * server and drives it over JSON-RPC. This is the FAST path — measured 1–42 ms
 * per \`tools/call\` versus ~4–5 s for a fresh CLI process (the client binary is
 * an Electron app; process cold-start dominates the CLI route).
 *
 * MCP surface (official, verified on 4.1.78):
 *   tools: lceda-pro.help · lceda-pro.discover · lceda-pro.call
 *   lceda-pro.call { path: 'session.list' }                            → {ok,path,data:[sessions]}
 *   lceda-pro.call { path: 'invoke', input: {session, extUuid, code} } → {ok,path,data:<value>}
 */
export const MCP_PORTS = [49630, 49631, 49632, 49633, 49634]

export class EdaMcpBackend {
  constructor(cfg = {}) {
    this.cfg = cfg
    this.exe = cfg.cliExe ?? findCliExecutable(cfg.discovery ?? {})
    this.port = null
    this.child = null
    this.ready = false
    this.starting = null
    this.sessionId = cfg.sessionId ?? null
    this.sessionOkAt = 0
    this.sessions = null
    this.sessionsAt = 0
    this.tasks = new Map()
    this.state = STATE.idle
    this.error = ''
    this.seq = 1
    this.serverVersion = ''
  }

  available() { return typeof this.exe === 'string' && this.exe !== '' }

  /** One JSON-RPC round trip (handles plain JSON *and* SSE responses). */
  async rpc(method, params, timeoutMs = 60000) {
    if (this.port === null) return { error: { message: 'MCP 服务未启动' } }
    const res = await fetch('http://127.0.0.1:' + this.port + '/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: this.seq++, method, params }),
      signal: AbortSignal.timeout(Math.max(2000, timeoutMs)),
    })
    const text = await res.text()
    try { return JSON.parse(text) } catch { /* maybe SSE */ }
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim()
      if (!t.startsWith('data:')) continue
      try { return JSON.parse(t.slice(5).trim()) } catch { /* keep scanning */ }
    }
    return { error: { message: 'MCP 响应无法解析：' + text.slice(0, 160) } }
  }

  /** Start the server on the first free port and wait for initialize. */
  async ensureServer({ timeoutMs = 25000 } = {}) {
    if (this.ready) return { ok: true, port: this.port }
    // Never spawn the Electron MCP server from inside a test runner: it would
    // keep `node --test` alive and make every suite slow/flaky.
    if (this.cfg.allowSpawn !== true && isTestRunner()) {
      return { ok: false, error: '测试环境不启动 MCP 服务（allowSpawn≠true）' }
    }
    if (this.starting !== null) return this.starting
    this.starting = (async () => {
      try {
        for (const port of this.cfg.mcpPorts ?? MCP_PORTS) {
          if (await this.#spawnOn(port, timeoutMs)) {
            this.port = port
            this.ready = true
            this.error = ''
            return { ok: true, port }
          }
        }
        this.error = '官方 MCP HTTP 服务启动失败（lceda-pro --mcp http）'
        return { ok: false, error: this.error }
      } finally {
        this.starting = null
      }
    })()
    return this.starting
  }

  async #spawnOn(port, timeoutMs) {
    let child
    try {
      child = spawn(this.exe, ['--mcp', 'http', '--port', String(port)], {
        windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: this.cfg.env, cwd: this.cfg.cwd,
      })
    } catch { return false }
    let stderr = ''
    child.stderr?.on('data', (d) => { stderr += String(d) })
    child.on('exit', () => { if (this.port === port) { this.ready = false; this.child = null } })
    const deadline = Date.now() + timeoutMs
    this.port = port // rpc() needs it for the probe below
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 400))
      const res = await this.rpc('initialize', {
        protocolVersion: '2025-06-18', capabilities: {},
        clientInfo: { name: 'dsh-lichuang-eda', version: OWN_VERSION },
      }, 4000).catch(() => null)
      const info = res?.result?.serverInfo
      if (info !== undefined) {
        this.child = child
        this.serverVersion = String(info.version ?? '')
        return true
      }
    }
    try { child.kill() } catch { /* gone */ }
    this.port = null // never leave a dead port in status()
    if (stderr.trim() !== '') this.error = stderr.trim().slice(0, 200)
    return false
  }

  /** \`lceda-pro.call\` with the official input shape {path, input}. */
  async call(path, input, timeoutMs = 60000) {
    const s = await this.ensureServer()
    if (!s.ok) return { ok: false, error: s.error }
    const res = await this.rpc('tools/call', { name: 'lceda-pro.call', arguments: { path, input: input ?? {} } }, timeoutMs)
    if (res?.error) return { ok: false, error: String(res.error.message ?? res.error).slice(0, 300) }
    const content = res?.result?.content
    const text = Array.isArray(content) ? content.map((x) => x?.text ?? '').join('') : ''
    const parsed = parseEnvelope(text)
    if (parsed === null) return { ok: false, error: 'MCP 结果解析失败：' + text.slice(0, 200) }
    if (parsed.ok !== true) {
      const msg = parsed.error?.message ?? parsed.error ?? 'MCP 调用失败'
      return { ok: false, error: String(msg).slice(0, 400), errorCode: String(parsed.error?.code ?? ''), retryable: /session|会话|not\s*found/i.test(String(msg)) }
    }
    return { ok: true, data: parsed.data, durationMs: parsed.durationMs ?? null }
  }

  async listSessions({ ttlMs = 1500, force = false } = {}) {
    if (!force && Array.isArray(this.sessions) && Date.now() - this.sessionsAt < ttlMs) return this.sessions
    const r = await this.call('session.list')
    const list = r.ok && Array.isArray(r.data) ? r.data : []
    this.sessions = list
    this.sessionsAt = Date.now()
    return list
  }

  async ensureSession({ open = true } = {}) {
    if (this.sessionId !== null && Date.now() - this.sessionOkAt < 90000) {
      return { ok: true, sessionId: this.sessionId, reused: true, cached: true }
    }
    const list = await this.listSessions({ force: true })
    if (this.sessionId !== null) {
      const hit = list.find((x) => x?.sessionId === this.sessionId && x?.status === 'alive')
      if (hit) { this.sessionOkAt = Date.now(); return { ok: true, sessionId: this.sessionId, reused: true } }
      this.sessionId = null
    }
    const alive = list.find((x) => x?.status === 'alive')
    if (alive?.sessionId) {
      this.sessionId = String(alive.sessionId)
      this.sessionOkAt = Date.now()
      return { ok: true, sessionId: this.sessionId, reused: true }
    }
    if (!open) return { ok: false, error: '没有可用的编辑器会话（可用 eda_backend_connect 打开一个）' }
    const input = {}
    if (this.cfg.headless === true) input.headless = true
    if (typeof this.cfg.projectPath === 'string' && this.cfg.projectPath !== '') input.path = this.cfg.projectPath
    const o = await this.call('open', input, 90000)
    const sid = o.ok ? o.data?.sessionId : undefined
    if (typeof sid !== 'string') return { ok: false, error: String(o.error ?? 'open 失败').slice(0, 200) }
    this.sessionId = sid
    this.sessionOkAt = Date.now()
    this.sessions = null
    return { ok: true, sessionId: sid, reused: false, opened: true }
  }

  async execute(code, timeoutMs = 120000) {
    if (!this.available()) return { ok: false, error: '未找到官方 CLI（lceda-pro / easyeda-pro）' }
    if (typeof code !== 'string' || code.trim() === '') return { ok: false, error: 'code 不能为空' }
    const budget = Math.max(1000, Math.min(1800000, Math.round(timeoutMs)))
    let sess = await this.ensureSession({ open: true })
    if (!sess.ok) return { ok: false, error: sess.error }
    let r = await this.call('invoke', { session: sess.sessionId, extUuid: 'eda', code, timeout: budget }, budget + 10000)
    if (!r.ok && r.retryable === true) {
      this.sessionId = null
      this.sessions = null
      sess = await this.ensureSession({ open: true })
      if (sess.ok) r = await this.call('invoke', { session: sess.sessionId, extUuid: 'eda', code, timeout: budget }, budget + 10000)
    }
    if (!r.ok) return r
    this.sessionOkAt = Date.now()
    const val = r.data
    return { ok: true, result: typeof val === 'string' ? val : JSON.stringify(val === undefined ? null : val), durationMs: r.durationMs }
  }

  async submitTask(code) {
    if (!this.available()) return { ok: false, error: '未找到官方 CLI（lceda-pro / easyeda-pro）' }
    const taskId = randomUUID()
    const rec = { id: taskId, status: 'running', phase: 'invoke', createdAt: Date.now(), result: null, error: null, finishedAt: undefined }
    this.tasks.set(taskId, rec)
    void (async () => {
      const r = await this.execute(code, 1800000)
      rec.finishedAt = Date.now()
      if (r.ok) { rec.status = 'completed'; rec.result = r.result }
      else { rec.status = 'failed'; rec.error = r.error }
    })()
    return { ok: true, taskId, statusUrl: '/tasks/' + taskId }
  }

  async getTask(taskId) {
    const rec = this.tasks.get(String(taskId))
    if (!rec) return { ok: false, error: '未知 taskId：' + taskId }
    const out = {
      id: rec.id, operation: 'invoke', status: rec.status, phase: rec.phase,
      createdAt: rec.createdAt, updatedAt: rec.finishedAt ?? Date.now(),
      elapsedMs: (rec.finishedAt ?? Date.now()) - rec.createdAt,
    }
    if (rec.result !== null) out.result = rec.result
    if (rec.error !== null) out.error = rec.error
    if (rec.finishedAt !== undefined) out.finishedAt = rec.finishedAt
    return { ok: true, task: out }
  }

  async listTasks() {
    const tasks = []
    for (const id of this.tasks.keys()) {
      const r = await this.getTask(id)
      if (r.ok) tasks.push(r.task)
    }
    return { ok: true, tasks }
  }

  async refresh() {
    if (!this.available()) {
      this.state = STATE.error
      this.error = '未找到官方 CLI（需要客户端版 EasyEDA Pro v4.1.60+）'
      return this.status()
    }
    const s = await this.ensureServer({ timeoutMs: this.cfg.mcpStartMs ?? 25000 })
    if (!s.ok) {
      this.state = STATE.error
      this.error = s.error
      return this.status()
    }
    const list = await this.listSessions({ ttlMs: 2000, force: false })
    const alive = list.filter((x) => x?.status === 'alive')
    if (alive.length > 0) {
      const cur = alive.find((x) => x.sessionId === this.sessionId) ?? alive[0]
      if (this.sessionId === null) { this.sessionId = String(cur.sessionId); this.sessionOkAt = Date.now() }
      this.state = STATE.connected
      this.error = ''
    } else {
      this.state = STATE.idle
      this.error = ''
    }
    return this.status()
  }

  async start() {
    this.state = STATE.starting
    const s = await this.ensureServer({ timeoutMs: this.cfg.mcpStartMs ?? 25000 })
    if (!s.ok) { this.state = STATE.error; this.error = s.error; return this.status() }
    const sess = await this.ensureSession({ open: true })
    if (!sess.ok) { this.state = STATE.error; this.error = sess.error; return this.status() }
    this.state = STATE.connected
    return this.status()
  }

  async callTool(name, params = {}) {
    const code = typeof params?.code === 'string' && params.code.trim() !== '' ? params.code : null
    if (code === null) return { ok: false, error: 'MCP 后端请直接传官方 eda.* 代码（code 参数）：' + name }
    return this.execute(code)
  }

  status() {
    return {
      backend: 'official-mcp-http',
      state: this.state,
      running: this.ready,
      connected: this.state === STATE.connected,
      port: this.port,
      health: 'mcp:' + (this.serverVersion || '—') + ' sessions:' + (Array.isArray(this.sessions) ? this.sessions.length : '—'),
      error: this.error ?? '',
      ports: [],
      cli: this.available() ? this.exe : '',
      sessionId: this.sessionId,
      sessions: Array.isArray(this.sessions) ? this.sessions.length : null,
    }
  }

  dispose() {
    try { this.child?.kill() } catch { /* gone */ }
    this.child = null
    this.ready = false
    this.port = null
    this.sessionId = null
    if (this.state !== STATE.error) this.state = STATE.idle
  }
}

/**
 * Unified facade — three tiers, best first:
 *   1. official-mcp-http  常驻 MCP HTTP（毫秒级；需客户端 v4.1.60+）
 *   2. official-cli       每次 spawn lceda-pro invoke（约 4–5 s；需客户端）
 *   3. official-easyeda-bridge  官方桥 + Run API Gateway（网页版回退）
 * Every method keeps the EdaBackend contract, so all tools and the panel work
 * unchanged whichever tier serves.
 *
 * @param {object} cfg {
 *   cliExe?, cliPrefixArgs?, env?, cwd?, sessionId?, headless?, projectPath?, mcpPorts?, mcpStartMs?, prefer?,
 *   bridgeDir?, nodeBin?, discoveryPorts?, spawnBridge?
 * }
 */
/**
 * Unified facade — 双后端互备（desktop MCP/CLI 与 web bridge 可同时存在）：
 *
 *   Tier 1  official-mcp-http        桌面客户端内置 MCP HTTP 常驻服务（≈65ms/次）
 *   Tier 2  official-cli             桌面客户端内置 CLI（≈3s/次，Electron 冷启动）
 *   Tier 3  official-easyeda-bridge  网页/在线版 + 官方扩展 Run API Gateway（≈300ms/次）
 *
 * 选档规则：
 *  · prefer='auto'（默认）——按 1→2→3 依次探测，**谁真的连着就用谁**；
 *    桌面客户端没开但网页编辑器连着桥时，会自动走桥；
 *  · prefer='mcp'|'cli'|'bridge'——强制指定（调试/复现用）。
 *
 * 失败转移：执行时报「未连接 / 没有会话 / 未找到 CLI」这类**连接性**错误时，
 * 自动换下一个档位重试一次（这类错误说明代码根本没跑，重试安全）。
 * 业务/执行错误（代码跑了但抛错）**绝不重试**，避免重复落图元。
 *
 * 所有方法保持 EdaBackend 契约，24 个工具与面板对后端无感。
 *
 * @param {object} cfg {
 *   prefer?: 'auto'|'mcp'|'cli'|'bridge',
 *   cliExe?, cliPrefixArgs?, env?, cwd?, sessionId?, headless?, projectPath?,
 *   mcpPorts?, mcpStartMs?, probeTtlMs?,
 *   bridgeDir?, nodeBin?, discoveryPorts?, spawnBridge?, probeTimeoutMs?,
 *   timeouts?
 * }
 */
export class EdaUnifiedBackend {
  constructor(cfg = {}) {
    this.cfg = cfg
    this.mcp = new EdaMcpBackend(cfg)
    this.cli = new EdaCliBackend(cfg)
    this.bridge = new EdaBackend(cfg)
    this.mcpFailed = false
    this.lastMode = this.resolveMode()
    /** 每档最近一次探测结果（status() 汇总用）。 */
    this.tierStatus = { mcp: null, cli: null, bridge: null }
    this.tierStatusAt = 0
    this.probeTtlMs = cfg.probeTtlMs ?? 2500
  }

  // ── Compatibility accessors ──────────────────────────────────────────────
  // 旧代码/测试会直接改 EdaBackend 的字段做隔离（discoveryPorts/spawnBridge/
  // timeouts/port/state）；这里全部转发，保证既有用法与测试继续有效。
  get discoveryPorts() { return this.bridge.discoveryPorts }
  set discoveryPorts(v) { this.bridge.discoveryPorts = v }
  get spawnBridge() { return this.bridge.spawnBridge }
  set spawnBridge(v) { this.bridge.spawnBridge = v }
  get timeouts() { return this.bridge.timeouts }
  set timeouts(v) {
    this.bridge.timeouts = v
    this.cli.timeouts = v
    this.cfg.timeouts = v
  }
  get port() { return this.active().port }
  set port(v) {
    // 测试用：伪造一个「桥在跑且编辑器已连」的现场。
    this.bridge.port = v
    if (v !== null && v !== undefined) {
      this.bridge.state = 'connected'
      this.bridge.lastHealth = {
        ok: true,
        port: v,
        raw: JSON.stringify({ service: 'easyeda-bridge', ok: true, edaConnected: true, edaWindowCount: 1 }),
        edaConnected: true,
        edaWindowCount: 1,
      }
    }
  }
  get state() { return this.active().state }
  set state(v) { this.bridge.state = v }
  isRunning() { return this.bridge.isRunning() }

  /** 某档位的实例。 */
  tier(name) {
    if (name === 'mcp') return this.mcp
    if (name === 'cli') return this.cli
    return this.bridge
  }

  /** auto 模式下的探测顺序（只含真正可用的档位）。 */
  order() {
    const list = []
    if (this.mcp.available() && !this.mcpFailed) list.push('mcp')
    if (this.cli.available()) list.push('cli')
    list.push('bridge') // 桥永远可尝试（未装则优雅失败）
    return list
  }

  /** 当前应使用哪一档（同步；不探测，只看上次结论 + 可用性）。 */
  resolveMode() {
    const prefer = this.cfg.prefer ?? 'auto'
    if (prefer === 'mcp' || prefer === 'cli' || prefer === 'bridge') return prefer
    const list = this.order()
    // 上次探测选中的档位仍可用 → 继续用（避免来回抖）
    if (this.lastMode && list.includes(this.lastMode) && this.tierStatus[this.lastMode]?.connected === true) {
      return this.lastMode
    }
    return list[0]
  }

  active() {
    const mode = this.resolveMode()
    this.lastMode = mode
    return this.tier(mode)
  }

  /** 把某个档位的 status() 压缩成简短事实（面板/eda_status 展示用）。 */
  static summarize(st) {
    if (!st) return { connected: false, state: 'unknown' }
    return {
      connected: st.connected === true,
      state: st.state ?? 'unknown',
      backend: st.backend ?? '',
      port: st.port ?? null,
      sessionId: st.sessionId ?? '',
      error: st.error ?? '',
    }
  }

  /**
   * 探测所有档位并选用第一个真正连通的。
   * 结果缓存 probeTtlMs，避免每 3~4 秒的 /status 轮询把三档全打一遍。
   */
  async refresh({ force = false } = {}) {
    const fresh = !force && Date.now() - this.tierStatusAt < this.probeTtlMs && Object.values(this.tierStatus).some(Boolean)
    const prefer = this.cfg.prefer ?? 'auto'

    if (prefer !== 'auto') {
      const tier = this.tier(prefer)
      const st = await tier.refresh()
      this.lastMode = prefer
      this.tierStatus[prefer] = EdaUnifiedBackend.summarize(st)
      this.tierStatusAt = Date.now()
      return { ...st, modes: this.modesSnapshot() }
    }

    if (fresh) {
      const mode = this.resolveMode()
      return { ...this.tier(mode).status(), modes: this.modesSnapshot(), cached: true }
    }

    const reports = {}
    let chosen = null
    let chosenStatus = null
    for (const name of this.order()) {
      let st
      try { st = await this.tier(name).refresh() } catch (err) { st = { connected: false, state: 'error', error: String(err?.message ?? err) } }
      reports[name] = EdaUnifiedBackend.summarize(st)
      this.tierStatus[name] = reports[name]
      if (st.connected === true && chosen === null) { chosen = name; chosenStatus = st }
      // 桌面档位启动失败（MCP 端口起不来）→ 本次进程内降级，不再反复尝试
      if (name === 'mcp' && st.connected !== true && st.state === STATE.error && /MCP|启动失败|未找到/.test(String(st.error ?? ''))) {
        this.mcpFailed = true
      }
    }
    this.tierStatusAt = Date.now()

    if (chosen !== null) {
      this.lastMode = chosen
      return { ...chosenStatus, modes: reports }
    }
    // 全都没连上：返回首选档位的状态（它的错误信息最贴近用户该修的东西）
    const first = this.order()[0]
    this.lastMode = first
    return { ...this.tier(first).status(), modes: reports }
  }

  /** status() 用的档位快照（不触发探测）。 */
  modesSnapshot() {
    return {
      mcp: { available: this.mcp.available(), port: this.mcp.port, ready: this.mcp.ready, version: this.mcp.serverVersion, ...(this.tierStatus.mcp ?? {}) },
      cli: { available: this.cli.available(), exe: this.cli.available() ? this.cli.exe : '', ...(this.tierStatus.cli ?? {}) },
      bridge: { available: true, ...(this.tierStatus.bridge ?? {}) },
    }
  }

  /** 连接性错误：代码根本没执行 → 可以安全换档重试。 */
  static isConnectivityError(msg) {
    const t = String(msg ?? '')
    return /未连接|没有可用|没有编辑器连接|未找到官方|未找到 CLI|MCP 服务未启动|session.*not found|会话.*(失效|不存在)|not connected/i.test(t)
  }

  /**
   * 执行官方 eda.* 代码。主档失败且判定为**连接性错误**时，自动换下一个档位重试一次。
   */
  async execute(code, timeoutMs) {
    const prefer = this.cfg.prefer ?? 'auto'
    let attempts = prefer === 'auto' ? this.order() : [prefer]
    let last = null
    for (let i = 0; i < attempts.length; i++) {
      const name = attempts[i]
      const tier = this.tier(name)
      let r
      try { r = await tier.execute(code, timeoutMs) } catch (err) { r = { ok: false, error: String(err?.message ?? err) } }
      let backendId = name
      try { backendId = tier.status()?.backend ?? name } catch { /* keep key */ }
      last = { ...r, tier: name, backend: backendId }
      if (r.ok === true) {
        this.lastMode = name
        this.tierStatus[name] = { ...(this.tierStatus[name] ?? {}), connected: true, state: STATE.connected }
        return last
      }
      // 不是连接性问题 → 立刻返回（代码已执行过，绝不能重跑）
      if (!EdaUnifiedBackend.isConnectivityError(r.error)) return last
      // 连接性问题 → 记录并尝试下一档
      this.tierStatus[name] = { ...(this.tierStatus[name] ?? {}), connected: false, state: r.state ?? 'idle', error: r.error }
    }
    return last ?? { ok: false, error: '没有可用的 EDA 后端（桌面客户端未运行，网页桥也未连接）' }
  }

  /** 启动/连接：按顺序尝试，第一个成功的生效。 */
  async start() {
    const prefer = this.cfg.prefer ?? 'auto'
    const attempts = prefer === 'auto' ? this.order() : [prefer]
    let last = null
    for (const name of attempts) {
      const tier = this.tier(name)
      let st
      try { st = await tier.start() } catch (err) { st = { connected: false, state: 'error', error: String(err?.message ?? err) } }
      this.tierStatus[name] = EdaUnifiedBackend.summarize(st)
      last = st
      if (st.connected === true) { this.lastMode = name; this.tierStatusAt = Date.now(); return { ...st, modes: this.modesSnapshot() } }
    }
    this.tierStatusAt = Date.now()
    return { ...(last ?? {}), modes: this.modesSnapshot() }
  }

  submitTask(code) { return this.active().submitTask(code) }
  getTask(id) { return this.active().getTask(id) }
  listTasks() { return this.active().listTasks() }
  callTool(name, params) { return this.active().callTool(name, params) }

  /** CLI \`doctor\` 事实（仅桌面客户端）。 */
  async doctor(opts) { return this.cli.available() ? this.cli.doctor(opts) : { ok: false, error: '未找到官方 CLI' } }

  status() {
    const base = this.active().status()
    const modes = this.modesSnapshot()
    const connectedTiers = Object.entries(modes).filter(([, v]) => v && v.connected === true).map(([k]) => k)
    return { ...base, modes, connectedTiers }
  }

  dispose() {
    try { this.mcp.dispose() } catch { /* ignore */ }
    try { this.cli.dispose() } catch { /* ignore */ }
    try { this.bridge.dispose() } catch { /* ignore */ }
  }
}

export const CLI_HOME_HINT = join(homedir(), '.dsh', 'eda')
