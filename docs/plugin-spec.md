# DSH 插件 API 规格备忘（dsh-lichuang-eda）

> 本文记录从权威范本 `@windypro-rourou/dsh-logcat`（v0.6.5，安装于 `~/.dsh/profiles/web/node_modules`）与
> `@deepseek-ai/dsh-tools`（v0.1.1-rc.2，位于 DSH checkout 的 `node_modules`）中**确认**的 API 签名与用法，
> 作为后续接 EDA 后端的依据。所有条目均标注来源；未确认处明确注明。

---

## 1. 包清单（package.json）——来自 dsh-logcat

```jsonc
{
  "name": "@xxx/dsh-xxx",          // 包名 = cordis 插件行的 name
  "type": "module",                // ESM
  "engines": { "node": "^22.19.0 || >=24.0.0" },
  "main": "lib/index.js",
  "exports": {
    ".":           { "default": "./lib/index.js" },   // 宿主端（node 半区）
    "./client":    { "default": "./lib/client.js" },  // 浏览器半区
    "./package.json": "./package.json"
  },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },       // 随包携带 profile bundle patch
    "client": {
      "inject": ["@deepseek-ai/dsh-client-runtime"],   // web shell 据此装载浏览器半区
      "platform": "web"
    }
  }
}
```

`cordis.patch.yml` 内容（bundle patch，向 web profile 名册插入插件行）：

```yaml
- insert:
    - id: eda
      name: '@dsh-lichuang/dsh-eda'
```

---

## 2. 宿主端插件结构（lib/index.js）——来自 dsh-logcat

```js
import { defineTool } from '@deepseek-ai/dsh-tools'   // 官方 NPM 包，DSH 自带

export const name = 'logcat'             // cordis 插件名（小写短名）
export const inject = ['webServer', 'tools', 'systemPrompt']  // 挂载前等待的服务
export const provide = ['logcat']        // 本插件在 ctx 上提供的服务名

export function apply(ctx, config) {     // cordis 入口；config 可选
  // ...
}
```

### 2.1 `ctx.provide(name, handle)`

```js
if (typeof ctx.provide === 'function') ctx.provide('logcat', logcatHandle)
else ctx.logcat = logcatHandle           // 对 plain-object stub 的兜底（自检用）
```

- 真实 cordis 上下文**拒绝裸属性赋值**（"cannot set property without provide"），必须走 `ctx.provide`。
- handle 是普通对象，可含 `status()` 等方法。

### 2.2 `ctx.systemPrompt.section({ name, order, text })`

```js
disposeSection = ctx.systemPrompt.section({
  name: 'plugin:dsh-logcat',     // section 名（命名空间：plugin:<name>）
  order: SECTION_ORDER,          // 数字排序（logcat 用 152；dsh-eda 用 153）
  text: logcatGuidance(engine),  // 可以是字符串，也可以是返回字符串的函数（动态通告）
})
```

- 返回 disposer；`sync()` 重新执行前先调用旧 disposer。

### 2.3 `ctx.webServer.register(route)` / `ctx.webServer.registerUpgrade(upgrade)`

路由对象（`kind:'exact'` + `path` + `handler(req,res)`，来自 logcat `makeRoutes`）：

```js
const API_BASE = '/api/dsh-logcat'

{
  kind: 'exact',
  path: API_BASE + '/status',
  handler: async (req, res) => {
    if (!isLoopbackRequest(req)) { writeJson(res, 403, { error: 'forbidden: loopback-only' }); return }
    if ((req.method ?? 'GET') !== 'GET') { writeJson(res, 405, { error: 'method not allowed' }); return }
    writeJson(res, 200, handle.status())
  },
}
```

辅助函数：

```js
function isLoopbackRequest(req) {
  const address = req.socket?.remoteAddress ?? ''
  const host = req.headers?.host ?? ''
  // 地址须为 ::1 / 127.0.0.1 / ::ffff:127.* / 127.*，且 Host 须为 localhost 或 127.*
}
function writeJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'referrer-policy': 'no-referrer' })
  res.end(JSON.stringify(body))
}
```

- `register` 返回 disposer；`registerUpgrade` 用于 WebSocket（`{path, upgrade(ws, req)}`，logcat 用 `WebSocketServer({ noServer: true })` + `ws` 包）。
- **未确认**：`kind` 的其他取值（prefix/regex 等）未在范本中见到。

### 2.4 `ctx.tools.register(tool)` 与 `ctx.effect(fn, label)`

```js
disposeRoutes = ctx.effect(() => {
  const disposers = routes.map((route) => ctx.webServer.register(route))
  const upgradeDisposer = ctx.webServer.registerUpgrade(upgrade)
  return () => { for (const dispose of disposers) dispose(); upgradeDisposer() }
}, 'dsh-logcat: routes')

disposeTools = ctx.effect(() => {
  const disposers = [toolA, toolB].map((tool) => ctx.tools.register(tool))
  return () => { for (const dispose of disposers) dispose() }
}, 'dsh-logcat: tools')

ctx.effect(() => () => { engine.dispose() }, 'dsh-logcat: engine')   // 纯清理
```

