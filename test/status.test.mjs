/**
 * dsh-lichuang-eda unit tests (node:test).
 *
 * Covers the eda_status tool (defineTool contract: execute result shape, strict
 * output schema, render) and the GET /api/dsh-eda/status route handler (valid
 * JSON response, method guard). The plugin is mounted on a stub cordis ctx —
 * the same fields apply() needs: tools / webServer / systemPrompt / provide /
 * effect (see README "测试/自检").
 *
 * Run: node --test plugin/test/   (or: node --test plugin/test/status.test.mjs)
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import { apply } from '../lib/index.js'

/** Build a stub cordis ctx plus the capture arrays, and mount the plugin. */
function mountPlugin(config = {}) {
  const routes = []
  const tools = []
  const sections = []
  const provided = {}
  const ctx = {
    webServer: {
      register: (route) => { routes.push(route); return () => {} },
    },
    tools: {
      register: (tool) => { tools.push(tool); return () => {} },
    },
    systemPrompt: {
      section: (section) => { sections.push(section); return () => {} },
    },
    provide: (key, value) => { provided[key] = value; ctx[key] = value },
    effect: (fn) => fn() ?? (() => {}),
  }
  // autoStartBridge off: unit tests must not touch the real (possibly live) bridge.
  apply(ctx, {
    autoStartBridge: false,
    activityFile: join(tmpdir(), `eda-act-status-${process.pid}.jsonl`),
    ...config,
  })
  if (provided.eda?.backend) {
    provided.eda.backend.discoveryPorts = [58999]
    provided.eda.backend.spawnBridge = false
    provided.eda.backend.timeouts = { ...provided.eda.backend.timeouts, startMs: 1500, callMs: 3000 }
  }
  return { ctx, routes, tools, sections, provided }
}

const findTool = (tools, name) => tools.find((t) => t.name === name)
const findRoute = (routes, path) => routes.find((r) => r.path === path)

test('eda_status tool is registered on the stub ctx', () => {
  const { tools } = mountPlugin()
  const tool = findTool(tools, 'eda_status')
  assert.ok(tool, 'expected eda_status in tools.register captures')
  assert.match(tool.description, /Triggers:/)
})

test('eda_status execute() returns the not-wired placeholder', async () => {
  const { tools } = mountPlugin()
  const tool = findTool(tools, 'eda_status')
  const result = await tool.execute({}, { signal: new AbortController().signal })
  assert.equal(result.ready, false)
  assert.equal(result.backend, 'official-easyeda-bridge')
  assert.equal(typeof result.version, 'string')
  assert.match(result.note, /未连接|未接入|未启动/)
})

test('eda_status execute() result passes the strict output schema', async () => {
  const { tools } = mountPlugin()
  const tool = findTool(tools, 'eda_status')
  const result = await tool.execute({}, { signal: new AbortController().signal })
  const violations = validateJsonSchemaValue(tool.output.schema, result, 'value')
  assert.deepEqual(violations, [], `output schema violations: ${violations.join('; ')}`)
})

test('eda_status output schema is strict and render emits a text block', () => {
  const { tools } = mountPlugin()
  const tool = findTool(tools, 'eda_status')
  assert.equal(tool.output.schema.type, 'object')
  assert.equal(tool.output.schema.additionalProperties, false)
  assert.ok(tool.output.schema.required.includes('ready'))
  assert.ok(tool.output.schema.required.includes('backend'))
  const blocks = tool.output.render({}, { ready: false, backend: 'not-wired', version: '0.1.0', note: 'EDA后端尚未接入' })
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].type, 'text')
  assert.match(blocks[0].text, /not-wired/)
})

test('status route is registered as kind:exact at /api/dsh-eda/status', () => {
  const { routes } = mountPlugin()
  const route = findRoute(routes, '/api/dsh-eda/status')
  assert.ok(route, 'expected route /api/dsh-eda/status')
  assert.equal(route.kind, 'exact')
  assert.equal(typeof route.handler, 'function')
})

test('status route handler answers 200 with valid JSON for a loopback GET', async () => {
  const { routes } = mountPlugin()
  const route = findRoute(routes, '/api/dsh-eda/status')
  let head = null
  let body = null
  const res = {
    writeHead: (status, headers) => { head = { status, headers } },
    end: (chunk) => { body = chunk },
  }
  const req = {
    socket: { remoteAddress: '127.0.0.1' },
    headers: { host: 'localhost:3080' },
    method: 'GET',
    url: '/api/dsh-eda/status',
  }
  await route.handler(req, res)
  assert.equal(head.status, 200)
  assert.match(head.headers['content-type'], /application\/json/)
  const json = JSON.parse(body) // throws if not valid JSON
  assert.equal(json.ready, false)
  assert.equal(json.backend, 'official-easyeda-bridge')
  assert.equal(json.version, '0.1.0')
})

test('status route handler rejects a non-GET request with 405', async () => {
  const { routes } = mountPlugin()
  const route = findRoute(routes, '/api/dsh-eda/status')
  let head = null
  let body = null
  const res = {
    writeHead: (status, headers) => { head = { status, headers } },
    end: (chunk) => { body = chunk },
  }
  const req = {
    socket: { remoteAddress: '127.0.0.1' },
    headers: { host: 'localhost:3080' },
    method: 'POST',
    url: '/api/dsh-eda/status',
  }
  await route.handler(req, res)
  assert.equal(head.status, 405)
  assert.deepEqual(JSON.parse(body), { error: 'method not allowed' })
})

test('provide exposes the eda handle; section is registered', () => {
  const { provided, sections } = mountPlugin()
  assert.ok(provided.eda, 'expected ctx.provide("eda", ...) to be captured')
  assert.equal(provided.eda.status().backend, 'official-easyeda-bridge')
  assert.ok(sections.some((s) => s.name === 'plugin:dsh-eda' && s.order === 153))
})
