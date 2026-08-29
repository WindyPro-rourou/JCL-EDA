// Dev: capture rendered area PNG (schematic + PCB) and full DRC details.
import { writeFileSync, mkdirSync } from 'node:fs'
const PORT = process.env.EDA_BRIDGE_PORT ?? '49620'
const OUT = process.env.OUT_DIR ?? 'scratch/shots'
mkdirSync(OUT, { recursive: true })

async function execute(code, timeoutMs = 40000) {
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

// 1) schematic PNG
const sch = await execute(`return await (async () => {
  await eda.dmt_EditorControl.openDocument('2dd115fe3f36aaaa');
  await new Promise(r => setTimeout(r, 1500));
  const info = await eda.dmt_SelectControl.getCurrentDocumentInfo();
  const blob = await eda.dmt_EditorControl.getCurrentRenderedAreaImage(info.tabId);
  if (!blob) return null;
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return { type: blob.type, size: bytes.length, b64: btoa(bin) };
})();`, 60000)
if (sch.ok) {
  const j = JSON.parse(sch.result)
  if (j && j.b64) {
    writeFileSync(`${OUT}/sch.png`, Buffer.from(j.b64, 'base64'))
    console.log('SCH shot:', j.type, j.size, '->', `${OUT}/sch.png`)
  } else console.log('SCH shot: null', sch.result.slice(0, 200))
} else console.log('SCH shot err:', sch.error)

// 2) PCB PNG
const pcb = await execute(`return await (async () => {
  await eda.dmt_EditorControl.openDocument('13a43dcf22b6b1b0');
  await new Promise(r => setTimeout(r, 1500));
  const info = await eda.dmt_SelectControl.getCurrentDocumentInfo();
  const blob = await eda.dmt_EditorControl.getCurrentRenderedAreaImage(info.tabId);
  if (!blob) return null;
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return { type: blob.type, size: bytes.length, b64: btoa(bin) };
})();`, 60000)
if (pcb.ok) {
  const j = JSON.parse(pcb.result)
  if (j && j.b64) {
    writeFileSync(`${OUT}/pcb.png`, Buffer.from(j.b64, 'base64'))
    console.log('PCB shot:', j.type, j.size, '->', `${OUT}/pcb.png`)
  } else console.log('PCB shot: null', pcb.result.slice(0, 200))
} else console.log('PCB shot err:', pcb.error)

// 3) full PCB DRC
const drc = await execute(`return await (async () => {
  const d = await eda.pcb_Drc.check(true, false, true);
  const flat = [];
  const walk = (arr) => { for (const x of (arr || [])) { if (x && x.list) walk(x.list); else if (x && (x.explanation || x.ruleName)) flat.push({ rule: x.ruleName, obj1: x.obj1?.suffix ?? x.obj1?.typeName, obj2: x.obj2?.suffix ?? x.obj2?.typeName, text: (x.explanation?.str ?? '').slice(0, 140) }); } };
  walk(d);
  return { summary: d, flat };
})();`, 60000)
if (drc.ok) {
  const j = JSON.parse(drc.result)
  console.log('PCB DRC flat:', JSON.stringify(j.flat, null, 1).slice(0, 1800))
  console.log('PCB DRC summary:', JSON.stringify(j.summary).slice(0, 500))
} else console.log('DRC err:', drc.error)

// back to schematic
await execute(`return await eda.dmt_EditorControl.openDocument('2dd115fe3f36aaaa');`)
console.log('DONE')
