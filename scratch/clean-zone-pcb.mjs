// Dev zone cleanup — part2: PCB (list → delete → verify).
const PORT = process.env.EDA_BRIDGE_PORT ?? '49620'
const code = `return await (async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const out = {};
  await eda.dmt_EditorControl.openDocument('13a43dcf22b6b1b0');
  await sleep(1200);
  const list = async (label, api, filter) => {
    try {
      const all = await eda[api].getAll();
      const arr = Array.isArray(all) ? all : (all ? [all] : []);
      const test = arr.filter(filter);
      out[label + 'Total'] = arr.length;
      out[label + 'List'] = test.map(x => ({ id: x.getState_PrimitiveId(), d: (x.getState_Designator ? x.getState_Designator() : '') || x.getState_Net?.() || '', x: x.getState_X(), y: x.getState_Y() }));
      if (test.length) {
        const ids = test.map(x => x.getState_PrimitiveId());
        try { out[label + 'Del'] = await eda[api].delete(ids); }
        catch (e) { out[label + 'Del'] = 'ERR:' + String(e).slice(0, 100); }
        if (out[label + 'Del'] === false) {
          out[label + 'DelOne'] = [];
          for (const id of ids) { try { out[label + 'DelOne'].push({ id, ok: await eda[api].delete(id) }); } catch (e) { out[label + 'DelOne'].push({ id, err: String(e).slice(0, 60) }); } }
        }
      }
    } catch (e) { out[label + 'Err'] = String(e).slice(0, 200); }
  };
  await list('pcbComps', 'pcb_PrimitiveComponent', (x) => { try { return x.getState_X() >= 900; } catch { return false; } });
  await list('pcbVias', 'pcb_PrimitiveVia', (x) => { try { return x.getState_X() >= 900; } catch { return false; } });
  await list('pcbLines', 'pcb_PrimitiveLine', (x) => { try { return x.getState_StartX() >= 900 || x.getState_EndX() >= 900; } catch { return false; } });
  await sleep(800);
  try { out.saved = await eda.pcb_Document.save(); } catch (e) { out.saveErr = String(e); }
  await sleep(800);
  // verify
  try { const c = await eda.pcb_PrimitiveComponent.getAll(); out.afterComps = Array.isArray(c) ? c.length : '?'; } catch (e) { out.afterComps = 'ERR:' + String(e).slice(0, 80); }
  try { const v = await eda.pcb_PrimitiveVia.getAll(); out.afterVias = Array.isArray(v) ? v.length : '?'; } catch (e) { out.afterVias = 'ERR:' + String(e).slice(0, 80); }
  await eda.dmt_EditorControl.openDocument('2dd115fe3f36aaaa');
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
