# 对话式生成 Skill 指南（嘉立创 EDA · 在线画板版）

> 本文档是给 **AI（对话式 Agent）** 看的操作手册，说明如何在对话里一步步把电路画进**用户云端画板**。
> 定位：**插件（dsh-lichuang-eda）只做平台层** —— 负责安装/启动/连接官方桥、查状态、做校验、离线兜底；**真正的电路图生成由 AI 在对话里通过 `eda_exec`（等价于向官方桥 `POST /execute`，请求体 `{"code":"..."}`）驱动官方 `eda.*` API 完成**。
> 所有「来自文档」的内容都在句末标注了出处文件名（路径相对于 `~/.dsh/eda/bridge/`）；凡未在 vendored 官方文档中读到的，都标 `【待核实】` 或「以 ~/.dsh/eda/bridge 官方文档为准」。

---

## 〇、本指南的核实基线

- 官方桥已 vendored 于 `C:\Users\35081\.dsh\eda\bridge\`（官方 easyeda-api-skill **v1.1.28**，见 `SKILL.md` 头部的 `metadata.version`）。
- 读取的官方类/方法清单与运行机制均来自以下文件（下文中以这些文件名引用）：
  - `SKILL.md`（总体架构、执行上下文、常见错误、文档状态、库操作、失败策略）
  - `scripts/bridge-server.mjs`（桥的 HTTP/WS 协议、`POST /execute` 包裹与错误语义、端口 49620–49629、30s 超时）
  - `guide/invoke-apis.md`、`user-guide/using-extension.md`（`eda` 对象命名、扩展安装与「外部交互」权限）
  - `references/classes/SCH_Document.md`、`SCH_Drc.md`、`SCH_ManufactureData.md`、`SCH_Netlist.md`、`SCH_Net.md`、`SCH_PrimitiveComponent.md`、`SCH_PrimitiveWire.md`、`SCH_SelectControl.md`
  - `references/classes/DMT_Project.md`、`DMT_Schematic.md`、`DMT_EditorControl.md`、`DMT_SelectControl.md`
  - `references/classes/LIB_Device.md`、`LIB_LibrariesList.md`、`LIB_Symbol.md`
  - `references/classes/EDA.md`（`eda` 全局对象挂载的所有子模块，如 `eda.sch_PrimitiveComponent`、`eda.lib_Device`）
  - `references/enums/EDMT_EditorDocumentType.md`、`references/enums/ESYS_NetlistType.md`
- 类名索引亦允许引用 `prodocs.easyeda.com/cn/api/` 上已存在的类名（`SCH_Document`、`SCH_Drc`、`SCH_Netlist`、`SCH_ManufactureData`、`PCB_Document`、`PCB_Drc`、`PCB_ManufactureData`、`DMT_Project` 等）；但**方法名**一律以本目录 vendored 文档为准，或明确标注 `【待核实】`。

**关于命名规则（重要）**：官方文档里，类名首段小写即得到 `eda` 上的实例对象名。例如 `SCH_PrimitiveComponent` → `eda.sch_PrimitiveComponent`、`SYS_ToastMessage` → `eda.sys_ToastMessage`、`LIB_Device` → `eda.lib_Device`（见 `guide/invoke-apis.md` 的命名表与 `references/classes/EDA.md` 的属性列表）。调用形式恒为 `eda.实例对象名.方法名(...)`。

---

## 一、定位：插件=平台，生成=对话 skill 式

**平台层（插件负责）**
- 安装/更新官方桥：`eda_bridge_install`
- 启动官方桥并等待健康检查：`eda_backend_connect`
- 查桥与连接状态：`eda_status`（重点关注是否 `connected:true`）
- 校验/导出能力：`eda_sch_drc`、`eda_get_netlist`、`eda_get_bom`（也可用 `code` 参数直接传官方 `eda.*` 代码）
- 离线兜底：`eda_generate_schematic_json`（见§五）、`eda_translate_request`（需求→草稿预览）

**生成层（AI 在对话里做）**
- AI 通过 `eda_exec`（→ 官方桥 `POST /execute`）发送 `eda.*` JS 代码，代码在 EasyEDA 客户端浏览器运行时里执行（`scripts/bridge-server.mjs` 的 `executeOnEda`；执行包裹见 `SKILL.md`「Code Execution Context」）。
- AI 负责「读当前文档 → 放元件 → 连线 → 加网络标签 → DRC → 修错 → 网表/BOM → 交付说明」的全流程。

> 一句话：**插件只「装桥、连桥、查状态、校验、离线兜底」；画电路是 AI 用 `eda_exec` 驱动官方 API 在用户云端画板上作出来的。**

---

## 二、启动流程（连接官方桥）

按顺序执行，直到确认连接成功。

1. **`eda_status` 确认现状**
   - 看桥是否已在运行、是否已有 EasyEDA 窗口连接（`edaConnected` / `edaWindowCount` / `activeWindowId`，字段见 `scripts/bridge-server.mjs` 的 `/health` 与 `SKILL.md` 的 `/eda-windows` 返回示例）。

2. **未安装/未启动则安装并启动**
   - 若桥未就绪：`eda_bridge_install`（下载/解压/`npm install` 官方桥到 `~/.dsh/eda/bridge/`，见 `SKILL.md`「Install dependencies」与「Start bridge server」）。
   - `eda_backend_connect` 启动 `scripts/bridge-server.mjs`，监听 `127.0.0.1:49620-49629` 里第一个可用端口（`scripts/bridge-server.mjs` 的 `PORT_START/PORT_END` 与端口自动探测）。

3. **确认用户端扩展已装并开启外部交互**（可请用户核对）
   - 官方扩展：`run-api-gateway.eext`（`SKILL.md`「Connect EasyEDA」给出的下载地址 `https://jlc-ext.com/item/oshwhub/run-api-gateway`）。
   - 安装入口（V3）：顶部菜单 **Advanced → Extension Manager**（`user-guide/using-extension.md` 的「V3 Installation」）。
   - 关键：开启该扩展的 **External Interactions / 外部交互** 权限，否则无法与本地桥通信（`user-guide/using-extension.md` 结尾：『Some extensions involve external interactions… enable the extension's External Interactions permission』）。
   - 注意：任务说明提到的 `pro.lceda.cn/editor →高级→扩展管理器` 与「外部交互」入口与 vendored 文档一致；**具体网址是否为 `pro.lceda.cn`（vs `pro.easyeda.com`）【待核实】**（vendored 文档用 `https://pro.easyeda.com/editor`，见 `guide/invoke-apis.md`、`user-guide/using-extension.md`）。

