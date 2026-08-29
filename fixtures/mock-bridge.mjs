// dsh-lichuang-eda · mock EasyEDA bridge (stdio MCP) — test fixture.
// Speaks newline-delimited JSON-RPC over stdin/stdout; answers initialize,
// tools/list and tools/call. Used by plugin/test/backend.test.mjs; never shipped.
import { createInterface } from 'node:readline'

const send = (obj) => process.stdout.write(JSON.stringify(obj) + '\n')
const rl = createInterface({ input: process.stdin })

rl.on('line', (line) => {
  let msg
  try { msg = JSON.parse(line) } catch { return }
  if (msg.id === undefined) return // notification — ignore
  if (msg.method === 'initialize') {
    send({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: msg.params?.protocolVersion ?? '2024-11-05', capabilities: {}, serverInfo: { name: 'mock-easyeda', version: '1.0.0' } } })
  } else if (msg.method === 'tools/list') {
    send({ jsonrpc: '2.0', id: msg.id, result: { tools: [{ name: 'sch.drc' }, { name: 'sch.netlist' }, { name: 'sch.bom' }] } })
  } else if (msg.method === 'tools/call') {
    send({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: JSON.stringify({ mock: true, tool: msg.params?.name }) }] } })
  } else {
    send({ jsonrpc: '2.0', id: msg.id, result: null })
  }
})
rl.on('close', () => process.exit(0))
