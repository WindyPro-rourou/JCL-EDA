// Dev: 全类别覆盖全流程测试 —— 每个器件大类测一个（原理图 + PCB 双端放置）。
// Phase 0: 清理上一轮全流程残留（已知 primitiveIds）
// Phase 1: 原理图逐类放置 + 保存 + DRC + 网表/BOM
// Phase 2: PCB 逐类放置 + 过孔/走线 + 保存 + DRC + 网表
// Phase 3: 切回 P1 + 紧急保存
const PORT = process.env.EDA_BRIDGE_PORT ?? '49620'
import { createSnapshot } from '../plugin/lib/snapshot.js'
import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => console.log(...a)

async function execute(code, timeoutMs = 25000) {
  const res = await fetch(`http://127.0.0.1:${PORT}/execute`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await res.text()
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` }
  let j; try { j = JSON.parse(text) } catch { j = null }
  if (j && j.success === false) return { ok: false, error: String(j.error ?? 'bridge').slice(0, 250) }
  const val = j?.result !== undefined ? j.result : text
  return { ok: true, result: typeof val === 'string' ? val : JSON.stringify(val) }
}

async function step(label, code, opts = {}) {
  const t0 = Date.now()
  const r = await execute(code, opts.timeoutMs ?? 25000)
  if (!r.ok) { log(`[ERR] ${label}: ${r.error}`); return null }
  let out = r.result
  if (opts.parse) { try { out = JSON.parse(out) } catch { /* string */ } }
  log(`[OK ] ${label} (${Date.now() - t0}ms): ${typeof out === 'string' ? out.slice(0, opts.max ?? 380) : JSON.stringify(out).slice(0, opts.max ?? 380)}`)
  return out
}

// 类别 → 候选搜索词（依次尝试，取第一个非空）
const CATEGORIES = [
  { cat: '电阻 R', words: ['R0402', '10K'] },
  { cat: '电容 C', words: ['C0603', '100nF'] },
  { cat: '电感 L', words: ['L0402', '10uH'] },
  { cat: '二极管 D', words: ['1N4148', 'SS34'] },
  { cat: 'LED', words: ['LED'] },
  { cat: '三极管 Q', words: ['S8050', 'MMBT3904'] },
  { cat: 'MOSFET Q', words: ['AO3400', 'AO3401A'] },
  { cat: '稳压器 U', words: ['AMS1117', 'LDO 3.3'] },
  { cat: '晶振 X', words: ['32.768KHz', 'Crystal'] },
  { cat: '连接器 J', words: ['XH2.54', 'JST'] },
  { cat: '开关 SW', words: ['SW-PUSH', 'K2-'] },
  { cat: 'MCU U', words: ['ESP32', 'STM32F'] },
  { cat: '蜂鸣器 B', words: ['BUZZER'] },
  { cat: '保险丝 F', words: ['PTC', 'FUSE'] },
]

// 上轮残留（首次/二次全流程）的确定性 ids
const LEFTOVER = {
  sch: ['ade73e49ebddf19c', '414391590829a70e', '93e2f7456e47d2ad', '3ddfe3764bb13779', 'f7cce783e701bb3e', '70467badb2e29aed',
        '74a1e8c2d789d438', 'f7e6b5c263067238', '829953907499c004', '954fbb2deb8bbe0f', '801048290395120a', 'c6aee2370442e593'],
  pcb: ['2ecf5adcbc6986ec', '3abd70b77d1842e0', '04433f19bfe00add', '2cefeb0414bc2e39'],
}

// ---- Phase 0: 清理残留 ----
log('== Phase 0: 清理上轮残留 ==')
await step('清理 P1 残留', `return await eda.sch_PrimitiveComponent.delete(${JSON.stringify(LEFTOVER.sch)});`)
await step('清理 P1 导线残留', `return await eda.sch_PrimitiveWire.delete(${JSON.stringify(LEFTOVER.sch)});`)
await step('清理 PCB 残留', `return await eda.pcb_PrimitiveVia.delete(${JSON.stringify(LEFTOVER.pcb)});`)
await SLEEP(600)

// ---- Phase 1: 原理图逐类放置 ----
log('== Phase 1: 原理图逐类放置 ==')
await step('打开 P1', `return await eda.dmt_EditorControl.openDocument('2dd115fe3f36aaaa');`)
await SLEEP(1200)
const placed = []
for (let i = 0; i < CATEGORIES.length; i++) {
  const { cat, words } = CATEGORIES[i]
  const x = 3200 + (i % 3) * 1300
  const y = 3000 + Math.floor(i / 3) * 1000
  const r = await step(`放置 ${cat}`, `return await (async () => {
    for (const w of ${JSON.stringify(words)}) {
      try {
        const list = await eda.lib_Device.search(w);
        if (list && list.length > 0) {
          const c = await eda.sch_PrimitiveComponent.create(list[0], ${x}, ${y}, undefined, 0, false, true, true);
          if (c) return { keyword: w, name: list[0].name, designator: c.getState_Designator(), x: c.getState_X(), y: c.getState_Y() };
        }
      } catch (e) { /* try next keyword */ }
    }
    return null;
  })();`, { timeoutMs: 30000 })
  if (r) { try { placed.push({ cat, ...JSON.parse(r) }) } catch { placed.push({ cat, raw: r }) } }
  await SLEEP(500)
}
log('-- 放置汇总:')
for (const p of placed) log(`   ${p.cat}: ${p.name} (${p.designator}) @${p.x},${p.y}`)

// Phase 1b: 保存 + DRC + 网表/BOM
await step('保存原理图', 'return await eda.sch_Document.save();', { timeoutMs: 40000 })
await SLEEP(800)
await step('原理图 DRC(verbose)', 'return await eda.sch_Drc.check(true, false, true);', { timeoutMs: 40000 })
const netlist = await step('网表', `return await (async () => { const f = await eda.sch_ManufactureData.getNetlistFile(); if (!f) return null; const t = await f.text(); return { name: f.name, len: t.length }; })();`, { timeoutMs: 40000 })
const bom = await step('BOM', `return await (async () => { const f = await eda.sch_ManufactureData.getBomFile(); if (!f) return null; const bytes = new Uint8Array(await f.arrayBuffer()); let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return { name: f.name, size: f.size, b64Len: btoa(bin).length }; })();`, { timeoutMs: 40000 })

// ---- Phase 2: PCB 逐类放置 ----
log('== Phase 2: PCB 逐类放置 ==')
await step('打开 PCB1', `return await eda.dmt_EditorControl.openDocument('13a43dcf22b6b1b0');`)
await SLEEP(1200)
const pcbPlaced = []
for (let i = 0; i < placed.length; i++) {
  const p = placed[i]
  const x = 3200 + (i % 3) * 1600
  const y = 3000 + Math.floor(i / 3) * 1400
  const r = await step(`PCB 放置 ${p.cat}`, `return await (async () => {
    for (const w of ${JSON.stringify(p.words ?? CATEGORIES[i].words)}) {
      try {
        const list = await eda.lib_Device.search(w);
        if (list && list.length > 0) {
          const c = await eda.pcb_PrimitiveComponent.create(list[0], 1, ${x}, ${y}, 0, false);
          if (c) return { keyword: w, name: list[0].name, designator: c.getState_Designator(), x: c.getState_X(), y: c.getState_Y() };
        }
      } catch (e) { /* try next */ }
    }
    return null;
  })();`, { timeoutMs: 30000 })
  if (r) { try { pcbPlaced.push({ cat: p.cat, ...JSON.parse(r) }) } catch { /* skip */ } }
  await SLEEP(400)
}
await step('PCB 过孔 VCC', `return await eda.pcb_PrimitiveVia.create('VCC', 1000, 1000, 20, 60);`)
await step('PCB 过孔 GND', `return await eda.pcb_PrimitiveVia.create('GND', 2000, 1000, 20, 60);`)
await step('PCB 走线', `return await eda.pcb_PrimitiveLine.create('VCC', 1, 900, 1000, 2100, 1000, 10, false);`)
await step('PCB 保存', 'return await eda.pcb_Document.save();', { timeoutMs: 40000 })
await SLEEP(800)
await step('PCB DRC(verbose)', 'return await eda.pcb_Drc.check(true, false, true);', { timeoutMs: 40000 })
await step('PCB 网表(JLCEDA)', `return await (async () => { const s = await eda.pcb_Net.getNetlist('JLCEDA'); return { len: (s ?? '').length, comps: (() => { try { const j = JSON.parse(s); return Object.keys(j.components ?? {}).length; } catch { return -1; } })() }; })();`)

// ---- Phase 3: 切回 P1 + 紧急保存 ----
await step('切回原理图 P1', `return await eda.dmt_EditorControl.openDocument('2dd115fe3f36aaaa');`)
await SLEEP(800)
log('== Phase 3: 紧急保存 ==')
const snapDir = process.env.SNAP_DIR ?? (await mkdtemp(join(tmpdir(), 'eda-cat-snap-')))
const snap = await createSnapshot({
  execute,
  activities: () => [{ ts: new Date().toISOString(), tool: 'e2e', action: '全类别全流程实测', ok: true }],
  connected: true,
  dir: snapDir,
})
log('-- snapshot:', snap.ok, snap.dir, snap.files.map((f) => `${f.name}(${f.size})`).join(', '), 'errors:', JSON.stringify(snap.errors))
log('ALL DONE')
