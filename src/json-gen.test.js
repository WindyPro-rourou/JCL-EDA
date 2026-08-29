// ============================================================================
// dsh-lichuang-eda · 自动化测试（Node 内置 node:test，零依赖）
// 运行：node --test src/json-gen.test.js
//   ⚠ Windows 沙箱（DSH）下 node:test 默认的子进程隔离会被沙箱拦截（spawn EPERM），
//     请用：node --test --experimental-test-isolation=none src/json-gen.test.js
//     普通环境（无沙箱）直接用 node --test 即可。
//
// 覆盖两层：
//   层一（json-gen.js，生成器自带的校验）：
//     validateSchematic(obj)   —— 结构 lint（顶层/head/canvas/shape/BBox/colors）
//     deriveNetlist(sheet)     —— 从生成物反推网表 + 一致性自检
//   层二（validate.js，design 级校验，供 nl-to-design 与插件调用）：
//     checkConnectivity / deriveNetlist / pinPoints
//
// 用例：
//   合法电路（电阻+LED）→ JSON.parse + 必需字段 + 结构 lint + 网表自检 全通过
//   坏电路（悬空导线 / 引脚未闭合 / 孤立导线）→ 网表自检必须报错
//   残缺对象 → 结构 lint 必须报错
// ============================================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'

// ---- 层一：生成器（json-gen.js）----
import {
  generateSchematic,
  wrapAsProject,
  validateSchematic,
  deriveNetlist as deriveNetlistFromSheet,
  DEFAULT_DESIGN,
} from './json-gen.js'

// ---- 层二：design 级校验（validate.js）----
import {
  validateSchematic as lintDesign,
  checkConnectivity,
  deriveNetlist as deriveNetlistFromDesign,
  pinPoints,
} from './validate.js'

const pinsOf = (pins) => pins.map((p) => `${p.designator}.${p.number}`).sort()
const sheetPinsOf = (pins) => pins.map((p) => `${p.designator}.${p.number}`).sort()

// ============================================================================
// 合法电路：生成 → JSON.parse → 必需字段 → 结构 lint → 网表自检 全通过
// ============================================================================

test('生成 → JSON.parse 往返，顶层键/head 键符合文档确认的结构', () => {
  const sheet = generateSchematic(DEFAULT_DESIGN)
  const round = JSON.parse(JSON.stringify(sheet))
  // 平面单片顶层键与真实 v6 导出一致（docs/json-format.md §2.1）
  assert.deepEqual(Object.keys(round).sort(), ['BBox', 'canvas', 'colors', 'head', 'shape'])
  // head 键与真实 v6 样本一致（§3）
  assert.deepEqual(Object.keys(round.head).sort(), [
    'c_para', 'c_spiceCmd', 'docType', 'editorVersion', 'hasIdFlag', 'importFlag',
    'newgId', 'portOfADImportHack', 'transformList', 'uuid', 'x', 'y',
  ])
  // canvas 15 段（§4）
  assert.equal(round.canvas.split('~').length, 15)
  // shape 前缀分布：2 元件 + 1 导线 + 1 网络标签 + 1 接地标志
  const prefixes = {}
  for (const s of round.shape) prefixes[s.split('~')[0]] = (prefixes[s.split('~')[0]] ?? 0) + 1
  assert.deepEqual(prefixes, { LIB: 2, W: 1, N: 1, F: 1 })
})

test('validateSchematic（json-gen.js 导出）：合法产物结构 lint 通过', () => {
  const sheet = generateSchematic(DEFAULT_DESIGN)
  const res = validateSchematic(sheet)
  assert.equal(res.ok, true, res.errors.join('; '))
  // 工程包装的 dataStr 同样可 lint
  const proj = wrapAsProject(sheet, { title: 'demo' })
  assert.equal(proj.docType, 5)
  assert.equal(proj.schematics.length, 1)
  assert.equal(validateSchematic(proj.schematics[0].dataStr).ok, true)
})

