<script setup>
import { computed } from "vue";
import { useRouter } from "vue-router";
import { formatBytes,formatRate,isOnline,sparklinePoints } from "../lib/metrics.js";
const props=defineProps({record:{type:Object,required:true},cardStyle:{type:String,default:"detailed"},showSmallCharts:{type:Boolean,default:true}});
const router=useRouter(),server=computed(()=>props.record.server),site=computed(()=>props.record.site);
const online=computed(()=>isOnline(server.value));
const threeNetEnabled=computed(()=>site.value?.sysConfig?.show_three_net_details===true);
const pingRows=computed(()=>Array.isArray(server.value.ping)?server.value.ping:[]);
const lossRows=computed(()=>Array.isArray(server.value.loss)?server.value.loss:[]);
const probes=computed(()=>[
 {key:"ct",label:site.value?.config?.custom_ct_name||"电信"},
 {key:"cu",label:site.value?.config?.custom_cu_name||"联通"},
 {key:"cm",label:site.value?.config?.custom_cm_name||"移动"},
 {key:"bd",label:site.value?.config?.custom_bd_name||"BGP"}
]);
const cpu=computed(()=>Number(server.value.cpu)||0);
const ram=computed(()=>Number(server.value.ram_total)>0?Number(server.value.ram_used)/Number(server.value.ram_total)*100:0);
const disk=computed(()=>Number(server.value.disk_total)>0?Number(server.value.disk_used)/Number(server.value.disk_total)*100:0);
const region=computed(()=>String(server.value.region||"").toUpperCase());
const priceLabel=computed(()=>{
 if(site.value?.sysConfig?.show_price!==true)return "";
 const value=String(server.value.price??"").trim();
 if(!value)return "";
 if(value==="0"||value==="-1")return "免费";
 return(server.value.currency||"")+value;
});
const expiryLabel=computed(()=>site.value?.sysConfig?.show_expire===true?String(server.value.expire_date||""):"");
function goDetail(){router.push({name:"server-detail",params:{id:server.value.id}});}
function pointValue(type,key){const value=server.value[type+"_"+key];if(value===null)return"超时";if(value===false||value===undefined)return"—";return type==="ping"?Number(value)+" ms":Number(value)+"%";}
</script>
<template>
 <article class="server-card" :class="['card-'+cardStyle,online?'server-online':'server-offline']" tabindex="0" @click="goDetail" @keydown.enter="goDetail">
  <div class="card-topline"><div class="server-location"><img v-if="region" class="flag-icon" :src="'/flags/'+region+'.svg'" :alt="region" @error="$event.target.hidden=true"><span>{{ region||"—" }}</span><span v-if="server.server_group" class="group-chip">{{ server.server_group }}</span></div><span class="status-pill"><i></i>{{ online?"在线":"离线" }}</span></div>
  <div class="server-heading"><h3>{{ server.name||"未命名服务器" }}</h3><span v-if="cardStyle==='detailed'&&priceLabel" class="price-label">{{ priceLabel }}</span></div>
  <div v-if="server.tags" class="server-tags"><span v-for="tag in String(server.tags).split(',').filter(Boolean)" :key="tag">{{ tag.trim() }}</span></div>
  <div v-if="expiryLabel" class="expiry-label">到期：{{ expiryLabel }}<template v-if="server.auto_renewal==='1'"> · 自动续费</template></div>
  <div class="card-metrics">
   <div class="metric-cell"><span>CPU</span><strong>{{ Number(server.cpu||0).toFixed(1) }}<small>%</small></strong><div class="progress-track"><i :style="{width:Math.min(100,Math.max(0,cpu))+'%'}"></i></div></div>
   <div class="metric-cell"><span>内存</span><strong>{{ ram.toFixed(0) }}<small>%</small></strong><div class="progress-track"><i :style="{width:Math.min(100,Math.max(0,ram))+'%'}"></i></div></div>
   <div class="metric-cell" v-if="cardStyle!=='compact'"><span>硬盘</span><strong>{{ disk.toFixed(0) }}<small>%</small></strong><div class="progress-track"><i :style="{width:Math.min(100,Math.max(0,disk))+'%'}"></i></div></div>
   <div class="metric-cell"><span>运行状态</span><strong class="metric-status">{{ online?"正常":"离线" }}</strong><small class="metric-sub">{{ server.os||server.arch||"等待上报" }}</small></div>
  </div>
  <div class="network-row"><div><b class="network-arrow up">↑</b><span>上传</span><strong>{{ formatRate(server.net_out_speed) }}</strong></div><div><b class="network-arrow down">↓</b><span>下载</span><strong>{{ formatRate(server.net_in_speed) }}</strong></div><div v-if="cardStyle==='detailed'||cardStyle==='wide'"><span>总流量</span><strong>{{ formatBytes(Number(server.net_rx||0)+Number(server.net_tx||0)) }}</strong></div></div>
  <div v-if="showSmallCharts&&threeNetEnabled&&['latency','detailed','wide'].includes(cardStyle)&&(pingRows.length||lossRows.length)" class="mini-network">
   <div v-for="probe in probes" :key="probe.key" class="mini-probe">
    <div class="probe-head"><span>{{ probe.label }}</span><strong>{{ pointValue('ping',probe.key) }}</strong></div>
    <svg v-if="pingRows.length" viewBox="0 0 96 22" preserveAspectRatio="none" aria-label="Latency trend"><polyline :points="sparklinePoints(pingRows,probe.key)"/></svg>
    <div class="mini-label"><span>延迟</span><strong>{{ pointValue('loss',probe.key) }}</strong></div>
    <svg v-if="lossRows.length" class="loss-chart" viewBox="0 0 96 22" preserveAspectRatio="none" aria-label="Packet loss trend"><polyline :points="sparklinePoints(lossRows,probe.key)"/></svg>
    <div class="mini-label"><span>丢包</span></div>
   </div>
  </div>
  <div class="card-footer"><span>{{ server.os||"—" }}<template v-if="server.arch"> · {{ server.arch }}</template></span><span>更新于 {{ server.last_updated?new Date(Number(server.last_updated)).toLocaleTimeString():"—" }}</span></div>
 </article>
</template>