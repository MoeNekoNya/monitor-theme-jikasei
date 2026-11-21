/// <reference types="node" />
import assert from "node:assert/strict"
import { groupView, groupsOf, normalizeApiPath, parseTrafficLimit, safeNodes, sample, speedHistory, toNode, type Node } from "./api.ts"
import { daysUntil } from "./format.ts"

assert.equal(normalizeApiPath("/config"), "/api/config")
assert.equal(normalizeApiPath("/servers"), "/api/servers")
assert.equal(normalizeApiPath("/server?id=abc"), "/api/server?id=abc")
assert.equal(normalizeApiPath("/history/all?id=abc&hours=0.167"), "/api/history/all?id=abc&hours=0.167")
assert.equal(normalizeApiPath("/api/servers"), "/api/servers")
console.log("CFSM API path prefix: all passed")

// CFSM traffic_limit is stored as GB when no explicit unit is present.
const GiB=1024**3
assert.equal(parseTrafficLimit("100"),100*GiB,"unitless CFSM quota means 100 GB")
assert.equal(parseTrafficLimit("100 GB"),100*GiB,"explicit GB quota")
assert.equal(parseTrafficLimit("1TB"),1024**4,"explicit TB quota")
assert.equal(parseTrafficLimit("0"),0,"zero means no traffic cap")

// CFSM uses dl / ul / max / total (not down / up) and date-only expiry values.
const expiryBase=new Date(Date.now()+8*60*60*1000)
expiryBase.setUTCDate(expiryBase.getUTCDate()+20)
const expiryDate=`${expiryBase.getUTCFullYear()}-${String(expiryBase.getUTCMonth()+1).padStart(2,"0")}-${String(expiryBase.getUTCDate()).padStart(2,"0")}`
const cfsmServer={
  id:"11111111-2222-4333-8444-555555555555",name:"CFSM test",last_updated:Date.now(),
  is_hidden:"0",sort_order:1,price:"90.00",currency:"¥",billing_cycle:"quarter",
  expire_date:expiryDate,traffic_limit:"100",traffic_calc_type:"dl",
  net_rx_monthly:2*GiB,net_tx_monthly:5*GiB,net_rx:3*GiB,net_tx:6*GiB,
  net_in_speed:0,net_out_speed:0,ram_total:0,ram_used:0,swap_total:0,swap_used:0,
  disk_total:0,disk_used:0,cpu_cores:0
}
const mappedDl=toNode(cfsmServer,{show_price:true,show_expire:true})
assert.equal(mappedDl.traffic_limit,100*GiB,"server card quota converted from GB to bytes")
assert.equal(mappedDl.month_used,2*GiB,"dl meters monthly download only")
assert.equal(mappedDl.currency,"CNY","CFSM ¥ is normalized to ISO CNY for the budget calculator")
assert.equal(mappedDl.billing_cycle,"quarter","CFSM billing cycle passes through")
assert.equal(mappedDl.expires_at,expiryDate,"expiry date is retained")
assert.equal(mappedDl.expires_in,daysUntil(expiryDate),"expiry days use the shared Beijing calendar")
assert.equal(mappedDl.show_expire,true,"expiry display flag is preserved on the mapped node")
const mappedStringFlag=toNode(cfsmServer,{show_expire:"true" as unknown as boolean})
assert.equal(mappedStringFlag.expires_at,expiryDate,"string true from older CFSM configs still enables expiry")
assert.equal(mappedStringFlag.show_expire,true,"string expiry flag normalizes to boolean")
assert.equal(toNode({...cfsmServer,expire_date:""},{show_expire:true}).expires_at,null,"empty expiry date stays empty")

assert.equal(toNode(cfsmServer,{show_price:true,show_expire:false}).expires_at,null,"hidden expiry setting suppresses date")
assert.equal(toNode(cfsmServer,{show_price:true,show_expire:false}).expires_in,null,"hidden expiry setting suppresses days")
for (const [mode,expected] of [["dl",2*GiB],["ul",5*GiB],["max",5*GiB],["total",7*GiB]] as const) {
  assert.equal(toNode({...cfsmServer,traffic_calc_type:mode},{show_expire:true}).month_used,expected,`CFSM traffic mode ${mode}`)
}
console.log("CFSM traffic quota, direction and expiry mapping: all passed")

const node = { id: 1, metrics: { uptime: 100, cpu: 1, load: [0.1, 0.2, 0.3],
  mem_total: 1024, mem_used: 512, swap_total: 0, swap_used: 0, disk_total: 2048, disk_used: 1024,
  net_rx: 10, net_tx: 20, total_rx: 100, total_tx: 200, month_rx: 50, month_tx: 100,
  tcp: 3, udp: 4, procs: 20 } } as Node
