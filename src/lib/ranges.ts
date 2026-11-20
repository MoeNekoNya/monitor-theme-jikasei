/**
 * 「时间范围」那排按钮：按 hub 的保留天数生成。
 *
 * hub 1.3.2 起保留天数可设 1~365 天（默认 30），而 `/api/nodes/{id}/metrics` 的 `hours`
 * 上限也从「匿名 168、登录 2160」改成**保留天数本身**（登录与匿名相同）。所以按钮不能再写死
 * 那一排 1/6/24 小时/7 天：站长把保留天数调到 90 天，访客却只有 7 天可点；调到 3 天，点 7 天
 * 又会拿到被静默收窄的结果（图与按钮上的字对不上）。
 *
 * 老 hub 没有 `history_days`（`/api/me` 里那个字段），那时上限就还是 168 小时，按 7 天算 ——
 * 算出来正好是 1.15.x 那排按钮（1 小时 / 6 小时 / 24 小时 / 7 天），逐字不变。
 *
 * 三条规则：
 *   · 1 / 6 / 24 小时永远在：保留天数最小是 1 天，这三档都取得到；
 *   · 7 天、30 天「够得着才出现」（严格小于保留天数，免得和最后那枚重复）；
 *   · 最后补一枚**保留天数本身**，站长把保留天数设成 14 天这种非整档的值时也有个完整窗口。
 * 最多 6 枚（1 小时 / 6 小时 / 24 小时 / 7 天 / 30 天 / 保留天数）——再多一行放不下。
 */
export type Range = { hours: number; label: string }

const ALLOWED: Range[] = [
  { hours: 0.167, label: "10 分钟" },
  { hours: 0.5, label: "30 分钟" },
  { hours: 1, label: "1 小时" },
  { hours: 6, label: "6 小时" },
  { hours: 12, label: "12 小时" },
  { hours: 24, label: "24 小时" },
  { hours: 48, label: "2 天" },
  { hours: 96, label: "4 天" },
  { hours: 168, label: "7 天" },
]

export function rangesFor(days: unknown): Range[] {
  const maxHours = typeof days === "number" && Number.isFinite(days)
    ? Math.min(168, Math.max(0.167, days * 24))
    : 168
  return ALLOWED.filter((range) => range.hours <= maxHours)
}
