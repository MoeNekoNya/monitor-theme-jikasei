import { useEffect, useRef, useState } from "react"
import { daysUntil } from "./format.ts"

export type Metrics = {
  uptime:number; cpu:number; load:[number,number,number]
  mem_total:number; mem_used:number; swap_total:number; swap_used:number
  disk_total:number; disk_used:number; net_rx:number; net_tx:number
  total_rx:number; total_tx:number; month_rx:number; month_tx:number
  tcp?:number|null; udp?:number|null; procs?:number|null
}
export type CfsmConfig = {
  version?:string; is_public?:boolean; authorization?:boolean
  turnstile_enabled?:boolean; turnstile_site_key?:string
  turnstile_verified?:string|null; verified?:boolean
  site_title?:string; preferred_theme?:"auto"|"dark"|"light"|"system"
  default_language?:"auto"|"zh"|"en"; frontend_ws_timeout_minutes?:number
  long_history_points?:number; latency_window?:{points?:number;hours?:number}
  custom_ct_name?:string; custom_cu_name?:string; custom_cm_name?:string; custom_bd_name?:string
  node_1_name?:string; node_2_name?:string; node_3_name?:string; node_4_name?:string
  theme_options?:Record<string,unknown>
}
export type ServerStats = {
  total:number; online:number; offline:number
  globalSpeedIn:number; globalSpeedOut:number
  globalNetTx:number; globalNetRx:number
}
export type SysConfig = {
  show_price?:boolean; show_expire?:boolean; show_tf?:boolean
  show_three_net_details?:boolean; display_mode?:string
}
type CfsmServer = Record<string,any> & {id:string;name:string;last_updated?:number}
type CfsmSample = {ts:number;data?:Record<string,unknown>;payload?:Record<string,unknown>;metrics?:Record<string,unknown>}
type CfsmLatencySample = {ts:number;[key:string]:number|null|false}
type CfsmUpdate = {serverId:string;samples:CfsmSample[]}

export type Node = {
  id:number
  cfsmId:string
  name:string
  sort:number
  public:boolean
  online:boolean
  country:string
  group?:string
  public_remark?:string|null
  last_seen:number
  last_seen_ago?:number|null
  metrics:Metrics|null
  os:string
  kernel:string
  arch:string
  virt:string
  cpu_name:string
  cpu_cores:number
  mem_total:number
  swap_total:number
  disk_total:number
  agent_version:string
  price:number
  currency:string
  billing_cycle:string
  expires_at:string|null
  expires_in?:number|null
  show_expire?:boolean
  traffic_limit:number
  traffic_mode:string
  traffic_reset_day:number
  total_rx:number
  total_tx:number
  month_rx:number
  month_tx:number
  month_used?:number
  month_start:string
  day_rx:number
  day_tx:number
  hostname?:string
  ip?:string
  remark?:string
  cfsmPingWindow?:CfsmLatencySample[]
  cfsmLossWindow?:CfsmLatencySample[]
  cfsmProbeNames?:Record<string,string>
}
export class ApiError extends Error {
  status:number
  constructor(status:number,message:string){super(message);this.status=status}
}

const GET_ALLOW=new Set(["/api/config","/api/servers","/api/server","/api/history/all"])
const POST_ALLOW=new Set(["/api/theme_options"])
const JWT_KEY="jwt_token"
const VERIFIED_KEY_PREFIX="cfsm:turnstile:"
const MAX_RECONNECTS=8
let siteConfigPromise:Promise<CfsmConfig>|null=null
let siteConfigCache:CfsmConfig|null=null
let verifiedCache:string|null=null
let wsStatusListener:((status:string)=>void)|null=null
export const speedHistory=new Map<string|null,{rx:number;tx:number}[]>()
const KEEP=60