test('deriveNetlist（sheet 级）：3 个网络全部闭合，4 个引脚各归其网', () => {
  const sheet = generateSchematic(DEFAULT_DESIGN)
  const nl = deriveNetlistFromSheet(sheet)
  assert.equal(nl.checks.ok, true, '网表自检应通过: ' + nl.checks.errors.join('; '))
  assert.equal(nl.nets.length, 3, '应有 3 个网络（Net1 / 5V / GND）')
  const byName = Object.fromEntries(nl.nets.map((n) => [n.name, n]))
  assert.ok(byName['5V'], '应包含 5V 网络（标签）')
  assert.ok(byName['GND'], '应包含 GND 网络（接地标志）')
  assert.deepEqual(sheetPinsOf(byName['5V'].pins), ['R1.2'], '5V = R1 引脚2（带标签允许单引脚）')
  assert.deepEqual(sheetPinsOf(byName['GND'].pins), ['LED1.2'], 'GND = LED1 引脚2')
  const main = Object.values(byName).find((n) => n.label === null)
  assert.ok(main, '应存在无标签内部网络')
  assert.deepEqual(sheetPinsOf(main.pins), ['LED1.1', 'R1.1'], '内部网络 = R1 引脚1 + LED1 引脚1')
  for (const n of nl.nets) assert.equal(n.closed, true, `${n.name} 应闭合`)
  // 4 个引脚恰好各出现一次
  const all = nl.nets.flatMap((n) => n.pins)
  assert.equal(all.length, 4)
  assert.equal(new Set(all.map((p) => `${p.designator}.${p.number}`)).size, 4, '引脚不应重复归属')
})

test('checkConnectivity（design 级）：连通、无悬空；命名网含 5V/GND', () => {
  const res = checkConnectivity(DEFAULT_DESIGN)
  assert.equal(res.ok, true, res.errors.join('; '))
  const named = res.netlist.nets.filter((n) => n.name !== null)
  assert.deepEqual(named.map((n) => n.name).sort(), ['5V', 'GND'])
  for (const n of named) assert.ok(n.pins.length >= 1, `net ${n.name} 无引脚`)
  assert.equal(res.netlist.dangling.length, 0)
})

test('deriveNetlist（design 级）：5V/GND 与中间网络引脚符合预期', () => {
  const { nets } = deriveNetlistFromDesign(DEFAULT_DESIGN)
  const byName = Object.fromEntries(
    nets.filter((n) => n.name !== null).map((n) => [n.name, n.pins.map((p) => p.ref + '.' + p.pin)]),
  )
  assert.deepEqual(byName['5V'].sort(), ['R1.2'])
  assert.deepEqual(byName['GND'].sort(), ['LED1.2'])
  const unnamed = nets.filter((n) => n.name === null && n.pins.length === 2)
  assert.equal(unnamed.length, 1)
  assert.deepEqual(unnamed[0].pins.map((p) => p.ref + '.' + p.pin).sort(), ['LED1.1', 'R1.1'])
})

test('pinPoints：resistor/led 引脚几何与生成器一致（±50/±40）', () => {
  const r = pinPoints({ ref: 'R1', type: 'resistor', pos: { x: 400, y: 300 } })
  assert.deepEqual(r.map((p) => [p.x, p.y]), [[450, 300], [350, 300]])
  const l = pinPoints({ ref: 'D1', type: 'led', pos: { x: 700, y: 300 } })
  assert.deepEqual(l.map((p) => [p.x, p.y]), [[740, 300], [660, 300]])
})

test('wrapAsProject：docType=5 工程包装，dataStr 与平面单片一致', () => {
  const sheet = generateSchematic(DEFAULT_DESIGN)
  const proj = wrapAsProject(sheet, { title: 'demo' })
  assert.equal(proj.docType, 5)
  assert.deepEqual(Object.keys(proj).sort(), ['colors', 'description', 'docType', 'editorVersion', 'schematics', 'title'])
  assert.equal(proj.schematics.length, 1)
  assert.equal(proj.schematics[0].docType, '1')
  assert.deepEqual(proj.schematics[0].dataStr, sheet)
})

// ============================================================================
// 坏电路：网表自检必须报错（结构 lint 仍通过 —— 格式合法、电路断开）
// ============================================================================

test('坏电路：悬空导线端点 → sheet 级网表自检报错', () => {
  const sheet = generateSchematic({
    components: [{ ref: 'R1', type: 'resistor', value: '10k', pos: { x: 400, y: 300 } }],
    // 起点 (450,300) 接 R1 引脚1；末端 (900,480) 悬空
    wires: [[450, 300, 450, 380, 900, 380, 900, 480]],
    nets: [{ name: '5V', points: [[350, 300]] }],
  })
  // 结构 lint 通过（悬空导线是电路问题，不是格式问题）
  assert.equal(validateSchematic(sheet).ok, true)
  // 网表自检必须失败
  const nl = deriveNetlistFromSheet(sheet)
  assert.equal(nl.checks.ok, false, '网表自检必须失败')
  const msgs = nl.checks.errors.join('; ')
  assert.ok(msgs.includes('悬空导线端点'), '应报悬空导线端点: ' + msgs)
  assert.ok(msgs.includes('未闭合'), '同时应报网络未闭合（只有 1 个引脚）: ' + msgs)
})