4. **再 `eda_status` 直到 `connected:true`**
   - 用 `GET /health` 验证 `{"service":"easyeda-bridge", "edaConnected":true}`（`scripts/bridge-server.mjs`）。
   - 用 `GET /eda-windows` 看待连接窗口：0 个 → 提醒用户装/启扩展；1 个 → 自动选定为 active；≥2 个 → 让用户选择窗口，再 `POST /eda-windows/select`（`SKILL.md`「Verify connection and select EDA window」）。

---

## 三、生成工作流（逐步）

> 每步都给出**来自 vendored 文档的真实示例代码**与**失败处理**。所有 `eda.*` 调用都必须 `await`；代码以 `return` 返回结果（`console.log` 不会被捕获；代码不含注释，通常单行执行）（`SKILL.md`「Code Execution Context」）。

### 步骤 0：确认文档状态（先读后改，铁律第一步）
在对画板做任何写操作前，先确认「有打开的工程 + 当前文档类型正确」。参考 `SKILL.md`「Document State (CRITICAL)」。

```js
const project = await eda.dmt_Project.getCurrentProjectInfo();
if (!project) {
  return "Error: 未打开任何工程。若刚刚用 dmt_Project.createProject() 创建了工程，必须先用 dmt_Project.openProject(...) 打开它。";
}
const doc = await eda.dmt_SelectControl.getCurrentDocumentInfo();
if (doc?.documentType !== EDMT_EditorDocumentType.SCHEMATIC_PAGE) {
  return "Error: 当前激活的不是原理图页，请在 EasyEDA 中打开/切到原理图页。";
}
```
- 出处：`references/classes/DMT_Project.md`（`getCurrentProjectInfo`）、`references/classes/DMT_SelectControl.md`（`getCurrentDocumentInfo`，返回对象含 `documentType`/`uuid`/`tabId`/`parentProjectUuid`）、`references/enums/EDMT_EditorDocumentType.md`（`SCHEMATIC_PAGE = 1`、`PCB = 3`）、`SKILL.md` 的「Document State」。
- 失败处理：`getCurrentProjectInfo()` 返回 `undefined` → 先按需 `dmt_Project.openProject(projectUuid)` 或 `dmt_Project.createProject(...)`；`documentType` 不是 `SCHEMATIC_PAGE` → 用 `dmt_EditorControl.activateDocument(tabId)` 或 `openDocument(...)` 切到原理图页。

### 步骤 1：读取当前工程 / 文档（读现有内容）
```js
// 当前工程（含名称、teamUuid、folderUuid 等）
return await eda.dmt_Project.getCurrentProjectInfo();

// 当前工程里所有原理图 / 所有图页
const schematics = await eda.dmt_Schematic.getAllSchematicsInfo();
const pages = await eda.dmt_Schematic.getAllSchematicPagesInfo();
```
- 出处：`references/classes/DMT_Project.md`、`references/classes/DMT_Schematic.md`（`getAllSchematicsInfo` / `getAllSchematicPagesInfo`，返回含 `name`/`uuid`/`page[]`/`parentSchematicUuid` 等字段）。
- 失败处理：返回空数组 → 可能没有原理图，需要新建或提醒用户；`getAllProjectsUuid` 不是无参全局枚举器，**要可靠按名找工程需先遍历 team / folder**（`SKILL.md` 对 `dmt_Project.getAllProjectsUuid()` 的注记）。

### 步骤 2：新建/打开原理图
**A. 打开已有原理图页**（推荐：在有现成图时）
```js
const pages = await eda.dmt_Schematic.getAllSchematicPagesInfo();
const tabId = await eda.dmt_EditorControl.openDocument(pages[0].uuid); // 传「图页级 UUID」
// 后续对当前激活原理图的操作（sch_* 类）都作用在此页上
```
- 出处：`references/classes/DMT_EditorControl.md`（`openDocument(documentUuid)` 支持 `IDMT_SchematicPageItem.uuid`，返回 `tabId`）；`references/classes/DMT_Schematic.md`。

**B. 新建原理图**（无图时）
```js
const schematicUuid = await eda.dmt_Schematic.createSchematic();            // 可选 boardName 参数
await new Promise(r => setTimeout(r, 1500));                                 // 等工作区同步
const schInfo = await eda.dmt_Schematic.getSchematicInfo(schematicUuid);     // 自带图页 p1
await eda.dmt_EditorControl.openDocument(schInfo.page[0].uuid);              // 打开图页级 UUID
```
- 出处：`references/classes/DMT_Schematic.md`（`createSchematic`/`getSchematicInfo`，`info.page[0].uuid` 即图页级 UUID）；`references/classes/SCH_Document.md` 与 `DMT_Schematic.md` 的多个示例都显示 `openDocument` 需传**图页级** UUID。
- 失败处理：`createSchematic()` 返回 `undefined` → 创建失败，需确认是否已打开工程；`openDocument` 返回 `undefined` → 文档打开失败，检查传入的是否为「图页级 UUID」而非「原理图级 UUID」。

### 步骤 3：放置元件（引用真实库/LCSC 用法）
**方式一：按立创 C 编号精确搜库再放**（最可靠）
```js
// 1. 搜器件（例：按 LCSC C1523），每页 5 条
const devices = await eda.lib_Device.searchByProperties({ supplierId: 'C1523' }, undefined, undefined, undefined, 5, 1);
// 2. 取系统库 UUID，组装 {libraryUuid, uuid}
const sysLibUuid = await eda.lib_LibrariesList.getSystemLibraryUuid();
const device = { libraryUuid: sysLibUuid, uuid: devices[0].uuid };
// 3. 放置（SCH 坐标单位 10mil = 0.01inch）
const comp = await eda.sch_PrimitiveComponent.create(device, 800, 800);
```
- 出处：`references/classes/LIB_Device.md`（`searchByProperties` 支持 `{ supplierId }`，按 C 编号精确搜）、`references/classes/LIB_LibrariesList.md`（`getSystemLibraryUuid`）、`references/classes/SCH_PrimitiveComponent.md`（`create(component, x, y, subPartName, rotation, mirror, addIntoBom, addIntoPcb)`；`component` 是 `{libraryUuid, uuid}` 对象，**不是字符串**）。这一整套「C 编号 → 搜库 → 组装 device → create」正是 `references/classes/SCH_Document.md` 的 `autoRouting` 示例用法。

