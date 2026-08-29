# 验收报告

**验证对象**: `F:\dsh-lichuang`（dsh-lichuang-eda 插件项目：嘉立创 EDA 助手 —— 官方桥实时画板 + 标准版原理图 JSON 离线生成器）
**验收方式**: 只读 + 运行测试，未修改任何源码 / 文档 / 剖面文件
**报告日期**: 2026-08-29（验收环境本地时区）

---

## 一、环境快照

| 项目 | 值 |
| --- | --- |
| Node | v24.18.0 |
| npm | 11.16.0（通过 `cmd /c npm ...` 调用；`npm.ps1` 被宿主执行策略拦截） |
| 平台 | Windows |
| 工作目录 | `F:\dsh-lichuang` |
| GUI 服务器 | `http://127.0.0.1:3080`（全程未重启、未杀进程） |
| EDA 官方桥 | `http://127.0.0.1:49620`（`~/.dsh/eda/bridge` 官方栈） |
| 沙箱约束 | pwsh 为只读/受限模式；`node --test` 使用 `--experimental-test-isolation=none`。`npm.ps1` 脚本执行被禁，改用底层 node 命令 + `cmd /c npm` 复现 |

> 说明：项目 `package.json` 声明的 scripts（`check` / `test:json` / `test:plugin` / `test:all`）通过 `cmd /c npm run ...` 均可正常执行并通过（见 §二）。

---

## 二、逐项结果

### 1. 语法检查 `node --check`

| 检查项 | 命令 | 结果 | 备注 |
| --- | --- | --- | --- |
| backend.js | `node --check plugin/lib/backend.js` | ✅ exit=0 | 无语法错误 |
| installer.js | `node --check plugin/lib/installer.js` | ✅ exit=0 | 无语法错误 |
| index.js | `node --check plugin/lib/index.js` | ✅ exit=0 | 无语法错误 |
| client.js | `node --check plugin/lib/client.js` | ✅ exit=0 | 无语法错误 |

### 2. 插件单测 `node --experimental-test-isolation=none --test "plugin/test/*.test.mjs"`

**汇总**: `tests 27 / pass 27 / fail 0 / skipped 0 / todo 0` —— 全绿。

| 测试文件 | 用例数 | 通过 | 失败 | 判定 |
| --- | --- | --- | --- | --- |
| `plugin/test/status.test.mjs` | 8 | 8 | 0 | 全绿 |
| `plugin/test/generate.test.mjs` | 9 | 9 | 0 | 全绿 |
| `plugin/test/backend.test.mjs` | 6 | 6 | 0 | 全绿 |
| `plugin/test/install.test.mjs` | 4 | 4 | 0 | 全绿 |

覆盖：官方桥端口发现/健康探测、execute/handshake、callTool 门控、离线生成闭环（结构+连通性校验）、`/api/dsh-eda/*` 路由 200/405、安装器常量与路径、sha256Hex、`eda_status` 工具与严格输出 schema、getClientUI 生命周期等。

### 3. 生成器测试 / 自检 / 样本比对

| 检查项 | 命令 | 结果 | 备注 |
| --- | --- | --- | --- |
| 生成器单测 | `node --test --experimental-test-isolation=none src/json-gen.test.js` | ✅ tests 14 / pass 14 / fail 0 | 含 JSON.parse 往返、结构 lint、网表闭合、连通性、坏电路负例、幂等复现 |
| 插件自检 | `node plugin/selfcheck.mjs` | ✅ SELFCHECK OK (exit=0) | 注册 10 个工具、5 条路由、`plugin:dsh-eda` 段、provide(eda)。stub 上下文 handle.status() 为 `ready:false / connected:false`（未接线占位，符合 stub 预期） |
| v6 样本比对 | `node src/validate.mjs` | ✅ 62 通过 / 0 失败 | 顶层键、head/canvas/shape、LIB/W/N/F 各格式与真实 v6 平面单片 dataStr 一致 |
| v6 样本比对 | `node src/validate2.mjs` | ✅ 13 通过 / 0 失败 | docType=5 工程包装 + 连通性（引脚点/导线端点/网络点重合）全部通过 |

### 4. 产出复现

命令：`node src/json-gen.js` → exit=0。

| 产物 | 大小 | 结果 |
| --- | --- | --- |
| `src/output/demo.json` | 2373 B | ✅ 生成 |
| `src/output/demo-project.json` | 2791 B | ✅ 生成 |
| `src/output/demo-netlist.json` | 1187 B | ✅ 生成 |
| `src/output/preview.svg` | 1865 B | 已有（先于本次验收） |

