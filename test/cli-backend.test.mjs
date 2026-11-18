/**
 * dsh-lichuang-eda · official CLI / MCP backend unit tests.
 *
 * Everything here is injected or stubbed — no Electron client is ever spawned
 * (see isTestRunner()) and no real board is touched.
 */
import { test } from 'node:test'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import {
  findCliExecutable,
  defaultCliCandidates,
  parseEnvelope,
  isTestRunner,
  EdaUnifiedBackend,
  EdaMcpBackend,
  CLI_NAMES,
} from '../lib/cli-backend.js'

const never = () => false
const only = (paths) => (p) => paths.includes(p)

test('findCliExecutable: 环境变量显式指定优先', () => {
  const exe = 'D:/custom/lceda-pro.exe'
  assert.equal(findCliExecutable({ env: { DSH_EDA_CLI: exe }, exists: only([exe]), useRegistry: false }), exe)
  assert.equal(findCliExecutable({ env: { LCEDA_PRO_BIN: exe }, exists: only([exe]), useRegistry: false }), exe)
})

test('findCliExecutable: PATH → 候选路径 → null', () => {
  // findCliExecutable builds paths with join(), so compare against join() output.
  const inPath = join('C:/Bin', process.platform === 'win32' ? 'lceda-pro.exe' : 'lceda-pro')
  assert.equal(
    findCliExecutable({ env: { PATH: 'C:/Bin' }, pathDirs: ['C:/Bin'], candidates: [], useRegistry: false, exists: only([inPath]) }),
    inPath,
  )
  const cand = join('F:/lichuang_eda/lceda-pro', process.platform === 'win32' ? 'lceda-pro.exe' : 'lceda-pro')
  assert.equal(
    findCliExecutable({ env: { PATH: '' }, pathDirs: [], candidates: [cand], useRegistry: false, exists: only([cand]) }),
    cand,
  )
  assert.equal(findCliExecutable({ env: { PATH: '' }, pathDirs: [], candidates: [cand], useRegistry: false, exists: never }), null)
})

test('defaultCliCandidates: 覆盖便携布局（lichuang_eda）且非空', () => {
  const list = defaultCliCandidates()
  assert.ok(list.length > 0)
  assert.ok(list.some((p) => /lichuang_eda/i.test(p)), '应含本机实测的 lichuang_eda 布局')
  assert.ok(list.some((p) => /easyeda-pro/.test(p)))
  assert.ok(list.some((p) => /lceda-pro/.test(p)))
})

test('parseEnvelope: 纯 JSON / 带日志前缀 / SSE / 垃圾输入', () => {
  assert.deepEqual(parseEnvelope('{"ok":true,"value":2}'), { ok: true, value: 2 })
  assert.deepEqual(parseEnvelope('[log] starting\n{"ok":true,"value":"x"}\n'), { ok: true, value: 'x' })
  assert.deepEqual(parseEnvelope('event: message\ndata: {"ok":false,"error":{"message":"boom"}}\n'), { ok: false, error: { message: 'boom' } })
  assert.equal(parseEnvelope(''), null)
  assert.equal(parseEnvelope('not json at all'), null)
})

test('isTestRunner: execArgv/env 判定（argv 会被 node 剥掉，不能只看 argv）', () => {
  assert.equal(isTestRunner({ NODE_TEST_CONTEXT: 'child' }, []), true)
  assert.equal(isTestRunner({ DSH_EDA_NO_AUTOSTART: '1' }, []), true)
  assert.equal(isTestRunner({}, ['--experimental-test-isolation=none', '--test']), true)
  assert.equal(isTestRunner({}, ['--test-timeout=30000']), true)
  assert.equal(isTestRunner({}, []), false)
})

test('EdaUnifiedBackend: prefer 覆盖 + auto 选档', () => {
  const exe = 'X:/lceda-pro.exe'
  assert.equal(new EdaUnifiedBackend({ cliExe: exe, prefer: 'bridge' }).resolveMode(), 'bridge')
  assert.equal(new EdaUnifiedBackend({ cliExe: exe, prefer: 'cli' }).resolveMode(), 'cli')
  assert.equal(new EdaUnifiedBackend({ cliExe: exe, prefer: 'mcp' }).resolveMode(), 'mcp')
  assert.equal(new EdaUnifiedBackend({ cliExe: exe }).resolveMode(), 'mcp', '有客户端 → 常驻 MCP 优先')
  assert.equal(new EdaUnifiedBackend({ cliExe: '' }).resolveMode(), 'bridge', '无客户端 → 回退官方桥')
})