function safeStorageGet(key:string):string|null {try{return localStorage.getItem(key)}catch{return null}}
function safeStorageSet(key:string,value:string):void {try{localStorage.setItem(key,value)}catch{/* private browsing can disable storage */}}
function safeStorageRemove(key:string):void {try{localStorage.removeItem(key)}catch{/* private browsing can disable storage */}}
function apiBase():string {
  const raw=document.querySelector<HTMLMetaElement>('meta[name="apiBase"]')?.content?.trim()
  const first=raw?.split(",").map(x=>x.trim()).find(Boolean)
  try{return first?new URL(first,location.href).origin:location.origin}catch{return location.origin}
}
function verifiedKey():string{return VERIFIED_KEY_PREFIX+apiBase()}
export function normalizeApiPath(path:string):string {
  const value=path.trim()
  if(value.startsWith("/api/"))return value
  return value.startsWith("/")?"/api"+value:"/api/"+value
}
function assertAllowed(path:string,method:string):URL {
  const url=new URL(normalizeApiPath(path),apiBase())
  const allowed=method==="GET"?GET_ALLOW:method==="POST"?POST_ALLOW:new Set<string>()
  if(!allowed.has(url.pathname))throw new Error("拒绝未授权的 API 请求："+method+" "+url.pathname)
  return url
}
function authHeaders(extra?:HeadersInit):Headers {
  const headers=new Headers(extra)
  const jwt=safeStorageGet(JWT_KEY)
  if(jwt)headers.set("Authorization","Bearer "+jwt)
  if(siteConfigCache?.turnstile_enabled===true){
    const verified=verifiedCache||safeStorageGet(verifiedKey())
    if(verified)headers.set("X-Turnstile-Verified",verified)
  }
  return headers
}
function authFailure():void {
  safeStorageRemove(JWT_KEY)
  if(!location.pathname.startsWith("/admin"))location.assign("/admin#/admin")
}
async function rawRequest<T>(path:string,init:RequestInit={},turnstileToken?:string):Promise<T> {
  const method=(init.method||"GET").toUpperCase()
  const url=assertAllowed(path,method)
  const headers=authHeaders(init.headers)
  if(init.body!==undefined&&!headers.has("Content-Type"))headers.set("Content-Type","application/json")
  if(turnstileToken)headers.set("X-Turnstile-Token",turnstileToken)
  const response=await fetch(url.toString(),{...init,method,headers,credentials:"include"})
  const body=await response.text()
  let data:any=null
  if(body){try{data=JSON.parse(body)}catch{data={message:body}}}
  if(response.status===401){
    authFailure()
    throw new ApiError(401,data?.error||data?.message||"需要登录或访问权限")
  }
  if(!response.ok)throw new ApiError(response.status,data?.error||data?.message||("HTTP "+response.status))
  return data as T
}
function loadTurnstileSdk():Promise<void> {
  if((window as any).turnstile)return Promise.resolve()
  return new Promise((resolve,reject)=>{
    let script=document.querySelector<HTMLScriptElement>("script[data-cfsm-turnstile]")
    if(!script){
      script=document.createElement("script")
      script.src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
      script.async=true;script.defer=true;script.dataset.cfsmTurnstile="1"
      document.head.appendChild(script)
    }
    const timer=window.setTimeout(()=>reject(new Error("Turnstile 加载超时")),15000)
    script.addEventListener("load",()=>{window.clearTimeout(timer);(window as any).turnstile?resolve():reject(new Error("Turnstile 未初始化"))},{once:true})
    script.addEventListener("error",()=>{window.clearTimeout(timer);reject(new Error("Turnstile 加载失败"))},{once:true})
  })
}
async function askTurnstile():Promise<string> {
  const key=siteConfigCache?.turnstile_site_key
  if(!key)throw new Error("Turnstile 已启用，但没有返回 Site Key")
  await loadTurnstileSdk()
  return new Promise((resolve,reject)=>{
    const host=document.createElement("div")
    host.className="cfsm-turnstile-prompt"
    Object.assign(host.style,{position:"fixed",zIndex:"99999",right:"16px",bottom:"16px",padding:"12px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:"8px",boxShadow:"0 8px 30px #0002"})
    host.setAttribute("role","dialog");host.setAttribute("aria-label","Cloudflare Turnstile 验证")
    document.body.appendChild(host)
    let id:any,done=false
    const finish=(error?:Error,token?:string)=>{
      if(done)return;done=true
      try{(window as any).turnstile.remove(id)}catch{/* already removed */}
      host.remove()
      if(error)reject(error);else resolve(token||"")
    }
    try{id=(window as any).turnstile.render(host,{sitekey:key,callback:(token:string)=>finish(undefined,token),"error-callback":()=>finish(new Error("Turnstile 验证失败")),"expired-callback":()=>finish(new Error("Turnstile 验证已过期"))})}
    catch(error){finish(error instanceof Error?error:new Error(String(error)))}
  })
}
async function obtainTurnstileVerified():Promise<void> {
  const token=await askTurnstile()
  // CFSM exchanges a one-use token for an encrypted one-hour credential in /api/config's body.
  const config=await rawRequest<CfsmConfig>("/config",{},token)
  if(!config.turnstile_verified)throw new Error("验证成功，但 Worker 未返回 turnstile_verified")
  verifiedCache=config.turnstile_verified
  safeStorageSet(verifiedKey(),verifiedCache)
  siteConfigCache={...(siteConfigCache||{}),...config}
}
async function request<T>(path:string,init:RequestInit={}):Promise<T> {
  try{return await rawRequest<T>(path,init)}
  catch(error){
    if(error instanceof ApiError&&error.status===403&&siteConfigCache?.turnstile_enabled===true){
      verifiedCache=null;safeStorageRemove(verifiedKey())
      await obtainTurnstileVerified()
      return rawRequest<T>(path,init)
    }
    throw error
  }
}
export async function getSiteConfig():Promise<CfsmConfig> {
  if(siteConfigCache)return siteConfigCache
  if(siteConfigPromise)return siteConfigPromise
  siteConfigPromise=request<CfsmConfig>("/config").then(config=>{
    siteConfigCache={...config,theme_options:config.theme_options&&typeof config.theme_options==="object"&&!Array.isArray(config.theme_options)?config.theme_options:{}}
    if(config.turnstile_enabled&&config.turnstile_verified){verifiedCache=config.turnstile_verified;safeStorageSet(verifiedKey(),verifiedCache)}
    return siteConfigCache
  }).catch(error=>{siteConfigPromise=null;throw error})
  return siteConfigPromise
}
export function hasJwtToken():boolean {return Boolean(safeStorageGet(JWT_KEY))}
export function updateSiteConfigCache(config:CfsmConfig):void {siteConfigCache={...(siteConfigCache||{}),...config}}
export async function api<T>(path:string,init?:RequestInit):Promise<T> {
  const clean=path.startsWith("/api/")?path.slice(4):path
  return request<T>(clean,init)
}
export async function saveThemeOptions(themeOptions:Record<string,unknown>):Promise<void> {
  if(!safeStorageGet(JWT_KEY))throw new ApiError(401,"保存主题设置需要管理员 JWT")
  const result=await request<{success:boolean;theme_options:Record<string,unknown>}>("/theme_options",{method:"POST",body:JSON.stringify({theme_options:themeOptions})})
  updateSiteConfigCache({theme_options:result.theme_options||themeOptions})
}

function number(value:unknown):number {const n=Number(value);return Number.isFinite(n)?n:0}
function bytesFromMb(value:unknown):number {return Math.max(0,number(value))*1024*1024}
function parseLoad(value:unknown):[number,number,number] {
  const parts=String(value??"").trim().split(/\s+/).map(Number)
  return [Number.isFinite(parts[0])?parts[0]:0,Number.isFinite(parts[1])?parts[1]:0,Number.isFinite(parts[2])?parts[2]:0]
}
export function parseTrafficLimit(value:unknown):number {
  const text=String(value??"").trim().replace(/,/g,"")
  if(!text)return 0
  const match=text.match(/^([\d.]+)\s*(B|KB|MB|GB|TB|PB)?$/i)
  if(!match)return 0
  // CFSM stores a unitless traffic_limit as GB; explicit units remain supported.
  const unit=(match[2]||"GB").toUpperCase()
  const pow=["B","KB","MB","GB","TB","PB"].indexOf(unit)
  return Math.max(0,number(match[1])*1024**Math.max(0,pow))
}
const CFSM_CURRENCY_CODES:Record<string,string>={
  "$":"USD","¥":"CNY","￥":"CNY","€":"EUR","£":"GBP","¥JPY":"JPY"
}

function stableNumericId(value:string):number {
  let hash=2166136261
  for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619)}
  return (hash>>>0)||1
}

