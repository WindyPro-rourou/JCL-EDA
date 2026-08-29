// Dev fix experiment: importChanges → push schematic netlist into PCB via
// pcb_Net.setNetlist → verify PCB netlist + DRC Netlist Error disappears.
const PORT = process.env.EDA_BRIDGE_PORT ?? '49620'

const code = `return await (async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const out = {};

  // 1) schematic netlist text (the fast File-based API)
  await eda.dmt_EditorControl.openDocument('2dd115fe3f36aaaa');
  await sleep(1200);
  const f = await eda.sch_ManufactureData.getNetlistFile();
  const netlistText = f ? await f.text() : null;
  out.netlistLen = (netlistText ?? '').length;
  out.netlistHead = (netlistText ?? '').slice(0, 120);

  // 2) open PCB, push netlist
  await eda.dmt_EditorControl.openDocument('13a43dcf22b6b1b0');
  await sleep(1200);
  try {
    out.setResult = await eda.pcb_Net.setNetlist('EasyEDA', netlistText);
  } catch (e) { out.setError = String(e).slice(0, 200); }
  await sleep(800);

  // 3) verify PCB netlist now has components
  try { out.pcbNetAfter = (await eda.pcb_Net.getNetlist()).slice(0, 300); }
  catch (e) { out.getError = String(e).slice(0, 200); }
  await sleep(400);

  // 4) DRC again
  try { out.drc = await eda.pcb_Drc.check(true, false, true); }
  catch (e) { out.drcError = String(e).slice(0, 200); }

  // 5) save & back to schematic
  await eda.pcb_Document.save();
  await sleep(600);
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
console.log((await res.text()).slice(0, 1500))
