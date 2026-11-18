---
name: jcl-eda
metadata:
  version: 1.0.0
  author: WindyPro-rourou / JCL-EDA
description: >
  嘉立创 EDA（EasyEDA Pro）实时自动化：三档官方接入自动择优（桌面客户端内置
  MCP 常驻服务 ≈65ms/次 → 内置 CLI ≈3s/次 → 网页版官方桥 + Run API Gateway 自动回退），
  24 个 DSH 工具覆盖放件/连线/网络标志/DRC/网表/BOM/打样交付包/原理图转 PCB/框内定位/
  现场截图/紧急保存；并附官方 eda.* API 真机踩坑（坐标单位、必须先开文档再 getAll、
  复杂页 create 慢 80 倍、importChanges 不可用、位号不自动分配、DRC 不幂等、
  原理图→PCB 需 component.name→search、MCP 调用形态等）。
  当任务涉及「嘉立创 EDA / 立创EDA / EasyEDA / 画原理图 / 画 PCB / 放元件 / 连线 /
  DRC / 网表 / BOM / Gerber / 打样 / 自动布线 / 操作我的画板」时使用。
---

# 嘉立创 EDA 实时自动化（jcl-eda）

> 全部结论来自真机实测（客户端 4.1.78 + 官方扩展栈）。**先读第 1、2 节跑通接入，再照第 6 节的铁律干活。**

