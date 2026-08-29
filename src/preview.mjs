// 快速 SVG 预览渲染（仅为几何目检，非交付物）
import fs from 'node:fs'

const demo = JSON.parse(fs.readFileSync('F:/dsh-lichuang/src/output/demo.json', 'utf8'))

// 收集元素
const els = []
for (const s of demo.shape) {
  const [cmd, ...f] = s.split('~')
  if (cmd === 'LIB') {
    const [head, ...children] = s.split('#@$')
    const hf = head.split('~')
    const lx = Number(hf[1])
    const ly = Number(hf[2])
    const texts = []
    for (const c of children) {
      const cf = c.split('~')
      if (c.startsWith('T~P')) texts.push({ t: cf[12], x: Number(cf[2]) - 20, y: Number(cf[3]), color: '#000080', cls: 'ref' })
      else if (c.startsWith('T~N')) texts.push({ t: cf[12], x: Number(cf[2]) - 20, y: Number(cf[3]), color: '#000080', cls: 'val' })
      else if (c.startsWith('R~')) els.push({ kind: 'rect', x: Number(cf[1]), y: Number(cf[2]), w: Number(cf[5]), h: Number(cf[6]) })
      else if (c.startsWith('PL~')) {
        const pts = cf[1].split(' ').map(Number)
        for (let i = 0; i + 3 < pts.length + 1; i += 2) {
          if (i + 3 < pts.length) els.push({ kind: 'line', x1: pts[i], y1: pts[i + 1], x2: pts[i + 2], y2: pts[i + 3] })
        }
      }
      else if (c.startsWith('P~')) {
        const secs = c.split('^^')
        const [dx, dy] = secs[1].split('~').map(Number)
        const pf = secs[0].split('~')
        els.push({ kind: 'dot', x: dx, y: dy, label: `p${pf[3]}` })
      }
    }
    els.push(...texts.map((t) => ({ kind: 'text', ...t })))
    void lx; void ly
  } else if (cmd === 'W') {
    const pts = f[1].split(' ').map(Number)
    for (let i = 0; i + 3 < pts.length; i += 2) {
      els.push({ kind: 'wire', x1: pts[i], y1: pts[i + 1], x2: pts[i + 2], y2: pts[i + 3] })
    }
  } else if (cmd === 'N') {
    els.push({ kind: 'nettext', x: Number(f[8]), y: Number(f[9]), t: f[5] })
  } else if (cmd === 'F') {
    const secs = s.split('^^')
    const [dx, dy] = secs[1].split('~').map(Number)
    const mf = secs[2].split('~')
    els.push({ kind: 'dot', x: dx, y: dy, label: '' })
    els.push({ kind: 'nettext', x: Number(mf[2]), y: Number(mf[3]), t: mf[0] })
    for (const pl of secs.slice(3)) {
      const plf = pl.split('~')
      const pts = plf[1].split(' ').map(Number)
      els.push({ kind: 'gndline', x1: pts[0], y1: pts[1], x2: pts[2], y2: pts[3] })
    }
  }
}

const W = 900
const H = 620
const x0 = 230
const y0 = 160
const sx = (x) => x0 + x
const sy = (y) => y0 + y
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
svg += `<rect x="0" y="0" width="${W}" height="${H}" fill="#fcfcfc"/>`
for (const e of els) {
  if (e.kind === 'rect') svg += `<rect x="${sx(e.x)}" y="${sy(e.y)}" width="${e.w}" height="${e.h}" fill="none" stroke="#000" stroke-width="2"/>`
  if (e.kind === 'line') svg += `<line x1="${sx(e.x1)}" y1="${sy(e.y1)}" x2="${sx(e.x2)}" y2="${sy(e.y2)}" stroke="#A00000" stroke-width="2"/>`
  if (e.kind === 'wire') svg += `<line x1="${sx(e.x1)}" y1="${sy(e.y1)}" x2="${sx(e.x2)}" y2="${sy(e.y2)}" stroke="#0099FF" stroke-width="2.5"/>`
  if (e.kind === 'gndline') svg += `<line x1="${sx(e.x1)}" y1="${sy(e.y1)}" x2="${sx(e.x2)}" y2="${sy(e.y2)}" stroke="#000" stroke-width="1.6"/>`
  if (e.kind === 'dot') {
    svg += `<circle cx="${sx(e.x)}" cy="${sy(e.y)}" r="4" fill="#880000"/>`
    if (e.label) svg += `<text x="${sx(e.x) + 6}" y="${sy(e.y) - 6}" font-size="10" fill="#880000">${e.label}</text>`
  }
  if (e.kind === 'text') svg += `<text x="${sx(e.x)}" y="${sy(e.y)}" font-size="13" fill="${e.color}" font-weight="bold">${e.t}</text>`
  if (e.kind === 'nettext') svg += `<text x="${sx(e.x)}" y="${sy(e.y)}" font-size="13" fill="#880000">${e.t}</text>`
}
svg += '</svg>'
fs.writeFileSync('F:/dsh-lichuang/src/output/preview.svg', svg)
console.log('preview.svg written, elements:', els.length)
