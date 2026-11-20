import { ApiError, api, type Node } from "./api.ts"

const DAY_MS = 86_400_000
const BEIJING_MS = 8 * 3_600_000
const TTL = 60_000
export const PEAK_LIMIT = 48
export const HISTORY_CONCURRENCY = 4

export type TrafficHistoryRow = {
  /** CFSM /api/history/all returns epoch milliseconds. */
  timestamp: number
  /** Downstream receive speed, bytes per second. */
  net_in_speed?: number | null
  /** Upstream transmit speed, bytes per second. */
  net_out_speed?: number | null
}

export type TrafficPeak = {
  down: number
  downAt: number | null
  up: number
  upAt: number | null
}

export const NO_PEAK: TrafficPeak = { down: 0, downAt: null, up: 0, upAt: null }

/** Beijing midnight, independent of the visitor's browser timezone. */
export function dayStart(now = Date.now()): number {
  return Math.floor((now + BEIJING_MS) / DAY_MS) * DAY_MS - BEIJING_MS
}

function numeric(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function peakOf(rows: TrafficHistoryRow[], now = Date.now()): TrafficPeak {
  const since = dayStart(now)
  const peak: TrafficPeak = { ...NO_PEAK }
  for (const row of rows) {
    const at = Number(row.timestamp)
    if (!Number.isFinite(at) || at < since || at > now) continue
    const down = numeric(row.net_in_speed)
    const up = numeric(row.net_out_speed)
    if (down > peak.down) {
      peak.down = down
      peak.downAt = at
    }
    if (up > peak.up) {
      peak.up = up
      peak.upAt = at
    }
  }
  return peak
}

/** Order the displayed rows by monthly traffic; return only nodes whose peaks will be queried. */
export function peakTargets(nodes: Node[]): Node[] {
  return [...nodes]
    .sort((a, b) => (b.month_rx + b.month_tx) - (a.month_rx + a.month_tx))
    .slice(0, PEAK_LIMIT)
}

type CachedPeak = { at: number; day: number; peak: TrafficPeak }
const cache = new Map<string, CachedPeak>()
const inflight = new Map<string, Promise<TrafficPeak>>()
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchOne(node: Node, now: number): Promise<TrafficPeak> {
  if (!node.cfsmId) throw new Error("Missing CFSM server ID")
  const query = "/history/all?id=" + encodeURIComponent(node.cfsmId) + "&hours=24"
  for (let attempt = 0; ; attempt++) {
    try {
      const rows = await api<TrafficHistoryRow[]>(query)
      if (!Array.isArray(rows)) throw new Error("CFSM history response is not an array")
      return peakOf(rows, now)
    } catch (error) {
      const status = error instanceof ApiError ? error.status : undefined
      // Respect the CFSM history query guard: at most one retry for busy/transient errors.
      if (attempt >= 1 || (status !== undefined && status !== 429 && status !== 503)) throw error
      await sleep(250)
    }
  }
}

export function peakFor(node: Node, now = Date.now()): Promise<TrafficPeak> {
  const day = dayStart(now)
  const hit = cache.get(node.cfsmId)
  if (hit && hit.day === day && now - hit.at < TTL) return Promise.resolve(hit.peak)
  const running = inflight.get(node.cfsmId)
  if (running) return running
  const job = fetchOne(node, now)
    .then((peak) => {
      cache.set(node.cfsmId, { at: Date.now(), day, peak })
      return peak
    })
    .finally(() => inflight.delete(node.cfsmId))
  inflight.set(node.cfsmId, job)
  return job
}

/**
 * The detail popup is mounted only after the visitor opens the monthly-traffic card.
 * No history calls happen on initial page load; at most 48 IDs are queried, 4
 * concurrently, and results are cached for 60 seconds.
 */
export async function fetchTrafficPeaks(nodes: Node[], options: {
  now?: number
  onPeak?: (id: string, peak: TrafficPeak) => void
  stopped?: () => boolean
  concurrency?: number
} = {}): Promise<{ peaks: Map<string, TrafficPeak>; failed: string[] }> {
  const { now = Date.now(), onPeak, stopped, concurrency = HISTORY_CONCURRENCY } = options
  const queue = peakTargets(nodes)
  const peaks = new Map<string, TrafficPeak>()
  const failed: string[] = []
  let next = 0

  const worker = async () => {
    while (next < queue.length) {
      if (stopped?.()) return
      const node = queue[next++]
      try {
        const peak = await peakFor(node, now)
        peaks.set(node.cfsmId, peak)
        onPeak?.(node.cfsmId, peak)
      } catch {
        failed.push(node.cfsmId)
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker))
  return { peaks, failed }
}

export function clearTrafficPeakCache(): void {
  cache.clear()
  inflight.clear()
}