assert.equal(safeNodes([node])[0], node)
for (const patch of [{ load: null }, { load: [1, "bad", 3] }, { cpu: "bad" }, { net_rx: Infinity }]) {
  const bad = { ...node, metrics: { ...node.metrics, ...patch } } as unknown as Node
  const result = safeNodes([bad, node])
  assert.equal(result[0].metrics, null)
  assert.equal(result[1], node)
}
console.log("invalid live reports are isolated")

// ★2026-11-06：tcp / udp / procs 是可选的（老 agent 整列不报）。缺一个不许把整块 metrics 作废，
// 否则那台机器连 CPU / 内存 / 网速一起空白，还会按「没有数据」沉到列表最后一屏。
const base = node.metrics!
for (const missing of ["tcp", "udp", "procs"] as const) {
  const { [missing]: _gone, ...rest } = base
  const out = safeNodes([{ ...node, metrics: rest } as unknown as Node])[0]
  assert.equal(out.metrics?.[missing], null, `${missing} 缺失时降级成 null`)
  assert.equal(out.metrics?.cpu, base.cpu, `${missing} 缺失不该抹掉其它读数`)
}
// 承重那几列坏掉时仍然整块作废（宁可不显示，也不显示一半的假读数）
for (const patch of [{ cpu: undefined }, { net_rx: null }, { month_tx: "8" }]) {
  const bad = { ...node, metrics: { ...base, ...patch } } as unknown as Node
  assert.equal(safeNodes([bad])[0].metrics, null)
}
console.log("optional live fields degrade without blanking the node")

// Tabs follow the node order; ungrouped nodes and a hub without the field add none.
assert.deepEqual(groupsOf([{ group: "东京" }, { group: "" }, {}, { group: "香港" }, { group: "东京" }]), ["东京", "香港"])
console.log("groups follow the node order")

// 分组筛选的一次求值：概览卡片与列表吃的是同一份 `shown`，所以这个函数是两者口径的唯一来源。
const g = (id: number, group: string) => ({ ...node, id, group }) as Node
const four = [g(1, "东京"), g(2, "东京"), g(3, "香港"), g(4, "")]
assert.equal(groupView(four, "东京", true).shown.length, 2, "选中一档就只剩那一档")
assert.deepEqual(groupView(four, "香港", true).shown.map((n) => n.id), [3])
assert.deepEqual(groupView(four, "", true).shown.map((n) => n.id), [4], "未分组用空串表示")
assert.equal(groupView(four, null, true).shown.length, 4)
// 悬空 / 已空的选中档回落「全部」，而不是停在一个什么都看不见的筛选上
assert.equal(groupView(four, "已经解散的组", true).current, null)
assert.equal(groupView(four, "已经解散的组", true).shown.length, 4)
assert.equal(groupView([g(1, "东京")], "", true).current, null, "未分组里没人了也回落")
// 标签行含台数，顺序照节点顺序
assert.deepEqual(groupView(four, null, true).tabs.map((t) => `${t[1]}${t[2]}`), ["全部4", "东京2", "香港1", "未分组1"])
assert.deepEqual(groupView([g(1, ""), g(2, "")], null, true).tabs.map((t) => `${t[1]}${t[2]}`), ["全部2", "未分组2"])
// 标签行整行关掉时选中态作废（站长在后台一关，访客手里那一档就不算数了）
assert.equal(groupView(four, "东京", false).current, null)
assert.equal(groupView(four, "东京", false).shown.length, 4)
assert.equal(groupView(four, "东京", false).total, 4)
console.log("the group filter is one evaluation for both the summary and the list")

// Each group keeps its own throughput line beside the fleet's, and a group that
// empties stops being tracked.
const live = (group: string, rx: number) => ({ ...node, group, online: true, metrics: { ...node.metrics!, net_rx: rx, net_tx: 0 } }) as Node
sample([live("东京", 5), live("", 7), { ...live("东京", 9), online: false }])
assert.deepEqual([speedHistory.get(null)?.at(-1)?.rx, speedHistory.get("东京")?.at(-1)?.rx, speedHistory.get("")?.at(-1)?.rx], [12, 5, 7])
sample([live("", 1)])
assert.equal(speedHistory.has("东京"), false)
// A group may be named anything, the fleet's own key included.
sample([live("*", 5), live("", 7)])
assert.deepEqual([speedHistory.get(null)?.at(-1)?.rx, speedHistory.get("*")?.at(-1)?.rx], [12, 5])
console.log("throughput is kept per group")