**方式二：按关键字搜索后直接放**（方便但匹配面广）
```js
const devices = await eda.lib_Device.search('STM32');
const comp = await eda.sch_PrimitiveComponent.create(devices[0], x, y, undefined, 0, false, true, true);
```
- 出处：`references/classes/LIB_Device.md`（`search(key, ...)`，默认系统库）、`references/classes/SCH_PrimitiveComponent.md`（首参可直接传 `ILIB_DeviceSearchItem`）。

- **坐标单位务必小心**：原理图是 `0.01inch = 10mil`（`1mm ≈ 3.937` 单位）；PCB 是 `1mil`（`1mm ≈ 39.37` 单位）。混用会放偏 10 倍（`SKILL.md`「Coordinate Unit (CRITICAL)」「这是 AI 最容易犯的头号错误」）。
- 失败处理：`search`/`searchByProperties` 返回空数组 → 关键词/编号无结果，改搜别名称或用 `lib_Cbb` 复用模块；`create` 返回 `undefined` → 放置失败（常见：当前没激活原理图页，或 `component` 缺 `libraryUuid`）。
- 提示：若希望**交互式**由用户点放，可用 `eda.sch_PrimitiveComponent.placeComponentWithMouse(component)` / `placeSymbolWithMouse(symbol)`（会绑定到鼠标，用户点击后落位；该 API 不等待用户放置即返回）（`references/classes/SCH_PrimitiveComponent.md`）。

### 步骤 4：连线
```js
// 水平一段 + 向上一段，必须首尾相连且每段水平或垂直
const wire = await eda.sch_PrimitiveWire.create(
  [[x, y, x + 400, y], [x + 400, y, x + 400, y + 200]],
  'SIG_A',       // 网络名（自由字符串；不传时按落点自动推断）
  '#FF0000',     // 颜色
  6,             // 线宽（1-10）
  1              // 线型
);
```
- 出处：`references/classes/SCH_PrimitiveWire.md`（`create(line, net?, color?, lineWidth?, lineType?)`；`line` 为 `[x1,y1,x2,y2,…]` 或 `[[…],[…]]` 多段；段与段必须连通，且每段水平或垂直，多段/单段不合法会创建失败——文档里列了多组「无效/有效」规则）。
- 失败处理：返回 `undefined` → 段不连通、或某个坐标已落在**其它网络**的图元上且该网络显式指定了名称（则会创建失败，见文档的 `net` 参数规则）；改用自由 `net` 或不带 `net`，或先删除冲突图元。

### 步骤 5：网络标签 / 电源符号
网络标签（电源/地）：
```js
// 电源类标识：'Power' | 'Ground' | 'AnalogGround' | 'ProtectGround'
const flag = await eda.sch_PrimitiveComponent.createNetFlag('Ground', 'GND', pinX, pinY);
```
网络端口（IN/OUT/BI）：
```js
const port = await eda.sch_PrimitiveComponent.createNetPort('IN', 'SIG', x, y, 0, false);
```
- 出处：`references/classes/SCH_PrimitiveComponent.md`（`createNetFlag(identification, net, x, y, rotation?, mirror?)`、`createNetPort(direction, net, x, y, rotation?, mirror?)`）。
- 用上一步元件引脚坐标来放网络标识的完整真实样例见 `references/classes/SCH_Document.md` 的 `autoRouting` 示例：`const pin1 = (await comp1.getAllPins())[0]; const flag1 = await eda.sch_PrimitiveComponent.createNetFlag('Ground', 'GND', pin1.getState_X(), pin1.getState_Y());`。
- 失败处理：返回 `undefined` → 标识位置/类型错了，检查坐标是否落在引脚或导线上；`identification`/`direction` 必须是文档列出的字面量（枚举成员），不要乱猜。

### 步骤 6：修改/调整（如果 DRC 或人工要求改动）
```js
// 修改器件（x/y/rotation/mirror/designator/name/article 等），改后需重新 get() 读到最新值
await eda.sch_PrimitiveComponent.modify(compId, { x: x + 400, rotation: 90, designator: 'U100' });
const refreshed = await eda.sch_PrimitiveComponent.get(compId); // 读取画布上的最新值
```
- 出处：`references/classes/SCH_PrimitiveComponent.md`（`modify` 仅对 `COMPONENT` 类型可用）、`references/classes/SCH_PrimitiveWire.md`（`modify` 可改 `line/net/color/lineWidth/lineType`）。
- **重要：`modify` 返回后需重新 `get()` 才能读到最新值**（文档在 `modify` 示例里明确强调）。
- 失败处理：`modify` 对非 `COMPONENT` 类型图元不可用；改导线用 `sch_PrimitiveWire.modify`；改完用 `get` 校验。

### 步骤 7：**保存**（每次改动后都要保存）
```js
const saved = await eda.sch_Document.save();
```
- 出处：`references/classes/SCH_Document.md`（`save()` 对当前激活的原理图生效，返回 `false` 表示保存/上传失败）；`references/classes/DMT_EditorControl.md` 的 `closeDocument` 备注明确：『After completing modification operations, first execute `SCH_Document.save()`, `PCB_Document.save()`, and `PNL_Document.save()` to save the data』。**未保存就关闭文档会直接丢失未保存内容**。
- 失败处理：`save()` 返回 `false` → 网络/上传失败，稍后重试并提示用户检查网络；保存前不要 `closeDocument` / `openProject`（`openProject` 可能丢弃当前工程未保存的改动，见 `references/classes/DMT_Project.md` 的 `openProject` 备注）。

### 步骤 8：`eda_sch_drc` 校验
```js
const violations = await eda.sch_Drc.check(true, false, true);   // 详细模式：返回违规数组
// 或
const passed = await eda.sch_Drc.check(true, false, false);      // 布尔模式：是否全部通过
```
- 出处：`references/classes/SCH_Drc.md`（`check(strict, userInterface, includeVerboseError)`；`userInterface=true` 会弹出底部 DRC 窗口；`includeVerboseError=true` 返回 `Array<ISCH_DrcError>`，`false` 返回 `Promise<boolean>`；文档注明当前原理图统一为 strict 模式）。
- 失败处理：返回数组非空 → 按违规项修错（用步骤 6 的 `modify` 改图元，必要时用 `sch_SelectControl` 选中、`sch_PrimitiveWire`/`sch_PrimitiveComponent` 删除重放）；DRC 返回 `undefined`/异常 → 确认当前确实激活了原理图页（DRC 作用于当前激活原理图）。
- 铁律：**DRC 之后只以 DRC 返回的数据为准**，不要凭推理臆断通过与否。

