// Dev: inspect PCB netlist with explicit type + PCB primitive components.
const PORT = process.env.EDA_BRIDGE_PORT ?? '49620'
const code = `return await (async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const out = {};
  await eda.dmt_EditorControl.openDocument('13a43dcf22b6b1b0');
  await sleep(1500);
  try { const s = await eda.pcb_Net.getNetlist('EasyEDA'); out.easyeda = { len: (s ?? '').length, head: (s ?? '').slice(0, 400) }; }
  catch (e) { out.easyedaError = String(e).slice(0, 200); }
  try { const s = await eda.pcb_Net.getNetlist('JLCEDA'); out.jlceda = { len: (s ?? '').length, head: (s ?? '').slice(0, 300) }; }
  catch (e) { out.jlcedaError = String(e).slice(0, 200); }
  try { const comps = await eda.pcb_PrimitiveComponent.getAll(); out.pcbComps = (comps || []).map(c => ({ id: c.getState_PrimitiveId(), d: c.getState_Designator ? c.getState_Designator() : '', x: c.getState_X(), y: c.getState_Y() })); }
  catch (e) { out.pcbCompsError = String(e).slice(0, 200); }
  return out;
})();`
const res = await fetch(`http://127.0.0.1:${PORT}/execute`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ code }),
  signal: AbortSignal.timeout(60000),
})
console.log('HTTP', res.status)
console.log((await res.text()).slice(0, 2000))
