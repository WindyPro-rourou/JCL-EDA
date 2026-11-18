/**
 * dsh-lichuang-eda — EDA backend adapter (OFFICIAL STACK ONLY).
 *
 * Based entirely on the official 嘉立创EDA(专业版) extension ecosystem:
 *
 *   [EasyEDA Pro 窗口（官方扩展 Run API Gateway，已开「允许外部交互」）]
 *        │  WS 客户端连出（自动扫描端口 49620-49629 + 握手 easyeda-bridge）
 *        ▼
 *   [官方 Bridge Server（easyeda/easyeda-api-skill 的 scripts/bridge-server.mjs）]
 *        │  HTTP: GET /health · POST /execute {"code": "return await eda.xxx()"}
 *        ▼
 *   [DSH 插件 dsh-lichuang-eda]（本文件：spawn/health/execute）
 *
 * Sources (all official, verified in-repo 2026-08):
 *   - easyeda/easyeda-api-skill      (Skill `easyeda-api` v1.1.28, MIT, author JLCEDA)
 *   - easyeda/eext-run-api-gateway   (扩展 Run API Gateway, jlc-ext.com/item/oshwhub/run-api-gateway)
 *   - prodocs.easyeda.com/cn/api/    (官方 API 参考: SCH_Drc/SCH_Netlist/SCH_ManufactureData/…)
 *
 * No third-party backend (easyeda-agent / jlcmcp / easyeda-mcp-pro) is used here.
 */

import { spawn } from 'node:child_process'

export const BRIDGE_PORTS = Array.from({ length: 10 }, (_, i) => 49620 + i)
export const BRIDGE_SERVICE = 'easyeda-bridge'

export const STATE = {
  idle: 'idle',
  starting: 'starting',
  ready: 'ready',
  connected: 'connected',
  error: 'error',
}

/** Official API snippets per action id (prodocs.easyeda.com/cn/api/).
 *  Notes: DRC must use the verbose overload to GET the error list (the bare
 *  `check()` returns only boolean); netlist is a File whose bridge JSON
 *  serialization is `{}`, so read `f.text()`; BOM is a BINARY xlsx File, so
 *  it is returned as base64 (`{name,size,b64}`). */
export const OFFICIAL_CODES = {
  'sch.drc': 'return await eda.sch_Drc.check(true, false, true);',
  'sch.netlist': `return await (async () => { const f = await eda.sch_ManufactureData.getNetlistFile(); return f ? await f.text() : null; })();`,
  'sch.bom': `return await (async () => { const f = await eda.sch_ManufactureData.getBomFile(); if (!f) return null; const bytes = new Uint8Array(await f.arrayBuffer()); let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return { name: f.name, size: f.size, b64: btoa(bin) }; })();`,
  'pcb.drc': 'return await eda.pcb_Drc.check(true, false, true);',
  'project.info': 'return await eda.dmt_Project.getCurrentProjectInfo();',
}

async function httpJson(method, url, body, timeoutMs = 15000) {
  const res = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await res.text()
  let parsed = null
  try { parsed = JSON.parse(text) } catch { parsed = null }
  return { ok: res.ok, status: res.status, text, json: parsed }
}

/** Scan the official port range (or an injected set) for a live bridge. */
export async function findBridgePort(timeoutMs = 6000, ports = BRIDGE_PORTS) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    for (const port of ports) {
      try {
        const r = await httpJson('GET', `http://127.0.0.1:${port}/health`, undefined, 1000)
        if (r.ok && /easyeda-bridge/.test(r.text)) return port
      } catch { /* port closed — keep scanning */ }
    }
    await new Promise((res) => setTimeout(res, 500))
  }
  return null
}

/**
 * The official bridge: spawns the official Bridge Server (if not already
 * running), discovers its port, and executes `eda.*` code through it.
 * @param {object} cfg {
 *   bridgeDir='~/.dsh/eda/bridge'  — vendored easyeda-api-skill (npm install 后含 scripts/bridge-server.mjs)
 *   nodeBin='node', discoveryPorts=BRIDGE_PORTS, spawnBridge=true, timeouts
 * }
 */
export class EdaBackend {
  constructor(cfg = {}) {
    this.cfg = cfg
    this.bridgeDir = cfg.bridgeDir ?? ''
    this.nodeBin = cfg.nodeBin ?? process.execPath
    this.discoveryPorts = cfg.discoveryPorts ?? BRIDGE_PORTS
    this.spawnBridge = cfg.spawnBridge ?? true
    this.timeouts = cfg.timeouts ?? { startMs: 25000, callMs: 60000 }
    /** Per-port health probe budget (tests inject a smaller one). */
    this.probeTimeoutMs = cfg.probeTimeoutMs ?? 1500
    this.state = STATE.idle
    this.error = null
    this.child = null
    this.port = null
    this.lastHealth = null
  }

  isRunning() {
    return this.port !== null ||
      (this.spawnBridge && this.child !== null && this.child.exitCode === null)
  }