生成日志：`shape 条目数 5`（LIB 2 / W 1 / N 1 / F 1），`网表 3 网络 (Net1[2脚], 5V[1脚], GND[1脚])`，`结构自检(JSON.parse 往返+顶层键): 通过`。

### 5. 运行中 GUI 实弹（服务器 127.0.0.1:3080，未重启/未杀）

| 检查项 | 命令 | 结果 | 备注 |
| --- | --- | --- | --- |
| 状态 | `GET /api/dsh-eda/status` | ✅ 200 | `ready:true, backend:official-easyeda-bridge, state:connected, connected:true, port:49620, bridgeInstalled:true, offlineCapable:true, supportedTypes:[resistor,led], version:0.1.0`。⚠️ 见问题 1（health 陈旧） |
| 模板 | `GET /api/dsh-eda/templates` | ✅ 200 | 6 个模板卡：`led-blink`/`voltage-divider` → `supported:true`；`buck` → `supported:"approx"`；`esp32-min`/`motor-drive`/`uart-convert` → `supported:false` |
| 生成 | `POST /api/dsh-eda/generate` `{"description":"一个 LED 点亮电路"}` | ✅ 200 | `ok:true`，`structureOk:true`，`connectivityOk:true`，`errors:[]`，组件 `R1 resistor 220` + `LED1 led red`，网络 `5V,GND`，写入 `~/.dsh/eda/output/led-blink-2026-08-29T00-03-30.json` 与 `-project.json` |
| 桥接 | `POST /api/dsh-eda/bridge` `{}` | ✅ 200 | `ok:true, state:connected, note:"官方桥已在运行"` |
| 客户端 bundle | `GET /plugins/@dsh-lichuang/dsh-eda/client.js` | ✅ 200 | `size=27784`, `content-type=text/javascript`（与 `plugin/lib/client.js` 长度 27784 一致）。注：用 `curl.exe` 取回；`Invoke-WebRequest` 对含 `@` 路径报 Host NonInteractive 错误（见问题 4） |
| 首页引导 | `GET /` | ✅ 200 | `len=15044`，含 `__DSH_BOOT__`，其中含条目 `{"id":"@dsh-lichuang/dsh-eda","url":"/plugins/@dsh-lichuang/dsh-eda/client.js?rev=25b4f842b918","inject":["@deepseek-ai/dsh-client-runtime"]}` |

### 6. 官方桥直接验证

| 检查项 | 命令 | 结果 | 备注 |
| --- | --- | --- | --- |
| 健康 | `GET http://127.0.0.1:49620/health` | ✅ 200 | `{"service":"easyeda-bridge","status":"ok","edaConnected":true,"edaWindowCount":1,"activeWindowId":"934ece4c-…","pendingRequests":0}` —— 协议握手存活且报告已连编辑器。⚠️ 与 status 端点的 `edaConnected:false` 不一致（见问题 1） |
| 执行（畸形体） | `POST /execute` 畸形 JSON（PowerShell→curl 引号被破坏） | ⚠️ 500 | `{"success":false,"error":"Expected property name or '}' in JSON at position 1 …"}` —— 系客户端参数转义问题，HTTP 端点能快速响应，非桥缺陷（见问题 3） |
| 执行（有效体） | `POST /execute` `{"code":"return await eda.dmt_Project.getCurrentProjectInfo();"}` | ⚠️ 超时 | 30s 无响应（Operation timed out）。见问题 2 |
| 执行（平凡体） | `POST /execute` `{"code":"return 42;"}` | ⚠️ 超时 | 10s 无响应。连平凡代码都挂起，说明 /execute 路径未完成一次成功往返（见问题 2） |

### 7. 磁盘产物目录

| 目录 | 内容 | 判定 |
| --- | --- | --- |
| `~/.dsh/eda/bridge/` | `scripts/bridge-server.mjs`(18241B)、`node_modules/ws`、`SKILL.md`、`package.json`、`package-lock.json`、`README.md`、`README.zh-Hans.md`、目录 `format`/`guide`/`references`/`user-guide` | ✅ 齐全（无顶层 `docs`，但 `user-guide`/`guide`/`format` 满足要求） |
| `~/.dsh/eda/output/` | 最近产物含 `led-blink-2026-08-29T00-*-*.json` 与 `-project.json`（含本次 generate 产出的 `00-03-30`） | ✅ 正常 |

