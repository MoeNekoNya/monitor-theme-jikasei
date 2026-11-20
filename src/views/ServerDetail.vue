<script setup>
import { computed,onMounted,ref,watch } from "vue";
import { RouterLink,useRoute } from "vue-router";
import { closeSockets,connectDetailSocket,loadDetail,loadHistory,monitor } from "../lib/api.js";
import { HISTORY_RANGES,formatBytes,formatRate,formatMemoryMb,hasDiskIo,parseGpuInfo,probeValueState,isOnline } from "../lib/metrics.js";
import { t } from "../lib/i18n.js";
import MetricChart from "../components/MetricChart.vue";
const route=useRoute(),error=ref(""),hours=ref("0.167");
const ranges=[{value:"0.167",label:"10 分钟"},{value:"0.5",label:"30 分钟"},{value:"1",label:"1 小时"},{value:"6",label:"6 小时"},{value:"12",label:"12 小时"},{value:"24",label:"24 小时"},{value:"48",label:"2 天"},{value:"96",label:"4 天"},{value:"168",label:"7 天"}];
const server=computed(()=>monitor.detail||{}),history=computed(()=>monitor.history),online=computed(()=>isOnline(server.value));
const gpu=computed(()=>parseGpuInfo(server.value.gpu_info)),diskAvailable=computed(()=>hasDiskIo(server.value.disk));
const showPrice=computed(()=>monitor.activeSite?.sysConfig?.show_price===true),showExpire=computed(()=>monitor.activeSite?.sysConfig?.show_expire===true);
const memoryPercent=computed(()=>Number(server.value.ram_total)>0?Number(server.value.ram_used)/Number(server.value.ram_total)*100:0);
const swapPercent=computed(()=>Number(server.value.swap_total)>0?Number(server.value.swap_used)/Number(server.value.swap_total)*100:0);
const config=computed(()=>monitor.activeSite?.config||{});
const probeNames=computed(()=>[
 {key:"ct",name:config.value.custom_ct_name||"电信"},{key:"cu",name:config.value.custom_cu_name||"联通"},
 {key:"cm",name:config.value.custom_cm_name||"移动"},{key:"bd",name:config.value.custom_bd_name||"BGP"},
 {key:"node_1",name:config.value.node_1_name||"Node 1"},{key:"node_2",name:config.value.node_2_name||"Node 2"},
 {key:"node_3",name:config.value.node_3_name||"Node 3"},{key:"node_4",name:config.value.node_4_name||"Node 4"},
]);
const probeRows=computed(()=>probeNames.value.map((probe)=>({...probe,ping:server.value["ping_"+probe.key],loss:server.value["loss_"+probe.key],pingState:probeValueState(server.value["ping_"+probe.key]),lossState:probeValueState(server.value["loss_"+probe.key])})).filter((probe)=>probe.pingState!=="hidden"||probe.lossState!=="hidden"));
const pingCharts=computed(()=>probeNames.value.filter((probe)=>probeValueState(server.value["ping_"+probe.key])!=="hidden"));
const lossCharts=computed(()=>probeNames.value.filter((probe)=>probeValueState(server.value["loss_"+probe.key])!=="hidden"));
const trafficTotal=computed(()=>Number(server.value.net_rx||0)+Number(server.value.net_tx||0));
const bootLabel=computed(()=>{const stamp=Number(server.value.boot_time);if(!Number.isFinite(stamp)||stamp<=0)return"—";const elapsed=Date.now()-stamp;if(elapsed<0)return"—";return Math.floor(elapsed/86400000)+" 天 "+Math.floor(elapsed/3600000)%24+" 小时";});
const priceLabel=computed(()=>{const price=String(server.value.price??"").trim();if(!price)return"";if(price==="0"||price==="-1")return t("free");return(server.value.currency||"")+price;});
async function changeRange(){if(!HISTORY_RANGES.includes(hours.value))return;error.value="";try{await loadHistory(hours.value);}catch(err){error.value=err.message||"History request failed";}}
async function openServer(id){error.value="";closeSockets();try{await loadDetail(id);connectDetailSocket();}catch(err){error.value=err.message||"Failed to load server detail";}}
watch(()=>route.params.id,(id)=>{if(id){hours.value="0.167";openServer(String(id));}});
onMounted(()=>openServer(String(route.params.id)));
</script>
<template>
 <section class="detail-page">
  <RouterLink class="back-link" to="/"><span>←</span> {{ t('back') }}</RouterLink>
  <div v-if="monitor.detailLoading&&!monitor.detail" class="detail-loading"><div class="skeleton-card"><i></i><i></i><i></i></div></div>
  <div v-else-if="error&&!monitor.detail" class="empty-state detail-error"><span class="empty-symbol">!</span><h3>{{ t('connectionError') }}</h3><p>{{ error }}</p><button class="button button-primary" type="button" @click="openServer(String(route.params.id))">{{ t('clear') }}</button></div>
  <template v-else-if="monitor.detail">
   <div class="detail-heading">
    <div class="detail-title-wrap"><div class="server-location"><img v-if="server.region" class="flag-icon" :src="'/flags/'+String(server.region).toUpperCase()+'.svg'" :alt="server.region" @error="$event.target.hidden=true"><span>{{ server.region||t('unknownRegion') }}</span><span v-if="server.server_group" class="group-chip">{{ server.server_group }}</span></div><h1>{{ server.name||t('unnamed') }}</h1><p>{{ server.os||t('noData') }}<template v-if="server.arch"> · {{ server.arch }}</template><template v-if="server.kernel_version"> · Kernel {{ server.kernel_version }}</template></p></div>
    <span class="status-pill large" :class="online?'is-online':'is-offline'"><i></i>{{ online?t('onlineState'):t('offlineState') }}</span>
   </div>
   <div v-if="error" class="inline-error" role="alert">{{ error }}</div>
   <div class="detail-overview">
    <div class="overview-stat"><span>{{ t('cpu') }}</span><strong>{{ Number(server.cpu||0).toFixed(1) }}<small>%</small></strong><div class="progress-track"><i :style="{width:Math.min(100,Number(server.cpu)||0)+'%'}"></i></div></div>
    <div class="overview-stat"><span>{{ t('memory') }}</span><strong>{{ formatMemoryMb(server.ram_used) }}<small> / {{ formatMemoryMb(server.ram_total) }}</small></strong><div class="progress-track"><i :style="{width:Math.min(100,memoryPercent)+'%'}"></i></div></div>
    <div class="overview-stat"><span>{{ t('networkIn') }}</span><strong>{{ formatRate(server.net_in_speed) }}</strong><small>{{ t('totalTraffic') }} {{ formatBytes(server.net_rx) }}</small></div>
    <div class="overview-stat"><span>{{ t('networkOut') }}</span><strong>{{ formatRate(server.net_out_speed) }}</strong><small>{{ t('totalTraffic') }} {{ formatBytes(server.net_tx) }}</small></div>
   </div>
   <div v-if="showPrice||showExpire" class="info-grid contract-grid">
    <div v-if="showPrice" class="info-item"><span>价格</span><strong>{{ priceLabel||"—" }}</strong></div>
    <div v-if="showPrice" class="info-item"><span>计费周期</span><strong>{{ server.billing_cycle||"—" }}</strong></div>
    <div v-if="showPrice" class="info-item"><span>自动续费</span><strong>{{ server.auto_renewal==="1"?"已开启":server.auto_renewal==="0"?"未开启":"—" }}</strong></div>
    <div v-if="showExpire" class="info-item"><span>到期时间</span><strong>{{ server.expire_date||"—" }}</strong></div>
    <div v-if="showExpire" class="info-item"><span>流量限额</span><strong>{{ server.traffic_limit||"—" }}</strong></div>
    <div v-if="showExpire" class="info-item"><span>流量统计方式</span><strong>{{ server.traffic_calc_type||"—" }}</strong></div>
    <div v-if="showExpire" class="info-item"><span>重置日期</span><strong>{{ server.reset_day||"—" }}</strong></div>
   </div>
   <div class="section-heading"><div><span class="eyebrow">SYSTEM INFORMATION</span><h2>{{ t('systemInfo') }}</h2></div><span class="updated-time">{{ t('updated') }} {{ server.last_updated?new Date(Number(server.last_updated)).toLocaleString():"—" }}</span></div>
   <div class="info-grid">
    <div class="info-item"><span>{{ t('cpuModel') }}</span><strong>{{ server.cpu_info||"—" }}</strong></div><div class="info-item"><span>{{ t('cores') }}</span><strong>{{ server.cpu_cores||"—" }}</strong></div>
    <div class="info-item"><span>{{ t('architecture') }}</span><strong>{{ server.arch||"—" }}</strong></div><div class="info-item"><span>{{ t('osVersion') }}</span><strong>{{ server.os||"—" }}</strong></div>
    <div class="info-item"><span>{{ t('memory') }}</span><strong>{{ formatMemoryMb(server.ram_used) }} / {{ formatMemoryMb(server.ram_total) }} · {{ memoryPercent.toFixed(1) }}%</strong></div>
    <div class="info-item"><span>{{ t('swap') }}</span><strong>{{ formatMemoryMb(server.swap_used) }} / {{ formatMemoryMb(server.swap_total) }} · {{ swapPercent.toFixed(1) }}%</strong></div>
    <div class="info-item"><span>{{ t('disk') }}</span><strong>{{ formatBytes(Number(server.disk_used||0)*1024*1024) }} / {{ formatBytes(Number(server.disk_total||0)*1024*1024) }}</strong></div><div class="info-item"><span>{{ t('uptime') }}</span><strong>{{ bootLabel }}</strong></div>
    <div class="info-item"><span>{{ t('connections') }}</span><strong>{{ server.tcp_conn??"—" }} / {{ server.udp_conn??"—" }}</strong></div><div class="info-item"><span>{{ t('processes') }}</span><strong>{{ server.processes??"—" }}</strong></div>
    <div class="info-item"><span>{{ t('ip') }}</span><strong>{{ server.ip_v4==="1"?"可用":"不可用" }} / {{ server.ip_v6==="1"?"可用":"不可用" }}</strong></div><div class="info-item"><span>{{ t('agentVersion') }}</span><strong>{{ server.agent_version||"—" }}</strong></div>
    <div class="info-item"><span>Load Average</span><strong>{{ server.load_avg||"—" }}</strong></div>
    <div class="info-item"><span>月入站流量</span><strong>{{ formatBytes(server.net_rx_monthly) }}</strong></div>
    <div class="info-item"><span>月出站流量</span><strong>{{ formatBytes(server.net_tx_monthly) }}</strong></div>
   </div>
   <template v-if="diskAvailable"><div class="section-heading"><div><span class="eyebrow">DISK I/O</span><h2>{{ t('diskIO') }}</h2></div></div><div class="info-grid">
    <div class="info-item"><span>{{ t('readSpeed') }}</span><strong>{{ formatRate(server.disk.read_bps) }}</strong></div><div class="info-item"><span>{{ t('writeSpeed') }}</span><strong>{{ formatRate(server.disk.write_bps) }}</strong></div>
    <div class="info-item"><span>{{ t('readIops') }}</span><strong>{{ server.disk.read_iops??"—" }}</strong></div><div class="info-item"><span>{{ t('writeIops') }}</span><strong>{{ server.disk.write_iops??"—" }}</strong></div>
    <div class="info-item"><span>{{ t('diskLatency') }}</span><strong>{{ server.disk.await_ms??"—" }} ms</strong></div><div class="info-item"><span>{{ t('usage') }}</span><strong>{{ server.disk.util??"—" }}%</strong></div>
   </div></template>
   <div v-if="gpu.length" class="section-heading"><div><span class="eyebrow">GPU</span><h2>{{ t('gpu') }}</h2></div></div>
   <div v-if="gpu.length" class="gpu-grid"><div v-for="item in gpu" :key="item.id" class="gpu-card"><strong>{{ item.name||('GPU '+item.id) }}</strong><span>{{ item.info==null?'—':item.info+'%' }}</span></div></div>
   <div v-if="probeRows.length" class="section-heading"><div><span class="eyebrow">NETWORK PROBES</span><h2>{{ t('networkProbe') }}</h2></div></div>
   <div v-if="probeRows.length" class="probe-grid"><div v-for="probe in probeRows" :key="probe.key" class="probe-card">
    <span>{{ probe.name }}</span><strong v-if="probe.pingState==='value'">{{ probe.ping }}<small> ms</small></strong><strong v-else-if="probe.pingState==='timeout'" class="timeout-value">{{ t('timeout') }}</strong><strong v-else>—</strong>
    <small>{{ t('loss') }}：<template v-if="probe.lossState==='value'">{{ probe.loss }}%</template><template v-else-if="probe.lossState==='timeout'">{{ t('timeout') }}</template><template v-else>—</template></small>
   </div></div>
   <div class="section-heading history-heading"><div><span class="eyebrow">METRIC HISTORY</span><h2>{{ t('history') }}</h2></div><label class="range-select"><span>{{ t('range') }}</span><select v-model="hours" :disabled="monitor.historyLoading" @change="changeRange"><option v-for="range in ranges" :key="range.value" :value="range.value">{{ range.label }}</option></select></label></div>
   <div v-if="monitor.historyLoading" class="history-loading">{{ t('loading') }}</div>
   <div v-else class="charts-grid">
    <MetricChart title="CPU" :rows="history" metric="cpu" suffix="%"/><MetricChart :title="t('memory')" :rows="history" metric="ram_used" suffix=" MB"/>
    <MetricChart :title="t('networkIn')" :rows="history" metric="net_in_speed" suffix=" B/s"/><MetricChart :title="t('networkOut')" :rows="history" metric="net_out_speed" suffix=" B/s"/>
    <MetricChart v-for="probe in pingCharts" :key="'ping-'+probe.key" :title="probe.name+' '+t('latency')" :rows="history" :metric="'ping_'+probe.key" suffix=" ms"/>
    <MetricChart v-for="probe in lossCharts" :key="'loss-'+probe.key" :title="probe.name+' '+t('loss')" :rows="history" :metric="'loss_'+probe.key" suffix="%"/>
   </div>
   <div class="traffic-footer"><span>{{ t('totalTraffic') }}</span><strong>{{ formatBytes(trafficTotal) }}</strong></div>
  </template>
 </section>
</template>