test('坏电路：引脚未连接（网络未闭合）→ sheet 级网表自检报错', () => {
  const sheet = generateSchematic({
    components: [
      { ref: 'R1', type: 'resistor', value: '10k', pos: { x: 400, y: 300 } },
      { ref: 'LED1', type: 'led', value: 'red', pos: { x: 700, y: 300 } },
    ],
    wires: [[450, 300, 740, 300]], // R1.1 ↔ LED1.1 已连
    nets: [{ name: '5V', points: [[350, 300]] }], // 缺 GND → LED1 阴极 (660,300) 悬空
  })
  const nl = deriveNetlistFromSheet(sheet)
  assert.equal(nl.checks.ok, false)
  const msgs = nl.checks.errors.join('; ')
  assert.ok(msgs.includes('未闭合'), '应报未闭合网络: ' + msgs)
  assert.ok(msgs.includes('LED1'), '错误信息应指明 LED1 引脚: ' + msgs)
})

test('坏电路：完全孤立的导线 → sheet 级网表自检报孤立导线', () => {
  const sheet = generateSchematic({ components: [], wires: [[100, 100, 200, 200]], nets: [] })
  const nl = deriveNetlistFromSheet(sheet)
  assert.equal(nl.checks.ok, false)
  const msgs = nl.checks.errors.join('; ')
  assert.ok(msgs.includes('孤立导线'), '应报孤立导线: ' + msgs)
})

test('坏电路（design 级）：引脚悬空 → checkConnectivity 报错；生成器照常产出', () => {
  const broken = {
    name: 'broken',
    components: [{ ref: 'R9', type: 'resistor', value: '1k', pos: { x: 100, y: 100 } }],
    wires: [],
    nets: [],
  }
  const sheet = generateSchematic(broken) // 生成不报错（生成器只负责生成）
  assert.equal(validateSchematic(sheet).ok, true)
  const res = checkConnectivity(broken) // 但连通性必须报错
  assert.equal(res.ok, false)
  assert.ok(res.errors.some((e) => e.includes('R9.1')), '应报出 R9.1 悬空: ' + res.errors.join('; '))
  assert.ok(res.errors.some((e) => e.includes('R9.2')), '应报出 R9.2 悬空: ' + res.errors.join('; '))
})

// ============================================================================
// 结构 lint 防御：残缺/非法对象必须报错
// ============================================================================

test('validateSchematic：残缺/非法对象必须报错', () => {
  const bad1 = validateSchematic({ head: {}, canvas: 42, shape: 'x', BBox: {}, colors: null, extra: 1 })
  assert.equal(bad1.ok, false)
  assert.ok(bad1.errors.length >= 4, '应有多条错误: ' + bad1.errors.join('; '))
  assert.ok(bad1.errors.some((e) => e.includes('顶层键')), bad1.errors.join('; '))
  assert.ok(bad1.errors.some((e) => e.includes('canvas')))

  assert.equal(validateSchematic(null).ok, false)
  assert.equal(validateSchematic([]).ok, false)

  // 缺 head 必需字段 + 空 shape
  const bad2 = validateSchematic({
    head: { docType: '1' },
    canvas: 'CA~1200~800~#FFFFFF~yes~#CCCCCC~10~1200~800~line~10~pixel~5~0~0',
    shape: [],
    BBox: { x: 0, y: 0, width: 10, height: 10 },
    colors: {},
  })
  assert.equal(bad2.ok, false)
  assert.ok(bad2.errors.some((e) => e.includes('head 缺少必需字段')))
  assert.ok(bad2.errors.some((e) => e.includes('shape 不能为空')))

  // validate.js 的 validateSchematic 同样拒绝
  assert.equal(lintDesign({ head: {}, shape: [] }).ok, false)
})

// ============================================================================
// 其他
// ============================================================================

test('不支持的元件类型：generateSchematic 抛出明确错误', () => {
  assert.throws(
    () =>
      generateSchematic({
        ...DEFAULT_DESIGN,
        components: [{ ref: 'X1', type: 'capacitor', value: '1u', pos: { x: 0, y: 0 } }],
      }),
    /不支持的元件类型/,
  )
})

test('demo-netlist.json 与 demo.json 联动：生成器 main 产物可复现（幂等形状）', async () => {
  // 重新运行 main()，确认 demo.json / demo-project.json / demo-netlist.json 均能写出且自检通过
  const { ok, netlist } = await (await import('./json-gen.js')).main()
  assert.equal(ok, true)
  assert.equal(netlist.checks.ok, true, netlist.checks.errors.join('; '))
  assert.equal(netlist.nets.length, 3)
})