  /**
   * 解析桥的 /health：
   *   service=easyeda-bridge  = **桥服务本身**在跑
   *   edaConnected            = 是否有 **编辑器**（网页版 + Run API Gateway 扩展）连上来
   * 两者是两件事：服务在跑但编辑器没连时，执行一定失败 → connected 必须看 edaConnected。
   */
  parseHealth(port, text) {
    let json = null
    try { json = JSON.parse(text) } catch { /* 非 JSON 的桥版本 */ }
    const isBridge = /easyeda-bridge/.test(text)
    const edaConnected = json !== null && typeof json.edaConnected === 'boolean'
      ? json.edaConnected === true
      : isBridge // 老版本桥没有该字段 → 沿用旧行为（服务在即认为可用）
    return {
      ok: true,
      port,
      raw: text.slice(0, 300),
      edaConnected,
      edaWindowCount: json?.edaWindowCount ?? null,
      bridgeVersion: json?.version ?? '',
    }
  }

  /** Probe the discovery port range (real or injected). */
  async discover() {
    for (const port of this.discoveryPorts) {
      try {
        const r = await httpJson('GET', `http://127.0.0.1:${port}/health`, undefined, this.probeTimeoutMs)
        if (r.ok && /easyeda-bridge/.test(r.text)) {
          this.port = port
          this.lastHealth = this.parseHealth(port, r.text)
          return port
        }
      } catch { /* keep scanning */ }
    }
    return null
  }

  /** One live probe of the current (or first reachable) bridge port. */
  async probeCurrent() {
    for (const port of this.port !== null ? [this.port] : this.discoveryPorts) {
      try {
        const r = await httpJson('GET', `http://127.0.0.1:${port}/health`, undefined, this.probeTimeoutMs)
        if (r.ok && /easyeda-bridge/.test(r.text)) {
          this.port = port
          this.lastHealth = this.parseHealth(port, r.text)
          return this.lastHealth
        }
      } catch { /* port closed */ }
    }
    return null
  }

  /**
   * Refresh the health snapshot live (the cached one goes stale: an editor may
   * connect/disconnect after `start()`). Called by /status, eda_status and the
   * bridge-gated tools so they always see the CURRENT connection facts.
   *
   * 注意：桥服务在跑 ≠ 可用。只有 edaConnected=true（编辑器已连）才算 connected；
   * 服务在跑但编辑器没连时是 idle（有端口、可执行会失败）。
   */
  async refresh() {
    const h = await this.probeCurrent()
    if (h === null) {
      // 服务也没了
      if (this.state === STATE.connected) this.state = STATE.idle
      return this.status()
    }
    // 探到健康响应就说明服务在 → 无论之前是什么状态都以实测为准
    this.state = h.edaConnected === true ? STATE.connected : STATE.idle
    this.error = ''
    return this.status()
  }

  async start() {
    if (this.port !== null) return this.status()
    this.state = STATE.starting
    this.error = null
    // Nothing to wait for (no ports to probe, no server to spawn) → fail fast
    // instead of spinning the 25 s readiness loop (tests rely on this).
    if (!this.spawnBridge && this.discoveryPorts.length === 0) {
      this.state = STATE.error
      this.error = '官方桥未启用（无探测端口且不启动服务）'
      return this.status()
    }
    // 1) spawn the official bridge server (background) if nothing is on the range.
    if (!(await this.discover()) && this.spawnBridge) {
      try {
        const sep = process.platform === 'win32' ? '\\' : '/'
        const script = this.bridgeDir.replace(/[\\/]+$/, '') + sep + 'scripts' + sep + 'bridge-server.mjs'
        const child = spawn(this.nodeBin, [script], {
          stdio: ['ignore', 'ignore', 'pipe'],
          windowsHide: true,
          cwd: this.bridgeDir || undefined,
        })
        this.child = child
        child.stderr?.on('data', (d) => { this.error = String(d).slice(-400) })
        child.on('exit', () => { if (this.state !== STATE.idle) this.state = STATE.error })
      } catch (error) {
        this.state = STATE.error
        this.error = error instanceof Error ? error.message : String(error)
        return this.status()
      }
    }
    // 2) wait for health on the official port range.
    const deadline = Date.now() + this.timeouts.startMs
    let port = null
    while (Date.now() < deadline && port === null) {
      port = await this.discover()
      if (port !== null) break
      await new Promise((res) => setTimeout(res, 700))
    }
    if (port !== null) {
      // 桥服务在跑，但编辑器可能还没连上来 → idle，而不是假 connected。
      this.state = this.lastHealth?.edaConnected === true ? STATE.connected : STATE.idle
      this.error = ''
    } else {
      this.state = STATE.error
      if (!this.error) {
        this.error = '官方桥未就绪（49620-49629 无 easyeda-bridge 服务）。请确认：① 已一键安装/启动官方桥；② EasyEDA Pro 已安装 Run API Gateway 扩展并勾选「允许外部交互」。'
      }
    }
    return this.status()
  }

