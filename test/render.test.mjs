/**
 * render 形态护栏：DSH 契约要求 render 返回 ContentBlock[]（数组）。
 * 返回对象（{type:'text'}）会崩主进程 —— 2026-08 用户精确分类发现。
 * 每个工具：构造最小 value 样本 → render(args, value) → 断言 Array.isArray。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { apply } from '../lib/index.js'

function mountPlugin(config = {}) {
  const tools = []
  const ctx = {
    webServer: { register: () => () => {} },
    tools: { register: (t) => { tools.push(t); return () => {} } },
    systemPrompt: { section: () => () => {} },
    provide: () => {},
    effect: (fn) => fn() ?? (() => {}), // 立即执行（真实 cordis 语义）——否则工具不注册、测试空转
  }
  apply(ctx, { autoStartBridge: false, activityFile: join(tmpdir(), `eda-act-render-${process.pid}.jsonl`), ...config })
  return { tools }
}

const SAMPLES = {
  eda_status: { ready: true, backend: 'x', bridgeInstalled: true, port: 49620, note: '', version: '1' },
  eda_template_list: { templates: [{ id: 'led-blink', name: 'LED 点亮', desc: 'x', supported: true }] },
  eda_translate_request: { ok: true, title: 't', summary: 's', note: '' },
  eda_generate_schematic_json: { ok: true, title: 't', components: ['R1'], nets: ['GND'], structureOk: true, connectivityOk: true, errors: [], files: ['a.json'], note: '', netSummary: 'n', json: '{}', projectJson: '{}' },
  eda_bridge_install: { ok: true, message: 'm', script: 's', extUrl: 'u', error: '' },
  eda_backend_connect: { ok: true, state: 'connected', error: '', note: '' },
  eda_exec: { ok: true, result: 'r', error: '' },
  eda_pick_spot: { ok: true, page: 'P1', size: 's', usedCount: 0, spots: [{ x: 1, y: 2, inside: true }], note: '', error: '' },
  eda_capabilities: { count: 1, capabilities: [{ domain: 'd', note: '', methods: [{ name: 'm', desc: 'x' }] }] },
  eda_board_overview: { ok: true, domain: 'sch', doc: 'd', pageSize: 's', componentCount: 1, wireCount: 0, viaCount: 0, lineCount: 0, nets: ['GND'], componentsPreview: [{ designator: 'R1', name: '', type: '', x: 1, y: 2, net: '' }], truncated: false, degraded: [], error: '' },
  eda_trace: { ok: true, path: 'p.png', file: 'f', size: 10, error: '' },
  eda_verify: { ok: true, drc: 'd', netlist: 'n', bom: 'b', errors: [], note: '' },
  eda_snapshot: { ok: true, dir: 'd', files: [{ name: 'a', size: 1 }], errors: [], connected: true, docFile: 'x.epro2', preview: 'p.svg' },
  eda_sch_drc: { ok: true, result: '[{"type":"error","count":1}]', error: '' },
  eda_get_netlist: { ok: true, result: '{}', error: '' },
  eda_get_bom: { ok: true, result: '{}', error: '' },
  eda_skill_read: { ok: true, doc: 'SKILL.md', path: 'p', len: 100, start: 0, content: 'x', truncated: false, nextOffset: 80, suggestions: [], error: '' },
  eda_place: { ok: true, ref: 'R1', id: 'i', pins: [{ x: 1, y: 2 }], x: 1, y: 2, name: 'n', note: '', error: '' },
  eda_wire: { ok: true, primitives: ['a'], note: '', error: '' },
  eda_netflag: { ok: true, id: 'i', net: 'GND', x: 1, y: 2, error: '' },
  eda_save: { ok: true, saved: true, docType: 1, error: '' },
}

test('所有工具的 render 必须返回数组（ContentBlock[]）——对象形态会崩主进程', () => {
  const { tools } = mountPlugin()
  assert.ok(tools.length >= 20, `工具未全部注册（仅 ${tools.length} 个）——测试空转防护`)
  for (const tool of tools) {
    const sample = SAMPLES[tool.name]
    assert.ok(sample !== undefined, `测试缺少 ${tool.name} 的 value 样本`)
    const out = tool.output.render({}, sample)
    assert.ok(Array.isArray(out), `${tool.name} 的 render 返回了非数组（${typeof out}）——请改为 [{type:'text',text}]`)
  }
})