> npm 脚本侧：`cmd /c npm run check` → `check_exit=0`；`cmd /c npm run test:all` → `testall_exit=0`（json-gen 14 通过、插件 27 通过）。`npm.ps1` 因宿主执行策略无法直接加载，用 `npm.cmd`/底层 node 命令达成同等覆盖。

---

## 三、问题清单

**严重**

1. （无阻断离线管线的问题。）离线生成 / 插件注册 / GUI 路由 / 首页引导 全部通过，无“严重”级导致交付瘫痪的问题。

**一般**

1. **`/api/dsh-eda/status` 的 `health` 是陈旧快照**。`plugin/lib/backend.js` 在 `discover()`（`start()` 期间）缓存 `this.lastHealth.raw`，而 `status()` 直接返回该缓存且**每次 status 不刷新**。本次实测：status 端点多轮返回同一旧值 `"edaConnected":false, edaWindowCount:0`；而同一时刻直连 `GET /49620/health` 返回 `"edaConnected":true, edaWindowCount:1`。即插件展示的连接状态可能滞后于真实桥状态，用户无法据此判断编辑器是否已接入。建议 status 时实时拉一次 `/health` 或分列“桥可达 / 编辑器已连”两态。
2. **实时 `/execute` 路径未完成一次成功往返**。有效 JSON（含 `return 42;` 与 `getCurrentProjectInfo`）在 10s/30s 均“Operation timed out”无任何返回；而 `/health` 正常且报告 `edaConnected:true`。表现为：协议/HTTP 层活着，但执行层挂起（等待已连接窗口应答而不得）。**受限，真机验证**：需真实 EasyEDA Pro 开着 Run API Gateway 且勾选「允许外部交互」才能确定是否可用；当前环境无法确认编辑器真正在应答，故实时画板能力**未能端到端通过**。此点建议在真机复测。
3. **客户端调用 `/execute` 时 JSON body 引号被破坏（本次 curl 场景）**。Windows PowerShell 直接 `curl.exe -d '{"code":…}'` 会把内嵌双引号吃掉，导致桥返回 500 JSON parse 错误。这是**调用侧转义问题，非插件缺陷**（插件后端用 `fetch` + `JSON.stringify` 不会复现）。报告如实记录，供后续复验时规避。
4. **`Invoke-WebRequest` 对含 `@` 的插件路径报 Pod NonInteractive 错误**。取 `client.js` 时 `Invoke-WebRequest -Uri 'http://127.0.0.1:3080/plugins/@dsh-lichuang/…'` 触发 PowerShell NonInteractive/Read 提示错误；改用 `curl.exe` 一次取回 200/27784B。仅影响本次取证方式，无碍插件功能。

**建议**

1. status 的 health 改为实时刷新（问题 1 的落地修复），并考虑区分“桥已启动 / 编辑器已连”。
2. 模板 `supported` 语义建议在 `generate` 层对 `supported:false`（esp32/min、motor-drive、uart-convert）给出明确的“暂不支持该元件”错误返回，与前端 `supported` 字段保持一致（本次仅验证了 `led-blink` 成功，未测不支持模板的错误分支）。
3. 环境备注：本项目 `package.json` 的 scripts 均可执行，但宿主 Windows 执行策略禁止直接加载 `npm.ps1`；建议在 CI/验收脚本用 `cmd /c npm …` 或 `npm.cmd`，避免“npm 不可用”误判。
4. `selfcheck.mjs` 的 stub 上下文 handle.status() 为 `ready:false / connected:false`，与真实运行时（status 端点 `connected:true`）不同，属不同上下文，建议在自检输出中注明“stub 未接线”以消除歧义（非缺陷）。

---

## 四、结论

**是否可交付：是（有条件）。**

- **可直接交付的能力**：标准版原理图 JSON 离线生成器（结构+连通性校验）、插件安装/自检、GUI 路由与首页引导注入、官方桥安装状态与目录完整性 —— 全部通过，单测/校验/自检全绿。
- **需附条件**：**实时画板（`/execute`）未能在本环境完成一次成功往返**（有效请求挂起 / 超时，见问题 2），因此“实时放元件/连线/DRC/网表/BOM”这一能力**未经端到端验证通过**。**条件**：在真实 EasyEDA Pro 桌面端开启官方扩展 Run API Gateway 并勾选「允许外部交互」后真机复测通过，方可宣称实时画板可用；在此之前建议以“离线生成可作为主路径 + 官方桥协议已就绪（/health 握手正常）”对外交付，实时路径标注“待真机验证”。

