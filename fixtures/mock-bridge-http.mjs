// dsh-lichuang-eda · mock OFFICIAL EasyEDA Bridge Server — test fixture.
// Mirrors easyeda-api-skill's bridge-server.mjs HTTP surface:
//   GET  /health   → {"service":"easyeda-bridge", ...}
//   POST /execute  → {"code": "return await eda.xxx();"} → {"ok":true, result:"eval:…"}
// Prints "PORT <n>" on stdout once listening. Used by backend.test.mjs; never shipped.
import { createServer } from 'node:http'

const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ service: 'easyeda-bridge', version: '1.1.28', ok: true, edaConnected: true, edaWindowCount: 1, activeWindowId: 'mock-window' }))
    return
  }
  if (req.method === 'POST' && req.url === '/execute') {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      let code = ''
      try { code = JSON.parse(body).code ?? '' } catch { /* ignore */ }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, result: 'eval:' + code }))
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
