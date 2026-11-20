import { reactive } from "vue";
import { HISTORY_RANGES,mergeIncremental } from "./metrics.js";
export const ALLOWED_GET=["/api/config","/api/servers","/api/server","/api/history/all"];
export const ALLOWED_POST=["/api/theme_options"];
const JWT_KEY="jwt_token",VERIFIED_PREFIX="cfsm:turnstile:",MAX_RECONNECTS=8;
const pendingUpdates=new Map();let flushTimer=null,configPromise=null;
export const monitor=reactive({sites:[],config:null,detail:null,activeSite:null,history:[],historyHours:"0.167",loading:true,detailLoading:false,historyLoading:false,error:"",wsStatus:"idle",wsPaused:false});
function storageGet(key){try{return localStorage.getItem(key);}catch{return null;}}
function storageSet(key,value){try{localStorage.setItem(key,value);}catch{/* optional storage */}}
function storageRemove(key){try{localStorage.removeItem(key);}catch{/* optional storage */}}
function apiBases(){
 const raw=document.querySelector('meta[name="apiBase"]')?.content?.trim()||"";
 const values=raw&&raw!=="__API_BASE__"?raw.split(","):[location.origin],result=[];
 for(const value of values){let base;try{base=new URL(value.trim(),location.href).origin;}catch{throw new Error("apiBase 配置无效："+value);}if(!result.includes(base))result.push(base);}
 return result.length?result:[location.origin];
}
function createSite(base){return reactive({base,config:null,configPromise:null,servers:[],serversLoaded:false,stats:null,sysConfig:{},socket:null,socketMode:null,reconnectTimer:null,timeoutTimer:null,shouldReconnect:false,socketPaused:false,reconnectAttempts:0,wsStatus:"idle"});}
function verifiedKey(site){return VERIFIED_PREFIX+site.base;}
function endpoint(site,path,method){
 const url=new URL(path,site.base);
 if(method==="GET"&&!ALLOWED_GET.includes(url.pathname))throw new Error("GET API 不在白名单："+url.pathname);
 if(method==="POST"&&!ALLOWED_POST.includes(url.pathname))throw new Error("POST API 不在白名单："+url.pathname);
 if(!["GET","POST"].includes(method))throw new Error("不允许的 API 方法："+method);
 return url;
}
function requestHeaders(site,extra={}){
 const headers=new Headers(extra),jwt=storageGet(JWT_KEY),verified=storageGet(verifiedKey(site));
 if(jwt)headers.set("Authorization","Bearer "+jwt);
 if(site.config?.turnstile_enabled===true&&verified)headers.set("X-Turnstile-Verified",verified);
 return headers;
}
function authFailure(){storageRemove(JWT_KEY);if(!location.pathname.startsWith("/admin"))location.assign("/admin#/admin");}
async function rawRequest(site,path,options={}){
 const method=String(options.method||"GET").toUpperCase(),url=endpoint(site,path,method),headers=requestHeaders(site,options.headers||{});
 if(options.turnstileToken)headers.set("X-Turnstile-Token",options.turnstileToken);
 if(options.body!==undefined)headers.set("Content-Type","application/json");
 const response=await fetch(url.toString(),{method,headers,credentials:"include",body:options.body===undefined?undefined:JSON.stringify(options.body)});
 const text=await response.text();let data=null;
 if(text){try{data=JSON.parse(text);}catch{data={message:text};}}
 if(response.status===401){authFailure();const error=new Error(data?.error||data?.message||"需要管理员登录");error.status=401;throw error;}
 if(!response.ok){const error=new Error(data?.error||data?.message||("HTTP "+response.status));error.status=response.status;error.data=data;throw error;}
 return data;
}
function loadTurnstileSdk(){
 if(window.turnstile)return Promise.resolve();
 return new Promise((resolve,reject)=>{
  let script=document.querySelector("script[data-cfsm-turnstile]");
  if(!script){script=document.createElement("script");script.src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";script.async=true;script.defer=true;script.dataset.cfsmTurnstile="1";document.head.appendChild(script);}
  const timeout=setTimeout(()=>reject(new Error("Turnstile 脚本加载超时")),15000);
  script.addEventListener("load",()=>{clearTimeout(timeout);window.turnstile?resolve():reject(new Error("Turnstile SDK 未初始化"));},{once:true});
  script.addEventListener("error",()=>{clearTimeout(timeout);reject(new Error("Turnstile 脚本加载失败，请检查网络或 CSP"));},{once:true});
 });
}
async function turnstileToken(site){
 if(!site.config?.turnstile_site_key)throw new Error("Turnstile 已启用，但未返回 turnstile_site_key");
 await loadTurnstileSdk();
 return new Promise((resolve,reject)=>{
  const host=document.createElement("div");
  Object.assign(host.style,{position:"fixed",zIndex:"99999",right:"18px",bottom:"18px",padding:"12px",border:"1px solid var(--line)",borderRadius:"12px",background:"var(--panel)",boxShadow:"0 12px 36px rgba(0,0,0,.18)"});
  host.setAttribute("role","dialog");host.setAttribute("aria-label","Cloudflare 人机验证");document.body.appendChild(host);
  let widgetId,done=false;
  const cleanup=()=>{if(done)return;done=true;try{window.turnstile.remove(widgetId);}catch{/* already removed */}host.remove();};
  try{widgetId=window.turnstile.render(host,{sitekey:site.config.turnstile_site_key,callback:(token)=>{cleanup();resolve(token);},"error-callback":()=>{cleanup();reject(new Error("Turnstile 验证失败，请重试"));},"expired-callback":()=>{cleanup();reject(new Error("Turnstile 验证已过期，请重试"));}});}
  catch(error){cleanup();reject(error);}
 });
}
async function verifyTurnstile(site){
 const token=await turnstileToken(site);
 // Turnstile first-time handshake: exchange the one-use token for CFSM's one-hour reusable credential.
 const config=await rawRequest(site,"/api/config",{turnstileToken:token});
 if(!config?.turnstile_verified)throw new Error("Turnstile 验证未返回 turnstile_verified");
 storageSet(verifiedKey(site),config.turnstile_verified);site.config={...site.config,...config};
 monitor.config=monitor.config?{...monitor.config,...config}:config;
}
async function request(site,path,options={},retried=false){
 try{return await rawRequest(site,path,options);}
 catch(error){if(error.status===403&&!retried&&site.config?.turnstile_enabled===true){storageRemove(verifiedKey(site));await verifyTurnstile(site);return request(site,path,options,true);}throw error;}
}
async function loadConfig(site){
 if(site.configPromise)return site.configPromise;
 site.configPromise=(async()=>{
  const config=await rawRequest(site,"/api/config");
  site.config={...config,theme_options:config?.theme_options&&typeof config.theme_options==="object"&&!Array.isArray(config.theme_options)?config.theme_options:{}};
  if(site.config.turnstile_enabled===true&&site.config.turnstile_verified)storageSet(verifiedKey(site),site.config.turnstile_verified);
  return site.config;
 })();
 return site.configPromise;
}
export async function ensureConfig(){
 if(configPromise)return configPromise;monitor.loading=true;monitor.error="";monitor.sites=apiBases().map(createSite);
 configPromise=(async()=>{
  const results=await Promise.allSettled(monitor.sites.map(loadConfig));
  if(results.every((item)=>item.status==="rejected")){monitor.error=results.map((item)=>item.reason?.message).filter(Boolean).join("；")||"无法读取站点配置";monitor.loading=false;throw new Error(monitor.error);}
  monitor.config=monitor.sites.find((site)=>site.config)?.config||{};monitor.loading=false;return monitor.sites;
 })().catch((error)=>{configPromise=null;throw error;});return configPromise;
}
function queueSamples(site,updates){
 if(!Array.isArray(updates))return;
 for(const update of updates){
  if(!update?.serverId||!Array.isArray(update.samples))continue;
  const key=site.base+"::"+update.serverId,item=pendingUpdates.get(key)||{site,id:update.serverId,patch:{},timestamp:0};
  for(const sample of update.samples){const patch=sample&&(sample.data||sample.payload||sample.metrics);if(!patch||typeof patch!=="object"||Array.isArray(patch))continue;Object.assign(item.patch,patch);item.timestamp=Math.max(item.timestamp,Number(sample.ts)||0);}
  pendingUpdates.set(key,item);
 }
 if(flushTimer===null&&pendingUpdates.size)flushTimer=setTimeout(flushUpdates,1000);
}
function flushUpdates(){
 flushTimer=null;
 for(const item of pendingUpdates.values()){
  const listed=item.site.servers.find((server)=>String(server.id)===String(item.id));
  if(listed)Object.assign(listed,mergeIncremental(listed,item.patch,item.timestamp));
  if(monitor.activeSite===item.site&&String(monitor.detail?.id)===String(item.id))Object.assign(monitor.detail,mergeIncremental(monitor.detail,item.patch,item.timestamp));
 }
 pendingUpdates.clear();
}
export async function loadDashboard(){
 await ensureConfig();
 const results=await Promise.allSettled(monitor.sites.map(async(site)=>{
  if(site.serversLoaded)return site;
  const data=await request(site,"/api/servers");
  site.servers=Array.isArray(data?.servers)?data.servers:[];
  site.stats=data?.stats||{total:0,online:0,offline:0};
  site.sysConfig=data?.sysConfig||{};site.serversLoaded=true;queueSamples(site,data?.latestReportUpdates);return site;
 }));
 if(monitor.sites.every((site)=>!site.serversLoaded))throw new Error(results.map((item)=>item.reason?.message).filter(Boolean).join("；")||"服务器列表加载失败");
 return monitor.sites;
}
export function findServer(id){for(const site of monitor.sites){const server=site.servers.find((item)=>String(item.id)===String(id));if(server)return{site,server};}return null;}
export async function loadDetail(id){
 await ensureConfig();monitor.detailLoading=true;monitor.error="";monitor.detail=null;monitor.history=[];
 const cached=findServer(id),candidates=cached?[cached.site]:monitor.sites;let found=null,lastError=null;
 for(const site of candidates){try{const server=await request(site,"/api/server?id="+encodeURIComponent(id));found={site,server};break;}catch(error){lastError=error;if(error.status!==404)break;}}
 monitor.detailLoading=false;if(!found)throw lastError||new Error("找不到这台服务器");
 monitor.activeSite=found.site;monitor.detail=found.server;
 // The detail endpoint includes a short replay buffer; merge it without another REST call.
 queueSamples(found.site,found.server.latestReportUpdates);
 try{await loadHistory("0.167");}catch(error){monitor.error=error.message||"历史数据加载失败";}
 return monitor.detail;
}
export async function refreshActiveDetail(){
 if(!monitor.activeSite||!monitor.detail)return;
 const data=await request(monitor.activeSite,"/api/server?id="+encodeURIComponent(monitor.detail.id));
 monitor.detail=data;queueSamples(monitor.activeSite,data?.latestReportUpdates);return data;
}
export async function loadHistory(hours){
 const range=String(hours);if(!HISTORY_RANGES.includes(range))throw new Error("不支持的历史时间范围");
 if(!monitor.activeSite||!monitor.detail)return[];
 monitor.historyLoading=true;
 try{const rows=await request(monitor.activeSite,"/api/history/all?id="+encodeURIComponent(monitor.detail.id)+"&hours="+encodeURIComponent(range));monitor.history=Array.isArray(rows)?rows:[];monitor.historyHours=range;return monitor.history;}
 finally{monitor.historyLoading=false;}
}
function clearSocketTimers(site){if(site.reconnectTimer)clearTimeout(site.reconnectTimer);if(site.timeoutTimer)clearTimeout(site.timeoutTimer);site.reconnectTimer=null;site.timeoutTimer=null;}
function stopSocket(site,paused=false){
 site.shouldReconnect=false;site.socketPaused=paused;clearSocketTimers(site);
 const socket=site.socket;site.socket=null;
 if(socket&&socket.readyState<WebSocket.CLOSING){try{socket.close(1000,paused?"page hidden":"navigation");}catch{/* no-op */}}
}
export function closeSockets(){for(const site of monitor.sites)stopSocket(site,document.visibilityState==="hidden");monitor.wsStatus=document.visibilityState==="hidden"?"paused":"idle";}
function wsUrl(site,scope){
 const url=new URL("/api/ws",site.base);url.protocol=url.protocol==="https:"?"wss:":"ws:";url.searchParams.set("subscribe",scope);
 if(url.host!==location.host&&site.config?.is_public!==true){const jwt=storageGet(JWT_KEY);if(jwt)url.searchParams.set("token",jwt);}
 return url.toString();
}
function scheduleReconnect(site){
 if(!site.shouldReconnect||site.reconnectTimer||document.visibilityState==="hidden")return;
 if(site.reconnectAttempts>=MAX_RECONNECTS){site.wsStatus="failed";monitor.wsStatus="failed";return;}
 const delay=Math.min(1000*2**site.reconnectAttempts,30000);site.reconnectAttempts++;site.wsStatus="reconnecting";monitor.wsStatus="reconnecting";
 site.reconnectTimer=setTimeout(()=>{site.reconnectTimer=null;openSocket(site);},delay);
}
function openSocket(site){
 if(!site.shouldReconnect||document.visibilityState==="hidden"||!site.socketMode)return;
 const mode=site.socketMode;let socket;
 try{socket=new WebSocket(wsUrl(site,mode.scope));}catch{site.wsStatus="error";monitor.wsStatus="error";scheduleReconnect(site);return;}
 site.socket=socket;site.wsStatus="connecting";monitor.wsStatus="connecting";
 socket.onopen=()=>{
  if(site.socket!==socket)return;site.wsStatus="connected";monitor.wsStatus="connected";
  if(mode.scope==="all")socket.send(JSON.stringify({type:"subscribe",scope:"all",ids:mode.ids}));
  const minutes=Number(site.config?.frontend_ws_timeout_minutes)||0;
  if(minutes>0)site.timeoutTimer=setTimeout(()=>{
   if(site.socket!==socket)return;
   const keep=window.confirm("实时连接已运行 "+minutes+" 分钟，是否继续连接？");
   site.shouldReconnect=false;site.socketPaused=!keep;socket.close(1000,"user timeout choice");
   if(keep)setTimeout(()=>startSocket(site,mode),0);else{monitor.wsPaused=true;monitor.wsStatus="paused";}
  },minutes*60000);
 };
 socket.onmessage=(event)=>{
  try{const message=JSON.parse(event.data);if(message.type==="batchUpdate")queueSamples(site,message.updates);if(message.type==="hello"||message.type==="subscribed")site.reconnectAttempts=0;}
  catch{/* malformed frames ignored */}
 };
 socket.onerror=()=>{if(site.socket===socket){site.wsStatus="error";monitor.wsStatus="error";}};
 socket.onclose=()=>{
  if(site.socket!==socket)return;site.socket=null;clearSocketTimers(site);
  if(site.shouldReconnect&&document.visibilityState!=="hidden"&&!site.socketPaused)scheduleReconnect(site);
 };
}
function startSocket(site,mode){stopSocket(site,false);site.socketMode=mode;site.shouldReconnect=true;site.socketPaused=false;site.reconnectAttempts=0;openSocket(site);}
export function connectDashboardSockets(){
 monitor.wsPaused=false;
 for(const site of monitor.sites){if(!site.serversLoaded)continue;const ids=site.servers.map((server)=>server.id).filter(Boolean);if(ids.length)startSocket(site,{scope:"all",ids});}
}
export function connectDetailSocket(){if(!monitor.activeSite||!monitor.detail)return;closeSockets();monitor.wsPaused=false;startSocket(monitor.activeSite,{scope:String(monitor.detail.id),ids:[]});}
export async function saveThemeOptions(options){
 await ensureConfig();const site=monitor.activeSite||monitor.sites.find((item)=>item.config)||monitor.sites[0];
 if(!site)throw new Error("没有可用 API Base");if(!storageGet(JWT_KEY))throw new Error("保存主题配置需要 JWT；请先登录管理后台");
 const clean=options&&typeof options==="object"&&!Array.isArray(options)?options:{};
 const result=await request(site,"/api/theme_options",{method:"POST",body:{theme_options:clean}});
 site.config.theme_options=result?.theme_options||clean;if(monitor.config)monitor.config.theme_options=site.config.theme_options;return site.config.theme_options;
}