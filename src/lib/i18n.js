import { ref } from "vue";

export const locale = ref("zh");
const messages = {
 zh:{
  dashboard:"服务器总览",overview:"运行状态、资源占用与网络活动，一屏掌握。",total:"服务器总数",online:"在线节点",offline:"离线节点",
  allNodes:"全部已接入节点",backendStats:"后端统计 · 5 分钟阈值",nodeList:"节点列表",search:"搜索名称、地区、标签…",
  all:"全部",noMatch:"没有匹配的服务器",empty:"暂时没有服务器数据",checkProbe:"请确认探针已接入并成功上报数据。",
  back:"返回服务器总览",systemInfo:"系统信息",cpu:"CPU 使用率",memory:"内存使用",networkIn:"网络入站",networkOut:"网络出站",
  history:"历史监控",range:"时间范围",noHistory:"暂无历史数据",loading:"正在加载历史数据…",onlineState:"在线",offlineState:"离线",
  settings:"主题设置",layout:"默认卡片布局",accent:"强调色",miniCharts:"卡片显示网络小图",save:"保存设置",saving:"保存中…",
  cancel:"取消",close:"关闭",admin:"管理后台",updated:"最后上报",noData:"—",diskIO:"磁盘 IO",networkProbe:"网络探测",
  memory:"内存",swap:"Swap",disk:"硬盘",uptime:"运行时间",connections:"TCP / UDP 连接",processes:"进程数",ip:"IPv4 / IPv6",
  cpuModel:"CPU 型号",cores:"CPU 核心",architecture:"系统架构",osVersion:"系统版本",gpu:"图形处理器",timeout:"超时",
  latency:"延迟",loss:"丢包",upload:"上传",download:"下载",totalTraffic:"总流量",waiting:"等待连接",connecting:"连接中",
  live:"实时连接",reconnecting:"正在重连",paused:"已暂停",stopped:"连接停止",connectionError:"连接异常",
  noMatchHint:"尝试更换搜索关键词或筛选条件。",clear:"清除筛选",unknownRegion:"未知地区",unnamed:"未命名服务器",
  saveNeedsJwt:"设置保存在 CFSM 的 theme_options 中；保存需要有效的管理员 JWT。",settingsSaved:"主题设置已保存",
  free:"免费",normal:"正常",agentVersion:"探针版本",readSpeed:"读取速度",writeSpeed:"写入速度",readIops:"读取 IOPS",
  writeIops:"写入 IOPS",diskLatency:"磁盘延迟",usage:"使用率",system:"系统信息",probeVersion:"探针版本"
 },
 en:{
  dashboard:"Server overview",overview:"Monitor health, resource usage and network activity at a glance.",total:"Total servers",online:"Online",offline:"Offline",
  allNodes:"All registered nodes",backendStats:"Backend stats · 5-minute threshold",nodeList:"Nodes",search:"Search name, region or tags…",
  all:"All",noMatch:"No matching servers",empty:"No server data yet",checkProbe:"Check that your agents are connected and reporting.",
  back:"Back to overview",systemInfo:"System information",cpu:"CPU usage",memory:"Memory usage",networkIn:"Inbound traffic",networkOut:"Outbound traffic",
  history:"Metric history",range:"Time range",noHistory:"No history data",loading:"Loading history…",onlineState:"Online",offlineState:"Offline",
  settings:"Theme settings",layout:"Default card layout",accent:"Accent color",miniCharts:"Network sparklines on cards",save:"Save settings",saving:"Saving…",
  cancel:"Cancel",close:"Close",admin:"Admin",updated:"Last report",noData:"—",diskIO:"Disk I/O",networkProbe:"Network probes",
  swap:"Swap",disk:"Disk",uptime:"Uptime",connections:"TCP / UDP connections",processes:"Processes",ip:"IPv4 / IPv6",
  cpuModel:"CPU model",cores:"CPU cores",architecture:"Architecture",osVersion:"Operating system",gpu:"Graphics processors",timeout:"Timeout",
  latency:"Latency",loss:"Packet loss",upload:"Upload",download:"Download",totalTraffic:"Total traffic",waiting:"Waiting",connecting:"Connecting",
  live:"Live",reconnecting:"Reconnecting",paused:"Paused",stopped:"Stopped",connectionError:"Connection error",
  noMatchHint:"Try a different search term or filter.",clear:"Clear filters",unknownRegion:"Unknown region",unnamed:"Unnamed server",
  saveNeedsJwt:"Theme settings are stored in CFSM theme_options. A valid admin JWT is required to save.",
  free:"Free",normal:"Healthy",agentVersion:"Agent version",readSpeed:"Read speed",writeSpeed:"Write speed",readIops:"Read IOPS",
  writeIops:"Write IOPS",diskLatency:"Disk latency",usage:"Usage",system:"System information",probeVersion:"Agent version"
 }
};
export function setLocale(value) {
 const requested=String(value||"auto").toLowerCase();
 locale.value=requested==="en"||requested.startsWith("en")?"en":
  requested==="zh"||requested.startsWith("zh")?"zh":
  (typeof navigator!=="undefined"&&navigator.language.toLowerCase().startsWith("en")?"en":"zh");
 if(typeof document!=="undefined") document.documentElement.lang=locale.value==="en"?"en":"zh-CN";
}
export function t(key) {
 return messages[locale.value]?.[key] || messages.zh[key] || key;
}