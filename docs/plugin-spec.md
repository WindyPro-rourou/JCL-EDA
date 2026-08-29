# DSH 插件规范（以 @windypro-rourou/dsh-eda 实现为例）

> 本文基于本插件（`lib/`、`cordis.patch.yml`、`package.json`）的**实测实现**整理，
> 全部示例可直接对照本仓库真实代码，无需参照其它插件。

## 1. 包清单（package.json）

```json
{
  "name": "@windypro-rourou/dsh-eda",
  "type": "module",
  "main": "lib/index.js",
  "exports": { ".": "./lib/index.js", "./client": "./lib/client.js", "./package.json": "./package.json" },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "inject": ["@deepseek-ai/dsh-client-runtime"], "platform": "web" }
  },
  "files": ["lib/**/*.js", "src/**/*.js", "cordis.patch.yml", "README.md"],
  "peerDependencies": { "react": "^18.2.0", "react-dom": "^18.2.0" }
}
```

- `dsh.bundle.patch`：bundle 层挂载配置；`dsh.client` 声明浏览器半（`exports "./client"` 由 web shell 以
  `/plugins/<pkg>/client.js` 提供）。
- `files` 必须包含运行期引用的所有源码（本插件 `src/` 生成器在包内，`lib` 以 `../src/…` 相对引入）。
- 无 runtime dependencies（`@deepseek-ai/dsh-tools`、`react` 等由 DSH 宿主提供，声明为 peer）。

## 2. 宿主端插件结构（lib/index.js）

```js
export const name = 'eda'                    // cordis 插件名（小写短名）
export const inject = ['webServer', 'tools', 'systemPrompt']   // 依赖的表面
export const provide = ['eda']               // 本插件在 ctx 上提供的服务名

export function apply(ctx, config) {
  // 1) 服务句柄 + ctx.provide('eda', handle)（stub/测试兼容 else 分支）
  // 2) ctx.systemPrompt.section({ name:'plugin:dsh-eda', order:153, text: EDA_GUIDANCE })
  // 3) ctx.webServer.register({ kind:'exact', path:'/api/dsh-eda/status', handler(req,res) })
  // 4) ctx.tools.register(defineTool({ name, description, parameters, output:{schema,render}, execute }))
  // 5) ctx.effect(() => () => { backend.dispose() }, 'dsh-eda: backend')   // 纯清理
}
```

- **路由对象**：`{ kind:'exact', path, handler(req,res) }`；handler 先 loopback 校验 + 方法守卫，再 `writeJson`。
- **`apply` 可被多次调用**（热重载/测试），每个 effect 都要返回 disposer；本插件用 `sync()` 模式
  （配置变化时先 dispose 旧的 routes/tools/section 再注册新的）。
- **自检/测试桩**：stub ctx 只需提供 `tools.register / webServer.register / systemPrompt.section /
  provide / effect` 五个成员（见 `selfcheck.mjs` 与 `test/*.test.mjs`）。

## 3. agent 工具（defineTool 契约）

### 3.1 参数 schema

```js
parameters: {
  code: { type: 'string', description: '官方 eda.* JS 代码，例如 return await eda.dmt_Project.getCurrentProjectInfo();' },
}
```

- 顶层 `parameters` 下**每个属性必须声明 `type`**；可选参数不写 `required`。

### 3.2 输出 schema 与 render

```js
output: {
  schema: {
    type: 'object',
    additionalProperties: false,          // 严格：execute 返回值不能带未声明字段
    properties: {
      ok: { type: 'boolean', required: true },
      result: { type: 'string' },
      error: { type: 'string' },
    },
  },
  render: (_args, value) => ({ type: 'text', text: value?.ok ? `执行结果:\n${value.result ?? ''}` : `执行失败: ${value?.error ?? '?'}` }),
}
```

- **关键陷阱（实测踩过）**：`additionalProperties:false` + 返回值多字段 → DSH 直接拒绝结果（`ToolOutputError`）；
  `items` 级**不支持 `required` 数组**（用属性级 `required: true`）；`render` 必须返回**数组**（`[{type:'text',…}]`）。

### 3.3 execute 的第二个参数 = 执行上下文

`async execute(args, exec)` 中 `exec` 携带 `agent.id`（= 会话 ID）、`signal`、`deferContext()`——
本插件用它做**按会话隔离**的活动时间线（`sessionIdOf(exec)`），并支持 pending→done 两步记录。

## 4. 浏览器端（lib/client.js）

- 唯一 bundle 格式：`window.__ModuleLoader__.load({ id: '@windypro-rourou/dsh-eda', factory: (require) => {…} })`；
- `exports.apply(ctx)`：挂样式、侧边栏条目、React 面板；`exports.inject = ['slots']`（等 fiber 就绪）；
- `ctx.effect(() => () => {…}, 'dsh-eda: ui mounts')` 交付 disposer；
- 侧边栏条目通过 `[data-dsh-...-entry]` 家族选择器**按序插入**（不覆盖任何既有条目）。

## 5. 命名约定速查

| 位置 | 本插件（eda） |
|---|---|
| cordis 名 / provide | `'eda'` / `'eda'` |
| systemPrompt section | `{ name:'plugin:dsh-eda', order:153 }` |
| API 基址 | `/api/dsh-eda`（routes: status/activity/activity-clear/activity-revoke/templates/bridge/install/generate/snapshot） |
| 工具 | `eda_status / eda_template_list / eda_translate_request / eda_generate_schematic_json / eda_bridge_install / eda_backend_connect / eda_exec / eda_pick_spot / eda_capabilities / eda_snapshot / eda_sch_drc / eda_get_netlist / eda_get_bom`（13 个） |
| client bundle id | `@windypro-rourou/dsh-eda` |

## 6. 待核/注意事项

1. `client` 侧 `inject = ['slots']` 在 web 纤维中的真实语义（已按 shell 约定使用，客户端深度渲染测试覆盖）。
2. `window.__ModuleLoader__.load` 的 `id` 与包名一致（bundle 按包名路由）。
3. 运行期依赖都由宿主提供（`@deepseek-ai/dsh-tools`、react/react-dom）；发布包不带 node_modules。
