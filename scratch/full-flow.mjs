// Dev E2E full-flow: 原理图放元件→网络标志→导线→保存→DRC→网表/BOM→
// PCB 同步+过孔→保存→DRC→切回原理图→紧急保存。每步独立执行、逐步输出。
import { createSnapshot } from '../plugin/lib/snapshot.js'
import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const PORT = process.env.EDA_BRIDGE_PORT ?? '49620'
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms))

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
  if (j && j.success === false) return { ok: false, error: String(j.error ?? 'bridge error').slice(0, 250) }
  const val = j?.result !== undefined ? j.result : text
  return { ok: true, result: typeof val === 'string' ? val : JSON.stringify(val) }
}

async function step(label, code, opts = {}) {
  const t0 = Date.now()
  const r = await execute(code, opts.timeoutMs ?? 25000)
  const ms = Date.now() - t0
  if (!r.ok) { console.log(`[ERR] ${label}: ${r.error} (${ms}ms)`); return null }
  let out = r.result
  if (opts.summarize && typeof out === 'string') {
    try { out = JSON.parse(out) } catch { /* keep string */ }
  }
  console.log(`[OK ] ${label} (${ms}ms): ${typeof out === 'string' ? out.slice(0, opts.max ?? 400) : JSON.stringify(out).slice(0, opts.max ?? 400)}`)
  return out
}

// 1) 前置：health + 窗口
const health = await step('health', 'return null;', { max: 0 }).catch(() => null)
const h = await (async () => {
  const res = await fetch(`http://127.0.0.1:${PORT}/health`, { signal: AbortSignal.timeout(5000) })
  return res.json()
})()
console.log('-- health:', JSON.stringify(h))
if (!h.edaConnected) { console.log('!! 编辑器未连接：请打开 pro.lceda.cn/editor 后重跑'); process.exit(1) }

// 2) 工程信息（提取 PCB 与图页 uuid）
const projRaw = await step('工程信息', 'return await eda.dmt_Project.getCurrentProjectInfo();', { summarize: false })
const proj = JSON.parse(projRaw)
const board = proj.data?.[0]
const pageUuid = board?.schematic?.page?.[0]?.uuid
const pcbUuid = board?.pcb?.uuid
console.log('-- project:', proj.friendlyName, '| page:', board?.schematic?.page?.[0]?.name, pageUuid, '| pcb:', board?.pcb?.name, pcbUuid)

// 3) 当前文档
await step('当前文档信息', 'return await eda.dmt_SelectControl.getCurrentDocumentInfo();')

// 4) 放置 LED（系统库搜索 → create, 加入BOM+转到PCB）
const led = await step('放置 LED', `return await (async () => {
  const list = await eda.lib_Device.search('LED');
  if (!list || list.length === 0) return null;
  const c = await eda.sch_PrimitiveComponent.create(list[0], 4000, 4000, undefined, 0, false, true, true);
  if (!c) return null;
  return { name: list[0].name, primitiveId: c.getState_PrimitiveId(), designator: c.getState_Designator(), x: c.getState_X(), y: c.getState_Y() };
})();`)
await SLEEP(800)

// 5) 放置电阻（10K → fallback R0603）
const res = await step('放置电阻 10K', `return await (async () => {
  let list = await eda.lib_Device.search('10K');
  if (!list || list.length === 0) list = await eda.lib_Device.search('R0603');
  if (!list || list.length === 0) return null;
  const c = await eda.sch_PrimitiveComponent.create(list[0], 4000, 5600, undefined, 0, false, true, true);
  if (!c) return null;
  return { name: list[0].name, primitiveId: c.getState_PrimitiveId(), designator: c.getState_Designator(), x: c.getState_X(), y: c.getState_Y() };
})();`)
await SLEEP(800)

// 6) 网络标志 Power/Ground
await step('网络标志 VCC', `return await eda.sch_PrimitiveComponent.createNetFlag('Power', 'VCC', 3400, 4400, 0, false);`)
await step('网络标志 GND', `return await eda.sch_PrimitiveComponent.createNetFlag('Ground', 'GND', 4600, 4400, 0, false);`)
await SLEEP(500)

// 7) 导线（显式网络名；落空区域即独立导线）
await step('导线 VCC', `return await eda.sch_PrimitiveWire.create([[3600, 4000, 3400, 4000]], 'VCC', null, null, null);`)
await step('导线 GND', `return await eda.sch_PrimitiveWire.create([[4400, 4000, 4600, 4000]], 'GND', null, null, null);`)
await SLEEP(500)

// 8) 保存原理图
await step('保存原理图', 'return await eda.sch_Document.save();', { timeoutMs: 40000 })
await SLEEP(800)

// 9) DRC（verbose）/ 网表（File.text()）/ BOM（base64）
await step('原理图 DRC(verbose)', 'return await eda.sch_Drc.check(true, false, true);', { timeoutMs: 40000 })
const net = await step('网表(File.text)', `return await (async () => { const f = await eda.sch_ManufactureData.getNetlistFile(); if (!f) return null; const t = await f.text(); return { name: f.name, size: f.size, len: t.length, head: t.slice(0, 160) }; })();`, { timeoutMs: 40000 })
const bom = await step('BOM(base64→size)', `return await (async () => { const f = await eda.sch_ManufactureData.getBomFile(); if (!f) return null; const bytes = new Uint8Array(await f.arrayBuffer()); let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return { name: f.name, size: f.size, b64Len: btoa(bin).length }; })();`, { timeoutMs: 40000 })

// 10) 打开 PCB1
await step('打开 PCB1', `return await eda.dmt_EditorControl.openDocument('${pcbUuid}');`)
await SLEEP(1200)
await step('当前文档(应为PCB)', 'return await eda.dmt_SelectControl.getCurrentDocumentInfo();')
await step('PCB 导入原理图变更', 'return await eda.pcb_Document.importChanges();', { timeoutMs: 40000 })
await SLEEP(1000)

// 11) PCB 过孔×2（顶层网络）
await step('PCB 过孔 VCC@1000,1000', `return await eda.pcb_PrimitiveVia.create('VCC', 1000, 1000, 20, 60);`)
await step('PCB 过孔 GND@2000,1000', `return await eda.pcb_PrimitiveVia.create('GND', 2000, 1000, 20, 60);`)
await SLEEP(500)
await step('PCB 保存', 'return await eda.pcb_Document.save();', { timeoutMs: 40000 })
await SLEEP(800)
await step('PCB DRC(verbose)', 'return await eda.pcb_Drc.check(true, false, true);', { timeoutMs: 40000 })

// 12) 切回原理图页（用户看到成果）
await step('切回原理图 P1', `return await eda.dmt_EditorControl.openDocument('${pageUuid}');`)
await SLEEP(800)

// 13) 紧急保存（真实落盘）
console.log('-- 紧急保存 ...')
const snapDir = process.env.SNAP_DIR ?? (await mkdtemp(join(tmpdir(), 'eda-flow-snap-')))
const snap = await createSnapshot({
  execute,
  activities: () => [{ ts: new Date().toISOString(), tool: 'e2e', action: '全流程实测', ok: true }],
  connected: true,
  dir: snapDir,
})
console.log('-- snapshot ok:', snap.ok, 'dir:', snap.dir, 'files:', snap.files.map((f) => `${f.name}(${f.size})`).join(', '), 'errors:', snap.errors)
console.log('ALL DONE')