export function toNode(server:CfsmServer,sysConfig:SysConfig={}):Node {
  const updated=number(server.last_updated||server.reportTs||server.timestamp)
  const boot=number(server.boot_time)
  const uptime=boot>0&&updated>=boot?Math.max(0,(updated-boot)/1000):0
  const ramTotal=bytesFromMb(server.ram_total),ramUsed=bytesFromMb(server.ram_used)
  const swapTotal=bytesFromMb(server.swap_total),swapUsed=bytesFromMb(server.swap_used)
  const diskTotal=bytesFromMb(server.disk_total),diskUsed=bytesFromMb(server.disk_used)
  const monthlyIn=number(server.net_rx_monthly),monthlyOut=number(server.net_tx_monthly)
  const priceText=String(server.price??"").trim()
  const price=priceText&&priceText!=="0"&&priceText!=="-1"?number(priceText):0
  const currencyRaw=String(server.currency??"¥").trim()
  const currency=CFSM_CURRENCY_CODES[currencyRaw]||currencyRaw
  const trafficMode=String(server.traffic_calc_type||"total").toLowerCase()
  const used=trafficMode==="ul"||trafficMode==="up"?monthlyOut:trafficMode==="dl"||trafficMode==="down"?monthlyIn:trafficMode==="max"?Math.max(monthlyIn,monthlyOut):monthlyIn+monthlyOut
  const enabled=(value:unknown)=>value===true||value==="true"||value==="1"||value===1
  const showPrice=enabled(sysConfig.show_price)
  const showExpire=enabled(sysConfig.show_expire)
  const expiryDate=String(server.expire_date??server.expires_at??server.expiry_date??"").trim()||null
  const metrics:Metrics|null=server.last_updated?{
    uptime,cpu:number(server.cpu),load:parseLoad(server.load_avg),
    mem_total:ramTotal,mem_used:ramUsed,swap_total:swapTotal,swap_used:swapUsed,
    disk_total:diskTotal,disk_used:diskUsed,
    net_rx:number(server.net_in_speed),net_tx:number(server.net_out_speed),
    total_rx:number(server.net_rx),total_tx:number(server.net_tx),
    month_rx:monthlyIn,month_tx:monthlyOut,
    tcp:typeof server.tcp_conn==="number"?server.tcp_conn:null,
    udp:typeof server.udp_conn==="number"?server.udp_conn:null,
    procs:typeof server.processes==="number"?server.processes:null,
  }:null
  const probeNames={
    ct:siteConfigCache?.custom_ct_name||"电信",
    cu:siteConfigCache?.custom_cu_name||"联通",
    cm:siteConfigCache?.custom_cm_name||"移动",
    bd:siteConfigCache?.custom_bd_name||"BGP",
    node_1:siteConfigCache?.node_1_name||"Node 1",
    node_2:siteConfigCache?.node_2_name||"Node 2",
    node_3:siteConfigCache?.node_3_name||"Node 3",
    node_4:siteConfigCache?.node_4_name||"Node 4",
  }
  const online=typeof server.is_online==="boolean"?server.is_online:(updated>0&&Date.now()-updated<300000)
  const region=String(server.region||"").toUpperCase()
  return {
    id:stableNumericId(String(server.id)),cfsmId:String(server.id),name:String(server.name||"Unnamed"),
    sort:number(server.sort_order),public:String(server.is_hidden??"0")!=="1",online,country:region,
    group:String(server.server_group||""),public_remark:String(server.tags||""),
    last_seen:updated>0?updated/1000:0,last_seen_ago:updated>0?Math.max(0,(Date.now()-updated)/1000):null,
    metrics,os:String(server.os||""),kernel:String(server.kernel_version||""),arch:String(server.arch||""),virt:"none",
    cpu_name:String(server.cpu_info||""),cpu_cores:number(server.cpu_cores),
    mem_total:ramTotal,swap_total:swapTotal,disk_total:diskTotal,agent_version:String(server.agent_version||""),
    price:showPrice?price:0,currency,billing_cycle:showPrice?String(server.billing_cycle||""):"",
    expires_at:showExpire?expiryDate:null,
    expires_in:showExpire?daysUntil(expiryDate):null,
    show_expire:showExpire,
    traffic_limit:parseTrafficLimit(server.traffic_limit),traffic_mode:trafficMode,
    traffic_reset_day:number(server.reset_day),total_rx:number(server.net_rx),total_tx:number(server.net_tx),
    month_rx:monthlyIn,month_tx:monthlyOut,month_used:used,month_start:"",
    day_rx:monthlyIn,day_tx:monthlyOut,
    hostname:String(server.name||""),ip:undefined,
    cfsmPingWindow:Array.isArray(server.ping)?server.ping:[],
    cfsmLossWindow:Array.isArray(server.loss)?server.loss:[],
    cfsmProbeNames:probeNames,
  }
}
export function groupsOf(nodes:Pick<Node,"group">[]):string[]{return [...new Set(nodes.map(n=>n.group??"").filter(Boolean))]}
export function groupView(nodes:Node[],group:string|null,showTabs:boolean) {
  const groups=groupsOf(nodes),ungrouped=nodes.filter(n=>!n.group).length
  const current=!showTabs?null:group===null||(group===""?ungrouped>0:groups.includes(group))?group:null
  const shown=current===null?nodes:nodes.filter(n=>(n.group??"")===current)
  const tabs=[
    [null,"全部",nodes.length] as const,
    ...groups.map(g=>[g,g,nodes.filter(n=>n.group===g).length] as const),
    ...(ungrouped?[["","未分组",ungrouped] as const]:[]),
  ]
  return {groups,ungrouped,current,shown,tabs,total:nodes.length,showTabs}
}
export function sample(nodes:Node[]):void {
  const totals=new Map<string|null,{rx:number;tx:number}>()
  for(const n of nodes)for(const key of [null,n.group??""]){
    const total=totals.get(key)??{rx:0,tx:0}
    if(n.online&&n.metrics){total.rx+=n.metrics.net_rx;total.tx+=n.metrics.net_tx}
    totals.set(key,total)
  }
  for(const key of speedHistory.keys())if(!totals.has(key))speedHistory.delete(key)
  for(const [key,total] of totals){const s=speedHistory.get(key)??[];s.push(total);if(s.length>KEEP)s.shift();speedHistory.set(key,s)}
}
export function safeNodes(nodes:Node[]):Node[] {
  const nonnegative=(v:unknown)=>typeof v==="number"&&Number.isFinite(v)&&v>=0
  const required=["uptime","cpu","mem_total","mem_used","swap_total","swap_used","disk_total","disk_used","net_rx","net_tx","total_rx","total_tx","month_rx","month_tx"] as const
  return nodes.map(node=>{
    const m=node.metrics;if(!m)return node
    const valid=required.every(key=>nonnegative(m[key]))&&Array.isArray(m.load)&&m.load.length===3&&m.load.every(nonnegative)
    if(!valid)return{...node,metrics:null}
    const optional=["tcp","udp","procs"] as const
    if(optional.every((key)=>typeof m[key]==="number"&&Number.isFinite(m[key])))return node
    const copy={...m}
    for(const key of optional)if(!nonnegative(copy[key]))copy[key]=null
    return {...node,metrics:copy}
  })
}