### 步骤 9：网表 / BOM
```js
// 网表（'Protel2' = ESYS_NetlistType.ALTIUM_DESIGNER）
const netlistFile = await eda.sch_ManufactureData.getNetlistFile('我的_网表', 'Protel2');
// 导出文件后可用 eda.sys_FileSystem.saveFile(file, fileName) 保存到本地
// BOM（xlsx，只含标记了加入 BOM 的元件）
const bomFile = await eda.sch_ManufactureData.getBomFile('我的_BOM', 'xlsx', undefined,
  [{ property: 'Add into BOM', includeValue: 'yes' }]);
```
- 出处：`references/classes/SCH_ManufactureData.md`（`getNetlistFile(fileName?, netlistType?)`、`getBomFile(fileName?, fileType?, template?, filterOptions?, …)`；两者备注都建议用 `SYS_FileSystem.saveFile()` 导出到本地文件系统）；`references/enums/ESYS_NetlistType.md`（`ALTIUM_DESIGNER='Protel2'`、`EASYEDA_PRO='EasyEDA'`、`JLCEDA_PRO='JLCEDA'`）；`references/classes/SYS_FileSystem.md`（`saveFile(fileData, fileName)` 接收 `File|Blob`）。
- 失败处理：`getNetlistFile` 抛错 → 原理图数据不满足网表校验（如引脚编号重复），修错后重试；`getBomFile` 返回 `undefined` → 检查导出参数。
- 说明：`SCH_Netlist.getNetlist()` 已标记为 **obsolete**（`references/classes/SCH_Netlist.md` 注明『Please use SCH_ManufactureData.getNetlistFile() instead』），应优先用 `getNetlistFile`；如需直接读网表字符串，`eda.sch_Netlist.getNetlist('Protel2')` 仍存在于文档但已废弃。

### 步骤 10：交付说明
- 向用户说明：已生成/更新的是哪张原理图（`getCurrentSchematicInfo()`/`getCurrentSchematicPageInfo()` 可拿当前焦点原理图/图页的 name/uuid，`references/classes/DMT_Schematic.md`）。
- 若想留底，可用 `eda.dmt_EditorControl.getCurrentRenderedAreaImage(tabId)` 取该画布渲染区图像（返回 `Blob`，`references/classes/DMT_EditorControl.md`），或 `eda.sch_ManufactureData.getPngFile()`/`getSvgFile()` 导出图片（`references/classes/SCH_ManufactureData.md`）。
- 提示下一步：可转入 PCB（`dmt_Pcb`/`pcb_*` 域），或导出 PDF/PNG、清走测试图元。

---

## 四、铁律 / 注意事项（来自 SKILL.md 与类文档的原文要点）

1. **先读后改**：调用任何一个 API 前，必须先读 `references/classes/<Class>.md` 的完整签名（参数类型、返回类型、Remarks/备注）。『Never guess an API signature. If references/classes/ doesn't document it, it doesn't exist for your use case.』（`SKILL.md`「Failure Handling Rules」）
2. **必须 `await` Promise**：几乎所有 API 返回 `Promise<T>`，忘 `await` 只会拿到 Promise 对象。判断方法：看签名返回类型是否为 `Promise<…>`。（`SKILL.md`「Common Mistakes / Error 1」）
3. **用枚举成员，不要裸数字/裸字符串**：如 `EPCB_LayerId.TOP`、`EDMT_EditorDocumentType.SCHEMATIC_PAGE`、`ESYS_NetlistType.ALTIUM_DESIGNER`（`SKILL.md`「Common Mistakes / Error 2」；枚举值见 `references/enums/`）。
4. **校验参数类型与单位**：`create()` 与 `modify()` 的参数顺序/类型常不同；坐标单位原理图是 `0.01inch(10mil)`、PCB 是 `1mil`。（`SKILL.md`「Common Mistakes / Error 3」与「Coordinate Unit」）
5. **文档状态**：创建工程后**必须**先打开它才能操作内部文档；操作前确认 a) 工程已打开，b) 当前文档正确，c) 文档类型匹配 API 域（`PCB_*` 需激活 PCB、`SCH_*` 需激活原理图页 `SCHEMATIC_PAGE`）。错误/Null 通常来自文档类型不匹配（`SKILL.md`「Document State」）。
6. **每次改动后保存**：改完调用 `sch_Document.save()`（或 `pcb_Document.save()`/`pnl_Document.save()`）再关闭或切页；`openProject`/`closeDocument` 会丢失未保存改动（`references/classes/DMT_EditorControl.md`、`references/classes/DMT_Project.md`）。
7. **改后重新读**：`sch_PrimitiveComponent.modify` / `sch_PrimitiveWire.modify` 之后需重新 `get()` 才读得到画布上最新值（`references/classes/SCH_PrimitiveComponent.md`、`references/classes/SCH_PrimitiveWire.md`）。
8. **DRC 后仅以数据为准**：以 `sch_Drc.check` 返回的布尔/数组为准，不臆断。（`references/classes/SCH_Drc.md`）
9. **无连接不画**：桥没有 `edaConnected` 窗口时，`POST /execute` 会拒绝（`No EDA window connected…`），画不了任何东西——先连桥（§二）再动手（`scripts/bridge-server.mjs`；`SKILL.md`「Troubleshooting」）。
10. **代码上下文规则**：代码在 `async function(eda){…}` 中执行；必须 `return` 结果（`console.log` 不捕获）；不要加注释（通常单行）；浏览器上下文无 `fs`/`path` 等 Node API。（`SKILL.md`「Code Execution Context」）
11. **iframe 内直接用 `eda`**：在 `sys_IFrame` 内访问 API 用 `eda.xxx`，不要用 `window.parent.eda`（`SKILL.md`「IFrame Context」）。
12. **权限拦截 ≠ 代码 bug**：某 API 一致失败但调用与文档完全一致且已排除其它原因时，可能是被 EDA 权限系统拦截（受许可证/工程设置/文档状态限制）——告知用户可能需更高权限或不同版本（`SKILL.md`「Troubleshooting / Permission errors」）。
13. **不确定就停下来**：API 在文档里不存在 → 立刻停止并告知用户；签名不确定 → 停止生成，回到查询步骤重读（`SKILL.md`「Failure Handling Rules」）。

