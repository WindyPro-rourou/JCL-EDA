# 给嘉立创官方的 Bug 报告（可直接复制发 Issue）

> 目标仓库：<https://github.com/easyeda/easyeda-api-skill>（Issues 发布）
> 或官方论坛/支持渠道（同文可用）。复现脚本见文末 `## 附录：一键复现脚本`。

---

### [Bug] 官方文档声明的多个 eda.* API 与实现不符（实测：部分层不可创建 / 返回 true 不生效 / 接口挂起 30s）

**环境**
- EasyEDA 专业版（网页版 pro.lceda.cn/editor，2026-08 实测）
- 官方扩展 Run API Gateway（已勾选「允许外部交互」「显示在顶部菜单」）
- 官方桥：easyeda-api-skill v1.1.28 `scripts/bridge-server.mjs`（监听 127.0.0.1:49620，握手 easyeda-bridge）
- 测试工程：esp32_multitool（Board1 / Schematic1 / PCB1）；所有调用均经官方桥 `POST /execute` 单步执行，HTTP 200/500 与超时均有原始返回值记录。

**对照基准**：官方仓库 `easyeda/easyeda-api-skill@main`（SKILL.md metadata.version = 1.1.28）——**当前线上 main 与本报告引用文档逐字节一致**（8 个关键文件已比对 IDENTICAL）。

---

#### 1) `pcb_PrimitiveLine.create`：非铜层全部失败，仅铜层（TOP=1/BOTTOM=2）可用

文档声明（`references/classes/PCB_PrimitiveLine.md` + `references/types/TPCB_LayersOfLine.md`）：

```typescript
function create(
	net: string,
	layer: TPCB_LayersOfLine,   // 联合类型明确含 TOP_SILKSCREEN/TOP_SOLDER_MASK/TOP_PASTE_MASK/
	                            // TOP_ASSEMBLY/BOARD_OUTLINE/DOCUMENT/MECHANICAL/DRILL_DRAWING
	startX: number, startY: number, endX: number, endY: number,
	lineWidth?: number, primitiveLock?: boolean,
): Promise<IPCB_PrimitiveLine | undefined>;
```

最小复现：

```js
await eda.pcb_PrimitiveLine.create('', 3, 1000, 1000, 1200, 1000, 10, false); // TOP_SILKSCREEN
await eda.pcb_PrimitiveLine.create('', 5, 1300, 1000, 1500, 1000, 10, false); // TOP_SOLDER_MASK
await eda.pcb_PrimitiveLine.create('', 7, 1700, 1000, 1900, 1000, 10, false); // TOP_PASTE_MASK
await eda.pcb_PrimitiveLine.create('', 9, 2100, 1000, 2300, 1000, 10, false); // TOP_ASSEMBLY
await eda.pcb_PrimitiveLine.create('', 11, 2300, 1000, 2500, 1000, 10, false); // BOARD_OUTLINE
await eda.pcb_PrimitiveLine.create('', 12, 2700, 1000, 2900, 1000, 10, false); // DOCUMENT
await eda.pcb_PrimitiveLine.create('', 13, 3100, 1000, 3300, 1000, 10, false); // MECHANICAL
```

实测输出（每种均）：`错误：无法创建直线图元，可能是传入的参数不正确。`
同参数 layer=1 / layer=2 创建成功，且 `getState_Layer()` 回读为 1 / 2。

#### 2) `pcb_Document.importChanges()`：返回 `true` 但什么都没导入

文档（`references/classes/PCB_Document.md`）：「Import changes from the schematic」→ `Promise<boolean>`；示例流程 = `dmt_Board.createBoard(schUuid, pcbUuid)` → `openDocument(pcbUuid)` → `importChanges()`。

实测：返回 `true`，但 `pcb_PrimitiveComponent.getAll()` 仍为空；`pcb_Net.getNetlist('JLCEDA')` 的 `components` 仍为空；随后 DRC 报 `Netlist Error: PCB and schematic netlist does not match（Import Changes）`——**该错误即使清空画布后仍残留**（元数据层未清）。

#### 3) `pcb_Net.setNetlist(type, netlist)`：返回 `true` 但不生效

文档（`references/classes/PCB_Net.md`）：「Update the netlist」→ `Promise<boolean>`。

实测：`await eda.pcb_Net.setNetlist('EasyEDA', netlistText)`（netlistText 为 `sch_ManufactureData.getNetlistFile()` 的有效文本）返回 `true`；随后 `pcb_Net.getNetlist('JLCEDA')` 的 components 仍为空。