test('EdaUnifiedBackend: 门面兼容访问器转发到内层后端（测试隔离依赖它）', () => {
  const b = new EdaUnifiedBackend({ cliExe: 'X:/lceda-pro.exe', prefer: 'bridge' })
  b.discoveryPorts = [58999]
  assert.deepEqual(b.bridge.discoveryPorts, [58999])
  b.spawnBridge = false
  assert.equal(b.bridge.spawnBridge, false)
  b.timeouts = { startMs: 1500, callMs: 3000 }
  assert.equal(b.bridge.timeouts.callMs, 3000)
  b.port = 49620
  assert.equal(b.bridge.port, 49620)
  assert.equal(b.status().connected !== undefined, true)
})

test('EdaMcpBackend: 成功路径解析 {ok,path,data} → result 字符串', async () => {
  const m = new EdaMcpBackend({ cliExe: 'X:/lceda-pro.exe' })
  m.ready = true
  m.port = 1
  m.sessionId = 'sid-1'
  m.sessionOkAt = Date.now() // warm session → no session.list round trip
  let called = null
  m.rpc = async (method, params) => {
    called = { method, params }
    return { result: { content: [{ text: JSON.stringify({ ok: true, path: 'invoke', data: { hit: 1 } }) }] } }
  }
  const r = await m.execute('return { hit: 1 }')
  assert.equal(r.ok, true)
  assert.equal(r.result, '{"hit":1}')
  assert.equal(called.method, 'tools/call')
  assert.equal(called.params.name, 'lceda-pro.call')
  assert.deepEqual(called.params.arguments.path, 'invoke')
  assert.equal(called.params.arguments.input.extUuid, 'eda')
  assert.equal(called.params.arguments.input.code, 'return { hit: 1 }')
})

test('EdaMcpBackend: 错误信封 → ok:false + 会话类错误可重试', async () => {
  const m = new EdaMcpBackend({ cliExe: 'X:/lceda-pro.exe' })
  m.ready = true
  m.port = 1
  m.sessionId = 'sid-1'
  m.rpc = async () => ({ result: { content: [{ text: JSON.stringify({ ok: false, path: 'invoke', error: { code: 'EXECUTION_ERROR', message: 'session not found' } }) }] } })
  let calls = 0
  m.ensureSession = async () => { calls += 1; return { ok: true, sessionId: 'sid-' + calls } }
  const r = await m.execute('return 1')
  assert.equal(r.ok, false)
  assert.match(r.error, /session not found/)
  assert.equal(calls, 2, '会话失效应重开一次并重试')
})

test('EdaMcpBackend: session.list 解析 + 会话复用（90s 内不再查询）', async () => {
  const m = new EdaMcpBackend({ cliExe: 'X:/lceda-pro.exe' })
  m.ready = true
  m.port = 1
  let listCalls = 0
  m.rpc = async () => {
    listCalls += 1
    return { result: { content: [{ text: JSON.stringify({ ok: true, path: 'session.list', data: [{ sessionId: 'alive-1', status: 'alive' }] }) }] } }
  }
  const first = await m.ensureSession({ open: false })
  assert.equal(first.ok, true)
  assert.equal(first.sessionId, 'alive-1')
  const second = await m.ensureSession({ open: false })
  assert.equal(second.cached, true, '90s 内应直接复用，不再查询')
  assert.equal(listCalls, 1)
})

test('CLI_NAMES 覆盖国内/国际两个可执行名', () => {
  assert.deepEqual([...CLI_NAMES].sort(), ['easyeda-pro', 'lceda-pro'])
})

// ── 双后端互备（桌面 MCP/CLI + 网页桥）──────────────────────────────────────

