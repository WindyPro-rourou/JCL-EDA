// 连通性 + 工程包装校验
import fs from 'node:fs'

const demo = JSON.parse(fs.readFileSync('F:/dsh-lichuang/src/output/demo.json', 'utf8'))
const proj = JSON.parse(fs.readFileSync('F:/dsh-lichuang/src/output/demo-project.json', 'utf8'))
const real = JSON.parse(
  fs.readFileSync('F:/dsh-lichuang/docs/ref/SCH_ESP32-PICO-D4_smart_watch_2023-09-02.json', 'utf8'),
)

let pass = 0
let fail = 0
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name} ${detail}`) }
}

console.log('== 工程包装 (docType=5) 与真实导出比对 ==')
console.log('  真实顶层键:', Object.keys(real).sort().join(','))
console.log('  包装顶层键:', Object.keys(proj).sort().join(','))
check('包装顶层键一致', Object.keys(proj).sort().join(',') === Object.keys(real).sort().join(','))
check('docType=5', proj.docType === 5)
check('schematics 单页', proj.schematics.length === 1)
check('sheet.docType="1"', proj.schematics[0].docType === '1')
check('sheet.dataStr 与 demo 一致', JSON.stringify(proj.schematics[0].dataStr) === JSON.stringify(demo))
check('editorVersion 与 sheet.head 一致', proj.editorVersion === demo.head.editorVersion)

console.log('\n== 连通性：元件引脚点 / 导线端点 / 网络点 必须重合 ==')
// 收集引脚点
const pinDots = new Set()
for (const s of demo.shape) {
  if (s.startsWith('LIB~')) {
    for (const c of s.split('#@$')) {
      if (c.startsWith('P~')) {
        const dot = c.split('^^')[1] // x~y
        pinDots.add(dot)
        console.log(`  LIB 引脚点: ${dot}`)
      }
    }
  }
}
// 收集导线端点（首尾）
const wireEnds = new Set()
for (const s of demo.shape) {
  if (s.startsWith('W~')) {
    const pts = s.split('~')[1].split(' ')
    const first = `${pts[0]}~${pts[1]}`
    const last = `${pts[pts.length - 2]}~${pts[pts.length - 1]}`
    wireEnds.add(first)
    wireEnds.add(last)
    console.log(`  W 端点: ${first} / ${last}`)
  }
}
// 收集网络点
const netDots = new Set()
for (const s of demo.shape) {
  if (s.startsWith('N~')) {
    netDots.add(`${s.split('~')[1]}~${s.split('~')[2]}`)
    console.log(`  N 网络标签点: ${s.split('~')[1]}~${s.split('~')[2]} (${s.split('~')[5]})`)
  }
  if (s.startsWith('F~')) {
    netDots.add(s.split('^^')[1])
    console.log(`  F 接地标志点: ${s.split('^^')[1]} (GND)`)
  }
}
// 每个网络点必须落在某引脚点或导线端点上
let allConnected = true
for (const nd of netDots) {
  const ok = pinDots.has(nd) || wireEnds.has(nd)
  if (!ok) allConnected = false
  check(`网络点 ${nd} 与引脚/导线连通`, ok)
}
// 每个引脚点必须被导线端点或网络点覆盖
for (const pd of pinDots) {
  const ok = wireEnds.has(pd) || netDots.has(pd)
  if (!ok) allConnected = false
  check(`引脚点 ${pd} 有导线/网络接入`, ok)
}
check('全部连通', allConnected)

console.log(`\n== 结果: ${pass} 通过, ${fail} 失败 ==`)
process.exit(fail > 0 ? 1 : 0)
