// One-shot dev: restore lib/index.js from git HEAD (utf8-safe) + rewrite imports.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
const out = execFileSync('git', ['show', 'HEAD:plugin/lib/index.js'], { encoding: 'utf8' })
const before = (out.match(/\.\.\/\.\.\/src/g) || []).length
const fixed = out.replaceAll("'../../src/", "'../src/")
writeFileSync(new URL('../lib/index.js', import.meta.url), fixed, 'utf8')
console.log('restored, replaced', before, 'occurrences; mojibake?', /鏈|鈥|鐢|涓|锛/.test(fixed), 'utf16?', fixed.includes('\u0000'))