---

## 五、离线兜底说明

- **何时用**：无法连接官方桥（用户没装/没启扩展、没开「外部交互」、或桥连接不上）时，AI 仍能给出**可插入嘉立创 EDA 标准版**的原理图 JSON 作为兜底。
- **工具**：`eda_translate_request`（中文需求 → 结构化设计草稿，先预览理解是否正确）；`eda_generate_schematic_json`（生成带结构+连通性校验的原理图 JSON，离线可用，产物在 `~/.dsh/eda/output/`）。
- **能力边界**：v0 生成器**仅支持「电阻 / LED」两类符号**；模板卡中其余符号显示为**暂不支持**。
- **交付**：离线 JSON 是「标准版」可导入文件，与在线画板（`eda_exec` 直驱动的专业版）是**两条不同路径**；两者可并存——在线不可达时给离线 JSON，并说明在线画板生成需先完成 §二 的连接流程。

---

## 六、已知限制与待真机验证项

**来自文档、已可确认的约定**
- 官方桥只监听 `127.0.0.1:49620-49629`，端口冲突会自动换端口（`scripts/bridge-server.mjs`）。
- 单次 `POST /execute` 默认 **30s 超时**；复杂操作需拆分成多次执行（`scripts/bridge-server.mjs` 的 `REQUEST_TIMEOUT_MS`；`SKILL.md`「Troubleshooting / Timeout errors」）。
- 很多 `SCH_*` 方法标为 **BETA**（如 `sch_Document.autoLayout/autoRouting`、`sch_Net.*`、`sch_Drc.check`），说明官方仍可能在后续版本改动（各 `references/classes/*.md` 方法头部的 BETA 声明）。
- `dmt_Project.getAllProjectsUuid()` 不是无参全局枚举器；要按名找工程需先遍历 `dmt_Team.getAllTeamsInfo()` 再遍历 folder（`SKILL.md` 注记）。
- `sch_Netlist.getNetlist()` 已 deprecated，请改 `sch_ManufactureData.getNetlistFile()`（`references/classes/SCH_Netlist.md`）。

**需要真机 / 网页版验证的点【待核实】**
- **网页版扩展连桥的稳定性【待核实】**：`SKILL.md` 头部的 `compatibility` 写的是『EasyEDA Pro **desktop client** with extension support』，而本插件面向的「网页版」（`pro.easyeda.com` / `pro.lceda.cn/editor`）能否长期稳定地加载 `run-api-gateway` 扩展并维持 WebSocket 连桥，**文档未明确保证**，需在网页版真机验证。
- **`eda_exec` 工具的确切包装**【待核实】：本指南按 `scripts/bridge-server.mjs` 的 `POST /execute {"code"}` 与 `SKILL.md` 的包裹规则描述；插件侧 `eda_exec` 的具体工具签名、单次执行上限、返回结构以插件实际提供为准。
- **网页版下各 BETA 方法可用性【待核实】**：`sch_Drc.check`、`sch_Net.*`（标注 ADD since EDA v4.2）、`sch_Document.autoLayout/autoRouting`、`getCurrentRenderedAreaImage` 等在**网页版**是否与桌面版行为一致，未实测。
- **网址是否用 `pro.lceda.cn`【待核实】**：vendored 文档统一用 `https://pro.easyeda.com/editor`（`guide/invoke-apis.md`、`user-guide/using-extension.md`），与需求描述中的 `pro.lceda.cn/editor` 是否等价/可替换，需确认。
- **离线 JSON 与在线画板的一致性【待核实】**：离线生成器是「标准版」路径，在线 `eda_exec` 是「专业版」路径，两者产物格式/语义是否互通未实测。

---

## 附：关键 API 用法速查（均已核实）

