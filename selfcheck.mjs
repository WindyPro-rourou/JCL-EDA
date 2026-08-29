/**
 * @windypro-rourou/dsh-eda self-check: imports the host half, mounts it on a
 * stub cordis context, and verifies every DSH surface the plugin must touch:
 *   (a) ctx.tools.register — at least the eda_status tool,
 *   (b) ctx.webServer.register — the /api/dsh-eda/status route,
 *   (c) ctx.systemPrompt.section — the plugin announcement,
 *   (d) ctx.provide — the 'eda' service handle.
 *
 * Run: node selfcheck.mjs   (exit code 0 = PASS, non-zero = FAIL)
 *
 * The stub context carries a `provide` method so the real cordis provide path
 * (not the plain-object fallback) is exercised. Requires
 * @deepseek-ai/dsh-tools to resolve — see README "测试/自检".
 */
import { apply, name, inject } from './lib/index.js'

const routes = []
const tools = []
const sections = []
const provided = {}

const ctx = {
  webServer: {
    register: (route) => { routes.push(route); return () => { const i = routes.indexOf(route); if (i >= 0) routes.splice(i, 1) } },
  },
  tools: {
    register: (tool) => { tools.push(tool); return () => { const i = tools.indexOf(tool); if (i >= 0) tools.splice(i, 1) } },
  },
  systemPrompt: {
    section: (section) => { sections.push(section); return () => { const i = sections.indexOf(section); if (i >= 0) sections.splice(i, 1) } },
  },
  provide: (key, value) => { provided[key] = value; ctx[key] = value },
  effect: (fn) => { const dispose = fn(); return dispose ?? (() => {}) },
}

let failures = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== '' ? '  — ' + detail : ''}`)
  if (!ok) failures++
}

console.log(`plugin name: ${name}, inject: ${JSON.stringify(inject)}`)
apply(ctx, { autoStartBridge: false })

// (a) tools
check('ctx.tools.register called', tools.length > 0, `registered: ${tools.map((t) => t.name).join(', ')}`)
check('eda_status tool registered', tools.some((t) => t.name === 'eda_status'))

// (b) routes
check('ctx.webServer.register called', routes.length > 0, `routes: ${routes.map((r) => r.path).join(', ')}`)
check('/api/dsh-eda/status route registered',
  routes.some((r) => r.kind === 'exact' && r.path === '/api/dsh-eda/status'))

// (c) system prompt
check('ctx.systemPrompt.section called', sections.length > 0, `sections: ${sections.map((s) => s.name).join(', ')}`)
check('plugin:dsh-eda section registered (order 153)',
  sections.some((s) => s.name === 'plugin:dsh-eda' && s.order === 153))

// (d) provide
check('ctx.provide called with eda', provided.eda !== undefined)
const status = provided.eda?.status?.()
check('provided handle.status() shape',
  status !== undefined && status.ready === false && typeof status.backend === 'string' && typeof status.version === 'string',
  JSON.stringify(status))

console.log(failures === 0 ? 'SELFCHECK OK' : `SELFCHECK FAILED (${failures} failure(s))`)
process.exitCode = failures === 0 ? 0 : 1
