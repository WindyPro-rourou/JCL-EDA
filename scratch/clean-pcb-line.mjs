// Dev: dump + delete all PCB lines (PCB was empty before our tests — safe).
const PORT = process.env.EDA_BRIDGE_PORT ?? '49620'
const code = `return await (async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const out = {};
  await eda.dmt_EditorControl.openDocument('13a43dcf22b6b1b0');
  await sleep(1200);
  const all = await eda.pcb_PrimitiveLine.getAll();
  const arr = Array.isArray(all) ? all : (all ? [all] : []);
  out.total = arr.length;
  out.dump = arr.map(x => {
    const d = {};
    for (const k of ['getState_PrimitiveId','getState_Net','getState_StartX','getState_EndX','getState_Layer']) {
      try { d[k] = typeof x[k] === 'function' ? x[k]() : 'n/a'; } catch (e) { d[k] = 'ERR'; }
    }
    return d;
  });
  if (arr.length) {
    const ids = arr.map(x => x.getState_PrimitiveId());
    try { out.del = await eda.pcb_PrimitiveLine.delete(ids); } catch (e) { out.del = 'ERR:' + String(e).slice(0, 100); }
  }
  await sleep(600);
  try { out.saved = await eda.pcb_Document.save(); } catch (e) { out.saveErr = String(e); }
  await sleep(600);
  try { const a = await eda.pcb_PrimitiveLine.getAll(); out.after = Array.isArray(a) ? a.length : '?'; } catch (e) { out.after = 'ERR:' + String(e).slice(0, 80); }
  await eda.dmt_EditorControl.openDocument('2dd115fe3f36aaaa');
  return out;
})();`
const res = await fetch(`http://127.0.0.1:${PORT}/execute`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ code }),
  signal: AbortSignal.timeout(90000),
})
console.log('HTTP', res.status)
console.log((await res.text()).slice(0, 2500))