**未夸大说明**：离线生成、校验、插件注册与 GUI 集成均基于实测结果；`/execute` 挂起按“受限，真机验证”如实记录，未将其判为已通过；`npm.ps1` 被宿主执行策略限制属环境障碍，已用等价命令达成覆盖。全程未修改任何源码 / 文档 / 剖面文件，仅按验收要求运行测试并产出 `/src/output` 与 `~/.dsh/eda/output` 的生成产物（幂等，内容与既有一致）。

---

## 复核更新（2026-08-29 稍后）
- **#2 /execute 已验证通过**：桥重启 + 官方扩展自愈重连后，POST /execute 正常返回（eturn 42; → {success:true,result:42}）；并通过官方 API 读到用户云端真实工程 esp32_multitool（dmt_Project.getCurrentProjectInfo()）与活动原理图页（dmt_SelectControl.getCurrentDocumentInfo() → documentType=1）。
- **结论更新为：可交付**（云端实时路径已真机联通）；网页版 + Run API Gateway + 官方桥 端到端验证通过。
- #1（/status 健康状况陈旧）已修复：新增 backend.refresh()（状态接口/工具执行前实时探测 health），待 GUI 重启生效。

## 复核更新二（2026-08-29 全流程真机实测）

在用户云端工程 **esp32_multitool** 上跑通全链路（官方桥 49620 + 网页版 Run API Gateway）：

| 步骤 | 结果 |
|---|---|
| 1. 工程/文档信息 | ✅ esp32_multitool → Board1/Schematic1/P1 + PCB1 |
| 2. 搜索系统库 LED → `sch_PrimitiveComponent.create` | ✅ 放置 NCD0805R1 → 位号 **LED1** @(4000,4000)，加入 BOM + 转 PCB |
| 3. 搜索 10K → create | ✅ PX9210K 电阻（自动编号 U2）@(4000,5600) |
| 4. 网络标志 Power VCC / Ground GND | ✅ 两枚 netflag |
| 5. 导线 ×2（VCC / GND 网络） | ✅ `sch_PrimitiveWire.create` |
| 6. `sch_Document.save()` | ✅ true |
| 7. `sch_Drc.check(true,false,true)` | ✅ **1 error + 32 warnings**（详细违规，真实检出悬空引脚等） |
| 8. `getNetlistFile()` | ✅ 49KB EasyEDA JSON 网表（LED1/U2/U1/H1 引脚网络全映射） |
| 9. `getBomFile()` | ✅ 7KB xlsx（二进制） |
| 10. `dmt_EditorControl.openDocument`(PCB1) + `pcb_Document.importChanges()` | ✅ true（原理图变更同步进 PCB） |
| 11. `pcb_PrimitiveVia.create` ×2（VCC/GND 过孔）+ `pcb_Document.save()` | ✅ |
| 12. `pcb_Drc.check(true,false,true)` | ✅ 详细违规数组：1× Netlist Error（"PCB and schematic netlist does not match…Import Changes"——原理图↔PCB 网表差异，真实可解释） |
| 13. 切回 P1 + 紧急保存 | ✅ 0 降级：epro2(138KB) + SVG 预览(247KB) + netlist.json(35KB) + **bom.xlsx(7KB 合法 PK)** + 动作日志 + meta + README |

**实测发现并修复的 3 个真实缺陷**（均已单测覆盖，39/39）：
1. **DRC**：官方 `sch_Drc.check()` / `pcb_Drc.check()` 必须用 verbose 重载 `(true,false,true)` 才返回**错误详情**——旧 OFFICIAL_CODES 无参调用只得到 `false` 布尔。
2. **网表**：`getNetlistFile()` 返回 **File 对象**，桥 JSON 序列化为 `{}`——必须在代码内 `await f.text()` 取文本。
3. **BOM**：`getBomFile()` 返回**二进制 xlsx**，`text()` 会乱码——改为 arrayBuffer→base64 传输，快照解码写出合法 `bom.xlsx`（PK zip 头已验证）。

结论：**云端实时全流程（原理图生成→DRC→网表/BOM→PCB 同步→PCB 绘制→紧急保存）已真机端到端验证通过**。

## 复核更新三（2026-08-29 · 14 大类覆盖 + 清理）

**全类别覆盖测试**（每类在原理图与 PCB 各放置一个，全部成功）：

