// Dev: zoom to all primitives on PCB then capture.
import { writeFileSync, mkdirSync } from 'node:fs'
const PORT = process.env.EDA_BRIDGE_PORT ?? '49620'
const OUT = 'scratch/shots'
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

const r = await execute(`return await (async () => {
  await eda.dmt_EditorControl.openDocument('13a43dcf22b6b1b0');
  await new Promise(r => setTimeout(r, 1500));
  try { const z = await eda.dmt_EditorControl.zoomToAllPrimitives(); console.log('zoom:', z); } catch (e) { return { err: 'zoom: ' + String(e).slice(0, 120) }; }
  await new Promise(r => setTimeout(r, 1200));
  const info = await eda.dmt_SelectControl.getCurrentDocumentInfo();
  const blob = await eda.dmt_EditorControl.getCurrentRenderedAreaImage(info.tabId);
  if (!blob) return null;
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return { type: blob.type, size: bytes.length, b64: btoa(bin) };
})();`, 60000)
if (r.ok) {
  const j = JSON.parse(r.result)
  if (j && j.b64) {
    writeFileSync(`${OUT}/pcb.png`, Buffer.from(j.b64, 'base64'))
    console.log('PCB shot:', j.type, j.size, '->', `${OUT}/pcb.png`)
  } else console.log('PCB shot:', JSON.stringify(j).slice(0, 300))
} else console.log('err:', r.error)
