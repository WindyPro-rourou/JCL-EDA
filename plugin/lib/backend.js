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

  /** Probe the discovery port range (real or injected). */
  async discover() {
    for (const port of this.discoveryPorts) {
      try {
        const r = await httpJson('GET', `http://127.0.0.1:${port}/health`, undefined, 1500)
        if (r.ok && /easyeda-bridge/.test(r.text)) {
          this.port = port
          this.lastHealth = { ok: true, port, raw: r.text.slice(0, 300) }
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
        const r = await httpJson('GET', `http://127.0.0.1:${port}/health`, undefined, 1500)
        if (r.ok && /easyeda-bridge/.test(r.text)) {
          this.port = port
          this.lastHealth = { ok: true, port, raw: r.text.slice(0, 300) }
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
   */
  async refresh() {
    const h = await this.probeCurrent()
    if (h !== null && this.state !== STATE.error) this.state = STATE.connected
    return this.status()
  }

  async start() {
    if (this.port !== null) return this.status()
    this.state = STATE.starting
    this.error = null
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
      this.state = STATE.connected
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
    try {
      const r = await httpJson('POST', `http://127.0.0.1:${this.port}/execute`, { code }, timeoutMs)
      if (r.ok) {
        // Normalize: prefer the JSON `result` field; fall back to raw text.
        const val = r.json?.result !== undefined ? r.json.result : r.text
        return { ok: true, result: typeof val === 'string' ? val : JSON.stringify(val) }
      }
      return { ok: false, error: `execute 失败（HTTP ${r.status}）：${r.text.slice(0, 300)}` }
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
    return {
      backend: 'official-easyeda-bridge',
      state: this.state,
      running: this.port !== null || (this.child !== null && this.child.exitCode === null),
      connected: this.port !== null && this.state === STATE.connected,
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