| 用途 | 调用（`eda.…`） | 一句话说明 | 出处 |
|---|---|---|---|
| 读当前工程 | `dmt_Project.getCurrentProjectInfo()` | 返回当前焦点工程属性 | `references/classes/DMT_Project.md` |
| 打开工程 | `dmt_Project.openProject(projectUuid)` | 打开指定工程（会丢失已开工程未保存改动） | `references/classes/DMT_Project.md` |
| 列工程 | `dmt_Project.getAllProjectsUuid(teamUuid, folderUuid)` | 需先遍历 team/folder 才能可靠按名找工程 | `references/classes/DMT_Project.md`、`SKILL.md` |
| 建工程 | `dmt_Project.createProject(friendlyName, …)` | 创建工程，返回 UUID | `references/classes/DMT_Project.md` |
| 读当前文档 | `dmt_SelectControl.getCurrentDocumentInfo()` | 返回 `documentType`(=1 原理图/3 PCB)等 | `references/classes/DMT_SelectControl.md` |
| 列原理图 | `dmt_Schematic.getAllSchematicsInfo()` / `getAllSchematicPagesInfo()` | 列工程内原理图/图页 | `references/classes/DMT_Schematic.md` |
| 建原理图/图页 | `dmt_Schematic.createSchematic()` / `createSchematicPage(uuid)` | 新建；创建后需打开 page 级 UUID | `references/classes/DMT_Schematic.md` |
| 打开文档 | `dmt_EditorControl.openDocument(pageUuid)` | 打开图页，返回 tabId | `references/classes/DMT_EditorControl.md` |
| 切换/关闭 | `dmt_EditorControl.activateDocument(tabId)` / `closeDocument(tabId)` | 关文档前务必先 `sch_Document.save()` | `references/classes/DMT_EditorControl.md` |
| 保存原理图 | `sch_Document.save()` | 保存当前激活原理图，失败返回 false | `references/classes/SCH_Document.md` |
| 搜器件 | `lib_Device.search(key, …)` / `searchByProperties({supplierId}, …)` | 按关键字 / 立创 C 编号搜库 | `references/classes/LIB_Device.md` |
| 取系统库 UUID | `lib_LibrariesList.getSystemLibraryUuid()` | 组 `{libraryUuid, uuid}` 用 | `references/classes/LIB_LibrariesList.md` |
| 放元件 | `sch_PrimitiveComponent.create({libraryUuid,uuid}, x, y, …)` | 放置器件；component 是对象非字符串 | `references/classes/SCH_PrimitiveComponent.md` |
| 网络标识 | `sch_PrimitiveComponent.createNetFlag('Power'\|'Ground'\|…, net, x, y)` | 电源/地/模拟地/保护地 | `references/classes/SCH_PrimitiveComponent.md` |
| 网络端口 | `sch_PrimitiveComponent.createNetPort('IN'\|'OUT'\|'BI', net, x, y)` | 端口 | `references/classes/SCH_PrimitiveComponent.md` |
| 连线 | `sch_PrimitiveWire.create(line, net?, color?, lineWidth?, lineType?)` | 画线；段必须连通且水平/垂直 | `references/classes/SCH_PrimitiveWire.md` |
| 改元件/导线 | `sch_PrimitiveComponent.modify(id, prop)` / `sch_PrimitiveWire.modify(id, prop)` | 改后需重新 `get()` 读最新值 | `references/classes/SCH_PrimitiveComponent.md`、`SCH_PrimitiveWire.md` |
| DRC | `sch_Drc.check(strict, ui, verbose)` | verbose=true→数组；false→布尔 | `references/classes/SCH_Drc.md` |
| 网表 | `sch_ManufactureData.getNetlistFile(name, 'Protel2')` | 导出网表文件（优先用这个接口） | `references/classes/SCH_ManufactureData.md`、`SCH_Netlist.md` |
| BOM | `sch_ManufactureData.getBomFile('name','xlsx',…,filter)` | 导出 BOM 文件 | `references/classes/SCH_ManufactureData.md` |
| 选中图元 | `sch_SelectControl.doSelectPrimitives(ids)` / `clearSelected()` | 选中/清空 | `references/classes/SCH_SelectControl.md` |
| 存本地文件 | `sys_FileSystem.saveFile(file, fileName)` | 把网表/BOM/图片存到本地 | `references/classes/SYS_FileSystem.md` |
| 取画布图 | `dmt_EditorControl.getCurrentRenderedAreaImage(tabId)` | 返回当前渲染区 Blob | `references/classes/DMT_EditorControl.md` |

坐标单位：原理图 `0.01inch = 10mil`（`1mm ≈ 3.937`）、PCB `1mil`（`1mm ≈ 39.37`）——（`SKILL.md`「Coordinate Unit」）。
文档类型枚举：`EDMT_EditorDocumentType.SCHEMATIC_PAGE = 1`、`PCB = 3`——（`references/enums/EDMT_EditorDocumentType.md`）。
网表格式枚举：`ESYS_NetlistType.ALTIUM_DESIGNER = 'Protel2'`、`EASYEDA_PRO = 'EasyEDA'`、`JLCEDA_PRO = 'JLCEDA'`——（`references/enums/ESYS_NetlistType.md`）。

---

## 附二：真机实测修正（2026-08-29 · esp32_multitool 全流程 + 14 大类覆盖）

以下是在真实网页版画板（esp32_multitool：Board1/Schematic1/P1 + PCB1）上逐类实测后
**修订/确证**的结论，凡与上文冲突处以本节为准：

### ⚠️ 画 PCB：`pcb_Document.importChanges()` 是坑（实测）
- `importChanges()` 返回 `true` 但**元件不进入画布**：`pcb_PrimitiveComponent.getAll()`
  仍为空；`pcb_Net.getNetlist('JLCEDA')` 的 `components` 仍为 `{}`；PCB DRC 随即报
  **Netlist Error（Import Changes 不一致）**，且**清空画布也不消失**（元数据层残留）。
  → **不要用它作为"画 PCB"的路径**。
- ✅ **正确姿势（实测可跑、网表正确）**：直接在 PCB 上放
  ```js
  const dev = (await eda.lib_Device.search('LED'))[0];       // 或 {libraryUuid, uuid}
  await eda.pcb_PrimitiveComponent.create(dev, 1, x, y);      // layer=1=EPCB_LayerId.TOP
  await eda.pcb_PrimitiveVia.create('VCC', x, y, 20, 60);     // 过孔
  await eda.pcb_PrimitiveLine.create('VCC', 1, x1, y1, x2, y2, 10, false); // 走线
  await eda.pcb_Document.save();
  ```
  实测 14 大类元件 `pcb_PrimitiveComponent.create` 全部成功，`pcb_Net.getNetlist('JLCEDA')`
  返回 `components: 14`，DRC 只报真实违规（如 Track↔Via 间距 Clearance Error）。

### ⚠️ 网表/BOM/DRC API 事实（实测修订）
- `sch_ManufactureData.getNetlistFile()` / `getBomFile()` 返回 **File 对象**：桥的 JSON
  序列化会把 File 变成 `{}` —— **必须先 `await f.text()`**（网表）或 `arrayBuffer→base64`
  （BOM 是二进制 xlsx）。
- `sch_Drc.check()` / `pcb_Drc.check()` **必须用 verbose 重载**：`check(true, false, true)`
  返回违规数组；无参调用只返回布尔 `false`（无详情）。
- `sch_Netlist.getNetlist()` **会挂起（30s 超时）**【官方缺陷】——禁用，用
  `sch_ManufactureData.getNetlistFile()`。
- `pcb_Net.getNetlist('EasyEDA')` **会挂起**；`getNetlist('JLCEDA')` 正常。
- `pcb_Net.setNetlist(type, text)` 返回 `true` 但**实测不生效**（netlist 不变）——不要依赖。
- DRC / 网表等 **依赖当前激活文档**：跑 `pcb_*` 前先 `dmt_EditorControl.openDocument(pcb 页)`，
  否则报「指定的主题消息在对应的画布内没有相关订阅」。