type QueueItem={id:string;patch:Record<string,unknown>;timestamp:number}
function mergePatch(current:CfsmServer,patch:Record<string,unknown>,timestamp:number):CfsmServer {
  const next:{[key:string]:any}={...current}
  for(const [key,value] of Object.entries(patch)){
    if(value===undefined)continue
    if(value&&typeof value==="object"&&!Array.isArray(value)&&next[key]&&typeof next[key]==="object"&&!Array.isArray(next[key])){
      next[key]={...next[key],...value}
    }else next[key]=value
  }
  if(timestamp>0)next.last_updated=Math.max(number(next.last_updated),timestamp)
  return next as CfsmServer
}
function mapLatestUpdates(rows:CfsmServer[],updates:CfsmUpdate[]|undefined):CfsmServer[] {
  if(!Array.isArray(updates)||!updates.length)return rows
  const map=new Map(rows.map(row=>[String(row.id),row]))
  for(const update of updates){
    let server=map.get(String(update.serverId));if(!server)continue
    for(const s of update.samples||[]){
      const patch=s.data||s.payload||s.metrics
      if(patch)server=mergePatch(server,patch,s.ts)
    }
    map.set(String(update.serverId),server)
  }
  return rows.map(row=>map.get(String(row.id))||row)
}

const pending=new Map<string,QueueItem>()
let flushTimer:ReturnType<typeof setTimeout>|null=null
function queueBatch(updates:CfsmUpdate[],apply:(items:QueueItem[])=>void) {
  for(const update of updates||[]){
    if(!update?.serverId||!Array.isArray(update.samples))continue
    const item=pending.get(update.serverId)||{id:String(update.serverId),patch:{},timestamp:0}
    for(const sample of update.samples){
      const patch=sample&&(sample.data||sample.payload||sample.metrics)
      if(!patch||typeof patch!=="object")continue
      Object.assign(item.patch,patch);item.timestamp=Math.max(item.timestamp,number(sample.ts))
    }
    pending.set(update.serverId,item)
  }
  if(flushTimer===null&&pending.size){
    flushTimer=setTimeout(()=>{
      flushTimer=null;const items=[...pending.values()];pending.clear();apply(items)
    },1000)
  }
}
export function notifyWsStatus(fn:((status:string)=>void)|null):void {wsStatusListener=fn}
function wsStatus(value:string):void {wsStatusListener?.(value)}
function wsUrl(scope:string,cfg:CfsmConfig):string {
  const url=new URL("/api/ws",apiBase())
  url.protocol=url.protocol==="https:"?"wss:":"ws:"
  url.searchParams.set("subscribe",scope)
  if(url.host!==location.host&&cfg.is_public!==true){
    const jwt=safeStorageGet(JWT_KEY);if(jwt)url.searchParams.set("token",jwt)
  }
  return url.toString()
}
type SocketMode={scope:string;ids:string[]}
function openManagedSocket(mode:SocketMode,cfg:CfsmConfig,onUpdates:(updates:CfsmUpdate[])=>void,onFail:(status:string)=>void):()=>void {
  let socket:WebSocket|null=null,stopped=false,retry:ReturnType<typeof setTimeout>|null=null
  let timeout:ReturnType<typeof setTimeout>|null=null,watchdog:ReturnType<typeof setTimeout>|null=null
  let attempts=0
  const clear=()=>{if(retry)clearTimeout(retry);if(timeout)clearTimeout(timeout);if(watchdog)clearTimeout(watchdog);retry=null;timeout=null;watchdog=null}
  const closeCurrent=()=>{const old=socket;socket=null;if(old){old.onopen=old.onmessage=old.onerror=old.onclose=null;try{old.close(1000,"theme reconnect")}catch{/* already closed */}}}
  const reconnect=()=>{
    if(stopped||document.visibilityState==="hidden")return
    if(attempts>=MAX_RECONNECTS){wsStatus("failed");onFail("failed");return}
    const delay=Math.min(1000*2**attempts,30000);attempts++;wsStatus("reconnecting")
    retry=setTimeout(()=>{retry=null;connect()},delay)
  }
  const armWatchdog=(ws:WebSocket)=>{
    if(watchdog)clearTimeout(watchdog)
    watchdog=setTimeout(()=>{
      if(socket!==ws||stopped)return
      closeCurrent();reconnect()
    },10000)
  }
  const connect=()=>{
    if(stopped||document.visibilityState==="hidden")return
    clear()
    let ws:WebSocket
    try{ws=new WebSocket(wsUrl(mode.scope,cfg))}catch{reconnect();return}
    socket=ws;wsStatus("connecting")
    ws.onopen=()=>{
      if(socket!==ws)return
      wsStatus("connected")
      if(mode.scope==="all")ws.send(JSON.stringify({type:"subscribe",scope:"all",ids:mode.ids}))
      const minutes=number(cfg.frontend_ws_timeout_minutes)
      if(minutes>0)timeout=setTimeout(()=>{
        if(socket!==ws)return
        const keep=window.confirm("实时连接已运行 "+minutes+" 分钟，是否继续？")
        stopped=true;closeCurrent()
        if(keep){stopped=false;attempts=0;connect()}else{wsStatus("paused");onFail("paused")}
      },minutes*60000)
      armWatchdog(ws)
    }
    ws.onmessage=(event)=>{
      if(socket!==ws)return
      try{
        const msg=JSON.parse(String(event.data))
        if(msg.type==="batchUpdate"&&Array.isArray(msg.updates))onUpdates(msg.updates)
        if(msg.type==="batchUpdate")attempts=0
        armWatchdog(ws)
      }catch{/* malformed frame ignored */}
    }
    ws.onerror=()=>{if(socket===ws)ws.close()}
    ws.onclose=()=>{if(socket!==ws||stopped)return;socket=null;clear();reconnect()}
  }
  connect()
  return ()=>{stopped=true;clear();closeCurrent()}
}