  /** Execute official `eda.*` code through the bridge. */
  async execute(code, timeoutMs = this.timeouts.callMs) {
    if (this.port === null) {
      return { ok: false, error: '官方桥未连接（请先启动桥并确认扩展已勾选「允许外部交互」）' }
    }
    // 桥在跑但网页编辑器没连上来 → 明确报「未连接」，让统一门面可以安全转移到其他档位。
    if (this.lastHealth?.edaConnected === false) {
      return { ok: false, error: '官方桥已启动但没有编辑器连接：请在网页版 EasyEDA Pro 打开任意工程，并确认 Run API Gateway 扩展已勾选「允许外部交互」。' }
    }
    try {
      const r = await httpJson('POST', `http://127.0.0.1:${this.port}/execute`, { code }, timeoutMs)
      if (r.ok) {
        // Normalize: prefer the JSON `result` field; fall back to raw text.
        const val = r.json?.result !== undefined ? r.json.result : r.text
        return { ok: true, result: typeof val === 'string' ? val : JSON.stringify(val) }
      }
      // Async-task patch (community #16): a timed-out /execute returns HTTP 504
      // WITH a taskId — the execution was NOT cancelled and late results are
      // retained under /tasks/<id>.
      const taskId = r.json?.taskId
      if (taskId) {
        return {
          ok: false,
          taskId,
          error: `执行超过 ${Math.round(timeoutMs / 1000)}s（HTTP ${r.status}），任务未取消：可用 eda_task 查询 taskId=${taskId} 取迟到结果。`,
        }
      }
      return { ok: false, error: `execute 失败（HTTP ${r.status}）：${r.text.slice(0, 300)}` }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  /** Submit code as a background task (bridge async-task patch, HTTP 202). */
  async submitTask(code) {
    if (this.port === null) return { ok: false, error: '官方桥未连接' }
    try {
      const r = await httpJson('POST', `http://127.0.0.1:${this.port}/tasks`, { code }, 20000)
      if (r.ok && r.json?.taskId) {
        return { ok: true, taskId: r.json.taskId, statusUrl: r.json.statusUrl ?? `/tasks/${r.json.taskId}` }
      }
      return { ok: false, error: r.json?.error ?? `tasks 提交失败（HTTP ${r.status}）：${r.text.slice(0, 200)}` }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  /** Query one background task (status/phase/elapsedMs/result/errorDetails/events). */
  async getTask(taskId) {
    if (this.port === null) return { ok: false, error: '官方桥未连接' }
    try {
      const r = await httpJson('GET', `http://127.0.0.1:${this.port}/tasks/${encodeURIComponent(taskId)}`, undefined, 15000)
      if (r.ok && r.json) return { ok: true, task: r.json }
      return { ok: false, error: r.json?.error ?? `查询失败（HTTP ${r.status}）` }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  /** List retained tasks (bounded, in-memory). */
  async listTasks() {
    if (this.port === null) return { ok: false, error: '官方桥未连接' }
    try {
      const r = await httpJson('GET', `http://127.0.0.1:${this.port}/tasks`, undefined, 15000)
      if (r.ok && Array.isArray(r.json?.tasks)) return { ok: true, tasks: r.json.tasks }
      return { ok: false, error: r.json?.error ?? `列表失败（HTTP ${r.status}）` }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  /**
   * Call one action: uses the official snippet for known ids, or runs a raw
   * code snippet passed in params.code (official execute accepts any code).
   */
  async callTool(name, params = {}) {
    const code = (typeof params?.code === 'string' && params.code.trim() !== '')
      ? params.code
      : OFFICIAL_CODES[name]
    if (code === undefined) {
      return { ok: false, error: `未知动作 ${name}（可用官方 eda.* 代码直接传 code 执行；已知映射：${Object.keys(OFFICIAL_CODES).join(', ')}）` }
    }
    return this.execute(code)
  }

  status() {
    const serverUp = this.port !== null || (this.child !== null && this.child.exitCode === null)
    const edaConnected = this.lastHealth?.edaConnected === true
    return {
      backend: 'official-easyeda-bridge',
      state: this.state,
      running: serverUp,
      // 关键语义：桥服务在跑 ≠ 能执行。必须有编辑器连上来（edaConnected）。
      connected: this.port !== null && this.state === STATE.connected && edaConnected,
      serverUp,
      edaConnected,
      edaWindowCount: this.lastHealth?.edaWindowCount ?? null,
      port: this.port,
      health: this.lastHealth?.raw ?? '',
      error: this.error ?? '',
      ports: this.discoveryPorts,
    }
  }

  dispose() {
    try { this.child?.kill() } catch { /* gone */ }
    this.child = null
    this.port = null
    this.lastHealth = null
    if (this.state !== STATE.error) this.state = STATE.idle
  }
}