test('isConnectivityError: 只有「没连上」类错误才允许换档重试', () => {
  const yes = [
    '官方桥未连接（请先启动桥）',
    '没有可用的编辑器会话（可用 eda_backend_connect 打开一个）',
    '未找到官方 CLI（lceda-pro / easyeda-pro）',
    'MCP 服务未启动',
    'session not found',
    '官方桥已启动但没有编辑器连接',
  ]
  const no = [
    "Identifier 'x' has already been declared",
    'value.pageSize must be a string',
    '[object Object]',
    'DRC 失败：3 条违规',
  ]
  for (const m of yes) assert.equal(EdaUnifiedBackend.isConnectivityError(m), true, m)
  for (const m of no) assert.equal(EdaUnifiedBackend.isConnectivityError(m), false, m)
})

/** 造一个假档位：按给定序列返回 execute 结果。 */
function fakeTier(name, results) {
  let i = 0
  return {
    name,
    calls: 0,
    available() { return true },
    async execute() {
      this.calls += 1
      const r = results[Math.min(i++, results.length - 1)]
      return { ...r }
    },
    async refresh() { return { backend: name, state: 'idle', connected: false, error: '' } },
    async start() { return { backend: name, state: 'idle', connected: false } },
    status() { return { backend: name, state: 'idle', connected: false } },
    submitTask: async () => ({ ok: false }),
    getTask: async () => ({ ok: false }),
    listTasks: async () => ({ ok: true, tasks: [] }),
    callTool: async () => ({ ok: false }),
    dispose() {},
  }
}

test('execute 失败转移：桌面档「未连接」→ 自动改走网页桥（只重试一次）', async () => {
  const u = new EdaUnifiedBackend({ prefer: 'auto', cliExe: 'X:/lceda-pro.exe' })
  const mcp = fakeTier('official-mcp-http', [{ ok: false, error: '没有可用的编辑器会话（可用 eda_backend_connect 打开一个）' }])
  const cli = fakeTier('official-cli', [{ ok: false, error: '未找到官方 CLI（lceda-pro / easyeda-pro）' }])
  const bridge = fakeTier('official-easyeda-bridge', [{ ok: true, result: 'from-bridge' }])
  u.mcp = mcp; u.cli = cli; u.bridge = bridge
  u.cfg.prefer = 'auto'
  const r = await u.execute('return 1')
  assert.equal(r.ok, true)
  assert.equal(r.tier, 'bridge')
  assert.equal(r.backend, 'official-easyeda-bridge')
  assert.equal(r.result, 'from-bridge')
  assert.equal(bridge.calls, 1)
  assert.equal(mcp.calls, 1)
})

test('execute 不重试业务错误：代码已执行过，绝不能换档重跑', async () => {
  const u = new EdaUnifiedBackend({ prefer: 'auto', cliExe: 'X:/lceda-pro.exe' })
  const mcp = fakeTier('official-mcp-http', [{ ok: false, error: '放置失败：封装不存在' }])
  const cli = fakeTier('official-cli', [{ ok: true, result: 'SHOULD-NOT-RUN' }])
  const bridge = fakeTier('official-easyeda-bridge', [{ ok: true, result: 'SHOULD-NOT-RUN' }])
  u.mcp = mcp; u.cli = cli; u.bridge = bridge
  const r = await u.execute('return 1')
  assert.equal(r.ok, false)
  assert.match(r.error, /封装不存在/)
  assert.equal(mcp.calls, 1)
  assert.equal(cli.calls, 0, '业务错误不得触发换档')
  assert.equal(bridge.calls, 0, '业务错误不得触发换档')
})

test('execute 首选档成功时不碰其他档', async () => {
  const u = new EdaUnifiedBackend({ prefer: 'auto', cliExe: 'X:/lceda-pro.exe' })
  const mcp = fakeTier('official-mcp-http', [{ ok: true, result: 'from-mcp' }])
  const bridge = fakeTier('official-easyeda-bridge', [{ ok: true, result: 'bridge' }])
  u.mcp = mcp; u.bridge = bridge
  const r = await u.execute('return 1')
  assert.equal(r.result, 'from-mcp')
  assert.equal(bridge.calls, 0)
})