export function useNodes(activeId:string|null=null) {
  const [nodes,setNodes]=useState<Node[]|null>(null)
  const [detailNode,setDetailNode]=useState<Node|null>(null)
  const [error,setError]=useState<string|null>(null)
  const [closed,setClosed]=useState(false)
  const [siteConfig,setSiteConfig]=useState<CfsmConfig|null>(siteConfigCache)
  const [stats,setStats]=useState<ServerStats|null>(null)
  const [sysConfig,setSysConfig]=useState<SysConfig>({})
  const sysConfigRef=useRef<SysConfig>({})
  const raw=useRef<Map<string,CfsmServer>>(new Map())
  const loaded=useRef(false)
  const activeIdRef=useRef(activeId)
  activeIdRef.current=activeId
  const listReady=nodes!==null

  const applyUpdates=(items:QueueItem[])=>{
    let changed=false
    for(const item of items){
      const existing=raw.current.get(item.id)
      if(!existing)continue
      raw.current.set(item.id,mergePatch(existing,item.patch,item.timestamp));changed=true
    }
    if(changed){
      const mapped=safeNodes([...raw.current.values()].sort((a,b)=>number(a.sort_order)-number(b.sort_order)).map(row=>toNode(row,sysConfigRef.current)))
      sample(mapped);setNodes(mapped)
      const active=activeIdRef.current?raw.current.get(activeIdRef.current):undefined
      if(active)setDetailNode(toNode(active,active.sysConfig||sysConfigRef.current))
    }
  }

  useEffect(()=>{
    let alive=true
    getSiteConfig().then(config=>{
      if(!alive)return
      setSiteConfig(config)
      if(config.is_public!==true&&!safeStorageGet(JWT_KEY)){
        setClosed(true);location.assign("/admin#/admin")
      }
    }).catch(e=>{if(alive)setError(e.message||"无法读取站点配置")})
    return()=>{alive=false}
  },[])

  useEffect(()=>{
    let alive=true
    getSiteConfig().then(async ()=>{
      if(!alive)return
      if(activeId===null){
        if(loaded.current)return
        const data=await request<{servers:CfsmServer[];latestReportUpdates?:CfsmUpdate[];stats:ServerStats;sysConfig:SysConfig}>("/servers")
        if(!alive)return
        const rows=mapLatestUpdates(Array.isArray(data.servers)?data.servers:[],data.latestReportUpdates)
        raw.current=new Map(rows.map(row=>[String(row.id),row]));loaded.current=true
        const nextSysConfig=data.sysConfig||{}
        sysConfigRef.current=nextSysConfig
        setStats(data.stats||null);setSysConfig(nextSysConfig)
        const mapped=safeNodes(rows.sort((a,b)=>number(a.sort_order)-number(b.sort_order)).map(row=>toNode(row,nextSysConfig)))
        sample(mapped);setNodes(mapped);setError(null);setClosed(false)
      }else{
        setDetailNode(null)
        const server=await request<CfsmServer>("/server?id="+encodeURIComponent(activeId))
        if(!alive)return
        const replay=mapLatestUpdates([server],server.latestReportUpdates as CfsmUpdate[]|undefined)[0]
        raw.current.set(String(replay.id),replay)
        if(replay.sysConfig){sysConfigRef.current=replay.sysConfig;setSysConfig(replay.sysConfig)}
        setDetailNode(toNode(replay,replay.sysConfig||sysConfigRef.current));setError(null);setClosed(false)
      }
    }).catch(e=>{if(alive){setError(e.message||"读取服务器失败");if(e instanceof ApiError&&e.status===401)setClosed(true)}})
    return()=>{alive=false}
  },[activeId])

  useEffect(()=>{
    if(!siteConfig)return
    if(activeId===null&&!loaded.current)return
    if(activeId!==null&&!activeId)return
    const mode:SocketMode=activeId===null?{scope:"all",ids:[...raw.current.keys()]}:{scope:activeId,ids:[]}
    let stop:(()=>void)|null=null
    const start=()=>{
      if(document.visibilityState==="hidden")return
      if(stop)stop()
      const currentIds=mode.scope==="all"?[...raw.current.keys()]:[]
      const nextMode=mode.scope==="all"?{...mode,ids:currentIds}:mode
      stop=openManagedSocket(nextMode,siteConfig,updates=>queueBatch(updates,applyUpdates),status=>{if(status==="failed")setError("实时连接已停止，可刷新页面重试")})
    }
    start()
    const onVisibility=()=>{
      if(document.visibilityState==="hidden"){stop?.();stop=null;wsStatus("paused");return}
      if(activeId===null){ // retain the one-shot /api/servers snapshot; only restore its socket subscription
        start()
      }else{
        void request<CfsmServer>("/server?id="+encodeURIComponent(activeId)).then(server=>{
          const replay=mapLatestUpdates([server],server.latestReportUpdates as CfsmUpdate[]|undefined)[0]
          raw.current.set(String(replay.id),replay)
          if(replay.sysConfig)sysConfigRef.current=replay.sysConfig
          setDetailNode(toNode(replay,replay.sysConfig||sysConfigRef.current));start()
        }).catch(e=>setError(e.message||"详情恢复失败"))
      }
    }
    document.addEventListener("visibilitychange",onVisibility)
    return()=>{document.removeEventListener("visibilitychange",onVisibility);stop?.()}
  },[activeId,siteConfig,listReady])

  return {nodes,detailNode,error,closed,siteConfig,stats,sysConfig}
}

// CFSM adapter build checkpoint.
