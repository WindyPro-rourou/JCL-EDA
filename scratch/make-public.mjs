// Dev: make JCL-EDA public + fix repository description (utf8-safe via node fetch).
const TOKEN = process.env.GH_TOKEN
const DESCR = 'dsh-lichuang-eda (JCL-EDA): 嘉立创 EDA 助手 DSH 插件 —— 官方 eda.* API 云端实时生成(原理图/PCB) + 离线标准版 JSON 兜底 + 面板记录式时间线(撤回/清空/紧急保存)。npm i github:WindyPro-rourou/JCL-EDA 开箱即用。'

const r = await fetch('https://api.github.com/repos/WindyPro-rourou/JCL-EDA', {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    'User-Agent': 'dsh-push',
    'content-type': 'application/json',
    accept: 'application/vnd.github+json',
  },
  body: JSON.stringify({ visibility: 'public', description: DESCR }),
})
const out = await r.json()
console.log('HTTP', r.status)
console.log(JSON.stringify({ full_name: out.full_name, private: out.private, description: out.description, message: out.message }, null, 2))
