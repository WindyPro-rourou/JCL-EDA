// Dev: single-call probes. API2=pcb_easyeda|pcb_jlceda|pcb_comps|pcb_comps_id
const PORT = process.env.EDA_BRIDGE_PORT ?? '49620'
const which = process.env.API2 ?? 'pcb_easyeda'
const codes = {
  pcb_easyeda: `return await (async () => { const s = await eda.pcb_Net.getNetlist('EasyEDA'); return { len: (s ?? '').length, head: (s ?? '').slice(0, 300) }; })();`,
  pcb_jlceda: `return await (async () => { const s = await eda.pcb_Net.getNetlist('JLCEDA'); return { len: (s ?? '').length, head: (s ?? '').slice(0, 300) }; })();`,
  pcb_comps: `return await (async () => { const c = await eda.pcb_PrimitiveComponent.getAll(); return (c || []).map(x => ({ id: x.getState_PrimitiveId(), d: x.getState_Designator ? x.getState_Designator() : '', x: x.getState_X(), y: x.getState_Y() })); })();`,
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
  console.log(`[${which}] HTTP ${res.status} (${Date.now() - t0}ms)`)
  console.log((await res.text()).slice(0, 900))
} catch (e) {
  console.log(`[${which}] FAILED (${Date.now() - t0}ms): ${String(e)}`)
}