### ✅ 14 大类放置实测（每类原理图+PCB 各放一个，全部成功）
电阻 R（R0402/0402WGF1003TCE）、电容 C（C0603/CC0603KRX7R9BB104）、电感 L（L0402/ES0402V014BT）、
二极管 D（1N4148/1N4148WS_C2128）、LED（NCD0805R1）、三极管 Q（S8050/SS8050_C2150）、
MOSFET（AO3400A_C20917）、稳压器（AMS1117-5.0_C6187）、晶振（32.768K/12.5PF）、
连接器（XH2.54 排针）、开关（KEY_2S3mm）、MCU（ESP32-A1S-ES8388）、蜂鸣器（buzzer）、
保险丝（1210L150 PTC）。
→ 同一 `lib_Device.search(keyword)` 结果可直接喂 `sch_PrimitiveComponent.create` 与
`pcb_PrimitiveComponent.create`（器件自带 footprint 关联）。

### 🎯 定位规则（框内放置 · 实测固化——切忌乱放）
**硬规则：生成内容必须落在图纸框内，且避开已有图元。**
1. **读页面尺寸**（单位 10mil）：`dmt_Project.getCurrentProjectInfo()` → `page.titleBlockData.Width/Height`
   （A4 ≈ `1170 × 825`），或 `dmt_Schematic.getSchematicInfo()`。
2. **读已有图元 bbox**：`sch_PrimitiveComponent.getAll()` + `sch_PrimitiveWire.getAll()`
   （在**桥端代码里** map `getState_X/getState_Y/getState_Line`，方法调用必须在扩展内完成）。
3. **选空位**：安全区 = 图框内边距 ≥80（10mil）；100 单位网格步进；候选点与已有图元
   距离 ≥150；从右上往左、从上往下扫首个空位；同类元件排同一行/列并保持间距 ≥100。
4. **引脚级连线**：放元件后 `sch_PrimitiveComponent.getAllPinsByPrimitiveId(id)` 取真实引脚
   坐标（如 R 引脚 `(x±20, y)`、LED `(x±20, y)`），导线只画水平/垂直段，端点落在引脚上。
5. **PCB 定位**：单位 1mil；同样先 `pcb_PrimitiveComponent.getAll()`/`getAllPins()` 读焊盘
   坐标再布线；元件居中排布（demo：R@(2600,3000)、LED@(3800,3000) 同行，via 在延伸线上）。
6. **反例（实测教训）**：`sch_PrimitiveComponent.create(dev, 3200, 3000, …)`（10mil 单位 =
   **813mm**，远超 A4）→ 元件跑到图框外——“不要随便放”的根源；任何放置前先做 1-3 步。

### ⚠️ 完整性边界（实测 · 更新于附二之后）
- **板框画不出来**：`pcb_PrimitiveLine.create(…, layer 11/'11'/'BOARD_OUTLINE')` 四组参数实测
  均报「无法创建直线图元」；**无 createBoardOutline API** → 板框只能人工/导入获得（记录限制）。
- **PCB 电气级连接受限**：直放元件（`pcb_PrimitiveComponent.create`）的焊盘**无网络**；网表同步
  链路（importChanges/setNetlist/getNetlist('EasyEDA')）均实测不可靠 → 走线与焊盘网络不一致，
  DRC 会报 `SMD Pad to Track 0mil`（应≥6mil）。**画布级**（元件/焊盘/走线/过孔/DRC/网表导出/
  截图）完整可用；**电气网络级**自动化受限（需界面操作或官方后续版本）。
- **原理图 DRC 详情**：`sch_Drc.check(true,false,true)` 只返回聚合 `[{type,count}]`（错误明细在
  UI DRC 面板）；PCB 同调用返回**嵌套详情**（规则/对象/层/间距数值）。
- **截图可用**：`dmt_EditorControl.getCurrentRenderedAreaImage(tabId)` → Blob→base64→PNG
  （先 `zoomToAllPrimitives()` 缩放到内容再截，否则可能是空白视口）。
- **`sch_PrimitiveComponent.getAll()` 间歇性报错**「获取所有器件失败」——重试即可（3 次退避）。

---

## 附四：实战代码片段库（cookbook · 全部实测通过）

以下片段直接在 `eda_exec` 的 `code` 中运行（返回 JSON 字符串）。**方法调用必须在扩展内完成**（`getState_X` 等在 Node 侧不存在）。

### 1. 读页面尺寸 + 已有图元分布（定位前置）
```javascript
const proj = await eda.dmt_Project.getCurrentProjectInfo();
const page = proj.data[0].schematic.page[0];
const comps = await eda.sch_PrimitiveComponent.getAll();      // 间歇失败→重试3次
const wires = await eda.sch_PrimitiveWire.getAll();
const used = [];
for (const c of comps) used.push({ x: c.getState_X(), y: c.getState_Y() });
for (const w of wires) { const l = w.getState_Line(); for (let i = 0; i + 1 < l.length; i += 2) used.push({ x: l[i], y: l[i + 1] }); }
const W = Number(page.titleBlockData.Width.value);            // A4 = 1170（10mil）
const H = Number(page.titleBlockData.Height.value);           // A4 = 825
```

### 2. 框内选空位（或用插件工具 `eda_pick_spot`）
```javascript
// 用插件工具更稳：eda_pick_spot {count: 3} → [{x,y},…]（边距80/网格100/间距150）
// 或自己扫：右上→左下，100 步进，与 used 距离 >=150
```

### 3. 放元件 + 真实引脚连线（水平/垂直）
```javascript
const dev = (await eda.lib_Device.search('R0402'))[0];        // 或 'LED' 等
const c = await eda.sch_PrimitiveComponent.create(dev, 990, 180, undefined, 0, false, true, true);
const pins = (await eda.sch_PrimitiveComponent.getAllPinsByPrimitiveId(c.getState_PrimitiveId()))
  .map(p => ({ x: p.getState_X(), y: p.getState_Y() })).sort((a, b) => a.x - b.x);
await eda.sch_PrimitiveWire.create([[pins[0].x, pins[0].y, pins[1].x, pins[1].y]]);  // 同 y 直线
await eda.sch_PrimitiveComponent.createNetFlag('Power', 'VCC', pins[1].x + 100, pins[1].y, 0, false);
```

### 4. 网表文本（File → text！直接返回 File 会序列化成 {}）
```javascript
const f = await eda.sch_ManufactureData.getNetlistFile();
const netlistText = f ? await f.text() : null;               // EasyEDA JSON 文本
```

### 5. BOM（二进制 xlsx → base64）
```javascript
const f = await eda.sch_ManufactureData.getBomFile();
const bytes = new Uint8Array(await f.arrayBuffer());
let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
return { name: f.name, size: f.size, b64: btoa(bin) };        // 解码写盘即合法 xlsx
```

