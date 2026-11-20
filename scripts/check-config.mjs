// theme.json 的 config 默认值，必须与 src/lib/site-settings.ts 的 DEFAULTS 逐项一致。
//
// 这两处是同一个开关的两半：面板按 theme.json 现画表单，页面按 DEFAULTS 兜底。
// 只改一处就是那种「后台显示开着、页面还是旧样子」的毛病，而且两边都不报错。
//
// 用法：node scripts/check-config.mjs（npm run check，打包脚本与 CI 都会调）
import { readFileSync } from 'node:fs'

const manifest = JSON.parse(readFileSync('theme.json', 'utf8'))
const fields = (manifest.config || []).filter((entry) => entry.type !== 'title' && entry.key)
if (!fields.length) throw new Error('theme.json 的 config 里没有任何设置项')

const source = readFileSync('src/lib/site-settings.ts', 'utf8')
const block = source.match(/export const DEFAULTS[^=]*=\s*\{([\s\S]*?)\n\}/)
if (!block) throw new Error('src/lib/site-settings.ts 里找不到 DEFAULTS')
const declared = {}
for (const line of block[1].split('\n')) {
  const m = line.match(/^\s*([A-Za-z_$][\w$]*)\s*:\s*(.+?),?\s*$/)
  if (m) declared[m[1]] = m[2].replace(/,$/, '').trim()
}

const problems = []
for (const field of fields) {
  if (!(field.key in declared)) {
    problems.push(`${field.key}: theme.json 有、DEFAULTS 里没有`)
    continue
  }
  // 去掉引号后照字面比：布尔、数字、字符串三种默认值都够用，不做求值。
  const code = declared[field.key].replace(/^["'`]|["'`]$/g, '').trim()
  const json = String(field.default).trim()
  if (code !== json) problems.push(`${field.key}: theme.json 是 ${json}、DEFAULTS 是 ${code}`)
}
for (const key of Object.keys(declared)) {
  if (!fields.some((f) => f.key === key)) problems.push(`${key}: DEFAULTS 有、theme.json 里没有`)
}
if (problems.length) throw new Error(`设置项默认值两边不一致：\n  ${problems.join('\n  ')}`)
console.log(`设置项默认值一致：${fields.map((f) => `${f.key}=${f.default}`).join('、')}`)

// 站名缓存键由 App 与 index.html 的首屏脚本共用，不再使用旧版 /api/me title probe。
const CACHES = [
  { what: '站名', key: 'jikasei:site_name', places: [
    ['src/App.tsx', /TITLE_CACHE_KEY\s*=\s*"([^"]+)"/g],
    ['index.html', /localStorage\.getItem\("(jikasei:[^"]+)"\)/g],
  ] },
// 明暗这一档同源两处：App 的 useTheme 读 / 写 / 删，index.html 的首帧脚本事先读一次。
  { what: '明暗', key: 'theme', places: [
    ['src/App.tsx', /localStorage\.getItem\("(theme)"\)/g],
    ['index.html', /localStorage\.getItem\("(theme)"\)/g],
  ] },
]
const bad = []
for (const cache of CACHES) {
  for (const [file, pattern] of cache.places) {
    const found = [...readFileSync(file, 'utf8').matchAll(pattern)].map((m) => m[1])
    if (!found.length) bad.push(`${cache.what}：${file} 里找不到缓存键（护栏的锚点没了，别当通过）`)
    for (const value of found) if (value !== cache.key) bad.push(`${cache.what}：${file} 里是 ${value}，应为 ${cache.key}`)
  }
}
const html = readFileSync('index.html', 'utf8')
// 旧版 /title-probe.js 已移除：站名由 /api/config 一次性加载并由 App 更新。
// 站点图标的两条静态引用：hub 1.4.0 认的就是这两个路径，写成别的名字等于把兜底丢了。
for (const icon of ['/favicon.svg', '/apple-touch-icon.png']) {
  if (!html.includes(`href="${icon}"`)) bad.push(`index.html 里没有引用 ${icon}（站点图标的兜底就断了）`)
}
// ★ 首帧明暗（2026-11-06）：暗色访客在入口包执行之前页面上只有 CSS 默认的亮色底 —— 首绘会先
//   闪一屏亮色，弱网下这段最长。那一段必须内联在 <head>、并且赶在入口模块之前；它还得把
//   colorScheme 说清楚，否则暗色下原生滚动条 / 表单控件仍是亮色。CSS 里另有一份给「内联被
//   CSP 挡掉」时兜底（React 挂上 .dark 之后原生控件照样要跟着转暗）。
{
  const toggleAt = html.indexOf('document.documentElement.classList.toggle("dark"')
  const moduleAt = html.indexOf('<script type="module"')
  if (toggleAt < 0) bad.push('index.html 里没有首帧明暗的内联脚本（暗色访客会先闪一屏亮色）')
  else {
    if (moduleAt >= 0 && toggleAt > moduleAt) bad.push('首帧明暗那段内联脚本在入口模块之后：它必须赶在首帧之前跑（挪回 <head> 里）')
    if (!html.includes('document.documentElement.style.colorScheme')) bad.push('首帧明暗那段没有设 colorScheme（暗色下原生滚动条与表单控件仍是亮色）')
  }
  const css = readFileSync('src/index.css', 'utf8')
  if (!css.includes('color-scheme: dark')) bad.push('src/index.css 的 .dark 没有 color-scheme: dark（原生控件不会转暗）')
  if (!css.includes('color-scheme: light')) bad.push('src/index.css 的 :root 没有 color-scheme: light（原生控件不会转亮）')
}
if (bad.length) throw new Error(`缓存键或首帧脚本对不上：\n  ${bad.join('\n  ')}`)
console.log(`缓存键一致：${CACHES.map((c) => `${c.what} ${c.key}（${c.places.length} 处）`).join('、')}；CFSM 站点图标由默认皮肤提供`)
