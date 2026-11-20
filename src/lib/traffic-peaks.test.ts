import assert from "node:assert/strict"
import { NO_PEAK, PEAK_LIMIT, dayStart, peakOf, peakTargets, type TrafficHistoryRow } from "./traffic-peaks.ts"
import type { Node } from "./api.ts"

const beijing = (day: number, hour: number, minute = 0) => Date.UTC(2026, 10, day, hour, minute) - 8 * 60 * 60 * 1000
const now = beijing(20, 14, 30)
const start = beijing(20, 0)
assert.equal(dayStart(now), start, "traffic peak window begins at Beijing midnight")

const rows: TrafficHistoryRow[] = [
  { timestamp: start - 1, net_in_speed: 999999, net_out_speed: 999999 },
  { timestamp: beijing(20, 8, 10), net_in_speed: 100, net_out_speed: 600 },
  { timestamp: beijing(20, 9, 20), net_in_speed: 900, net_out_speed: 200 },
  { timestamp: now + 1, net_in_speed: 999999, net_out_speed: 999999 },
]
assert.deepEqual(peakOf(rows, now), {
  down: 900, downAt: beijing(20, 9, 20),
  up: 600, upAt: beijing(20, 8, 10),
}, "only today’s samples count, and peak timestamps remain milliseconds")
assert.deepEqual(peakOf([{ timestamp: start - 1, net_in_speed: 1000 }], now), NO_PEAK, "yesterday is excluded")
assert.deepEqual(peakOf([], now), NO_PEAK, "empty history has no peak")

function node(id: number, rx: number, tx: number): Node {
  return {
    id, cfsmId: "server-" + id, name: "Node " + id, sort: id, public: true, online: true, country: "", group: "",
    last_seen: 0, metrics: null, os: "", kernel: "", arch: "", virt: "", cpu_name: "", cpu_cores: 0,
    mem_total: 0, swap_total: 0, disk_total: 0, agent_version: "", price: 0, currency: "CNY", billing_cycle: "month",
    expires_at: null, expires_in: null, traffic_limit: 0, traffic_mode: "total", traffic_reset_day: 0,
    total_rx: 0, total_tx: 0, month_rx: rx, month_tx: tx, month_start: "", day_rx: rx, day_tx: tx,
  } as Node
}
const many = Array.from({ length: 60 }, (_, i) => node(i, i, i))
const targets = peakTargets(many)
assert.equal(targets.length, PEAK_LIMIT, "at most 48 history queries are queued")
assert.equal(targets[0].cfsmId, "server-59", "largest monthly total appears first")
assert.equal(targets.at(-1)?.cfsmId, "server-12", "only the top 48 monthly totals are shown")
console.log("CFSM traffic peak calculations and request limits: all passed")