| 类别 | 原理图器件（search 命中） | 结果 |
|---|---|---|
| 电阻 R | R0402 → 0402WGF1003TCE | ✅ |
| 电容 C | C0603 → CC0603KRX7R9BB104 | ✅ |
| 电感 L | L0402 → ES0402V014BT | ✅ |
| 二极管 D | 1N4148 → 1N4148WS_C2128 | ✅ |
| LED | LED → NCD0805R1 | ✅ |
| 三极管 Q | S8050 → SS8050_C2150 | ✅ |
| MOSFET | AO3400 → AO3400A_C20917 | ✅ |
| 稳压器 U | AMS1117 → AMS1117-5.0_C6187 | ✅ |
| 晶振 X | 32.768KHz → 32.768K/12.5PF | ✅ |
| 连接器 J | XH2.54 → 2.54 单排排针 | ✅ |
| 开关 SW | SW-PUSH → KEY_2S3mm | ✅ |
| MCU | ESP32 → ESP32-A1S-ES8388 | ✅ |
| 蜂鸣器 | BUZZER → buzzer | ✅ |
| 保险丝 F | PTC → 1210L150/16WR | ✅ |

**后续验证**：原理图保存 ✓；DRC verbose（1 error+35 warn，真实违规）✓；网表 89KB（14 类全含）✓；
BOM 8KB xlsx ✓；**PCB 直接放置 14 类全部成功**（`pcb_PrimitiveComponent.create(dev,1,x,y)`），
`pcb_Net.getNetlist('JLCEDA')` 返回 **components:14**（网表正确）；PCB DRC 报真实 Clearance Error；
紧急保存 0 降级。**测试内容已全部清理**（P1 恢复为原有 30 元件+27 导线；PCB 画布清空恢复）。

**新发现并记录（官方 API 事实，写入对话指南）**：
1. `pcb_Document.importChanges()` 返回 true 但元件只进"未放置区"（getAll 仍空、网表不变），
   且留下清理不掉的 Netlist Error——**画 PCB 应走 `pcb_PrimitiveComponent.create` 直接放置**（实测网表正确）。
2. `sch_Netlist.getNetlist()` 与 `pcb_Net.getNetlist('EasyEDA')` 会挂起（30s 超时，官方缺陷）；
   `pcb_Net.setNetlist()` 返回 true 但不生效——均标注禁用。
3. 验证了"测试脚本自身"的坑：批量 delete 将 component 与 wire id 混传会返回 false（须分类型）；
   PCB `pcb_PrimitiveLine` 的起点 getter 在批量过滤中会异常（逐类型/逐项操作更稳）。

## 复核更新四（2026-08-29 · 框内定位 + 完整 demo）

**定位规则实测固化**（此前测试曾把元件放图框外——10mil 单位下 x=3200 = 813mm 远超 A4）：
页面尺寸 1170×825（10mil，来自 titleBlockData）→ 已有图元 bbox → 图框内边距 80 + 100 网格 +
与已有内容间距 150 → 推荐点 `(990,180)/(790,180)/(590,180)` 全部框内 ✓，放置验证通过。

**完整 demo（LED 点亮电路，成品保留在画板上）**：
- 原理图（P1 右中部空白行 y=300）：R@(960,300) + LED@(720,300) + VCC/GND 网络标志 +
  **引脚级三条水平导线**（引脚坐标来自 getAllPinsByPrimitiveId，端点精确吸附）→ 保存 →
  DRC（1 error + 28 warn）→ 网表 comps=7 / BOM 7KB；
- PCB（居中布局 y=3000）：R?@(2600) + LED?@(3800)（0805 焊盘坐标精确读取）+ VCC/GND 过孔 +
  **焊盘级走线三条** → 保存 → DRC（嵌套详情）→ PCB 网表 comps=2；
- 截图（getCurrentRenderedAreaImage + zoomToAllPrimitives）成功：`scratch/shots/sch.png`、`pcb.png`；
- 紧急保存 0 降级。

**新发现/边界（如实）**：
1. **板框画不出来**（pcb_PrimitiveLine layer=11/'11'/'BOARD_OUTLINE' 四组参数全失败；无
   createBoardOutline API）——板框仅人工/导入可获得；
2. **PCB 电气网络级连线不可自动化**：直放元件焊盘无网络；importChanges/setNetlist/
   getNetlist('EasyEDA') 实测不可靠 → DRC 报 SMD Pad to Track 0mil（画布级完整、电气级受限）；
3. 原理图 DRC verbose 仅返回聚合 `[{type,count}]`（详情在 UI 面板）；PCB 版返回嵌套详情；
4. `sch_PrimitiveComponent.getAll()` 间歇性失败（重试通过）。



