import { useEffect, useRef, useState } from "react"
import { ArrowDown, ArrowUp } from "lucide-react"

import { DetailScroll } from "@/components/DetailScroll"
import { Country } from "@/components/NodeCard"
import type { Node } from "@/lib/api"
import { bytes, clockBeijing, rate } from "@/lib/format"
import { fetchTrafficPeaks, peakTargets, type TrafficPeak } from "@/lib/traffic-peaks"

/**
 * Monthly totals come directly from CFSM /api/servers. Historical peaks are fetched
 * only while this popup is open, from the allowed /api/history/all endpoint.
 * That endpoint contains net_in_speed / net_out_speed samples, not daily byte counters,
 * so the rows are labelled monthly and the peak line is explicitly today's peak.
 */
export function TrafficDetail({ nodes }: { nodes: Node[] }) {
  const key = nodes.map((node) => node.cfsmId).sort().join(",")
  const [peaks, setPeaks] = useState<Map<string, TrafficPeak>>(() => new Map())
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(0)
  const [targets, setTargets] = useState<Node[]>(() => peakTargets(nodes))
  const listRef = useRef(nodes)

  useEffect(() => {
    listRef.current = nodes
  })

  useEffect(() => {
    let alive = true
    const list = peakTargets(listRef.current)
    setTargets(list)
    setPeaks(new Map())
    setLoaded(false)
    setFailed(0)
    void fetchTrafficPeaks(list, {
      onPeak: (id, peak) => {
        if (alive) setPeaks((previous) => new Map(previous).set(id, peak))
      },
      stopped: () => !alive,
    }).then((result) => {
      if (!alive) return
      setFailed(result.failed.length)
      setLoaded(true)
    })
    return () => {
      alive = false
    }
  }, [key])

  const total = nodes.length
  const current = new Map(nodes.map((node) => [node.cfsmId, node]))
  const rows = targets.map((node) => current.get(node.cfsmId)).filter((node): node is Node => node !== undefined)

  return (
    <>
      <span data-detail-head="" className="block border-b px-2.5 py-1.5 text-muted-foreground">
        节点明细 · {total} 台
      </span>
      <DetailScroll>
        {rows.map((node) => {
          const peak = peaks.get(node.cfsmId)
          const pending = !peak && !loaded
          return (
            <span key={node.cfsmId} data-traffic-row="" className="block">
              <span className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-center gap-1.5">
                  <Country node={node} />
                  <span className="min-w-0 truncate">{node.name}</span>
                </span>
                <span className="tnum shrink-0">
                  <span className="text-muted-foreground">↓</span> {bytes(node.month_rx)}
                  {" "}
                  <span className="text-muted-foreground">↑</span> {bytes(node.month_tx)}
                </span>
              </span>
              <span className="mt-0.5 flex min-w-0 items-center gap-1 text-muted-foreground">
                <span className="shrink-0">今日峰值</span>
                <PeakArrow icon={ArrowUp} value={peak?.up} at={peak?.upAt} pending={pending} />
                <span className="shrink-0" aria-hidden>·</span>
                <PeakArrow icon={ArrowDown} value={peak?.down} at={peak?.downAt} pending={pending} />
              </span>
            </span>
          )
        })}
      </DetailScroll>
      <span data-detail-foot="" className="block border-t px-2.5 py-1.5 text-muted-foreground">
        <span className="block">用量为本月累计；今日峰值按北京时间 00:00 起的历史采样计算</span>
        {total > rows.length ? <span className="block">共 {total} 台，只列本月流量最大的 {rows.length} 台</span> : null}
        {failed > 0 ? <span className="block">{failed} 台历史读取失败</span> : null}
      </span>
    </>
  )
}

function PeakArrow({ icon: Icon, value, at, pending }: {
  icon: typeof ArrowUp
  value?: number
  at?: number | null
  pending: boolean
}) {
  if (pending) return <span className="tnum">读取中…</span>
  if (!value || at === null || at === undefined) return <span className="tnum">—</span>
  return (
    <span className="tnum inline-flex min-w-0 items-center gap-1 truncate">
      <Icon className="size-3 shrink-0" aria-hidden />
      <span className="truncate">{rate(value)}</span>
      <span className="shrink-0 text-muted-foreground">{clockBeijing(at)}</span>
    </span>
  )
}
