// Dev: open PCB1 → verbose PCB DRC → back to P1.
const PORT = process.env.EDA_BRIDGE_PORT ?? '49620'
const code = `return await (async () => {
  const pcb = '13a43dcf22b6b1b0';
  await eda.dmt_EditorControl.openDocument(pcb);
  await new Promise(r => setTimeout(r, 1500));
  const info = await eda.dmt_SelectControl.getCurrentDocumentInfo();
  const violations = await eda.pcb_Drc.check(true, false, true);
  const page = '2dd115fe3f36aaaa';
  await eda.dmt_EditorControl.openDocument(page);
  await new Promise(r => setTimeout(r, 800));
  return { docInfo: info, violations };
})();`
const res = await fetch(`http://127.0.0.1:${PORT}/execute`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ code }),
  signal: AbortSignal.timeout(60000),
})
console.log('HTTP', res.status)
console.log((await res.text()).slice(0, 1500))
