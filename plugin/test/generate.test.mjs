/**
 * dsh-lichuang-eda · offline generation end-to-end (plugin tool → generator →
 * validator). Mounts the plugin on a stub ctx, then exercises the
 * eda_generate_schematic_json tool WITHOUT any EDA bridge (the offline path).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { apply } from '../lib/index.js'

function mountPlugin(config = {}) {
  const routes = []
  const tools = []
  const sections = []
  const provided = {}
  const ctx = {
    webServer: { register: (route) => { routes.push(route); return () => {} } },
    tools: { register: (tool) => { tools.push(tool); return () => {} } },
    systemPrompt: { section: (section) => { sections.push(section); return () => {} } },
    provide: (key, value) => { provided[key] = value; ctx[key] = value },
    effect: (fn) => fn() ?? (() => {}),
  }
  // autoStartBridge off: unit tests must not touch the real (possibly live) bridge.
  // activityFile: tests must never write the user's real timeline.
  apply(ctx, { autoStartBridge: false, activityFile: join(tmpdir(), `eda-act-gen-${process.pid}.jsonl`), ...config })
  // Isolate: unreachable discovery range, no spawn, short timeouts.
  if (provided.eda?.backend) {
    provided.eda.backend.discoveryPorts = [58999]
    provided.eda.backend.spawnBridge = false
    provided.eda.backend.timeouts = { ...provided.eda.backend.timeouts, startMs: 1500, callMs: 3000 }
  }
  return { ctx, routes, tools, sections, provided }
}

const findTool = (tools, name) => tools.find((t) => t.name === name)

test('eda_generate_schematic_json: 中文需求 → 标准版原理图 JSON（结构+连通性校验通过）', async () => {
  const { tools } = mountPlugin()
  const tool = findTool(tools, 'eda_generate_schematic_json')
  assert.ok(tool, 'tool registered')
  const res = await tool.execute({ description: '一个 LED 点亮电路' }, { signal: new AbortController().signal })
  assert.equal(res.ok, true, res.error ?? '')
  assert.equal(res.structureOk, true)
  assert.equal(res.connectivityOk, true)
  assert.deepEqual(res.errors, [])
  const parsed = JSON.parse(res.json) // valid JSON
  assert.equal(parsed.head.docType, '1')
  assert.ok(Array.isArray(parsed.shape) && parsed.shape.length > 0)
  const proj = JSON.parse(res.projectJson)
  assert.equal(proj.docType, 5)
  assert.equal(proj.schematics[0].dataStr.head.docType, '1')
})

test('eda_generate_schematic_json: 不识别的需求 → ok:false 且有明确提示', async () => {
  const { tools } = mountPlugin()
  const tool = findTool(tools, 'eda_generate_schematic_json')
  const res = await tool.execute({ description: '一个量子纠缠发电机' }, { signal: new AbortController().signal })
  assert.equal(res.ok, false)
  assert.ok(res.error.length > 0)
})

test('eda_translate_request: 预览结构化设计草稿', async () => {
  const { tools } = mountPlugin()
  const tool = findTool(tools, 'eda_translate_request')
  const res = await tool.execute({ description: '电阻分压，5V 出 3.3V' }, { signal: new AbortController().signal })
  assert.equal(res.ok, true)
  assert.match(res.summary, /R1/)
  assert.match(res.summary, /R2/)
})

test('eda_template_list: 模板目录含 supported 标记', async () => {
  const { tools } = mountPlugin()
  const tool = findTool(tools, 'eda_template_list')
  const res = await tool.execute({}, { signal: new AbortController().signal })
  assert.ok(res.templates.length >= 6)
  const led = res.templates.find((x) => x.id === 'led-blink')
  assert.ok(led, 'led-blink template present')
  assert.equal(led.supported, true)
  const esp = res.templates.find((x) => x.id === 'esp32-min')
  assert.equal(esp.supported, false, 'unsupported template must be flagged honestly')
})

test('eda_sch_drc (bridge-gated): 未连接时返回明确错误而非崩溃', async () => {
  const { tools } = mountPlugin()
  const tool = findTool(tools, 'eda_sch_drc')
  const res = await tool.execute({}, { signal: new AbortController().signal })
  assert.equal(res.ok, false)
  assert.match(res.error, /未连接/)
})

test('POST /api/dsh-eda/generate 路由：200 + 合法 JSON（离线生成闭环）', async () => {
  const { routes } = mountPlugin()
  const route = routes.find((r) => r.path === '/api/dsh-eda/generate')
  assert.ok(route, 'generate route registered')
  assert.equal(route.kind, 'exact')
  let head = null
  let body = null
  const res = {
    writeHead: (status, headers) => { head = { status, headers } },
    end: (chunk) => { body = chunk },
  }
  const req = {
    socket: { remoteAddress: '127.0.0.1' },
    headers: { host: 'localhost:3080', 'content-type': 'application/json' },
    method: 'POST',
    url: '/api/dsh-eda/generate',
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify({ description: '一个 LED 点亮电路' }), 'utf8')
    },
  }
  await route.handler(req, res)
  assert.equal(head.status, 200)
  assert.match(head.headers['content-type'], /application\/json/)
  const json = JSON.parse(body)
  assert.equal(json.ok, true)
  assert.equal(json.structureOk, true)
  assert.equal(json.connectivityOk, true)
})

test('eda_exec (云端实时双手): 注册 + 未连接时明确门控报错', async () => {
  const { tools } = mountPlugin()
  const tool = findTool(tools, 'eda_exec')
  assert.ok(tool, 'eda_exec registered')
  const res = await tool.execute({ code: 'return await eda.dmt_Project.getCurrentProjectInfo();' }, { signal: new AbortController().signal })
  assert.equal(res.ok, false)
  assert.match(res.error, /未连接/)
  const empty = await tool.execute({}, { signal: new AbortController().signal })
  assert.equal(empty.ok, false)
  assert.match(empty.error, /code 不能为空/)
})

test('eda_pick_spot (框内定位): 注册 + 未连接时明确错误而非崩溃', async () => {
  const { tools } = mountPlugin()
  const tool = findTool(tools, 'eda_pick_spot')
  assert.ok(tool, 'eda_pick_spot registered')
  const res = await tool.execute({ count: 2 }, { signal: new AbortController().signal })
  assert.equal(res.ok, false)
  assert.ok(typeof res.error === 'string' && res.error.length > 0, 'explicit error when bridge is down')
})

test('GET /api/dsh-eda/activity 路由：活动列表（含 eda_exec 门控记录）；POST → 405', async () => {
  const { routes, tools } = mountPlugin()
  const route = routes.find((r) => r.path === '/api/dsh-eda/activity')
  assert.ok(route, 'activity route registered')
  // eda_exec gate records an activity entry ("门控拦截").
  const exec = findTool(tools, 'eda_exec')
  await exec.execute({ code: 'return await eda.dmt_Project.getCurrentProjectInfo();' }, { signal: new AbortController().signal })
  let head = null; let body = null
  const res = { writeHead: (s, h) => { head = { s, h } }, end: (c) => { body = c } }
  const req = { socket: { remoteAddress: '127.0.0.1' }, headers: { host: 'localhost:3080' }, method: 'GET', url: '/api/dsh-eda/activity' }
  await route.handler(req, res)
  assert.equal(head.s, 200)
  const json = JSON.parse(body)
  assert.ok(Array.isArray(json.activities))
  assert.ok(json.activities.length >= 1, 'gated eda_exec must leave a trace')
  const a = json.activities[0]
  assert.ok(a.ts && a.tool && a.action, 'entry shape: ts/tool/action')
  assert.equal(a.ok, false)
  assert.equal(typeof a.id, 'number', 'entries carry a stable id (for pending→done patching)')
  assert.ok('sid' in a && 'status' in a, 'entry shape: sid/status')
  assert.ok(Array.isArray(json.sessions), 'feed includes session summary')
  assert.ok(typeof json.currentSid === 'string', 'feed includes currentSid')
  // POST → 405
  head = null; body = null
  await route.handler({ ...req, method: 'POST', async *[Symbol.asyncIterator]() { yield Buffer.from('{}', 'utf8') } }, res)
  assert.equal(head.s, 405)
})

async function callRoute(route, url, method = 'GET') {
  let head = null; let body = null
  const res = { writeHead: (s, h) => { head = { s, h } }, end: (c) => { body = c } }
  const req = {
    socket: { remoteAddress: '127.0.0.1' },
    headers: { host: 'localhost:3080' },
    method,
    url,
    async *[Symbol.asyncIterator]() { if (method === 'POST') yield Buffer.from('{}', 'utf8') },
  }
  await route.handler(req, res)
  return { status: head?.s, json: body ? JSON.parse(body) : null }
}

test('activity 会话隔离：sid 过滤 + currentSid 跟随最新 + 会话摘要', async () => {
  const { routes, tools } = mountPlugin()
  const route = routes.find((r) => r.path === '/api/dsh-eda/activity')
  assert.ok(route, 'activity route registered')
  const exec = findTool(tools, 'eda_exec')
  const base = { signal: new AbortController().signal }
  // Two different conversations (agents) leave entries with distinct sids.
  await exec.execute({ code: 'return await eda.dmt_Project.getCurrentProjectInfo();' }, { ...base, agent: { id: 'sess-aaa' } })
  await exec.execute({ code: 'return await eda.dmt_Project.getCurrentProjectInfo();' }, { ...base, agent: { id: 'sess-bbb' } })
  // Follow-newest → the second session.
  const follow = await callRoute(route, '/api/dsh-eda/activity')
  assert.equal(follow.status, 200)
  assert.equal(follow.json.currentSid, 'sess-bbb')
  const sids = follow.json.sessions.map((s) => s.sid)
  assert.ok(sids.includes('sess-aaa') && sids.includes('sess-bbb'), 'both sessions summarized')
  assert.equal(follow.json.sessions[0].sid, 'sess-bbb', 'newest session first')
  assert.ok(follow.json.activities.every((a) => a.sid === 'sess-bbb'), 'feed shows only the current session')
  // Pin to the older session via ?sid=
  const pinned = await callRoute(route, '/api/dsh-eda/activity?sid=sess-aaa')
  assert.equal(pinned.status, 200)
  assert.ok(pinned.json.activities.length >= 1, 'pinned feed has entries')
  assert.ok(pinned.json.activities.every((a) => a.sid === 'sess-aaa'), 'pinned feed filtered')
})

test('activity pending→done：长任务先记「执行中」再落定（含会话 sid）', async () => {
  const { tools, provided } = mountPlugin()
  const exec = findTool(tools, 'eda_exec')
  assert.ok(exec, 'eda_exec registered')
  const backend = provided.eda.backend
  // Fake a CONNECTED bridge whose execute call we control (release the gate).
  let release
  const gate = new Promise((r) => { release = r })
  backend.port = 49999
  backend.state = 'connected'
  backend.refresh = async () => backend.status()
  backend.execute = async () => { await gate; return { ok: true, result: 'eval: ok!' } }
  const p = exec.execute({ code: 'return await eda.fakeThing();' }, { signal: new AbortController().signal, agent: { id: 'sess-pend' } })
  await Promise.resolve() // flush microtasks → pending entry recorded
  const mid = provided.eda.activity({ sid: 'sess-pend' })
  assert.equal(mid.activities.length, 1, 'one entry')
  assert.equal(mid.activities[0].status, 'pending', '进行中 while the call is in flight')
  assert.equal(mid.activities[0].sid, 'sess-pend', 'session recorded')
  release()
  const r = await p
  assert.equal(r.ok, true)
  const after = provided.eda.activity({ sid: 'sess-pend' })
  assert.equal(after.activities[0].status, 'done', '落定 done')
  assert.equal(after.activities[0].result, 'eval: ok!')
})

test('POST /api/dsh-eda/install 路由（注入 stub，不联网）：200 + 结果；GET → 405', async () => {
  const { routes, provided } = mountPlugin()
  // stub the network installer so the route test never downloads anything
  provided.eda.bridgeInstall = async () => ({ ok: true, dir: 'C:/fake/bridge', script: 'C:/fake/bridge/scripts/bridge-server.mjs', version: 'main', extUrl: 'https://jlc-ext.com/item/oshwhub/run-api-gateway' })
  const route = routes.find((r) => r.path === '/api/dsh-eda/install')
  assert.ok(route, 'install route registered')
  let head = null; let body = null
  const res = { writeHead: (s, h) => { head = { s, h } }, end: (c) => { body = c } }
  const gReq = (method) => ({
    socket: { remoteAddress: '127.0.0.1' },
    headers: { host: 'localhost:3080' },
    method,
    url: '/api/dsh-eda/install',
    async *[Symbol.asyncIterator]() { if (method === 'POST') yield Buffer.from('{}', 'utf8') },
  })
  await route.handler(gReq('GET'), res)
  assert.equal(head.s, 405)
  head = null; body = null
  await route.handler(gReq('POST'), res)
  assert.equal(head.s, 200)
  const json = JSON.parse(body)
  assert.equal(json.ok, true)
  assert.match(json.script, /bridge-server\.mjs/)
})

test('eda_capabilities (能力清单): 注册 + 返回结构化清单', async () => {
  const { tools } = mountPlugin()
  const tool = findTool(tools, 'eda_capabilities')
  assert.ok(tool, 'eda_capabilities registered')
  const res = await tool.execute({}, { signal: new AbortController().signal })
  assert.ok(res.count >= 8, 'multiple capability domains')
  assert.ok(Array.isArray(res.capabilities))
  const sch = res.capabilities.find((c) => c.domain.includes('sch_PrimitiveComponent'))
  assert.ok(sch && sch.methods.some((m) => m.name.includes('createNetFlag')), 'core methods listed')
  const render = tool.output.render({}, res)
  assert.equal(render[0].type, 'text')
  assert.match(render[0].text, /eda\.|create\(/)
})

test('POST /api/dsh-eda/activity/clear 与 revoke 路由（stub handle）：200 + 面板记录；GET→405', async () => {
  const { routes, provided } = mountPlugin()
  const clearRoute = routes.find((r) => r.path === '/api/dsh-eda/activity/clear')
  const revokeRoute = routes.find((r) => r.path === '/api/dsh-eda/activity/revoke')
  assert.ok(clearRoute, 'clear route registered')
  assert.ok(revokeRoute, 'revoke route registered')
  provided.eda.clearActivity = async () => ({ ok: true })
  provided.eda.revokeActivity = async (id) => ({ ok: true, removed: 2, note: '已删除 2 个新建图元' })
  const gReq = (method, url) => ({
    socket: { remoteAddress: '127.0.0.1' },
    headers: { host: 'localhost:3080' },
    method,
    url,
    async *[Symbol.asyncIterator]() { if (method === 'POST') yield Buffer.from('{}', 'utf8') },
  })
  let head = null; let body = null
  const res = { writeHead: (s, h) => { head = { s, h } }, end: (c) => { body = c } }
  await clearRoute.handler(gReq('GET', '/api/dsh-eda/activity/clear'), res)
  assert.equal(head.s, 405)
  head = null; body = null
  await clearRoute.handler(gReq('POST', '/api/dsh-eda/activity/clear'), res)
  assert.equal(head.s, 200)
  assert.equal(JSON.parse(body).ok, true)
  head = null; body = null
  await revokeRoute.handler(gReq('POST', '/api/dsh-eda/activity/revoke?id=7'), res)
  assert.equal(head.s, 200)
  const j = JSON.parse(body)
  assert.equal(j.ok, true)
  assert.equal(j.removed, 2)
})

test('POST /api/dsh-eda/snapshot 路由（stub）：200 + 保存结果 + 面板活动记录；GET → 405', async () => {
  const { routes, provided } = mountPlugin()
  provided.eda.snapshot = async () => ({
    ok: true, dir: 'C:/fake/snapshots/snapshot-2026-08-29T12-34-56', connected: true,
    files: [{ name: 'esp32.epro2', size: 1 }, { name: 'preview.svg', size: 1 }], errors: [],
    docFile: 'esp32.epro2', preview: 'preview.svg',
  })
  const route = routes.find((r) => r.path === '/api/dsh-eda/snapshot')
  assert.ok(route, 'snapshot route registered')
  assert.equal(route.kind, 'exact')
  let head = null; let body = null
  const res = { writeHead: (s, h) => { head = { s, h } }, end: (c) => { body = c } }
  const gReq = (method) => ({
    socket: { remoteAddress: '127.0.0.1' },
    headers: { host: 'localhost:3080' },
    method,
    url: '/api/dsh-eda/snapshot',
    async *[Symbol.asyncIterator]() { if (method === 'POST') yield Buffer.from('{}', 'utf8') },
  })
  await route.handler(gReq('GET'), res)
  assert.equal(head.s, 405)
  head = null; body = null
  await route.handler(gReq('POST'), res)
  assert.equal(head.s, 200)
  const json = JSON.parse(body)
  assert.equal(json.ok, true)
  assert.match(json.dir, /snapshots/)
  assert.equal(json.files.length, 2)
  // panel activity entry recorded
  const feed = provided.eda.activity()
  assert.ok(feed.activities.length >= 1)
  const act = feed.activities[0]
  assert.equal(act.tool, 'panel')
  assert.match(act.action, /紧急保存/)
})

test('POST /api/dsh-eda/bridge 路由：合法 JSON + 无 ReferenceError（安装态随环境：未装→优雅降级，已装→连接成功）', async () => {
  const { routes } = mountPlugin()
  const route = routes.find((r) => r.path === '/api/dsh-eda/bridge')
  assert.ok(route, 'bridge route registered')
  let head = null; let body = null
  const res = { writeHead: (s, h) => { head = { s, h } }, end: (c) => { body = c } }
  const req = {
    socket: { remoteAddress: '127.0.0.1' },
    headers: { host: 'localhost:3080' },
    method: 'POST',
    url: '/api/dsh-eda/bridge',
    async *[Symbol.asyncIterator]() { yield Buffer.from('{}', 'utf8') },
  }
  await route.handler(req, res)
  assert.equal(head.s, 200)
  const json = JSON.parse(body)
  assert.equal(typeof json.ok, 'boolean')
  assert.ok(!/backend is not defined/.test(json.error ?? ''), 'no ReferenceError leaks')
  if (json.ok === false) {
    assert.match(json.error ?? '', /未安装|未连接|官方桥/)
  }
})
