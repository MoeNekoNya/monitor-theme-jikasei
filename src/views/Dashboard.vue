<script setup>
import { computed, onMounted, ref } from "vue";
import { loadDashboard,monitor,connectDashboardSockets } from "../lib/api.js";
import { t } from "../lib/i18n.js";
import ServerCard from "../components/ServerCard.vue";
const search=ref(""),selectedGroup=ref("__all__"),loading=ref(false),localError=ref("");
const cardStyle=computed(()=>monitor.config?.theme_options?.cardStyle||"detailed");
const showSmallCharts=computed(()=>monitor.config?.theme_options?.showSmallCharts!==false);
const records=computed(()=>monitor.sites.flatMap((site)=>site.servers.map((server)=>({site,server}))));
const groups=computed(()=>["__all__",...new Set(records.value.map(({server})=>server.server_group).filter(Boolean))]);
const filtered=computed(()=>{
 const query=search.value.trim().toLowerCase();
 return records.value.filter(({server})=>{
  const groupOk=selectedGroup.value==="__all__"||server.server_group===selectedGroup.value;
  const text=[server.name,server.region,server.server_group,server.os,server.tags].join(" ").toLowerCase();
  return groupOk&&(!query||text.includes(query));
 }).sort((a,b)=>(Number(a.server.sort_order)||0)-(Number(b.server.sort_order)||0));
});
const totals=computed(()=>{
 const stats=monitor.sites.map((site)=>site.stats).filter(Boolean);
 return {total:stats.reduce((n,s)=>n+(Number(s.total)||0),0),online:stats.reduce((n,s)=>n+(Number(s.online)||0),0),
  offline:stats.reduce((n,s)=>n+(Number(s.offline)||0),0),inbound:stats.reduce((n,s)=>n+(Number(s.globalSpeedIn)||0),0),
  outbound:stats.reduce((n,s)=>n+(Number(s.globalSpeedOut)||0),0)};
});
onMounted(async()=>{loading.value=true;localError.value="";try{await loadDashboard();connectDashboardSockets();}catch(error){localError.value=error.message||"Failed to load servers";}finally{loading.value=false;}});
</script>
<template>
 <section class="dashboard">
  <div class="page-intro"><div><span class="eyebrow">INFRASTRUCTURE / OVERVIEW</span><h1>{{ t('dashboard') }}<span class="live-dot"></span></h1><p>{{ t('overview') }}</p></div><div class="intro-meta"><span>{{ monitor.sites.length }} API</span><span>{{ t('live') }}</span></div></div>
  <div class="summary-grid">
   <div class="summary-card"><span>{{ t('total') }}</span><strong>{{ totals.total }}</strong><small>{{ t('allNodes') }}</small><b class="summary-icon">▦</b></div>
   <div class="summary-card"><span>{{ t('online') }}</span><strong>{{ totals.online }}</strong><small>{{ t('backendStats') }}</small><b class="summary-icon green">↗</b></div>
   <div class="summary-card"><span>{{ t('offline') }}</span><strong>{{ totals.offline }}</strong><small>{{ t('backendStats') }}</small><b class="summary-icon muted">⌁</b></div>
   <div class="summary-card"><span>{{ t('networkIn') }}</span><strong class="summary-speed">{{ (totals.inbound/1024/1024).toFixed(2) }} <small>MB/s</small></strong><small>{{ t('networkOut') }} {{ (totals.outbound/1024/1024).toFixed(2) }} MB/s</small><b class="summary-icon blue">⇅</b></div>
  </div>
  <div v-if="localError" class="inline-error" role="alert">{{ localError }}</div>
  <div class="toolbar"><div class="toolbar-title"><div><h2>{{ t('nodeList') }}</h2><span>{{ filtered.length }} / {{ totals.total }}</span></div></div><label class="search-field"><span aria-hidden="true">⌕</span><input v-model="search" type="search" :placeholder="t('search')"></label></div>
  <nav v-if="groups.length>1" class="group-tabs" aria-label="Server group filter"><button v-for="group in groups" :key="group" type="button" :class="{active:selectedGroup===group}" @click="selectedGroup=group">{{ group==='__all__'?t('all'):group }}</button></nav>
  <div v-if="loading&&!records.length" class="loading-grid"><div v-for="n in 6" :key="n" class="skeleton-card"><i></i><i></i><i></i><i></i></div></div>
  <div v-else-if="!filtered.length" class="empty-state"><span class="empty-symbol">⌁</span><h3>{{ search||selectedGroup!=='__all__'?t('noMatch'):t('empty') }}</h3><p>{{ search?t('noMatchHint'):t('checkProbe') }}</p><button v-if="search||selectedGroup!=='__all__'" class="button button-quiet" type="button" @click="search='';selectedGroup='__all__'">{{ t('clear') }}</button></div>
  <div v-else class="server-grid" :class="'layout-'+cardStyle"><ServerCard v-for="record in filtered" :key="record.site.base+':'+record.server.id" :record="record" :card-style="cardStyle" :show-small-charts="showSmallCharts"/></div>
 </section>
</template>