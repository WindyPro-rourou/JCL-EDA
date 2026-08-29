// Dev probe: what does the official bridge return for the document/project
// file APIs? Used to design the 紧急保存 (snapshot) feature. NOT shipped.
const PORT = process.env.EDA_BRIDGE_PORT ?? '49620'

const code = `
return await (async () => {
  const out = {};
  try { out.project = await eda.dmt_Project.getCurrentProjectInfo(); }
  catch (e) { out.projectError = String(e); }
  try { out.doc = await eda.dmt_SelectControl.getCurrentDocumentInfo(); }
  catch (e) { out.docError = String(e); }
  try {
    const f = await eda.sys_FileManager.getDocumentFile('snapshot-probe');
    if (!f) { out.file = null; }
    else {
      out.file = { name: f.name, size: f.size, type: f.type };
      try { const t = await f.text(); out.textLen = t.length; out.textHead = t.slice(0, 160); }
      catch (e) { out.textError = String(e); }
    }
  } catch (e) { out.fileError = String(e); }
  try {
    const p = await eda.sch_ManufactureData.getExportDocumentFile('snapshot-preview', 'SVG', undefined, 'Current Schematic');
    if (!p) { out.svg = null; } else {
      out.svg = { name: p.name, size: p.size };
      try { const t = await p.text(); out.svgLen = t.length; out.svgHead = t.slice(0, 120); }
      catch (e) { out.svgError = String(e); }
    }
  } catch (e) { out.svgError = String(e); }
  return out;
})();
`

const body = JSON.stringify({ code })
const res = await fetch(`http://127.0.0.1:${PORT}/execute`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body,
  signal: AbortSignal.timeout(60000),
})
const text = await res.text()
console.log('HTTP', res.status)
console.log(text.slice(0, 4000))