#### 4) `sch_Netlist.getNetlist()` / `pcb_Net.getNetlist('EasyEDA')` 挂起 30s

文档（`references/classes/SCH_Netlist.md`、`references/classes/PCB_Net.md` + `references/enums/ESYS_NetlistType.md`，枚举含 `'EasyEDA'`、`'JLCEDA'`）：

```typescript
function getNetlist(type?: ESYS_NetlistType): Promise<string>;
```

实测：`pcb_Net.getNetlist('EasyEDA')` 与 `sch_Netlist.getNetlist()` 均 **30s 超时**（桥侧：`Request … timed out after 30000ms`）；仅 `pcb_Net.getNetlist('JLCEDA')` 正常返回。

#### 5) `sch_Drc.check(true, false, true)`：未按文档返回详细数组

文档（`references/classes/SCH_Drc.md` 重载签名的说明）：「includeVerboseError…If it is `true`, the return value will always be an array（`Array<ISCH_DrcError>`）」。

实测返回：`[{"type":"error","count":1},{"type":"warn","count":32}]` —— **只有聚合计数，没有具体违规项**（明细仅存在编辑器 UI 面板）。对照：`pcb_Drc.check(true,false,true)` 能返回嵌套详情（规则/对象/层/间距数值）。

#### 6) `pcb_PrimitiveString.create`：按文档参数调用后挂起

文档（`references/classes/PCB_PrimitiveString.md`）：

```typescript
function create(layer: TPCB_LayersOfImage, x, y, text, fontFamily, fontSize,
	lineWidth, alignMode: EPCB_PrimitiveStringAlignMode, rotation, reverse, expansion, mirror, primitiveLock
): Promise<IPCB_PrimitiveString | undefined>;
```

实测：传入全参数（layer=3 丝印、alignMode=5 CENTER）后 **30s 超时**（无任何返回/错误）。

---

**期望（任一）**
1. 实现与文档声明一致（非铜层可创建 / importChanges 真正导入 / setNetlist 生效 / verbose 返回明细 / String 不挂起）；
2. 或者：在文档中**明确标注**以上能力「不可用/受限」并给出替代 API（现有 "beta preview" 标注只提示"可能变化"，并未说明上述实际行为）。

**附注**
- 全部接口都带官方 `beta preview` 标注，但仅提示"may change"，与"调用即失败/返回 true 无效果/挂起"存在显著差距；
- 以上均在官方桥 v1.1.28 + 官方扩展 Run API Gateway + 网页版专业版（2026-08）上实测，可完整复现。

---

## 附录：一键复现脚本

```js
// Node >= 18。用法：node repro.mjs（bridge 默认 127.0.0.1:49620，需编辑器已连接）
const PORT = 49620;
const run = async (code) => {
  const res = await fetch(`http://127.0.0.1:${PORT}/execute`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }), signal: AbortSignal.timeout(40000),
  });
  const text = await res.text();
  console.log(`--- ${code.slice(0, 60).replace(/\n/g, ' ')}`);
  console.log('HTTP', res.status, '|', text.slice(0, 220));
};

// 1) 非铜层线（先打开一个 PCB 文档）
await run(`return await eda.dmt_EditorControl.openDocument('${process.env.PCB_UUID ?? '<pcb-uuid>'}');`);
await run(`return await eda.pcb_PrimitiveLine.create('', 3, 1000, 1000, 1200, 1000, 10, false);`);
// 2) importChanges（需已用 Board 关联原理图与 PCB）
await run(`return await eda.pcb_Document.importChanges();`);
// 3) setNetlist（先取原理图网表文本）
await run(`return await (async () => { const f = await eda.sch_ManufactureData.getNetlistFile(); return f ? await f.text() : null; })();`);
await run(`return await eda.pcb_Net.setNetlist('EasyEDA', '{"version":"2.0.0","components":{}}');`);
// 4) 挂起类（预计 30s 超时——两种都会挂）
await run(`return await eda.pcb_Net.getNetlist('EasyEDA');`);
await run(`return await eda.sch_Netlist.getNetlist();`);
// 5) DRC verbose
await run(`return await eda.sch_Drc.check(true, false, true);`);
// 6) 丝印文本（预计挂起）
await run(`return await eda.pcb_PrimitiveString.create(3, 1500, 1500, 'JCL', 'Arial', 40, 2, 5, 0, false, 0, false, false);`);
```

> 附：本仓库（dsh 插件 `@windypro-rourou/dsh-eda`）已将此 6 项固化进 `eda_capabilities` 与知识库（实测对照见 `docs/eda-conversation-skill.md` 附五缺陷表），供自动化规避。
