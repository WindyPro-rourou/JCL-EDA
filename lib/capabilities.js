/**
 * dsh-lichuang-eda — 官方 API 能力清单（eda_capabilities 工具数据源）。
 *
 * 从官方文档（~/.dsh/eda/bridge/references/classes/*）与真机实测（esp32_multitool
 * 全流程/14 大类/完整 demo）整理：告诉 agent「官方 eda.* API 能做什么、怎么调用、
 * 有什么坑」。agent 不确定能力时调用 eda_capabilities 即可获得结构化清单。
 *
 * 仅收录实测/官方文档确认可用的核心能力；标注 ⚠ 的为已知不可靠项。
 */
export const CAPABILITIES = [
  {
    domain: 'dmt_Project',
    note: '工程级（当前焦点工程）',
    methods: [
      { name: 'getCurrentProjectInfo()', desc: '读当前工程（名称/图页/PCB 树 + titleBlockData.Width/Height 页面尺寸）' },
      { name: 'openProject(uuid)', desc: '打开指定工程（会丢未保存改动）' },
    ],
  },
  {
    domain: 'dmt_SelectControl / dmt_EditorControl',
    note: '文档状态与视口',
    methods: [
      { name: 'getCurrentDocumentInfo()', desc: '当前文档 documentType（1=原理图/3=PCB）/uuid/tabId——**任何操作前先确认**' },
      { name: 'openDocument(uuid)', desc: '打开图页/PCB，返回 tabId（切换后等 1~1.5s）' },
      { name: 'activateDocument(tabId)', desc: '激活已开标签' },
      { name: 'zoomToAllPrimitives()', desc: '缩放到全部图元（截图前必调）' },
      { name: 'getCurrentRenderedAreaImage(tabId)', desc: '截图返回 Blob（→arrayBuffer→base64→PNG）' },
    ],
  },
  {
    domain: 'lib_Device',
    note: '系统库搜索（结果可直接喂 create）',
    methods: [
      { name: 'search(keyword)', desc: '英文关键词（R0402/LED/10K/S8050/ESP32/BUZZER/PTC…）→ 器件数组' },
      { name: 'searchByProperties({supplierId})', desc: '按立创 C 编号精确搜索' },
    ],
  },
  {
    domain: 'sch_PrimitiveComponent',
    note: '原理图元件（单位 10mil，A4≈1170×825）',
    methods: [
      { name: 'create(dev, x, y, …)', desc: '放元件（dev=search 结果或 {libraryUuid,uuid}）；**先 eda_pick_spot 定位再放**' },
      { name: 'createNetFlag(type, net, x, y)', desc: "网络标志：'Power'/'Ground'/'AnalogGround'/'ProtectGround'" },
      { name: 'createNetPort(type, net, x, y)', desc: "网络端口：'IN'/'OUT'/'BI'" },
      { name: 'getAllPinsByPrimitiveId(id)', desc: '取真实引脚坐标（连线前必调，只连引脚）' },
      { name: 'delete(ids)', desc: '删除（与导线分开调用，勿混传）' },
      { name: 'modify(id, prop)', desc: '改属性（改后重新 get 读最新）' },
    ],
  },
  {
    domain: 'sch_PrimitiveWire',
    note: '原理图导线',
    methods: [
      { name: 'create(line, net?, color?, width?, type?)', desc: '画线：line 为水平/垂直段数组；net 指定网络名；端点落引脚才连通' },
      { name: 'delete(ids)', desc: '删除导线' },
    ],
  },
  {
    domain: 'sch_Document / sch_Drc / sch_ManufactureData',
    note: '保存/校验/导出',
    methods: [
      { name: 'sch_Document.save()', desc: '保存当前原理图（每步后必调，失败返回 false）' },
      { name: 'sch_Drc.check(true, false, true)', desc: 'DRC **必须 verbose 重载**；返回聚合 [{type,count}]（明细在 UI 面板）' },
      { name: 'getNetlistFile()', desc: '导出网表：返回 **File 对象，须 await f.text()**（直接返回会变 {}）' },
      { name: 'getBomFile()', desc: '导出 BOM：**二进制 xlsx**，arrayBuffer→base64 处理' },
    ],
  },
  {
    domain: 'pcb_PrimitiveComponent / pcb_PrimitiveVia / pcb_PrimitiveLine',
    note: 'PCB 图元（单位 1mil，居中布件）',
    methods: [
      { name: 'pcb_PrimitiveComponent.create(dev, 1, x, y)', desc: '放元件（layer 1=TOP）；get(id)→getAllPins() 取焊盘坐标' },
      { name: 'pcb_PrimitiveVia.create(net, x, y, hole, dia)', desc: '过孔（网络名直给）' },
      { name: 'pcb_PrimitiveLine.create(net, 1, x1,y1,x2,y2, width)', desc: '走线（TOP 层）；焊盘间连线的正解' },
      { name: 'pcb_Document.save()', desc: '保存 PCB（每步后必调）' },
    ],
  },
  {
    domain: 'pcb_Drc / pcb_Net',
    note: 'PCB 校验与网表（⚠ 部分受限）',
    methods: [
      { name: 'pcb_Drc.check(true, false, true)', desc: 'DRC 详细数组（规则/对象/层/间距数值）——真实可用' },
      { name: "pcb_Net.getNetlist('JLCEDA')", desc: '读 PCB 网表（组件数/网络）——JLCEDA 格式可用；"EasyEDA" 格式会挂起，禁用' },
      { name: 'pcb_Document.importChanges()', desc: '⚠ 实测返回 true 但元件不进画布/网表不变并留 Netlist Error——勿用于画 PCB' },
      { name: 'pcb_Net.setNetlist(type, text)', desc: '⚠ 实测返回 true 但不生效——勿依赖' },
    ],
  },
  {
    domain: 'sys_FileManager / 快照链路',
    note: '文档导出与本地留档',
    methods: [
      { name: 'sys_FileManager.getDocumentFile(name)', desc: '导出当前文档 .epro2（专业版原生，zip, File→text）——紧急保存核心' },
      { name: 'sch_ManufactureData.getExportDocumentFile(name,\'SVG\',…)', desc: '导出当前图页 SVG 通用预览' },
    ],
  },
  {
    domain: '已知边界',
    note: '官方 API 缺陷清单（实测）',
    methods: [
      { name: 'PCB 板框 / 非铜层', desc: '板框 layer=11 无绘制入口；pcb_PrimitiveLine 非铜层（丝印/阻焊/机械等）实测失败——但 BOTTOM(2) 底层实测可用（双层走线 OK）；丝印文本 API 实测挂起' },
      { name: 'sch_Netlist.getNetlist()', desc: '挂起 30s——用 sch_ManufactureData.getNetlistFile()' },
      { name: 'getAll()', desc: '间歇性报错——重试 3 次（间隔 700ms）' },
      { name: 'PCB 电气级连网', desc: '直放元件焊盘无网络；网表同步链路不可靠——画布级可用，DRC 可能报 SMD Pad to Track' },
    ],
  },
]
