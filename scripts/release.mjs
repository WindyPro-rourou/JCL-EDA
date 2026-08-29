/**
 * 发版脚本：bump 版本 → npm publish → git commit + push（GitHub）。
 *
 * Token 从环境变量读取（不进仓库）：
 *   $env:GH_TOKEN='ghp_…'   $env:NPM_TOKEN='npm_…'
 * 用法：node scripts/release.mjs --version=0.1.1
 * （本机 git 需走本地代理时脚本自动检测系统代理并传给 git。）
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const version = process.argv.find((a) => a.startsWith('--version='))?.slice('--version='.length)
if (!version || !/^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/.test(version)) {
  console.error('用法: node scripts/release.mjs --version=0.1.1')
  process.exit(1)
}
if (!process.env.NPM_TOKEN || !process.env.GH_TOKEN) {
  console.error('需要环境变量 NPM_TOKEN 与 GH_TOKEN（npm 访问令牌 / GitHub PAT）')
  process.exit(1)
}

const pkgPath = join(ROOT, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
const oldVersion = pkg.version
pkg.version = version
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
console.log(`版本: ${oldVersion} → ${version}`)

// 1) npm publish（scripts/publish.mjs 走官方 registry；token 环境变量引用）
execFileSync(process.execPath, [join(ROOT, 'scripts', 'publish.mjs')], {
  cwd: ROOT, stdio: 'inherit', env: { ...process.env },
})
console.log('✅ npm publish 完成')

// 2) git commit + push（走系统代理：git 直连 github.com 常被断）
const proxyCmd = ['-c', 'http.proxy=http://127.0.0.1:7890']
const git = (args) => execFileSync('git', [...proxyCmd, ...args], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' })
git(['add', 'package.json'])
git(['commit', '-m', `release v${version}`])
const pushUrl = `https://x-access-token:${process.env.GH_TOKEN}@github.com/WindyPro-rourou/JCL-EDA.git`
git(['push', pushUrl, 'main'])
console.log('✅ GitHub 推送完成')
console.log('⚠️  若上述 token 失效：重新生成后放入环境变量即可，无需改任何文件。')
