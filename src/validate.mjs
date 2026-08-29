// 严格结构校验：demo.json 与真实 v6 导出样本（KiCad QA 数据）逐模式比对
import fs from 'node:fs'

const demo = JSON.parse(fs.readFileSync('F:/dsh-lichuang/src/output/demo.json', 'utf8'))
const real = JSON.parse(
  fs.readFileSync('F:/dsh-lichuang/docs/ref/SCH_ESP32-PICO-D4_smart_watch_2023-09-02.json', 'utf8'),
)
const realSheet = real.schematics[0].dataStr

let pass = 0
let fail = 0
const check = (name, cond, detail = '') => {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name} ${detail}`)
  }
}

console.log('== 顶层键比对（demo vs 真实 v6 平面单片 dataStr）==')
const realKeys = Object.keys(realSheet).sort().join(',')
const demoKeys = Object.keys(demo).sort().join(',')
console.log('  真实 dataStr 键:', realKeys)
console.log('  demo 键:       ', demoKeys)
check('顶层键一致', demoKeys === realKeys)

console.log('\n== head 字段比对 ==')
const realHeadKeys = Object.keys(realSheet.head).sort().join(',')
const demoHeadKeys = Object.keys(demo.head).sort().join(',')
console.log('  真实 head 键:', realHeadKeys)
console.log('  demo head 键:', demoHeadKeys)
check('head 键一致', demoHeadKeys === realHeadKeys)
check('docType = "1"', demo.head.docType === '1', `got ${demo.head.docType}`)
check('editorVersion 存在', /^\d+\.\d+\.\d+$/.test(demo.head.editorVersion))
check('uuid 为 32 位 hex', /^[0-9a-f]{32}$/.test(demo.head.uuid), demo.head.uuid)

console.log('\n== canvas 比对 ==')
check('canvas 以 CA~ 开头', demo.canvas.startsWith('CA~'))
const realCanvasFields = realSheet.canvas.split('~')
const demoCanvasFields = demo.canvas.split('~')
check('canvas 段数一致 (15)', demoCanvasFields.length === 15, `demo=${demoCanvasFields.length} real=${realCanvasFields.length}`)
check('canvas 单位字段 pixel', demoCanvasFields[11] === 'pixel')

console.log('\n== shape 条目格式 ==')
const shapePrefixes = {}
for (const s of demo.shape) shapePrefixes[s.split('~')[0]] = (shapePrefixes[s.split('~')[0]] || 0) + 1
check('包含 2 个 LIB', shapePrefixes.LIB === 2, JSON.stringify(shapePrefixes))
check('包含 1 个 W', shapePrefixes.W === 1)
check('包含 1 个 N', shapePrefixes.N === 1)
check('包含 1 个 F', shapePrefixes.F === 1)

for (const s of demo.shape) {
  const [cmd] = s.split('~')
  if (cmd === 'W') {
    const fields = s.split('~')
    check('W: 8 段', fields.length === 8, `len=${fields.length}`)
    check('W: 坐标为偶数个', (fields[1].split(' ').length % 2) === 0)
    check('W: 无 NaN', !fields[1].includes('NaN'))
    check('W: 颜色 #0099FF', fields[2] === '#0099FF')
    check('W: 尾部 locked=0', fields[7] === '0')
  } else if (cmd === 'N') {
    const f = s.split('~')
    check('N: 13 段', f.length === 13, `len=${f.length}`)
    check('N: 名称非空', f[5].length > 0)
    check('N: 对齐 start', f[7] === 'start')
    check('N: 字体 Times New Roman', f[10] === 'Times New Roman')
  } else if (cmd === 'F') {
    check('F: 含 ^^ 分段', s.includes('^^'))
    check('F: GND 标志 partid', s.startsWith('F~part_netLabel_gnD~'))
    check('F: 含 flag_ id', s.includes('flag_'))
    check('F: 含 5 条 PL 图形', (s.match(/\^\^PL~/g) || []).length === 5)
    check('F: 图形填充 transparent', s.includes('~transparent~'))
  } else if (cmd === 'LIB') {
    const [head, ...children] = s.split('#@$')
    const f = head.split('~')
    check('LIB: 头 ≥6 段', f.length >= 6, `len=${f.length}`)
    check('LIB: c_para 用反引号', f[3].includes('`'))
    check('LIB: 5~6 个子图形', children.length >= 5 && children.length <= 6, `n=${children.length}`)
    const childPrefixes = children.map((c) => c.split('~')[0]).join(',')
    check(
      'LIB: 子图形为 T,T,<图形>,P,P 结构',
      childPrefixes.startsWith('T,T,') && childPrefixes.endsWith(',P,P'),
      childPrefixes,
    )
    for (const c of children) {
      if (c.startsWith('P~')) {
        const secs = c.split('^^')
        check('引脚: 7 段', secs.length === 7, `n=${secs.length}`)
        check('引脚: 头部 P~show~', secs[0].startsWith('P~show~'))
        check('引脚: 引脚点与头部坐标一致', secs[1].split('~')[0] === secs[0].split('~')[4], `${secs[1]} vs ${secs[0]}`)
        check('引脚: path 段含颜色', secs[2].includes('~#880000'))
        check('引脚: 名称段 9 字段', secs[3].split('~').length === 9, `n=${secs[3].split('~').length}`)
      } else if (c.startsWith('T~')) {
        check('文本: mark 为 P/N', ['P', 'N'].includes(c.split('~')[1]))
        check('文本: 尾部 pinpart', c.endsWith('pinpart'))
      }
    }
  }
}

console.log(`\n== 结果: ${pass} 通过, ${fail} 失败 ==`)
process.exit(fail > 0 ? 1 : 0)
