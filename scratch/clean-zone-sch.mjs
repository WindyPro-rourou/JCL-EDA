// Dev zone cleanup — part1: schematic (list → delete → verify).
const PORT = process.env.EDA_BRIDGE_PORT ?? '49620'
const code = `return await (async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const out = {};
  await eda.dmt_EditorControl.openDocument('2dd115fe3f36aaaa');
  await sleep(1200);
  let comps = null; let wires = null;
  try { comps = await eda.sch_PrimitiveComponent.getAll(); } catch (e) { out.compsErr = String(e); }
  try { wires = await eda.sch_PrimitiveWire.getAll(); } catch (e) { out.wiresErr = String(e); }
  if (comps) {
    const arr = Array.isArray(comps) ? comps : [comps];
    out.totalComps = arr.length;
    const test = arr.filter(c => { try { return c.getState_X() >= 2500; } catch { return false; } });
    out.testComps = test.map(c => ({ id: c.getState_PrimitiveId(), d: (c.getState_Designator ? c.getState_Designator() : '') || '?', t: c.getState_ComponentType ? c.getState_ComponentType() : '', x: c.getState_X(), y: c.getState_Y() }));
    if (out.testComps.length) {
      const ids = out.testComps.map(c => c.id);
      try { out.delBatch = await eda.sch_PrimitiveComponent.delete(ids); } catch (e) { out.delBatch = 'ERR:' + String(e).slice(0, 100); }
      if (out.delBatch === false) {
        out.delOne = [];
        for (const id of ids) { try { out.delOne.push({ id, ok: await eda.sch_PrimitiveComponent.delete(id) }); } catch (e) { out.delOne.push({ id, err: String(e).slice(0, 60) }); } }
      }
    }
  }
  if (wires) {
    const arr = Array.isArray(wires) ? wires : [wires];
    out.totalWires = arr.length;
    const test = arr.filter(w => { try { return Math.max.apply(null, w.getState_Line()) >= 2500; } catch { return false; } });
    out.testWires = test.map(w => ({ id: w.getState_PrimitiveId(), line: w.getState_Line() }));
    if (out.testWires.length) {
      const ids = out.testWires.map(w => w.id);
      try { out.delWireBatch = await eda.sch_PrimitiveWire.delete(ids); } catch (e) { out.delWireBatch = 'ERR:' + String(e).slice(0, 100); }
    }
  }
  await sleep(600);
  try { out.saved = await eda.sch_Document.save(); } catch (e) { out.saveErr = String(e); }
  await sleep(600);
  let comps2 = null;
  try { comps2 = await eda.sch_PrimitiveComponent.getAll(); } catch { /* ignore */ }
  out.afterComps = comps2 ? (Array.isArray(comps2) ? comps2.length : 1) : 'ERR';
  return out;
})();`
const res = await fetch(`http://127.0.0.1:${PORT}/execute`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ code }),
  signal: AbortSignal.timeout(120000),
})
console.log('HTTP', res.status)
console.log((await res.text()).slice(0, 5000))
