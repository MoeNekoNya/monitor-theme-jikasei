import { useCallback, useEffect, useState } from "react"

import { getSiteConfig } from "@/lib/api"
import { cardStyleOrNull, DEFAULTS, normalizeConfig, type ThemeConfig } from "@/lib/site-settings"

/**
 * 站点级设置：只存 Hub（`/api/themes/<short>/config`），一个站一份，不落访客的浏览器——
 * 访客自己的偏好（深浅色）才用 localStorage。后台「主题设置」表单按 theme.json 的
 * `config` 现画，两边靠 key 对上；默认值与迁移规则在 `site-settings.ts`（那里能单测），
 * `scripts/check-config.mjs` 在打包前兜底。
 */

/** 访客自己的卡片形态偏好，只记在访客自己的浏览器里。 */
const CARD_STYLE_KEY = "jikasei:card_style"

/**
 * 列表用哪种卡片形态。返回的是**最终生效**的那一档与一个选择函数：
 * 访客选的记下来；选成和站长设置一样的那档时**把记录删掉**（= 重新"跟着站长走"，
 * 以后站长改默认，这位访客也会跟着变）。
 */
export function useCardStyle(siteDefault: ThemeConfig["cardStyle"]): [ThemeConfig["cardStyle"], (next: ThemeConfig["cardStyle"]) => void] {
  const [picked, setPicked] = useState<ThemeConfig["cardStyle"] | null>(() => {
    try {
      return cardStyleOrNull(localStorage.getItem(CARD_STYLE_KEY))
    } catch {
      return null
    }
  })
  const choose = useCallback(
    (next: ThemeConfig["cardStyle"]) => {
      setPicked(next === siteDefault ? null : next)
      try {
        if (next === siteDefault) localStorage.removeItem(CARD_STYLE_KEY)
        else localStorage.setItem(CARD_STYLE_KEY, next)
      } catch {
        // 记不住就只影响这一次会话：当前这一档仍然会立刻生效。
      }
    },
    [siteDefault],
  )
  return [picked ?? siteDefault, choose]
}

// 类型、默认值、收窄与迁移都在 site-settings.ts；这里只留取数据与页面侧的钩子，
// 顺手再导出一遍，页面统一从 `@/lib/theme-config` 拿。
export { DEFAULTS, hasGroupTabs, hasSummary, isBudgetLayout } from "@/lib/site-settings"
export type { ThemeConfig } from "@/lib/site-settings"

// ★ 站点图标（标签页／书签／手机桌面快捷方式）1.25.0 起**不在这里管了**：
// hub 1.4.0 的面板「设置 → 站点图标」一设，`/favicon.svg`、`/favicon.ico`、`/apple-touch-icon.png`
// 都由 hub 回答，而且 hub 在送 index.html 时会把这两个地址改写成 `?v=<内容摘要>` —— 站长换了图，
// URL 就变了，浏览器自己会重新取（Chrome 对标签页图标是按 URL 记的，不换 URL 就不重取）。
// 所以主题侧既不需要那个设置项，也不需要早跑脚本去改写 `<link>`；顶栏那枚圆标直接指同一个地址。
// 主题自带的 `public/favicon.svg` + `public/apple-touch-icon.png`（同一枚站标生成，
// 见 tools/make_icons.py）是 hub 上没设图标时的兜底。

/**
 * 本站约定的位置（`/chicken/`）上有没有装那座小鸡农场。装了就把入口指过去，没装就什么都不显示——
 * 「装主题」与「部署小鸡农场」是两件事，不能因为装了主题就多出一枚点不到东西的图标。
 *
 * ★ 1.25.0 起**没有设置项了**（原来那格「农场入口」可以填地址或填 `off` 关掉）：探测就是唯一的
 * 来源，挂载即探一次。站长在面板里没有可配的开关，也就不存在「面板关了、页面还开着」这种看不见的状态。
 *
 * ★ 判据是**内容**而不是状态码：hub 对未知路径会回落到当前主题的 `index.html` 并回 200，
 * 所以 `/chicken/` 在「装了」与「没装」两种情况下都是 200 —— 拿状态码探等于恒真。
 * 小鸡农场的 location 里有一条 `^~ /chicken/api/` 反代到 hub，回的是 JSON；
 * 没装时同一条路径同样落到 index.html（HTML），`res.json()` 会抛错。
 *
 * 代价是没装小鸡农场的站每次加载多一次请求（落回 index.html，约 1KB）；装了的那次拿到的
 * 就是它自己的节点列表。
 */
/**
 * 读回本站的设置。任何失败都回落默认值：后台没存过（Hub 回 `{}`）、旧 hub 没这个接口、
 * 反代拦了——都不该让公开页白屏或缺一块。收窄与迁移见 `normalizeConfig`。
 */
export function useThemeConfig(): ThemeConfig {
  const [config, setConfig] = useState(DEFAULTS)
  useEffect(() => {
    let active = true
    getSiteConfig().then((site) => (site.theme_options || {}) as Partial<ThemeConfig>)
      .then((saved) => {
        if (!active) return
        // 逐项收窄 + 旧值迁移都在 site-settings.ts（那里能单测）。
        setConfig(normalizeConfig(saved))
      })
      .catch(() => {
        // 取不到设置（旧 hub、反代拦了）就维持默认值：公开页照常渲染，不该白屏或缺一块。
      })
    return () => { active = false }
  }, [])
  return config
}
