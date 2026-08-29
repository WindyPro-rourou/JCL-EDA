// Dev: which netlist API hangs? API=pcb|sch|manu
const PORT = process.env.EDA_BRIDGE_PORT ?? '49620'
const which = process.env.API ?? 'pcb'

const codes = {
  pcb: `return await (async () => { await eda.dmt_EditorControl.openDocument('13a43dcf22b6b1b0'); await new Promise(r => setTimeout(r, 1500)); const s = await eda.pcb_Net.getNetlist(); return { len: (s ?? '').length, head: (s ?? '').slice(0, 200) }; })();`,
  sch: `return await (async () => { await eda.dmt_EditorControl.openDocument('2dd115fe3f36aaaa'); await new Promise(r => setTimeout(r, 1500)); const s = await eda.sch_Netlist.getNetlist(); return { len: (s ?? '').length, head: (s ?? '').slice(0, 200) }; })();`,
  manu: `return await (async () => { const f = await eda.sch_ManufactureData.getNetlistFile(); return f ? { len: (await f.text()).length } : null; })();`,
}
const code = codes[which]
const t0 = Date.now()
try {
  const res = await fetch(`http://127.0.0.1:${PORT}/execute`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
    signal: AbortSignal.timeout(40000),
  })
  const text = await res.text()
  console.log(`[${which}] HTTP ${res.status} (${Date.now() - t0}ms)`)
  console.log(text.slice(0, 600))
} catch (e) {
  console.log(`[${which}] FAILED (${Date.now() - t0}ms): ${String(e)}`)
}