### 6. DRC（必须 verbose 重载才有详情）
```javascript
const violations = await eda.sch_Drc.check(true, false, true); // 聚合 [{type,count}]（明细在UI面板）
const pcbViolations = await eda.pcb_Drc.check(true, false, true); // 嵌套详情 {ruleName,obj1,obj2,layer,explanation}
```

### 7. PCB：放置 + 焊盘坐标 + 焊盘级走线（1mil 单位）
```javascript
const dev = (await eda.lib_Device.search('LED'))[0];
const c = await eda.pcb_PrimitiveComponent.create(dev, 1, 3800, 3000, 0, false); // layer 1 = TOP
const fresh = await eda.pcb_PrimitiveComponent.get(c.getState_PrimitiveId());
const pads = (await fresh.getAllPins()).map(p => ({ x: p.getState_X(), y: p.getState_Y() })).sort((a, b) => a.x - b.x);
await eda.pcb_PrimitiveVia.create('VCC', pads[0].x - 300, pads[0].y, 20, 45);
await eda.pcb_PrimitiveLine.create('VCC', 1, pads[0].x - 300, pads[0].y, pads[0].x, pads[0].y, 10, false);
await eda.pcb_PrimitiveLine.create('', 1, pads[1].x, pads[1].y, pads2[0].x, pads2[0].y, 10, false); // 中间段
```

### 8. 现场截图（先 zoom 再截，否则是空白视口）
```javascript
await eda.dmt_EditorControl.zoomToAllPrimitives();
const info = await eda.dmt_SelectControl.getCurrentDocumentInfo();
const blob = await eda.dmt_EditorControl.getCurrentRenderedAreaImage(info.tabId); // Blob→arrayBuffer→base64→PNG
```

### 9. 清理（分类型删除，勿混传 id）
```javascript
await eda.sch_PrimitiveComponent.delete(compIds);             // 元件+网络标志
await eda.sch_PrimitiveWire.delete(wireIds);                  // 导线
await eda.pcb_PrimitiveComponent.delete(pcbIds); await eda.pcb_PrimitiveVia.delete(viaIds); await eda.pcb_PrimitiveLine.delete(lineIds);
// 混传（component+wire 一个数组）实测返回 false！
```

## 附五：已知缺陷速查表（官方 API 边界 · 实测）

| 现象 | 结论 | 对策 |
|---|---|---|
| `pcb_Document.importChanges()` 返回 true 但画布无元件、网表不变、留 Netlist Error | 不可用于"画 PCB" | 用 `pcb_PrimitiveComponent.create` 直接放置 |
| `pcb_Net.setNetlist(type, text)` 返回 true 但网表不更新 | 无效 | 不依赖；网表一致性受限于官方 |
| `sch_Netlist.getNetlist()` / `pcb_Net.getNetlist('EasyEDA')` 挂起 30s | 官方缺陷 | 用 `sch_ManufactureData.getNetlistFile`（File.text）/ `pcb_Net.getNetlist('JLCEDA')` |
| `sch_Drc.check()` / `pcb_Drc.check()` 无参只返回布尔 | 无详情 | 用 `check(true, false, true)` |
| 网表/BOM 返回 `{}` | File 对象被 JSON 序列化 | `await f.text()`（网表）/ arrayBuffer→base64（BOM xlsx） |
| `getAll` 报「获取所有器件失败」 | 间歇性 | 重试 3 次（间隔 700ms） |
| PCB 板框（layer 11）`pcb_PrimitiveLine.create` 四组参数全失败 | 官方无绘制 API | 板框人工/导入获得 |
| 原理图 DRC verbose 只有聚合 `[{type,count}]` | 明细在 UI 面板 | 结合 UI 查看；PCB 版有嵌套详情 |
| 直放 PCB 元件焊盘无网络 | 电气级未互联 | 画布级可用；电气网络级待官方改进 |
| 坐标乱放（如 sch x=3200） | 10mil 单位=A4 外 813mm | 先 `eda_pick_spot`/读尺寸再放（见定位规则） |
| 未保存就切页/关文档 | 丢改动 | 每步 `sch_Document.save()`/`pcb_Document.save()` |

## 附六：建议技巧清单（0 基础友好）

1. **AI 生成全流程**：定位（eda_pick_spot）→ 放件（create）→ 引脚连线（getAllPinsByPrimitiveId）→
   网络标志（createNetFlag Power/Ground）→ 保存 → DRC（verbose）→ 网表/BOM 导出（File.text/base64）→
   PCB（create + getAllPins + 走线/过孔 + save）→ PCB DRC → 紧急保存（`eda_snapshot`）。
2. **每次只做一小步并验证**（官方 API 慢/不稳，长代码一次执行易 30s 超时）。
3. **搜索器件用英文关键词**（'R0402'/'LED'/'10K'/'ESP32'/'BUZZER'…），搜索结果直接可喂 create。
4. **不确定坐标就缩小范围**：先读布局（见代码 #1），不猜。
5. **位号 "?" 是正常的**（自动编号在保存/重编号后刷新），不需要手工改。
6. **测试画板恢复**：按"清理"片段按类型删除；测试区用坐标隔离（如 sch x≥2500 / PCB x≥900），
   只删测试区，用户内容不动。
7. **快照即答案**：任何"画完了/乱套了/怕丢"的情况 → `eda_snapshot`（会存 .epro2 + SVG 预览 +
   网表/BOM + 动作日志，0 降级）。

## 附七：官方 Skill 全库接入（eda_skill_read）

官方 easyeda-api-skill 知识已随插件 vendored（包内 `skill/`：SKILL.md 总纲、references/classes/*.md 逐类 API、
guide/、user-guide/、format/）。**规划任何画板动作前**：`eda_skill_read`（doc='INDEX.md'）看导航 →
按任务找类文档 → 读该类文档 → `eda_exec` 落地。建议顺序：INDEX.md → SKILL.md（坐标系/常见错误）→
目标类文档（如 references/classes/SCH_PrimitiveComponent.md）→ 参考资料中的示例代码。
文档很长时分页：truncated=true 时用 nextOffset 继续读。

**线上权威源**：官方「扩展 API 参考」https://prodocs.easyeda.com/cn/api/reference/pro-api.html
（与 vendored 同代文档；线上存在更新差异时以 prodocs 为准，并留意反馈。）