- `ctx.effect(fn, label)`：fn 同步执行，返回值（disposer）在插件卸载/重跑时被调用。
- `ctx.tools.register(definition)` 返回**精确的 disposer**。

### 2.5 `apply(ctx, config)` 对 ctx 桩对象的要求（自检/测试用，来自 logcat selfcheck.mjs）

```js
const ctx = {
  webServer:    { register: (route) => { /* 收集；返回 disposer */ } },
  tools:        { register: (tool) => { /* 收集；返回 disposer */ } },
  systemPrompt: { section: (s) => { /* 收集；返回 disposer */ } },
  provide:      (key, value) => { /* 挂到 ctx[key] */ },   // logcat 桩省略它，走 else 兜底
  effect:       (fn) => { const dispose = fn(); return dispose ?? (() => {}) },  // 必须同步执行 fn()
}
```

要点：

- `ctx.effect` 桩必须**同步执行 `fn()`**，否则 routes/tools 的注册不会发生；返回的 disposer 可丢弃。
- `ctx.provide` 是真实 cordis 上下文必需的（裸属性赋值会报 "cannot set property without provide"）；插件保留 `else ctx.xxx = handle` 兜底，但自检/测试桩应提供 provide 以覆盖真实路径。
- `ctx.tools.register` / `ctx.webServer.register` / `ctx.systemPrompt.section` 均返回 `() => void` disposer。
- `config` 传 `{}` 时 `enabled` / `announceToAgent` 默认 `true`，四个表面全部注册。
- 桩不需要提供 `inject` 声明之外的其它成员（本插件无 engine/dispose 收尾逻辑，与 logcat 不同，无需 `engine.dispose()`）。

---

## 3. `defineTool` 的确切签名——来自 `@deepseek-ai/dsh-tools` 类型定义

源码：`<dsh checkout>/node_modules/@deepseek-ai/dsh-tools/lib/types/schema.d.ts`（v0.1.1-rc.2）。

```ts
declare function defineTool<const S extends ParameterSchemaSpec, const O extends ValueSchemaSpec>(
  options: DefineToolOptions<S, O>
): ToolDefinition
```

`DefineToolOptions`（字段与含义）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `name` | `string` | 工具名，必须唯一 |
| `description` | `string` | 发给模型的人类可读描述（logcat 惯例含 `Triggers: ...` 措辞） |
| `parameters` | `ParameterSchemaSpec` | 每属性的参数 schema，编译为隐式 open object root |
| `output` | `{ schema, render, presentationMeta? }` | 规范化输出契约 |
| `output.schema` | `ValueSchemaSpec` | 对每个成功返回值强制校验的 schema |
| `output.render(args, value)` | `(args, value) => ContentBlock[]` | 纯投影：规范化值 → 模型可见内容 |
| `output.presentationMeta?` | `(args, value) => JsonValue` | 顶层调用时纯可回放展示元数据 |
| `timeoutMs?` | `number` | 合作式超时预算（可选） |
| `isConcurrencySafe?` | `(args) => boolean` | 并行分组分类器（可选） |
| `execute(args, exec)` | `(args, exec: ToolRunContext) => Promise<InferValue<O>>` | 执行体，返回规范化 JSON 值 |
| `finalizeContent?` / `presentCall?` / `presentResult?` | 可选 | 内容末段变换 / 待执行 / 完成态展示 |

### 3.1 参数 schema（`ParameterSchemaSpec`）

```ts
type ParameterPropertySpec = ValueSchemaSpec & { required?: true }
type ParameterSchemaSpec = { [key: string]: ParameterPropertySpec; [key: symbol]: never }
```

- map 本身是隐式 open object root；**必填是每属性上的 `required: true` 注解**。
- `ValueSchemaSpec`：`type` ∈ `'string' | 'number' | 'integer' | 'boolean' | 'null' | 'array' | 'object' | 'json' | oneOf`，可带 `description/title/default/examples/enum/const`、数组 `items`、对象 `properties` + **必填 `additionalProperties`**。

logcat 实际用法（`logcat_recent`）：

```js
parameters: {
  serial: { type: 'string', description: 'Device serial from logcat_devices (optional; defaults to the first attached device).' },
  lines: { type: 'integer', description: 'Max entries to return (default 200, max 2000).' },
  level: { type: 'string', enum: ['V', 'D', 'I', 'W', 'E', 'F'], description: '...' },
},
```

### 3.2 输出 schema 与 render（logcat 实际用法）

- 输出 schema 是**严格模式**：`type:'object'` + `additionalProperties: false` + `properties`，每个属性可用 `required: true`：

