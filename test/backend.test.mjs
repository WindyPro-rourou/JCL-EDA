/**
 * dsh-lichuang-eda · EdaBackend (OFFICIAL bridge mode) tests against a mock
 * official bridge server (health + execute HTTP surface).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { EdaBackend, findBridgePort, BRIDGE_PORTS } from '../lib/backend.js'

const FIXTURE = fileURLToPath(new URL('../fixtures/mock-bridge-http.mjs', import.meta.url))

/** Start the mock bridge; resolves { child, port } once it prints its port. */
async function startMock() {
  const child = spawn(process.execPath, [FIXTURE], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  let out = ''
  child.stdout.on('data', (d) => { out += String(d) })
  const deadline = Date.now() + 8000
  while (Date.now() < deadline) {
    const m = /^PORT (\d+)/m.exec(out)
    if (m !== null) return { child, port: Number(m[1]) }
    await new Promise((r) => setTimeout(r, 100))
  }
  child.kill()
  throw new Error('mock bridge did not report port')
}

function makeBackend(port) {
  return new EdaBackend({ spawnBridge: false, discoveryPorts: [port], timeouts: { startMs: 6000, callMs: 8000 } })
}

test('official bridge: discover health on the port range → connected, port captured', async (t) => {
  const mock = await startMock()
  const b = makeBackend(mock.port)
  t.after(() => { b.dispose(); mock.child.kill() })
  const st = await b.start()
  assert.equal(st.connected, true)
  assert.equal(st.port, mock.port)
  assert.match(st.health, /easyeda-bridge/)
})

test('official bridge: execute known action id (sch.drc) → official code runs', async (t) => {
  const mock = await startMock()
  const b = makeBackend(mock.port)
  t.after(() => { b.dispose(); mock.child.kill() })
  await b.start()
  const res = await b.callTool('sch.drc', {})
  assert.equal(res.ok, true)
  assert.match(res.result, /eda\.sch_Drc\.check/)
  const raw = await b.callTool('sch.drc', { code: 'return await eda.dmt_Project.getCurrentProjectInfo();' })
  assert.equal(raw.result, 'eval:return await eda.dmt_Project.getCurrentProjectInfo();', 'raw code override works')
})

test('official bridge: unknown action id without code → clear error', async (t) => {
  const mock = await startMock()
  const b = makeBackend(mock.port)
  t.after(() => { b.dispose(); mock.child.kill() })
  await b.start()
  const res = await b.callTool('nope.nope', {})
  assert.equal(res.ok, false)
  assert.match(res.error, /未知动作/)
})

test('official bridge: timed-out /execute returns taskId (late result retained, not cancelled)', async (t) => {
  const mock = await startMock()
  const b = makeBackend(mock.port)
  t.after(() => { b.dispose(); mock.child.kill() })
  await b.start()
  const res = await b.execute('return await TIMEOUT_TASK()', 4000)
  assert.equal(res.ok, false)
  assert.equal(res.taskId, 'task-timeout', 'HTTP 504 body taskId must be surfaced')
  assert.match(res.error, /未取消|taskId/)
})

test('official bridge: submitTask → 202 taskId; getTask/listTasks read the task surface', async (t) => {
  const mock = await startMock()
  const b = makeBackend(mock.port)
  t.after(() => { b.dispose(); mock.child.kill() })
  await b.start()
  const sub = await b.submitTask('return await eda.pcb_Document.autoRouting();')
  assert.equal(sub.ok, true)
  assert.match(sub.taskId, /^task-/)
  const got = await b.getTask(sub.taskId)
  assert.equal(got.ok, true)
  assert.equal(got.task.status, 'completed')
  assert.equal(got.task.result.outcome, 'complete')
  const list = await b.listTasks()
  assert.equal(list.ok, true)
  assert.ok(Array.isArray(list.tasks) && list.tasks.length >= 1)
})

test('callTool when not connected returns a friendly not-connected error', async () => {
  const b = new EdaBackend({ spawnBridge: false, discoveryPorts: [58999] })
  const res = await b.callTool('sch.drc', {})
  assert.equal(res.ok, false)
  assert.match(res.error, /未连接/)
})

test('findBridgePort returns null when nothing listens on the injected range', async () => {
  const port = await findBridgePort(1200, [58999])
  assert.equal(port, null)
})

test('refresh() re-probes live health (no stale snapshot)', async (t) => {
  const mock = await startMock()
  const b = makeBackend(mock.port)
  t.after(() => { b.dispose(); mock.child.kill() })
  await b.start()
  const st1 = await b.refresh()
  assert.equal(st1.connected, true)
  assert.match(st1.health, /easyeda-bridge/)
  assert.match(st1.health, /edaConnected/)
})

test('BRIDGE_PORTS covers 49620-49629 (official range)', () => {
  assert.deepEqual(BRIDGE_PORTS, [49620, 49621, 49622, 49623, 49624, 49625, 49626, 49627, 49628, 49629])
})
