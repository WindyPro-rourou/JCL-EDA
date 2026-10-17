// dsh-lichuang-eda · mock OFFICIAL EasyEDA Bridge Server — test fixture.
// Mirrors easyeda-api-skill's bridge-server.mjs HTTP surface (1.1.56 + async-task
// patch #16):
//   GET  /health          → {"service":"easyeda-bridge", ...}
//   POST /execute         → code containing "TIMEOUT_TASK" → HTTP 504 + {taskId}
//                           otherwise → {"success":true, result:"eval:<code>"}
//   POST /tasks           → HTTP 202 {success:true, taskId, statusUrl, windowId}
//   GET  /tasks           → {tasks:[…]}
//   GET  /tasks/<id>      → {id, status, phase, elapsedMs, result:{outcome}, events}
// Prints "PORT <n>" on stdout once listening. Used by backend.test.mjs; never shipped.
import { createServer } from 'node:http'

const TASKS = new Map()

function makeTask(id) {
  const t = { id, status: 'completed', phase: 'routing', elapsedMs: 1234, result: { outcome: 'complete' }, events: ['preflight', 'routing', 'done'], windowId: 'mock-window' }
  TASKS.set(id, t)
  return t
}

const server = createServer((req, res) => {
  const json = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)) }

  if (req.method === 'GET' && req.url === '/health') {
    json(200, { service: 'easyeda-bridge', version: '1.1.56', ok: true, edaConnected: true, edaWindowCount: 1, activeWindowId: 'mock-window' })
    return
  }

  if (req.method === 'GET' && (req.url === '/tasks' || req.url.startsWith('/tasks/'))) {
    if (req.url === '/tasks') { json(200, { tasks: [...TASKS.values()] }); return }
    const id = req.url.slice('/tasks/'.length)
    const t = TASKS.get(id)
    json(t ? 200 : 404, t ?? { error: 'Task not found' })
    return
  }

  if (req.method === 'POST' && req.url === '/tasks') {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      let code = ''
      try { code = JSON.parse(body).code ?? '' } catch { /* ignore */ }
      const id = 'task-' + TASKS.size
      makeTask(id)
      json(202, { success: true, taskId: id, statusUrl: '/tasks/' + id, windowId: 'mock-window' })
      void code
    })
    return
  }

  if (req.method === 'POST' && req.url === '/execute') {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      let code = ''
      try { code = JSON.parse(body).code ?? '' } catch { /* ignore */ }
      if (code.includes('TIMEOUT_TASK')) {
        // async-task patch semantics: execution NOT cancelled, late result retained
        json(504, { success: false, error: 'Wait timed out after 30000ms. Execution was not cancelled; query /tasks/task-timeout.', taskId: 'task-timeout' })
        return
      }
      json(200, { success: true, result: 'eval:' + code })
    })
    return
  }

  res.writeHead(404)
  res.end()
})

server.listen(0, '127.0.0.1', () => {
  process.stdout.write('PORT ' + server.address().port + '\n')
})
process.on('SIGTERM', () => process.exit(0))
