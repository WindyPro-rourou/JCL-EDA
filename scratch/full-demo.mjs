// Dev: 完整 demo —— LED 点亮电路（原理图 + PCB，全部框内定位、真实引脚连线）。
// Phase A 原理图: 读已有 bbox → 框内空位 → 放 R/LED → 取引脚坐标 → VCC/GND 网络标志
//                → 引脚级连线 → 保存 → DRC → 网表/BOM
// Phase B PCB: 画板框(11层) → 框内放 R/LED → 取焊盘坐标 → VCC/GND 过孔
//              → 焊盘级走线 → 保存 → DRC → 网表
// Phase C: 切回 P1 + 紧急保存。成品保留供查看。
const PORT = process.env.EDA_BRIDGE_PORT ?? '49620'
import { createSnapshot } from '../plugin/lib/snapshot.js'
import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms))

async function execute(code, timeoutMs = 25000) {
  const res = await fetch(`http://127.0.0.1:${PORT}/execute`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await res.text()
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 250)}` }
  let j; try { j = JSON.parse(text) } catch { j = null }
  if (j && j.success === false) return { ok: false, error: String(j.error ?? 'bridge').slice(0, 300) }
  const val = j?.result !== undefined ? j.result : text
  return { ok: true, result: typeof val === 'string' ? val : JSON.stringify(val) }
}
async function execJson(code, tries = 3) {
  let last
  for (let i = 0; i < tries; i++) {
    const r = await execute(code)
    if (r.ok) { try { return JSON.parse(r.result) } catch { return r.result } }
    last = new Error(r.error)
    await SLEEP(700)
  }
  throw last
}
const step = async (label, code, opts = {}) => {
  try {
    const r = await execJson(code, opts.tries ?? 3)
    const s = typeof r === 'string' ? r.slice(0, opts.max ?? 260) : JSON.stringify(r).slice(0, opts.max ?? 260)
    console.log(`[OK ] ${label}: ${s}`)
    return r
  } catch (e) {
    console.log(`[ERR] ${label}: ${String(e).slice(0, 300)}`)
    return null
  }
}

// ======================= Phase A: 原理图 =======================
console.log('== Phase A 原理图 ==')
const proj = await execJson('return await eda.dmt_Project.getCurrentProjectInfo();')
const page = proj.data?.[0]?.schematic?.page?.[0]
const W = Number(page?.titleBlockData?.Width?.value ?? 1170)
const H = Number(page?.titleBlockData?.Height?.value ?? 825)
console.log(`页面 ${page.name} = ${W} x ${H} (10mil)`)
await step('打开P1', `return await eda.dmt_EditorControl.openDocument('${page.uuid}');`)
await SLEEP(1200)

// 已有图元（桥端映射）
const layout = await execJson(`return await (async () => {
  const comps = await eda.sch_PrimitiveComponent.getAll();
  const wires = await eda.sch_PrimitiveWire.getAll();
  const used = [];
  for (const c of (comps || [])) { try { used.push([c.getState_X(), c.getState_Y()]); } catch (e) {} }
  for (const w of (wires || [])) { try { const l = w.getState_Line(); for (let i = 0; i + 1 < l.length; i += 2) used.push([l[i], l[i + 1]]); } catch (e) {} }
  return { compCount: (comps || []).length, used };
})();`)
console.log(`已有 ${layout.compCount} 元件 / ${layout.used.length} 采样点`)

// 框内选点：右中部 y=300 直线（避开左下 x<500 用户区）
const LINE_Y = 300
const R_X = 960
const LED_X = 720
const MARGIN = 80
console.log(`计划布线行 y=${LINE_Y}（图框内 MARGIN..${W - MARGIN}） R@(${R_X},${LINE_Y}) LED@(${LED_X},${LINE_Y})`)

// 放 R 与 LED（拿 id + 引脚坐标）
const rInfo = await step('放置电阻 R', `return await (async () => {
  const list = await eda.lib_Device.search('R0402');
  const c = await eda.sch_PrimitiveComponent.create(list[0], ${R_X}, ${LINE_Y}, undefined, 0, false, true, true);
  const pins = await eda.sch_PrimitiveComponent.getAllPinsByPrimitiveId(c.getState_PrimitiveId());
  return { id: c.getState_PrimitiveId(), name: list[0].name, d: c.getState_Designator(), pins: (pins || []).map(p => ({ x: p.getState_X(), y: p.getState_Y() })) };
})();`)
await SLEEP(600)
const ledInfo = await step('放置 LED', `return await (async () => {
  const list = await eda.lib_Device.search('LED');
  const c = await eda.sch_PrimitiveComponent.create(list[0], ${LED_X}, ${LINE_Y}, undefined, 0, false, true, true);
  const pins = await eda.sch_PrimitiveComponent.getAllPinsByPrimitiveId(c.getState_PrimitiveId());
  return { id: c.getState_PrimitiveId(), name: list[0].name, d: c.getState_Designator(), pins: (pins || []).map(p => ({ x: p.getState_X(), y: p.getState_Y() })) };
})();`)
await SLEEP(600)
const rPins = (rInfo?.pins ?? []).sort((a, b) => a.x - b.x)
const lPins = (ledInfo?.pins ?? []).sort((a, b) => a.x - b.x)
console.log('R pins:', JSON.stringify(rPins), ' LED pins:', JSON.stringify(lPins))
if (rPins.length < 2 || lPins.length < 2) { console.log('!! 引脚读取不足，中止'); process.exit(1) }
const rLeft = rPins[0]; const rRight = rPins[rPins.length - 1]
const lLeft = lPins[0]; const lRight = lPins[lPins.length - 1]
// 网络标志放在延伸线上
const vccX = rRight.x + 100; const gndX = lLeft.x - 100
const vcc = await step('VCC 网络标志', `return await eda.sch_PrimitiveComponent.createNetFlag('Power', 'VCC', ${vccX}, ${rRight.y}, 0, false);`)
const gnd = await step('GND 网络标志', `return await eda.sch_PrimitiveComponent.createNetFlag('Ground', 'GND', ${gndX}, ${lLeft.y}, 0, false);`)
await SLEEP(400)
// 引脚级连线（全部水平同 y）
await step('导线 VCC→R', `return await eda.sch_PrimitiveWire.create([[${vccX}, ${rRight.y}, ${rRight.x}, ${rRight.y}]], 'VCC', null, null, null);`)
await step('导线 R→LED', `return await eda.sch_PrimitiveWire.create([[${rLeft.x}, ${rLeft.y}, ${lRight.x}, ${lRight.y}]], null, null, null, null);`)
await step('导线 LED→GND', `return await eda.sch_PrimitiveWire.create([[${lLeft.x}, ${lLeft.y}, ${gndX}, ${lLeft.y}]], 'GND', null, null, null);`)
await SLEEP(400)
await step('保存原理图', 'return await eda.sch_Document.save();', { tries: 2, timeoutMs: 40000 })
await SLEEP(800)
await step('原理图 DRC(verbose)', 'return await eda.sch_Drc.check(true, false, true);', { tries: 2, timeoutMs: 40000 })
await step('网表', `return await (async () => { const f = await eda.sch_ManufactureData.getNetlistFile(); if (!f) return null; const t = await f.text(); return { name: f.name, comps: (() => { try { return Object.keys(JSON.parse(t).components).length; } catch { return -1; } })() }; })();`, { tries: 2, timeoutMs: 40000 })
await step('BOM', `return await (async () => { const f = await eda.sch_ManufactureData.getBomFile(); if (!f) return null; return { name: f.name, size: f.size }; })();`, { tries: 2, timeoutMs: 40000 })

// ======================= Phase B: PCB =======================
console.log('== Phase B PCB ==')
const pcbUuid = proj.data?.[0]?.pcb?.uuid
await step('打开PCB1', `return await eda.dmt_EditorControl.openDocument('${pcbUuid}');`)
await SLEEP(1500)

// 板框（11 层）已有？无则画矩形 (1000,1000)-(6000,4500)
const frame = await execJson(`return await (async () => {
  const lines = await eda.pcb_PrimitiveLine.getAll();
  return (lines || []).filter(l => { try { return l.getState_Layer() === 11; } catch { return false; } }).length;
})();`)
console.log(`已有板框线: ${frame}`)
if (frame === 0) {
  await step('画板框(上)', `return await eda.pcb_PrimitiveLine.create('', 11, 1000, 1000, 6000, 1000, 10, false);`)
  await step('画板框(右)', `return await eda.pcb_PrimitiveLine.create('', 11, 6000, 1000, 6000, 4500, 10, false);`)
  await step('画板框(下)', `return await eda.pcb_PrimitiveLine.create('', 11, 6000, 4500, 1000, 4500, 10, false);`)
  await step('画板框(左)', `return await eda.pcb_PrimitiveLine.create('', 11, 1000, 4500, 1000, 1000, 10, false);`)
  await SLEEP(500)
}

// 框内元件：R (2600,3000) LED (3800,3000)（1mil 单位，板框 1000-6000 x 1000-4500）
const rPcb = await step('PCB 放 R', `return await (async () => {
  const list = await eda.lib_Device.search('R0402');
  const c = await eda.pcb_PrimitiveComponent.create(list[0], 1, 2600, 3000, 0, false);
  const fresh = await eda.pcb_PrimitiveComponent.get(c.getState_PrimitiveId());
  const pins = await fresh.getAllPins();
  return { id: c.getState_PrimitiveId(), d: c.getState_Designator(), pads: (pins || []).map(p => ({ x: p.getState_X(), y: p.getState_Y() })) };
})();`)
await SLEEP(600)
const ledPcb = await step('PCB 放 LED', `return await (async () => {
  const list = await eda.lib_Device.search('LED');
  const c = await eda.pcb_PrimitiveComponent.create(list[0], 1, 3800, 3000, 0, false);
  const fresh = await eda.pcb_PrimitiveComponent.get(c.getState_PrimitiveId());
  const pins = await fresh.getAllPins();
  return { id: c.getState_PrimitiveId(), d: c.getState_Designator(), pads: (pins || []).map(p => ({ x: p.getState_X(), y: p.getState_Y() })) };
})();`)
await SLEEP(600)
const rPadL = (rPcb?.pads ?? []).sort((a, b) => a.x - b.x)
const lPadL = (ledPcb?.pads ?? []).sort((a, b) => a.x - b.x)
console.log('R pads:', JSON.stringify(rPadL), ' LED pads:', JSON.stringify(lPadL))
if (rPadL.length < 2 || lPadL.length < 2) { console.log('!! PCB 焊盘读取不足'); }
const rp1 = rPadL[0]; const rp2 = rPadL[rPadL.length - 1]
const lp1 = lPadL[0]; const lp2 = lPadL[lPadL.length - 1]
// 过孔在两侧延伸线上
const viaVcc = await step('过孔 VCC', `return await eda.pcb_PrimitiveVia.create('VCC', ${rp1.x - 300}, ${rp1.y}, 20, 45);`)
const viaGnd = await step('过孔 GND', `return await eda.pcb_PrimitiveVia.create('GND', ${lp2.x + 300}, ${lp2.y}, 20, 45);`)
await SLEEP(400)
// 走线（TOP=1, 宽10）：viaVCC→R左pad；R右pad→LED左pad；LED右pad→viaGND
await step('走线 VCC→R', `return await eda.pcb_PrimitiveLine.create('VCC', 1, ${rp1.x - 300}, ${rp1.y}, ${rp1.x}, ${rp1.y}, 10, false);`)
await step('走线 R→LED', `return await eda.pcb_PrimitiveLine.create('', 1, ${rp2.x}, ${rp2.y}, ${lp1.x}, ${lp1.y}, 10, false);`)
await step('走线 LED→GND', `return await eda.pcb_PrimitiveLine.create('GND', 1, ${lp2.x}, ${lp2.y}, ${lp2.x + 300}, ${lp2.y}, 10, false);`)
await SLEEP(400)
await step('保存 PCB', 'return await eda.pcb_Document.save();', { tries: 2, timeoutMs: 40000 })
await SLEEP(800)
await step('PCB DRC(verbose)', 'return await eda.pcb_Drc.check(true, false, true);', { tries: 2, timeoutMs: 40000 })
await step('PCB 网表(JLCEDA)', `return await (async () => { const s = await eda.pcb_Net.getNetlist('JLCEDA'); return { len: (s ?? '').length, comps: (() => { try { return Object.keys(JSON.parse(s).components ?? {}).length; } catch { return -1; } })() }; })();`)

// ======================= Phase C: 切回 + 快照 =======================
await step('切回 P1', `return await eda.dmt_EditorControl.openDocument('${page.uuid}');`)
await SLEEP(800)
const snapDir = process.env.SNAP_DIR ?? (await mkdtemp(join(tmpdir(), 'eda-demo-')))
const snap = await createSnapshot({
  execute,
  activities: () => [{ ts: new Date().toISOString(), tool: 'e2e', action: '完整 demo（LED 点亮电路）', ok: true }],
  connected: true,
  dir: snapDir,
})
console.log('snapshot:', snap.ok, snap.dir, snap.files.map((f) => `${f.name}(${f.size})`).join(', '), 'errors:', JSON.stringify(snap.errors))
console.log('DONE — 成品保留在画板上（原理图 y=300 行 + PCB 板框内）')