```js
output: {
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      entries: {
        type: 'array',
        required: true,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ts: { type: 'string', required: true },
            pid: { type: 'integer', required: true },
            // ...
          },
        },
      },
      note: { type: 'string' },
    },
  },
  render: (_args, value) => {
    // value 是已验证的规范化值
    return [{ type: 'text', text: '...' }]   // ContentBlock[]
  },
},
```

- `render` 返回 `ContentBlock[]`，当前只用到 `{ type: 'text', text }`。
- **关键陷阱（logcat 源码注释明示）**：schema 严格（`additionalProperties:false`），execute 返回值不能携带未声明字段，否则 DSH 拒绝结果 —— 返回前要 strip 内部字段。

### 3.3 execute

```js
async execute(args) {
  // args 已经过参数 schema 校验（类型收窄）
  // 返回必须匹配 output.schema
  return { entries: [...] }
}
```

- `execute(args, exec)` 的第二个参数 `exec: ToolRunContext` 含 `deferContext()` / `concludeTurn()`（本骨架未用到）。
- `ToolDefinition`（注册后的形态）：`extends ToolSchema`（name/description/parameters），另有 `output`、`execute` 及可选回调。

### 3.4 其它确认

- `ctx.tools.register` 返回 `() => void` disposer（`ToolRuntime.register(definition): () => void`）。
- dsh-tools 包版本 **0.1.1-rc.2**，peer 依赖 `@deepseek-ai/cordis@^4.0.1` 等（DSH 自带，插件无需声明）。

---

## 4. 浏览器端（lib/client.js）——来自 dsh-logcat

### 4.1 Bundle 格式（web shell 唯一支持的形式）

```js
window.__ModuleLoader__.load({
  id: "@xxx/dsh-xxx",                    // = 包名
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    const { createElement: h, ... } = require("react");
    const { createRoot } = require("react-dom/client");
    // ...组件与挂载代码...
    exports.apply = apply;               // 必须导出
    exports.inject = inject;             // 必须导出
    return module.exports;
  }
});
```

### 4.2 客户端入口

```js
const inject = ["slots"];                // 纤维注入等待（logcat 原样使用）

function apply(ctx) {
  // 1) 注入 <style>
  // 2) mountSidebarEntry(controller)：DOM 级侧边栏按钮 + MutationObserver 自愈
  // 3) mountPanel(controller)：body 上建抽屉容器 + createRoot().render(<Panel/>)
  ctx.effect(() => () => { /* 全部 disposer + style.remove() */ }, "dsh-eda: ui mounts");
}
```

- 面板容器：`document.createElement('div')` → `document.body.appendChild` → `createRoot(panel).render(...)`，用 `container.hidden` 控制显隐。
- 侧边栏入口：在 `[data-pane="sidebar"]` 或 `[class*="sidebarCol"]` 里找 `newSession` 按钮附近插入 button；MutationObserver 监听 DOM 重建自愈。
- API 调用：`fetch(API_BASE + "/status")`；WebSocket 用 `(https? ? wss : ws)://host + API_BASE + "/stream"`（本骨架未用 WS）。

---

## 5. dsh-eda 骨架中已落实的对应关系

| 范本条目 | dsh-eda 实现 |
|---|---|
| `name: 'logcat'` | `name: 'eda'` |
| `inject: ['webServer','tools','systemPrompt']` | 同（逐字照抄） |
| `provide: ['logcat']` | `provide: ['eda']`，`ctx.provide('eda', edaHandle)` |
| `ctx.systemPrompt.section({name:'plugin:dsh-logcat', order:152, ...})` | `{name:'plugin:dsh-eda', order:153, text: EDA_GUIDANCE}`（中文通告） |
| `makeRoutes` → `GET /api/dsh-logcat/status` | `GET /api/dsh-eda/status`（loopback 校验简化版） |
| `logcat_recent` 工具 | `eda_status` 工具（parameters:{}，output.schema 严格模式，render 返回 text 块） |
| `ctx.effect` 包 routes/tools disposer | 同（逐字照抄） |
| client bundle `__ModuleLoader__.load` + `exports.apply/inject` + `ctx.effect` | 同（逐字照抄） |

## 6. 尚未确认 / 待验证项

1. `dsh plugin --profile web add link:<path>` 的本地路径参数语法（logcat README 两种方式均列出，未实测）。
2. 客户端 `inject = ["slots"]` 在 web 纤维里的真实含义（照抄 logcat，未验证）。
3. `ctx.webServer.register` 的 `kind` 取值全集（只确认 `'exact'`）。
4. `window.__ModuleLoader__.load` 的 id 是否必须等于包名（logcat 用包名，照抄）。
5. 浏览器面板的实际挂载效果（需重启 GUI 验证侧边栏入口）。