| | |
|---|---|
| 插件包 | `@windypro-rourou/dsh-eda`（仓库 `WindyPro-rourou/JCL-EDA`） |
| 工具面 | 24 个 `eda_*` DSH 工具 + Web GUI 侧栏面板（时间线/撤回/紧急保存） |
| 官方依赖 | 桌面客户端内置 CLI/MCP；或网页版 + 官方扩展 [Run API Gateway](https://jlc-ext.com/item/oshwhub/run-api-gateway) |
| 仅官方 | 无任何第三方后端（easyeda-agent / jlcmcp / easyeda-mcp-pro 均不使用） |

> **配套技能**：`easyeda-pcb-flow` 管**板级工艺**（布局均衡、45° 走线、自动布线分批、GND 环形地线、外壳对齐）；
> 本 skill 管**接入与 API 驱动**（三档后端、工具用法、内联代码与 schema 约束）。两者配合使用。

---

## 1. 三档接入（自动择优，工具/面板对后端无感）

| 档位 | 条件 | 实测每次调用 | 底层 |
|---|---|---|---|
| **official-mcp-http**（首选） | 桌面客户端 **v4.1.60+** | **55–92ms**（中位 65ms） | `lceda-pro --mcp http --port 49630`（插件自动常驻托管） |
| official-cli | 桌面客户端 v4.1.60+ | 2.9–5s | `lceda-pro invoke --session <id> --ext-uuid eda --code …`（Electron 冷启动开销） |
| official-easyeda-bridge（回退） | 浏览器/在线版 | ≈300ms | 官方 Bridge Server（49620–49629）+ 扩展 Run API Gateway |

**硬约束**：CLI/MCP **只支持桌面客户端**；浏览器/在线版必须用桥 + 扩展。未装客户端时插件自动走桥，行为不变。

### 1.1 双后端互备规则（桌面 MCP/CLI ↔ 网页桥）

- **auto（默认）**：按 `mcp → cli → bridge` 依次探测，**谁真的连着就用谁**。
  桌面客户端装了但没开 → 自动走网页桥；网页编辑器没开 → 自动用桌面 MCP。
- **执行期失败转移**：只有「未连接 / 没有可用编辑器会话 / 未找到 CLI / MCP 未启动」这类**连接性**错误才换下一档重试一次（此时代码根本没执行，安全）。
  **业务错误（代码跑了但抛错）绝不重试**——否则会重复放元件/走线。
- **桥的连接语义**：`/health` 的 `edaConnected` 才代表「编辑器已连」；只有 `service:easyeda-bridge` 表示仅服务在跑（状态 `idle`，执行必失败）。插件已按此区分，不要被「服务在跑」误导。
- **状态自检**：`eda_status` 的 `modes` 字段同时给出三档 `{available, connected, port, sessionId, error}`；面板连接卡有「桌面 MCP / 桌面 CLI / 网页桥」三档灯。

### 覆盖与探测
- `config.backendPrefer = auto | mcp | cli | bridge`；环境变量 `DSH_EDA_BACKEND` 同义。
- `DSH_EDA_CLI` / `LCEDA_PRO_BIN` 可直接指定可执行文件（自定义安装位置就靠它）。
- 自动探测顺序：环境变量 → `PATH` → **逐盘符 × 常见目录**（含 `lichuang_eda/lceda-pro`、`Program Files/…`）→ Windows 注册表 `InstallLocation`。
- 国内版 `lceda-pro`，国际版 `easyeda-pro`。

### 首次接入自检（按顺序）
```bash
lceda-pro --help            # 第一行是版本，要求 ≥ 4.1.60
lceda-pro doctor            # {ok, value:{connected, endpoint, bridgeVersion, versionMatch, resultChannel}}
                            # connected:false = 没有正在运行的编辑器窗口（打开任意工程窗口即可）
lceda-pro session list      # 每个编辑器窗口 = 一个会话（origin: cli | user）
```
- **`doctor` 约 7.6 秒**（贵）→ 只在启动/连接时调一次并缓存；**`session list` 约 15ms**（便宜）→ 状态轮询用它。
- 插件侧等价自检：`eda_status`（看 `backend` / `connected` / `sessionId` / `modes`）。

---

## 2. 工具地图（24 个）

| 分组 | 工具 | 用途 |
|---|---|---|
| 状态与接入 | `eda_status` · `eda_backend_connect` · `eda_bridge_install` | 看接入档位/连接；拉起会话或桥；装网页版官方桥 |
| 放置与连线 | `eda_place` · `eda_wire` · `eda_netflag` · `eda_pick_spot` | 搜库放件（返回引脚）· 引脚级连线 · 电源/地标志 · **框内空位定位** |
| 校验与导出 | `eda_sch_drc` · `eda_get_netlist` · `eda_get_bom` · `eda_export` · `eda_verify` | DRC（含明细）· 网表 · BOM · **打样交付包**（Gerber/BOM/坐标/信息）· 一键验收 |
| 画板认知 | `eda_board_overview` · `eda_exec` · `eda_task` | 当前文档全览（元件/网络/过孔/走线）· 执行任意官方 `eda.*` 代码 · 后台长任务 |
| 保存与留档 | `eda_save` · `eda_snapshot` · `eda_trace` | 保存文档 · 紧急保存（.epro2+SVG+网表/BOM）· 截图存档 |
| 工程与知识 | `eda_sch_to_pcb` · `eda_skill_read` · `eda_capabilities` · `eda_template_list` · `eda_translate_request` · `eda_generate_schematic_json` | 原理图→PCB 复制 · 查官方 API 文档 · 能力清单 · 模板 · 需求翻译 · 离线标准版 JSON 兜底 |

**建议的工作顺序**：`eda_status` → `eda_board_overview` →（`eda_pick_spot` →）`eda_place` → `eda_wire` / `eda_netflag` → `eda_save` → `eda_sch_drc` / `eda_verify` → `eda_export`。

---

## 3. 官方 CLI / MCP 速查（实测形态）

### 3.1 CLI
```bash
lceda-pro doctor                          # 端点与版本自检（≈7.6s）
lceda-pro open [--path <工程.eprj3>] [--headless true]   # 开会话，返回 sessionId
lceda-pro session list|close|abort        # 会话管理（close --destroy 关窗）
lceda-pro invoke --session <id> --ext-uuid eda --code "return 1+1" [--args '{"a":1}'] [--timeout 1800000]
lceda-pro doc api [--class-name DMT_Project] [--method-name createProject]   # API 参考（含可运行示例）
lceda-pro doc format [--class-name TMSchComponent]                            # .esch2/.epcb2 记录格式
lceda-pro functions                       # 该会话已知扩展
lceda-pro --mcp stdio | --mcp http --port 3030 [--token <t>]
```
- 统一返回信封：`{ok, value, logs, durationMs}`；失败 `{ok:false, error:{code,message}}`——**只判最外层 `ok`**。
- **始终带 `--ext-uuid eda`**（内置扩展身份才拿到完整外部交互权限：读写本地文件、系统接口）。
- 路径统一用正斜杠，且只写 `APP_PROJECT_DIR` 内。

### 3.2 MCP（常驻，推荐）
MCP 暴露三个元工具：`lceda-pro.help` / `lceda-pro.discover` / **`lceda-pro.call`**。
参数是**平铺 + `input` 嵌套**（顶层多余的键会被 schema 丢掉）：
```js
// JSON-RPC 2.0 → POST http://127.0.0.1:49630/mcp
{ method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'x', version: '1' } } }

// 列会话（点号路径，无参数）
{ method: 'tools/call', params: { name: 'lceda-pro.call', arguments: { path: 'session.list' } } }
//   → { ok: true, path: 'session.list', data: [{ sessionId, status:'alive', origin, title, path }] }

// 执行代码（参数放 input 里！）
{ method: 'tools/call', params: { name: 'lceda-pro.call', arguments: {
    path: 'invoke',
    input: { session: '<sessionId>', extUuid: 'eda', code: 'return 1+1', timeout: 60000 } } } }
//   → { ok: true, path: 'invoke', data: <返回值> }
```
- 打开会话：`{ path: 'open', input: { path?: '<工程路径>', headless?: true } }` → `data.sessionId`。
- 响应可能是纯 JSON，也可能是 SSE（`data: {...}`）——两种都要能解析。
- 端口用 49630–49634（避开官方桥的 49620–49629）；**同一时刻只有一个桥/服务活跃**，不要重复起。

---

## 4. 核心 API 用法（官方 `eda.*`）

```js
// —— 工程/文档
const p = await eda.dmt_Project.getCurrentProjectInfo()      // 工程树 + page 尺寸(titleBlockData.Width/Height)
await eda.dmt_EditorControl.openDocument(pageUuid)           // 打开图页/PCB（切换后等 2~3s）
const doc = await eda.dmt_SelectControl.getCurrentDocumentInfo()  // documentType: 1=原理图 3=PCB

// —— 放置元件（推荐四步式：create → 读属性 → modify 位号 → 读引脚）
const items = await eda.lib_Device.search('0603WAF1001T5E')  // 系统库搜索（返回项可直接喂 create）
const c = await eda.sch_PrimitiveComponent.create(items[0], x, y, undefined, 90, false, true, true)
const id = c.getState_PrimitiveId()
const pre = (await eda.sch_PrimitiveComponent.get(id)).getState_OtherProperty()
await eda.sch_PrimitiveComponent.modify(id, { designator: 'R1', otherProperty: pre })
const pins = await eda.sch_PrimitiveComponent.getAllPinsByPrimitiveId(id)   // 布线唯一依据

// —— 连线 / 网络标志
await eda.sch_PrimitiveWire.create([[x1,y1,x2,y2]])          // 正交折线，段与段首尾相接
await eda.sch_PrimitiveComponent.createNetFlag('Power', 'VCC', x, y, 0, false)  // Power|Ground|AnalogGround|ProtectGround

// —— PCB
const poly = eda.pcb_MathPolygon.createPolygon([40,-340,'L', 400,-340, 400,-120, 40,-120, 40,-340])
await eda.pcb_PrimitivePolyline.create('', 11, poly, 10, false)   // 板框层 = 11（pcb_PrimitiveLine 只画铜层！）
await eda.pcb_Document.save()

// —— 检查与导出
const verbose = await eda.sch_Drc.check(true, false, true)   // 明细数组；check(true,false,false) 只回 boolean
await eda.sch_Document.save(); /* 等 8~10s 让编辑器重算，再查 DRC 更准 */
const f = await eda.sch_ManufactureData.getNetlistFile(); const txt = await f.text()
const bom = await eda.sch_ManufactureData.getBomFile('BOM', 'xlsx')          // 二进制 xlsx
const gerber = await eda.pcb_ManufactureData.getGerberFile()                 // 无参调用（带 layers 会返回 null）
```
完整类/方法/示例：用 `eda_skill_read`（顺序 `INDEX.md` → `references/classes/<类>.md`），或 `lceda-pro doc api --class-name <类> --method-name <方法>`（**每个方法都带可运行示例**）。

---

## 5. 坐标系与单位

| 领域 | 约定 |
|---|---|
| 原理图 | 单位 **10mil**，原点在图纸**左下**，Y 向上；A4 = **1170 × 825** |
| PCB | 单位 **mil**；`layerId 1` = 顶层，`11` = 板框层 |
| 角度 | API 逆时针为正；**原理图文件** `COMPONENT.rotation = (360 - API 角度) % 360`，PCB 侧同向 |
| 放置定位 | 原理图：图框内边距 ≥80、网格 100、与已有图元间距 ≥150；PCB：包围盒外扩 gap 600 / 网格 300。**直接调 `eda_pick_spot`，别手算。** |
| `.eprj3` | 文件夹工程，**双向同步**：编辑器保存即落盘，改盘上文件编辑器很快重读（纯文本、可 Git、可脚本直接生成） |

---

## 6. 铁律（先记住这七条）

1. **动手前先确认文档类型**：`getCurrentDocumentInfo()` → `documentType`（1 原理图 / 3 PCB）。在 PCB 上调 `sch_PrimitiveComponent.getAll()` 报「获取所有器件失败」——**不是间歇故障，是文档不对**。
2. **引脚坐标只读不猜**：`getAllPinsByPrimitiveId()` 是布线的唯一依据。
3. **放置走四步**：`create()` → 读属性快照 → `modify({designator, otherProperty})` → 读引脚。位号**不会自动分配**（新件是 `R?`/`U?`）。
4. **改完等 5~10 秒再查状态**（DRC/网表/渲染），并在关键步骤后 `save()`。
5. **批量分批**：单次 `invoke` 放 20~25 个器件为宜，给超时留余量（`--timeout` 上限 1800000ms）。
6. **每条关键返回都留档**（JSON 落盘），收尾核对磁盘产物 + 对象数量 + 截图。
7. **单个文件/片段的所有内联 JS 必须是可编译的 IIFE**，且**不能有同层重复声明**（见踩坑 P1）。

---

## 7. 踩坑清单（真机复现，按类别）

### 7.1 内联代码 / 工具实现类
- **P1 同作用域重复声明 → 整段无法编译**：`arr.map(x => { let x = 0 … })` 报 `Identifier 'x' has already been declared`；更隐蔽的是 `x = x.getState_X(); y = x.getState_Y()`（x 被覆盖成数字后 **y 永远读不到**）。改法：回调参数换名 + 分两行读取。护栏见 `test/code-snippets.test.mjs`。
- **P2 输出必须贴 schema**：工具输出是严格校验的（`additionalProperties:false`）。返回对象/字段类型与声明不一致会直接报 `value.pageSize must be a string` 这类错（曾把 `{w,h,unit}` 声明成 string）。
- **P3 MCP 调用形态**：`lceda-pro.call` 的参数必须 `{ path, input: {…} }`；平铺参数会被 schema 丢掉，报 `must have required property 'session'`。子命令用**点号**（`session.list`）。
- **P4 测试绝不能碰真实画板**：`node --test` 下必须禁探测/禁 spawn（`discoveryPorts: []`、`spawnBridge: false`、`allowSpawn≠true`）。另外 `--experimental-test-isolation=none` 时 `process.argv` 被剥掉 node 标志、`NODE_TEST_CONTEXT` 也没设——**判定测试环境要读 `process.execArgv`**。
- **P5 宿主热加载**：改插件后**真实写入** profile 的 `cordis.patch.yml` 才会触发 live reload（只改 mtime 无效）；重载后 `/api/dsh-eda/status` 的 `version` 会立刻变新。

### 7.2 文档状态 / 会话类
- **P6 `getAll` 类接口在复杂页/错文档下会失败或变慢**：先 `openDocument` 并 sleep 2~3s，失败重试 3~4 次。
- **P7 跨工程不生效**：`openDocument(<别的工程的页>)` 无效 → **先 `openProject(uuid)`**（生效有数秒延迟，轮询确认）；`copySchematic` **不支持跨工程**（返回 undefined）。

### 7.3 放置 / 布图类
- **P8 复杂页 `create` 极慢**：同一器件，空页 **≈300ms**，53 元件/214 图元的页 **≈24.5s（80×）**。批量作业请在**新建空页/新工程**做，或走后台任务；工具超时已上调（place 120s / wire,netflag 60s / sch_to_pcb 600s）。
- **P9 `pcb_Document.importChanges()` 不可靠**：返回 true 但 0 元件。改用 `eda_sch_to_pcb`（原理图→PCB 直接放置）。
- **P10 原理图→PCB 的器件引用**：`getState_Component()` 返回 `{libraryUuid,uuid,name}`，但**不能直接喂** `pcb_PrimitiveComponent.create`（报 `[object Object]`）；正确路径是取 `component.name` → `lib_Device.search(name)` → 用返回项放置。`getState_Name()` 返回 `={Value}`，不可用。
- **P11 搜索结果可能是假命中**（搜 `0402` 命中 "3M"）→ 用完整型号（如 `0603WAF1001T5E`）搜，或核对 `supplierId`（立创编号 C21190）。
- **P12 PCB 放置坐标是元件原点**（封装可能偏移，可能落在负坐标区）→ 放完用 `eda_board_overview` 回读实际坐标。
- **P13 零长度线段会卡死队列**；直角走线要避免（45° 或圆弧）。

### 7.4 检查 / 导出类
- **P14 DRC 不幂等**：一轮验证只跑一次；要明细用 `check(true,false,true)`，`false` 版本只回布尔。
- **P15 Gerber 用无参调用**：`getGerberFile()`（带 `layers` 参数返回 null）；`getManufactureData()` 会挂起（勿用）。
- **P16 BOM/网表是 File 对象**：网表 `await f.text()`；BOM xlsx 是二进制（`arrayBuffer`→base64 落盘）。
- **P17 没有下单/结算 API**：`eda_export` 出的是**打样交付包**（Gerber zip + BOM + 坐标 + 板信息），下单仍需人工。

### 7.5 能力边界
- 板框层折线只有 `pcb_PrimitivePolyline`（+ `pcb_MathPolygon.createPolygon`）可用；`pcb_PrimitiveLine` 仅铜层。
- 自动布线：原生 `pcb_Document.autoRouting({RoutingNets, optimization})`；**900s 硬上限且超时不留中间结果** → 必须分批。
- 导出能力：Gerber / 坐标 / IPC-2581 / ODB++ / 交互式 BOM / 3D STEP / PNG 截图 / `.epro2` 现场；`.eprj3` 为文本工程。

---

## 8. 标准工作流（从 0 到可打样）

```
1) eda_status                    → 确认 backend / connected（mcp 最佳）
2) eda_board_overview            → 看当前文档：元件/网络/过孔/走线（PCB 会回 162/135/817 这类计数）
3) eda_generate_schematic_json   → 离线兜底（无画板时的标准版 JSON）；有画板则直接做第 4 步
4) eda_pick_spot → eda_place     → 框内定位 + 放件（拿回引脚坐标）
5) eda_wire / eda_netflag        → 引脚级连线 + VCC/GND
6) eda_save → 等 8~10s → eda_sch_drc / eda_verify   → 校验（DRC 明细 + 网表 + BOM）
7) eda_sch_to_pcb → PCB 增量作业 → eda_export        → 打样交付包 → 人工下单
（随时）eda_trace 截图留证 · eda_snapshot 紧急保存 · eda_task 跑长任务
```

**验收三件套**：对象数量符合预期 + DRC 通过 + 截图目视正常。三者齐了才算完成。

---

## 9. 排错决策树

| 现象 | 处置 |
|---|---|
| `eda_status` 显示 `bridge` 而你有客户端 | 装/更新客户端到 v4.1.60+；或用 `DSH_EDA_CLI` 指定 `lceda-pro.exe` 路径；确认 `backendPrefer` 不是 `bridge` |
| `doctor` 显示 `connected:false` | 打开任意工程窗口（一个窗口 = 一个会话） |
| `must have required property 'session'` | 你在 MCP 里平铺了参数 → 放进 `input` |
| `Identifier 'x' has already been declared` | 内联片段有同层重复声明（见 P1）→ 改后重跑 |
| 工具报 `value.xxx must be a …` | 输出与 schema 不一致（见 P2） |
| 放件/连线超时 | 复杂页太满（P8）→ 新建空页或后台任务 |
| `getAll` 报「获取所有器件失败」 | 文档类型不对（P1/P6）→ 先 `openDocument` 到正确页 |
| 任务永远 `submitted` | 换页/刷新后旧任务残留 → 重启服务会话（`lceda-pro session list` 看存活）或重开 |
| 插件改动没生效 | 真实写入 `cordis.patch.yml` 触发 live reload（P5）；确认安装的是本地 `file:` 依赖路径 |

---

## 10. 参考

**官方**
- CLI 文档：https://prodocs.easyeda.com/cn/api/guide/cli.html
- For AI（推荐 AI 逐条遵循）：https://prodocs.lceda.cn/public/storage/texts/api/guide/cli-for-ai.html
- CLI 仓库：https://github.com/easyeda/easyeda-client-cli
- API 参考：https://prodocs.easyeda.com/cn/api/reference/pro-api.html

**随包（离线可查）**
- `skill/INDEX.md` → `skill/references/classes/*.md`（131 个类，用 `eda_skill_read` 读）
- `skill/guide/cli.md`、`skill/format/`（`.esch2`/`.epcb2` 记录格式）
- `docs/eda-conversation-skill.md`（附一~附十一：全链路复测、PCB 16 层能力矩阵、复杂页慢、官方 Issues 解决方案、原理图→PCB 正确路径）
- 代码护栏：`test/code-snippets.test.mjs`、`test/pagesize.test.mjs`、`test/cli-backend.test.mjs`
